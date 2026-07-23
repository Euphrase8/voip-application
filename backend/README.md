# VoIP Backend

A Go-based backend server for the VoIP web application that integrates with Asterisk PBX for call management.

## Features

- **User Authentication**: JWT-based authentication with login/register/logout, token refresh
- **Call Management**: Initiate, answer, hangup, transfer (blind/attended), hold/unhold, record calls through Asterisk AMI
- **Real-time Communication**: WebSocket server with shared event listener system for real-time call notifications, chat, and presence
- **WebRTC Signaling**: Full SDP offer/answer and ICE candidate exchange via WebSocket
- **User Management**: User status tracking, presence, extension management, heartbeat monitoring
- **Call Logging**: Complete call history, active call tracking, export to CSV
- **Voicemail**: Full voicemail system with recording, playback, greetings, and settings
- **Messaging**: One-to-one and group chat with typing indicators, read receipts, file sharing
- **Video Calling**: One-to-one HD video calls with device selection
- **Admin Panel**: User CRUD, system statistics, backups (database/config/call logs), real-time metrics
- **System Health**: Fast and detailed health checks, diagnostics, metrics
- **Video Calling**: One-to-one HD video calls with device selection, mute, camera toggle, full-screen

## Prerequisites

- Go 1.21 or higher
- Asterisk PBX with AMI enabled
- SQLite (included with Go)

## Installation

