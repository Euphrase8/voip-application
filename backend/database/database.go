package database

import (
	"log"
	"voip-backend/config"
	"voip-backend/models"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	_ "modernc.org/sqlite"
)

var DB *gorm.DB

func InitDatabase() {
	var err error

	// Configure GORM logger
	gormConfig := &gorm.Config{}
	if config.AppConfig.Debug {
		gormConfig.Logger = logger.Default.LogMode(logger.Info)
	} else {
		gormConfig.Logger = logger.Default.LogMode(logger.Silent)
	}

	// Connect to SQLite database using pure Go driver (modernc.org/sqlite)
	dsn := config.AppConfig.DBPath + "?_pragma=foreign_keys(1)"
	DB, err = gorm.Open(sqlite.Dialector{
		DriverName: "sqlite",
		DSN:        dsn,
	}, gormConfig)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	log.Println("Database connected successfully")

	// Auto-migrate the schema
	err = DB.AutoMigrate(
		&models.User{},
		&models.CallLog{},
		&models.ActiveCall{},
		&models.Message{},
		&models.ChatConversation{},
		&models.ChatGroup{},
		&models.ChatGroupMember{},
		&models.ChatGroupMessage{},
		&models.Voicemail{},
		&models.VoicemailGreeting{},
		&models.MissedCall{},
		&models.Conference{},
		&models.ConferenceParticipant{},
	)
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}

	log.Println("Database migration completed")

	// Create default admin user if not exists
	createDefaultUsers()
}

func createDefaultUsers() {
	var adminUser models.User
	result := DB.Where("username = ?", "admin").First(&adminUser)

	if result.Error == gorm.ErrRecordNotFound {
		// Create default admin user
		adminUser = models.User{
			Username:  "admin",
			Email:     "admin@voip.local",
			Password:  "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", // password: password
			Extension: "1000",
			Status:    "offline",
			Role:      "admin",
		}

		if err := DB.Create(&adminUser).Error; err != nil {
			log.Printf("Failed to create admin user: %v", err)
		} else {
			log.Println("Default admin user created (username: admin, password: password, extension: 1000)")
		}
	}

	// Create some test users
	testUsers := []models.User{
		{
			Username:  "user1",
			Email:     "user1@voip.local",
			Password:  "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", // password: password
			Extension: "1001",
			Status:    "offline",
			Role:      "user",
		},
		{
			Username:  "user2",
			Email:     "user2@voip.local",
			Password:  "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", // password: password
			Extension: "1002",
			Status:    "offline",
			Role:      "user",
		},
		{
			Username:  "user3",
			Email:     "user3@voip.local",
			Password:  "$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi", // password: password
			Extension: "1003",
			Status:    "offline",
			Role:      "user",
		},
	}

	for _, user := range testUsers {
		var existingUser models.User
		result := DB.Where("username = ?", user.Username).First(&existingUser)

		if result.Error == gorm.ErrRecordNotFound {
			if err := DB.Create(&user).Error; err != nil {
				log.Printf("Failed to create test user %s: %v", user.Username, err)
			} else {
				log.Printf("Test user created: %s (extension: %s)", user.Username, user.Extension)
			}
		}
	}
}

// GetDB returns the database instance
func GetDB() *gorm.DB {
	return DB
}

// CloseDB closes the database connection
func CloseDB() {
	if DB != nil {
		sqlDB, err := DB.DB()
		if err == nil {
			sqlDB.Close()
		}
	}
}
