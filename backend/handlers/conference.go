package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"time"
	"voip-backend/asterisk"
	"voip-backend/database"
	"voip-backend/middleware"
	"voip-backend/models"
	"voip-backend/websocket"

	"github.com/gin-gonic/gin"
)

func CreateConference(c *gin.Context) {
	userID, _, extension, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	var req models.CreateConferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	roomNum := fmt.Sprintf("conf%d", time.Now().Unix()%100000)

	db := database.GetDB()
	conf := models.Conference{
		RoomNum:   roomNum,
		Name:      req.Name,
		CreatedBy: userID,
		Status:    "active",
	}

	if err := db.Create(&conf).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create conference"})
		return
	}

	db.Preload("Creator").First(&conf, conf.ID)

	hub := websocket.GetHub()
	if hub != nil {
		hub.BroadcastMessage(websocket.Message{
			Type:      "conference_created",
			From:      extension,
			Data:      conf,
			Timestamp: time.Now().Unix(),
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "conference": conf})
}

func ListConferences(c *gin.Context) {
	db := database.GetDB()
	var conferences []models.Conference
	db.Where("status = ?", "active").Order("created_at desc").Preload("Creator").Find(&conferences)

	c.JSON(http.StatusOK, gin.H{"success": true, "conferences": conferences})
}

func GetConference(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid conference ID"})
		return
	}

	db := database.GetDB()
	var conf models.Conference
	if err := db.Preload("Creator").First(&conf, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Conference not found"})
		return
	}

	var participants []models.ConferenceParticipant
	db.Where("conference_id = ? AND is_active = ?", id, true).Preload("User").Find(&participants)

	c.JSON(http.StatusOK, gin.H{"success": true, "conference": conf, "participants": participants})
}

func JoinConference(c *gin.Context) {
	userID, _, extension, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	var req models.JoinConferenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	db := database.GetDB()
	var conf models.Conference
	if err := db.Where("room_num = ? AND status = ?", req.RoomNum, "active").First(&conf).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Conference not found or ended"})
		return
	}

	channel, err := asterisk.JoinConference(extension, req.RoomNum)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": fmt.Sprintf("Failed to join conference: %v", err)})
		return
	}

	participant := models.ConferenceParticipant{
		ConferenceID: conf.ID,
		UserID:       userID,
		Channel:      channel,
		IsActive:     true,
	}
	db.Create(&participant)

	hub := websocket.GetHub()
	if hub != nil {
		hub.BroadcastMessage(websocket.Message{
			Type:      "conference_joined",
			From:      extension,
			Data:      gin.H{"conference_id": conf.ID, "room_num": req.RoomNum},
			Timestamp: time.Now().Unix(),
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "participant": participant, "channel": channel})
}

func LeaveConference(c *gin.Context) {
	userID, _, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid conference ID"})
		return
	}

	db := database.GetDB()
	var participant models.ConferenceParticipant
	if err := db.Where("conference_id = ? AND user_id = ? AND is_active = ?", id, userID, true).First(&participant).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Not a participant in this conference"})
		return
	}

	if participant.Channel != "" {
		asterisk.KickParticipant(participant.Channel)
	}

	now := time.Now()
	db.Model(&participant).Updates(map[string]interface{}{
		"is_active": false,
		"left_at":   &now,
	})

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Left conference"})
}

func EndConference(c *gin.Context) {
	userID, _, _, _, ok := middleware.GetUserFromContext(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Not authenticated"})
		return
	}

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid conference ID"})
		return
	}

	db := database.GetDB()
	var conf models.Conference
	if err := db.First(&conf, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Conference not found"})
		return
	}

	if conf.CreatedBy != userID {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Only the creator can end the conference"})
		return
	}

	var participants []models.ConferenceParticipant
	db.Where("conference_id = ? AND is_active = ?", id, true).Find(&participants)
	for _, p := range participants {
		if p.Channel != "" {
			asterisk.KickParticipant(p.Channel)
		}
		now := time.Now()
		db.Model(&p).Updates(map[string]interface{}{"is_active": false, "left_at": &now})
	}

	db.Model(&conf).Update("status", "ended")

	hub := websocket.GetHub()
	if hub != nil {
		hub.BroadcastMessage(websocket.Message{
			Type:      "conference_ended",
			Data:      gin.H{"conference_id": id, "room_num": conf.RoomNum},
			Timestamp: time.Now().Unix(),
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Conference ended"})
}
