package middleware

import (
	"net/http"
	"strings"
	"voip-backend/auth"

	"github.com/gin-gonic/gin"
)

// AuthMiddleware validates JWT tokens
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := ""

		// Try Authorization header first
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			if !strings.HasPrefix(authHeader, "Bearer ") {
				c.JSON(http.StatusUnauthorized, gin.H{
					"error": "Invalid authorization header format",
				})
				c.Abort()
				return
			}
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			// Fallback to query parameter token (for audio/image URLs)
			tokenString = c.Query("token")
		}

		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Authorization required",
			})
			c.Abort()
			return
		}

		// Validate the token
		claims, err := auth.ValidateToken(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "Invalid token: " + err.Error(),
			})
			c.Abort()
			return
		}

		// Store user information in context
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("extension", claims.Extension)
		c.Set("role", claims.Role)

		c.Next()
	}
}

// AdminMiddleware ensures the user has admin role
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(http.StatusUnauthorized, gin.H{
				"error": "User role not found",
			})
			c.Abort()
			return
		}

		if role != "admin" {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "Admin access required",
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

// GetUserFromContext extracts user information from gin context
func GetUserFromContext(c *gin.Context) (uint, string, string, string, bool) {
	userID, exists1 := c.Get("user_id")
	username, exists2 := c.Get("username")
	extension, exists3 := c.Get("extension")
	role, exists4 := c.Get("role")

	if !exists1 || !exists2 || !exists3 || !exists4 {
		return 0, "", "", "", false
	}

	return userID.(uint), username.(string), extension.(string), role.(string), true
}
