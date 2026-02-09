package handlers

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"time"
	"voip-backend/asterisk"
	"voip-backend/config"
	"voip-backend/database"
	"voip-backend/middleware"
	"voip-backend/models"
	"voip-backend/websocket"

	"github.com/gin-gonic/gin"
	gorillaws "github.com/gorilla/websocket"
	"gorm.io/gorm"
)

// InitiateCall handles call initiation
func InitiateCall(c *gin.Context) {
	userID, username, extension, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var req models.CallRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format: " + err.Error(),
		})
		return
	}

	// Check if we should use WebRTC direct calling instead of AMI
	useWebRTC := c.Query("method") == "webrtc" || c.GetHeader("X-Call-Method") == "webrtc"

	if useWebRTC {
		initiateWebRTCCall(c, userID, username, extension, req)
		return
	}

	// Log the call initiation request
	log.Printf("[CALL] User %s (ext: %s) initiating call to %s", username, extension, req.TargetExtension)

	// Validate target extension exists
	var targetUser models.User
	if err := database.GetDB().Where("extension = ?", req.TargetExtension).First(&targetUser).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("[CALL] ERROR: Target extension %s not found", req.TargetExtension)
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Target extension not found",
			})
			return
		}
		log.Printf("[CALL] ERROR: Database error looking up extension %s: %v", req.TargetExtension, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Database error",
		})
		return
	}

	log.Printf("[CALL] Target user found: %s (ext: %s, status: %s)", targetUser.Username, targetUser.Extension, targetUser.Status)

	// Check if target user is online
	if targetUser.Status != "online" {
		log.Printf("[CALL] ERROR: Target user %s is not online (status: %s)", targetUser.Username, targetUser.Status)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Target extension is not online",
		})
		return
	}

	// Check if caller is trying to call themselves
	if extension == req.TargetExtension {
		log.Printf("[CALL] ERROR: User %s trying to call themselves", username)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Cannot call yourself",
		})
		return
	}

	log.Printf("[CALL] Initiating Asterisk call from %s to %s", extension, req.TargetExtension)

	// Initiate call through Asterisk
	channel, err := asterisk.InitiateCall(extension, req.TargetExtension)
	if err != nil {
		log.Printf("[CALL] ERROR: Asterisk call initiation failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to initiate call: " + err.Error(),
		})
		return
	}

	log.Printf("[CALL] Asterisk call initiated successfully, channel: %s", channel)

	// Create call log entry
	callLog := models.CallLog{
		CallerID:  userID,
		CalleeID:  targetUser.ID,
		StartTime: time.Now(),
		Status:    "initiated",
		Channel:   channel,
		Direction: "outbound",
	}

	if err := database.GetDB().Create(&callLog).Error; err != nil {
		// Log error but don't fail the call
		c.Header("X-Warning", "Failed to create call log")
	}

	// Create active call entry
	activeCall := models.ActiveCall{
		CallerID:  userID,
		CalleeID:  targetUser.ID,
		Channel:   channel,
		Status:    "ringing",
		StartTime: time.Now(),
	}

	if err := database.GetDB().Create(&activeCall).Error; err != nil {
		// Log error but don't fail the call
		c.Header("X-Warning", "Failed to create active call record")
	}

	// Notify target user via WebSocket
	hub := websocket.GetHub()
	if hub != nil {
		hub.NotifyIncomingCall(extension, req.TargetExtension, channel)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Call initiated successfully",
		"channel": channel,
		"caller":  username,
		"callee":  targetUser.Username,
	})
}

// AnswerCall handles call answering
func AnswerCall(c *gin.Context) {
	userID, _, extension, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var req models.CallAnswerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
		})
		return
	}

	// Find the active call
	var activeCall models.ActiveCall
	if err := database.GetDB().Where("channel = ? AND callee_id = ?", req.Channel, userID).First(&activeCall).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Active call not found",
		})
		return
	}

	// Answer the call through Asterisk
	if err := asterisk.AnswerCall(req.Channel); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to answer call: " + err.Error(),
		})
		return
	}

	// Update active call status
	database.GetDB().Model(&activeCall).Update("status", "connected")

	// Update call log
	database.GetDB().Model(&models.CallLog{}).Where("channel = ?", req.Channel).Updates(map[string]interface{}{
		"status": "answered",
	})

	// Notify via WebSocket
	hub := websocket.GetHub()
	if hub != nil {
		// Get caller info
		var caller models.User
		if err := database.GetDB().First(&caller, activeCall.CallerID).Error; err == nil {
			hub.NotifyCallStatus(caller.Extension, extension, "connected", req.Channel)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Call answered successfully",
		"channel": req.Channel,
	})
}

