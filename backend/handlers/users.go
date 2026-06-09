package handlers

import (
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"
	"voip-backend/database"
	"voip-backend/middleware"
	"voip-backend/models"
	"voip-backend/websocket"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// GetUsers returns all users (admin only)
func GetUsers(c *gin.Context) {
	var users []models.User
	if err := database.GetDB().Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch users",
		})
		return
	}

	// Convert to response format
	var userResponses []models.UserResponse
	var extensions []string

	for _, user := range users {
		userResponses = append(userResponses, user.ToResponse())
		extensions = append(extensions, user.Extension)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"users":      userResponses,
		"extensions": extensions,
	})
}

// GetOnlineUsers returns all online users
func GetOnlineUsers(c *gin.Context) {
	userID, _, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var users []models.User
	// Get all users except the current user
	if err := database.GetDB().Where("status = ? AND id != ?", "online", userID).Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch online users",
		})
		return
	}

	// Convert to response format
	var userResponses []models.UserResponse
	for _, user := range users {
		userResponses = append(userResponses, user.ToResponse())
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"users":   userResponses,
	})
}

// GetAllUsers returns all users (accessible to all authenticated users)
func GetAllUsers(c *gin.Context) {
	var users []models.User
	if err := database.GetDB().Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch users",
		})
		return
	}

	var userResponses []models.UserResponse
	for _, user := range users {
		userResponses = append(userResponses, user.ToResponse())
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"users":   userResponses,
	})
}

// GetUserByExtension returns user information by extension
func GetUserByExtension(c *gin.Context) {
	extension := c.Param("extension")
	if extension == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Extension parameter required",
		})
		return
	}

	var user models.User
	if err := database.GetDB().Where("extension = ?", extension).First(&user).Error; err != nil {
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

// GetConnectedExtensions returns all currently connected WebSocket extensions
func GetConnectedExtensions(c *gin.Context) {
	hub := websocket.GetHub()
	if hub == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "WebSocket hub not available",
		})
		return
	}

	extensions := hub.GetConnectedExtensions()

	// Get detailed connection info
	connectionDetails := make(map[string]interface{})
	for _, ext := range extensions {
		clientCount := hub.GetExtensionClientCount(ext)
		connectionDetails[ext] = gin.H{
			"client_count": clientCount,
			"connected":    true,
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":       true,
		"extensions":    extensions,
		"count":         len(extensions),
		"details":       connectionDetails,
		"total_clients": hub.GetClientCount(),
	})
}

// GetConnectionStatus returns detailed connection status for debugging
func GetConnectionStatus(c *gin.Context) {
	hub := websocket.GetHub()
	if hub == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "WebSocket hub not available",
		})
		return
	}

	// Get all users from database
	var users []models.User
	if err := database.GetDB().Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch users",
		})
		return
	}

	// Build status report
	statusReport := make([]gin.H, 0)
	for _, user := range users {
		clientCount := hub.GetExtensionClientCount(user.Extension)
		isConnected := hub.IsExtensionConnected(user.Extension)

		statusReport = append(statusReport, gin.H{
			"extension":    user.Extension,
			"username":     user.Username,
			"status":       user.Status,
			"ws_connected": isConnected,
			"client_count": clientCount,
			"status_match": (user.Status == "online") == isConnected,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success":              true,
		"connection_status":    statusReport,
		"total_clients":        hub.GetClientCount(),
		"connected_extensions": hub.GetConnectedExtensions(),
	})
}

// GetSystemStats returns system statistics (admin only)
func GetSystemStats(c *gin.Context) {
	// Count total users
	var totalUsers int64
	database.GetDB().Model(&models.User{}).Count(&totalUsers)

	// Count online users (users who are marked as online AND have recent activity)
	var onlineUsers int64
	// Consider users online if they have status = "online" AND is_online = true AND last_seen within last 5 minutes
	fiveMinutesAgo := time.Now().Add(-5 * time.Minute)
	database.GetDB().Model(&models.User{}).Where("status = ? AND is_online = ? AND last_seen > ?", "online", true, fiveMinutesAgo).Count(&onlineUsers)

	// Count active calls
	var activeCalls int64
	database.GetDB().Model(&models.ActiveCall{}).Count(&activeCalls)

	// Count total calls today
	var callsToday int64
	database.GetDB().Model(&models.CallLog{}).Where("DATE(created_at) = DATE(NOW())").Count(&callsToday)

	// Get WebSocket connections
	hub := websocket.GetHub()
	wsConnections := 0
	if hub != nil {
		wsConnections = hub.GetClientCount()
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"stats": gin.H{
			"total_users":    totalUsers,
			"online_users":   onlineUsers,
			"active_calls":   activeCalls,
			"calls_today":    callsToday,
			"ws_connections": wsConnections,
		},
	})
}

