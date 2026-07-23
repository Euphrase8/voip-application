package websocket

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
)

// Hub maintains the set of active clients and broadcasts messages to the clients
type Hub struct {
	// Registered clients
	clients map[*Client]bool

	// Inbound messages from the clients
	broadcast chan []byte

	// Register requests from the clients
	register chan *Client

	// Unregister requests from clients
	unregister chan *Client

	// Extension to multiple clients mapping (supports multiple devices per extension)
	extensionClients map[string][]*Client
	mutex            sync.RWMutex

	// Callback for when user disconnects (to update database)
	OnUserDisconnect func(extension string) error

	// Tracks closed send channels to prevent double-close panics
	closedChannels map[*Client]bool
	closedMu       sync.Mutex
}

// Message represents a WebSocket message
type Message struct {
	Type      string      `json:"type"`
	From      string      `json:"from,omitempty"`
	To        string      `json:"to,omitempty"`
	Channel   string      `json:"channel,omitempty"`
	Status    string      `json:"status,omitempty"`
	Data      interface{} `json:"data,omitempty"`
	Timestamp int64       `json:"timestamp"`
}

// CallMessage represents call-related messages
type CallMessage struct {
	Type      string `json:"type"`
	Caller    string `json:"caller"`
	Callee    string `json:"callee"`
	Channel   string `json:"channel"`
	Status    string `json:"status"`
	Priority  string `json:"priority,omitempty"`
	Transport string `json:"transport,omitempty"`
}

var globalHub *Hub

// NewHub creates a new Hub
func NewHub() *Hub {
	return &Hub{
		broadcast:        make(chan []byte),
		register:         make(chan *Client),
		unregister:       make(chan *Client),
		clients:          make(map[*Client]bool),
		extensionClients: make(map[string][]*Client),
		closedChannels:   make(map[*Client]bool),
	}
}

// markChannelClosed tracks that a client's send channel was closed
func (h *Hub) markChannelClosed(client *Client) {
	h.closedMu.Lock()
	defer h.closedMu.Unlock()
	h.closedChannels[client] = true
}

// isChannelClosed checks if a client's send channel was already closed
func (h *Hub) isChannelClosed(client *Client) bool {
	h.closedMu.Lock()
	defer h.closedMu.Unlock()
	return h.closedChannels[client]
}

// safeCloseSend safely closes a client's send channel (no panic if already closed)
func (h *Hub) safeCloseSend(client *Client) {
	if h.isChannelClosed(client) {
		return
	}
	h.markChannelClosed(client)
	close(client.send)
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			if client.Extension != "" {
				h.extensionClients[client.Extension] = append(h.extensionClients[client.Extension], client)
				log.Printf("Client registered: %s (extension: %s) - Total clients for extension: %d",
					client.ID, client.Extension, len(h.extensionClients[client.Extension]))
			}
			h.mutex.Unlock()

			// Send welcome message asynchronously so we don't block registration
			welcomeMsg := Message{
				Type:   "welcome",
				Status: "connected",
			}
			if data, err := json.Marshal(welcomeMsg); err == nil {
				select {
				case client.send <- data:
				default:
					// Don't close from here; let unregister or writePump handle cleanup
					log.Printf("Welcome message send failed for %s, client will be cleaned up by writePump", client.ID)
				}
			}

		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				if client.Extension != "" {
					clients := h.extensionClients[client.Extension]
					for i, c := range clients {
						if c == client {
							h.extensionClients[client.Extension] = append(clients[:i], clients[i+1:]...)
							break
						}
					}
					if len(h.extensionClients[client.Extension]) == 0 {
						delete(h.extensionClients, client.Extension)
						go h.SetUserOfflineOnDisconnect(client.Extension)
					}
					log.Printf("Client unregistered: %s (extension: %s) - Remaining clients for extension: %d",
						client.ID, client.Extension, len(h.extensionClients[client.Extension]))
				}
				h.safeCloseSend(client)
			}
			h.mutex.Unlock()

		case message := <-h.broadcast:
			h.mutex.RLock()
			var failedClients []*Client
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					failedClients = append(failedClients, client)
				}
			}
			h.mutex.RUnlock()

			// Clean up failed clients
			if len(failedClients) > 0 {
				h.mutex.Lock()
				for _, client := range failedClients {
					h.safeCloseSend(client)
					delete(h.clients, client)
					if client.Extension != "" {
						clients := h.extensionClients[client.Extension]
						for i, c := range clients {
							if c == client {
								h.extensionClients[client.Extension] = append(clients[:i], clients[i+1:]...)
								break
							}
						}
						if len(h.extensionClients[client.Extension]) == 0 {
							delete(h.extensionClients, client.Extension)
						}
					}
				}
				h.mutex.Unlock()
			}
		}
	}
}

