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
	"gorm.io/gorm"
)

const voicemailDir = "./voicemails"

func ensureVoicemailDir() {
	os.MkdirAll(voicemailDir, 0755)
}

func CreateVoicemail(c *gin.Context) {
	ensureVoicemailDir()

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 25<<20)

	calleeID, err := strconv.ParseUint(c.PostForm("callee_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid callee ID"})
		return
	}

	callerNumber := c.PostForm("caller_number")
	senderName := c.PostForm("sender_name")
	senderExtension := c.PostForm("sender_extension")
	recipientName := c.PostForm("recipient_name")
	recipientExtension := c.PostForm("recipient_extension")
	callType := c.PostForm("call_type")
	durationStr := c.PostForm("duration")
	duration := 0
	if durationStr != "" {
		duration, _ = strconv.Atoi(durationStr)
	}

	fileSize := int64(0)
	var filePath string

	file, err := c.FormFile("audio")
	if err == nil {
		filename := fmt.Sprintf("voicemail_%d_%d.wav", calleeID, time.Now().Unix())
		filePath = filepath.Join(voicemailDir, filename)
		fileSize = file.Size

		src, openErr := file.Open()
		if openErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to open file"})
			return
		}
		defer src.Close()

		dst, createErr := os.Create(filePath)
		if createErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save file"})
			return
		}
		defer dst.Close()

		io.Copy(dst, src)
	}

	db := database.GetDB()
	vm := models.Voicemail{
		CalleeID:           uint(calleeID),
		CallerNumber:       callerNumber,
		SenderName:         senderName,
		SenderExtension:    senderExtension,
		RecipientName:      recipientName,
		RecipientExtension: recipientExtension,
		Duration:           duration,
		FileSize:           fileSize,
		FilePath:           filePath,
		PlaybackCount:      0,
		IsRead:             false,
	}

	if callType != "" {
		vm.CallType = callType
	}

	if callerIDStr := c.PostForm("caller_id"); callerIDStr != "" {
		if cid, parseErr := strconv.ParseUint(callerIDStr, 10, 64); parseErr == nil {
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
			if callee.Extension != "" {
				hub.SendToExtension(callee.Extension, wsMsg)
			}
			// Also notify the sender about sent voicemail
			var caller models.User
			if vm.CallerID > 0 {
				if err := db.First(&caller, vm.CallerID).Error; err == nil && caller.Extension != "" {
					wsMsgSent := websocket.Message{
						Type:      "voicemail_sent",
						Data:      vm,
						Timestamp: time.Now().Unix(),
					}
					hub.SendToExtension(caller.Extension, wsMsgSent)
				}
			}
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

func SearchVoicemails(c *gin.Context) {
	userID, _ := c.Get("user_id")
	query := c.Query("q")
	sender := c.Query("sender")
	dateFrom := c.Query("date_from")
	dateTo := c.Query("date_to")
	sortOrder := c.Query("sort_order")

	db := database.GetDB()
	tx := db.Where("callee_id = ?", userID)

	if query != "" {
		like := "%" + query + "%"
		tx = tx.Where("sender_name LIKE ? OR sender_extension LIKE ? OR caller_number LIKE ?", like, like, like)
	}
	if sender != "" {
		tx = tx.Where("sender_name LIKE ?", "%"+sender+"%")
	}
	if dateFrom != "" {
		if t, err := time.Parse("2006-01-02", dateFrom); err == nil {
			tx = tx.Where("created_at >= ?", t)
		}
	}
	if dateTo != "" {
		if t, err := time.Parse("2006-01-02", dateTo); err == nil {
			tx = tx.Where("created_at <= ?", t.Add(24*time.Hour))
		}
	}

	if sortOrder == "asc" {
		tx = tx.Order("created_at asc")
	} else {
		tx = tx.Order("created_at desc")
	}

	var voicemails []models.Voicemail
	tx.Preload("Caller").Find(&voicemails)

	c.JSON(http.StatusOK, gin.H{"success": true, "voicemails": voicemails})
}

func GetSentVoicemails(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var voicemails []models.Voicemail
	db.Where("caller_id = ?", userID).Order("created_at desc").Preload("Callee").Find(&voicemails)

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
			"is_read":      true,
			"read_at":      &now,
			"playback_count": gorm.Expr("playback_count + 1"),
		})

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Voicemail marked as read"})
}

