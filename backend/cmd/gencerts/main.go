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

// defaultIPs covers the machine's likely local addresses.
var defaultIPs = []string{
	"127.0.0.1",
	"192.168.137.222",
	"172.30.160.1",
	"172.30.163.165",
	"192.168.1.100",
	"10.0.0.100",
}

func writePEM(path string, blockType string, der []byte, perms os.FileMode) error {
	data := pem.EncodeToMemory(&pem.Block{Type: blockType, Bytes: der})
	return os.WriteFile(path, data, perms)
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

	// --- Certificate Authority ---
	caKey, err := rsa.GenerateKey(rand.Reader, 2048)
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
	caCert, err := x509.ParseCertificate(caDER)
	if err != nil {
		fatal("parse CA certificate", err)
	}
	if err := writePEM(filepath.Join(outDir, "ca.crt"), "CERTIFICATE", caDER, 0o644); err != nil {
		fatal("write ca.crt", err)
	}
	if err := writePEM(filepath.Join(outDir, "ca.key"), "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(caKey), 0o600); err != nil {
		fatal("write ca.key", err)
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
	for _, ipStr := range defaultIPs {
		if ip := net.ParseIP(ipStr); ip != nil {
			ips = append(ips, ip)
		}
	}
	// Additional addresses/hostnames from the command line
	for _, arg := range os.Args[2:] {
		if ip := net.ParseIP(arg); ip != nil {
			ips = append(ips, ip)
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
	if err := writePEM(filepath.Join(outDir, "server.crt"), "CERTIFICATE", serverDER, 0o644); err != nil {
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