// SendToExtension sends a message to all clients of a specific extension
func (h *Hub) SendToExtension(extension string, message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	// Collect all data under read lock, then release before any writes
	h.mutex.RLock()
	clients, exists := h.extensionClients[extension]
	clientCopy := make([]*Client, 0)
	if exists {
		clientCopy = append(clientCopy, clients...)
	}
	h.mutex.RUnlock()

	if !exists || len(clientCopy) == 0 {
		log.Printf("No client found for extension: %s", extension)
		return fmt.Errorf("no client found for extension: %s", extension)
	}

	// Send to all clients for this extension
	var failedClients []*Client
	successCount := 0

	for _, client := range clientCopy {
		select {
		case client.send <- data:
			successCount++
		default:
			failedClients = append(failedClients, client)
		}
	}

	// Remove failed clients (now with full lock since we dropped RLock)
	if len(failedClients) > 0 {
		h.mutex.Lock()
		for _, failedClient := range failedClients {
			if _, exists := h.clients[failedClient]; !exists {
				continue
			}
			delete(h.clients, failedClient)
			h.safeCloseSend(failedClient)

			if fClients, ok := h.extensionClients[extension]; ok {
				updatedClients := make([]*Client, 0, len(fClients))
				for _, c := range fClients {
					if c != failedClient {
						updatedClients = append(updatedClients, c)
					}
				}
				if len(updatedClients) == 0 {
					delete(h.extensionClients, extension)
				} else {
					h.extensionClients[extension] = updatedClients
				}
			}
		}
		h.mutex.Unlock()
		log.Printf("Removed %d failed clients for extension %s", len(failedClients), extension)
	}

	if successCount == 0 {
		return fmt.Errorf("failed to send message to any client for extension %s", extension)
	}

	return nil
}

// BroadcastMessage broadcasts a message to all connected clients
func (h *Hub) BroadcastMessage(message interface{}) error {
	data, err := json.Marshal(message)
	if err != nil {
		return err
	}

	select {
	case h.broadcast <- data:
		return nil
	default:
		log.Printf("Failed to broadcast message: channel full")
		return fmt.Errorf("failed to broadcast message: channel full")
	}
}

// GetConnectedExtensions returns a list of connected extensions
func (h *Hub) GetConnectedExtensions() []string {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	extensions := make([]string, 0, len(h.extensionClients))
	for extension, clients := range h.extensionClients {
		if len(clients) > 0 {
			extensions = append(extensions, extension)
		}
	}
	return extensions
}

// IsExtensionConnected checks if an extension is connected
func (h *Hub) IsExtensionConnected(extension string) bool {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	clients, exists := h.extensionClients[extension]
	return exists && len(clients) > 0
}

// GetExtensionClientCount returns the number of connected clients for an extension
func (h *Hub) GetExtensionClientCount(extension string) int {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	clients, exists := h.extensionClients[extension]
	if !exists {
		return 0
	}
	return len(clients)
}

// GetClientCount returns the number of connected clients
func (h *Hub) GetClientCount() int {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	return len(h.clients)
}

// InitHub initializes the global hub
func InitHub() {
	globalHub = NewHub()
	go globalHub.Run()
	log.Println("WebSocket hub initialized")
}

// GetHub returns the global hub instance
func GetHub() *Hub {
	return globalHub
}

// NotifyIncomingCall sends an incoming call notification to the target extension
func (h *Hub) NotifyIncomingCall(caller, callee, channel string) error {
	callMsg := CallMessage{
		Type:      "incoming_call",
		Caller:    caller,
		Callee:    callee,
		Channel:   channel,
		Status:    "ringing",
		Priority:  "normal",
		Transport: "transport-ws",
	}

	return h.SendToExtension(callee, callMsg)
}

// NotifyCallStatus sends call status updates to relevant extensions
func (h *Hub) NotifyCallStatus(caller, callee, status, channel string) error {
	statusMsg := CallMessage{
		Type:    "call_status",
		Caller:  caller,
		Callee:  callee,
		Channel: channel,
		Status:  status,
	}

	// Send to both caller and callee
	if err := h.SendToExtension(caller, statusMsg); err != nil {
		log.Printf("Failed to send status to caller %s: %v", caller, err)
	}

	if err := h.SendToExtension(callee, statusMsg); err != nil {
		log.Printf("Failed to send status to callee %s: %v", callee, err)
	}

	return nil
}

// NotifyUserStatus broadcasts user status changes
func (h *Hub) NotifyUserStatus(extension, status string) error {
	statusMsg := Message{
		Type:   "user_status",
		From:   extension,
		Status: status,
	}

	return h.BroadcastMessage(statusMsg)
}

// SetUserOfflineOnDisconnect sets a user offline when they disconnect
func (h *Hub) SetUserOfflineOnDisconnect(extension string) {
	if extension == "" {
		return
	}

	log.Printf("Setting user %s offline due to WebSocket disconnection", extension)

	// Call the callback function to update database if available
	if h.OnUserDisconnect != nil {
		if err := h.OnUserDisconnect(extension); err != nil {
			log.Printf("Error setting user %s offline: %v", extension, err)
		}
	} else {
		// Fallback: just broadcast the status change
		h.NotifyUserStatus(extension, "offline")
	}
}

// GetExtensionStatus returns detailed status for an extension
func (h *Hub) GetExtensionStatus(extension string) map[string]interface{} {
	h.mutex.RLock()
	defer h.mutex.RUnlock()

	clients, exists := h.extensionClients[extension]
	status := map[string]interface{}{
		"extension":    extension,
		"ws_connected": exists && len(clients) > 0,
		"client_count": 0,
		"clients":      []string{},
	}

	if exists {
		status["client_count"] = len(clients)
		clientIDs := make([]string, len(clients))
		for i, client := range clients {
			clientIDs[i] = client.ID
		}
		status["clients"] = clientIDs
	}

	return status
}
