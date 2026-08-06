const WebSocket = require('ws');
const http = require('http');

const BACKEND = 'http://127.0.0.1:8080';

async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'testuser2', password: 'test123' });
    const req = http.request(`${BACKEND}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const j = JSON.parse(body);
        if (j.success) resolve(j);
        else reject(new Error(j.error));
      });
    });
    req.write(data);
    req.end();
  });
}

async function testWS() {
  const auth = await login();
  console.log('LOGIN OK — token:', auth.token.slice(0, 30) + '...');
  console.log('Extension:', auth.user.extension);

  const wsUrl = `ws://127.0.0.1:8080/ws?extension=${auth.user.extension}&token=${encodeURIComponent(auth.token)}`;
  console.log('Connecting to:', wsUrl);

  const ws = new WebSocket(wsUrl);

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => { ws.terminate(); reject(new Error('TIMEOUT')); }, 5000);
    ws.on('open', () => { clearTimeout(t); console.log('WS ✓ OPEN'); resolve(); });
    ws.on('error', (e) => { clearTimeout(t); console.error('WS ✗ ERROR:', e.message); reject(e); });
    ws.on('close', (code, reason) => {
      clearTimeout(t);
      if (code !== 1005) console.error(`WS ✗ CLOSED code=${code} reason=${reason}`);
      reject(new Error(`CLOSED ${code}`));
    });
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      console.log('WS MSG:', JSON.stringify(msg));
      // Close after receiving welcome message
      if (msg.type === 'welcome') ws.close();
    });
  });

  console.log('WS handshake SUCCESS — all good');
  process.exit(0);
}

testWS().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
