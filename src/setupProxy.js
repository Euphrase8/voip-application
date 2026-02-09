/*
 * CRA development proxy.
 *
 * Purpose:
 * - When the frontend runs on HTTPS (e.g. https://localhost:3001), browsers will block
 *   XHR/fetch/websocket calls to an HTTP backend (mixed content) and you also hit CORS.
 * - This proxy makes the browser talk to the *same origin* (the CRA dev server), and the
 *   dev server forwards requests to the backend over plain HTTP.
 *
 * Works only in development (`npm start`).
 */

const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const target = process.env.REACT_APP_PROXY_TARGET || 'http://192.168.1.2:8080';

  // REST endpoints
  // NOTE: Use plain prefixes. CRA/Express matches subpaths automatically.
  // Avoid glob patterns here; they can be finicky depending on middleware versions.
  const restProxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: false,
    logLevel: 'warn',
  });

  app.use('/health', restProxy);
  app.use('/config', restProxy);
  app.use('/api', restProxy);
  app.use('/protected', restProxy);

  // WebSocket endpoint
  app.use(
    '/ws',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
      secure: false,
      logLevel: 'warn',
    })
  );
};
