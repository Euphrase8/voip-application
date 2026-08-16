// Network Diagnostics and Auto-Discovery
// Automatically detects Asterisk server IP and tests connectivity

import { CONFIG } from '../services/config';

class NetworkDiagnostics {
  constructor() {
    this.commonAsteriskPorts = [5038, 8088, 5060];
    this.commonSSHPorts = [22];
    this.detectedServers = new Map();
  }

  // Auto-discover Asterisk servers on the network
  async discoverAsteriskServers() {
    console.log('🔍 Starting Asterisk server discovery...');
    
    const results = {
      discovered: [],
      tested: [],
      recommended: null,
      serverInfo: await this.getServerInfo(),
      networkInfo: await this.getNetworkInfo()
    };

    // Get potential IP ranges to scan
    const ipRanges = this.generateIPRanges(results.networkInfo);

    // Test the real addresses first (origin host, primary IP, all local IPs,
    // hostname). Loopback is only a last resort so the recommended host is
    // actually usable by other devices instead of being "localhost".
    const knownIPs = this.buildCandidateHosts(results.serverInfo);

    // Test known IPs first
    for (const ip of knownIPs) {
      const testResult = await this.testAsteriskServer(ip);
      results.tested.push(testResult);
      
      if (testResult.asteriskDetected) {
        results.discovered.push(testResult);
      }
    }

    // If no servers found, scan common IP ranges
    if (results.discovered.length === 0) {
      console.log('🔍 No known servers found, scanning network...');
      
      for (const range of ipRanges.slice(0, 2)) { // Limit to first 2 ranges
        const scanResults = await this.scanIPRange(range, 10); // Scan first 10 IPs
        results.tested.push(...scanResults);
        
        const discovered = scanResults.filter(r => r.asteriskDetected);
        results.discovered.push(...discovered);
        
        if (discovered.length > 0) break; // Stop if we found servers
      }
    }

    // Determine best server
    if (results.discovered.length > 0) {
      results.recommended = this.selectBestServer(results.discovered);
    }

    return results;
  }

