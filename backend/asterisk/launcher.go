package asterisk

import (
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"
	"voip-backend/config"

	"golang.org/x/crypto/ssh"
)

// TryStartAsterisk attempts to start Asterisk via WSL or SSH.
// Returns nil on success, error if all methods fail.
func TryStartAsterisk() error {
	if config.AppConfig.AsteriskWSLDistro != "" {
		log.Printf("[AsteriskLauncher] Trying WSL (distro: %s)...", config.AppConfig.AsteriskWSLDistro)
		if err := startViaWSL(); err != nil {
			log.Printf("[AsteriskLauncher] WSL failed: %v", err)
		} else {
			log.Printf("[AsteriskLauncher] Asterisk started via WSL")
			return nil
		}
	}

	if config.AppConfig.AsteriskSSHUser != "" {
		log.Printf("[AsteriskLauncher] Trying SSH (%s@%s)...",
			config.AppConfig.AsteriskSSHUser, config.AppConfig.AsteriskHost)
		if err := startViaSSH(); err != nil {
			log.Printf("[AsteriskLauncher] SSH failed: %v", err)
		} else {
			log.Printf("[AsteriskLauncher] Asterisk started via SSH")
			return nil
		}
	}

	return fmt.Errorf("no WSL distro or SSH credentials configured, cannot auto-start Asterisk")
}

// startViaWSL runs "asterisk" inside the WSL distro as root.
func startViaWSL() error {
	cmd := exec.Command("wsl",
		"-d", config.AppConfig.AsteriskWSLDistro,
		"-u", "root",
		"--", "asterisk")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("wsl: %v, output: %s", err, strings.TrimSpace(string(output)))
	}
	log.Printf("[AsteriskLauncher] WSL output: %s", strings.TrimSpace(string(output)))
	return nil
}

// startViaSSH connects via SSH and runs "sudo asterisk".
// Uses password auth from config (development only – use key auth in production).
func startViaSSH() error {
	sshCfg := &ssh.ClientConfig{
		User: config.AppConfig.AsteriskSSHUser,
		Auth: []ssh.AuthMethod{
			ssh.Password(config.AppConfig.AsteriskSSHPassword),
		},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	}

	addr := config.AppConfig.AsteriskHost + ":" + config.AppConfig.AsteriskSSHPort
	client, err := ssh.Dial("tcp", addr, sshCfg)
	if err != nil {
		return fmt.Errorf("ssh dial: %v", err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("ssh session: %v", err)
	}
	defer session.Close()

	output, err := session.CombinedOutput("sudo asterisk")
	if err != nil {
		return fmt.Errorf("sudo asterisk: %v, output: %s", err, strings.TrimSpace(string(output)))
	}
	log.Printf("[AsteriskLauncher] SSH output: %s", strings.TrimSpace(string(output)))
	return nil
}
