package models

import "time"

type Conference struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	RoomNum   string    `json:"room_num" gorm:"uniqueIndex;not null"`
	Name      string    `json:"name" gorm:"not null"`
	CreatedBy uint      `json:"created_by"`
	Status    string    `json:"status" gorm:"default:active"` // active, ended
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Creator   User      `json:"creator,omitempty" gorm:"foreignKey:CreatedBy"`
}

type ConferenceParticipant struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	ConferenceID uint      `json:"conference_id" gorm:"index;not null"`
	UserID       uint      `json:"user_id" gorm:"index;not null"`
	Channel      string    `json:"channel"`
	JoinedAt     time.Time `json:"joined_at"`
	LeftAt       *time.Time `json:"left_at,omitempty"`
	IsActive     bool      `json:"is_active" gorm:"default:true"`
	User         User      `json:"user,omitempty" gorm:"foreignKey:UserID"`
}

type CreateConferenceRequest struct {
	Name string `json:"name" binding:"required"`
}

type JoinConferenceRequest struct {
	RoomNum string `json:"room_num" binding:"required"`
}
