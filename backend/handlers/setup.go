package handlers

import (
	"net/http"

	"voip-backend/database"
	"voip-backend/models"

	"github.com/gin-gonic/gin"
)

// getSetupState returns the persisted setup state, treating a missing row as
// "not configured".
func getSetupState() models.SetupState {
	var state models.SetupState
	if err := database.DB.First(&state).Error; err != nil {
		return models.SetupState{Completed: false}
	}
	return state
}

// GetSetupStatus reports whether the server has been configured. Public so the
// app can decide (on any device) whether the setup page is required.
func GetSetupStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"configured": getSetupState().Completed,
	})
}

// CompleteSetup marks the server as configured. Called by the setup page when
// the user saves their configuration; devices then skip /ip-config.
func CompleteSetup(c *gin.Context) {
	state := getSetupState()
	if state.ID == 0 {
		state = models.SetupState{Completed: true}
		if err := database.DB.Create(&state).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to save setup state",
			})
			return
		}
	} else if !state.Completed {
		if err := database.DB.Model(&state).Update("completed", true).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"success": false,
				"error":   "Failed to save setup state",
			})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"configured": true,
	})
}
