package config

import (
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server Configuration
	Port string
	Host string

	// JWT Configuration
	JWTSecret      string
	JWTExpiryHours int

	// Database Configuration
	DBPath string

	// Asterisk Configuration
	AsteriskHost        string
	AsteriskAMIHost     string
	AsteriskAMIPort     string
	AsteriskAMIUsername string
	AsteriskAMISecret   string
	AsteriskWSLDistro   string
	AsteriskSSHUser     string
	AsteriskSSHPassword string
	AsteriskSSHPort     string

	// SIP Configuration
	SIPDomain string
	SIPPort   string

	// CORS Configuration
	CORSOrigins []string

	// Debug Mode
	Debug bool

	// Dynamic Configuration
	PublicHost    string
	Environment   string
	ServiceName   string
	DiscoveryMode string

	// Guards periodic re-resolution of dynamic hosts
	resolveMu         sync.Mutex
	lastHostResolveAt time.Time
}

var (
	AppConfig *Config
	ConfigMu  sync.RWMutex
)

func LoadConfig() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	AppConfig = &Config{
		Port:                getEnv("PORT", "8080"),
		Host:                getEnv("HOST", "0.0.0.0"),
		JWTSecret:           getEnv("JWT_SECRET", ""),
		JWTExpiryHours:      getEnvAsInt("JWT_EXPIRY_HOURS", 24),
		DBPath:              getEnv("DB_PATH", "./voip.db"),
		AsteriskHost:        getEnv("ASTERISK_HOST", "asterisk.local"),
		AsteriskAMIHost:     getEnv("ASTERISK_AMI_HOST", ""),
		AsteriskAMIPort:     getEnv("ASTERISK_AMI_PORT", "5038"),
		AsteriskAMIUsername: getEnv("ASTERISK_AMI_USERNAME", "admin"),
		AsteriskAMISecret:   getEnv("ASTERISK_AMI_SECRET", "amp111"),
		AsteriskWSLDistro:   getEnv("ASTERISK_WSL_DISTRO", ""),
		AsteriskSSHUser:     getEnv("ASTERISK_SSH_USER", ""),
		AsteriskSSHPassword: getEnv("ASTERISK_SSH_PASSWORD", ""),
		AsteriskSSHPort:     getEnv("ASTERISK_SSH_PORT", "22"),
		SIPDomain:           getEnv("SIP_DOMAIN", "asterisk.local"),
		SIPPort:             getEnv("SIP_PORT", "8088"),
		Debug:               getEnvAsBool("DEBUG", true),
		Environment:         getEnv("ENVIRONMENT", "development"),
		ServiceName:         getEnv("SERVICE_NAME", "voip-backend"),
		DiscoveryMode:       getEnv("DISCOVERY_MODE", "auto"),
		PublicHost:          getEnv("PUBLIC_HOST", ""),
	}

	// Resolve dynamic configurations (skip in test environment)
	if AppConfig.Environment != "test" {
		AppConfig.resolveHosts()
	}
	AppConfig.configureCORS()

	if AppConfig.JWTSecret == "" {
		log.Fatal("JWT_SECRET environment variable is required. Set a strong random value. Do NOT use a default.")
	}
	if AppConfig.JWTSecret == "default-secret-change-this" || AppConfig.JWTSecret == "changeme-in-production-use-random-64-char-hex-string" {
		log.Fatal("JWT_SECRET is still set to a known default. Generate a new random value immediately.")
	}

	log.Printf("Config loaded: Server will run on %s:%s", AppConfig.Host, AppConfig.Port)
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvAsBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}

func getEnvAsSlice(key string, defaultValue []string) []string {
	if value := os.Getenv(key); value != "" {
		return strings.Split(value, ",")
	}
	return defaultValue
}

// resolveHosts dynamically resolves host addresses
func (c *Config) resolveHosts() {
	log.Println("[Config] Resolving dynamic host configurations...")

	// Resolve Asterisk host
	c.AsteriskHost = c.resolveAsteriskHost()
	c.SIPDomain = c.AsteriskHost

	// AMI may dial a different (local) address than the host exposed to clients.
	// Default to the resolved Asterisk host when ASTERISK_AMI_HOST is unset.
	if amiEnv := getEnv("ASTERISK_AMI_HOST", ""); amiEnv != "" {
		c.AsteriskAMIHost = amiEnv
	} else {
		c.AsteriskAMIHost = c.AsteriskHost
	}
	log.Printf("[Config] Resolved AMI host: %s", c.AsteriskAMIHost)

	// Resolve public host for frontend connections
	if c.PublicHost == "" {
		c.PublicHost = c.getPublicHost()
	}

	log.Printf("[Config] Resolved Asterisk host: %s", c.AsteriskHost)
	log.Printf("[Config] Resolved public host: %s", c.PublicHost)
}

