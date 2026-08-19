package asterisk

import (
	"fmt"
	"log"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"voip-backend/config"
)

var (
	// configMu serialises writes to pjsip.conf and extensions.conf so concurrent
	// user registrations don't race on the config files.
	configMu sync.Mutex
)

// pjsipConfPath and extensionsConfPath are the absolute paths inside the WSL
// distro. They're kept as package-level vars so tests could override them.
var (
	pjsipConfPath    = "/etc/asterisk/pjsip.conf"
	extensionsConfPath = "/etc/asterisk/extensions.conf"
)

// RunWSLCommand executes a shell command inside the configured WSL distro as
// root and returns the combined output. Returns an error if WSL is not
// configured or the command fails.
func RunWSLCommand(args ...string) (string, error) {
	wslDistro := config.AppConfig.AsteriskWSLDistro
	if wslDistro == "" {
		return "", fmt.Errorf("ASTERISK_WSL_DISTRO not configured")
	}

	fullArgs := append([]string{"-d", wslDistro, "-u", "root", "--"}, args...)
	cmd := exec.Command("wsl", fullArgs...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return string(output), fmt.Errorf("wsl command failed: %v, output: %s", err, strings.TrimSpace(string(output)))
	}
	return strings.TrimSpace(string(output)), nil
}

// AddEndpoint creates a PJSIP endpoint, auth, and AOR block in pjsip.conf
// for the given extension + SIP password, then reloads Asterisk.
// It is safe to call concurrently.
func AddEndpoint(extension, sipPassword string) error {
	configMu.Lock()
	defer configMu.Unlock()

	log.Printf("[AsteriskConfig] Adding PJSIP endpoint for extension %s", extension)

	// Read current pjsip.conf
	contents, err := readFile(pjsipConfPath)
	if err != nil {
		return fmt.Errorf("read pjsip.conf: %w", err)
	}

	// Check if the extension already exists
	if endpointExists(contents, extension) {
		log.Printf("[AsteriskConfig] Endpoint %s already exists in pjsip.conf, skipping", extension)
		return nil
	}

	// Build the new PJSIP block
	block := buildEndpointBlock(extension, sipPassword)

	// Insert the block before the [global] section (or append at end)
	contents = insertBeforeGlobal(contents, block)

	// Write the updated config
	if err := writeFile(pjsipConfPath, contents); err != nil {
		return fmt.Errorf("write pjsip.conf: %w", err)
	}

	// Ensure the extensions.conf dialplan covers this extension length
	if err := ensureDialplanCovers(extension); err != nil {
		log.Printf("[AsteriskConfig] Warning: failed to update dialplan: %v", err)
	}

	// Reload Asterisk PJSIP and dialplan
	if err := reloadAsterisk(); err != nil {
		return fmt.Errorf("reload asterisk: %w", err)
	}

	log.Printf("[AsteriskConfig] Successfully added PJSIP endpoint for extension %s", extension)
	return nil
}

// RemoveEndpoint removes the PJSIP endpoint, auth, and AOR block for the
// given extension from pjsip.conf, then reloads Asterisk.
func RemoveEndpoint(extension string) error {
	configMu.Lock()
	defer configMu.Unlock()

	log.Printf("[AsteriskConfig] Removing PJSIP endpoint for extension %s", extension)

	contents, err := readFile(pjsipConfPath)
	if err != nil {
		return fmt.Errorf("read pjsip.conf: %w", err)
	}

	if !endpointExists(contents, extension) {
		log.Printf("[AsteriskConfig] Endpoint %s not found in pjsip.conf, nothing to remove", extension)
		return nil
	}

	contents = removeEndpointBlock(contents, extension)

	if err := writeFile(pjsipConfPath, contents); err != nil {
		return fmt.Errorf("write pjsip.conf: %w", err)
	}

	if err := reloadAsterisk(); err != nil {
		return fmt.Errorf("reload asterisk: %w", err)
	}

	log.Printf("[AsteriskConfig] Successfully removed PJSIP endpoint for extension %s", extension)
	return nil
}