// DeleteUser deletes a user (admin only)
func DeleteUser(c *gin.Context) {
	userIDStr := c.Param("id")
	if userIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "User ID parameter required",
		})
		return
	}

	// Convert string ID to uint
	userID, err := strconv.ParseUint(userIDStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid user ID format",
		})
		return
	}

	// Check if user exists
	var user models.User
	if err := database.GetDB().First(&user, uint(userID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"success": false,
				"error":   "User not found",
			})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Database error while finding user",
			})
		}
		return
	}

	// Don't allow deleting admin users
	if user.Role == "admin" {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"error":   "Cannot delete admin users",
		})
		return
	}

	// Get current admin user info for logging
	adminUserID, _, _, _, exists := middleware.GetUserFromContext(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"success": false,
			"error":   "Admin user not found in context",
		})
		return
	}

	// Start transaction for safe deletion
	tx := database.GetDB().Begin()
	if tx.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to start transaction",
		})
		return
	}

	// Delete related call logs first (optional - you might want to keep them for audit)
	if err := tx.Where("caller_id = ? OR callee_id = ?", user.ID, user.ID).Delete(&models.CallLog{}).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to delete user's call logs",
		})
		return
	}

	// Delete the user
	if err := tx.Delete(&user).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to delete user",
		})
		return
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to commit deletion",
		})
		return
	}

	// Notify other users about user deletion via WebSocket
	hub := websocket.GetHub()
	if hub != nil {
		hub.BroadcastMessage(gin.H{
			"type":       "user_deleted",
			"user_id":    user.ID,
			"username":   user.Username,
			"deleted_by": adminUserID,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User deleted successfully",
		"user":    user.ToResponse(),
	})
}

