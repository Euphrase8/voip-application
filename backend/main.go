package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"voip-backend/asterisk"
	"voip-backend/config"
	"voip-backend/database"
	"voip-backend/handlers"
	"voip-backend/middleware"
	"voip-backend/services"
	"voip-backend/websocket"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

const lockFileName = "voip-backend.lock"

func writeLockFile() error {
	lockPath := filepath.Join(os.TempDir(), lockFileName)
	return os.WriteFile(lockPath, []byte(fmt.Sprintf("%d\n", os.Getpid())), 0644)
}

func removeLockFile() {
	os.Remove(filepath.Join(os.TempDir(), lockFileName))
}

func findProcessOnPort(port string) (pid int, processName string, err error) {
	ln, listenErr := net.Listen("tcp", "127.0.0.1:"+port)
	if listenErr == nil {
		ln.Close()
		return 0, "", nil
	}

	// Try netstat -ano on Windows
	cmd := exec.Command("netstat", "-ano")
	out, runErr := cmd.Output()
	if runErr != nil {
		return 0, "", fmt.Errorf("port %s is in use by another process", port)
	}

	re := regexp.MustCompile(fmt.Sprintf(`127\.0\.0\.1:%s\s+.*?\s+(\d+)\s*$`, port))
	for _, line := range strings.Split(string(out), "\n") {
		matches := re.FindStringSubmatch(line)
		if len(matches) > 1 {
			p, _ := strconv.Atoi(strings.TrimSpace(matches[1]))
			if p > 0 {
				procName := "unknown"
				if nameOut, nameErr := exec.Command("tasklist", "/FI", fmt.Sprintf("PID eq %d", p), "/NH").Output(); nameErr == nil {
					parts := strings.Fields(string(nameOut))
					if len(parts) > 0 {
						procName = parts[0]
					}
				}
				return p, procName, nil
			}
		}
	}

	reAny := regexp.MustCompile(`:(\d+)\s+.*?\s+(\d+)\s*$`)
	for _, line := range strings.Split(string(out), "\n") {
		if strings.Contains(line, "LISTENING") {
			matches := reAny.FindStringSubmatch(line)
			if len(matches) > 2 && matches[1] == port {
				p, _ := strconv.Atoi(strings.TrimSpace(matches[2]))
				if p > 0 {
					return p, "unknown", nil
				}
			}
		}
	}

	return 0, "", fmt.Errorf("port %s is in use by another process", port)
}

func tryListen(host, port string) (net.Listener, error) {
	addr := host + ":" + port
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		pid, name, findErr := findProcessOnPort(port)
		if findErr != nil {
			return nil, fmt.Errorf("failed to listen on %s: %v", addr, err)
		}
		return nil, fmt.Errorf("port %s is already in use by PID %d (%s). Use a different port or terminate that process", port, pid, name)
	}
	return ln, nil
}