// hostResolveTTL controls how often dynamic host resolution is refreshed.
const hostResolveTTL = 30 * time.Second

// ensureResolvedHosts re-runs dynamic host resolution periodically so clients
// always receive the current real hosts (e.g. a WSL NAT IP that changed after a
// reboot) without needing a backend restart. A full re-resolve is only performed
// when the cached host becomes unreachable; otherwise the current result is
// reused to avoid spawning subprocesses on every request.
func (c *Config) ensureResolvedHosts() {
	c.resolveMu.Lock()
	defer c.resolveMu.Unlock()

	if time.Since(c.lastHostResolveAt) < hostResolveTTL {
		return
	}
	c.lastHostResolveAt = time.Now()

	if !isLoopbackHost(c.AsteriskHost) && c.isHostReachable(c.AsteriskHost, c.AsteriskAMIPort) {
		return
	}
	c.resolveHosts()
}

// configureCORS sets up CORS origins dynamically
func (c *Config) configureCORS() {
	if corsEnv := getEnv("CORS_ORIGINS", ""); corsEnv != "" {
		c.CORSOrigins = strings.Split(corsEnv, ",")
	} else {
		// Auto-configure CORS origins
		c.CORSOrigins = []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
		}

		// Add public host variations
		if c.PublicHost != "" && c.PublicHost != "localhost" {
			c.CORSOrigins = append(c.CORSOrigins,
				"http://"+c.PublicHost+":3000",
				"https://"+c.PublicHost+":3000",
			)
		}
	}

	log.Printf("[Config] CORS origins: %v", c.CORSOrigins)
}

