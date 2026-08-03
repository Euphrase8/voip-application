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
	"voip-backend/security"
	"voip-backend/websocket"

	"github.com/gin-gonic/gin"
)

const messageVoiceDir = "./message_voice"

func ensureMessageVoiceDir() {
	os.MkdirAll(messageVoiceDir, 0755)
}

func SendMessage(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req models.SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	req.Content = security.SanitizeMessage(req.Content)
	if req.Content == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Message content cannot be empty"})
		return
	}

	db := database.GetDB()

	// Idempotency: if the client already submitted this message (same client_message_id),
	// return the existing row instead of inserting a duplicate.
	if req.ClientMessageID != "" {
		var existing models.Message
		if err := db.Where("sender_id = ? AND client_message_id = ?", userID, req.ClientMessageID).
			First(&existing).Error; err == nil {
			db.Preload("Sender").First(&existing, existing.ID)
			c.JSON(http.StatusOK, gin.H{"success": true, "message": existing, "duplicate": true})
			return
		}
	}

	msgType := "text"
	if req.MsgType != "" {
		msgType = req.MsgType
	}

	msg := models.Message{
		SenderID:        userID.(uint),
		ReceiverID:      req.ReceiverID,
		Content:         req.Content,
		MsgType:         msgType,
		ClientMessageID: req.ClientMessageID,
	}

	// Optional reply-to: store a reference to the quoted parent message. Only a
	// message that still exists and belongs to the same conversation is accepted.
	if req.ReplyToID != 0 {
		var parent models.Message
		if err := db.Where("id = ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))",
			req.ReplyToID, userID, req.ReceiverID, req.ReceiverID, userID,
		).First(&parent).Error; err == nil {
			msg.ReplyToID = &parent.ID
		}
	}

	if err := db.Create(&msg).Error; err != nil {
		// Race-safe fallback: a concurrent request with the same client_message_id
		// may have created the row between our check and insert.
		if req.ClientMessageID != "" {
			var existing models.Message
			if e2 := db.Where("sender_id = ? AND client_message_id = ?", userID, req.ClientMessageID).
				First(&existing).Error; e2 == nil {
				db.Preload("Sender").First(&existing, existing.ID)
				c.JSON(http.StatusOK, gin.H{"success": true, "message": existing, "duplicate": true})
				return
			}
		}
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to send message"})
		return
	}

	db.Preload("Sender").Preload("ReplyTo.Sender").First(&msg, msg.ID)

	hub := websocket.GetHub()
	var sender models.User
	db.First(&sender, msg.SenderID)

	delivered := false
	if hub != nil {
		var receiver models.User
		if err := db.First(&receiver, req.ReceiverID).Error; err == nil {
			// Deliver to the receiver and confirm delivery if they are online.
			delivered = pushChatMessage(msg, receiver.Extension)
			if delivered {
				now := time.Now()
				msg.DeliveredAt = &now
				db.Model(&models.Message{}).Where("id = ?", msg.ID).Update("delivered_at", now)
				pushMessageDelivered(msg, sender.Extension, receiver.Extension)
			}
		}

		// Acknowledge to the sender so their optimistic message resolves.
		pushMessageSent(msg, sender.Extension)
	}

	updateConversation(userID.(uint), req.ReceiverID, req.Content, msg.CreatedAt)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": msg, "delivered": delivered})
}

// pushChatMessage forwards a new message to the receiver. Returns true when at
// least one of the receiver's clients accepted the frame (i.e. delivered).
func pushChatMessage(msg models.Message, receiverExtension string) bool {
	hub := websocket.GetHub()
	if hub == nil {
		return false
	}
	wsMsg := websocket.Message{
		Type:      "chat_message",
		From:      strconv.FormatUint(uint64(msg.SenderID), 10),
		To:        strconv.FormatUint(uint64(msg.ReceiverID), 10),
		Data:      msg,
		Timestamp: msg.CreatedAt.Unix(),
	}
	return hub.SendToExtension(receiverExtension, wsMsg) == nil
}

