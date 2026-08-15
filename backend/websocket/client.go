package websocket

import (
	"crypto/rand"
	"encoding/json"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"voip-backend/auth"
	"voip-backend/config"

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
		origin := r.Header.Get("Origin")
		if origin == "" {
			return true
		}
		// Check against configurable origins from AppConfig
		if config.AppConfig != nil {
			for _, allowed := range config.AppConfig.CORSOrigins {
				if strings.EqualFold(origin, allowed) {
					return true
				}
			}
		}
		// Allow same-origin connections (the backend serves the frontend itself,
		// e.g. https://192.168.1.8 or http://localhost:8080).
		if u, err := url.Parse(origin); err == nil && u.Hostname() != "" {
			reqHost := r.Host
			if h, _, err := net.SplitHostPort(reqHost); err == nil {
				reqHost = h
			}
			if strings.EqualFold(u.Hostname(), reqHost) {
				return true
			}
		}
		// Also allow file:// and capacitor:// for development
		if strings.HasPrefix(origin, "file://") || strings.HasPrefix(origin, "capacitor://") {
			return true
		}
		log.Printf("[WS] Rejected connection from origin: %s", origin)
		return false
	},
}

// rate limiter for WebSocket connections
var (
	wsRateLimiters = make(map[string]*wsRateLimiter)
	wsRateMu       sync.Mutex
)

type wsRateLimiter struct {
	count    int
	lastSeen time.Time
}

func checkWSRateLimit(ip string) bool {
	wsRateMu.Lock()
	defer wsRateMu.Unlock()

	now := time.Now()
	rl, exists := wsRateLimiters[ip]

	if !exists || now.Sub(rl.lastSeen) > time.Minute {
		wsRateLimiters[ip] = &wsRateLimiter{
			count:    1,
			lastSeen: now,
		}
		return true
	}

	if rl.count >= 20 {
		log.Printf("[WS] Rate limit exceeded for IP: %s", ip)
		return false
	}

	rl.count++
	rl.lastSeen = now
	return true
}

// init starts periodic cleanup of stale rate limiters
func init() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			wsRateMu.Lock()
			now := time.Now()
			for ip, rl := range wsRateLimiters {
				if now.Sub(rl.lastSeen) > 10*time.Minute {
					delete(wsRateLimiters, ip)
				}
			}
			wsRateMu.Unlock()
		}
	}()
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
			// Notify only the other party about the hangup instead of broadcasting
			hangupMsg := Message{
				Type:    "call_ended",
				From:    c.Extension,
				Channel: msg.Channel,
				Status:  "ended",
			}
			if peer := extensionFromChannel(msg.Channel); peer != "" {
				c.hub.SendToExtension(peer, hangupMsg)
			} else {
				c.hub.BroadcastMessage(hangupMsg)
			}
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
			if peer := extensionFromChannel(msg.Channel); peer != "" {
				c.hub.SendToExtension(peer, answerMsg)
			} else {
				c.hub.BroadcastMessage(answerMsg)
			}
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

	case "webrtc_call_cancelled":
		// Forward call cancellation (caller cancelled while ringing) to peer
		if msg.To != "" {
			c.hub.SendToExtension(msg.To, msg)
		}

	case "video_call_request":
		// Forward video call request to target extension
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

	// Check for IP rate limiting
	clientIP := c.ClientIP()
	if !checkWSRateLimit(clientIP) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "Rate limit exceeded"})
		return
	}

	// Find token from header or query param
	token := c.Query("token")
	authHeader := c.GetHeader("Authorization")
	if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
		token = strings.TrimPrefix(authHeader, "Bearer ")
	}

	// Validate token
	if token == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	claims, err := validateToken(token)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
		return
	}

	// Verify the extension matches the token
	if claims.Extension != extension {
		c.JSON(http.StatusForbidden, gin.H{"error": "Extension mismatch"})
		return
	}

	// Check for duplicate connections (max 3 per extension). When the cap is
	// reached, replace the oldest connection rather than rejecting the new one,
	// so a leaked/stale client can never lock out reconnects.
	hub := GetHub()
	if hub != nil {
		clientCount := hub.GetExtensionClientCount(extension)
		if clientCount >= 3 {
			log.Printf("[WS] Too many connections for extension %s: %d - disconnecting oldest", extension, clientCount)
			hub.DisconnectOldestForExtension(extension)
		}
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	client := &Client{
		hub:       hub,
		conn:      conn,
		send:      make(chan []byte, 256),
		ID:        generateClientID(),
		Extension: extension,
	}

	client.hub.register <- client

	go client.writePump()
	go client.readPump()

	log.Printf("WebSocket client connected: %s (extension: %s)", client.ID, extension)
}

func validateToken(tokenString string) (*auth.Claims, error) {
	claims, err := auth.ValidateToken(tokenString)
	if err != nil {
		return nil, err
	}
	return claims, nil
}

// extensionFromChannel extracts a numeric extension from a channel identifier.
// Returns "" if the channel does not contain a resolvable peer extension.
func extensionFromChannel(channel string) string {
	if strings.HasPrefix(channel, "PJSIP/") {
		ext := strings.TrimPrefix(channel, "PJSIP/")
		ext = strings.SplitN(ext, "-", 2)[0]
		if len(ext) >= 3 && len(ext) <= 6 {
			for _, r := range ext {
				if r < '0' || r > '9' {
					return ""
				}
			}
			return ext
		}
	}
	return ""
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
