package handlers

import (
	"net"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"voip-backend/config"
	"voip-backend/certs"

	"github.com/gin-gonic/gin"
)

// tlsCertDir returns the directory the backend reads certificates from.
// TLS_CERT_DIR overrides it, otherwise it matches main.go's default (certs/).
func tlsCertDir() string {
	if dir := os.Getenv("TLS_CERT_DIR"); dir != "" {
		return dir
	}
	return filepath.Join("certs")
}

// tlsPort returns the HTTPS port the backend listens on.
func tlsPort() string {
	if port := os.Getenv("TLS_PORT"); port != "" {
		return port
	}
	return "8443"
}

// asteriskHostForForm returns the host the BACKEND uses to reach Asterisk. The
// IP configuration form is prefilled from here, and its "Test Connections"
// button asks the backend to dial that host, so it must be reachable from the
// backend itself (e.g. 127.0.0.1 for Asterisk running in WSL).
func asteriskHostForForm() string {
	return config.AppConfig.AsteriskHost
}

// GetServerInfo returns network + TLS details so the IP configuration page can
// prefill the form and guide the user to the correct HTTPS address.
func GetServerInfo(c *gin.Context) {
	primary := certs.PrimaryIP()
	ips := certs.DetectLocalIPs()
	hostname, _ := os.Hostname()

	certExists, caSubject, certExpiry, certDNS, certIPs := certs.Status(tlsCertDir())
	tlsPortStr := tlsPort()

	// The TLS URL must be reachable from the client, so build it from the host
	// the client actually used to reach the server (PrimaryIP can be a virtual
	// adapter the client cannot route to).
	tlsHost := ""
	if c.Request != nil && c.Request.Host != "" {
		if h, _, err := net.SplitHostPort(c.Request.Host); err == nil {
			tlsHost = h
		} else {
			tlsHost = c.Request.Host
		}
	}
	if tlsHost == "" {
		tlsHost = primary
	}
	tlsURL := "https://" + tlsHost
	if tlsPortStr != "443" {
		tlsURL += ":" + tlsPortStr
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"server": gin.H{
			"hostname":   hostname,
			"primary_ip": primary,
			"all_ips":    ips,
		},
		"backend": gin.H{
			"host": config.AppConfig.Host,
			"port": config.AppConfig.Port,
		},
		"asterisk": gin.H{
			"host":     asteriskHostForForm(),
			"sip_port": config.AppConfig.SIPPort,
			"ami_port": config.AppConfig.AsteriskAMIPort,
		},
		"tls": gin.H{
			"enabled":      certExists,
			"port":         tlsPortStr,
			"url":          tlsURL,
			"ca_subject":   caSubject,
			"cert_expires": certExpiry.Format(time.RFC3339),
			"cert_dns":     certDNS,
			"cert_ips":     certIPs,
			"ca_download":  "/api/server-info/ca.crt",
		},
	})
}

// RegenerateCerts re-issues the server certificate for the current network
// (reusing the CA so existing client trust stays valid).
func RegenerateCerts(c *gin.Context) {
	result, err := certs.Regenerate(tlsCertDir(), nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Certificates regenerated for the current network",
		"result": gin.H{
			"new_ca":       result.NewCA,
			"dns_names":    result.DNSNames,
			"ip_addresses": result.IPs,
			"cert_file":    result.CertFile,
			"key_file":     result.KeyFile,
			"ca_file":      result.CAFile,
			"expires":      result.NotAfter.Format(time.RFC3339),
		},
		"note": "Restart the backend so the HTTPS listener loads the new certificates.",
	})
}

// DownloadCA serves the local CA certificate so clients can install it and
// trust the HTTPS server certificate.
func DownloadCA(c *gin.Context) {
	caPath := filepath.Join(tlsCertDir(), "ca.crt")
	if _, err := os.Stat(caPath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"success": false,
			"error":   "CA certificate not found. Generate certificates first.",
		})
		return
	}
	c.FileAttachment(caPath, "voip-local-ca.crt")
}