// pushMessageSent acknowledges a sent message back to the sender.
func pushMessageSent(msg models.Message, senderExtension string) {
	hub := websocket.GetHub()
	if hub == nil {
		return
	}
	confirmation := websocket.Message{
		Type:      "chat_message_sent",
		From:      senderExtension,
		Data:      msg,
		Timestamp: msg.CreatedAt.Unix(),
	}
	hub.SendToExtension(senderExtension, confirmation)
}

// pushMessageDelivered notifies the sender that the receiver received the message.
func pushMessageDelivered(msg models.Message, senderExtension, receiverExtension string) {
	hub := websocket.GetHub()
	if hub == nil {
		return
	}
	delivery := websocket.Message{
		Type: "chat_message_delivered",
		From: receiverExtension,
		To:   senderExtension,
		Data: gin.H{
			"message_id":   msg.ID,
			"receiver_id":  msg.ReceiverID,
			"delivered_at": msg.DeliveredAt,
		},
		Timestamp: time.Now().Unix(),
	}
	hub.SendToExtension(senderExtension, delivery)
}

// notifyMessagesRead tells the original sender that readerID read their messages.
func notifyMessagesRead(readerID, senderID uint) {
	hub := websocket.GetHub()
	if hub == nil {
		return
	}

	db := database.GetDB()
	var reader, sender models.User
	if err := db.First(&reader, readerID).Error; err != nil {
		return
	}
	if err := db.First(&sender, senderID).Error; err != nil {
		return
	}

	readMsg := websocket.Message{
		Type: "chat_message_read",
		From: reader.Extension,
		To:   sender.Extension,
		Data: gin.H{
			"reader_id":        readerID,
			"reader_extension": reader.Extension,
			"read_at":          time.Now(),
		},
		Timestamp: time.Now().Unix(),
	}
	hub.SendToExtension(sender.Extension, readMsg)
}

// MarkDeliveredOnConnect marks any undelivered messages addressed to an extension
// as delivered once that user connects, and notifies the senders in real time.
// It is wired as the hub's OnUserConnect callback in main.go.
func MarkDeliveredOnConnect(extension string) {
	if extension == "" {
		return
	}

	db := database.GetDB()
	var receiver models.User
	if err := db.Where("extension = ?", extension).First(&receiver).Error; err != nil {
		return
	}

	var pending []models.Message
	db.Where("receiver_id = ? AND delivered_at IS NULL", receiver.ID).Find(&pending)
	if len(pending) == 0 {
		return
	}

	now := time.Now()
	db.Model(&models.Message{}).
		Where("receiver_id = ? AND delivered_at IS NULL", receiver.ID).
		Update("delivered_at", now)

	hub := websocket.GetHub()
	if hub == nil {
		return
	}

	senderIDs := make(map[uint]bool)
	for _, m := range pending {
		senderIDs[m.SenderID] = true
	}

	for senderID := range senderIDs {
		var sender models.User
		if err := db.First(&sender, senderID).Error; err != nil {
			continue
		}
		delivery := websocket.Message{
			Type: "chat_message_delivered",
			From: extension,
			To:   sender.Extension,
			Data: gin.H{
				"receiver_id":        receiver.ID,
				"receiver_extension": extension,
				"delivered_at":       now,
				"bulk":               true,
			},
			Timestamp: now.Unix(),
		}
		hub.SendToExtension(sender.Extension, delivery)
	}
}

