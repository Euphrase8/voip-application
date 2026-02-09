/**
 * Minimal .env loader (no dependencies).
 *
 * Loads, in order:
 *  - project root .env
 *  - backend/.env
 *
 * Does NOT overwrite variables already present in process.env.
 */

const fs = require('fs');
const path = require('path');

function parseEnv(content) {
  const out = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return parseEnv(content);
  } catch {
    return {};
  }
}

function applyEnv(vars) {
  for (const [k, v] of Object.entries(vars)) {
    if (process.env[k] === undefined || process.env[k] === '') {
      process.env[k] = String(v);
    }
  }
}

function loadProjectEnv() {
  const projectRoot = path.join(__dirname, '..');
  const rootEnv = loadEnvFile(path.join(projectRoot, '.env'));
  const backendEnv = loadEnvFile(path.join(projectRoot, 'backend', '.env'));

  // Apply in this order; backend overrides root only if root didn't define it.
  applyEnv(rootEnv);
  applyEnv(backendEnv);

  return { ...rootEnv, ...backendEnv, ...process.env };
}

function parseURL(maybeUrl) {
  try {
    const u = new URL(maybeUrl);
    return u;
  } catch {
    return null;
  }
}

function getBackendBaseURL() {
  loadProjectEnv();

  const fromReact = process.env.REACT_APP_API_URL;
  const u = parseURL(fromReact);
  if (u) return u;

  const host = process.env.BACKEND_HOST || process.env.PUBLIC_HOST || '127.0.0.1';
  const port = process.env.BACKEND_PORT || process.env.PORT || '8080';
  return new URL(`http://${host}:${port}`);
}

function getAsteriskConfig() {
  loadProjectEnv();

  const host =
    process.env.ASTERISK_HOST ||
    process.env.REACT_APP_SIP_SERVER ||
    process.env.SIP_DOMAIN ||
    '127.0.0.1';

  const sipPort = String(process.env.SIP_PORT || process.env.REACT_APP_SIP_PORT || '8088');
  const amiPort = String(process.env.ASTERISK_AMI_PORT || '5038');
  const amiUsername = process.env.ASTERISK_AMI_USERNAME || 'admin';
  const amiSecret = process.env.ASTERISK_AMI_SECRET || process.env.ASTERISK_AMI_PASSWORD || 'amp111';

  return { host, sipPort, amiPort, amiUsername, amiSecret };
}

module.exports = {
  loadProjectEnv,
  getBackendBaseURL,
  getAsteriskConfig,
};
