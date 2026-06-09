package handlers

import (
	"net/http"
	"strconv"
	"time"
	"voip-backend/database"
	"voip-backend/models"
	"voip-backend/websocket"

	"github.com/gin-gonic/gin"
)

func SendMessage(c *gin.Context) {
	userID, _ := c.Get("user_id")

	var req models.SendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": err.Error()})
		return
	}

	msg := models.Message{
		SenderID:   userID.(uint),
		ReceiverID: req.ReceiverID,
		Content:    req.Content,
		MsgType:    "text",
	}

	if req.MsgType != "" {
		msg.MsgType = req.MsgType
	}

	db := database.GetDB()
	if err := db.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "Failed to send message"})
		return
	}

	db.Preload("Sender").First(&msg, msg.ID)

	hub := websocket.GetHub()
	if hub != nil {
		var receiver models.User
		if err := db.First(&receiver, req.ReceiverID).Error; err == nil {
			wsMsg := websocket.Message{
				Type:      "chat_message",
				From:      strconv.FormatUint(uint64(msg.SenderID), 10),
				To:        strconv.FormatUint(uint64(req.ReceiverID), 10),
				Data:      msg,
				Timestamp: msg.CreatedAt.Unix(),
			}
			hub.SendToExtension(receiver.Extension, wsMsg)
		}

		var sender models.User
		if err := db.First(&sender, userID).Error; err == nil {
			confirmation := websocket.Message{
				Type:      "chat_message_sent",
				From:      sender.Extension,
				Data:      msg,
				Timestamp: msg.CreatedAt.Unix(),
			}
			hub.SendToExtension(sender.Extension, confirmation)
		}
	}

	updateConversation(userID.(uint), req.ReceiverID, req.Content, msg.CreatedAt)

	c.JSON(http.StatusOK, gin.H{"success": true, "message": msg})
}

func GetMessages(c *gin.Context) {
	userID, _ := c.Get("user_id")
	otherID, err := strconv.ParseUint(c.Param("userId"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "error": "Invalid user ID"})
		return
	}

	db := database.GetDB()
	var messages []models.Message
	db.Where(
		"(sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)",
		userID, otherID, otherID, userID,
	).Order("created_at asc").Preload("Sender").Find(&messages)

	db.Model(&models.Message{}).Where(
		"sender_id = ? AND receiver_id = ? AND is_read = ?",
		otherID, userID, false,
	).Update("is_read", true).Update("read_at", time.Now())

	c.JSON(http.StatusOK, gin.H{"success": true, "messages": messages})
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
	db.Model(&models.Message{}).Where(
		"sender_id = ? AND receiver_id = ? AND is_read = ?",
		senderID, userID, false,
	).Updates(map[string]interface{}{
		"is_read": true,
		"read_at": time.Now(),
	})

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Messages marked as read"})
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
		Content:  req.Content,
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
