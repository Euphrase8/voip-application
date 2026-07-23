package config

import (
	"os"
	"testing"
)

func TestLoadConfig(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-64-chars-long-for-testing-purposes-only-1234567890")
	os.Setenv("PORT", "9090")
	os.Setenv("HOST", "127.0.0.1")
	os.Setenv("ASTERISK_HOST", "127.0.0.1")
	os.Setenv("DEBUG", "false")
	os.Setenv("ENVIRONMENT", "test")

	LoadConfig()

	if AppConfig == nil {
		t.Fatal("Expected AppConfig to be initialized")
	}

	if AppConfig.Port != "9090" {
		t.Errorf("Expected Port 9090, got %s", AppConfig.Port)
	}
	if AppConfig.Host != "127.0.0.1" {
		t.Errorf("Expected Host 127.0.0.1, got %s", AppConfig.Host)
	}
	if AppConfig.Debug != false {
		t.Errorf("Expected Debug false, got %v", AppConfig.Debug)
	}
	if AppConfig.Environment != "test" {
		t.Errorf("Expected Environment test, got %s", AppConfig.Environment)
	}
}

func TestGetFrontendConfig(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-64-chars-long-for-testing-purposes-only-1234567890")
	os.Setenv("PUBLIC_HOST", "192.168.1.100")
	os.Setenv("PORT", "8080")

	LoadConfig()

	fc := AppConfig.GetFrontendConfig()
	if fc == nil {
		t.Fatal("Expected frontend config map")
	}

	if fc["api_url"] != "http://192.168.1.100:8080" {
		t.Errorf("Expected api_url http://192.168.1.100:8080, got %v", fc["api_url"])
	}
	if fc["environment"] != "test" {
		t.Errorf("Expected environment test, got %v", fc["environment"])
	}
}

func TestGetEnv(t *testing.T) {
	os.Setenv("TEST_KEY", "test_value")
	defer os.Unsetenv("TEST_KEY")

	result := getEnv("TEST_KEY", "default")
	if result != "test_value" {
		t.Errorf("Expected test_value, got %s", result)
	}

	result = getEnv("NONEXISTENT_KEY", "default")
	if result != "default" {
		t.Errorf("Expected default, got %s", result)
	}
}

func TestGetEnvAsInt(t *testing.T) {
	os.Setenv("TEST_INT", "42")
	defer os.Unsetenv("TEST_INT")

	result := getEnvAsInt("TEST_INT", 0)
	if result != 42 {
		t.Errorf("Expected 42, got %d", result)
	}

	result = getEnvAsInt("NONEXISTENT_INT", 10)
	if result != 10 {
		t.Errorf("Expected 10, got %d", result)
	}
}

func TestGetEnvAsBool(t *testing.T) {
	os.Setenv("TEST_BOOL", "true")
	defer os.Unsetenv("TEST_BOOL")

	result := getEnvAsBool("TEST_BOOL", false)
	if result != true {
		t.Errorf("Expected true, got %v", result)
	}

	result = getEnvAsBool("NONEXISTENT_BOOL", true)
	if result != true {
		t.Errorf("Expected true, got %v", result)
	}
}

func TestConfigureCORS(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-64-chars-long-for-testing-purposes-only-1234567890")
	os.Unsetenv("CORS_ORIGINS")

	LoadConfig()

	if len(AppConfig.CORSOrigins) == 0 {
		t.Error("Expected at least one CORS origin")
	}
}

func TestGetAPIURL(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-64-chars-long-for-testing-purposes-only-1234567890")
	os.Setenv("PUBLIC_HOST", "voip.example.com")
	os.Setenv("PORT", "8443")

	LoadConfig()

	url := AppConfig.GetAPIURL()
	if url != "http://voip.example.com:8443" {
		t.Errorf("Expected http://voip.example.com:8443, got %s", url)
	}
}

func TestGetWebSocketURL(t *testing.T) {
	os.Setenv("JWT_SECRET", "test-secret-64-chars-long-for-testing-purposes-only-1234567890")
	os.Setenv("PUBLIC_HOST", "voip.example.com")
	os.Setenv("PORT", "8080")

	LoadConfig()

	url := AppConfig.GetWebSocketURL()
	if url != "ws://voip.example.com:8080/ws" {
		t.Errorf("Expected ws://voip.example.com:8080/ws, got %s", url)
	}
}
