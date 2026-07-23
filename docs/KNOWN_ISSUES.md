# Known Issues & Limitations

**Last Updated:** July 17, 2026
**Version:** 1.0.0

---

## Critical

| # | Issue | Impact | Workaround |
|---|-------|--------|------------|
| 1 | **Asterisk PBX not reachable** - Backend cannot connect to Asterisk at `172.30.163.165:5038` | No SIP calls; WebRTC-only calls may work | Configure correct Asterisk IP in `.env` and `run.ps1`, or run in WebRTC-only mode |
| 2 | **Unencrypted AMI traffic** - AMI credentials sent in cleartext over TCP | Credential theft risk on untrusted networks | Use VPN or SSH tunnel between backend and Asterisk |

## High

| # | Issue | Impact | Workaround |
|---|-------|--------|------------|
| 3 | **No password change endpoint** - Users cannot change their own password | Users must contact admin for password changes | Admin can update via `PUT /protected/admin/users/:id` |
| 4 | **No forgot-password flow** - No password reset mechanism | Users locked out must contact admin | Manual password reset by administrator |
| 5 | **Token in URL query string** - `middleware/auth.go` accepts `?token=` | Token may leak in server logs/referrer headers | Use only Authorization header; remove query fallback in production |

## Medium

| # | Issue | Impact | Workaround |
|---|-------|--------|------------|
| 6 | **Silent DB error handling** - 50+ DB operations ignore errors | Data inconsistencies may go undetected | Monitor logs for unexpected behavior |
| 7 | **No pagination on user list** - `GET /protected/admin/users` returns all users | Performance impact with many users (1000+) | Currently acceptable for typical deployments |
| 8 | **No email verification** - Registration does not verify email | Email field may contain invalid addresses | Manual verification by admin |

## Low

| # | Issue | Impact | Workaround |
|---|-------|--------|------------|
| 9 | **Duplicated cleanup logic** - Both `handlers/users.go` and `services/status_cleanup.go` have stale user cleanup | Code maintenance overhead | Currently only `handlers` version is used |
| 10 | **Dead code** - Several functions in `asterisk/calls.go` and `models/message.go` are never called | No functional impact | Code can be pruned in future refactor |
| 11 | **Debug endpoints exposed** - `/protected/debug/auth` shows internal auth state | Information disclosure in production | Remove or guard with feature flag for production |

---

## Asterisk-Specific

- AMI reconnection attempts fill logs every 10-30 seconds when Asterisk is down
- No TLS support for AMI connections
- IP phone configuration requires manual entry of SIP credentials

---

## Frontend-Specific

- `VoipPhone.jsx` is a legacy component; new development should use `sipManager.js` and `webrtcCallService.js`
- Console logging is verbose during development
- Empty `src/assets/` directory exists but is unused

---

## Future Improvements

1. Add password change/reset API endpoints and UI
2. Implement TLS for AMI connections
3. Add pagination to admin user list
4. Add email verification during registration
5. Add proper error handling for all DB operations
6. Remove dead code and consolidate cleanup logic
7. Add call recording functionality
8. Implement group chat member management (add/remove)
9. Add user deletion cascading for messages and voicemails
10. Gate debug endpoints behind admin role or feature flag