func MarkVoicemailUnread(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid voicemail ID"})
		return
	}

	db := database.GetDB()
	result := db.Model(&models.Voicemail{}).Where("id = ? AND callee_id = ?", id, userID).
		Updates(map[string]interface{}{
			"is_read": false,
			"read_at": nil,
		})

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Voicemail marked as unread"})
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
	if err := db.Where("id = ? AND (callee_id = ? OR caller_id = ?)", id, userID, userID).First(&vm).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	if vm.FilePath != "" {
		os.Remove(vm.FilePath)
	}
	db.Delete(&vm)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Voicemail deleted"})
}

func GetVoicemailAudio(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid voicemail ID"})
		return
	}

	db := database.GetDB()
	var vm models.Voicemail
	if err := db.Where("id = ? AND (callee_id = ? OR caller_id = ?)", id, userID, userID).First(&vm).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	c.File(vm.FilePath)
}

func DownloadVoicemail(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid voicemail ID"})
		return
	}

	db := database.GetDB()
	var vm models.Voicemail
	if err := db.Where("id = ? AND (callee_id = ? OR caller_id = ?)", id, userID, userID).First(&vm).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Voicemail not found"})
		return
	}

	filename := fmt.Sprintf("voicemail_%s_%s.wav", vm.SenderExtension, vm.CreatedAt.Format("20060102_150405"))
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))
	c.Header("Content-Type", "audio/wav")
	c.File(vm.FilePath)
}

func GetVoicemailUnreadCount(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var count int64
	db.Model(&models.Voicemail{}).Where("callee_id = ? AND is_read = ?", userID, false).Count(&count)

	c.JSON(http.StatusOK, gin.H{"success": true, "unread_count": count})
}

func IncrementPlaybackCount(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid voicemail ID"})
		return
	}

	db := database.GetDB()
	db.Model(&models.Voicemail{}).Where("id = ? AND callee_id = ?", id, userID).
		UpdateColumn("playback_count", gorm.Expr("playback_count + 1"))

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Playback count updated"})
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
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 5<<20)

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

func UpdateVoicemailSettings(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req struct {
		GreetingEnabled *bool `json:"greeting_enabled"`
		NotifyByEmail   *bool `json:"notify_by_email"`
		NotifyBySMS     *bool `json:"notify_by_sms"`
		MaxDuration     *int  `json:"max_duration"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	db := database.GetDB()
	var settings models.VoicemailSettings
	result := db.Where("user_id = ?", userID).First(&settings)

	updates := map[string]interface{}{}
	if result.Error != nil {
		settings = models.VoicemailSettings{
			UserID: userID.(uint),
		}
	}

	if req.GreetingEnabled != nil {
		updates["greeting_enabled"] = *req.GreetingEnabled
	}
	if req.NotifyByEmail != nil {
		updates["notify_by_email"] = *req.NotifyByEmail
	}
	if req.NotifyBySMS != nil {
		updates["notify_by_sms"] = *req.NotifyBySMS
	}
	if req.MaxDuration != nil {
		updates["max_duration"] = *req.MaxDuration
	}

	if result.Error != nil {
		settings.GreetingEnabled = true
		settings.NotifyByEmail = true
		settings.MaxDuration = 60
		for k, v := range updates {
			switch k {
			case "greeting_enabled":
				settings.GreetingEnabled = v.(bool)
			case "notify_by_email":
				settings.NotifyByEmail = v.(bool)
			case "notify_by_sms":
				settings.NotifyBySMS = v.(bool)
			case "max_duration":
				settings.MaxDuration = v.(int)
			}
		}
		db.Create(&settings)
	} else {
		db.Model(&settings).Updates(updates)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "settings": settings})
}

func GetVoicemailSettings(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var settings models.VoicemailSettings
	if err := db.Where("user_id = ?", userID).First(&settings).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"settings": models.VoicemailSettings{
				UserID:          userID.(uint),
				GreetingEnabled: true,
				NotifyByEmail:   true,
				MaxDuration:     60,
			},
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "settings": settings})
}

func DeleteVoicemailGreeting(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var greeting models.VoicemailGreeting
	if err := db.Where("user_id = ?", userID).First(&greeting).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "No greeting found"})
		return
	}

	os.Remove(greeting.FilePath)
	db.Delete(&greeting)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Voicemail greeting deleted"})
}
