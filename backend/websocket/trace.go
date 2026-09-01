package websocket

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

var (
	traceMu    sync.Mutex
	traceFile  *os.File
	traceInited bool
)

// traceLog appends a WebRTC signaling trace line to a file so the real
// two-browser call flow can be inspected even when the backend's stdout is
// not captured. It logs to backend/ws-traffic.log (next to the module).
func traceLog(format string, args ...interface{}) {
	traceMu.Lock()
	defer traceMu.Unlock()

	if !traceInited {
		traceInited = true
		dirname := "."
		if exe, err := os.Executable(); err == nil {
			dirname = filepath.Dir(exe)
		}
		path := filepath.Join(dirname, "ws-traffic.log")
		f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return
		}
		traceFile = f
	}

	if traceFile == nil {
		return
	}
	ts := time.Now().Format("15:04:05.000")
	line := fmt.Sprintf("[%s] "+format+"\n", ts)
	_, _ = traceFile.WriteString(fmt.Sprintf(line, args...))
}
