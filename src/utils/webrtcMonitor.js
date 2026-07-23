// WebRTC Performance Monitor
// Monitors connection quality, audio levels, and performance metrics

class WebRTCMonitor {
  constructor() {
    this.stats = {
      connectionState: 'new',
      iceConnectionState: 'new',
      audioLevel: 0,
      packetsLost: 0,
      roundTripTime: 0,
      jitter: 0,
      bitrate: 0
    };
    
    this.monitoring = false;
    this.monitoringInterval = null;
    this.onStatsUpdate = null;
  }

  // Start monitoring a peer connection
  startMonitoring(peerConnection, onStatsUpdate) {
    if (!peerConnection) {
      console.error('[WebRTCMonitor] No peer connection provided');
      return;
    }

    this.peerConnection = peerConnection;
    this.onStatsUpdate = onStatsUpdate;
    this.monitoring = true;

    console.log('[WebRTCMonitor] Starting performance monitoring');

    // Monitor connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      this.stats.connectionState = this.peerConnection.connectionState;
      this.notifyStatsUpdate();
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      this.stats.iceConnectionState = this.peerConnection.iceConnectionState;
      this.notifyStatsUpdate();
    };

    // Start periodic stats collection
    this.monitoringInterval = setInterval(() => {
      this.collectStats();
    }, 1000); // Collect stats every second
  }

  // Stop monitoring
  stopMonitoring() {
    console.log('[WebRTCMonitor] Stopping performance monitoring');
    
    this.monitoring = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.peerConnection = null;
    this.onStatsUpdate = null;
  }

  // Collect WebRTC statistics
  async collectStats() {
    if (!this.peerConnection || !this.monitoring) return;

    try {
      const stats = await this.peerConnection.getStats();
      
      stats.forEach(report => {
        switch (report.type) {
          case 'inbound-rtp':
            if (report.mediaType === 'audio') {
              this.processInboundAudioStats(report);
            }
            break;
          case 'outbound-rtp':
            if (report.mediaType === 'audio') {
              this.processOutboundAudioStats(report);
            }
            break;
          case 'candidate-pair':
            if (report.state === 'succeeded') {
              this.processConnectionStats(report);
            }
            break;
          default:
            break;
        }
      });

      this.notifyStatsUpdate();
    } catch (error) {
      console.error('[WebRTCMonitor] Error collecting stats:', error);
    }
  }

  // Process inbound audio statistics
  processInboundAudioStats(report) {
    if (report.packetsLost !== undefined) {
      this.stats.packetsLost = report.packetsLost;
    }
    
    if (report.jitter !== undefined) {
      this.stats.jitter = Math.round(report.jitter * 1000); // Convert to ms
    }

    if (report.audioLevel !== undefined) {
      this.stats.audioLevel = Math.round(report.audioLevel * 100);
    }
  }

  // Process outbound audio statistics
  processOutboundAudioStats(report) {
    if (report.bytesSent !== undefined && this.lastBytesSent !== undefined) {
      const bytesDiff = report.bytesSent - this.lastBytesSent;
      this.stats.bitrate = Math.round((bytesDiff * 8) / 1000); // Convert to kbps
    }
    this.lastBytesSent = report.bytesSent;
  }

  // Process connection statistics
  processConnectionStats(report) {
    if (report.currentRoundTripTime !== undefined) {
      this.stats.roundTripTime = Math.round(report.currentRoundTripTime * 1000); // Convert to ms
    }
  }

  // Notify listeners of stats update
  notifyStatsUpdate() {
    if (this.onStatsUpdate) {
      this.onStatsUpdate(this.stats);
    }
  }

  // Get connection quality assessment
  getConnectionQuality() {
    const { packetsLost, roundTripTime, jitter } = this.stats;
    
    if (packetsLost > 5 || roundTripTime > 300 || jitter > 50) {
      return 'poor';
    } else if (packetsLost > 2 || roundTripTime > 150 || jitter > 20) {
      return 'fair';
    } else {
      return 'good';
    }
  }

  // Get human-readable stats
  getReadableStats() {
    const quality = this.getConnectionQuality();
    
    return {
      quality: quality,
      connection: this.stats.connectionState,
      iceConnection: this.stats.iceConnectionState,
      audioLevel: `${this.stats.audioLevel}%`,
      packetsLost: this.stats.packetsLost,
      latency: `${this.stats.roundTripTime}ms`,
      jitter: `${this.stats.jitter}ms`,
      bitrate: `${this.stats.bitrate} kbps`
    };
  }
}

// Export singleton instance
export const webrtcMonitor = new WebRTCMonitor();
export default webrtcMonitor;