func GetMessages(c *gin.Context) {
	userID, _ := c.Get("user_id")
	otherID, err := strconv.ParseUint(c.Param("userId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid user ID"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	db := database.GetDB()
	var messages []models.Message
	var totalCount int64

	db.Model(&models.Message{}).Where(
		"(sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)",
		userID, otherID, otherID, userID,
	).Count(&totalCount)

	db.Where(
		"(sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)",
		userID, otherID, otherID, userID,
	).Order("created_at asc").Limit(limit).Offset(offset).Preload("Sender").Preload("ReplyTo.Sender").Find(&messages)

	res := db.Model(&models.Message{}).Where(
		"sender_id = ? AND receiver_id = ? AND is_read = ?",
		otherID, userID, false,
	).Updates(map[string]interface{}{
		"is_read": true,
		"read_at": time.Now(),
	})
	if res.RowsAffected > 0 {
		// Let the sender know their messages were read.
		notifyMessagesRead(userID.(uint), uint(otherID))
	}

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"messages":    messages,
		"total":       totalCount,
		"page":        page,
		"limit":       limit,
		"total_pages": (int(totalCount) + limit - 1) / limit,
	})
}

func GetConversations(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var conversations []models.ChatConversation
	db.Where("user1_id = ? OR user2_id = ?", userID, userID).
		Order("updated_at desc").
		Preload("User1").Preload("User2").
		Find(&conversations)

	results := make([]gin.H, 0)
	for _, conv := range conversations {
		var otherUser models.User
		if conv.User1ID == userID {
			otherUser = conv.User2
		} else {
			otherUser = conv.User1
		}

		var unreadCount int64
		db.Model(&models.Message{}).Where(
			"sender_id = ? AND receiver_id = ? AND is_read = ?",
			otherUser.ID, userID, false,
		).Count(&unreadCount)

		results = append(results, gin.H{
			"conversation_id": conv.ID,
			"user":            otherUser,
			"last_message":    conv.LastMessage,
			"last_message_at": conv.LastMessageAt,
			"unread_count":    unreadCount,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "conversations": results})
}

func GetUnreadCount(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var count int64
	db.Model(&models.Message{}).Where("receiver_id = ? AND is_read = ?", userID, false).Count(&count)

	c.JSON(http.StatusOK, gin.H{"success": true, "unread_count": count})
}

func MarkAsRead(c *gin.Context) {
	userID, _ := c.Get("user_id")
	senderID, err := strconv.ParseUint(c.Param("senderId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid sender ID"})
		return
	}

	db := database.GetDB()
	res := db.Model(&models.Message{}).Where(
		"sender_id = ? AND receiver_id = ? AND is_read = ?",
		senderID, userID, false,
	).Updates(map[string]interface{}{
		"is_read": true,
		"read_at": time.Now(),
	})
	if res.RowsAffected > 0 {
		// Notify the sender so their UI updates to "read".
		notifyMessagesRead(userID.(uint), uint(senderID))
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Messages marked as read"})
}

// DeleteMessage soft-deletes a message. Only the original sender (or an admin)
// may delete it. Both the sender and receiver are notified in real time and the
// conversation preview is recomputed from the remaining messages.
func DeleteMessage(c *gin.Context) {
	userID, _ := c.Get("user_id")
	role, _ := c.Get("role")

	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid message ID"})
		return
	}

	db := database.GetDB()
	var msg models.Message
	if err := db.First(&msg, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Message not found"})
		return
	}

	// Authorization: only the sender or an admin can delete a message.
	if msg.SenderID != userID.(uint) && role != "admin" {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "You can only delete your own messages"})
		return
	}

	if err := db.Delete(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to delete message"})
		return
	}

	// Remove the stored audio file for voice messages.
	if msg.MsgType == "voice" && msg.FilePath != "" {
		if safePath, err := security.SafeFilePath(messageVoiceDir, msg.FilePath); err == nil {
			os.Remove(safePath)
		}
	}

	// Recompute the conversation's last-message preview from surviving messages.
	convData := refreshConversationLastMessage(msg.SenderID, msg.ReceiverID)

	// Notify both users immediately so the message disappears without a refresh.
	pushMessageDeleted(msg, convData)

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"message_id":   msg.ID,
		"conversation": convData,
	})
}

