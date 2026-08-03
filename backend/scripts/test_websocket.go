package main

import (
	"encoding/json"
	"log"
	"net/url"
	"os"
	"os/signal"
	"time"

	"github.com/gorilla/websocket"
)

type Message struct {
	Type      string      `json:"type"`
	From      string      `json:"from,omitempty"`
	To        string      `json:"to,omitempty"`
	Status    string      `json:"status,omitempty"`
	Channel   string      `json:"channel,omitempty"`
	Timestamp int64       `json:"timestamp,omitempty"`
	Data      interface{} `json:"data,omitempty"`
}

func main() {
	if len(os.Args) < 3 {
		log.Fatal("Usage: go run test_websocket.go <server_url> <extension> [token]")
	}

	serverURL := os.Args[1]
	extension := os.Args[2]
	token := ""
	if len(os.Args) > 3 {
		token = os.Args[3]
	}

	// Parse the server URL and create WebSocket URL
	u, err := url.Parse(serverURL)
	if err != nil {
		log.Fatal("Invalid server URL:", err)
	}

	// Convert HTTP to WebSocket scheme
	if u.Scheme == "http" {
		u.Scheme = "ws"
	} else if u.Scheme == "https" {
		u.Scheme = "wss"
	}

	// Add WebSocket path and extension parameter
	u.Path = "/ws"
	q := u.Query()
	q.Set("extension", extension)
	if token != "" {
		q.Set("token", token)
	}
	u.RawQuery = q.Encode()

	log.Printf("Connecting to WebSocket: %s", u.String())

	// Connect to WebSocket
	c, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		log.Fatal("WebSocket connection failed:", err)
	}
	defer c.Close()

	log.Printf("Connected to WebSocket as extension %s", extension)

	// Channel to handle interrupt signal
	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt)

	// Channel to receive messages
	done := make(chan struct{})

	// Start reading messages
	go func() {
		defer close(done)
		for {
			_, message, err := c.ReadMessage()
			if err != nil {
				log.Println("Read error:", err)
				return
			}

			var msg Message
			if err := json.Unmarshal(message, &msg); err != nil {
				log.Printf("Failed to parse message: %v", err)
				log.Printf("Raw message: %s", string(message))
				continue
			}

			log.Printf("Received: %+v", msg)

			// Auto-respond to pings
			if msg.Type == "ping" {
				pong := Message{
					Type:      "pong",
					Timestamp: time.Now().Unix(),
				}
				if data, err := json.Marshal(pong); err == nil {
					c.WriteMessage(websocket.TextMessage, data)
					log.Printf("Sent pong response")
				}
			}
		}
	}()

	// Send periodic ping messages
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	// Send initial ping
	ping := Message{
		Type:      "ping",
		From:      extension,
		Timestamp: time.Now().Unix(),
	}
	if data, err := json.Marshal(ping); err == nil {
		c.WriteMessage(websocket.TextMessage, data)
		log.Printf("Sent initial ping")
	}

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			// Send ping
			ping := Message{
				Type:      "ping",
				From:      extension,
				Timestamp: time.Now().Unix(),
			}
			if data, err := json.Marshal(ping); err == nil {
				err := c.WriteMessage(websocket.TextMessage, data)
				if err != nil {
					log.Println("Write error:", err)
					return
				}
				log.Printf("Sent ping")
			}
		case <-interrupt:
			log.Println("Interrupt received, closing connection...")

			// Send close message
			err := c.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			if err != nil {
				log.Println("Write close error:", err)
				return
			}

			select {
			case <-done:
			case <-time.After(time.Second):
			}
			return
		}
	}
}
