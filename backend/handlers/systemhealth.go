package handlers

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"runtime"
	"time"
	"voip-backend/asterisk"
	"voip-backend/config"
	"voip-backend/database"
	"voip-backend/models"
	"voip-backend/websocket"

	"github.com/gin-gonic/gin"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/process"
)

type SystemHealthResponse struct {
	Timestamp      string                 `json:"timestamp"`
	Status         string                 `json:"status"`
	Services       map[string]ServiceInfo `json:"services"`
	SystemMetrics  SystemMetrics          `json:"system_metrics"`
	DatabaseHealth DatabaseHealth         `json:"database_health"`
	Uptime         string                 `json:"uptime"`
	Version        string                 `json:"version"`
	Environment    string                 `json:"environment"`
}

type ServiceInfo struct {
	Status       string                 `json:"status"`
	LastCheck    time.Time              `json:"last_check"`
	ResponseTime int64                  `json:"response_time_ms"`
	Error        string                 `json:"error,omitempty"`
	Details      map[string]interface{} `json:"details,omitempty"`
}

type SystemMetrics struct {
	CPU     CPUMetrics     `json:"cpu"`
	Memory  MemoryMetrics  `json:"memory"`
	Disk    DiskMetrics    `json:"disk"`
	Network NetworkMetrics `json:"network"`
}

type CPUMetrics struct {
	Usage   float64   `json:"usage_percent"`
	Cores   int       `json:"cores"`
	LoadAvg []float64 `json:"load_avg"`
}

type MemoryMetrics struct {
	Total        uint64  `json:"total_bytes"`
	Used         uint64  `json:"used_bytes"`
	Available    uint64  `json:"available_bytes"`
	UsagePercent float64 `json:"usage_percent"`
}

type DiskMetrics struct {
	Total        uint64  `json:"total_bytes"`
	Used         uint64  `json:"used_bytes"`
	Free         uint64  `json:"free_bytes"`
	UsagePercent float64 `json:"usage_percent"`
}

type NetworkMetrics struct {
	ActiveConnections int `json:"active_connections"`
	WebSocketClients  int `json:"websocket_clients"`
}

type DatabaseHealth struct {
	Status        string `json:"status"`
	TotalUsers    int64  `json:"total_users"`
	ActiveCalls   int64  `json:"active_calls"`
	CallLogsCount int64  `json:"call_logs_count"`
	DatabaseSize  string `json:"database_size"`
}

// GetFastSystemHealth returns basic system health information quickly
func GetFastSystemHealth(c *gin.Context) {
	startTime := time.Now()

	health := SystemHealthResponse{
		Timestamp:   time.Now().Format(time.RFC3339),
		Status:      "healthy",
		Services:    make(map[string]ServiceInfo),
		Environment: config.AppConfig.Environment,
		Version:     "1.0.0",
	}

	// Check system uptime (same as full health check)
	if hostInfo, err := host.Info(); err == nil {
		uptime := time.Duration(hostInfo.Uptime) * time.Second
		health.Uptime = formatUptime(uptime)
	} else {
		health.Uptime = "Unavailable"
	}

	// Quick backend check
	health.Services["backend"] = ServiceInfo{
		Status:       "healthy",
		LastCheck:    time.Now(),
		ResponseTime: time.Since(startTime).Milliseconds(),
	}

	// Quick database check
	db := database.GetDB()
	if db != nil {
		health.Services["database"] = ServiceInfo{
			Status:       "healthy",
			LastCheck:    time.Now(),
			ResponseTime: 0,
		}
	} else {
		health.Services["database"] = ServiceInfo{
			Status:       "unhealthy",
			Error:        "Database not available",
			LastCheck:    time.Now(),
			ResponseTime: 0,
		}
	}

	// Quick WebSocket check
	hub := websocket.GetHub()
	if hub != nil {
		health.Services["websocket"] = ServiceInfo{
			Status:       "healthy",
			LastCheck:    time.Now(),
			ResponseTime: 0,
			Details: map[string]interface{}{
				"active_clients":       hub.GetClientCount(),
				"connected_extensions": len(hub.GetConnectedExtensions()),
			},
		}
	} else {
		health.Services["websocket"] = ServiceInfo{
			Status:    "unhealthy",
			Error:     "WebSocket hub not available",
			LastCheck: time.Now(),
		}
	}

	// Real-time Asterisk check with AMI command
	health.Services["asterisk"] = checkAsteriskHealthRealTime()

	// Get real system metrics (lightweight version)
	health.SystemMetrics = getSystemMetrics()

	// Get real database health
	health.DatabaseHealth = getDatabaseHealth()

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"health":           health,
		"response_time_ms": time.Since(startTime).Milliseconds(),
	})
}