func CreateGroup(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req models.CreateGroupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	db := database.GetDB()
	group := models.ChatGroup{
		Name:      req.Name,
		CreatedBy: userID.(uint),
	}

	if err := db.Create(&group).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to create group"})
		return
	}

	members := append(req.Members, userID.(uint))
	for _, memberID := range members {
		db.Create(&models.ChatGroupMember{
			GroupID: group.ID,
			UserID:  memberID,
			Role:    "member",
		})
	}

	db.Model(&models.ChatGroupMember{}).Where("group_id = ? AND user_id = ?", group.ID, userID).
		Update("role", "admin")

	c.JSON(http.StatusOK, gin.H{"success": true, "group": group})
}

func SendGroupMessage(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req models.SendGroupMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	msg := models.ChatGroupMessage{
		GroupID:  req.GroupID,
		SenderID: userID.(uint),
		Content:  security.SanitizeMessage(req.Content),
	}

	db := database.GetDB()
	if err := db.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to send message"})
		return
	}

	db.Preload("Sender").First(&msg, msg.ID)

	hub := websocket.GetHub()
	if hub != nil {
		var members []models.ChatGroupMember
		db.Where("group_id = ?", req.GroupID).Find(&members)

		for _, member := range members {
			var user models.User
			if err := db.First(&user, member.UserID).Error; err == nil {
				wsMsg := websocket.Message{
					Type:      "chat_group_message",
					From:      strconv.FormatUint(uint64(userID.(uint)), 10),
					Data:      msg,
					Timestamp: time.Now().Unix(),
				}
				hub.SendToExtension(user.Extension, wsMsg)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": msg})
}

func GetGroupMessages(c *gin.Context) {
	groupID, err := strconv.ParseUint(c.Param("groupId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid group ID"})
		return
	}

	db := database.GetDB()
	var messages []models.ChatGroupMessage
	db.Where("group_id = ?", groupID).Order("created_at asc").Preload("Sender").Find(&messages)

	c.JSON(http.StatusOK, gin.H{"success": true, "messages": messages})
}

func GetUserGroups(c *gin.Context) {
	userID, _ := c.Get("user_id")

	db := database.GetDB()
	var memberships []models.ChatGroupMember
	db.Where("user_id = ?", userID).Find(&memberships)

	groupIDs := make([]uint, 0)
	for _, m := range memberships {
		groupIDs = append(groupIDs, m.GroupID)
	}

	var groups []models.ChatGroup
	if len(groupIDs) > 0 {
		db.Where("id IN ?", groupIDs).Find(&groups)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "groups": groups})
}

func SendVoiceMessage(c *gin.Context) {
	// Limit request body to 10MB
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 10<<20)

	userID, _ := c.Get("user_id")
	ensureMessageVoiceDir()

	receiverID, err := strconv.ParseUint(c.PostForm("receiver_id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid receiver ID"})
		return
	}

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

	filename := fmt.Sprintf("voice_%d_%d_%d.webm", userID.(uint), receiverID, time.Now().Unix())
	filePath := filepath.Join(messageVoiceDir, filename)

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

	written, _ := io.Copy(dst, src)

	msg := models.Message{
		SenderID:   userID.(uint),
		ReceiverID: uint(receiverID),
		Content:    "[Voice Message]",
		MsgType:    "voice",
		FilePath:   filePath,
		FileName:   filename,
		FileSize:   written,
		Duration:   duration,
	}

	db := database.GetDB()
	if err := db.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to save voice message"})
		return
	}

	db.Preload("Sender").First(&msg, msg.ID)

	hub := websocket.GetHub()
	var sender models.User
	db.First(&sender, msg.SenderID)

	if hub != nil {
		var receiver models.User
		if err := db.First(&receiver, receiverID).Error; err == nil {
			delivered := pushChatMessage(msg, receiver.Extension)
			if delivered {
				now := time.Now()
				msg.DeliveredAt = &now
				db.Model(&models.Message{}).Where("id = ?", msg.ID).Update("delivered_at", now)
				pushMessageDelivered(msg, sender.Extension, receiver.Extension)
			}
		}
		pushMessageSent(msg, sender.Extension)
	}

	updateConversation(userID.(uint), uint(receiverID), msg.Content, msg.CreatedAt)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": msg})
}