// isLoopbackHost reports whether host refers to the local machine.
func isLoopbackHost(host string) bool {
	switch strings.ToLower(strings.TrimSpace(host)) {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

// resolveAsteriskHost tries to find the best Asterisk host
func (c *Config) resolveAsteriskHost() string {
	envHost := getEnv("ASTERISK_HOST", "")

	// When the configured host is loopback, treat it as a candidate rather than
	// a hard preference: the WSL localhost relay is unreliable (connections die
	// mid-session), so a reachable WSL IP is preferred for local Asterisk.
	isLoopback := isLoopbackHost(envHost)

	if envHost != "" && !isLoopback {
		if c.isHostReachable(envHost, c.AsteriskAMIPort) {
			log.Printf("[Config] Using ASTERISK_HOST from environment: %s", envHost)
			return envHost
		}
		log.Printf("[Config] ASTERISK_HOST %s not reachable, probing alternatives...", envHost)
	}

	// When Asterisk runs in WSL, its own virtual IP is reachable directly from
	// Windows without the (sometimes flaky) localhost relay.
	if wslIP := c.detectWSLIP(); wslIP != "" {
		if c.isHostReachable(wslIP, c.AsteriskAMIPort) {
			log.Printf("[Config] ✓ Asterisk host reachable via WSL IP: %s", wslIP)
			return wslIP
		}
	}

	if envHost != "" {
		if c.isHostReachable(envHost, c.AsteriskAMIPort) {
			log.Printf("[Config] Using ASTERISK_HOST from environment: %s", envHost)
			return envHost
		}
	}

	// List of possible Asterisk hosts to try if not explicitly set
	candidates := []string{
		"localhost",
		"127.0.0.1",
		"asterisk.local",
		"asterisk",
		"voip-asterisk",
		"172.20.10.5", // Legacy fallback
	}

	for _, host := range candidates {
		log.Printf("[Config] Testing Asterisk host: %s", host)
		if c.isHostReachable(host, c.AsteriskAMIPort) {
			log.Printf("[Config] ✓ Asterisk host reachable: %s", host)
			return host
		}
	}

	// If nothing works, default to localhost for development
	log.Printf("[Config] ⚠ No Asterisk host reachable, defaulting to localhost")
	log.Printf("[Config] Please ensure Asterisk is installed and running, or configure ASTERISK_HOST")
	return "localhost"
}

// detectWSLIP returns the IPv4 address of the configured WSL distro, if any.
func (c *Config) detectWSLIP() string {
	if c.AsteriskWSLDistro == "" {
		return ""
	}
	out, err := exec.Command("wsl", "-d", c.AsteriskWSLDistro, "hostname", "-I").Output()
	if err != nil {
		return ""
	}
	for _, token := range strings.Fields(string(out)) {
		if strings.Contains(token, ".") {
			return token
		}
	}
	return ""
}

// getPublicHost determines the best public host for frontend connections
func (c *Config) getPublicHost() string {
	// Try environment variable first
	if host := getEnv("PUBLIC_HOST", ""); host != "" {
		return host
	}

	// In development, prefer localhost
	if c.Environment == "development" {
		return "localhost"
	}

	// Try to get local network IP
	if localIP := c.getLocalNetworkIP(); localIP != "" {
		return localIP
	}

	// Fallback to localhost
	return "localhost"
}

// getLocalNetworkIP tries to find the local network IP
func (c *Config) getLocalNetworkIP() string {
	// This is a simplified implementation
	// In a real scenario, you might want to use more sophisticated network detection
	return ""
}

// isHostReachable checks if a host:port is reachable via TCP
func (c *Config) isHostReachable(host, port string) bool {
	log.Printf("[Config] Checking connectivity to %s:%s", host, port)

	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 2*time.Second)
	if err != nil {
		log.Printf("[Config] Host %s:%s not reachable: %v", host, port, err)
		return false
	}
	conn.Close()
	log.Printf("[Config] Host %s:%s is reachable", host, port)
	return true
}

// GetFrontendConfig returns configuration for frontend consumption
func (c *Config) GetFrontendConfig() map[string]interface{} {
	return c.GetFrontendConfigForRequest(nil)
}

// GetFrontendConfigForRequest returns frontend configuration with URLs built
// from the actual request (scheme + Host), so HTTPS pages automatically receive
// https/wss URLs on the same origin the page was served from.
func (c *Config) GetFrontendConfigForRequest(r *http.Request) map[string]interface{} {
	scheme := "http"
	if r != nil && r.TLS != nil {
		scheme = "https"
	}
	host := ""
	if r != nil && r.Host != "" {
		host = r.Host
	} else {
		host = c.PublicHost + ":" + c.Port
	}
	wsScheme := "ws"
	if scheme == "https" {
		wsScheme = "wss"
	}

	// Clients should dial the real, dynamically-resolved Asterisk host (e.g. a
	// WSL NAT IP), refreshed periodically. Only when Asterisk genuinely runs
	// alongside the backend (loopback) do we reuse the host the client already
	// used to reach the backend, which keeps LAN setups working.
	c.ensureResolvedHosts()
	asteriskHost := c.AsteriskHost
	if hostname, _, err := net.SplitHostPort(host); err == nil && hostname != "" {
		if isLoopbackHost(asteriskHost) {
			asteriskHost = hostname
		}
	} else if host != "" {
		asteriskHost = host
	}

	return map[string]interface{}{
		"api_url": scheme + "://" + host,
		"ws_url":  wsScheme + "://" + host + "/ws",
		"asterisk": map[string]string{
			"host":   asteriskHost,
			"ws_url": "ws://" + asteriskHost + ":" + c.SIPPort + "/ws",
		},
		"environment": c.Environment,
		"debug":       c.Debug,
		"service":     c.ServiceName,
	}
}

// GetAPIURL returns the API base URL
func (c *Config) GetAPIURL() string {
	return "http://" + c.PublicHost + ":" + c.Port
}

// GetWebSocketURL returns the WebSocket URL
func (c *Config) GetWebSocketURL() string {
	return "ws://" + c.PublicHost + ":" + c.Port + "/ws"
}

// GetAsteriskWebSocketURL returns the Asterisk WebSocket URL
func (c *Config) GetAsteriskWebSocketURL() string {
	// Default Asterisk HTTP server WebSocket endpoint (no prefix)
	return "ws://" + c.AsteriskHost + ":" + c.SIPPort + "/ws"
}

// GetAsteriskAMIAddress returns the Asterisk AMI address (loopback-safe host)
func (c *Config) GetAsteriskAMIAddress() string {
	return c.AsteriskAMIHost + ":" + c.AsteriskAMIPort
}