// UpdateUserStatus updates a user's online status
func UpdateUserStatus(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var req struct {
		Status string `json:"status" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
		})
		return
	}

	// Validate status
	validStatuses := map[string]bool{
		"online":  true,
		"offline": true,
		"busy":    true,
		"away":    true,
	}

	if !validStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid status. Must be one of: online, offline, busy, away",
		})
		return
	}

	// Update user status
	now := time.Now()
	updates := map[string]interface{}{
		"status":    req.Status,
		"last_seen": now,
	}

	if req.Status == "online" {
		updates["is_online"] = true
	} else if req.Status == "offline" {
		updates["is_online"] = false
	}

	if err := database.GetDB().Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update status",
		})
		return
	}

	// Get updated user info
	var user models.User
	if err := database.GetDB().First(&user, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch updated user",
		})
		return
	}

	// Broadcast status change to other users
	hub := websocket.GetHub()
	if hub != nil {
		// Broadcast comprehensive status update
		statusUpdate := gin.H{
			"type":      "user_status_changed",
			"user_id":   user.ID,
			"username":  user.Username,
			"extension": user.Extension,
			"status":    user.Status,
			"is_online": user.IsOnline,
			"last_seen": user.LastSeen,
			"timestamp": time.Now().Unix(),
		}

		// Add WebSocket connection info
		if extensionStatus := hub.GetExtensionStatus(user.Extension); extensionStatus != nil {
			statusUpdate["ws_connected"] = extensionStatus["ws_connected"]
			statusUpdate["client_count"] = extensionStatus["client_count"]
		}

		hub.BroadcastMessage(statusUpdate)

		// Also notify the specific user's extension
		hub.NotifyUserStatus(user.Extension, user.Status)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Status updated successfully",
		"user":    user.ToResponse(),
	})
}

// HeartbeatUser updates user's last_seen timestamp to indicate they're still active
func HeartbeatUser(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	// Get user extension for WebSocket status check
	userIDUint, ok := userID.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Invalid user ID",
		})
		return
	}

	// Get user info
	var user models.User
	if err := database.GetDB().First(&user, userIDUint).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch user",
		})
		return
	}

	// Update last_seen timestamp and ensure user is marked as online if they have WebSocket connection
	now := time.Now()
	updates := map[string]interface{}{
		"last_seen": now,
	}

	// Check if user has active WebSocket connection
	hub := websocket.GetHub()
	if hub != nil && hub.IsExtensionConnected(user.Extension) {
		// User has active WebSocket connection, ensure they're marked as online
		if user.Status == "offline" {
			updates["status"] = "online"
			updates["is_online"] = true
		}
	}

	if err := database.GetDB().Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update heartbeat",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"timestamp": now,
		"status":    user.Status,
		"is_online": user.IsOnline,
	})
}

// SetUserOfflineByExtension sets a user offline by their extension (called from WebSocket disconnect)
func SetUserOfflineByExtension(extension string) error {
	if extension == "" {
		return fmt.Errorf("extension cannot be empty")
	}

	// Find user by extension
	var user models.User
	if err := database.GetDB().Where("extension = ?", extension).First(&user).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("User with extension %s not found", extension)
			return nil // Not an error if user doesn't exist
		}
		return fmt.Errorf("failed to find user: %v", err)
	}

	// Update user status to offline
	now := time.Now()
	updates := map[string]interface{}{
		"status":    "offline",
		"is_online": false,
		"last_seen": now,
	}

	if err := database.GetDB().Model(&user).Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to update user status: %v", err)
	}

	log.Printf("Set user %s (extension: %s) offline due to WebSocket disconnection", user.Username, extension)

	// Broadcast status change to other users
	hub := websocket.GetHub()
	if hub != nil {
		statusUpdate := gin.H{
			"type":         "user_status_changed",
			"user_id":      user.ID,
			"username":     user.Username,
			"extension":    user.Extension,
			"status":       "offline",
			"is_online":    false,
			"last_seen":    now,
			"timestamp":    time.Now().Unix(),
			"ws_connected": false,
			"client_count": 0,
		}

		hub.BroadcastMessage(statusUpdate)
	}

	return nil
}

// CreateUser creates a new user (admin only)
func CreateUser(c *gin.Context) {
	var req struct {
		Username  string `json:"username" binding:"required,min=3,max=50"`
		Email     string `json:"email" binding:"required,email"`
		Password  string `json:"password" binding:"required,min=6"`
		Extension string `json:"extension" binding:"required,min=4,max=6"`
		Role      string `json:"role"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
		})
		return
	}

	// Validate role
	if req.Role == "" {
		req.Role = "user"
	}
	if req.Role != "user" && req.Role != "admin" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Role must be 'user' or 'admin'",
		})
		return
	}

	// Check if username already exists
	var existingUser models.User
	if err := database.GetDB().Where("username = ?", req.Username).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Username already exists",
		})
		return
	}

	// Check if email already exists
	if err := database.GetDB().Where("email = ?", req.Email).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Email already exists",
		})
		return
	}

	// Check if extension already exists
	if err := database.GetDB().Where("extension = ?", req.Extension).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{
			"error": "Extension already exists",
		})
		return
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to hash password",
		})
		return
	}

	// Create new user
	user := models.User{
		Username:  req.Username,
		Email:     req.Email,
		Password:  string(hashedPassword),
		Extension: req.Extension,
		Status:    "offline",
		Role:      req.Role,
		IsOnline:  false,
	}

	if err := database.GetDB().Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create user",
		})
		return
	}

	log.Printf("Admin created new user: %s (extension: %s, role: %s)", user.Username, user.Extension, user.Role)

	c.JSON(http.StatusCreated, gin.H{
		"success": true,
		"message": "User created successfully",
		"user":    user.ToResponse(),
	})
}

