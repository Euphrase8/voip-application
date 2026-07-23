package websocket

import (
	"encoding/json"
	"testing"
	"time"
)

func TestNewHub(t *testing.T) {
	hub := NewHub()
	if hub == nil {
		t.Fatal("Expected non-nil hub")
	}
	if hub.clients == nil {
		t.Error("Expected clients map to be initialized")
	}
	if hub.extensionClients == nil {
		t.Error("Expected extensionClients map to be initialized")
	}
	if hub.closedChannels == nil {
		t.Error("Expected closedChannels map to be initialized")
	}
}

func TestHubRun(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	client := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-1",
		Extension: "1001",
	}

	hub.register <- client
	time.Sleep(50 * time.Millisecond)

	if !hub.IsExtensionConnected("1001") {
		t.Error("Expected extension 1001 to be connected")
	}

	count := hub.GetExtensionClientCount("1001")
	if count != 1 {
		t.Errorf("Expected 1 client for extension 1001, got %d", count)
	}

	hub.unregister <- client
	time.Sleep(50 * time.Millisecond)

	if hub.IsExtensionConnected("1001") {
		t.Error("Expected extension 1001 to be disconnected")
	}
}

func TestSendToExtension(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	client := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-2",
		Extension: "1002",
	}

	hub.register <- client
	time.Sleep(50 * time.Millisecond)

	// Drain welcome message
	drainChannel(client.send)

	err := hub.SendToExtension("1002", map[string]interface{}{"type": "test", "data": "value"})
	if err != nil {
		t.Fatalf("SendToExtension failed: %v", err)
	}

	select {
	case msg := <-client.send:
		var result map[string]interface{}
		if err := json.Unmarshal(msg, &result); err != nil {
			t.Fatalf("Failed to unmarshal message: %v", err)
		}
		if result["type"] != "test" {
			t.Errorf("Expected type 'test', got '%s'", result["type"])
		}
		if result["data"] != "value" {
			t.Errorf("Expected data 'value', got '%s'", result["data"])
		}
	case <-time.After(time.Second):
		t.Fatal("Timeout waiting for message")
	}
}

func TestSendToExtension_NoClient(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	err := hub.SendToExtension("nonexistent", map[string]interface{}{"type": "test"})
	if err == nil {
		t.Fatal("Expected error for nonexistent extension")
	}
}

func TestBroadcastMessage(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	client1 := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-3",
		Extension: "1003",
	}
	client2 := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-4",
		Extension: "1004",
	}

	hub.register <- client1
	hub.register <- client2
	time.Sleep(50 * time.Millisecond)

	// Drain welcome messages
	drainChannel(client1.send)
	drainChannel(client2.send)

	err := hub.BroadcastMessage(map[string]interface{}{"type": "broadcast_test"})
	if err != nil {
		t.Fatalf("BroadcastMessage failed: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	assertMessageType(t, client1.send, "broadcast_test")
	assertMessageType(t, client2.send, "broadcast_test")
}

func drainChannel(ch chan []byte) {
	for {
		select {
		case <-ch:
		default:
			return
		}
	}
}

func assertMessageType(t *testing.T, ch chan []byte, expectedType string) {
	t.Helper()
	select {
	case msg := <-ch:
		var result map[string]interface{}
		if err := json.Unmarshal(msg, &result); err != nil {
			t.Fatalf("Failed to unmarshal: %v", err)
		}
		if result["type"] != expectedType {
			t.Errorf("Expected type '%s', got '%s'", expectedType, result["type"])
		}
	case <-time.After(time.Second):
		t.Fatal("Timeout waiting for message on channel")
	}
}

func TestGetConnectedExtensions(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	extensions := hub.GetConnectedExtensions()
	if len(extensions) != 0 {
		t.Errorf("Expected 0 connected extensions, got %d", len(extensions))
	}

	client := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-5",
		Extension: "1005",
	}
	hub.register <- client
	time.Sleep(50 * time.Millisecond)

	extensions = hub.GetConnectedExtensions()
	if len(extensions) != 1 || extensions[0] != "1005" {
		t.Errorf("Expected [1005], got %v", extensions)
	}
}

func TestGetClientCount(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	count := hub.GetClientCount()
	if count != 0 {
		t.Errorf("Expected 0 clients, got %d", count)
	}

	client1 := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-6",
		Extension: "1006",
	}
	client2 := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-7",
		Extension: "1007",
	}

	hub.register <- client1
	hub.register <- client2
	time.Sleep(50 * time.Millisecond)

	count = hub.GetClientCount()
	if count != 2 {
		t.Errorf("Expected 2 clients, got %d", count)
	}
}

