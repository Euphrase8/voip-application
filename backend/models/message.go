package models

import (
	"time"
)

type Message struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	SenderID   uint      `json:"sender_id" gorm:"index;not null"`
	ReceiverID uint      `json:"receiver_id" gorm:"index;not null"`
	Content    string    `json:"content" gorm:"type:text;not null"`
	MsgType    string    `json:"msg_type" gorm:"default:text"` // text, image, file
	FilePath   string    `json:"file_path,omitempty"`
	FileName   string    `json:"file_name,omitempty"`
	FileSize   int64     `json:"file_size,omitempty"`
	IsRead     bool      `json:"is_read" gorm:"default:false"`
	ReadAt     *time.Time `json:"read_at,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	Sender     User      `json:"sender" gorm:"foreignKey:SenderID"`
	Receiver   User      `json:"receiver" gorm:"foreignKey:ReceiverID"`
}

type ChatConversation struct {
	ID            uint       `json:"id" gorm:"primaryKey"`
	User1ID       uint       `json:"user1_id" gorm:"index;not null"`
	User2ID       uint       `json:"user2_id" gorm:"index;not null"`
	LastMessage   string     `json:"last_message" gorm:"type:text"`
	LastSenderID  uint       `json:"last_sender_id"`
	LastMessageAt *time.Time `json:"last_message_at"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
	User1         User       `json:"user1" gorm:"foreignKey:User1ID"`
	User2         User       `json:"user2" gorm:"foreignKey:User2ID"`
}

type ChatGroup struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Name      string    `json:"name" gorm:"not null"`
	CreatedBy uint      `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
}

type ChatGroupMember struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	GroupID   uint      `json:"group_id" gorm:"index;not null"`
	UserID    uint      `json:"user_id" gorm:"index;not null"`
	Role      string    `json:"role" gorm:"default:member"` // admin, member
	JoinedAt  time.Time `json:"joined_at"`
}

type ChatGroupMessage struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	GroupID   uint      `json:"group_id" gorm:"index;not null"`
	SenderID  uint      `json:"sender_id" gorm:"index;not null"`
	Content   string    `json:"content" gorm:"type:text;not null"`
	CreatedAt time.Time `json:"created_at"`
	Sender    User      `json:"sender" gorm:"foreignKey:SenderID"`
}

type TypingIndicator struct {
	SenderID    uint      `json:"sender_id"`
	ReceiverID  uint      `json:"receiver_id,omitempty"`
	GroupID     uint      `json:"group_id,omitempty"`
	IsTyping    bool      `json:"is_typing"`
	Timestamp   time.Time `json:"timestamp"`
}

type SendMessageRequest struct {
	ReceiverID uint   `json:"receiver_id" binding:"required"`
	Content    string `json:"content" binding:"required"`
	MsgType    string `json:"msg_type"`
}

type SendGroupMessageRequest struct {
	GroupID uint   `json:"group_id" binding:"required"`
	Content string `json:"content" binding:"required"`
}

type CreateGroupRequest struct {
	Name    string   `json:"name" binding:"required"`
	Members []uint   `json:"members" binding:"required"`
}