// SyncAllEndpoints rebuilds pjsip.conf from scratch by reading all users from
// the database. This is a heavier operation meant for startup reconciliation.
func SyncAllEndpoints(users []struct {
	Extension  string
	SIPPassword string
}) error {
	configMu.Lock()
	defer configMu.Unlock()

	log.Printf("[AsteriskConfig] Syncing all %d endpoints to pjsip.conf", len(users))

	contents, err := readFile(pjsipConfPath)
	if err != nil {
		return fmt.Errorf("read pjsip.conf: %w", err)
	}

	// Preserve the transport and template sections, only rebuild user sections
	header := extractHeader(contents)

	// Build new user blocks
	var blocks strings.Builder
	for _, u := range users {
		if u.Extension == "" || u.SIPPassword == "" {
			continue
		}
		blocks.WriteString(buildEndpointBlock(u.Extension, u.SIPPassword))
		blocks.WriteString("\n")
	}

	// Rebuild: header + user blocks + global section
	newContents := header + "\n;==========================\n; USER EXTENSIONS\n;==========================\n\n" + blocks.String() + buildGlobalSection()

	if err := writeFile(pjsipConfPath, newContents); err != nil {
		return fmt.Errorf("write pjsip.conf: %w", err)
	}

	if err := reloadAsterisk(); err != nil {
		return fmt.Errorf("reload asterisk: %w", err)
	}

	log.Printf("[AsteriskConfig] Successfully synced all endpoints")
	return nil
}

// --- Internal helpers ---

// readFile reads a file from the WSL filesystem.
func readFile(path string) (string, error) {
	out, err := RunWSLCommand("cat", path)
	if err != nil {
		return "", err
	}
	return out, nil
}

// writeFile writes content to a file in the WSL filesystem using a heredoc-style approach.
func writeFile(path, content string) error {
	// Use a temp file approach to avoid shell escaping issues
	tmpPath := "/tmp/voip_ast_config_tmp"
	_, err := RunWSLCommand("bash", "-c", fmt.Sprintf("cat > %s << 'VOIP_EOF_MARKER'\n%s\nVOIP_EOF_MARKER", tmpPath, content))
	if err != nil {
		return fmt.Errorf("write temp file: %w", err)
	}

	_, err = RunWSLCommand("cp", tmpPath, path)
	if err != nil {
		return fmt.Errorf("copy to target: %w", err)
	}

	_, err = RunWSLCommand("rm", "-f", tmpPath)
	return err
}

// endpointExists checks if a PJSIP endpoint for the given extension exists.
func endpointExists(contents, extension string) bool {
	// Match [extension] as an endpoint section header
	pattern := fmt.Sprintf(`(?m)^\[%s\]\(webrtc_endpoint\)`, regexp.QuoteMeta(extension))
	matched, _ := regexp.MatchString(pattern, contents)
	return matched
}

// buildEndpointBlock generates the three PJSIP config sections for an extension.
func buildEndpointBlock(extension, sipPassword string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "; Extension %s\n", extension)
	fmt.Fprintf(&b, "[%s](webrtc_endpoint)\n", extension)
	fmt.Fprintf(&b, "auth=%s\n", extension)
	fmt.Fprintf(&b, "aors=%s\n\n", extension)

	fmt.Fprintf(&b, "[%s](webrtc_auth)\n", extension)
	fmt.Fprintf(&b, "password=%s\n", sipPassword)
	fmt.Fprintf(&b, "username=%s\n\n", extension)

	fmt.Fprintf(&b, "[%s](webrtc_aor)\n\n", extension)
	return b.String()
}

// insertBeforeGlobal inserts a block of text before the [global] section marker.
// If no [global] section is found, it appends at the end.
func insertBeforeGlobal(contents, block string) string {
	idx := strings.Index(contents, "\n[global]")
	if idx == -1 {
		idx = strings.Index(contents, "[global]")
		if idx == -1 {
			return contents + "\n" + block
		}
	}
	return contents[:idx] + "\n" + block + contents[idx:]
}