// HangupCall handles call termination
func HangupCall(c *gin.Context) {
	userID, _, extension, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var req models.CallHangupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("[HANGUP] Invalid request format from user %s: %v", extension, err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format: " + err.Error(),
		})
		return
	}

	if req.Channel == "" {
		log.Printf("[HANGUP] Empty channel provided by user %s", extension)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Channel is required",
		})
		return
	}

	log.Printf("[HANGUP] User %s attempting to hangup channel: %s", extension, req.Channel)

	// Check if this is a WebRTC call
	isWebRTCCall := strings.HasPrefix(req.Channel, "webrtc-call-")

	// Find the active call
	var activeCall models.ActiveCall
	if err := database.GetDB().Where("channel = ? AND (caller_id = ? OR callee_id = ?)", req.Channel, userID, userID).First(&activeCall).Error; err != nil {
		if isWebRTCCall {
			// For WebRTC calls, if no active call record found, still proceed with WebSocket notification
			log.Printf("[HANGUP] WebRTC call record not found, proceeding with WebSocket notification")
		} else {
			log.Printf("[HANGUP] Active call not found for channel: %s, user: %s", req.Channel, extension)
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Active call not found",
			})
			return
		}
	}

	// Hangup the call through appropriate method
	if isWebRTCCall {
		log.Printf("[HANGUP] Handling WebRTC call hangup for channel: %s", req.Channel)
		// For WebRTC calls, we don't need to call Asterisk
	} else {
		// Hangup traditional calls through Asterisk
		if err := asterisk.HangupCall(req.Channel); err != nil {
			log.Printf("[HANGUP] Asterisk hangup failed for channel %s: %v", req.Channel, err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to hangup call: " + err.Error(),
			})
			return
		}
	}

	var duration int

	// Calculate call duration and handle database operations only if activeCall exists
	if activeCall.ID != 0 {
		duration = int(time.Since(activeCall.StartTime).Seconds())

		// Update call log
		endTime := time.Now()
		database.GetDB().Model(&models.CallLog{}).Where("channel = ?", req.Channel).Updates(map[string]interface{}{
			"status":   "ended",
			"end_time": &endTime,
			"duration": duration,
		})

		// Remove active call
		database.GetDB().Delete(&activeCall)

		// Notify via WebSocket
		hub := websocket.GetHub()
		if hub != nil {
			// Get other party info
			var otherUser models.User
			if activeCall.CallerID == userID {
				database.GetDB().First(&otherUser, activeCall.CalleeID)
			} else {
				database.GetDB().First(&otherUser, activeCall.CallerID)
			}

			if otherUser.ID != 0 {
				hub.NotifyCallStatus(extension, otherUser.Extension, "ended", req.Channel)
			}
		}
	} else {
		// For WebRTC calls without active call record, still send WebSocket notification
		log.Printf("[HANGUP] Sending WebSocket hangup notification for WebRTC call: %s", req.Channel)
		hub := websocket.GetHub()
		if hub != nil {
			// Send a general hangup message
			hangupMsg := websocket.Message{
				Type:    "call_ended",
				From:    extension,
				Channel: req.Channel,
				Status:  "ended",
			}
			hub.BroadcastMessage(hangupMsg)
		}
		duration = 0
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"message":  "Call ended successfully",
		"channel":  req.Channel,
		"duration": duration,
	})
}

// GetActiveCalls returns all active calls for the user
func GetActiveCalls(c *gin.Context) {
	userID, _, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var activeCalls []models.ActiveCall
	if err := database.GetDB().Preload("Caller").Preload("Callee").Where("caller_id = ? OR callee_id = ?", userID, userID).Find(&activeCalls).Error; err != nil {
		log.Printf("[ACTIVE_CALLS] ERROR: Failed to fetch active calls for user %d: %v", userID, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch active calls",
		})
		return
	}

	log.Printf("[ACTIVE_CALLS] Found %d active calls for user %d", len(activeCalls), userID)
	for i, call := range activeCalls {
		log.Printf("[ACTIVE_CALLS] Call %d: ID=%d, Caller=%s (ext: %s), Callee=%s (ext: %s), Status=%s, Channel=%s, StartTime=%s",
			i+1, call.ID, call.Caller.Username, call.Caller.Extension,
			call.Callee.Username, call.Callee.Extension, call.Status, call.Channel, call.StartTime.Format("15:04:05"))
	}

	// Clean up stale calls (older than 5 minutes with no activity)
	staleTime := time.Now().Add(-5 * time.Minute)
	var staleCalls []models.ActiveCall
	database.GetDB().Where("start_time < ? AND status IN ('ringing', 'initiated')", staleTime).Find(&staleCalls)

	if len(staleCalls) > 0 {
		log.Printf("[ACTIVE_CALLS] Found %d stale calls, cleaning up...", len(staleCalls))
		for _, staleCall := range staleCalls {
			log.Printf("[ACTIVE_CALLS] Cleaning up stale call: ID=%d, Channel=%s, Age=%v",
				staleCall.ID, staleCall.Channel, time.Since(staleCall.StartTime))
			database.GetDB().Delete(&staleCall)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"active_calls": activeCalls,
		"count":        len(activeCalls),
		"cleanup_info": fmt.Sprintf("Cleaned up %d stale calls", len(staleCalls)),
	})
}