  // Fetch the backend's real network + Asterisk configuration so discovery and
  // the generated configuration reflect the actual deployment instead of
  // guessing "localhost". Best-effort: never fails the whole discovery.
  async getServerInfo() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(`${CONFIG.API_URL}/api/server-info`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.success) {
        this._serverInfo = data;
        return data;
      }
    } catch (e) {
      console.warn('[networkDiagnostics] server-info unavailable:', e.message);
    }
    return null;
  }

  // Ordered candidate hosts to probe: the real, reachable addresses first.
  buildCandidateHosts(serverInfo) {
    const hosts = [];
    const seen = new Set();
    const add = (host) => {
      if (!host || seen.has(host)) return;
      seen.add(host);
      hosts.push(host);
    };

    // The host the admin actually reached the app on is the safest recommendation.
    const { hostname } = window.location;
    if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
      add(hostname);
    }

    if (serverInfo?.server) {
      add(serverInfo.server.primary_ip);
      (serverInfo.server.all_ips || []).forEach(add);
      add(serverInfo.server.hostname);
    }

    // Fallbacks
    add('192.168.1.2');
    add('localhost');
    add('127.0.0.1');
    add('asterisk.local');

    return hosts;
  }

  // Test a specific IP for Asterisk services
  async testAsteriskServer(ip) {
    console.log(`🧪 Testing ${ip} for Asterisk services...`);
    
    const result = {
      ip,
      hostname: ip,
      asteriskDetected: false,
      sshDetected: false,
      services: {},
      responseTime: null,
      score: 0
    };

    const startTime = Date.now();

    try {
      // Test AMI port (5038)
      result.services.ami = await this.testPort(ip, 5038, 3000);
      
      // Test HTTP/WebSocket port (8088)
      result.services.http = await this.testAsteriskHTTP(ip, 8088);
      
      // Test SIP port (5060)
      result.services.sip = await this.testPort(ip, 5060, 2000);
      
      // Test SSH port (22)
      result.services.ssh = await this.testPort(ip, 22, 2000);

      result.responseTime = Date.now() - startTime;

      // Determine if Asterisk is detected
      result.asteriskDetected = result.services.ami.available || 
                               result.services.http.available ||
                               result.services.sip.available;

      result.sshDetected = result.services.ssh.available;

      // Calculate score
      result.score = this.calculateServerScore(result);

      console.log(`✅ ${ip}: Asterisk=${result.asteriskDetected}, SSH=${result.sshDetected}, Score=${result.score}`);

    } catch (error) {
      console.log(`❌ ${ip}: Error - ${error.message}`);
      result.error = error.message;
    }

    return result;
  }

  // Test if a port is open
  async testPort(ip, port, timeout = 3000) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // For web-based testing, we'll try to connect via fetch with no-cors
      const testUrl = `http://${ip}:${port}/`;
      
      await fetch(testUrl, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      return {
        port,
        available: true,
        method: 'http_test'
      };
    } catch (error) {
      // For ports like AMI (5038), connection refused might mean the port is open
      // but doesn't accept HTTP requests (which is expected)
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        return {
          port,
          available: true, // Port is likely open but not HTTP
          method: 'connection_attempt',
          note: 'Port appears open (non-HTTP service)'
        };
      }

      return {
        port,
        available: false,
        error: error.message,
        method: 'http_test'
      };
    }
  }

  // Test Asterisk HTTP interface specifically
  async testAsteriskHTTP(ip, port) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`http://${ip}:${port}/`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'no-cors'
      });

      clearTimeout(timeoutId);

      return {
        port,
        available: true,
        asteriskConfirmed: true,
        method: 'http_interface'
      };
    } catch (error) {
      // Even if fetch fails, the port might be open
      return {
        port,
        available: error.name !== 'AbortError',
        asteriskConfirmed: false,
        method: 'http_interface',
        error: error.message
      };
    }
  }

  // Get network information
  async getNetworkInfo() {
    const info = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      currentURL: window.location.href,
      currentHost: window.location.hostname,
      currentPort: window.location.port || '80'
    };

    // Try to get more network info if available
    try {
      if ('connection' in navigator) {
        info.connection = {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt
        };
      }
    } catch (error) {
      // Connection API not available
    }

    return info;
  }

  // Generate IP ranges to scan based on current network
  generateIPRanges(networkInfo) {
    const ranges = [
      // Common private network ranges
      '192.168.1.0/24',   // Common home network
      '192.168.0.0/24',   // Common home network
      '10.0.0.0/24',      // Common corporate network
      '172.16.0.0/24'     // Common private network
    ];

    return ranges;
  }

  // Scan an IP range for Asterisk servers
  async scanIPRange(cidr, maxIPs = 10) {
    const ips = this.generateIPsFromCIDR(cidr, maxIPs);
    const results = [];

    console.log(`🔍 Scanning ${cidr} (${ips.length} IPs)...`);

    // Test IPs in parallel (but limit concurrency)
    const batchSize = 3;
    for (let i = 0; i < ips.length; i += batchSize) {
      const batch = ips.slice(i, i + batchSize);
      const batchPromises = batch.map(ip => this.testAsteriskServer(ip));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  // Generate IPs from CIDR notation
  generateIPsFromCIDR(cidr, maxIPs = 10) {
    const [baseIP, prefixLength] = cidr.split('/');
    const [a, b, c, d] = baseIP.split('.').map(Number);
    
    const ips = [];
    
    // For /24 networks, scan the last octet
    if (prefixLength === '24') {
      for (let i = 1; i <= Math.min(maxIPs, 254); i++) {
        ips.push(`${a}.${b}.${c}.${i}`);
      }
    }
    
    return ips;
  }

  // Calculate server score based on available services
  calculateServerScore(result) {
    let score = 0;
    
    if (result.services.ami?.available) score += 40;
    if (result.services.http?.available) score += 30;
    if (result.services.sip?.available) score += 20;
    if (result.services.ssh?.available) score += 10;
    
    // Bonus for confirmed Asterisk
    if (result.services.http?.asteriskConfirmed) score += 20;
    
    // Penalty for high response time
    if (result.responseTime > 5000) score -= 10;
    if (result.responseTime > 10000) score -= 20;
    
    return score;
  }

  // Select the best server from discovered servers
  selectBestServer(servers) {
    if (servers.length === 0) return null;

    // Never recommend a loopback address when a real host was discovered —
    // "localhost" is only usable on the server itself, not other devices.
    const isLoopback = (ip) => !ip || ip === 'localhost' || ip === '127.0.0.1' || ip === '::1';
    const real = servers.filter((s) => !isLoopback(s.ip));
    if (real.length > 0) servers = real;

    // Sort by score (highest first)
    const sorted = servers.sort((a, b) => b.score - a.score);
    
    return sorted[0];
  }

  // Test SSH connectivity to a server
  async testSSHConnectivity(ip, username = 'kali', port = 22) {
    // Note: Direct SSH testing from browser is not possible
    // This is a placeholder for SSH connectivity information
    
    return {
      ip,
      port,
      username,
      testable: false,
      note: 'SSH testing requires backend or native application',
      instructions: [
        `ssh ${username}@${ip}`,
        'Default password: kali',
        'Ensure SSH service is running: sudo systemctl start ssh',
        'Check firewall: sudo ufw allow ssh'
      ]
    };
  }

  // Generate configuration for discovered server
  generateConfiguration(server) {
    if (!server) return null;

    const info = this._serverInfo || {};
    const ast = info.asterisk || {};
    const sipPort = ast.sip_port || '8088';
    const amiPort = ast.ami_port || '5038';
    const asteriskHost = ast.host || server.ip;
    const sipDomain = ast.sip_domain || asteriskHost;
    const amiUser = ast.ami_user || 'admin';
    const sshUser = ast.ssh_user || '';
    const sshPort = ast.ssh_port || '22';

    // The host the browser reached the app on (never a loopback after discovery).
    const reachableHost = server.ip;

    // SSH targets where Asterisk actually runs when it isn't loopback, so the
    // admin can reach it; otherwise fall back to the reachable host.
    const isLoopback = (h) => !h || h === 'localhost' || h === '127.0.0.1' || h === '::1';
    const sshHost = isLoopback(asteriskHost) ? reachableHost : asteriskHost;

    return {
      // Backend environment variables
      backend: {
        ASTERISK_HOST: asteriskHost,
        ASTERISK_AMI_PORT: amiPort,
        ASTERISK_AMI_USERNAME: amiUser,
        ASTERISK_AMI_SECRET: '(your backend/.env ASTERISK_AMI_SECRET)',
        SIP_DOMAIN: sipDomain,
        SIP_PORT: sipPort
      },

      // Frontend environment variables (optional — the app auto-detects these
      // when they are unset, so only set them to force a specific server).
      frontend: {
        REACT_APP_SIP_SERVER: reachableHost,
        REACT_APP_SIP_PORT: sipPort,
        REACT_APP_SIP_WS_URL: `ws://${reachableHost}:${sipPort}/ws`,
        REACT_APP_CLIENT_IP: reachableHost
      },

      // SSH connection info
      ssh: {
        command: `ssh ${sshUser || 'asterisk'}@${sshHost}`,
        password: '(your Asterisk SSH password)',
        ip: sshHost,
        port: sshPort
      },

      notes: [
        'Values in parentheses are not stored in the app — copy them from backend/.env on the server.',
        'Frontend variables are optional: the app auto-detects the SIP/WebSocket server when they are unset.'
      ]
    };
  }
}

// Export singleton instance
const networkDiagnostics = new NetworkDiagnostics();

// Add to window for development access
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.networkDiagnostics = networkDiagnostics;
}

export default networkDiagnostics;
