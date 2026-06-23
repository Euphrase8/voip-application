package models

import (
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID        uint       `json:"id" gorm:"primaryKey"`
	Username  string     `json:"username" gorm:"unique;not null"`
	Email     string     `json:"email" gorm:"unique;not null"`
	Password  string     `json:"-" gorm:"not null"` // Don't include in JSON responses
	Extension string     `json:"extension" gorm:"unique;not null"`
	Status    string     `json:"status" gorm:"default:offline"` // online, offline, busy, away
	Role      string     `json:"role" gorm:"default:user"`      // user, admin
	IsOnline  bool       `json:"is_online" gorm:"default:false"`
	LastLogin *time.Time `json:"last_login"`
	LastSeen  *time.Time `json:"last_seen"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type CallLog struct {
	ID        uint       `json:"id" gorm:"primaryKey"`
	CallerID  uint       `json:"caller_id"`
	CalleeID  uint       `json:"callee_id"`
	Caller    User       `json:"caller" gorm:"foreignKey:CallerID"`
	Callee    User       `json:"callee" gorm:"foreignKey:CalleeID"`
	StartTime time.Time  `json:"start_time"`
	EndTime   *time.Time `json:"end_time"`
	Duration  int        `json:"duration"` // in seconds
	Status    string     `json:"status"`   // initiated, ringing, answered, ended, failed
	Channel   string     `json:"channel"`
	Direction string     `json:"direction"` // inbound, outbound
	CreatedAt time.Time  `json:"created_at"`
}

type ActiveCall struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	CallerID  uint      `json:"caller_id"`
	CalleeID  uint      `json:"callee_id"`
	Caller    User      `json:"caller" gorm:"foreignKey:CallerID"`
	Callee    User      `json:"callee" gorm:"foreignKey:CalleeID"`
	Channel   string    `json:"channel"`
	Status    string    `json:"status"` // ringing, connected, on_hold
	StartTime time.Time `json:"start_time"`
	CreatedAt time.Time `json:"created_at"`
}

// UserResponse represents the user data sent to clients (without sensitive info)
type UserResponse struct {
	ID        uint       `json:"id"`
	Username  string     `json:"username"`
	Email     string     `json:"email"`
	Extension string     `json:"extension"`
	Status    string     `json:"status"`
	Role      string     `json:"role"`
	IsOnline  bool       `json:"is_online"`
	LastLogin *time.Time `json:"last_login"`
	LastSeen  *time.Time `json:"last_seen"`
	CreatedAt time.Time  `json:"created_at"`
}

// LoginRequest represents login request payload
type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

// RegisterRequest represents registration request payload
type RegisterRequest struct {
	Username  string `json:"username" binding:"required,min=3,max=50"`
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=6"`
	Extension string `json:"extension"`
}

// CallRequest represents call initiation request
type CallRequest struct {
	TargetExtension string `json:"target_extension" binding:"required"`
}

// CallAnswerRequest represents call answer request
type CallAnswerRequest struct {
	Channel string `json:"channel" binding:"required"`
}

// CallHangupRequest represents call hangup request
type CallHangupRequest struct {
	Channel string `json:"channel" binding:"required"`
}

// ToResponse converts User to UserResponse
func (u *User) ToResponse() UserResponse {
	return UserResponse{
		ID:        u.ID,
		Username:  u.Username,
		Email:     u.Email,
		Extension: u.Extension,
		Status:    u.Status,
		Role:      u.Role,
		IsOnline:  u.IsOnline,
		LastLogin: u.LastLogin,
		LastSeen:  u.LastSeen,
		CreatedAt: u.CreatedAt,
	}
}

// BeforeCreate hook to set default values
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.Status == "" {
		u.Status = "offline"
	}
	if u.Role == "" {
		u.Role = "user"
	}
	return nil
}