1. **Clone and setup the project:**
   ```bash
   cd backend
   go mod tidy
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Configure Asterisk AMI:**
   
   Edit `/etc/asterisk/manager.conf`:
   ```ini
   [general]
   enabled = yes
   port = 5038
   bindaddr = 0.0.0.0

   [admin]
   secret = amp111
   read = all
   write = all
   ```

   Edit `/etc/asterisk/http.conf`:
   ```ini
   [general]
   enabled=yes
   bindaddr=0.0.0.0
   bindport=8088
   ```

   Edit `/etc/asterisk/pjsip.conf`:
   ```ini
   [transport-ws]
   type=transport
   protocol=ws
   bind=0.0.0.0:8088

   [1000]
   type=endpoint
   context=default
   disallow=all
   allow=ulaw,alaw
   transport=transport-ws
   auth=1000
   aors=1000

   [1000]
   type=auth
   auth_type=userpass
   password=password1000
   username=1000

   [1000]
   type=aor
   max_contacts=5
   ```

4. **Run the server:**
   ```bash
   go run main.go
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `8080` |
| `HOST` | Server host | `0.0.0.0` |
| `JWT_SECRET` | JWT signing secret | `default-secret-change-this` |
| `JWT_EXPIRY_HOURS` | JWT token expiry | `24` |
| `DB_PATH` | SQLite database path | `./voip.db` |
| `ASTERISK_HOST` | Asterisk server IP | `172.20.10.5` |
| `ASTERISK_AMI_PORT` | Asterisk AMI port | `5038` |
| `ASTERISK_AMI_USERNAME` | AMI username | `admin` |
| `ASTERISK_AMI_SECRET` | AMI password | `amp111` |
| `SIP_DOMAIN` | SIP domain | `172.20.10.5` |
| `SIP_PORT` | SIP port | `8088` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:3000` |
| `DEBUG` | Debug mode | `true` |

## API Endpoints

### Public
- `GET /health` - Health check
- `GET /config` - Frontend configuration
- `POST /config/update` - Update dynamic configuration
- `POST /api/login` - User login
- `POST /api/register` - User registration
- `POST /api/refresh` - Refresh JWT token
- `POST /api/test-asterisk` - Test Asterisk connections

### Protected (Authentication Required)
#### User Management
- `GET /protected/profile` - Get user profile
- `POST /protected/logout` - User logout
- `PUT /protected/status` - Update user status
- `POST /protected/heartbeat` - User heartbeat
- `GET /protected/users` - Get all users
- `GET /protected/users/online` - Get online users
- `GET /protected/users/:extension` - Get user by extension
- `GET /protected/extensions/connected` - Get connected extensions
- `GET /protected/extensions/status` - Get connection status

#### Call Management
- `POST /protected/call/initiate` - Initiate a call
- `POST /protected/call/answer` - Answer a call
- `POST /protected/call/hangup` - Hangup a call
- `POST /protected/call/transfer` - Blind/Attended call transfer
- `POST /protected/call/hold` - Put call on hold
- `POST /protected/call/unhold` - Remove call from hold
- `POST /protected/call/record/start` - Start recording
- `POST /protected/call/record/stop` - Stop recording
- `GET /protected/call/active` - Get active calls
- `GET /protected/call/logs` - Get call history

#### Messaging
- `POST /protected/messages/send` - Send text message
- `POST /protected/messages/send-voice` - Send voice message
- `GET /protected/messages/conversations` - Get conversations
- `GET /protected/messages/unread-count` - Get unread count
- `GET /protected/messages/:userId` - Get messages with user
- `PUT /protected/messages/read/:senderId` - Mark as read
- `POST /protected/messages/group/create` - Create group
- `POST /protected/messages/group/send` - Send group message
- `GET /protected/messages/group/:groupId/messages` - Get group messages
- `GET /protected/messages/groups` - Get user groups

#### Voicemail
- `POST /protected/voicemail/create` - Create voicemail
- `GET /protected/voicemail/list` - List voicemails
- `GET /protected/voicemail/unread-count` - Get unread count
- `GET /protected/voicemail/:id` - Get voicemail details
- `PUT /protected/voicemail/:id/read` - Mark as read
- `DELETE /protected/voicemail/:id` - Delete voicemail
- `GET /protected/voicemail/:id/audio` - Get audio file
- `POST /protected/voicemail/settings` - Update settings
- `GET /protected/voicemail/settings` - Get settings
- `POST /protected/voicemail-greeting` - Upload greeting
- `GET /protected/voicemail-greeting/play` - Play greeting
- `DELETE /protected/voicemail/greeting` - Delete greeting

#### Missed Calls
- `POST /protected/missed-calls/record` - Record missed call
- `GET /protected/missed-calls` - Get missed calls

#### Video Calling (WebRTC Signaling)
- `POST /protected/video/initiate` - Start video call
- `POST /protected/video/accept` - Accept video call
- `POST /protected/video/reject` - Reject video call
- `POST /protected/video/end` - End video call

#### Diagnostics
- `GET /protected/diagnostics` - System diagnostics
- `GET /protected/health` - Fast system health
- `GET /protected/health/detailed` - Detailed system health

### Admin (Admin role required)
- `GET /protected/admin/users` - Get all users
- `POST /protected/admin/users` - Create user
- `PUT /protected/admin/users/:id` - Update user
- `DELETE /protected/admin/users/:id` - Delete user
- `GET /protected/admin/stats` - System statistics
- `DELETE /protected/admin/call-logs/:id` - Delete call log
- `DELETE /protected/admin/call-logs/bulk-delete` - Bulk delete
- `DELETE /protected/admin/call-logs/clear-all` - Clear all logs
- `GET /protected/admin/export/call-logs` - Export CSV
- `GET /protected/admin/metrics/realtime` - Real-time metrics
- `POST /protected/admin/call` - Admin initiate call
- `GET /protected/admin/active-calls` - Admin get active calls
- `POST /protected/admin/terminate-call` - Admin terminate call
- `POST /protected/admin/backup` - Create backup
- `GET /protected/admin/backup/status/:id` - Backup status
- `GET /protected/admin/backups` - List backups
- `GET /protected/admin/backup/download/:id` - Download backup
- `DELETE /protected/admin/backup/:id` - Delete backup
- `POST /protected/admin/backup/restore/:id` - Restore backup

### WebSocket
- `GET /ws?extension=<extension>` - WebSocket connection

## Default Users

The system creates default users on first run:

| Username | Password | Extension | Role |
|----------|----------|-----------|------|
| `admin` | `password` | `1000` | `admin` |
| `user1` | `password` | `1001` | `user` |
| `user2` | `password` | `1002` | `user` |
| `user3` | `password` | `1003` | `user` |

⚠️ **IMPORTANT**: Change these passwords immediately in production.

## WebSocket Messages

### Client -> Server
| Type | Description | Fields |
|------|-------------|--------|
| `ping` | Heartbeat | - |
| `call_status` | Call status update | `to`, `status` |
| `hangup` | Hangup call | `channel` |
| `answer_call` | Answer call | `channel` |
| `user_status` | Status change | `status` (online/offline/busy/away) |
| `user_online` | User came online | - |
| `user_offline` | User went offline | - |
| `webrtc_call_accepted` | WebRTC call accepted | `to` |
| `webrtc_call_rejected` | WebRTC call rejected | `to` |
| `webrtc_offer` | WebRTC SDP offer | `to`, `data` |
| `webrtc_answer` | WebRTC SDP answer | `to`, `data` |
| `webrtc_ice_candidate` | ICE candidate | `to`, `data` |
| `webrtc_call_ended` | WebRTC call ended | `to` |
| `chat_message` | Chat message | `to`, `data` |
| `chat_typing` | Typing indicator | `to`, `data` |
| `chat_read` | Read receipt | `to` |

### Server -> Client
| Type | Description | Fields |
|------|-------------|--------|
| `welcome` | Connection established | `status` |
| `pong` | Heartbeat response | - |
| `incoming_call` | Incoming call | `caller`, `callee`, `channel`, `status` |
| `call_status` | Call status | `caller`, `callee`, `channel`, `status` |
| `call_ended` | Call ended | `from`, `channel`, `status` |
| `call_answered` | Call answered | `from`, `channel`, `status` |
| `user_status` | User status broadcast | `from`, `status` |
| `user_status_changed` | Status changed | `from`, `status` |
| `chat_message` | New message | `from`, `to`, `data` |
| `chat_message_sent` | Message sent confirmation | `from`, `data` |
| `chat_group_message` | Group message | `from`, `data` |
| `chat_typing` | Typing indicator | `from`, `to`, `data` |
| `chat_read` | Read receipt | `from`, `to` |
| `voicemail_new` | New voicemail | `to`, `data` |

## Troubleshooting

### Common Issues

1. **AMI Connection Failed**
   - Check Asterisk AMI configuration
   - Verify network connectivity
   - Check firewall settings

2. **WebSocket Connection Issues**
   - Verify CORS configuration
   - Check frontend WebSocket URL
   - Ensure proper authentication

3. **Call Initiation Fails**
   - Check Asterisk dialplan
   - Verify SIP endpoint configuration
   - Check extension registration

### Logs

Enable debug mode for detailed logging:
```bash
DEBUG=true go run main.go
```

## Development

### Project Structure
```
backend/
├── asterisk/          # Asterisk AMI integration
├── auth/              # JWT authentication
├── config/            # Configuration management
├── database/          # Database setup and migrations
├── handlers/          # HTTP request handlers
├── middleware/        # HTTP middleware (auth, rate limit)
├── models/            # Data models (13 tables)
├── security/          # Input sanitization utilities
├── services/          # Background services (status cleanup)
├── websocket/         # WebSocket server (hub + client)
├── main.go           # Application entry point (routes)
├── go.mod            # Go module definition
├── Makefile          # Build/Test/Run targets
└── README.md         # This file
```

### Testing

```bash
go test ./...          # Run all tests
go test -v ./...       # Run with verbose output
go vet ./...           # Static analysis
```

### Adding New Features

1. Define models in `models/`
2. Create handlers in `handlers/`
3. Add routes in `main.go`
4. Add models to `database/` AutoMigrate

### Security Notes

- JWT_SECRET must be a strong random value (64+ char hex)
- Change AMI credentials from defaults
- Change default user passwords
- Use HTTPS/WSS in production
- Configure CORS origins explicitly

## License

This project is licensed under the Apache 2.0 License.