// UpdateUser updates an existing user (admin only)
func UpdateUser(c *gin.Context) {
	userIDParam := c.Param("id")
	userID, err := strconv.ParseUint(userIDParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid user ID",
		})
		return
	}

	var req struct {
		Username  string `json:"username"`
		Email     string `json:"email"`
		Extension string `json:"extension"`
		Role      string `json:"role"`
		Status    string `json:"status"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
		})
		return
	}

	// Find the user
	var user models.User
	if err := database.GetDB().First(&user, uint(userID)).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{
				"error": "User not found",
			})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Database error",
			})
		}
		return
	}

	// Prepare updates
	updates := make(map[string]interface{})

	if req.Username != "" && req.Username != user.Username {
		// Check if new username already exists
		var existingUser models.User
		if err := database.GetDB().Where("username = ? AND id != ?", req.Username, userID).First(&existingUser).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{
				"error": "Username already exists",
			})
			return
		}
		updates["username"] = req.Username
	}

	if req.Email != "" && req.Email != user.Email {
		// Check if new email already exists
		var existingUser models.User
		if err := database.GetDB().Where("email = ? AND id != ?", req.Email, userID).First(&existingUser).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{
				"error": "Email already exists",
			})
			return
		}
		updates["email"] = req.Email
	}

	if req.Extension != "" && req.Extension != user.Extension {
		// Check if new extension already exists
		var existingUser models.User
		if err := database.GetDB().Where("extension = ? AND id != ?", req.Extension, userID).First(&existingUser).Error; err == nil {
			c.JSON(http.StatusConflict, gin.H{
				"error": "Extension already exists",
			})
			return
		}
		updates["extension"] = req.Extension
	}

	if req.Role != "" && req.Role != user.Role {
		if req.Role != "user" && req.Role != "admin" {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Role must be 'user' or 'admin'",
			})
			return
		}
		updates["role"] = req.Role
	}

	if req.Status != "" && req.Status != user.Status {
		validStatuses := map[string]bool{
			"online":  true,
			"offline": true,
			"busy":    true,
			"away":    true,
		}
		if !validStatuses[req.Status] {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": "Invalid status. Must be one of: online, offline, busy, away",
			})
			return
		}
		updates["status"] = req.Status
		if req.Status == "online" {
			updates["is_online"] = true
		} else if req.Status == "offline" {
			updates["is_online"] = false
		}
	}

	// Apply updates if any
	if len(updates) > 0 {
		if err := database.GetDB().Model(&user).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to update user",
			})
			return
		}

		// Reload user to get updated data
		if err := database.GetDB().First(&user, uint(userID)).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to reload user data",
			})
			return
		}

		log.Printf("Admin updated user: %s (ID: %d)", user.Username, user.ID)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "User updated successfully",
		"user":    user.ToResponse(),
	})
}

// CleanupStaleUsers sets users offline if they haven't been seen recently and have no WebSocket connection
func CleanupStaleUsers() {
	log.Println("Running status cleanup...")

	// Define stale threshold (5 minutes without activity)
	staleThreshold := time.Now().Add(-5 * time.Minute)

	// Get all users who are marked as online but haven't been seen recently
	var staleUsers []models.User
	if err := database.GetDB().Where(
		"(status = ? OR is_online = ?) AND (last_seen IS NULL OR last_seen < ?)",
		"online", true, staleThreshold,
	).Find(&staleUsers).Error; err != nil {
		log.Printf("Error fetching stale users: %v", err)
		return
	}

	hub := websocket.GetHub()
	if hub == nil {
		log.Println("WebSocket hub not available for status cleanup")
		return
	}

	cleanedCount := 0
	for _, user := range staleUsers {
		// Check if user has active WebSocket connection
		if hub.IsExtensionConnected(user.Extension) {
			// User has active connection, update their last_seen
			now := time.Now()
			if err := database.GetDB().Model(&user).Update("last_seen", now).Error; err != nil {
				log.Printf("Error updating last_seen for user %s: %v", user.Username, err)
			}
			continue
		}

		// User has no active connection and is stale, set them offline
		if err := SetUserOfflineByExtension(user.Extension); err != nil {
			log.Printf("Error setting user %s offline during cleanup: %v", user.Username, err)
			continue
		}

		cleanedCount++
		log.Printf("Set stale user %s (extension: %s) offline", user.Username, user.Extension)
	}

	if cleanedCount > 0 {
		log.Printf("Status cleanup completed: %d users set offline", cleanedCount)
	}
}