// GetSystemHealth returns comprehensive system health information
func GetSystemHealth(c *gin.Context) {
	startTime := time.Now()

	health := SystemHealthResponse{
		Timestamp:   time.Now().Format(time.RFC3339),
		Status:      "healthy",
		Services:    make(map[string]ServiceInfo),
		Environment: config.AppConfig.Environment,
		Version:     "1.0.0",
	}

	// Check system uptime
	if hostInfo, err := host.Info(); err == nil {
		uptime := time.Duration(hostInfo.Uptime) * time.Second
		health.Uptime = formatUptime(uptime)
	}

	// Check all services in parallel for faster response
	type serviceResult struct {
		name string
		info ServiceInfo
	}

	serviceChan := make(chan serviceResult, 4)

	// Start all service checks concurrently
	go func() {
		serviceChan <- serviceResult{"asterisk", checkAsteriskHealth()}
	}()
	go func() {
		serviceChan <- serviceResult{"database", checkDatabaseHealth()}
	}()
	go func() {
		serviceChan <- serviceResult{"websocket", checkWebSocketHealth()}
	}()
	go func() {
		serviceChan <- serviceResult{"backend", checkBackendHealth()}
	}()

	// Collect results with timeout
	timeout := time.After(1 * time.Second) // 1 second timeout for all checks
	servicesChecked := 0

	for servicesChecked < 4 {
		select {
		case result := <-serviceChan:
			health.Services[result.name] = result.info
			servicesChecked++
		case <-timeout:
			// Add timeout status for remaining services
			for _, serviceName := range []string{"asterisk", "database", "websocket", "backend"} {
				if _, exists := health.Services[serviceName]; !exists {
					health.Services[serviceName] = ServiceInfo{
						Status:       "timeout",
						Error:        "Health check timed out",
						LastCheck:    time.Now(),
						ResponseTime: 1000,
					}
				}
			}
			servicesChecked = 4 // Exit loop
		}
	}

	// Get system metrics and database health in parallel
	var systemMetrics SystemMetrics
	var dbHealth DatabaseHealth

	metricsChan := make(chan bool, 2)
	go func() {
		systemMetrics = getSystemMetrics()
		metricsChan <- true
	}()
	go func() {
		dbHealth = getDatabaseHealth()
		metricsChan <- true
	}()

	// Wait for both with timeout
	metricsTimeout := time.After(500 * time.Millisecond) // 500ms timeout
	metricsReceived := 0

	for metricsReceived < 2 {
		select {
		case <-metricsChan:
			metricsReceived++
		case <-metricsTimeout:
			metricsReceived = 2 // Exit loop
		}
	}

	health.SystemMetrics = systemMetrics
	health.DatabaseHealth = dbHealth

	// Determine overall status
	overallStatus := "healthy"
	for _, service := range health.Services {
		if service.Status == "unhealthy" || service.Status == "critical" {
			overallStatus = "unhealthy"
			break
		} else if service.Status == "warning" && overallStatus == "healthy" {
			overallStatus = "warning"
		}
	}

	// Check for critical thresholds
	if health.SystemMetrics.CPU.Usage > 90 {
		overallStatus = "critical"
	}
	if health.SystemMetrics.Memory.UsagePercent > 95 {
		overallStatus = "critical"
	}
	if health.SystemMetrics.Disk.UsagePercent > 95 {
		overallStatus = "critical"
	}

	health.Status = overallStatus

	c.JSON(http.StatusOK, gin.H{
		"success":          true,
		"health":           health,
		"response_time_ms": time.Since(startTime).Milliseconds(),
	})
}