// GetCallLogs returns call history for the user
func GetCallLogs(c *gin.Context) {
	userID, _, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var callLogs []models.CallLog
	if err := database.GetDB().Preload("Caller").Preload("Callee").Where("caller_id = ? OR callee_id = ?", userID, userID).Order("created_at DESC").Limit(50).Find(&callLogs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch call logs",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"call_logs": callLogs,
	})
}

// GetSystemDiagnostics provides diagnostic information about the VoIP system
func GetSystemDiagnostics(c *gin.Context) {
	diagnostics := map[string]interface{}{
		"timestamp":  time.Now().Format(time.RFC3339),
		"ami_status": "unknown",
		"endpoints":  []map[string]interface{}{},
		"errors":     []string{},
	}

	// Check AMI connection
	client := asterisk.GetAMIClient()
	if client == nil {
		diagnostics["ami_status"] = "disconnected"
		diagnostics["errors"] = append(diagnostics["errors"].([]string), "AMI client not available")
	} else {
		diagnostics["ami_status"] = "connected"

		// Check specific endpoints that are failing
		problematicExtensions := []string{"1001", "1004", "1000"}
		for _, ext := range problematicExtensions {
			// Get detailed endpoint status
			endpointDetails, err := asterisk.GetDetailedEndpointStatus(ext)
			if err != nil {
				endpointInfo := map[string]interface{}{
					"extension": ext,
					"status":    "error",
					"error":     err.Error(),
				}
				diagnostics["endpoints"] = append(diagnostics["endpoints"].([]map[string]interface{}), endpointInfo)
				diagnostics["errors"] = append(diagnostics["errors"].([]string),
					fmt.Sprintf("Extension %s error: %v", ext, err))
			} else {
				diagnostics["endpoints"] = append(diagnostics["endpoints"].([]map[string]interface{}), endpointDetails)

				// Add any endpoint-specific errors to the main errors list
				if endpointErrors, ok := endpointDetails["errors"].([]string); ok {
					for _, endpointError := range endpointErrors {
						diagnostics["errors"] = append(diagnostics["errors"].([]string),
							fmt.Sprintf("Extension %s: %s", ext, endpointError))
					}
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"diagnostics": diagnostics,
	})
}

// TestAsteriskConnections tests all Asterisk service connections (protected endpoint)
func TestAsteriskConnections(c *gin.Context) {
	results := map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"tests": map[string]interface{}{
			"ami":       testAMIConnection(),
			"http":      testHTTPConnection(),
			"websocket": testWebSocketConnection(),
		},
	}

	// Determine overall success
	amiSuccess := results["tests"].(map[string]interface{})["ami"].(map[string]interface{})["success"].(bool)
	httpSuccess := results["tests"].(map[string]interface{})["http"].(map[string]interface{})["success"].(bool)
	wsSuccess := results["tests"].(map[string]interface{})["websocket"].(map[string]interface{})["success"].(bool)

	results["overall_success"] = amiSuccess && httpSuccess && wsSuccess
	results["summary"] = fmt.Sprintf("AMI: %v, HTTP: %v, WebSocket: %v", amiSuccess, httpSuccess, wsSuccess)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"results": results,
	})
}

