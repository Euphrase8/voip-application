package security

import (
	"testing"
)

func TestSanitize(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello world", "hello world"},
		{"<script>alert('xss')</script>", "&amp;lt;script alert(&#39;xss&#39;)&lt;/script&gt;"},
		{"<b>bold</b>", "&lt;b&gt;bold&lt;/b&gt;"},
		{"normal text with spaces", "normal text with spaces"},
		{"", ""},
	}

	for _, tt := range tests {
		result := Sanitize(tt.input)
		if result != tt.expected {
			t.Errorf("Sanitize(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestSanitizeMessage(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"hello world", "hello world"},
		{"<script>alert('xss')</script>", "&amp;lt;script alert(&#39;xss&#39;)&lt;/script&gt;"},
		{"normal text", "normal text"},
		{"", ""},
	}

	for _, tt := range tests {
		result := SanitizeMessage(tt.input)
		if result != tt.expected {
			t.Errorf("SanitizeMessage(%q) = %q, want %q", tt.input, result, tt.expected)
		}
	}
}

func TestIsValidExtension(t *testing.T) {
	tests := []struct {
		extension string
		expected  bool
	}{
		{"1000", true},
		{"123456", true},
		{"100", false},
		{"", false},
		{"abc", false},
		{"10000", true},
	}

	for _, tt := range tests {
		result := IsValidExtension(tt.extension)
		if result != tt.expected {
			t.Errorf("IsValidExtension(%q) = %v, want %v", tt.extension, result, tt.expected)
		}
	}
}

func TestIsValidUsername(t *testing.T) {
	tests := []struct {
		username string
		expected bool
	}{
		{"user123", true},
		{"test-user", true},
		{"test_user", true},
		{"ab", false},
		{"", false},
		{"user name", false},
		{"user<script>", false},
	}

	for _, tt := range tests {
		result := IsValidUsername(tt.username)
		if result != tt.expected {
			t.Errorf("IsValidUsername(%q) = %v, want %v", tt.username, result, tt.expected)
		}
	}
}