// Check Asterisk service health with real-time AMI test (fast version)
func checkAsteriskHealthRealTime() ServiceInfo {
	startTime := time.Now()
	service := ServiceInfo{
		LastCheck: startTime,
		Details:   make(map[string]interface{}),
	}

	// Check AMI connection
	client := asterisk.GetAMIClient()
	asteriskAddr := fmt.Sprintf("%s:%s", config.AppConfig.AsteriskHost, config.AppConfig.AsteriskAMIPort)
	service.Details["asterisk_host"] = asteriskAddr

	// If AMI client isn't ready, fall back to lightweight port checks.
	if client == nil || !client.IsConnected() {
		amiReachable := false
		if conn, err := net.DialTimeout("tcp", asteriskAddr, 700*time.Millisecond); err == nil {
			amiReachable = true
			_ = conn.Close()
		}

		httpReachable := false
		httpURL := fmt.Sprintf("http://%s:%s/httpstatus", config.AppConfig.AsteriskHost, config.AppConfig.SIPPort)
		httpClient := &http.Client{Timeout: 800 * time.Millisecond}
		if resp, err := httpClient.Get(httpURL); err == nil {
			httpReachable = true
			_ = resp.Body.Close()
		}

		service.Details["ami_reachable"] = amiReachable
		service.Details["http_reachable"] = httpReachable
		service.Details["ami_connected"] = false

		if amiReachable && httpReachable {
			service.Status = "healthy"
			service.Error = "AMI client not initialized yet (ports reachable)"
		} else if amiReachable || httpReachable {
			service.Status = "warning"
			service.Error = "Asterisk partially reachable (check AMI/HTTP configuration)"
		} else {
			service.Status = "unhealthy"
			service.Error = "Asterisk not reachable"
		}

		service.ResponseTime = time.Since(startTime).Milliseconds()
		return service
	}

	// Quick AMI test with timeout
	response, err := client.SendCommand("Ping", nil)
	if err != nil {
		service.Status = "unhealthy"
		service.Error = fmt.Sprintf("AMI ping failed: %v", err)
		service.Details["ami_connected"] = false
	} else if !response.Success {
		service.Status = "warning"
		service.Error = "AMI ping returned error"
		service.Details["ami_connected"] = true
		service.Details["ping_error"] = response.Error
	} else {
		service.Status = "healthy"
		service.Details["ami_connected"] = true
		service.Details["ping_success"] = true
		service.Details["last_ping"] = time.Now().Format(time.RFC3339)
		service.Details["response_time_ms"] = time.Since(startTime).Milliseconds()
	}

	service.ResponseTime = time.Since(startTime).Milliseconds()
	return service
}

// Check Asterisk service health (comprehensive version)
func checkAsteriskHealth() ServiceInfo {
	startTime := time.Now()
	service := ServiceInfo{
		LastCheck: startTime,
		Details:   make(map[string]interface{}),
	}

	// Check AMI connection
	client := asterisk.GetAMIClient()
	asteriskAddr := fmt.Sprintf("%s:%s", config.AppConfig.AsteriskHost, config.AppConfig.AsteriskAMIPort)
	service.Details["asterisk_host"] = asteriskAddr

	// If AMI client isn't ready, fall back to lightweight port checks.
	if client == nil || !client.IsConnected() {
		amiReachable := false
		if conn, err := net.DialTimeout("tcp", asteriskAddr, 700*time.Millisecond); err == nil {
			amiReachable = true
			_ = conn.Close()
		}

		httpReachable := false
		httpURL := fmt.Sprintf("http://%s:%s/httpstatus", config.AppConfig.AsteriskHost, config.AppConfig.SIPPort)
		httpClient := &http.Client{Timeout: 800 * time.Millisecond}
		if resp, err := httpClient.Get(httpURL); err == nil {
			httpReachable = true
			_ = resp.Body.Close()
		}

		service.Details["ami_reachable"] = amiReachable
		service.Details["http_reachable"] = httpReachable
		service.Details["ami_connected"] = false

		if amiReachable && httpReachable {
			service.Status = "healthy"
			service.Error = "AMI client not initialized yet (ports reachable)"
		} else if amiReachable || httpReachable {
			service.Status = "warning"
			service.Error = "Asterisk partially reachable (check AMI/HTTP configuration)"
		} else {
			service.Status = "unhealthy"
			service.Error = "Asterisk not reachable"
		}

		service.ResponseTime = time.Since(startTime).Milliseconds()
		return service
	}

	// Test AMI command
	response, err := client.SendCommand("CoreStatus", nil)
	if err != nil {
		service.Status = "unhealthy"
		service.Error = fmt.Sprintf("AMI command failed: %v", err)
	} else if !response.Success {
		service.Status = "warning"
		service.Error = "AMI command returned error"
	} else {
		service.Status = "healthy"
		service.Details["ami_connected"] = true
		service.Details["core_status"] = "running"
	}

	service.ResponseTime = time.Since(startTime).Milliseconds()
	return service
}

// Check database health
func checkDatabaseHealth() ServiceInfo {
	startTime := time.Now()
	service := ServiceInfo{
		LastCheck: startTime,
		Details:   make(map[string]interface{}),
	}

	db := database.GetDB()
	if db == nil {
		service.Status = "critical"
		service.Error = "Database connection not available"
		service.ResponseTime = time.Since(startTime).Milliseconds()
		return service
	}

	// Test database connection
	sqlDB, err := db.DB()
	if err != nil {
		service.Status = "unhealthy"
		service.Error = fmt.Sprintf("Failed to get database instance: %v", err)
		service.ResponseTime = time.Since(startTime).Milliseconds()
		return service
	}

	if err := sqlDB.Ping(); err != nil {
		service.Status = "unhealthy"
		service.Error = fmt.Sprintf("Database ping failed: %v", err)
	} else {
		service.Status = "healthy"
		service.Details["connection"] = "active"

		// Get database stats
		stats := sqlDB.Stats()
		service.Details["open_connections"] = stats.OpenConnections
		service.Details["in_use"] = stats.InUse
		service.Details["idle"] = stats.Idle
	}

	service.ResponseTime = time.Since(startTime).Milliseconds()
	return service
}

