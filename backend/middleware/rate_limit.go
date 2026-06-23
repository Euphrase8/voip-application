package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type rateLimiter struct {
	mu        sync.Mutex
	visitors  map[string]*visitor
	rate      int
	burst     int
	window    time.Duration
}

type visitor struct {
	tokens    int
	lastSeen  time.Time
}

var (
	apiLimiter = &rateLimiter{
		visitors: make(map[string]*visitor),
		rate:     10,
		burst:    20,
		window:   time.Second,
	}
	authLimiter = &rateLimiter{
		visitors: make(map[string]*visitor),
		rate:     5,
		burst:    10,
		window:   time.Minute,
	}
	cleanupTicker = time.NewTicker(10 * time.Minute)
)

func init() {
	go func() {
		for range cleanupTicker.C {
			apiLimiter.cleanup()
			authLimiter.cleanup()
		}
	}()
}

func (rl *rateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	threshold := time.Now().Add(-10 * time.Minute)
	for ip, v := range rl.visitors {
		if v.lastSeen.Before(threshold) {
			delete(rl.visitors, ip)
		}
	}
}

func (rl *rateLimiter) allow(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	v, exists := rl.visitors[ip]
	now := time.Now()

	if !exists {
		rl.visitors[ip] = &visitor{tokens: rl.burst - 1, lastSeen: now}
		return true
	}

	elapsed := now.Sub(v.lastSeen)
	v.lastSeen = now

	refill := int(elapsed / rl.window)
	if refill > 0 {
		v.tokens += refill * rl.rate
		if v.tokens > rl.burst {
			v.tokens = rl.burst
		}
	}

	if v.tokens > 0 {
		v.tokens--
		return true
	}

	return false
}

func RateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !apiLimiter.allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded. Please try again later.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}

func AuthRateLimitMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		if !authLimiter.allow(ip) {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Too many login attempts. Please try again later.",
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
