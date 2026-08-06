package services

import (
	"log"
	"strings"
	"time"
	"voip-backend/asterisk"
	"voip-backend/database"
	"voip-backend/models"
	"voip-backend/websocket"
)

// StartAMIEventConsumer begins consuming Asterisk AMI events so that call
// state (active_calls / call_logs) stays in sync with the real Asterisk state,
// including calls ended on the Asterisk side (remote hangup, network drop).
func StartAMIEventConsumer() {
	go func() {
		var client *asterisk.AMIClient
		for i := 0; i < 20; i++ {
			client = asterisk.GetAMIClient()
			if client != nil {
				break
			}
			time.Sleep(1 * time.Second)
		}
		if client == nil {
			log.Println("[AMI] Event consumer: AMI client not available, retrying in background")
			return
		}

		events := client.GetEvents()
		log.Println("[AMI] Event consumer started")
		for event := range events {
			handleAMIEvent(event)
		}
		log.Println("[AMI] Event consumer stopped (AMI disconnected)")
	}()
}

func handleAMIEvent(event asterisk.AMIEvent) {
	switch event.Type {
	case "Hangup":
		handleAMIHangup(event)
	case "Bridge":
		if event.Fields["Bridgestate"] == "Link" {
			handleAMIBridge(event)
		}
	}
}

// handleAMIHangup cleans up call state when a channel is hung up.
func handleAMIHangup(event asterisk.AMIEvent) {
	channel := event.Fields["Channel"]
	ext := extensionFromAMIChannel(channel)
	if ext == "" {
		return
	}

	db := database.GetDB()

	var activeCall models.ActiveCall
	if err := db.Where("caller_id IN (SELECT id FROM users WHERE extension = ?) OR callee_id IN (SELECT id FROM users WHERE extension = ?)",
		ext, ext).First(&activeCall).Error; err != nil {
		return
	}

	endTime := time.Now()
	duration := int(endTime.Sub(activeCall.StartTime).Seconds())

	// Only mark the call log as ended once (avoids duplicate notifications).
	result := db.Model(&models.CallLog{}).Where("channel = ? AND status IN ('initiated', 'answered', 'ringing')", activeCall.Channel).
		Updates(map[string]interface{}{
			"status":   "ended",
			"end_time": &endTime,
			"duration": duration,
		})

	db.Delete(&activeCall)

	if result.RowsAffected > 0 {
		log.Printf("[AMI] Hangup event: call on channel %s ended (duration %ds)", activeCall.Channel, duration)
		notifyCallEnded(activeCall)
	}
}

// handleAMIBridge marks a call as connected once both legs are bridged.
func handleAMIBridge(event asterisk.AMIEvent) {
	channel := event.Fields["Channel1"]
	if channel == "" {
		channel = event.Fields["Channel2"]
	}
	ext := extensionFromAMIChannel(channel)
	if ext == "" {
		return
	}

	db := database.GetDB()
	result := db.Model(&models.ActiveCall{}).
		Where("(caller_id IN (SELECT id FROM users WHERE extension = ?) OR callee_id IN (SELECT id FROM users WHERE extension = ?)) AND status = 'ringing'", ext, ext).
		Update("status", "connected")
	if result.RowsAffected > 0 {
		db.Model(&models.CallLog{}).Where("channel = ?", "").
			Where("status = 'initiated'").
			Update("status", "answered")
		log.Printf("[AMI] Bridge event: call involving %s connected", ext)
	}
}

// notifyCallEnded informs both parties of a call that ended on the Asterisk side.
func notifyCallEnded(activeCall models.ActiveCall) {
	hub := websocket.GetHub()
	if hub == nil {
		return
	}

	db := database.GetDB()
	var caller, callee models.User
	db.First(&caller, activeCall.CallerID)
	db.First(&callee, activeCall.CalleeID)

	msg := websocket.Message{
		Type:    "call_ended",
		Channel: activeCall.Channel,
		Status:  "ended",
	}
	if caller.Extension != "" {
		hub.SendToExtension(caller.Extension, msg)
	}
	if callee.Extension != "" {
		hub.SendToExtension(callee.Extension, msg)
	}
}

// extensionFromAMIChannel extracts a numeric extension from an AMI channel
// such as "PJSIP/1001-00000001" or "SIP/1001-00000001".
func extensionFromAMIChannel(channel string) string {
	idx := strings.Index(channel, "/")
	if idx < 0 {
		return ""
	}
	rest := channel[idx+1:]
	if dash := strings.Index(rest, "-"); dash >= 0 {
		rest = rest[:dash]
	}
	if len(rest) >= 3 && len(rest) <= 6 {
		for _, r := range rest {
			if r < '0' || r > '9' {
				return ""
			}
		}
		return rest
	}
	return ""
}
