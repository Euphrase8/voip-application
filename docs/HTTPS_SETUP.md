# HTTPS Setup (Required for Microphone on non-localhost)

Browsers only allow `getUserMedia()` (microphone/camera) on **secure contexts**:
- `https://...` ✅
- `http://localhost` ✅
- `http://<LAN-IP>` ❌ (blocked on most browsers)

This project is often accessed from a phone via `http://192.168.1.2:3001`, which will cause microphone permission failures. Use HTTPS instead.

## Option A (Recommended): Caddy reverse proxy with local TLS

### 1) Install Caddy

```bash
sudo apt update
sudo apt install -y caddy
```

### 2) Create a local domain for your PC

Edit `/etc/hosts` on your PC:

```text
192.168.1.2 voip.local
```

On your phone, add a DNS/hosts entry if possible. If you can't, use the IP with a certificate that includes the IP (see Option B).

### 3) Use this Caddyfile

Save as `/etc/caddy/Caddyfile`:

```caddy
{
  # Caddy will create a local CA and issue certs automatically for internal names.
  local_certs
}

voip.local {
  encode gzip

  # Frontend (React dev server)
  reverse_proxy / http://127.0.0.1:3001

  # Backend API
  reverse_proxy /health http://127.0.0.1:8080
  reverse_proxy /config http://127.0.0.1:8080
  reverse_proxy /api/* http://127.0.0.1:8080
  reverse_proxy /protected/* http://127.0.0.1:8080

  # Backend WebSocket
  reverse_proxy /ws http://127.0.0.1:8080
}
```

Reload Caddy:

```bash
sudo systemctl reload caddy
```

### 4) Trust the Caddy local CA

On the PC:

```bash
caddy trust
```

On your phone: install Caddy’s local root CA certificate so the browser trusts `https://voip.local`.

Caddy stores the root CA here (location may vary by distro):
- `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`

Copy that `root.crt` to your phone and install it as a trusted CA.

### 5) Update frontend/backend URLs

Use HTTPS origin in the browser:
- `https://voip.local`

The app will still talk to backend via the same host.

> IMPORTANT: After switching scheme/host, clear saved IP config in localStorage and reconfigure once.

---

## Option B: mkcert (best for IP-based HTTPS)

If you want `https://192.168.1.2` specifically, use `mkcert` and generate a cert that includes the IP SAN.

High level:
1. Install mkcert
2. `mkcert -install`
3. `mkcert 192.168.1.2 voip.local`
4. Terminate TLS in a small proxy (Caddy/Nginx) using that cert.

---

## Option C: CRA dev server HTTPS only (PC testing)

If you only need HTTPS on the frontend (still same machine) you can run React with HTTPS:

Create/update `.env` in the project root:

```env
HTTPS=true
HOST=0.0.0.0
PORT=3001
```

Then run `npm start`.

Note: For phone access, the certificate must be trusted by the phone, otherwise you’ll still get blocked/permission warnings.
