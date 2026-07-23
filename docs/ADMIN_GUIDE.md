# VoIP Communication System - Administrator Guide

**Version 1.0.0**

---

## Table of Contents

1. [Server Setup](#1-server-setup)
2. [User Management](#2-user-management)
3. [SIP Management](#3-sip-management)
4. [Database Management](#4-database-management)
5. [Asterisk Configuration](#5-asterisk-configuration)
6. [Logs & Monitoring](#6-logs--monitoring)
7. [Backup & Restore](#7-backup--restore)
8. [Security Recommendations](#8-security-recommendations)
9. [API Reference](#9-api-reference)

---

## 1. Server Setup

### Prerequisites

| Component | Requirement |
|-----------|-------------|
| Operating System | Windows 10/11, Linux (Ubuntu 20.04+), macOS |
| Go Runtime | Go 1.21+ (only if compiling from source) |
| Node.js | Node 18+ (only for frontend development) |
| SQLite | Built-in (no separate installation needed) |
| Asterisk PBX | Optional (for SIP calling) |

### Directory Structure

```
voip-application/
├── .env                    # Frontend environment variables
├── package.json            # Frontend dependencies
├── src/                    # Frontend React source code
├── public/                 # Static assets
├── scripts/                # Utility scripts
├── build/                  # Compiled frontend (production)
├── backend/
│   ├── main.go             # Backend entry point
│   ├── .env                # Backend environment variables
│   ├── voip-backend.exe    # Compiled binary (Windows)
│   ├── voip-backend        # Compiled binary (Linux/macOS)
│   ├── run.ps1             # Windows startup script
│   ├── database/           # Database layer
│   ├── handlers/           # API endpoint handlers
│   ├── models/             # Data models
│   ├── middleware/          # Auth, rate limiting
│   ├── websocket/          # WebSocket hub & client
│   ├── asterisk/           # Asterisk AMI integration
│   ├── services/           # Background services
│   ├── config/             # Configuration loader
│   ├── auth/               # JWT utilities
│   └── security/           # Input sanitization
└── docs/                   # Documentation
```

### Environment Variables

#### Backend (backend/.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend HTTP server port | `8080` |
| `HOST` | Bind address | `0.0.0.0` |
| `JWT_SECRET` | Cryptographic key for token signing | Auto-generated |
| `JWT_EXPIRY_HOURS` | Token validity period | `24` |
| `DB_PATH` | SQLite database file path | `./voip.db` |
| `ASTERISK_HOST` | Asterisk PBX IP address | `localhost` |
| `ASTERISK_AMI_PORT` | Asterisk AMI port | `5038` |
| `ASTERISK_AMI_USERNAME` | AMI username | `admin` |
| `ASTERISK_AMI_SECRET` | AMI password | [Set per deployment] |
| `SIP_DOMAIN` | SIP domain | Same as ASTERISK_HOST |
| `SIP_PORT` | SIP WebSocket port | `8088` |
| `PUBLIC_HOST` | Public host for connections | Same as ASTERISK_HOST |
| `CORS_ORIGINS` | Allowed frontend origins | See defaults |
| `DEBUG` | Enable debug logging | `true` |

#### Frontend (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_API_URL` | Backend API URL | `http://127.0.0.1:8080` |
| `REACT_APP_SIP_SERVER` | Asterisk SIP server | `172.30.163.165` |
| `REACT_APP_SIP_PORT` | SIP port | `8088` |
| `REACT_APP_SIP_WS_URL` | SIP WebSocket URL | `ws://[SIP_SERVER]:8088/ws` |
| `REACT_APP_WS_URL` | Backend WebSocket URL | `ws://127.0.0.1:8080/ws` |
| `REACT_APP_CLIENT_IP` | Client IP | Auto-detected |
| `REACT_APP_DEBUG` | Debug mode | `true` |
| `HOST` | Dev server host | `127.0.0.1` |
| `PORT` | Dev server port | `3000` |

### Starting the System

**Start Backend:**
```bash
# Windows
cd backend
.\run.ps1

# Linux/macOS
cd backend
./voip-backend
```

**Start Frontend (Development):**
```bash
npm start
```

**Build Frontend (Production):**
```bash
npm run build
```
Serve the `build/` folder with any web server (nginx, Apache, IIS).

---

## 2. User Management

### Default Users

| Username | Password | Extension | Role |
|----------|----------|-----------|------|
| admin | password | 1000 | admin |
| user1 | password | 1001 | user |
| user2 | password | 1002 | user |
| user3 | password | 1003 | user |

> **WARNING:** Change default passwords immediately in production!

### Admin Dashboard Features

1. Log in as `admin`
2. Navigate to the Admin Dashboard URL
3. Available management features:

- **User Management:** Create, edit, delete users
- **System Stats:** View total users, active calls, today's calls
- **Call Logs:** View, filter, export, delete call logs
- **System Health:** Dashboard showing backend, database, Asterisk, WebSocket status
- **Backup/Restore:** Create and restore system backups
- **Real-time Metrics:** Live WebSocket connections and call activity

### Creating Users via API

```bash
curl -X POST http://localhost:8080/protected/admin/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "SecurePass123!",
    "extension": "3001",
    "role": "user"
  }'
```

### User Roles

| Role | Permissions |
|------|-------------|
| `admin` | Full access: manage users, view all call logs, system settings, backup/restore |
| `user` | Basic access: make/receive calls, send messages, view own call logs |

---

## 3. SIP Management

### SIP Architecture

The system supports two call methods:

1. **WebRTC (Recommended):** Browser-to-browser calls using WebRTC. No SIP registration needed. Signaling goes through the backend WebSocket.

2. **Traditional SIP:** Uses JsSIP library to register with Asterisk via SIP WebSocket. Requires Asterisk PBX.

### SIP Account Fields

| Field | Description | Example |
|-------|-------------|---------|
| Extension | Internal phone number (3-6 digits) | `1001` |
| SIP Password | Auto-generated cryptographically random password | `aB3$xY9#zQ1` |
| SIP Server | Asterisk PBX host | `192.168.1.100` |
| SIP Port | WebSocket port | `8088` |

### Configuring Softphones

Softphone settings for users:

| Setting | Value |
|---------|-------|
| Domain | `[ASTERISK_HOST]` |
| Username | Extension number (e.g., `1001`) |
| Password | SIP password from user record |
| Transport | TCP or UDP (WebSocket for browser clients) |
| Port | `8088` |

---

## 4. Database Management

### Database Location

The SQLite database is stored at: `backend/voip.db`

### Tables

| Table | Description |
|-------|-------------|
| `users` | User accounts, credentials, extensions |
| `call_logs` | Completed call records |
| `active_calls` | Currently active calls |
| `messages` | Chat messages between users |
| `chat_conversations` | Conversation threads |
| `chat_groups` | Group chat definitions |
| `chat_group_members` | Group membership |
| `chat_group_messages` | Group messages |
| `voicemails` | Voicemail recordings |
| `voicemail_greetings` | Custom voicemail greetings |
| `missed_calls` | Missed call records |
| `video_calls` | Video call history |

### Direct Database Access

```bash
# Using sqlite3 CLI
cd backend
sqlite3 voip.db

# Example queries
.tables
SELECT username, extension, role FROM users;
SELECT COUNT(*) FROM call_logs;
SELECT * FROM active_calls;
```

### Database Maintenance

```sql
-- Check database integrity
PRAGMA integrity_check;

-- Reclaim unused space
VACUUM;

-- Get database stats
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_calls FROM call_logs;
SELECT COUNT(*) as total_messages FROM messages;
```

---

## 5. Asterisk Configuration

### Prerequisites

Asterisk PBX must be installed on a Linux server. Refer to `ASTERISK_SETUP.md` for detailed installation.

### AMI Configuration (manager.conf)

```
[admin]
secret = YOUR_STRONG_PASSWORD
read = all
write = all
permit = 0.0.0.0/0.0.0.0
```

### SIP Configuration (pjsip.conf or sip.conf)

```
[1001]
type = endpoint
context = internal
disallow = all
allow = ulaw
auth = 1001
aors = 1001

[1001]
type = auth
auth_type = userpass
password = SIP_PASSWORD
username = 1001

[1001]
type = aor
max_contacts = 5
```

### WebSocket Configuration (http.conf)

```
[general]
enabled = yes
bindaddr = 0.0.0.0
bindport = 8088
tlsenable = no
websocket_enabled = yes
```

### Testing Asterisk Connection

From the backend server:
```bash
# Test TCP connectivity
nc -zv ASTERISK_IP 5038

# Test AMI login
echo -e "Action: Login\nUsername: admin\nSecret: PASSWORD\n\n" | nc ASTERISK_IP 5038
```

---

## 6. Logs & Monitoring

### Log Locations

| Log | Location | Contents |
|-----|----------|----------|
| Backend Activity | `backend/backend.log` | HTTP requests, DB queries, routes |
| Backend Errors | `backend/backend.err.log` | Operational messages, AMI status, errors |
| Backend Stdout | `backend/backend.stdout.log` | Standard output |
| Backend Stderr | `backend/backend.stderr.log` | Standard error |
| Frontend | `frontend.log` | Development server logs |
| Frontend Errors | `frontend.err.log` | Compilation warnings/errors |

### Monitoring Endpoints

**Health Check:**
```http
GET /health
```
Response: `{"service":"voip-backend","status":"ok","response_time_ms":0}`

**Detailed Health (Authenticated):**
```http
GET /protected/health
```
Returns full system health including database, Asterisk, WebSocket, and system metrics.

**System Diagnostics (Authenticated):**
```http
GET /protected/diagnostics
```
Returns comprehensive diagnostics for all system components.

**Real-time Metrics (Admin):**
```http
GET /protected/admin/metrics/realtime
```
Returns live WebSocket connections, active calls, and system load.

### Monitoring Scripts

The `scripts/` directory contains utility scripts:

| Script | Purpose |
|--------|---------|
| `test-backend-health.js` | Test backend health endpoints |
| `test-asterisk-connection.js` | Test Asterisk TCP/AMI connection |
| `test-system-health-service.js` | Test health monitoring service |
| `diagnose-unhealthy-status.js` | Diagnose all services showing unhealthy |
| `force-status-refresh.js` | Force refresh system status |

---

## 7. Backup & Restore

### Creating a Backup

**Via Admin Dashboard:**
1. Log in as admin
2. Go to Admin Dashboard > Backup
3. Select components to include
4. Click "Create Backup"

**Via API:**
```bash
curl -X POST http://localhost:8080/protected/admin/backup \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"include_database": true, "include_config": true, "include_call_logs": true}'
```

### Listing Backups

```bash
curl http://localhost:8080/protected/admin/backups \
  -H "Authorization: Bearer <token>"
```

### Restoring a Backup

```bash
curl -X POST http://localhost:8080/protected/admin/backup/restore/BACKUP_ID \
  -H "Authorization: Bearer <token>"
```

### Backup Files

Backups are stored in `backend/backups/` as ZIP files containing:
- `database.json` - User, call, and message data
- `config.json` - System configuration

---

## 8. Security Recommendations

### Critical Security Measures

1. **JWT Secret:**
   - Generate a unique 64-byte hex secret per deployment
   - Never commit the secret to version control
   - Rotate periodically
   ```bash
   openssl rand -hex 64
   ```

2. **AMI Credentials:**
   - Use strong, unique passwords
   - Restrict AMI access by IP in `manager.conf`
   - Use a VPN or SSH tunnel for AMI traffic

3. **Database:**
   - The SQLite database file contains hashed passwords
   - Restrict file permissions: `chmod 600 voip.db`
   - Regular backups to separate storage

4. **Network:**
   - Use HTTPS in production (not HTTP)
   - Configure CORS to only allow known origins
   - Use a reverse proxy (nginx) in front of the Go backend

### Production Checklist

- [ ] Generate new JWT secret
- [ ] Set strong AMI passwords
- [ ] Change all default user passwords
- [ ] Enable HTTPS/TLS
- [ ] Configure proper CORS origins
- [ ] Disable debug mode (`DEBUG=false`)
- [ ] Set up regular backups
- [ ] Configure firewall rules
- [ ] Use non-root user for backend process
- [ ] Set up log rotation
- [ ] Remove debug endpoints in production

### Firewall Configuration

| Port | Service | Purpose |
|------|---------|---------|
| 8080 | Backend API | Web and WebSocket traffic |
| 3000 | Frontend Dev | Development only |
| 5038 | Asterisk AMI | Backend-Asterisk communication |
| 8088 | Asterisk SIP | SIP WebSocket connections |
| 5060/5061 | SIP UDP/TCP | SIP signaling |

---

## 9. API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/login` | Authenticate user |
| POST | `/api/register` | Create new user account |
| POST | `/api/refresh` | Refresh JWT token |

### User Management (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/protected/profile` | Get current user profile |
| POST | `/protected/logout` | Logout current user |
| GET | `/protected/users` | List all users (admin) |
| GET | `/protected/users/online` | List online users |
| PUT | `/protected/status` | Update user status |
| POST | `/protected/heartbeat` | User heartbeat (keep-alive) |

### Call Management (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/protected/call/initiate` | Start a call |
| POST | `/protected/call/answer` | Answer a call |
| POST | `/protected/call/hangup` | End a call |
| GET | `/protected/call/active` | List active calls |
| GET | `/protected/call/logs` | Get call history |

### Messaging (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/protected/messages/send` | Send a message |
| GET | `/protected/messages/conversations` | List conversations |
| GET | `/protected/messages/:userId` | Get messages with user |
| PUT | `/protected/messages/read/:senderId` | Mark messages as read |

### Voicemail (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/protected/voicemail/create` | Record voicemail |
| GET | `/protected/voicemail/list` | List voicemails |
| GET | `/protected/voicemail/:id` | Get voicemail details |
| DELETE | `/protected/voicemail/:id` | Delete voicemail |
| GET | `/protected/voicemail/:id/audio` | Get voicemail audio file |

### Video Calling (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/protected/video/initiate` | Start a video call |
| POST | `/protected/video/accept` | Accept a video call |
| POST | `/protected/video/reject` | Reject a video call |
| POST | `/protected/video/end` | End a video call |

### Admin (Protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/protected/admin/users` | List all users (admin) |
| POST | `/protected/admin/users` | Create user |
| PUT | `/protected/admin/users/:id` | Update user |
| DELETE | `/protected/admin/users/:id` | Delete user |
| GET | `/protected/admin/stats` | System statistics |
| POST | `/protected/admin/backup` | Create backup |
| GET | `/protected/admin/backups` | List backups |
| POST | `/protected/admin/backup/restore/:id` | Restore backup |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `GET /ws?extension=XXXX` | Real-time signaling, messaging, call events |

WebSocket message types:
- `call-status` - Call state changes
- `new-message` - Incoming chat message
- `user-status` - User online/offline changes
- `notification` - System notifications
- `missed-call` - Missed call alerts

---

## Appendix: Useful Commands

```bash
# Check backend health
curl http://localhost:8080/health

# View real-time backend logs (Linux)
tail -f backend/backend.err.log

# Compile backend from source
cd backend
go build -o voip-backend .

# Run database query
cd backend
sqlite3 voip.db "SELECT username, extension FROM users;"

# Test AMI connection
echo -e "Action: Login\nUsername: admin\nSecret: PASSWORD\n\n" | nc ASTERISK_IP 5038

# Kill backend process
# Windows: taskkill /F /IM voip-backend.exe
# Linux: kill $(lsof -t -i:8080)

# Backup database manually
cp backend/voip.db backend/backups/voip-$(date +%Y%m%d).db
```

---

*End of Administrator Guide*
