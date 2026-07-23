# VoIP Communication System - User Manual

**Version 1.0.0**
**For Non-Technical Users**

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [System Requirements](#2-system-requirements)
3. [Installation Guide](#3-installation-guide)
4. [Connecting Devices](#4-connecting-devices)
5. [Creating SIP Accounts](#5-creating-sip-accounts)
6. [Logging Into the System](#6-logging-into-the-system)
7. [Making Calls](#7-making-calls)
8. [Messaging](#8-messaging)
9. [Testing the System](#9-testing-the-system)
10. [Troubleshooting](#10-troubleshooting)
11. [Frequently Asked Questions](#11-frequently-asked-questions)
12. [Maintenance Guide](#12-maintenance-guide)

---

## 1. Introduction

### Purpose of the System

The VoIP Communication System is a professional voice and messaging platform that allows users to make phone calls and send messages over a computer network (LAN or Internet) instead of using traditional telephone lines. This saves money and provides advanced features like call logging, voicemail, and video calling.

### System Overview

The system consists of three main parts:

- **Frontend (Web App):** The interface you see in your web browser. Accessed at `http://localhost:3000` or your server's IP address.
- **Backend (Server):** The brain of the system that manages users, calls, and messages. Runs on your server.
- **Asterisk PBX:** The telephone exchange software that actually connects calls between users.

### Main Features

- Make and receive phone calls between extensions (e.g., extension 1001 calling extension 1002)
- Send and receive text messages
- Voicemail when you miss a call
- Video calls with one-to-one communication
- Call history and logs
- User management for administrators
- Works on any device with a web browser (computer, tablet, smartphone)

---

## 2. System Requirements

### Operating System

| Component | Supported OS |
|-----------|-------------|
| Backend Server | Windows 10/11, Linux (Ubuntu 20.04+), macOS |
| Frontend (Browser) | Any OS with a modern browser |
| Asterisk PBX | Linux (Ubuntu 20.04+ recommended) |

### Hardware

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM (Server) | 2 GB | 4 GB or more |
| Storage | 500 MB free | 10 GB free (for logs and recordings) |
| CPU | 2 cores | 4 cores |

### Browser Requirements

Use one of these browsers for the best experience:

| Browser | Version |
|---------|---------|
| Google Chrome | Version 90 or newer |
| Mozilla Firefox | Version 90 or newer |
| Microsoft Edge | Version 90 or newer |
| Safari (Mac/iOS) | Version 15 or newer |

> **Important:** The system requires **WebRTC** support for calls. All modern browsers support this. If you see a "Browser Compatibility" alert, follow the instructions shown.

### Network Requirements

- All devices must be on the **same local network** (LAN) or connected via VPN
- Network must allow WebSocket connections (port 8080 for backend, port 8088 for Asterisk)
- Microphone access must be allowed in your browser

---

## 3. Installation Guide

### Step 1: Install the Backend Server

#### On Windows:

1. Open the `backend` folder
2. Double-click `voip-backend.exe` -- OR --
3. Open **PowerShell** as Administrator
4. Navigate to the backend folder:
   ```
   cd C:\path\to\voip-application\backend
   ```
5. Run the startup script:
   ```
   .\run.ps1
   ```

> You will see the message: `Starting VoIP backend server on 0.0.0.0:8080`

#### On Linux/macOS:

1. Open Terminal
2. Navigate to the backend folder:
   ```
   cd /path/to/voip-application/backend
   ```
3. Run:
   ```
   ./voip-backend
   ```
   OR if you have Go installed:
   ```
   go run main.go
   ```

### Step 2: Install the Frontend (Web App)

#### Option A: Quick Start (if Node.js is installed)

1. Open a terminal/command prompt
2. Navigate to the project root:
   ```
   cd C:\path\to\voip-application
   ```
3. Install dependencies (one-time only):
   ```
   npm install
   ```
4. Start the frontend:
   ```
   npm start
   ```
5. Open your browser and go to: **http://localhost:3000**

#### Option B: Build for Production

1. Run:
   ```
   npm run build
   ```
2. Copy the contents of the `build/` folder to your web server (e.g., nginx, Apache)

### Step 3: Configure Environment

The system works out of the box with default settings. If you need to change the server address:

1. Open the file `.env` in the project root
2. Change the IP addresses to match your network:

```
REACT_APP_API_URL=http://192.168.1.100:8080
REACT_APP_SIP_SERVER=192.168.1.100
REACT_APP_WS_URL=ws://192.168.1.100:8080/ws
```

Replace `192.168.1.100` with your actual server IP address.

### Step 4: Verify Installation

1. Check the backend is running:
   - Open your browser and go to: **http://localhost:8080/health**
   - You should see: `{"service":"voip-backend","status":"ok"}`

2. Check the frontend is running:
   - Open your browser and go to: **http://localhost:3000**
   - You should see the login page

---

## 4. Connecting Devices

### How to Connect a Computer (Browser Client)

1. Open Google Chrome, Firefox, or Edge
2. Go to `http://YOUR_SERVER_IP:3000` (replace YOUR_SERVER_IP with the actual server address)
3. Log in with your username and password
4. Allow microphone access when prompted by your browser

> **First time users:** The browser will ask for permission to use your microphone. Click **Allow**. If you accidentally block it, check your browser settings to unblock it.

### How to Connect an IP Phone

1. Plug the IP phone into the same network as the server
2. On the phone, go to **Settings > Network** and ensure it gets an IP address automatically (DHCP)
3. Go to **Settings > SIP Accounts** (or similar)
4. Enter the following:
   - **SIP Server:** YOUR_SERVER_IP (e.g., 192.168.1.100)
   - **SIP Port:** 8088
   - **Username:** Your extension number (e.g., 1001)
   - **Password:** Your SIP password (given when your account was created)
5. Save and restart the phone

### How to Connect a Softphone (e.g., Zoiper, MicroSIP)

1. Download and install a softphone app (Zoiper, MicroSIP, or Linphone)
2. Open the app and go to **Settings > New Account**
3. Choose **SIP Account**
4. Enter:
   - **Display Name:** Your name
   - **Domain/Server:** YOUR_SERVER_IP
   - **Username:** Your extension (e.g., 1001)
   - **Password:** Your SIP password
   - **Transport:** TCP or UDP
5. Save and register

### How to Connect a Microphone

1. Plug your microphone into your computer
2. In Windows, go to **Settings > System > Sound**
3. Under **Input**, select your microphone
4. Test it by speaking -- you should see the input level moving
5. In the web app, the system will detect your microphone automatically
6. If you see a "Microphone Troubleshooter" button at the bottom of the screen, click it and follow the steps

### How to Connect Speakers

1. Plug in your speakers or headphones
2. In Windows, go to **Settings > System > Sound**
3. Under **Output**, select your speakers/headphones
4. When you make or receive a call, audio will play through these speakers

### Connecting Multiple Users on the LAN

All users must be on the same network. The network diagram looks like this:

```
Computer A (User 1)  ─┐
Computer B (User 2)  ─┤
IP Phone (User 3)    ─┤─── [Network Switch] ─── [Server]
Smartphone (User 4)  ─┘
```

Each user needs:
- A browser connected to `http://SERVER_IP:3000`
- A microphone and speakers/headphones
- A valid username and password

---

## 5. Creating SIP Accounts

SIP accounts are created automatically when a new user registers through the web app.

### Method 1: Self-Registration

1. Go to the login page
2. Click **"Create Account"** or **"Register"**
3. Fill in:
   - **Username:** Choose a username (e.g., john.doe)
   - **Email:** Your email address
   - **Password:** Create a strong password (at least 8 characters, mix of letters, numbers, and symbols)
   - **Extension:** A 3-6 digit number (e.g., 2001) -- this is your phone number
4. Click **Register**
5. Your SIP account is created automatically. Make note of:
   - Your extension number
   - Your SIP password (shown once after registration)

### Method 2: Admin Creates Account

If you are an administrator:

1. Log in as admin
2. Go to the **Admin Dashboard**
3. Click **Users** or **Manage Users**
4. Click **Add User** or **Create User**
5. Enter the user's details and click **Save**

### Default Accounts

These accounts exist by default for testing:

| Username | Password | Extension | Role |
|----------|----------|-----------|------|
| admin | password | 1000 | Administrator |
| user1 | password | 1001 | Regular User |
| user2 | password | 1002 | Regular User |
| user3 | password | 1003 | Regular User |

> **Important:** Change these default passwords immediately in a production environment.

---

## 6. Logging Into the System

### Login

1. Open your browser and go to the system URL: `http://YOUR_SERVER_IP:3000`
2. You will see the login screen
3. Enter your **Username** and **Password**
4. Click **Login**
5. You will be taken to your dashboard

> **Tip:** Check "Remember Me" to stay logged in on your personal device.

### Logout

1. Click on your profile icon or name (usually in the top-right corner)
2. Click **Logout** or **Sign Out**
3. You will be returned to the login page

### Password Recovery

> **Note:** Password recovery is not available in this version. Contact your system administrator to reset your password.

---

## 7. Making Calls

### Calling Another User

1. Log in to the system
2. You will see a **dial pad** (number buttons) on the dashboard
3. Enter the extension number of the person you want to call (e.g., 1002)
4. Click the **Call** button (green phone icon)
5. Wait for the other person to answer

### Receiving Calls

1. When someone calls you, you will see a pop-up notification
2. Click **Answer** (green button) to accept the call
3. Click **Decline** (red button) to reject the call
4. Talk using your microphone and listen through your speakers

### During a Call

- **Mute:** Click the microphone icon to mute/unmute yourself
- **Speaker:** Click the speaker icon to switch between speakerphone and earpiece
- **End Call:** Click the red phone icon to hang up

### Ending a Call

- Click the **End Call** button (red phone icon)
- The call will disconnect and be logged in your call history

### Missed Calls

- Missed calls appear in the **Call Logs** section
- A notification badge will show the number of missed calls
- If voicemail is configured, the caller can leave a message

---

## 8. Messaging

### Sending a Message

1. Log in to the system
2. Go to the **Messages** or **Chat** section
3. Click on a contact or search for a user
4. Type your message in the text box at the bottom
5. Press **Enter** or click the **Send** button

### Receiving Messages

- Messages from other users appear in real-time
- You will see a notification badge on the Messages icon
- Click on the conversation to read the message

### Notifications

- **Call notifications:** Pop-up when you receive a call
- **Message notifications:** Badge showing unread messages
- **Voicemail notifications:** Alert when you have a new voicemail
- **System notifications:** Updates about connection status

---

## 9. Testing the System

### Test 1: Backend is Running

1. Open your browser
2. Go to: `http://localhost:8080/health`
3. **Expected result:** You see:
   ```json
   {"service":"voip-backend","status":"ok"}
   ```

### Test 2: Frontend is Running

1. Open your browser
2. Go to: `http://localhost:3000`
3. **Expected result:** The login page appears

### Test 3: Login Works

1. Go to the login page
2. Enter username `user1` and password `password`
3. Click **Login**
4. **Expected result:** You are taken to the dashboard

### Test 4: Make a Test Call

1. Log in as `user1` on one browser tab
2. Log in as `user2` on another browser tab or device
3. In the user1 tab, dial extension `1002` and click **Call**
4. **Expected result:** user2 sees an incoming call notification
5. user2 clicks **Answer**
6. **Expected result:** Both users can hear each other

### Test 5: Send a Message

1. Log in to the system
2. Go to **Messages**
3. Select a user from the contact list
4. Type "Hello!" and press Enter
5. **Expected result:** The message appears in the chat

### Test 6: Check Database

1. The database stores all users, calls, and messages automatically
2. Admin users can view statistics on the Admin Dashboard
3. **Expected result:** User count, call logs, and message count are displayed

### Test 7: Check Logs

Logs are stored in:
- `backend/backend.log` - Main server log
- `backend/backend.err.log` - Error log
- `frontend.log` / `frontend.err.log` - Frontend logs

Open these files to verify they contain recent entries.

---

## 10. Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| **Cannot connect to the system** | Server is not running | Start the backend: `.\run.ps1` (Windows) or `./voip-backend` (Linux) |
| **Login fails** | Wrong username or password | Check your credentials. Passwords are case-sensitive. Use "Forgot Password" or contact admin. |
| **Call won't connect** | Asterisk server unreachable | Verify the Asterisk server IP in `.env`. Check that Asterisk is running. |
| **No audio during call** | Microphone not allowed | Check browser permissions (look for camera/mic icon in address bar). Allow microphone access. |
| **Microphone not detected** | Device not connected or permissions blocked | Plug in your microphone. Check Windows Sound Settings. Reload the page and allow microphone. |
| **SIP registration failed** | Wrong SIP password or server address | Check your SIP credentials in your softphone settings. Verify the server IP. |
| **WebSocket disconnected** | Network issue or server restart | Wait a few seconds -- the system will reconnect automatically. If it persists, restart the backend. |
| **Page not loading** | Frontend compilation error | Check the terminal running `npm start` for errors. Run `npm install` and restart. |
| **Notification not received** | Browser notifications blocked | Allow notifications in your browser settings for this site. |
| **Slow performance** | Server resources low | Close unused applications. Restart the backend server. |
| **Connection refused** | Port already in use | Check if another application is using port 8080 or 3000. Close the conflicting application. |
| **"Failed to compile" error** | Code error in frontend | The terminal shows the exact error. Common issues: import mismatches, missing files. |

### How to Check Browser Microphone Permissions

**Chrome:**
1. Click the lock icon (padlock) in the address bar
2. Click **Site Settings**
3. Find **Microphone** and set to **Allow**
4. Reload the page

**Firefox:**
1. Click the lock icon in the address bar
2. Click **Connection Secure > More Information**
3. Go to **Permissions** tab
4. Find **Use the Microphone** and set to **Allow**

**Edge:**
1. Click the lock icon in the address bar
2. Click **Permissions for this site**
3. Find **Microphone** and set to **Allow**

---

## 11. Frequently Asked Questions

### Q: What is an extension number?
An extension number is like your phone number within the system. It is a 3-6 digit number that other users dial to reach you. Example: Extension 1001.

### Q: Can I call someone on a regular phone?
Only if the system is connected to a VoIP provider or telephone gateway. By default, calls work only between users on the same system.

### Q: How many people can use the system?
The system can support hundreds of users, limited only by your server's hardware resources.

### Q: Can I use my smartphone?
Yes. Open the system URL in your phone's browser (Chrome on Android, Safari on iPhone). The interface is mobile-friendly.

### Q: Does the system work over the Internet?
Yes, but you need to configure port forwarding on your router and ensure your server has a public IP or use a VPN.

### Q: Is call encryption supported?
WebRTC calls can be encrypted (SRTP/DTLS). The backend API uses JWT tokens for authentication. For full encryption, use HTTPS/WSS in production.

### Q: Can I record calls?
Call recording is not currently implemented. This feature may be added in a future version.

### Q: What happens if the server restarts?
Active calls will be disconnected. Users need to log in again. The system will recover automatically once the server is back online.

### Q: Where are voicemails stored?
Voicemail recordings are stored in the `backend/voicemails/` folder as WAV audio files.

### Q: Can I export call logs?
Yes. Administrators can export call logs from the Admin Dashboard.

---

## 12. Maintenance Guide

### Backup Procedures

1. Log in as **Administrator**
2. Go to **Admin Dashboard**
3. Click **Backup**
4. Select what to include:
   - Database (users, calls, messages)
   - Config (settings)
   - Call Logs
5. Click **Create Backup**
6. The backup file will be saved on the server

### Updating the System

To update to a new version:

1. Stop the backend server (press Ctrl+C in the terminal)
2. Stop the frontend (press Ctrl+C in the terminal)
3. Replace the old files with the new version
4. Run `npm install` in the project root
5. Restart the backend and frontend

### Restarting Services

**Restart Backend:**
- Windows: Press Ctrl+C in the backend terminal, then run `.\run.ps1` again
- Linux: `sudo systemctl restart voip-backend` (if installed as a service)

**Restart Frontend:**
- Press Ctrl+C in the frontend terminal, then run `npm start` again

### Viewing Logs

Backend logs are in the `backend/` folder:
- `backend.log` - Regular activity
- `backend.err.log` - Errors and warnings

Frontend logs appear in the terminal where `npm start` is running.

### Database Maintenance

The database (`voip.db`) is self-maintaining. However:

- **Backup regularly** using the Admin Dashboard
- **Monitor disk space** -- the database grows with use
- **Vacuum the database** periodically to reclaim space (admin only)

---

## Need Help?

If you encounter issues not covered in this manual:

1. Check the `ASTERISK_TROUBLESHOOTING.md` file in the project root
2. Check the `docs/` folder for additional guides
3. Contact your system administrator

---

*End of User Manual*
