package asterisk

import (
	"bufio"
	"fmt"
	"log"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"voip-backend/config"
)

type AMIClient struct {
	conn           net.Conn
	reader         *bufio.Reader
	mutex          sync.Mutex
	events         chan AMIEvent
	commands       chan AMICommand
	quit           chan bool
	connected      bool
	reconnecting   bool
	lastPing       time.Time
	reconnectMutex sync.Mutex
	healthMutex    sync.RWMutex
}

type AMIEvent struct {
	Type   string
	Fields map[string]string
}

type AMICommand struct {
	Action   string
	Fields   map[string]string
	Response chan AMIResponse
}

type AMIResponse struct {
	Success bool
	Fields  map[string]string
	Error   string
}

var amiClient *AMIClient
var amiMutex sync.Mutex

// Track whether AMI has ever connected successfully
var amiEverConnected atomic.Bool

// InitAMI initializes the AMI connection with retry logic
func InitAMI() error {
	amiMutex.Lock()
	defer amiMutex.Unlock()

	log.Printf("Initializing AMI connection to %s:%s...", config.AppConfig.AsteriskHost, config.AppConfig.AsteriskAMIPort)

	client, err := NewAMIClient()
	if err != nil {
		log.Printf("Failed to create AMI client: %v", err)
		log.Printf("AMI connection will be retried in background every 30 seconds")
		log.Printf("VoIP functionality will be limited until Asterisk connection is established")

		// Start background reconnection loop
		go startReconnectionLoop()

		// Don't return error - let the application start without AMI
		return nil
	}

	amiClient = client
	amiEverConnected.Store(true)
	go amiClient.handleEvents()
	go amiClient.startHealthMonitoring()

	log.Println("AMI client initialized successfully")
	return nil
}

// startReconnectionLoop continuously tries to reconnect with exponential backoff
func startReconnectionLoop() {
	attempt := 0
	for {
		attempt++
		backoff := time.Duration(30) * time.Second
		if attempt > 10 {
			backoff = 5 * time.Minute
		} else if attempt > 5 {
			backoff = 2 * time.Minute
		} else if attempt > 3 {
			backoff = 1 * time.Minute
		}

		time.Sleep(backoff)

		amiMutex.Lock()
		isConnected := amiClient != nil && amiClient.IsConnected()
		amiMutex.Unlock()

		if isConnected {
			return
		}

		log.Printf("[AMI] Reconnect attempt %d...", attempt)
		if err := reconnectAMI(); err != nil {
			if attempt <= 5 || attempt%5 == 0 {
				log.Printf("[AMI] Reconnection failed (attempt %d): %v", attempt, err)
			}
		} else {
			log.Println("[AMI] Reconnection successful")
			amiEverConnected.Store(true)
			return
		}
	}
}

// reconnectAMI attempts to reconnect the AMI client
func reconnectAMI() error {
	amiMutex.Lock()
	defer amiMutex.Unlock()

	// Close existing connection if any
	if amiClient != nil {
		amiClient.Close()
	}

	client, err := NewAMIClient()
	if err != nil {
		return err
	}

	amiClient = client
	amiEverConnected.Store(true)
	go amiClient.handleEvents()
	go amiClient.startHealthMonitoring()

	return nil
}

// NewAMIClient creates a new AMI client
func NewAMIClient() (*AMIClient, error) {
	address := net.JoinHostPort(config.AppConfig.AsteriskHost, config.AppConfig.AsteriskAMIPort)

	log.Printf("Attempting to connect to Asterisk AMI at %s...", address)
	conn, err := net.DialTimeout("tcp", address, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Asterisk AMI at %s: %v", address, err)
	}

	client := &AMIClient{
		conn:      conn,
		reader:    bufio.NewReader(conn),
		events:    make(chan AMIEvent, 100),
		commands:  make(chan AMICommand, 10),
		quit:      make(chan bool),
		connected: false,
		lastPing:  time.Now(),
	}

	// Read the initial greeting
	_, _, err = client.reader.ReadLine()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to read AMI greeting: %v", err)
	}

	// Login to AMI
	err = client.login()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("AMI login failed: %v", err)
	}

	go client.handleConnection()

	// Mark as connected after successful login
	client.healthMutex.Lock()
	client.connected = true
	client.lastPing = time.Now()
	client.healthMutex.Unlock()

	log.Printf("Connected to Asterisk AMI at %s", address)
	return client, nil
}

// login authenticates with the AMI
func (c *AMIClient) login() error {
	loginCmd := fmt.Sprintf("Action: Login\r\nUsername: %s\r\nSecret: %s\r\n\r\n",
		config.AppConfig.AsteriskAMIUsername,
		config.AppConfig.AsteriskAMISecret)

	c.mutex.Lock()
	_, err := c.conn.Write([]byte(loginCmd))
	c.mutex.Unlock()

	if err != nil {
		return err
	}

	// Read login response
	response, err := c.readResponse()
	if err != nil {
		return err
	}

	if response.Fields["Response"] != "Success" {
		return fmt.Errorf("login failed: %s", response.Fields["Message"])
	}

	return nil
}