// TestAsteriskConnectionsPublic tests Asterisk connections with custom config (public endpoint for initial setup)
func TestAsteriskConnectionsPublic(c *gin.Context) {
	// Parse request body for custom Asterisk configuration
	var req struct {
		AsteriskHost    string `json:"asteriskHost"`
		AsteriskPort    string `json:"asteriskPort"`
		AsteriskAMIPort string `json:"asteriskAMIPort"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Validate required fields
	if req.AsteriskHost == "" || req.AsteriskPort == "" || req.AsteriskAMIPort == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Missing required fields: asteriskHost, asteriskPort, asteriskAMIPort",
		})
		return
	}

	// Test connections with provided configuration
	results := map[string]interface{}{
		"timestamp": time.Now().Format(time.RFC3339),
		"tests": map[string]interface{}{
			"ami":       testAMIConnectionWithConfig(req.AsteriskHost, req.AsteriskAMIPort),
			"http":      testHTTPConnectionWithConfig(req.AsteriskHost, req.AsteriskPort),
			"websocket": testWebSocketConnectionWithConfig(req.AsteriskHost, req.AsteriskPort),
		},
	}

	// Determine overall success
	amiSuccess := results["tests"].(map[string]interface{})["ami"].(map[string]interface{})["success"].(bool)
	httpSuccess := results["tests"].(map[string]interface{})["http"].(map[string]interface{})["success"].(bool)
	wsSuccess := results["tests"].(map[string]interface{})["websocket"].(map[string]interface{})["success"].(bool)

	results["overall_success"] = amiSuccess && httpSuccess && wsSuccess
	results["summary"] = fmt.Sprintf("AMI: %v, HTTP: %v, WebSocket: %v", amiSuccess, httpSuccess, wsSuccess)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"results": results,
	})
}

func testAMIConnection() map[string]interface{} {
	client := asterisk.GetAMIClient()
	if client == nil {
		return map[string]interface{}{
			"success": false,
			"error":   "AMI client not available",
			"details": "Backend could not establish AMI connection to Asterisk",
		}
	}

	return map[string]interface{}{
		"success": true,
		"message": "AMI connection established",
		"details": "Backend successfully connected to Asterisk AMI",
	}
}

func testHTTPConnection() map[string]interface{} {
	// Test Asterisk HTTP interface
	asteriskHost := config.AppConfig.AsteriskHost
	return testHTTPConnectionWithConfig(asteriskHost, "8088")
}

func testWebSocketConnection() map[string]interface{} {
	// Test WebSocket endpoint availability by attempting a proper WebSocket connection
	asteriskHost := config.AppConfig.AsteriskHost

	// Different Asterisk setups may use /ws (no prefix) or /asterisk/ws (with prefix).
	candidates := []string{
		fmt.Sprintf("ws://%s:8088/ws", asteriskHost),
		fmt.Sprintf("ws://%s:8088/asterisk/ws", asteriskHost),
	}

	// Test WebSocket connection with proper headers
	dialer := gorillaws.Dialer{
		HandshakeTimeout: 5 * time.Second,
	}

	// Attempt WebSocket connection (try multiple candidates)
	var conn *gorillaws.Conn
	var resp *http.Response
	var err error
	var tried []string
	for _, wsURL := range candidates {
		tried = append(tried, wsURL)
		conn, resp, err = dialer.Dial(wsURL, nil)
		if err == nil {
			break
		}
		// If we got a meaningful HTTP response, treat it as “endpoint exists”.
		if resp != nil && (resp.StatusCode == 400 || resp.StatusCode == 426) {
			return map[string]interface{}{
				"success": true,
				"message": "WebSocket endpoint is available",
				"details": fmt.Sprintf("WebSocket endpoint at %s is responding (status: %d)", wsURL, resp.StatusCode),
			}
		}
	}
	if err != nil {
		// Try fallback HTTP tests to see if the endpoint exists
		httpCandidates := []string{
			fmt.Sprintf("http://%s:8088/ws", asteriskHost),
			fmt.Sprintf("http://%s:8088/asterisk/ws", asteriskHost),
		}
		client := &http.Client{Timeout: 3 * time.Second}

		for _, httpURL := range httpCandidates {
			httpResp, httpErr := client.Get(httpURL)
			if httpErr != nil {
				continue
			}
			_ = httpResp.Body.Close()
			if httpResp.StatusCode == 400 || httpResp.StatusCode == 426 {
				return map[string]interface{}{
					"success": true,
					"message": "WebSocket endpoint is available",
					"details": fmt.Sprintf("HTTP test confirms WebSocket endpoint at %s is available (status: %d)", httpURL, httpResp.StatusCode),
				}
			}
		}

		return map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"details": fmt.Sprintf("Failed to connect to WebSocket. Tried: %v", tried),
		}
	}

	// Successfully connected
	defer conn.Close()
	return map[string]interface{}{
		"success": true,
		"message": "WebSocket connection successful",
		"details": fmt.Sprintf("Successfully connected (tried: %v)", tried),
	}
}

// Helper functions for testing with custom configuration

func testAMIConnectionWithConfig(asteriskHost, amiPort string) map[string]interface{} {
	// For public endpoint, we can't test actual AMI connection without credentials
	// Instead, test if the AMI port is reachable
	address := fmt.Sprintf("%s:%s", asteriskHost, amiPort)

	conn, err := net.DialTimeout("tcp", address, 5*time.Second)
	if err != nil {
		return map[string]interface{}{
			"success": false,
			"error":   err.Error(),
			"details": fmt.Sprintf("Failed to connect to AMI port %s", address),
		}
	}
	defer conn.Close()

	return map[string]interface{}{
		"success": true,
		"message": "AMI port reachable",
		"details": fmt.Sprintf("Successfully connected to AMI port %s", address),
	}
}

func testHTTPConnectionWithConfig(asteriskHost, httpPort string) map[string]interface{} {
	// Test Asterisk HTTP interface with custom config.
	// Different Asterisk setups may expose different paths depending on `prefix`.
	paths := []string{
		"/asterisk/httpstatus",
		"/httpstatus",
		"/", // If HTTP server is up but httpstatus isn't enabled
	}

	client := &http.Client{Timeout: 5 * time.Second}

	var lastErr error
	var lastStatus int
	var lastURL string
	for _, p := range paths {
		httpURL := fmt.Sprintf("http://%s:%s%s", asteriskHost, httpPort, p)
		resp, err := client.Get(httpURL)
		if err != nil {
			lastErr = err
			continue
		}
		_ = resp.Body.Close()

		// Prefer a clean 200 from an explicit status endpoint.
		if resp.StatusCode == 200 {
			return map[string]interface{}{
				"success": true,
				"message": "HTTP interface accessible",
				"details": fmt.Sprintf("Asterisk HTTP responding on %s", httpURL),
			}
		}

		// If this path isn't correct (e.g. /asterisk/httpstatus returns 404 when prefix is empty),
		// continue trying other candidates.
		lastStatus = resp.StatusCode
		lastURL = httpURL
	}

	// If we reached here, either nothing was reachable, or all candidates returned non-200.
	if lastURL != "" {
		return map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("HTTP %d", lastStatus),
			"details": fmt.Sprintf("Asterisk HTTP reachable on %s (status %d)", lastURL, lastStatus),
		}
	}

	details := fmt.Sprintf("Failed to connect to Asterisk HTTP on %s:%s", asteriskHost, httpPort)
	if lastErr != nil {
		details = fmt.Sprintf("%s (%v)", details, lastErr)
	}

	return map[string]interface{}{
		"success": false,
		"error":   "connection_failed",
		"details": details,
	}
}

func testWebSocketConnectionWithConfig(asteriskHost, httpPort string) map[string]interface{} {
	// Test WebSocket endpoint availability with custom config
	// Try multiple possible WebSocket endpoints
	endpoints := []string{
		fmt.Sprintf("http://%s:%s/ws", asteriskHost, httpPort),
		fmt.Sprintf("http://%s:%s/asterisk/ws", asteriskHost, httpPort),
		fmt.Sprintf("http://%s:%s/rawman", asteriskHost, httpPort),
	}

	client := &http.Client{Timeout: 5 * time.Second}

	for _, httpURL := range endpoints {
		resp, err := client.Get(httpURL)
		if err != nil {
			continue // Try next endpoint
		}
		defer resp.Body.Close()

		// WebSocket endpoint should return 426 Upgrade Required for HTTP requests
		// or 400 Bad Request (some Asterisk versions)
		if resp.StatusCode == 426 || resp.StatusCode == 400 {
			return map[string]interface{}{
				"success": true,
				"message": "WebSocket endpoint available",
				"details": fmt.Sprintf("Asterisk WebSocket endpoint responding on %s", httpURL),
			}
		}
	}

	return map[string]interface{}{
		"success": false,
		"error":   "No WebSocket endpoint found",
		"details": fmt.Sprintf("Tested endpoints: %v", endpoints),
	}
}

// initiateWebRTCCall handles WebRTC-based call initiation
func initiateWebRTCCall(c *gin.Context, userID uint, username, extension string, req models.CallRequest) {
	log.Printf("[WEBRTC] User %s (ext: %s) initiating WebRTC call to %s", username, extension, req.TargetExtension)

	// Find target user
	var targetUser models.User
	if err := database.GetDB().Where("extension = ?", req.TargetExtension).First(&targetUser).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("[WEBRTC] ERROR: Target extension %s not found in database", req.TargetExtension)
			c.JSON(http.StatusNotFound, gin.H{
				"error": "Target extension not found",
			})
			return
		}
		log.Printf("[WEBRTC] ERROR: Database error when looking up extension %s: %v", req.TargetExtension, err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Database error",
		})
		return
	}

	log.Printf("[WEBRTC] Target user found: %s (ext: %s, status: %s, online: %t)",
		targetUser.Username, targetUser.Extension, targetUser.Status, targetUser.IsOnline)

	// Check if target user is online (be more lenient for testing)
	if targetUser.Status != "online" && !targetUser.IsOnline {
		log.Printf("[WEBRTC] WARNING: Target user %s is not online (status: %s, is_online: %t)",
			targetUser.Username, targetUser.Status, targetUser.IsOnline)
		// For testing, allow calls to offline users but warn
		log.Printf("[WEBRTC] Proceeding with call despite user being offline (for testing)")
	}

	// Check if target user has active WebSocket connection
	hub := websocket.GetHub()
	if hub == nil {
		log.Printf("[WEBRTC] ERROR: WebSocket hub not available")
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "WebSocket hub not available",
		})
		return
	}

	clientCount := hub.GetExtensionClientCount(req.TargetExtension)
	isConnected := hub.IsExtensionConnected(req.TargetExtension)
	log.Printf("[WEBRTC] Extension %s WebSocket status: connected=%t, clients=%d",
		req.TargetExtension, isConnected, clientCount)

	if !isConnected {
		log.Printf("[WEBRTC] WARNING: Extension %s is not connected via WebSocket (user status: %s, ws clients: %d)",
			req.TargetExtension, targetUser.Status, clientCount)
		// For testing, proceed anyway but log the issue
		log.Printf("[WEBRTC] Proceeding with call despite no WebSocket connection (for testing)")
	}

	// Generate call ID
	callID := fmt.Sprintf("webrtc-call-%d", time.Now().Unix())

	// Create call log entry
	callLog := models.CallLog{
		CallerID:  userID,
		CalleeID:  targetUser.ID,
		StartTime: time.Now(),
		Status:    "initiated",
		Channel:   callID,
		Direction: "outbound",
	}

	if err := database.GetDB().Create(&callLog).Error; err != nil {
		log.Printf("[WEBRTC] ERROR: Failed to create call log: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create call log",
		})
		return
	}

	// Send WebRTC call invitation via WebSocket
	if hub != nil {
		callInvitation := map[string]interface{}{
			"type":             "webrtc_call_invitation",
			"call_id":          callID,
			"caller_id":        userID,
			"caller_username":  username,
			"caller_extension": extension,
			"target_extension": req.TargetExtension,
			"timestamp":        time.Now().Format(time.RFC3339),
		}

		// Send to target user
		if err := hub.SendToExtension(req.TargetExtension, callInvitation); err != nil {
			log.Printf("[WEBRTC] ERROR: Failed to send call invitation to %s: %v", req.TargetExtension, err)
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to notify target user",
			})
			return
		}

		// Send confirmation to caller
		callerConfirmation := map[string]interface{}{
			"type":    "webrtc_call_initiated",
			"call_id": callID,
			"status":  "calling",
			"target":  req.TargetExtension,
		}

		if err := hub.SendToExtension(extension, callerConfirmation); err != nil {
			log.Printf("[WEBRTC] WARNING: Failed to send confirmation to caller %s: %v", extension, err)
		}
	}

	log.Printf("[WEBRTC] WebRTC call invitation sent successfully, call ID: %s", callID)

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"message":  "WebRTC call initiated successfully",
		"call_id":  callID,
		"method":   "webrtc",
		"target":   req.TargetExtension,
		"channel":  callID,
		"priority": "1",
	})
}

// DeleteCallLog deletes a specific call log (admin only)
func DeleteCallLog(c *gin.Context) {
	logID := c.Param("id")
	if logID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Call log ID parameter required",
		})
		return
	}

	// Check if call log exists
	var callLog models.CallLog
	if err := database.GetDB().First(&callLog, logID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Call log not found",
		})
		return
	}

	// Delete call log
	if err := database.GetDB().Delete(&callLog).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete call log",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Call log deleted successfully",
	})
}

// BulkDeleteCallLogs deletes multiple call logs (admin only)
func BulkDeleteCallLogs(c *gin.Context) {
	var req struct {
		LogIDs []uint `json:"log_ids" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format: " + err.Error(),
		})
		return
	}

	if len(req.LogIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "No log IDs provided",
		})
		return
	}

	// Delete call logs
	result := database.GetDB().Where("id IN ?", req.LogIDs).Delete(&models.CallLog{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete call logs",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"message":       fmt.Sprintf("Successfully deleted %d call logs", result.RowsAffected),
		"deleted_count": result.RowsAffected,
	})
}

