package models

import (
	"time"
)

type Voicemail struct {
	ID           uint       `json:"id" gorm:"primaryKey"`
	CallerID     uint       `json:"caller_id" gorm:"index"`
	CalleeID     uint       `json:"callee_id" gorm:"index;not null"`
	CallerNumber string     `json:"caller_number"`
	FilePath     string     `json:"file_path"`
	Duration     int        `json:"duration"` // seconds
	IsRead       bool       `json:"is_read" gorm:"default:false"`
	ReadAt       *time.Time `json:"read_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	Caller       User       `json:"caller,omitempty" gorm:"foreignKey:CallerID"`
	Callee       User       `json:"callee,omitempty" gorm:"foreignKey:CalleeID"`
}

type VoicemailGreeting struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	UserID     uint      `json:"user_id" gorm:"uniqueIndex;not null"`
	FilePath   string    `json:"file_path"`
	IsActive   bool      `json:"is_active" gorm:"default:true"`
	UpdatedAt  time.Time `json:"updated_at"`
	CreatedAt  time.Time `json:"created_at"`
}

type MissedCall struct {
	ID          uint       `json:"id" gorm:"primaryKey"`
	CallerID    uint       `json:"caller_id" gorm:"index"`
	CalleeID    uint       `json:"callee_id" gorm:"index;not null"`
	CallerNumber string    `json:"caller_number"`
	IsNotified  bool       `json:"is_notified" gorm:"default:false"`
	CreatedAt   time.Time  `json:"created_at"`
	Caller      User       `json:"caller,omitempty" gorm:"foreignKey:CallerID"`
	Callee      User       `json:"callee,omitempty" gorm:"foreignKey:CalleeID"`
}

type CreateVoicemailRequest struct {
	CallerID     uint   `json:"caller_id"`
	CallerNumber string `json:"caller_number"`
	CalleeID     uint   `json:"callee_id" binding:"required"`
	Duration     int    `json:"duration"`
	FilePath     string `json:"file_path"`
}
