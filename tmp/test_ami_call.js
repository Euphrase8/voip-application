const WebSocket = require('ws');
const http = require('http');

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), Authorization: `Bearer ${token}` };
    const req = http.request(`http://localhost:8080${path}`, { method: 'POST', headers }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function login(username, password) {
  const r = await post('/api/login', { username, password });
  const j = JSON.parse(r.body);
  if (!j.token) throw new Error('login failed');
  return j;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const admin = await login('admin', 'password');

  // Keep callee connected so backend treats it as online
  const ws = new WebSocket(`ws://localhost:8080/ws?extension=1003&token=${encodeURIComponent(admin.token === '' ? '' : (await login('user3', 'password')).token)}`);
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  console.log('ext 1003 WS connected');
  const events = [];
  ws.on('message', d => { const m = JSON.parse(d.toString()); events.push(m); console.log('  [1003] <=', m.type); });

  await sleep(800);

  // AMI path (no ?method=webrtc)
  const r = await post('/protected/call/initiate', { target_extension: '1003' }, admin.token);
  console.log(`AMI initiate HTTP ${r.status}: ${r.body}`);

  // Wait for any push events (call ringing notification)
  await sleep(5000);

  // Hangup cleanup via API
  const hr = await post('/protected/call/hangup', { channel: JSON.parse(r.body).channel || '' }, admin.token).catch(e => null);
  if (hr) console.log(`Hangup HTTP ${hr.status}: ${hr.body.slice(0, 200)}`);

  ws.close();
  process.exit(0);
})();
