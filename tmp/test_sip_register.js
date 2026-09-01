const WebSocket = require('ws');

if (!global.WebSocket) {
  global.WebSocket = WebSocket;
}
if (!global.window) {
  global.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { protocol: 'http:', hostname: 'localhost' },
    navigator: { userAgent: 'node-test', mediaDevices: undefined },
  };
}
if (!global.navigator) {
  global.navigator = global.window.navigator;
}
if (!global.document) {
  global.document = {
    createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
    addEventListener: () => {},
  };
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const JsSIP = require('jssip').default || require('jssip');
JsSIP.debug.disable();

const EXT = process.argv[2] || '1000';
const PASSWORD = process.argv[3] || 'Spjl8w3%L9y7DV@Z';
const SERVER = process.argv[4] || '192.168.1.8';
const WS_URL = `ws://${SERVER}:8088/ws`;

console.log(`[test] Registering ext ${EXT} via ${WS_URL}`);

const socket = new JsSIP.WebSocketInterface(WS_URL);

const ua = new JsSIP.UA({
  sockets: [socket],
  uri: `sip:${EXT}@${SERVER}`,
  display_name: `Test ${EXT}`,
  password: PASSWORD,
  register: true,
  session_timers: false,
  register_expires: 120,
  connection_recovery_min_interval: 2,
  connection_recovery_max_interval: 10,
});

const timeout = setTimeout(() => {
  console.error('[test] REGISTRATION TIMEOUT (15s)');
  try { ua.stop(); } catch (e) {}
  process.exit(1);
}, 15000);

ua.on('connected', () => console.log('[test] WS connected'));
ua.on('disconnected', (e) => console.log('[test] WS disconnected:', e && e.code));
ua.on('registered', (e) => {
  clearTimeout(timeout);
  console.log('[test] REGISTERED ✓ from:', e.response && e.response.from ? 'server-ack' : '');
  console.log('[test] SIP REGISTRATION SUCCESSFUL');
  ua.unregister({ all: true });
  setTimeout(() => { try { ua.stop(); } catch (err) {} process.exit(0); }, 1000);
});
ua.on('unregistered', () => console.log('[test] unregistered'));
ua.on('registrationFailed', (e) => {
  clearTimeout(timeout);
  console.error('[test] REGISTRATION FAILED:', e.cause);
  try { ua.stop(); } catch (err) {}
  process.exit(1);
});

ua.start();
