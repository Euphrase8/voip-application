package handlers

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"
	"voip-backend/database"
	"voip-backend/models"
	"voip-backend/websocket"

	"github.com/gin-gonic/gin"
)

const voicemailDir = "./voicemails"

func ensureVoicemailDir() {
	os.MkdirAll(voicemailDir, 0755)
}

func CreateVoicemail(c *gin.Context) {
	ensureVoicemailDir()

	calleeID, err := strconv.ParseUint(c.PostForm("callee_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid callee ID"})
		return
	}

	callerNumber := c.PostForm("caller_number")
	durationStr := c.PostForm("duration")
	duration := 0
	if durationStr != "" {
		duration, _ = strconv.Atoi(durationStr)
	}

	file, err := c.FormFile("audio")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Audio file required"})
		return
	}

	filename := fmt.Sprintf("voicemail_%d_%d.wav", calleeID, time.Now().Unix())
	filePath := filepath.Join(voicemailDir, filename)

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to open file"})
		return
	}
	defer src.Close()

	dst, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save file"})
		return
	}
	defer dst.Close()

	io.Copy(dst, src)

	db := database.GetDB()
	vm := models.Voicemail{
		CalleeID:     uint(calleeID),
		CallerNumber: callerNumber,
		Duration:     duration,
		FilePath:     filePath,
	}

	if callerIDStr := c.PostForm("caller_id"); callerIDStr != "" {
		if cid, err := strconv.ParseUint(callerIDStr, 10, 64); err == nil {
			vm.CallerID = uint(cid)
		}
	}

	if err := db.Create(&vm).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save voicemail"})
		return
	}

	db.Preload("Caller").Preload("Callee").First(&vm, vm.ID)

	hub := websocket.GetHub()
	if hub != nil {
		var callee models.User
		if err := db.First(&callee, calleeID).Error; err == nil {
			wsMsg := websocket.Message{
				Type:      "voicemail_new",
				To:        callee.Extension,
				Data:      vm,
				Timestamp: time.Now().Unix(),
			}
			hub.SendToExtension(callee.Extension, wsMsg)
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "voicemail": vm})
}

func GetVoicemails(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var voicemails []models.Voicemail
	db.Where("callee_id = ?", userID).Order("created_at desc").Preload("Caller").Find(&voicemails)

	c.JSON(http.StatusOK, gin.H{"success": true, "voicemails": voicemails})
}

func GetVoicemail(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid voicemail ID"})
		return
	}

	db := database.GetDB()
	var vm models.Voicemail
	if err := db.Where("id = ? AND callee_id = ?", id, userID).Preload("Caller").First(&vm).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "voicemail": vm})
}

func MarkVoicemailRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid voicemail ID"})
		return
	}

	db := database.GetDB()
	now := time.Now()
	result := db.Model(&models.Voicemail{}).Where("id = ? AND callee_id = ?", id, userID).
		Updates(map[string]interface{}{
			"is_read": true,
			"read_at": &now,
		})

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Voicemail marked as read"})
}

func DeleteVoicemail(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid voicemail ID"})
		return
	}

	db := database.GetDB()
	var vm models.Voicemail
	if err := db.Where("id = ? AND callee_id = ?", id, userID).First(&vm).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	os.Remove(vm.FilePath)
	db.Delete(&vm)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Voicemail deleted"})
}

func GetVoicemailAudio(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid voicemail ID"})
		return
	}

	db := database.GetDB()
	var vm models.Voicemail
	if err := db.First(&vm, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	c.File(vm.FilePath)
}

func GetVoicemailUnreadCount(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var count int64
	db.Model(&models.Voicemail{}).Where("callee_id = ? AND is_read = ?", userID, false).Count(&count)

	c.JSON(http.StatusOK, gin.H{"success": true, "unread_count": count})
}

func GetMissedCalls(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var missedCalls []models.MissedCall
	db.Where("callee_id = ?", userID).Order("created_at desc").Preload("Caller").Find(&missedCalls)

	db.Model(&models.MissedCall{}).Where("callee_id = ? AND is_notified = ?", userID, false).Update("is_notified", true)

	c.JSON(http.StatusOK, gin.H{"success": true, "missed_calls": missedCalls})
}

func RecordMissedCall(c *gin.Context) {
	var req models.CreateVoicemailRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	db := database.GetDB()
	mc := models.MissedCall{
		CallerID:     req.CallerID,
		CalleeID:     req.CalleeID,
		CallerNumber: req.CallerNumber,
	}

	if err := db.Create(&mc).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to record missed call"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "missed_call": mc})
}

func UploadVoicemailGreeting(c *gin.Context) {
	userID, _ := c.Get("user_id")
	ensureVoicemailDir()

	file, err := c.FormFile("greeting")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Greeting audio file required"})
		return
	}

	filename := fmt.Sprintf("greeting_%d.wav", userID)
	filePath := filepath.Join(voicemailDir, filename)

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to open file"})
		return
	}
	defer src.Close()

	dst, err := os.Create(filePath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save file"})
		return
	}
	defer dst.Close()

	io.Copy(dst, src)

	db := database.GetDB()
	var greeting models.VoicemailGreeting
	result := db.Where("user_id = ?", userID).First(&greeting)

	if result.Error != nil {
		greeting = models.VoicemailGreeting{
			UserID:   userID.(uint),
			FilePath: filePath,
			IsActive: true,
		}
		db.Create(&greeting)
	} else {
		os.Remove(greeting.FilePath)
		db.Model(&greeting).Updates(map[string]interface{}{
			"file_path": filePath,
			"is_active": true,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "greeting": greeting})
}

func GetVoicemailGreeting(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var greeting models.VoicemailGreeting
	if err := db.Where("user_id = ? AND is_active = ?", userID, true).First(&greeting).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "No greeting found"})
		return
	}

	c.File(greeting.FilePath)
}