// ClearAllCallLogs deletes all call logs (admin only)
func ClearAllCallLogs(c *gin.Context) {
	// Optional: Add confirmation parameter
	confirm := c.Query("confirm")
	if confirm != "true" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "This action requires confirmation. Add ?confirm=true to proceed.",
		})
		return
	}

	// Count logs before deletion for reporting
	var totalCount int64
	if err := database.GetDB().Model(&models.CallLog{}).Count(&totalCount).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count call logs",
		})
		return
	}

	// Delete all call logs
	result := database.GetDB().Where("1 = 1").Delete(&models.CallLog{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to clear all call logs",
		})
		return
	}

	log.Printf("Admin cleared all call logs: %d logs deleted", totalCount)

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"message":       fmt.Sprintf("Successfully cleared all call logs (%d logs deleted)", totalCount),
		"deleted_count": totalCount,
	})
}

// BulkDeleteCallLogsByFilter deletes call logs based on filters (admin only)
func BulkDeleteCallLogsByFilter(c *gin.Context) {
	var req struct {
		Status    string `json:"status"`     // Filter by status
		Direction string `json:"direction"`  // Filter by direction (incoming/outgoing)
		DateFrom  string `json:"date_from"`  // Filter from date (YYYY-MM-DD)
		DateTo    string `json:"date_to"`    // Filter to date (YYYY-MM-DD)
		CallerID  uint   `json:"caller_id"`  // Filter by caller ID
		CalleeID  uint   `json:"callee_id"`  // Filter by callee ID
		OlderThan int    `json:"older_than"` // Delete logs older than X days
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format: " + err.Error(),
		})
		return
	}

	// Build query based on filters
	query := database.GetDB().Model(&models.CallLog{})

	if req.Status != "" {
		query = query.Where("status = ?", req.Status)
	}

	if req.Direction != "" {
		query = query.Where("direction = ?", req.Direction)
	}

	if req.DateFrom != "" {
		if dateFrom, err := time.Parse("2006-01-02", req.DateFrom); err == nil {
			query = query.Where("DATE(created_at) >= ?", dateFrom)
		}
	}

	if req.DateTo != "" {
		if dateTo, err := time.Parse("2006-01-02", req.DateTo); err == nil {
			query = query.Where("DATE(created_at) <= ?", dateTo)
		}
	}

	if req.CallerID > 0 {
		query = query.Where("caller_id = ?", req.CallerID)
	}

	if req.CalleeID > 0 {
		query = query.Where("callee_id = ?", req.CalleeID)
	}

	if req.OlderThan > 0 {
		cutoffDate := time.Now().AddDate(0, 0, -req.OlderThan)
		query = query.Where("created_at < ?", cutoffDate)
	}

	// Count logs that will be deleted
	var count int64
	if err := query.Count(&count).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count matching call logs",
		})
		return
	}

	if count == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success":       true,
			"message":       "No call logs match the specified filters",
			"deleted_count": 0,
		})
		return
	}

	// Delete matching logs
	result := query.Delete(&models.CallLog{})
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete call logs",
		})
		return
	}

	log.Printf("Admin deleted %d call logs using filters: %+v", result.RowsAffected, req)

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"message":       fmt.Sprintf("Successfully deleted %d call logs", result.RowsAffected),
		"deleted_count": result.RowsAffected,
	})
}