func TestNotifyIncomingCall(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	client := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-8",
		Extension: "1008",
	}
	hub.register <- client
	time.Sleep(50 * time.Millisecond)

	// Drain welcome message
	drainChannel(client.send)

	err := hub.NotifyIncomingCall("1000", "1008", "test-channel-1")
	if err != nil {
		t.Fatalf("NotifyIncomingCall failed: %v", err)
	}

	select {
	case msg := <-client.send:
		var result map[string]interface{}
		if err := json.Unmarshal(msg, &result); err != nil {
			t.Fatalf("Failed to unmarshal: %v", err)
		}
		if result["type"] != "incoming_call" {
			t.Errorf("Expected type 'incoming_call', got '%s'", result["type"])
		}
		if result["caller"] != "1000" {
			t.Errorf("Expected caller '1000', got '%s'", result["caller"])
		}
		if result["callee"] != "1008" {
			t.Errorf("Expected callee '1008', got '%s'", result["callee"])
		}
		if result["status"] != "ringing" {
			t.Errorf("Expected status 'ringing', got '%s'", result["status"])
		}
	case <-time.After(time.Second):
		t.Fatal("Timeout waiting for incoming call notification")
	}
}

func TestNotifyCallStatus(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	caller := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-9",
		Extension: "1009",
	}
	callee := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-10",
		Extension: "1010",
	}

	hub.register <- caller
	hub.register <- callee
	time.Sleep(50 * time.Millisecond)

	// Drain welcome messages
	drainChannel(caller.send)
	drainChannel(callee.send)

	err := hub.NotifyCallStatus("1009", "1010", "connected", "test-channel-2")
	if err != nil {
		t.Fatalf("NotifyCallStatus failed: %v", err)
	}

	assertMessageType(t, caller.send, "call_status")
	assertMessageType(t, callee.send, "call_status")
}

func TestGetExtensionStatus(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	client := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "test-client-11",
		Extension: "1011",
	}
	hub.register <- client
	time.Sleep(50 * time.Millisecond)

	status := hub.GetExtensionStatus("1011")
	if status["extension"] != "1011" {
		t.Errorf("Expected extension '1011', got '%s'", status["extension"])
	}
	if status["ws_connected"] != true {
		t.Errorf("Expected ws_connected true, got %v", status["ws_connected"])
	}
	if status["client_count"] != 1 {
		t.Errorf("Expected client_count 1, got %d", status["client_count"])
	}

	status = hub.GetExtensionStatus("9999")
	if status["ws_connected"] != false {
		t.Errorf("Expected ws_connected false for nonexistent extension")
	}
}

func TestMultipleDevicesPerExtension(t *testing.T) {
	hub := NewHub()
	go hub.Run()
	time.Sleep(10 * time.Millisecond)

	device1 := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "device-1",
		Extension: "1012",
	}
	device2 := &Client{
		hub:       hub,
		send:      make(chan []byte, 256),
		ID:        "device-2",
		Extension: "1012",
	}

	hub.register <- device1
	hub.register <- device2
	time.Sleep(50 * time.Millisecond)

	// Drain welcome messages
	drainChannel(device1.send)
	drainChannel(device2.send)

	count := hub.GetExtensionClientCount("1012")
	if count != 2 {
		t.Errorf("Expected 2 clients for extension 1012, got %d", count)
	}

	err := hub.SendToExtension("1012", map[string]interface{}{"type": "multi_device_test"})
	if err != nil {
		t.Fatalf("SendToExtension failed: %v", err)
	}

	assertMessageType(t, device1.send, "multi_device_test")
	assertMessageType(t, device2.send, "multi_device_test")
}

func TestSafeCloseSend(t *testing.T) {
	hub := NewHub()

	client := &Client{
		send: make(chan []byte, 1),
		ID:   "test-close",
	}

	hub.safeCloseSend(client)

	hub.safeCloseSend(client)
}

func TestIsChannelClosed(t *testing.T) {
	hub := NewHub()

	client := &Client{
		send: make(chan []byte, 1),
		ID:   "test-is-closed",
	}

	if hub.isChannelClosed(client) {
		t.Error("Expected channel to not be marked as closed initially")
	}

	hub.markChannelClosed(client)

	if !hub.isChannelClosed(client) {
		t.Error("Expected channel to be marked as closed")
	}
}
