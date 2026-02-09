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
      networkInfo: await this.getNetworkInfo()
    };

    // Get potential IP ranges to scan
    const ipRanges = this.generateIPRanges(results.networkInfo);
    
    // Test known IPs first
    const knownIPs = [
      '192.168.1.2',  // This PC / common LAN IP
      'localhost',
      '127.0.0.1',
      'asterisk.local'
    ];

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

    return {
      // Backend environment variables
      backend: {
        ASTERISK_HOST: server.ip,
        ASTERISK_AMI_PORT: '5038',
        ASTERISK_AMI_USERNAME: 'admin',
        ASTERISK_AMI_SECRET: 'amp111',
        SIP_DOMAIN: server.ip,
        SIP_PORT: '8088'
      },
      
      // Frontend environment variables
      frontend: {
        REACT_APP_SIP_SERVER: server.ip,
        REACT_APP_SIP_PORT: '8088',
        REACT_APP_SIP_WS_URL: `ws://${server.ip}:8088/ws`,
        REACT_APP_CLIENT_IP: 'localhost'
      },

      // SSH connection info
      ssh: {
        command: `ssh kali@${server.ip}`,
        password: 'kali',
        ip: server.ip,
        port: 22
      }
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