// ExportCallLogs exports call logs in various formats (admin only)
func ExportCallLogs(c *gin.Context) {
	format := c.DefaultQuery("format", "csv")

	// Get all call logs with user information
	var callLogs []models.CallLog
	if err := database.GetDB().Preload("Caller").Preload("Callee").Order("created_at DESC").Find(&callLogs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch call logs",
		})
		return
	}

	switch format {
	case "csv":
		exportCallLogsCSV(c, callLogs)
	case "json":
		exportCallLogsJSON(c, callLogs)
	default:
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Unsupported format. Use 'csv' or 'json'",
		})
	}
}

// exportCallLogsCSV exports call logs as CSV
func exportCallLogsCSV(c *gin.Context, callLogs []models.CallLog) {
	c.Header("Content-Type", "text/csv")
	c.Header("Content-Disposition", "attachment; filename=call-logs.csv")

	// Write CSV header
	csvData := "ID,Caller,Caller Extension,Callee,Callee Extension,Start Time,End Time,Duration,Status,Direction,Channel\n"

	// Write data rows
	for _, log := range callLogs {
		endTime := ""
		if log.EndTime != nil {
			endTime = log.EndTime.Format("2006-01-02 15:04:05")
		}

		csvData += fmt.Sprintf("%d,%s,%s,%s,%s,%s,%s,%d,%s,%s,%s\n",
			log.ID,
			log.Caller.Username,
			log.Caller.Extension,
			log.Callee.Username,
			log.Callee.Extension,
			log.StartTime.Format("2006-01-02 15:04:05"),
			endTime,
			log.Duration,
			log.Status,
			log.Direction,
			log.Channel,
		)
	}

	c.String(http.StatusOK, csvData)
}

