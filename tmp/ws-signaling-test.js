// Signaling relay test: verifies the backend WebSocket hub relays WebRTC
// signaling messages (webrtc_call_accepted, webrtc_offer, webrtc_answer,
// webrtc_ice_candidate) between two extensions.
//
// NOTE: This test does NOT create a real RTCPeerConnection/media - it only
// verifies the JSON message relay, which is the part that was suspected broken.

const WebSocket = require('ws');
const axios = require('axios');

const API = 'https://192.168.1.8:8443';      // backend API (serves HTTPS)
const WS_ANCHOR = 'wss://192.168.1.8:8443';  // backend WS (same origin)
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'password';

// Use a distinct throwaway username/extension to avoid collisions across runs.
const SUFFIX = Date.now().toString().slice(-6);
const TEST_USER = `wstest${SUFFIX}`;
// Unique 4-digit extension derived from the suffix (1000..9999).
const TEST_EXT = String(1000 + (Number(SUFFIX) % 8999));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function login(username, password) {
  const { data } = await axios.post(`${API}/api/login`, { username, password }, {
    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
  });
  return data;
}

async function register(user, password) {
  try {
    const { data } = await axios.post(`${API}/api/register`, {
      username: user,
      password,
      email: `${user}@voip.local`,
      extension: TEST_EXT,
    }, {
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    });
    return data;
  } catch (e) {
    return { error: e.response ? e.response.data.error : e.message };
  }
}

