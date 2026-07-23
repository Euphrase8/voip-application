package models

import "time"

type Voicemail struct {
	ID                uint       `json:"id" gorm:"primaryKey"`
	CallerID          uint       `json:"caller_id" gorm:"index"`
	CalleeID          uint       `json:"callee_id" gorm:"index;not null"`
	SenderName        string     `json:"sender_name"`
	SenderExtension   string     `json:"sender_extension"`
	RecipientName     string     `json:"recipient_name"`
	RecipientExtension string    `json:"recipient_extension"`
	CallerNumber      string     `json:"caller_number"`
	FilePath          string     `json:"file_path"`
	FileSize          int64      `json:"file_size"`
	Duration          int        `json:"duration"`
	IsRead            bool       `json:"is_read" gorm:"default:false"`
	PlaybackCount     int        `json:"playback_count" gorm:"default:0"`
	CallType          string     `json:"call_type" gorm:"default:voicemail"`
	ReadAt            *time.Time `json:"read_at,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
	Caller            User       `json:"caller,omitempty" gorm:"foreignKey:CallerID"`
	Callee            User       `json:"callee,omitempty" gorm:"foreignKey:CalleeID"`
}

type VoicemailGreeting struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"uniqueIndex;not null"`
	FilePath  string    `json:"file_path"`
	IsActive  bool      `json:"is_active" gorm:"default:true"`
	UpdatedAt time.Time `json:"updated_at"`
	CreatedAt time.Time `json:"created_at"`
}

type MissedCall struct {
	ID           uint       `json:"id" gorm:"primaryKey"`
	CallerID     uint       `json:"caller_id" gorm:"index"`
	CalleeID     uint       `json:"callee_id" gorm:"index;not null"`
	CallerNumber string     `json:"caller_number"`
	IsNotified   bool       `json:"is_notified" gorm:"default:false"`
	CreatedAt    time.Time  `json:"created_at"`
	Caller       User       `json:"caller,omitempty" gorm:"foreignKey:CallerID"`
	Callee       User       `json:"callee,omitempty" gorm:"foreignKey:CalleeID"`
}

type CallRecording struct {
	ID        uint       `json:"id" gorm:"primaryKey"`
	Channel   string     `json:"channel" gorm:"index"`
	FilePath  string     `json:"file_path"`
	StartedBy string     `json:"started_by"`
	StartedAt time.Time  `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
	IsActive  bool       `json:"is_active" gorm:"default:true"`
	CreatedAt time.Time  `json:"created_at"`
}

type VoicemailSettings struct {
	ID              uint      `json:"id" gorm:"primaryKey"`
	UserID          uint      `json:"user_id" gorm:"uniqueIndex;not null"`
	GreetingEnabled bool      `json:"greeting_enabled" gorm:"default:false"`
	NotifyByEmail   bool      `json:"notify_by_email" gorm:"default:true"`
	NotifyBySMS     bool      `json:"notify_by_sms" gorm:"default:false"`
	MaxDuration     int       `json:"max_duration" gorm:"default:60"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type CreateVoicemailRequest struct {
	CallerID          uint   `json:"caller_id"`
	CallerNumber      string `json:"caller_number"`
	CalleeID          uint   `json:"callee_id" binding:"required"`
	SenderName        string `json:"sender_name"`
	SenderExtension   string `json:"sender_extension"`
	RecipientName     string `json:"recipient_name"`
	RecipientExtension string `json:"recipient_extension"`
	Duration          int    `json:"duration"`
	FileSize          int64  `json:"file_size"`
	FilePath          string `json:"file_path"`
	CallType          string `json:"call_type"`
}


