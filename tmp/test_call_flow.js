const WebSocket = require('ws');
const http = require('http');

const BACKEND = 'http://localhost:8080';

function post(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(`${BACKEND}${path}`, { method: 'POST', headers }, (res) => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(b || '{}') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function login(username, password) {
  const r = await post('/api/login', { username, password });
  if (!r.body.token) throw new Error(`login failed for ${username}: ${JSON.stringify(r.body)}`);
  return r.body;
}

class WSClient {
  constructor(ext, token) {
    this.ext = ext;
    this.messages = [];
    this.waiters = [];
    this.ws = new WebSocket(`ws://localhost:8080/ws?extension=${ext}&token=${encodeURIComponent(token)}`);
    this.ws.on('message', (d) => {
      const msg = JSON.parse(d.toString());
      console.log(`  [ext ${this.ext}] <= ${msg.type}`);
      this.messages.push(msg);
      this.waiters.forEach(w => w.check(msg));
    });
    this.ws.on('error', (e) => { throw e; });
  }
  waitFor(type, timeoutMs = 8000) {
    const existing = this.messages.find(m => m.type === type);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const w = {
        check: (msg) => {
          if (msg.type === type) {
            clearTimeout(timer);
            this.waiters = this.waiters.filter(x => x !== w);
            resolve(msg);
          }
        }
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter(x => x !== w);
        reject(new Error(`ext ${this.ext}: timeout waiting for "${type}"`));
      }, timeoutMs);
      this.waiters.push(w);
    });
  }
  send(obj) {
    console.log(`  [ext ${this.ext}] => ${obj.type}`);
    this.ws.send(JSON.stringify(obj));
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  let pass = 0, fail = 0;
  const ok = (name) => { console.log(`PASS: ${name}`); pass++; };
  const bad = (name, e) => { console.error(`FAIL: ${name} — ${e.message}`); fail++; };

  let caller, callee;
  try {
    // 1. Login both parties
    const admin = await login('admin', 'password');
    const user3 = await login('user3', 'password');
    console.log(`Logged in: admin ext=${admin.user.extension}, user3 ext=${user3.user.extension}`);

    // 2. Connect both to the signaling hub
    caller = new WSClient(admin.user.extension, admin.token);
    callee = new WSClient(user3.user.extension, user3.token);
    await Promise.all([caller.waitFor('welcome'), callee.waitFor('welcome')]);
    ok('Both clients connected to backend WS hub with welcome message');

    await sleep(500);

    // 3. Initiate WebRTC call via API
    const init = await post(`/protected/call/initiate?method=webrtc`, { target_extension: user3.user.extension, media: 'audio' }, admin.token);
    if (init.status === 200 && init.body.call_id) ok(`Call initiated, call_id=${init.body.call_id}`);
    else throw new Error(`initiate failed: HTTP ${init.status} ${JSON.stringify(init.body)}`);

    // 4. Callee receives invitation; caller receives confirmation
    const inv = await callee.waitFor('webrtc_call_invitation');
    ok(`Callee received webrtc_call_invitation from ${inv.caller_username} (ext ${inv.caller_extension})`);
    await caller.waitFor('webrtc_call_initiated');
    ok('Caller received webrtc_call_initiated confirmation');

    // 5. Callee accepts
    callee.send({
      type: 'webrtc_call_accepted',
      to: inv.caller_extension,
      from: user3.user.extension,
      channel: inv.call_id,
      call_id: inv.call_id,
    });
    const accepted = await caller.waitFor('webrtc_call_accepted');
    ok(`Caller received acceptance from ext ${accepted.from}`);

    // 6. SDP exchange through the backend
    caller.send({ type: 'webrtc_offer', to: user3.user.extension, sdp: 'v=0...offer-sdp...', call_id: inv.call_id });
    await callee.waitFor('webrtc_offer');
    ok('Offer relayed caller -> callee');

    callee.send({ type: 'webrtc_answer', to: admin.user.extension, sdp: 'v=0...answer-sdp...', call_id: inv.call_id });
    await caller.waitFor('webrtc_answer');
    ok('Answer relayed callee -> caller');

    // 7. ICE candidates
    caller.send({ type: 'webrtc_ice_candidate', to: user3.user.extension, candidate: 'candidate:1 1 udp ...' });
    await callee.waitFor('webrtc_ice_candidate');
    callee.send({ type: 'webrtc_ice_candidate', to: admin.user.extension, candidate: 'candidate:2 1 udp ...' });
    await caller.waitFor('webrtc_ice_candidate');
    ok('ICE candidates exchanged both directions');

    // 8. Hang up
    caller.send({ type: 'webrtc_call_ended', to: user3.user.extension, channel: inv.call_id });
    await callee.waitFor('webrtc_call_ended');
    ok('Call ended notification delivered');

    console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
    process.exit(fail > 0 ? 1 : 0);
  } catch (e) {
    console.error(`FAIL: ${e.message}`);
    process.exit(1);
  } finally {
    if (caller) caller.close();
    if (callee) callee.close();
  }
})();
