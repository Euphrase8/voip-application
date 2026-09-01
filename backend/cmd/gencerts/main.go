package main

// Generates (or regenerates) the local CA + server certificate for the VoIP
// backend so the app can be served over HTTPS on the LAN.
//
// Usage:
//   go run ./cmd/gencerts <output-dir> [additional-ip-or-hostname...]

import (
	"fmt"
	"os"

	"voip-backend/certs"
)

func main() {
	outDir := "certs"
	if len(os.Args) > 1 {
		outDir = os.Args[1]
	}

	var extra []string
	if len(os.Args) > 2 {
		extra = os.Args[2:]
	}

	res, err := certs.Regenerate(outDir, extra)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to generate certificates: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Generated certificates in", outDir)
	fmt.Println("  ca.crt       - install into client trust stores (Windows/Android/macOS)")
	fmt.Println("  server.crt   - server certificate (HTTPS on 8443)")
	fmt.Println("  server.key   - server private key")
	if res.NewCA {
		fmt.Println("New CA created")
	} else {
		fmt.Println("Reused existing CA")
	}
	fmt.Println("SANs:", res.DNSNames, res.IPs)
}