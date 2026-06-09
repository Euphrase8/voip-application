package websocket

import (
	"crypto/rand"
	"encoding/json"
	"log"
	"math/big"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period. Must be less than pongWait
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 32768
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow connections from any origin in development
		// In production, you should check the origin properly
		return true
	},
}

// Client is a middleman between the websocket connection and the hub
type Client struct {
	hub *Hub

	// The websocket connection
	conn *websocket.Conn

	// Buffered channel of outbound messages
	send chan []byte

	// Client identifier
	ID string

	// User extension
	Extension string
}

// readPump pumps messages from the websocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, messageBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Parse the message
		var msg Message
		if err := json.Unmarshal(messageBytes, &msg); err != nil {
			log.Printf("Failed to parse message: %v", err)
			continue
		}

		// Handle different message types
		c.handleMessage(msg)
	}
}

// writePump pumps messages from the hub to the websocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// The hub closed the channel
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued chat messages to the current websocket message
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage processes incoming messages from the client
func (c *Client) handleMessage(msg Message) {
	log.Printf("Received message from %s: %+v", c.Extension, msg)

	switch msg.Type {
	case "ping":
		// Respond with pong
		pongMsg := Message{
			Type:      "pong",
			Timestamp: time.Now().Unix(),
		}
		if data, err := json.Marshal(pongMsg); err == nil {
			select {
			case c.send <- data:
			default:
				log.Printf("Failed to send pong to %s", c.Extension)
			}
		}

	case "call_status":
		// Forward call status to the target extension
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	case "hangup":
		// Handle hangup message
		if msg.Channel != "" {
			// Notify other party about hangup
			hangupMsg := Message{
				Type:    "call_ended",
				From:    c.Extension,
				Channel: msg.Channel,
				Status:  "ended",
			}
			c.hub.BroadcastMessage(hangupMsg)
		}

	case "answer_call":
		// Handle call answer
		if msg.Channel != "" {
			answerMsg := Message{
				Type:    "call_answered",
				From:    c.Extension,
				Channel: msg.Channel,
				Status:  "answered",
			}
			c.hub.BroadcastMessage(answerMsg)
		}

	case "user_status":
		// Handle user status updates
		statusMsg := Message{
			Type:      "user_status",
			From:      c.Extension,
			Status:    msg.Status,
			Timestamp: time.Now().Unix(),
		}
		c.hub.BroadcastMessage(statusMsg)

	case "user_online":
		// Handle user coming online
		onlineMsg := Message{
			Type:      "user_status_changed",
			From:      c.Extension,
			Status:    "online",
			Timestamp: time.Now().Unix(),
		}
		c.hub.BroadcastMessage(onlineMsg)

	case "user_offline":
		// Handle user going offline
		offlineMsg := Message{
			Type:      "user_status_changed",
			From:      c.Extension,
			Status:    "offline",
			Timestamp: time.Now().Unix(),
		}
		c.hub.BroadcastMessage(offlineMsg)

	// WebRTC message types
	case "webrtc_call_accepted":
		// Forward call acceptance to caller
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	case "webrtc_call_rejected":
		// Forward call rejection to caller
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	case "webrtc_offer":
		// Forward WebRTC offer to target
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	case "webrtc_answer":
		// Forward WebRTC answer to caller
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	case "webrtc_ice_candidate":
		// Forward ICE candidate to peer
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	case "webrtc_call_ended":
		// Forward call end notification to peer
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	// Chat message types
	case "chat_message":
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	case "chat_typing":
		if msg.To != "" {
			typingMsg := Message{
				Type:      "chat_typing",
				From:      c.Extension,
				To:        msg.To,
				Data:      msg.Data,
				Timestamp: time.Now().Unix(),
			}
			c.hub.SendToExtension(msg.To, typingMsg)
		}

	case "chat_read":
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	default:
		log.Printf("Unknown message type: %s", msg.Type)
	}
}

// HandleWebSocket handles websocket requests from the peer
func HandleWebSocket(c *gin.Context) {
	extension := c.Query("extension")
	if extension == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Extension parameter required"})
		return
	}

	// Optional: Validate token for authenticated connections
	token := c.Query("token")
	if token != "" {
		// TODO: Add token validation here if needed
		// For now, we'll allow connections with extension parameter
		log.Printf("WebSocket connection with token for extension: %s", extension)
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		hub:       GetHub(),
		conn:      conn,
		send:      make(chan []byte, 256),
		ID:        generateClientID(),
		Extension: extension,
	}

	client.hub.register <- client

	// Allow collection of memory referenced by the caller by doing all work in new goroutines
	go client.writePump()
	go client.readPump()

	log.Printf("WebSocket client connected: %s (extension: %s)", client.ID, extension)
}

// generateClientID generates a unique client ID
func generateClientID() string {
	return time.Now().Format("20060102150405") + "-" + randomString(6)
}

// randomString generates a cryptographically secure random string
func randomString(length int) string {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, length)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(charset))))
		if err != nil {
			b[i] = 'a'
			continue
		}
		b[i] = charset[n.Int64()]
	}
	return string(b)
}
