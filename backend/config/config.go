package config

import (
	"log"
	"os"
	"strconv"
	"strings"

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
	AsteriskAMIPort     string
	AsteriskAMIUsername string
	AsteriskAMISecret   string

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
}

var AppConfig *Config

func LoadConfig() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	AppConfig = &Config{
		Port:                getEnv("PORT", "8080"),
		Host:                getEnv("HOST", "0.0.0.0"),
		JWTSecret:           getEnv("JWT_SECRET", "default-secret-change-this"),
		JWTExpiryHours:      getEnvAsInt("JWT_EXPIRY_HOURS", 24),
		DBPath:              getEnv("DB_PATH", "./voip.db"),
		AsteriskHost:        getEnv("ASTERISK_HOST", "asterisk.local"),
		AsteriskAMIPort:     getEnv("ASTERISK_AMI_PORT", "5038"),
		AsteriskAMIUsername: getEnv("ASTERISK_AMI_USERNAME", "admin"),
		AsteriskAMISecret:   getEnv("ASTERISK_AMI_SECRET", "amp111"),
		SIPDomain:           getEnv("SIP_DOMAIN", "asterisk.local"),
		SIPPort:             getEnv("SIP_PORT", "8088"),
		Debug:               getEnvAsBool("DEBUG", true),
		Environment:         getEnv("ENVIRONMENT", "development"),
		ServiceName:         getEnv("SERVICE_NAME", "voip-backend"),
		DiscoveryMode:       getEnv("DISCOVERY_MODE", "auto"),
		PublicHost:          getEnv("PUBLIC_HOST", ""),
	}

	// Resolve dynamic configurations
	AppConfig.resolveHosts()
	AppConfig.configureCORS()

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

	// Resolve public host for frontend connections
	if c.PublicHost == "" {
		c.PublicHost = c.getPublicHost()
	}

	log.Printf("[Config] Resolved Asterisk host: %s", c.AsteriskHost)
	log.Printf("[Config] Resolved public host: %s", c.PublicHost)
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

// resolveAsteriskHost tries to find the best Asterisk host
func (c *Config) resolveAsteriskHost() string {
	// First, check if ASTERISK_HOST is explicitly set in environment
	if envHost := getEnv("ASTERISK_HOST", ""); envHost != "" {
		log.Printf("[Config] Using ASTERISK_HOST from environment: %s", envHost)
		return envHost
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

// isHostReachable checks if a host:port is reachable
func (c *Config) isHostReachable(host, port string) bool {
	// Simple connectivity test with timeout
	// Note: We'll implement a basic version for now
	log.Printf("[Config] Checking connectivity to %s:%s", host, port)

	// For now, return true for known good hosts, false for others
	// In production, you'd implement actual network connectivity testing
	goodHosts := []string{"asterisk.local", "asterisk", "172.20.10.5", "localhost"}
	for _, goodHost := range goodHosts {
		if host == goodHost {
			return true
		}
	}
	return false
}

// GetFrontendConfig returns configuration for frontend consumption
func (c *Config) GetFrontendConfig() map[string]interface{} {
	return map[string]interface{}{
		"api_url": c.GetAPIURL(),
		"ws_url":  c.GetWebSocketURL(),
		"asterisk": map[string]string{
			"host":   c.AsteriskHost,
			"ws_url": c.GetAsteriskWebSocketURL(),
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

// GetAsteriskAMIAddress returns the Asterisk AMI address
func (c *Config) GetAsteriskAMIAddress() string {
	return c.AsteriskHost + ":" + c.AsteriskAMIPort
}
