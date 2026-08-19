package handlers

import (
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"time"
	"voip-backend/asterisk"
	"voip-backend/auth"
	"voip-backend/database"
	"voip-backend/models"
	"voip-backend/security"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Login handles user login
func Login(c *gin.Context) {
	var req models.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
		})
		return
	}

	var user models.User
	if err := database.GetDB().Where("username = ?", req.Username).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid credentials",
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Database error",
		})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Invalid credentials",
		})
		return
	}

	if !user.Enabled {
		c.JSON(http.StatusForbidden, gin.H{
			"error": "Account is disabled. Contact your administrator.",
		})
		return
	}

	now := time.Now()
	database.GetDB().Model(&user).Updates(map[string]interface{}{
		"status":     "online",
		"is_online":  true,
		"last_login": now,
		"last_seen":  now,
	})

	token, err := auth.GenerateToken(user.ID, user.Username, user.Extension, user.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to generate token",
		})
		return
	}

	userResponse := user.ToResponse()

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"message":      "Login successful",
		"token":        token,
		"user":         userResponse,
		"sip_password": user.SIPPassword,
	})
}

// generateExtension creates a unique 4-digit extension number
func generateExtension() string {
	db := database.GetDB()
	for {
		ext := fmt.Sprintf("%04d", rand.Intn(9000)+1000)
		var count int64
		db.Model(&models.User{}).Where("extension = ?", ext).Count(&count)
		if count == 0 {
			return ext
		}
	}
}

// Register handles user registration with auto-generated extension
func Register(c *gin.Context) {
	var req models.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
		})
		return
	}

	var existingUser models.User
	if err := database.GetDB().Where("username = ?", req.Username).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Username already exists",
		})
		return
	}

	if err := database.GetDB().Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Email already exists",
		})
		return
	}

	extension := req.Extension
	if extension == "" {
		extension = generateExtension()
	} else {
		if !security.IsValidExtension(extension) {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid extension format. Must be 4-6 digits.",
			})
			return
		}
		var count int64
		database.GetDB().Model(&models.User{}).Where("extension = ?", extension).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{
				"error": "Extension already exists",
			})
			return
		}
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to hash password",
		})
		return
	}

	user := models.User{
		Username:  req.Username,
		Email:     req.Email,
		Password:  string(hashedPassword),
		Extension: extension,
		Status:    "offline",
		Role:      "user",
	}

	if err := database.GetDB().Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create user",
		})
		return
	}

	// Create PJSIP endpoint in Asterisk so the extension can register and receive calls
	go func() {
		if err := asterisk.AddEndpoint(extension, user.SIPPassword); err != nil {
			log.Printf("Warning: Failed to add Asterisk endpoint for extension %s: %v", extension, err)
		}
	}()

	c.JSON(http.StatusCreated, gin.H{
		"success":      true,
		"message":      "User registered successfully",
		"user":         user.ToResponse(),
		"sip_password": user.SIPPassword,
	})
}

// Logout handles user logout
func Logout(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	// Update user status to offline
	now := time.Now()
	database.GetDB().Model(&models.User{}).Where("id = ?", userID).Updates(map[string]interface{}{
		"status":    "offline",
		"is_online": false,
		"last_seen": now,
	})

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Logged out successfully",
	})
}

// RefreshToken handles token refresh
func RefreshToken(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Authorization header required",
		})
		return
	}

	tokenString := authHeader[7:] // Remove "Bearer " prefix
	newToken, err := auth.RefreshToken(tokenString)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "Failed to refresh token",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"token":   newToken,
	})
}

// GetProfile returns the current user's profile
func GetProfile(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var user models.User
	if err := database.GetDB().First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "User not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"user":    user.ToResponse(),
	})
}