function connectWS(extension, token) {
  return new Promise((resolve, reject) => {
    const url = `${WS_ANCHOR}/ws?extension=${encodeURIComponent(extension)}&token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url, { rejectUnauthorized: false });
    const received = [];
    ws.on('message', (d) => {
      const text = d.toString();
      for (const line of text.split('\n').map(s => s.trim()).filter(Boolean)) {
        try {
          received.push(JSON.parse(line));
        } catch (e) {}
      }
    });
    ws.on('open', () => resolve({ ws, received }));
    ws.on('error', reject);
  });
}

async function main() {
  console.log('=== WebSocket signaling relay test ===');
  console.log(`Test user: ${TEST_USER} ext: ${TEST_EXT}`);

  // 1. Login as admin (ext 1000) and register test user (ext 9021)
  let admin;
  try {
    admin = await login(ADMIN_USER, ADMIN_PASS);
    console.log('Admin login OK, ext', admin.user.extension);
  } catch (e) {
    console.error('FATAL: Admin login failed:', e.message);
    process.exit(1);
  }

  let testUser = await register(TEST_USER, 'testpass123');
  if (testUser.error) {
    console.error('Register failed (maybe exists):', testUser.error);
  } else {
    console.log('Test user registered OK, ext', testUser.user && testUser.user.extension);
    const relogin = await login(TEST_USER, 'testpass123');
    testUser = relogin;
  }
  if (!testUser.token) {
    testUser = await login(TEST_USER, 'testpass123');
  }
  console.log('Test user token acquired, ext', testUser.user && testUser.user.extension);

  // 2. Connect both WebSockets
  const adminExt = admin.user.extension;    // 1000
  const callerExt = testUser.user.extension; // 9021

  const [adminConn, callerConn] = await Promise.all([
    connectWS(adminExt, admin.token),
    connectWS(callerExt, testUser.token),
  ]);
  const wsAdmin = adminConn.ws;
  const wsCaller = callerConn.ws;
  console.log('Both WS connected. admin=' + adminExt, 'caller=' + callerExt);
  await sleep(500);

  const results = [];
  const addResult = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  };

  // 3. REQUEST A CALL (via /call/initiate?method=webrtc from caller -> admin)
  //    First call the backend to initiate, expecting an invitation on admin's socket.
  let callId = null;
  try {
    const { data } = await axios.post(
      `${API}/protected/call/initiate?method=webrtc`,
      { target_extension: adminExt },
      { headers: { Authorization: `Bearer ${testUser.token}` }, httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) }
    );
    callId = data.call_id;
    console.log('Call initiated:', callId);
  } catch (e) {
    console.error('Initiate call failed:', e.response ? e.response.data : e.message);
  }

  await sleep(1000);
  const adminMsgs = [...adminConn.received];
  const invitation = adminMsgs.find(m => m.type === 'webrtc_call_invitation' && m.call_id === callId);
  addResult('invitation reaches callee', !!invitation, invitation ? `call_id=${invitation.call_id} from=${invitation.caller_extension}` : '(none)');

  // 4. CALLEE ACCEPTS -> caller should receive webrtc_call_accepted
  const acceptedMsg = {
    type: 'webrtc_call_accepted',
    call_id: callId,
    channel: callId,
    to: callerExt,
    from: adminExt,
  };
  wsAdmin.send(JSON.stringify(acceptedMsg));
  await sleep(800);
  const callerMsgs = [...callerConn.received];
  const accepted = callerMsgs.find(m => m.type === 'webrtc_call_accepted' && m.call_id === callId);
  addResult('acceptance relays to caller', !!accepted, accepted ? `to=${accepted.to} from=${accepted.from}` : '(none)');

  // 5. CALLER SENDS OFFER -> callee should receive it
  const fakeOffer = { sdp: 'v=0\r\no=test 1 1 IN IP4 0.0.0.0\r\ns=-\r\nc=IN IP4 0.0.0.0\r\nt=0 0\r\n', type: 'offer' };
  wsCaller.send(JSON.stringify({
    type: 'webrtc_offer',
    offer: fakeOffer,
    to: adminExt,
    from: callerExt,
    channel: callId,
  }));
  await sleep(800);
  const offer = adminConn.received.find(m => m.type === 'webrtc_offer' && m.channel === callId);
  addResult('offer relays to callee', !!offer, offer ? `from=${offer.from} hasSDP=${!!(offer.offer && offer.offer.sdp)}` : '(none)');

  // 6. CALLEE ANSWERS -> caller should receive it
  const fakeAnswer = { sdp: 'v=0\r\no=test 2 2 IN IP4 0.0.0.0\r\ns=-\r\nc=IN IP4 0.0.0.0\r\nt=0 0\r\n', type: 'answer' };
  wsAdmin.send(JSON.stringify({
    type: 'webrtc_answer',
    answer: fakeAnswer,
    to: callerExt,
    from: adminExt,
    channel: callId,
  }));
  await sleep(800);
  const answer = callerConn.received.find(m => m.type === 'webrtc_answer' && m.channel === callId);
  addResult('answer relays to caller', !!answer, answer ? `from=${answer.from} hasSDP=${!!(answer.answer && answer.answer.sdp)}` : '(none)');

  // 7. ICE CANDIDATES BOTH WAYS
  const candA = { candidate: 'candidate:1 1 udp 2122260223 192.168.1.8 55000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
  const candB = { candidate: 'candidate:2 1 udp 2122260223 192.168.1.9 55001 typ host', sdpMid: '0', sdpMLineIndex: 0 };
  // caller -> callee
  wsCaller.send(JSON.stringify({
    type: 'webrtc_ice_candidate', candidate: candA, to: adminExt, from: callerExt, channel: callId,
  }));
  // callee -> caller
  wsAdmin.send(JSON.stringify({
    type: 'webrtc_ice_candidate', candidate: candB, to: callerExt, from: adminExt, channel: callId,
  }));
  await sleep(800);
  const iceToCallee = adminConn.received.find(m => m.type === 'webrtc_ice_candidate' && m.channel === callId && m.from === callerExt);
  const iceToCaller = callerConn.received.find(m => m.type === 'webrtc_ice_candidate' && m.channel === callId && m.from === adminExt);
  addResult('ICE candidate relays callee->caller', !!iceToCaller, iceToCaller ? `got from=${iceToCaller.from}` : '(none)');
  addResult('ICE candidate relays caller->callee', !!iceToCallee, iceToCallee ? `got from=${iceToCallee.from}` : '(none)');

  console.log('\n=== Summary ===');
  const failed = results.filter(r => !r.ok);
  console.log(`Passed ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    failed.forEach(f => console.log(`  FAILED: ${f.name}`));
  }

  // Cleanup: add a rejected/cleanup message so the active call record gets cleared.
  try {
    wsCaller.send(JSON.stringify({ type: 'webrtc_call_ended', call_id: callId, channel: callId, to: adminExt, from: callerExt }));
    await sleep(300);
  } catch (e) {}
  wsAdmin.close(); wsCaller.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error('Unhandled error:', e); process.exit(1); });