// Check WebSocket health
func checkWebSocketHealth() ServiceInfo {
	startTime := time.Now()
	service := ServiceInfo{
		LastCheck: startTime,
		Details:   make(map[string]interface{}),
	}

	hub := websocket.GetHub()
	if hub == nil {
		service.Status = "unhealthy"
		service.Error = "WebSocket hub not available"
	} else {
		service.Status = "healthy"
		service.Details["active_clients"] = hub.GetClientCount()
		service.Details["connected_extensions"] = len(hub.GetConnectedExtensions())
	}

	service.ResponseTime = time.Since(startTime).Milliseconds()
	return service
}

// Check backend service health
func checkBackendHealth() ServiceInfo {
	startTime := time.Now()
	service := ServiceInfo{
		LastCheck: startTime,
		Status:    "healthy",
		Details:   make(map[string]interface{}),
	}

	// Get current process info
	if pid := os.Getpid(); pid > 0 {
		if proc, err := process.NewProcess(int32(pid)); err == nil {
			if memInfo, err := proc.MemoryInfo(); err == nil {
				service.Details["memory_usage"] = memInfo.RSS
			}
			if cpuPercent, err := proc.CPUPercent(); err == nil {
				service.Details["cpu_usage"] = cpuPercent
			}
		}
	}

	service.Details["goroutines"] = runtime.NumGoroutine()
	service.Details["go_version"] = runtime.Version()
	service.ResponseTime = time.Since(startTime).Milliseconds()
	return service
}

// Get comprehensive system metrics
func getSystemMetrics() SystemMetrics {
	metrics := SystemMetrics{}

	// CPU metrics
	if cpuPercent, err := cpu.Percent(time.Second, false); err == nil && len(cpuPercent) > 0 {
		metrics.CPU.Usage = cpuPercent[0]
	}
	metrics.CPU.Cores = runtime.NumCPU()

	// Memory metrics
	if memInfo, err := mem.VirtualMemory(); err == nil {
		metrics.Memory.Total = memInfo.Total
		metrics.Memory.Used = memInfo.Used
		metrics.Memory.Available = memInfo.Available
		metrics.Memory.UsagePercent = memInfo.UsedPercent
	}

	// Disk metrics (cross-platform root partition)
	var diskPath string
	if runtime.GOOS == "windows" {
		diskPath = "C:\\"
	} else {
		diskPath = "/"
	}

	if diskInfo, err := disk.Usage(diskPath); err == nil {
		metrics.Disk.Total = diskInfo.Total
		metrics.Disk.Used = diskInfo.Used
		metrics.Disk.Free = diskInfo.Free
		metrics.Disk.UsagePercent = diskInfo.UsedPercent
	}

	// Network metrics
	hub := websocket.GetHub()
	if hub != nil {
		metrics.Network.WebSocketClients = hub.GetClientCount()
	}

	return metrics
}

// Get database health metrics
func getDatabaseHealth() DatabaseHealth {
	health := DatabaseHealth{Status: "healthy"}

	db := database.GetDB()
	if db == nil {
		health.Status = "unhealthy"
		return health
	}

	// Count records
	db.Model(&models.User{}).Count(&health.TotalUsers)
	db.Model(&models.ActiveCall{}).Count(&health.ActiveCalls)
	db.Model(&models.CallLog{}).Count(&health.CallLogsCount)

	// Get database file size
	if info, err := os.Stat(config.AppConfig.DBPath); err == nil {
		health.DatabaseSize = formatBytes(info.Size())
	}

	return health
}

// Helper functions
func formatUptime(duration time.Duration) string {
	days := int(duration.Hours()) / 24
	hours := int(duration.Hours()) % 24
	minutes := int(duration.Minutes()) % 60

	if days > 0 {
		return fmt.Sprintf("%d days, %d hours, %d minutes", days, hours, minutes)
	} else if hours > 0 {
		return fmt.Sprintf("%d hours, %d minutes", hours, minutes)
	} else {
		return fmt.Sprintf("%d minutes", minutes)
	}
}

func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