func main() {
	// Load configuration
	config.LoadConfig()

	// Initialize database
	database.InitDatabase()

	// Initialize WebSocket hub
	websocket.InitHub()

	// Set up the user disconnect callback
	hub := websocket.GetHub()
	if hub != nil {
		hub.OnUserDisconnect = handlers.SetUserOfflineByExtension
	}

	// Start background status cleanup service
	services.InitStatusCleanup()

	// Initialize Asterisk AMI connection asynchronously with timeout
	go func() {
		// Wait a bit for the server to start first
		time.Sleep(2 * time.Second)

		log.Println("Starting AMI connection initialization...")

		// Create a channel to receive the result
		done := make(chan error, 1)

		// Run AMI initialization in a separate goroutine
		go func() {
			done <- asterisk.InitAMI()
		}()

		// Wait for initialization or timeout
		select {
		case err := <-done:
			if err != nil {
				log.Printf("Warning: Failed to initialize AMI connection: %v", err)
				log.Println("Call functionality may be limited. Will retry in background.")
			} else {
				log.Println("AMI connection initialized successfully")
			}
		case <-time.After(8 * time.Second):
			log.Println("Warning: AMI initialization timed out after 8 seconds")
			log.Println("Call functionality may be limited. Will retry in background.")
		}
	}()

	// Set Gin mode
	if !config.AppConfig.Debug {
		gin.SetMode(gin.ReleaseMode)
	}

	// Create Gin router
	r := gin.Default()

	// Configure trusted proxies for security
	// Only trust specific proxy IPs in production
	trustedProxies := []string{
		"127.0.0.1",      // localhost
		"172.20.10.0/24", // local network range
	}
	if err := r.SetTrustedProxies(trustedProxies); err != nil {
		log.Printf("Warning: Failed to set trusted proxies: %v", err)
	}

	// Configure CORS
	corsConfig := cors.DefaultConfig()
	corsConfig.AllowOrigins = config.AppConfig.CORSOrigins
	corsConfig.AllowHeaders = []string{"Origin", "Content-Length", "Content-Type", "Authorization"}
	corsConfig.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	corsConfig.AllowCredentials = true
	r.Use(cors.New(corsConfig))

	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":    "ok",
			"service":   "voip-backend",
			"timestamp": time.Now().Unix(),
		})
	})

	// Configuration endpoint for frontend
	r.GET("/config", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"success": true,
			"config":  config.AppConfig.GetFrontendConfig(),
		})
	})

	// Configuration update endpoint (for IP configuration)
	r.POST("/config/update", func(c *gin.Context) {
		var updateRequest struct {
			AsteriskHost    string `json:"asterisk_host"`
			AsteriskAMIPort string `json:"asterisk_ami_port"`
			SIPPort         string `json:"sip_port"`
		}

		if err := c.ShouldBindJSON(&updateRequest); err != nil {
			c.JSON(400, gin.H{
				"success": false,
				"error":   "Invalid request format",
			})
			return
		}

		config.ConfigMu.Lock()
		if updateRequest.AsteriskHost != "" {
			config.AppConfig.AsteriskHost = updateRequest.AsteriskHost
			config.AppConfig.SIPDomain = updateRequest.AsteriskHost
		}
		if updateRequest.AsteriskAMIPort != "" {
			config.AppConfig.AsteriskAMIPort = updateRequest.AsteriskAMIPort
		}
		if updateRequest.SIPPort != "" {
			config.AppConfig.SIPPort = updateRequest.SIPPort
		}
		config.ConfigMu.Unlock()

		c.JSON(200, gin.H{
			"success": true,
			"message": "Configuration updated successfully",
			"config":  config.AppConfig.GetFrontendConfig(),
		})
	})

	// WebSocket endpoint
	r.GET("/ws", websocket.HandleWebSocket)

	// Public routes (no authentication required)
	public := r.Group("/api")
	public.Use(middleware.AuthRateLimitMiddleware())
	{
		public.POST("/login", handlers.Login)
		public.POST("/register", handlers.Register)
		public.POST("/refresh", handlers.RefreshToken)
		public.POST("/test-asterisk", handlers.TestAsteriskConnectionsPublic)
	}

	// Protected routes (authentication required)
	protected := r.Group("/protected")
	protected.Use(middleware.RateLimitMiddleware())
	protected.Use(middleware.AuthMiddleware())
	{
		// User routes
		protected.GET("/profile", handlers.GetProfile)
		protected.POST("/logout", handlers.Logout)
		protected.PUT("/status", handlers.UpdateUserStatus)
		protected.POST("/heartbeat", handlers.HeartbeatUser)
		protected.GET("/users", handlers.GetAllUsers)
		protected.GET("/users/online", handlers.GetOnlineUsers)
		protected.GET("/users/:extension", handlers.GetUserByExtension)
		protected.GET("/extensions/connected", handlers.GetConnectedExtensions)
		protected.GET("/extensions/status", handlers.GetConnectionStatus)

		// Call routes
		callRoutes := protected.Group("/call")
		{
			callRoutes.POST("/initiate", handlers.InitiateCall)
			callRoutes.POST("/answer", handlers.AnswerCall)
			callRoutes.POST("/hangup", handlers.HangupCall)
			callRoutes.GET("/active", handlers.GetActiveCalls)
			callRoutes.GET("/logs", handlers.GetCallLogs)
			callRoutes.POST("/transfer", handlers.TransferCall)
			callRoutes.POST("/hold", handlers.HoldCall)
			callRoutes.POST("/unhold", handlers.UnholdCall)
			callRoutes.POST("/record/start", handlers.StartCallRecording)
			callRoutes.POST("/record/stop", handlers.StopCallRecording)
		}

		// Chat Message routes
		chatRoutes := protected.Group("/messages")
		{
			chatRoutes.POST("/send", handlers.SendMessage)
			chatRoutes.POST("/send-voice", handlers.SendVoiceMessage)
			chatRoutes.GET("/conversations", handlers.GetConversations)
			chatRoutes.GET("/unread-count", handlers.GetUnreadCount)
			chatRoutes.GET("/:userId", handlers.GetMessages)
			chatRoutes.PUT("/read/:senderId", handlers.MarkAsRead)
			chatRoutes.GET("/voice/:id/audio", handlers.GetVoiceMessageAudio)

			// Group chat
			chatRoutes.POST("/group/create", handlers.CreateGroup)
			chatRoutes.POST("/group/send", handlers.SendGroupMessage)
			chatRoutes.GET("/group/:groupId/messages", handlers.GetGroupMessages)
			chatRoutes.GET("/groups", handlers.GetUserGroups)
		}

		// Voicemail routes
		voicemailRoutes := protected.Group("/voicemail")
		{
			voicemailRoutes.POST("/create", handlers.CreateVoicemail)
			voicemailRoutes.GET("/list", handlers.GetVoicemails)
			voicemailRoutes.GET("/sent", handlers.GetSentVoicemails)
			voicemailRoutes.GET("/search", handlers.SearchVoicemails)
			voicemailRoutes.GET("/unread-count", handlers.GetVoicemailUnreadCount)
			voicemailRoutes.GET("/:id", handlers.GetVoicemail)
			voicemailRoutes.PUT("/:id/read", handlers.MarkVoicemailRead)
			voicemailRoutes.PUT("/:id/unread", handlers.MarkVoicemailUnread)
			voicemailRoutes.DELETE("/:id", handlers.DeleteVoicemail)
			voicemailRoutes.GET("/:id/audio", handlers.GetVoicemailAudio)
			voicemailRoutes.GET("/:id/download", handlers.DownloadVoicemail)
			voicemailRoutes.POST("/:id/playback", handlers.IncrementPlaybackCount)
		}

		// Missed calls
		protected.POST("/missed-calls/record", handlers.RecordMissedCall)
		protected.GET("/missed-calls", handlers.GetMissedCalls)

		// Voicemail greeting
		protected.POST("/voicemail-greeting", handlers.UploadVoicemailGreeting)
		protected.GET("/voicemail-greeting/play", handlers.GetVoicemailGreeting)

		// Voicemail greetings and settings
		protected.POST("/voicemail/settings", handlers.UpdateVoicemailSettings)
		protected.GET("/voicemail/settings", handlers.GetVoicemailSettings)
		protected.DELETE("/voicemail/greeting", handlers.DeleteVoicemailGreeting)

		// Diagnostic routes
		protected.GET("/diagnostics", handlers.GetSystemDiagnostics)
		protected.GET("/test-asterisk", handlers.TestAsteriskConnections)

		// System Health endpoints (accessible to all authenticated users)
		protected.GET("/health", handlers.GetFastSystemHealth)
		protected.GET("/health/detailed", handlers.GetSystemHealth)

		// Debug endpoint to check user authentication and role
		protected.GET("/debug/auth", func(c *gin.Context) {
			userID, exists1 := c.Get("user_id")
			username, exists2 := c.Get("username")
			extension, exists3 := c.Get("extension")
			role, exists4 := c.Get("role")

			c.JSON(200, gin.H{
				"success": true,
				"auth_info": gin.H{
					"user_id_exists":   exists1,
					"username_exists":  exists2,
					"extension_exists": exists3,
					"role_exists":      exists4,
					"user_id":          userID,
					"username":         username,
					"extension":        extension,
					"role":             role,
					"is_admin":         role == "admin",
				},
			})
		})

		// Admin routes
		admin := protected.Group("/admin")
		admin.Use(middleware.AdminMiddleware())
		{
			admin.GET("/users", handlers.GetUsers)
			admin.POST("/users", handlers.CreateUser)
			admin.PUT("/users/:id", handlers.UpdateUser)
			admin.DELETE("/users/:id", handlers.DeleteUser)
			admin.GET("/stats", handlers.GetSystemStats)
			admin.DELETE("/call-logs/:id", handlers.DeleteCallLog)
			admin.DELETE("/call-logs/bulk-delete", handlers.BulkDeleteCallLogs)
			admin.DELETE("/call-logs/clear-all", handlers.ClearAllCallLogs)
			admin.DELETE("/call-logs/bulk-delete-filter", handlers.BulkDeleteCallLogsByFilter)
			admin.GET("/export/call-logs", handlers.ExportCallLogs)
			admin.GET("/metrics/realtime", handlers.GetRealTimeMetrics)

			// System Health endpoints
			admin.GET("/health", handlers.GetSystemHealth)
			admin.GET("/health/fast", handlers.GetFastSystemHealth)

			// Admin call management (frontend adminService.js integration)
			admin.POST("/call", handlers.AdminInitiateCall)
			admin.GET("/active-calls", handlers.AdminGetActiveCalls)
			admin.POST("/terminate-call", handlers.AdminTerminateCall)

			// Backup endpoints
			admin.POST("/backup", handlers.CreateBackup)
			admin.GET("/backup/status/:id", handlers.GetBackupStatus)
			admin.GET("/backups", handlers.ListBackups)
			admin.GET("/backup/download/:id", handlers.DownloadBackup)
			admin.DELETE("/backup/:id", handlers.DeleteBackup)
			admin.POST("/backup/restore/:id", handlers.RestoreBackup)
		}
	}

	// Write lock file to prevent duplicate instances
	if err := writeLockFile(); err != nil {
		log.Printf("Warning: Could not write lock file: %v", err)
	}

	// Check port availability and start server
	host := config.AppConfig.Host
	port := config.AppConfig.Port

	// Check if PORT environment variable overrides config
	if envPort := os.Getenv("PORT"); envPort != "" {
		port = envPort
	}
	// Check if an alternative port was provided via command line
	altPort := os.Getenv("ALT_PORT")
	if altPort != "" {
		port = altPort
	}

	ln, err := tryListen(host, port)
	if err != nil {
		log.Fatalf("Server startup failed: %v", err)
	}
	log.Printf("Port %s is available", port)

	// Also allow auto-selecting next port via environment
	autoPort := os.Getenv("AUTO_PORT")
	if autoPort == "true" {
		// Try next port if configured port is taken (tryListen already handles this)
	}

	address := ln.Addr().String()
	log.Printf("Starting VoIP backend server on %s", address)
	log.Printf("Debug mode: %v", config.AppConfig.Debug)
	log.Printf("CORS origins: %v", config.AppConfig.CORSOrigins)

	srv := &http.Server{
		Handler: r,
	}

	// Start server using the pre-acquired listener
	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal for graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	removeLockFile()
	database.CloseDB()
	log.Println("Server exited")
}