// exportCallLogsJSON exports call logs as JSON
func exportCallLogsJSON(c *gin.Context, callLogs []models.CallLog) {
	c.Header("Content-Type", "application/json")
	c.Header("Content-Disposition", "attachment; filename=call-logs.json")

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"call_logs":   callLogs,
		"exported_at": time.Now().Format(time.RFC3339),
	})
}

// CallStatistics represents call performance statistics
type CallStatistics struct {
	TotalCalls      int64   `json:"total_calls"`
	SuccessfulCalls int64   `json:"successful_calls"`
	SuccessRate     float64 `json:"success_rate"`
	AvgDuration     int     `json:"avg_duration_seconds"`
	AvgDurationStr  string  `json:"avg_duration_formatted"`
	TotalDuration   int64   `json:"total_duration_seconds"`
}

// calculateCallStatistics calculates call performance metrics
func calculateCallStatistics() CallStatistics {
	var stats CallStatistics

	// Get total call count
	database.GetDB().Model(&models.CallLog{}).Count(&stats.TotalCalls)

	// Get successful calls (answered and ended calls)
	database.GetDB().Model(&models.CallLog{}).Where("status IN (?)", []string{"answered", "ended"}).Count(&stats.SuccessfulCalls)

	// Calculate success rate
	if stats.TotalCalls > 0 {
		stats.SuccessRate = float64(stats.SuccessfulCalls) / float64(stats.TotalCalls) * 100
	}

	// Calculate average duration for completed calls
	type DurationResult struct {
		TotalDuration int64
		CallCount     int64
	}

	var result DurationResult
	database.GetDB().Model(&models.CallLog{}).
		Select("COALESCE(SUM(duration), 0) as total_duration, COUNT(*) as call_count").
		Where("status = ? AND duration > 0", "ended").
		Scan(&result)

	if result.CallCount > 0 {
		stats.AvgDuration = int(result.TotalDuration / result.CallCount)
		stats.TotalDuration = result.TotalDuration

		// Format duration as MM:SS
		minutes := stats.AvgDuration / 60
		seconds := stats.AvgDuration % 60
		stats.AvgDurationStr = fmt.Sprintf("%d:%02d", minutes, seconds)
	} else {
		stats.AvgDurationStr = "0:00"
	}

	return stats
}

