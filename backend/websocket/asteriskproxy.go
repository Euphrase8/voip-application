package websocket

import (
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"voip-backend/config"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// proxyOriginAllowed permits same-origin and configured CORS origins, matching
// the main /ws handler, so browsers can reach the Asterisk proxy from any
// origin the app is served on.
func proxyOriginAllowed(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if config.AppConfig != nil {
		for _, allowed := range config.AppConfig.CORSOrigins {
			if strings.EqualFold(origin, allowed) {
				return true
			}
		}
	}
	if u, err := url.Parse(origin); err == nil && u.Hostname() != "" {
		reqHost := r.Host
		if h, _, err := net.SplitHostPort(reqHost); err == nil {
			reqHost = h
		}
		if strings.EqualFold(u.Hostname(), reqHost) {
			return true
		}
	}
	if strings.HasPrefix(origin, "file://") || strings.HasPrefix(origin, "capacitor://") {
		return true
	}
	log.Printf("[AsteriskProxy] Rejected connection from origin: %s", origin)
	return false
}

// HandleAsteriskProxy bridges a browser WebSocket to Asterisk's WebSocket
// transport (/ws on the SIP HTTP port). Asterisk often runs in WSL behind a NAT
// IP that only the backend can reach, so browsers dial wss://<backend>/asterisk-ws
// and this handler tunnels the traffic to ws://<asterisk>:8088/ws.
func HandleAsteriskProxy(c *gin.Context) {
	targetAddr := net.JoinHostPort(config.AppConfig.AsteriskHost, config.AppConfig.SIPPort)
	targetURL := "ws://" + targetAddr + "/ws"

	clientProtocols := []string{}
	if h := c.GetHeader("Sec-WebSocket-Protocol"); h != "" {
		for _, p := range strings.Split(h, ",") {
			if t := strings.TrimSpace(p); t != "" {
				clientProtocols = append(clientProtocols, t)
			}
		}
	}

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Subprotocols:     clientProtocols,
	}
	upstream, resp, err := dialer.Dial(targetURL, nil)
	if err != nil {
		log.Printf("[AsteriskProxy] Cannot reach Asterisk WebSocket at %s: %v", targetURL, err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Asterisk WebSocket unreachable"})
		return
	}
	defer upstream.Close()
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}

	upgrader := websocket.Upgrader{
		HandshakeTimeout: 10 * time.Second,
		CheckOrigin:      proxyOriginAllowed,
	}
	if len(clientProtocols) > 0 {
		upgrader.Subprotocols = clientProtocols
	}

	client, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("[AsteriskProxy] Failed to upgrade client: %v", err)
		return
	}
	defer client.Close()

	log.Printf("[AsteriskProxy] Bridging client <-> %s (protocols: %v)", targetURL, clientProtocols)

	done := make(chan struct{}, 2)
	go proxyPipe(client, upstream, done)
	go proxyPipe(upstream, client, done)
	<-done
	<-done
	log.Printf("[AsteriskProxy] Connection closed")
}

// proxyPipe copies messages from src to dst until either side fails.
func proxyPipe(dst, src *websocket.Conn, done chan struct{}) {
	defer func() { done <- struct{}{} }()
	for {
		mt, msg, err := src.ReadMessage()
		if err != nil {
			return
		}
		if err := dst.WriteMessage(mt, msg); err != nil {
			return
		}
	}
}
