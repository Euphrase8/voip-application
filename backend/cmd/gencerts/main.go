package main

// Generates a local Certificate Authority and a server certificate for the
// VoIP backend so the app can be served over HTTPS on the LAN (required for
// camera/microphone access from non-localhost clients).
//
// Usage:
//   go run ./cmd/gencerts <output-dir> [additional-ip-or-hostname...]
//
// Produces in <output-dir>:
//   ca.crt / ca.key       - local CA (install ca.crt into client trust stores)
//   server.crt / server.key - server cert signed by the CA (SANs include the
//                           default LAN IPs + any extra addresses given)

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

// isAPIPA reports whether an IPv4 address is a link-local (169.254.0.0/16)
// APIPA address, which Windows assigns to disconnected virtual adapters.
func isAPIPA(ip net.IP) bool {
	v4 := ip.To4()
	return v4 != nil && v4[0] == 169 && v4[1] == 254
}

// primaryIP returns the machine's primary outbound IPv4 address using the
// UDP-dial trick (the address Windows actually routes traffic from).
func primaryIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return ""
	}
	defer conn.Close()
	if addr, ok := conn.LocalAddr().(*net.UDPAddr); ok {
		return addr.IP.String()
	}
	return ""
}

// detectLocalIPs enumerates the machine's current non-loopback IPv4 addresses
// so certificates always include the IP assigned to the active network
// (the server may be moved between different networks).
func detectLocalIPs() []string {
	var ips []string
	seen := map[string]bool{}
	add := func(s string) {
		ip := net.ParseIP(s)
		if ip == nil || ip.To4() == nil || ip.IsLoopback() || isAPIPA(ip) || seen[s] {
			return
		}
		seen[s] = true
		ips = append(ips, s)
	}

	add("127.0.0.1")

	// The active network's primary address first (most important SAN).
	if prim := primaryIP(); prim != "" {
		add(prim)
	}

	// Fall back to interface enumeration, skipping loopback/APIPA junk.
	ifaces, err := net.Interfaces()
	if err != nil {
		return ips
	}
	for _, iface := range ifaces {
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			var ip net.IP
			switch v := addr.(type) {
			case *net.IPNet:
				ip = v.IP
			case *net.IPAddr:
				ip = v.IP
			}
			if ip != nil {
				add(ip.String())
			}
		}
	}
	return ips
}

func writePEM(path string, blockType string, der []byte, perms os.FileMode) error {
	data := pem.EncodeToMemory(&pem.Block{Type: blockType, Bytes: der})
	return os.WriteFile(path, data, perms)
}

// loadExistingCA reuses an existing CA (ca.crt + ca.key) in outDir so that
// regenerating the server certificate does not invalidate client trust.
func loadExistingCA(outDir string) (*x509.Certificate, *rsa.PrivateKey, error) {
	caCertPEM, err := os.ReadFile(filepath.Join(outDir, "ca.crt"))
	if err != nil {
		return nil, nil, err
	}
	caKeyPEM, err := os.ReadFile(filepath.Join(outDir, "ca.key"))
	if err != nil {
		return nil, nil, err
	}
	certBlock, _ := pem.Decode(caCertPEM)
	if certBlock == nil {
		return nil, nil, fmt.Errorf("invalid ca.crt")
	}
	caCert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return nil, nil, err
	}
	keyBlock, _ := pem.Decode(caKeyPEM)
	if keyBlock == nil {
		return nil, nil, fmt.Errorf("invalid ca.key")
	}
	caKey, err := x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
	if err != nil {
		return nil, nil, err
	}
	return caCert, caKey, nil
}