// GetRealTimeMetrics returns real-time system metrics (admin only)
func GetRealTimeMetrics(c *gin.Context) {
	// Get current statistics
	var totalUsers, onlineUsers, activeCalls, callsToday int64

	database.GetDB().Model(&models.User{}).Count(&totalUsers)
	// Count online users (users who are marked as online AND have recent activity)
	fiveMinutesAgo := time.Now().Add(-5 * time.Minute)
	database.GetDB().Model(&models.User{}).Where("status = ? AND is_online = ? AND last_seen > ?", "online", true, fiveMinutesAgo).Count(&onlineUsers)
	database.GetDB().Model(&models.ActiveCall{}).Count(&activeCalls)
	database.GetDB().Model(&models.CallLog{}).Where("DATE(created_at) = DATE(NOW())").Count(&callsToday)

	// Calculate call statistics
	callStats := calculateCallStatistics()

	// Get WebSocket connections
	hub := websocket.GetHub()
	wsConnections := 0
	connectedExtensions := []string{}
	if hub != nil {
		wsConnections = hub.GetClientCount()
		connectedExtensions = hub.GetConnectedExtensions()
	}

	// Get recent call activity (last 10 calls)
	var recentCalls []models.CallLog
	database.GetDB().Preload("Caller").Preload("Callee").Order("created_at DESC").Limit(10).Find(&recentCalls)

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"timestamp": time.Now().Format(time.RFC3339),
		"metrics": gin.H{
			"total_users":          totalUsers,
			"online_users":         onlineUsers,
			"active_calls":         activeCalls,
			"calls_today":          callsToday,
			"ws_connections":       wsConnections,
			"connected_extensions": connectedExtensions,
			"call_success_rate":    callStats.SuccessRate,
			"avg_call_duration":    callStats.AvgDurationStr,
			"total_call_logs":      callStats.TotalCalls,
			"successful_calls":     callStats.SuccessfulCalls,
		},
		"recent_calls": recentCalls,
		"call_stats":   callStats,
	})
}
