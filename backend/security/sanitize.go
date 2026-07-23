package security

import (
	"html"
	"regexp"
	"strings"
)

var (
	scriptPattern = regexp.MustCompile(`(?i)<script[\s>]`)
	onEventPattern = regexp.MustCompile(`(?i)\bon\w+\s*=\s*`)
	jsProtocolPattern = regexp.MustCompile(`(?i)javascript\s*:`)
)

func Sanitize(input string) string {
	result := input

	result = scriptPattern.ReplaceAllString(result, "&lt;script ")
	result = onEventPattern.ReplaceAllString(result, "disabled=")
	result = jsProtocolPattern.ReplaceAllString(result, "disabled:")

	result = html.EscapeString(result)

	result = strings.TrimSpace(result)

	return result
}

func SanitizeMessage(input string) string {
	result := Sanitize(input)

	const maxMessageLength = 5000
	if len(result) > maxMessageLength {
		result = result[:maxMessageLength]
	}

	result = strings.ReplaceAll(result, "\r\n", "\n")
	result = strings.ReplaceAll(result, "\r", "\n")

	return result
}

func IsValidExtension(ext string) bool {
	if ext == "" {
		return false
	}
	match, _ := regexp.MatchString(`^\d{4,6}$`, ext)
	return match
}

func IsValidUsername(username string) bool {
	match, _ := regexp.MatchString(`^[a-zA-Z0-9_-]{3,50}$`, username)
	return match
}