// removeEndpointBlock removes all three sections (endpoint, auth, aor) for an extension.
func removeEndpointBlock(contents, extension string) string {
	patterns := []string{
		fmt.Sprintf("[%s](webrtc_endpoint)", extension),
		fmt.Sprintf("[%s](webrtc_auth)", extension),
		fmt.Sprintf("[%s](webrtc_aor)", extension),
		fmt.Sprintf("; Extension %s\n", extension),
	}

	for _, pat := range patterns {
		startIdx := strings.Index(contents, pat)
		if startIdx == -1 {
			continue
		}

		// Find the start of this section (go back to find the blank line or comment before it)
		searchStart := startIdx
		for searchStart > 0 && contents[searchStart-1] == '\n' {
			searchStart--
		}
		if searchStart > 1 && contents[searchStart-2] == '\n' {
			searchStart -= 0 // already at right spot
		}

		// Find the end of this section (next section header or end of file)
		nextSection := strings.Index(contents[startIdx+1:], "\n[")
		var endIdx int
		if nextSection == -1 {
			endIdx = len(contents)
		} else {
			endIdx = startIdx + 1 + nextSection
			// Keep one trailing newline
			for endIdx < len(contents) && contents[endIdx] == '\n' {
				endIdx++
			}
		}

		contents = contents[:startIdx] + contents[endIdx:]
	}

	return contents
}

// extractHeader extracts everything before the "; USER EXTENSIONS" marker
// or before the first user extension block. This preserves transport and
// template sections.
func extractHeader(contents string) string {
	// Look for the user extensions marker
	idx := strings.Index(contents, "; USER EXTENSIONS")
	if idx != -1 {
		return strings.TrimRight(contents[:idx], "\n")
	}

	// Fallback: find the first [XXXX](webrtc_endpoint) pattern
	re := regexp.MustCompile(`(?m)^; Extension \d+`)
	loc := re.FindStringIndex(contents)
	if loc != nil {
		return strings.TrimRight(contents[:loc[0]], "\n")
	}

	// Fallback: return everything before [global]
	idx = strings.Index(contents, "\n[global]")
	if idx != -1 {
		return strings.TrimRight(contents[:idx], "\n")
	}
	return contents
}

// buildGlobalSection returns the standard [global] and [system] sections.
func buildGlobalSection() string {
	return `
;==========================
; GLOBAL SETTINGS
;==========================

[global]
type=global
max_forwards=70
user_agent=Asterisk VoIP Server
default_outbound_endpoint=default_outbound

[system]
type=system
timer_t1=500
timer_b=32000
compact_headers=no
threadpool_initial_size=0
threadpool_auto_increment=5
threadpool_idle_timeout=60
threadpool_max_size=0
`
}

// reloadAsterisk reloads PJSIP and dialplan modules.
func reloadAsterisk() error {
	out, err := RunWSLCommand("asterisk", "-rx", "pjsip reload")
	if err != nil {
		return fmt.Errorf("pjsip reload: %v (output: %s)", err, out)
	}
	log.Printf("[AsteriskConfig] pjsip reload: %s", out)

	out, err = RunWSLCommand("asterisk", "-rx", "dialplan reload")
	if err != nil {
		return fmt.Errorf("dialplan reload: %v (output: %s)", err, out)
	}
	log.Printf("[AsteriskConfig] dialplan reload: %s", out)

	return nil
}

// ensureDialplanCovers checks that extensions.conf has a dialplan pattern
// that covers the given extension length (e.g. _XXXX for 4-digit, _XXXXX for 5-digit).
func ensureDialplanCovers(extension string) error {
	extLen := len(extension)
	pattern := strings.Repeat("X", extLen)

	contents, err := readFile(extensionsConfPath)
	if err != nil {
		return err
	}

	dialPattern := "_" + pattern
	if strings.Contains(contents, dialPattern) {
		return nil // already covered
	}

	log.Printf("[AsteriskConfig] Adding dialplan pattern %s for %d-digit extensions", dialPattern, extLen)

	// Insert the new pattern before the ; Invalid extension line
	insertBlock := fmt.Sprintf(`
; %d-digit extensions
exten => %s,1,NoOp(Call to extension ${EXTEN})
 same => n,Set(CALLERID(name)=Extension ${CALLERID(num)})
 same => n,Dial(PJSIP/${EXTEN},30,rtT)
 same => n,VoiceMail(${EXTEN},u)
 same => n,Hangup()

`, extLen, dialPattern)

	idx := strings.Index(contents, "; Invalid extension")
	if idx == -1 {
		idx = strings.Index(contents, "exten => i,")
	}
	if idx != -1 {
		contents = contents[:idx] + insertBlock + contents[idx:]
	} else {
		contents += insertBlock
	}

	return writeFile(extensionsConfPath, contents)
}