func GetVoiceMessageAudio(c *gin.Context) {
	userID, _ := c.Get("user_id")
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid message ID"})
		return
	}

	db := database.GetDB()
	var msg models.Message
	if err := db.Where("id = ? AND (sender_id = ? OR receiver_id = ?)", id, userID, userID).First(&msg).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"success": false, "error": "Message not found"})
		return
	}

	if msg.MsgType != "voice" || msg.FilePath == "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Not a voice message"})
		return
	}

	safePath, err := security.SafeFilePath(messageVoiceDir, msg.FilePath)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "error": "Access denied"})
		return
	}
	c.File(safePath)
}

func updateConversation(user1ID, user2ID uint, lastMessage string, lastMsgAt time.Time) {
	db := database.GetDB()
	var conv models.ChatConversation

	result := db.Where(
		"(user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)",
		user1ID, user2ID, user2ID, user1ID,
	).First(&conv)

	if result.Error != nil {
		conv = models.ChatConversation{
			User1ID:      user1ID,
			User2ID:      user2ID,
			LastMessage:  lastMessage,
			LastSenderID: user1ID,
			LastMessageAt: &lastMsgAt,
		}
		db.Create(&conv)
	} else {
		db.Model(&conv).Updates(map[string]interface{}{
			"last_message":   lastMessage,
			"last_sender_id": user1ID,
			"last_message_at": &lastMsgAt,
		})
	}
}

// refreshConversationLastMessage recomputes the denormalized conversation preview
// from the latest non-deleted message between the two users, clearing it when no
// messages remain. Returns the preview data (empty map when no conversation exists).
func refreshConversationLastMessage(user1ID, user2ID uint) gin.H {
	db := database.GetDB()
	var conv models.ChatConversation

	result := db.Where(
		"(user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)",
		user1ID, user2ID, user2ID, user1ID,
	).First(&conv)
	if result.Error != nil {
		return gin.H{}
	}

	var last models.Message
	err := db.Where(
		"(sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)",
		user1ID, user2ID, user2ID, user1ID,
	).Order("created_at desc, id desc").First(&last).Error

	if err != nil {
		// No messages left between these users: clear the preview.
		db.Model(&conv).Select("last_message", "last_sender_id", "last_message_at").
			Updates(map[string]interface{}{
				"last_message":    "",
				"last_sender_id":  nil,
				"last_message_at": nil,
			})
		return gin.H{
			"last_message":    "",
			"last_message_at": nil,
			"last_sender_id":  nil,
		}
	}

	db.Model(&conv).Select("last_message", "last_sender_id", "last_message_at").
		Updates(map[string]interface{}{
			"last_message":    last.Content,
			"last_sender_id":  last.SenderID,
			"last_message_at": last.CreatedAt,
		})
	return gin.H{
		"last_message":    last.Content,
		"last_message_at": last.CreatedAt,
		"last_sender_id":  last.SenderID,
	}
}

// pushMessageDeleted broadcasts a deletion to both the sender and the receiver so
// both chat windows update instantly. The recomputed conversation preview is
// embedded so the conversation list can be updated without an extra request.
func pushMessageDeleted(msg models.Message, convData gin.H) {
	hub := websocket.GetHub()
	if hub == nil {
		return
	}

	db := database.GetDB()
	var sender, receiver models.User
	db.First(&sender, msg.SenderID)
	db.First(&receiver, msg.ReceiverID)

	deletedMsg := websocket.Message{
		Type: "chat_message_deleted",
		Data: gin.H{
			"message_id":   msg.ID,
			"sender_id":    msg.SenderID,
			"receiver_id":  msg.ReceiverID,
			"deleted_by":   msg.SenderID,
			"conversation": convData,
		},
		Timestamp: time.Now().Unix(),
	}

	if sender.Extension != "" {
		hub.SendToExtension(sender.Extension, deletedMsg)
	}
	if receiver.Extension != "" {
		hub.SendToExtension(receiver.Extension, deletedMsg)
	}
}