func main() {
	outDir := "certs"
	if len(os.Args) > 1 {
		outDir = os.Args[1]
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "failed to create output dir: %v\n", err)
		os.Exit(1)
	}

	// --- Certificate Authority (reuse existing if present) ---
	var caKey *rsa.PrivateKey
	var caCert *x509.Certificate
	if existingCA, existingKey, err := loadExistingCA(outDir); err == nil {
		caCert, caKey = existingCA, existingKey
		fmt.Println("Reusing existing CA:", filepath.Join(outDir, "ca.crt"))
	} else {
		caKey, err = rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			fatal("generate CA key", err)
		}
		caSerial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
		if err != nil {
			fatal("generate CA serial", err)
		}
		caTmpl := &x509.Certificate{
			SerialNumber:          caSerial,
			Subject:               pkix.Name{CommonName: "VOIP Local Infra CA"},
			NotBefore:             time.Now().Add(-time.Hour),
			NotAfter:              time.Now().Add(10 * 365 * 24 * time.Hour),
			IsCA:                  true,
			KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
			BasicConstraintsValid: true,
		}
		caDER, err := x509.CreateCertificate(rand.Reader, caTmpl, caTmpl, &caKey.PublicKey, caKey)
		if err != nil {
			fatal("create CA certificate", err)
		}
		caCert, err = x509.ParseCertificate(caDER)
		if err != nil {
			fatal("parse CA certificate", err)
		}
		if err := writePEM(filepath.Join(outDir, "ca.crt"), "CERTIFICATE", caDER, 0o644); err != nil {
			fatal("write ca.crt", err)
		}
		if err := writePEM(filepath.Join(outDir, "ca.key"), "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(caKey), 0o600); err != nil {
			fatal("write ca.key", err)
		}
	}

	// --- Server certificate (signed by the CA) ---
	serverKey, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		fatal("generate server key", err)
	}
	serverSerial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		fatal("generate server serial", err)
	}

	dnsNames := []string{"localhost", "voip-backend", "voip.local"}
	var ips []net.IP
	for _, ipStr := range detectLocalIPs() {
		if ip := net.ParseIP(ipStr); ip != nil {
			ips = append(ips, ip)
		}
	}
	// Additional addresses/hostnames from the command line
	for _, arg := range os.Args[2:] {
		if ip := net.ParseIP(arg); ip != nil {
			dupe := false
			for _, existing := range ips {
				if existing.Equal(ip) {
					dupe = true
					break
				}
			}
			if !dupe {
				ips = append(ips, ip)
			}
		} else {
			dnsNames = append(dnsNames, arg)
		}
	}
	if hostname, err := os.Hostname(); err == nil && hostname != "" {
		dnsNames = append(dnsNames, hostname)
	}

	serverTmpl := &x509.Certificate{
		SerialNumber:          serverSerial,
		Subject:               pkix.Name{CommonName: "voip-backend"},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(3 * 365 * 24 * time.Hour),
		KeyUsage:              x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              dnsNames,
		IPAddresses:           ips,
	}
	serverDER, err := x509.CreateCertificate(rand.Reader, serverTmpl, caCert, &serverKey.PublicKey, caKey)
	if err != nil {
		fatal("create server certificate", err)
	}

	// server.crt = leaf + CA bundle so the server presents the full chain
	// (required by many clients, e.g. Android/iOS, to build a trust path).
	bundle := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: serverDER})
	caCertPEM, err := os.ReadFile(filepath.Join(outDir, "ca.crt"))
	if err == nil {
		bundle = append(bundle, caCertPEM...)
	}
	if err := os.WriteFile(filepath.Join(outDir, "server.crt"), bundle, 0o644); err != nil {
		fatal("write server.crt", err)
	}
	if err := writePEM(filepath.Join(outDir, "server.key"), "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(serverKey), 0o600); err != nil {
		fatal("write server.key", err)
	}

	fmt.Println("Generated certificates in", outDir)
	fmt.Println("  ca.crt      - install into client trust stores (Windows/Android/macOS)")
	fmt.Println("  server.crt  - server certificate (HTTPS on 8443)")
	fmt.Println("  server.key  - server private key")
	fmt.Println("SANs:", dnsNames, ips)
}

func fatal(msg string, err error) {
	fmt.Fprintf(os.Stderr, "%s: %v\n", msg, err)
	os.Exit(1)
}
