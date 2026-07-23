package auth

import (
	"os"
	"testing"
	"time"
	"voip-backend/config"

	"github.com/golang-jwt/jwt/v5"
)

func setupTest() {
	os.Setenv("JWT_SECRET", "test-secret-key-for-testing-purposes-only-must-be-64-chars-long")
	os.Setenv("ENVIRONMENT", "test")
	os.Setenv("DEBUG", "false")
	config.LoadConfig()
}

func TestGenerateToken(t *testing.T) {
	setupTest()

	token, err := GenerateToken(1, "testuser", "1001", "user")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	if token == "" {
		t.Fatal("Expected non-empty token")
	}

	parsedClaims, err := ValidateToken(token)
	if err != nil {
		t.Fatalf("ValidateToken failed: %v", err)
	}

	if parsedClaims.UserID != 1 {
		t.Errorf("Expected UserID 1, got %d", parsedClaims.UserID)
	}
	if parsedClaims.Username != "testuser" {
		t.Errorf("Expected Username testuser, got %s", parsedClaims.Username)
	}
	if parsedClaims.Extension != "1001" {
		t.Errorf("Expected Extension 1001, got %s", parsedClaims.Extension)
	}
	if parsedClaims.Role != "user" {
		t.Errorf("Expected Role user, got %s", parsedClaims.Role)
	}
}

func TestValidateToken_Invalid(t *testing.T) {
	setupTest()

	_, err := ValidateToken("invalid-token-string")
	if err == nil {
		t.Fatal("Expected error for invalid token")
	}
}

func TestValidateToken_Expired(t *testing.T) {
	setupTest()

	expiredClaims := &Claims{
		UserID:    1,
		Username:  "testuser",
		Extension: "1001",
		Role:      "user",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims)
	tokenStr, err := token.SignedString([]byte(config.AppConfig.JWTSecret))
	if err != nil {
		t.Fatalf("Failed to sign token: %v", err)
	}

	_, err = ValidateToken(tokenStr)
	if err == nil {
		t.Fatal("Expected error for expired token")
	}
}

func TestValidateToken_WrongSecret(t *testing.T) {
	setupTest()

	claims := &Claims{
		UserID:    1,
		Username:  "testuser",
		Extension: "1001",
		Role:      "user",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte("wrong-secret-key"))
	if err != nil {
		t.Fatalf("Failed to sign token: %v", err)
	}

	_, err = ValidateToken(tokenStr)
	if err == nil {
		t.Fatal("Expected error for token signed with wrong secret")
	}
}

func TestRefreshToken(t *testing.T) {
	setupTest()

	originalToken, err := GenerateToken(1, "testuser", "1001", "user")
	if err != nil {
		t.Fatalf("GenerateToken failed: %v", err)
	}

	refreshedToken, err := RefreshToken(originalToken)
	if err != nil {
		t.Fatalf("RefreshToken failed: %v", err)
	}

	parsedClaims, err := ValidateToken(refreshedToken)
	if err != nil {
		t.Fatalf("ValidateToken on refreshed token failed: %v", err)
	}

	if parsedClaims.Username != "testuser" {
		t.Errorf("Expected username testuser, got %s", parsedClaims.Username)
	}
}
