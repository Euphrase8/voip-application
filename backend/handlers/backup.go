package handlers

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"voip-backend/config"
	"voip-backend/database"
	"voip-backend/models"

	"github.com/gin-gonic/gin"
)

var validBackupID = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

func sanitizeBackupID(id string) string {
	if !validBackupID.MatchString(id) {
		return ""
	}
	return id
}

type BackupRequest struct {
	IncludeDatabase bool   `json:"include_database"`
	IncludeConfig   bool   `json:"include_config"`
	IncludeCallLogs bool   `json:"include_call_logs"`
	BackupName      string `json:"backup_name,omitempty"`
}

type BackupResponse struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	CreatedAt   time.Time `json:"created_at"`
	Size        int64     `json:"size"`
	Path        string    `json:"path"`
	Status      string    `json:"status"`
	Components  []string  `json:"components"`
	Description string    `json:"description"`
}

type BackupStatus struct {
	ID          string     `json:"id"`
	Status      string     `json:"status"` // creating, completed, failed, restoring
	Progress    int        `json:"progress"`
	Message     string     `json:"message"`
	CreatedAt   time.Time  `json:"created_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	Error       string     `json:"error,omitempty"`
}

var (
	activeBackups   = make(map[string]*BackupStatus)
	activeBackupsMu sync.RWMutex
)

// CreateBackup creates a new system backup
func CreateBackup(c *gin.Context) {
	var req BackupRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid request format",
		})
		return
	}

	// Generate backup ID and name
	backupID := fmt.Sprintf("backup_%d", time.Now().Unix())
	if req.BackupName == "" {
		req.BackupName = fmt.Sprintf("System_Backup_%s", time.Now().Format("2006-01-02_15-04-05"))
	}

	// Initialize backup status
	status := &BackupStatus{
		ID:        backupID,
		Status:    "creating",
		Progress:  0,
		Message:   "Initializing backup...",
		CreatedAt: time.Now(),
	}
	activeBackupsMu.Lock()
	activeBackups[backupID] = status
	activeBackupsMu.Unlock()

	// Start backup process in goroutine
	go performBackup(backupID, req, status)

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"backup_id": backupID,
		"status":    status,
		"message":   "Backup started successfully",
	})
}

// GetBackupStatus returns the status of a backup operation
func GetBackupStatus(c *gin.Context) {
	backupID := c.Param("id")
	if backupID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Backup ID required",
		})
		return
	}

	activeBackupsMu.RLock()
	status, exists := activeBackups[backupID]
	activeBackupsMu.RUnlock()
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Backup not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  status,
	})
}

// ListBackups returns all available backups
func ListBackups(c *gin.Context) {
	backupDir := getBackupDirectory()
	backups := []BackupResponse{}

	// Ensure backup directory exists
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to access backup directory",
		})
		return
	}

	// Read backup directory
	files, err := os.ReadDir(backupDir)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to read backup directory",
		})
		return
	}

	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".zip") {
			filePath := filepath.Join(backupDir, file.Name())
			if info, err := os.Stat(filePath); err == nil {
				backup := BackupResponse{
					ID:        strings.TrimSuffix(file.Name(), ".zip"),
					Name:      strings.TrimSuffix(file.Name(), ".zip"),
					CreatedAt: info.ModTime(),
					Size:      info.Size(),
					Path:      filePath,
					Status:    "completed",
				}

				// Try to read backup metadata
				if metadata := readBackupMetadata(filePath); metadata != nil {
					backup.Components = metadata.Components
					backup.Description = metadata.Description
				}

				backups = append(backups, backup)
			}
		}
	}

	// Debug logging
	log.Printf("[BackupHandler] Returning %d backups", len(backups))
	for i, backup := range backups {
		log.Printf("[BackupHandler] Backup %d: ID='%s', Name='%s'", i, backup.ID, backup.Name)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"backups": backups,
		"count":   len(backups),
	})
}

// DownloadBackup allows downloading a backup file
func DownloadBackup(c *gin.Context) {
	backupID := sanitizeBackupID(c.Param("id"))
	log.Printf("[BackupHandler] Download request for backup ID: '%s'", backupID)

	if backupID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid backup ID",
		})
		return
	}

	backupPath := filepath.Join(getBackupDirectory(), backupID+".zip")
	// Ensure file is within backup directory
	if !strings.HasPrefix(filepath.Clean(backupPath), filepath.Clean(getBackupDirectory())) {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid backup ID",
		})
		return
	}
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Backup file not found",
		})
		return
	}

	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", "attachment; filename="+backupID+".zip")
	c.Header("Content-Type", "application/zip")
	c.File(backupPath)
}

// DeleteBackup deletes a backup file
func DeleteBackup(c *gin.Context) {
	backupID := sanitizeBackupID(c.Param("id"))
	if backupID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid backup ID",
		})
		return
	}

	backupPath := filepath.Join(getBackupDirectory(), backupID+".zip")
	// Prevent path traversal - ensure file is within backup directory
	cleanPath := filepath.Clean(backupPath)
	backupDir := filepath.Clean(getBackupDirectory())
	if !strings.HasPrefix(cleanPath, backupDir) {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid backup ID",
		})
		return
	}
	if _, err := os.Stat(cleanPath); os.IsNotExist(err) {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "Backup file not found",
		})
		return
	}
	if err := os.Remove(cleanPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "Failed to delete backup file",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Backup deleted successfully",
	})
}

// RestoreBackup restores system from a backup
func RestoreBackup(c *gin.Context) {
	backupID := sanitizeBackupID(c.Param("id"))
	if backupID == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "Invalid backup ID",
		})
		return
	}

	// Initialize restore status
	status := &BackupStatus{
		ID:        "restore_" + backupID,
		Status:    "restoring",
		Progress:  0,
		Message:   "Starting restore process...",
		CreatedAt: time.Now(),
	}
	activeBackupsMu.Lock()
	activeBackups[status.ID] = status
	activeBackupsMu.Unlock()

	// Start restore process in goroutine
	go performRestore(backupID, status)

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"restore_id": status.ID,
		"status":     status,
		"message":    "Restore started successfully",
	})
}

// Backup metadata structure
type BackupMetadata struct {
	Version      string    `json:"version"`
	CreatedAt    time.Time `json:"created_at"`
	Components   []string  `json:"components"`
	Description  string    `json:"description"`
	DatabaseSize int64     `json:"database_size"`
	TotalSize    int64     `json:"total_size"`
}

// Perform the actual backup process
func performBackup(backupID string, req BackupRequest, status *BackupStatus) {
	defer func() {
		if r := recover(); r != nil {
			status.Status = "failed"
			status.Error = fmt.Sprintf("Backup failed: %v", r)
			status.Progress = 0
		}
	}()

	backupDir := getBackupDirectory()
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		status.Status = "failed"
		status.Error = "Failed to create backup directory"
		return
	}

	backupPath := filepath.Join(backupDir, backupID+".zip")
	zipFile, err := os.Create(backupPath)
	if err != nil {
		status.Status = "failed"
		status.Error = "Failed to create backup file"
		return
	}
	defer zipFile.Close()

	zipWriter := zip.NewWriter(zipFile)
	defer zipWriter.Close()

	metadata := BackupMetadata{
		Version:     "1.0.0",
		CreatedAt:   time.Now(),
		Components:  []string{},
		Description: req.BackupName,
	}

	totalSteps := 0
	if req.IncludeDatabase {
		totalSteps++
	}
	if req.IncludeConfig {
		totalSteps++
	}
	if req.IncludeCallLogs {
		totalSteps++
	}

	if totalSteps == 0 {
		status.Status = "failed"
		status.Error = "No components selected for backup"
		return
	}

	currentStep := 0

	// Backup database
	if req.IncludeDatabase {
		status.Message = "Backing up database..."
		if err := backupDatabase(zipWriter); err != nil {
			status.Status = "failed"
			status.Error = "Failed to backup database: " + err.Error()
			return
		}
		metadata.Components = append(metadata.Components, "database")
		currentStep++
		status.Progress = (currentStep * 100) / totalSteps
	}

	// Backup configuration
	if req.IncludeConfig {
		status.Message = "Backing up configuration..."
		if err := backupConfiguration(zipWriter); err != nil {
			status.Status = "failed"
			status.Error = "Failed to backup configuration: " + err.Error()
			return
		}
		metadata.Components = append(metadata.Components, "configuration")
		currentStep++
		status.Progress = (currentStep * 100) / totalSteps
	}

	// Backup call logs
	if req.IncludeCallLogs {
		status.Message = "Backing up call logs..."
		if err := backupCallLogs(zipWriter); err != nil {
			status.Status = "failed"
			status.Error = "Failed to backup call logs: " + err.Error()
			return
		}
		metadata.Components = append(metadata.Components, "call_logs")
		currentStep++
		status.Progress = (currentStep * 100) / totalSteps
	}

	// Add metadata to backup
	status.Message = "Finalizing backup..."
	metadataBytes, _ := json.Marshal(metadata)
	metadataFile, _ := zipWriter.Create("backup_metadata.json")
	metadataFile.Write(metadataBytes)

	status.Status = "completed"
	status.Progress = 100
	status.Message = "Backup completed successfully"
	now := time.Now()
	status.CompletedAt = &now
}

// Backup database to zip
func backupDatabase(zipWriter *zip.Writer) error {
	// Create database dump
	dbFile, err := zipWriter.Create("database.db")
	if err != nil {
		return err
	}

	// Copy database file
	sourceFile, err := os.Open(config.AppConfig.DBPath)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	_, err = io.Copy(dbFile, sourceFile)
	return err
}

// Backup configuration to zip
func backupConfiguration(zipWriter *zip.Writer) error {
	configFile, err := zipWriter.Create("config.json")
	if err != nil {
		return err
	}

	configData := map[string]interface{}{
		"asterisk_host": config.AppConfig.AsteriskHost,
		"sip_domain":    config.AppConfig.SIPDomain,
		"sip_port":      config.AppConfig.SIPPort,
		"environment":   config.AppConfig.Environment,
		"backup_time":   time.Now().Format(time.RFC3339),
	}

	configBytes, _ := json.Marshal(configData)
	_, err = configFile.Write(configBytes)
	return err
}

// backupCallLogs exports call logs as JSON into the zip archive
func backupCallLogs(zipWriter *zip.Writer) error {
	callLogsFile, err := zipWriter.Create("call_logs.json")
	if err != nil {
		return err
	}

	var callLogs []map[string]interface{}
	if err := database.GetDB().Model(&models.CallLog{}).Find(&callLogs).Error; err != nil {
		return err
	}

	callLogsBytes, err := json.Marshal(callLogs)
	if err != nil {
		return err
	}
	_, err = callLogsFile.Write(callLogsBytes)
	return err
}

// Perform restore process
func performRestore(backupID string, status *BackupStatus) {
	backupPath := filepath.Join(getBackupDirectory(), backupID+".zip")

	// Prevent path traversal - ensure file is within backup directory
	cleanPath := filepath.Clean(backupPath)
	backupDir := filepath.Clean(getBackupDirectory())
	if !strings.HasPrefix(cleanPath, backupDir) {
		status.Status = "failed"
		status.Error = "Invalid backup ID"
		status.Progress = 0
		return
	}

	// Check backup file exists
	if _, err := os.Stat(cleanPath); os.IsNotExist(err) {
		status.Status = "failed"
		status.Error = fmt.Sprintf("Backup file not found: %s", cleanPath)
		status.Progress = 0
		return
	}

	status.Message = "Opening backup archive..."
	status.Progress = 10

	reader, err := zip.OpenReader(cleanPath)
	if err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("Failed to open backup: %v", err)
		status.Progress = 0
		return
	}
	defer reader.Close()

	restoreDir := filepath.Join(".", "restore_"+backupID)
	if err := os.MkdirAll(restoreDir, 0755); err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("Failed to create restore directory: %v", err)
		status.Progress = 0
		return
	}
	defer os.RemoveAll(restoreDir)

	// Prevent zip slip - ensure all extracted files stay within restoreDir
	restoreDirClean := filepath.Clean(restoreDir)

	totalFiles := len(reader.File)
	for i, f := range reader.File {
		status.Message = fmt.Sprintf("Restoring %s...", f.Name)
		if totalFiles > 0 {
			status.Progress = 10 + ((i * 80) / totalFiles)
		}

		// Prevent zip slip vulnerability: validate that the target path is within restoreDir
		destPath := filepath.Join(restoreDir, f.Name)
		if !strings.HasPrefix(filepath.Clean(destPath), restoreDirClean) {
			log.Printf("[Backup] Skipping file with unsafe path: %s", f.Name)
			continue
		}

		rc, err := f.Open()
		if err != nil {
			log.Printf("[Backup] Failed to open %s in archive: %v", f.Name, err)
			continue
		}

		if f.FileInfo().IsDir() {
			os.MkdirAll(destPath, 0755)
			rc.Close()
			continue
		}

		// Ensure parent directory exists
		os.MkdirAll(filepath.Dir(destPath), 0755)

		destFile, err := os.Create(destPath)
		if err != nil {
			log.Printf("[Backup] Failed to create %s: %v", destPath, err)
			rc.Close()
			continue
		}

		_, err = io.Copy(destFile, rc)
		destFile.Close()
		rc.Close()
		if err != nil {
			log.Printf("[Backup] Failed to write %s: %v", destPath, err)
			continue
		}
	}

	status.Message = "Applying restored data..."
	status.Progress = 95

	// Restore database if present
	dbPath := filepath.Join(restoreDir, "database.db")
	if _, err := os.Stat(dbPath); err == nil {
		src, err := os.Open(dbPath)
		if err == nil {
			dst, err := os.Create(config.AppConfig.DBPath + ".restored")
			if err == nil {
				io.Copy(dst, src)
				dst.Close()
				// Replace original with restored
				os.Rename(config.AppConfig.DBPath+".restored", config.AppConfig.DBPath)
			}
			src.Close()
		}
	}

	status.Status = "completed"
	status.Progress = 100
	status.Message = "Backup restored successfully. Please restart the server."
	now := time.Now()
	status.CompletedAt = &now
}

// Helper functions
func getBackupDirectory() string {
	return filepath.Join(".", "backups")
}

func readBackupMetadata(backupPath string) *BackupMetadata {
	reader, err := zip.OpenReader(backupPath)
	if err != nil {
		return nil
	}
	defer reader.Close()

	for _, f := range reader.File {
		if f.Name == "backup_metadata.json" {
			rc, err := f.Open()
			if err != nil {
				return nil
			}
			defer rc.Close()

			var metadata BackupMetadata
			if err := json.NewDecoder(rc).Decode(&metadata); err != nil {
				return nil
			}
			return &metadata
		}
	}
	return nil
}
