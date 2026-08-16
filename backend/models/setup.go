package models

import "time"

// SetupState records whether the server has been configured. It is the
// server-side source of truth for the setup page so that devices other than
// the server itself do not keep loading /ip-config once setup is complete.
type SetupState struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Completed bool      `json:"completed" gorm:"not null;default:false"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