// handleConnection handles the AMI connection
func (c *AMIClient) handleConnection() {
	for {
		select {
		case cmd := <-c.commands:
			c.executeCommand(cmd)
		case <-c.quit:
			return
		}
	}
}

// handleEvents processes AMI events
func (c *AMIClient) handleEvents() {
	for {
		response, err := c.readResponse()
		if err != nil {
			log.Printf("Error reading AMI response: %v", err)
			// Mark as disconnected on read errors
			c.healthMutex.Lock()
			c.connected = false
			c.healthMutex.Unlock()

			// Trigger reconnection
			go func() {
				time.Sleep(5 * time.Second)
				startReconnectionLoop()
			}()
			return
		}

		if response.Fields["Event"] != "" {
			event := AMIEvent{
				Type:   response.Fields["Event"],
				Fields: response.Fields,
			}

			select {
			case c.events <- event:
			default:
				log.Println("Event channel full, dropping event")
			}
		}
	}
}

// readResponse reads a complete AMI response
func (c *AMIClient) readResponse() (AMIResponse, error) {
	fields := make(map[string]string)

	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			log.Printf("[AMI] Error reading response line: %v", err)
			return AMIResponse{}, err
		}

		line = strings.TrimSpace(line)
		if line == "" {
			break
		}

		parts := strings.SplitN(line, ": ", 2)
		if len(parts) == 2 {
			fields[parts[0]] = parts[1]
		}
	}

	success := fields["Response"] == "Success"

	log.Printf("[AMI] Response received: Success=%t, Fields=%+v", success, fields)

	return AMIResponse{
		Success: success,
		Fields:  fields,
		Error:   fields["Message"],
	}, nil
}

// executeCommand executes an AMI command
func (c *AMIClient) executeCommand(cmd AMICommand) {
	var cmdStr strings.Builder
	cmdStr.WriteString(fmt.Sprintf("Action: %s\r\n", cmd.Action))

	for key, value := range cmd.Fields {
		cmdStr.WriteString(fmt.Sprintf("%s: %s\r\n", key, value))
	}
	cmdStr.WriteString("\r\n")

	c.mutex.Lock()
	_, err := c.conn.Write([]byte(cmdStr.String()))
	c.mutex.Unlock()

	if err != nil {
		cmd.Response <- AMIResponse{
			Success: false,
			Error:   err.Error(),
		}
		return
	}

	// Read response
	response, err := c.readResponse()
	if err != nil {
		cmd.Response <- AMIResponse{
			Success: false,
			Error:   err.Error(),
		}
		return
	}

	cmd.Response <- response
}

// GetAMIClient returns the global AMI client
func GetAMIClient() *AMIClient {
	return amiClient
}

// SendCommand sends a command to AMI and returns the response
func (c *AMIClient) SendCommand(action string, fields map[string]string) (AMIResponse, error) {
	if c == nil {
		return AMIResponse{}, fmt.Errorf("AMI client not initialized")
	}

	cmd := AMICommand{
		Action:   action,
		Fields:   fields,
		Response: make(chan AMIResponse, 1),
	}

	select {
	case c.commands <- cmd:
	case <-time.After(10 * time.Second):
		return AMIResponse{}, fmt.Errorf("command queue timeout")
	}

	select {
	case response := <-cmd.Response:
		return response, nil
	case <-time.After(30 * time.Second):
		return AMIResponse{}, fmt.Errorf("response timeout after 30 seconds")
	}
}

// GetEvents returns the events channel
func (c *AMIClient) GetEvents() <-chan AMIEvent {
	return c.events
}

// IsConnected returns the connection status
func (c *AMIClient) IsConnected() bool {
	c.healthMutex.RLock()
	defer c.healthMutex.RUnlock()
	return c.connected
}

// startHealthMonitoring monitors the connection health
func (c *AMIClient) startHealthMonitoring() {
	ticker := time.NewTicker(30 * time.Second) // Check every 30 seconds
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			c.performHealthCheck()
		case <-c.quit:
			return
		}
	}
}

// performHealthCheck sends a ping to verify connection
func (c *AMIClient) performHealthCheck() {
	if !c.IsConnected() {
		return
	}

	// Send a simple ping command
	_, err := c.SendCommand("Ping", nil)
	if err != nil {
		log.Printf("AMI health check failed: %v", err)
		c.healthMutex.Lock()
		c.connected = false
		c.healthMutex.Unlock()

		// Trigger reconnection
		go func() {
			time.Sleep(5 * time.Second)
			startReconnectionLoop()
		}()
	} else {
		c.healthMutex.Lock()
		c.lastPing = time.Now()
		c.healthMutex.Unlock()
	}
}

// GetLastPing returns the last successful ping time
func (c *AMIClient) GetLastPing() time.Time {
	c.healthMutex.RLock()
	defer c.healthMutex.RUnlock()
	return c.lastPing
}

// Close closes the AMI connection
func (c *AMIClient) Close() {
	if c == nil {
		return
	}

	c.healthMutex.Lock()
	c.connected = false
	c.healthMutex.Unlock()

	select {
	case c.quit <- true:
	default:
	}

	if c.conn != nil {
		c.conn.Close()
	}
}
