package services

import (
	"log"
	"time"
	"voip-backend/database"
	"voip-backend/models"
	"voip-backend/websocket"
)

// StatusCleanupService handles automatic cleanup of user statuses
type StatusCleanupService struct {
	ticker   *time.Ticker
	stopChan chan bool
	running  bool
}

// NewStatusCleanupService creates a new status cleanup service
func NewStatusCleanupService() *StatusCleanupService {
	return &StatusCleanupService{
		stopChan: make(chan bool),
		running:  false,
	}
}

// Start begins the status cleanup service
func (s *StatusCleanupService) Start(intervalMinutes int) {
	if s.running {
		log.Println("Status cleanup service is already running")
		return
	}

	s.ticker = time.NewTicker(time.Duration(intervalMinutes) * time.Minute)
	s.running = true

	log.Printf("Starting status cleanup service with %d minute intervals", intervalMinutes)

	go func() {
		for {
			select {
			case <-s.ticker.C:
				s.cleanupStaleUsers()
			case <-s.stopChan:
				s.ticker.Stop()
				s.running = false
				log.Println("Status cleanup service stopped")
				return
			}
		}
	}()
}

// Stop stops the status cleanup service
func (s *StatusCleanupService) Stop() {
	if !s.running {
		return
	}
	s.stopChan <- true
}

// cleanupStaleUsers sets users offline if they haven't been seen recently and have no WebSocket connection
func (s *StatusCleanupService) cleanupStaleUsers() {
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
		now := time.Now()
		updates := map[string]interface{}{
			"status":    "offline",
			"is_online": false,
			"last_seen": now,
		}

		if err := database.GetDB().Model(&user).Updates(updates).Error; err != nil {
			log.Printf("Error setting user %s offline: %v", user.Username, err)
			continue
		}

		// Broadcast status change
		statusUpdate := map[string]interface{}{
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
			"reason":       "cleanup_stale",
		}

		hub.BroadcastMessage(statusUpdate)
		cleanedCount++

		log.Printf("Set stale user %s (extension: %s) offline", user.Username, user.Extension)
	}

	if cleanedCount > 0 {
		log.Printf("Status cleanup completed: %d users set offline", cleanedCount)
	}
}

// CleanupStaleActiveCalls deletes abandoned call records so they cannot block
// users with "User is busy". It removes unanswered calls past their ringing
// window and WebRTC calls whose participants no longer have a live WebSocket.
func CleanupStaleActiveCalls() {
	db := database.GetDB()
	if db == nil {
		return
	}

	// Delete unanswered (ringing/initiated) calls older than 90 seconds.
	ringingCutoff := time.Now().Add(-90 * time.Second)
	res := db.Where("status IN ('ringing', 'initiated') AND start_time < ?", ringingCutoff).Delete(&models.ActiveCall{})
	if res.Error == nil && res.RowsAffected > 0 {
		log.Printf("[CLEANUP] Removed %d stale unanswered active call(s)", res.RowsAffected)
	}

	// Delete WebRTC calls whose participants are no longer connected. A WebRTC
	// call requires both parties to have a live WebSocket, so a missing peer
	// means the call is dead.
	hub := websocket.GetHub()
	if hub == nil {
		return
	}

	var calls []models.ActiveCall
	if err := db.Where("channel LIKE ?", "webrtc-call-%").Find(&calls).Error; err != nil {
		log.Printf("[CLEANUP] Error fetching WebRTC active calls: %v", err)
		return
	}

	removed := int64(0)
	for _, call := range calls {
		var caller, callee models.User
		callerFound := db.First(&caller, call.CallerID).Error == nil
		calleeFound := db.First(&callee, call.CalleeID).Error == nil

		callerLive := callerFound && hub.IsExtensionConnected(caller.Extension)
		calleeLive := calleeFound && hub.IsExtensionConnected(callee.Extension)

		if !callerLive || !calleeLive {
			if err := db.Delete(&call).Error; err == nil {
				removed++
				log.Printf("[CLEANUP] Removed WebRTC call %s (%s -> %s), peer disconnected",
					call.Channel, caller.Extension, callee.Extension)
			}
		}
	}

	if removed > 0 {
		log.Printf("[CLEANUP] Removed %d stale WebRTC call(s)", removed)
	}
}

// CleanupDisconnectedUsers immediately cleans up users without WebSocket connections
func (s *StatusCleanupService) CleanupDisconnectedUsers() {
	log.Println("Running immediate cleanup of disconnected users...")

	// Get all users marked as online
	var onlineUsers []models.User
	if err := database.GetDB().Where("status = ? OR is_online = ?", "online", true).Find(&onlineUsers).Error; err != nil {
		log.Printf("Error fetching online users: %v", err)
		return
	}

	hub := websocket.GetHub()
	if hub == nil {
		log.Println("WebSocket hub not available for cleanup")
		return
	}

	cleanedCount := 0
	for _, user := range onlineUsers {
		// Check if user has active WebSocket connection
		if !hub.IsExtensionConnected(user.Extension) {
			// User has no active connection, set them offline
			now := time.Now()
			updates := map[string]interface{}{
				"status":    "offline",
				"is_online": false,
				"last_seen": now,
			}

			if err := database.GetDB().Model(&user).Updates(updates).Error; err != nil {
				log.Printf("Error setting user %s offline: %v", user.Username, err)
				continue
			}

			// Broadcast status change
			statusUpdate := map[string]interface{}{
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
				"reason":       "cleanup_disconnected",
			}

			hub.BroadcastMessage(statusUpdate)
			cleanedCount++

			log.Printf("Set disconnected user %s (extension: %s) offline", user.Username, user.Extension)
		}
	}

	if cleanedCount > 0 {
		log.Printf("Disconnected user cleanup completed: %d users set offline", cleanedCount)
	}
}

// Global instance
var globalCleanupService *StatusCleanupService

// InitStatusCleanup initializes the global status cleanup service
func InitStatusCleanup() {
	globalCleanupService = NewStatusCleanupService()
	// Start with 2-minute intervals
	globalCleanupService.Start(2)
}

// GetStatusCleanupService returns the global cleanup service instance
func GetStatusCleanupService() *StatusCleanupService {
	return globalCleanupService
}

// StopStatusCleanup stops the global status cleanup service
func StopStatusCleanup() {
	if globalCleanupService != nil {
		globalCleanupService.Stop()
	}
}
