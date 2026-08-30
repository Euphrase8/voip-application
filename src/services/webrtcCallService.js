import CONFIG from './config';
import { getToken } from './login';
import { checkBrowserCompatibility, getMediaStreamWithFallback } from '../utils/browserCompat';
import audioManager from './audioManager';
import webrtcMonitor from '../utils/webrtcMonitor';
import { microphoneFix } from '../utils/microphoneFix';
import { addMessageListener, sendWebSocketMessage, getWebSocket, connectWebSocket } from './websocketservice';

class WebRTCCallService {
  constructor() {
    this.currentCall = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteAudio = null;
    this.onIncomingCall = null;
    this.onCallStatusChange = null;
    this.onCallEnded = null;
    this.connected = false;
    this.connectionEstablished = false;
    this.extension = null;
    this.connectionTimeout = null;
    this.iceCandidateBuffer = [];
    this.isOfferAnswerExchangeComplete = false;
    this._wsUnsubscribe = null;
    this._ringTimeoutId = null;

    // WebRTC configuration optimized for voice calls
    this.rtcConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    // Audio constraints optimized for voice calls
    this.audioConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1
      },
      video: false
    };

    // Initialize audio element
    this.setupAudioElement();
  }

  // Setup audio element for remote stream using audio manager
  setupAudioElement() {
    this.remoteAudio = audioManager.setupRemoteAudio();

    // Handle audio play issues
    this.remoteAudio.addEventListener('canplay', () => {
      console.log('[WebRTCCallService] Remote audio ready to play');
    });

    this.remoteAudio.addEventListener('error', (error) => {
      console.error('[WebRTCCallService] Remote audio error:', error);
    });
  }

  // Check browser compatibility with HTTP support
  checkBrowserSupport() {
    return checkBrowserCompatibility();
  }

  // Audio control methods - delegate to audio manager
  toggleMute() {
    return audioManager.toggleMute();
  }

  setMute(muted) {
    audioManager.setMute(muted);
    return !muted;
  }

  setVolume(volume) {
    return audioManager.setVolume(volume);
  }

  getVolume() {
    return audioManager.getVolume();
  }

  isMicrophoneMuted() {
    return audioManager.isMuted();
  }

  // Initialize WebRTC service with extension — now uses shared WebSocket
  initialize(extension, onIncomingCall, onCallStatusChange, onCallEnded) {
    console.log('[WebRTCCallService] Initializing with extension:', extension);
    // If already initialized for same extension, just update callbacks (avoid duplicate listeners)
    if (this.extension === extension && this._wsUnsubscribe) {
      console.log('[WebRTCCallService] Already initialized for', extension, '- updating callbacks only');
      this.onIncomingCall = onIncomingCall;
      this.onCallStatusChange = onCallStatusChange;
      this.onCallEnded = onCallEnded;
      return;
    }

    // Clean previous subscription if extension changed
    if (this._wsUnsubscribe) {
      this._wsUnsubscribe();
      this._wsUnsubscribe = null;
    }

    this.extension = extension;
    this.onIncomingCall = onIncomingCall;
    this.onCallStatusChange = onCallStatusChange;
    this.onCallEnded = onCallEnded;

    // Check browser support
    const support = this.checkBrowserSupport();
    console.log('[WebRTCCallService] Browser support check:', support);

    if (!support.supported) {
      console.warn('[WebRTCCallService] Browser compatibility issues:', support.issues);
      if (support.issues.some(issue => issue.includes('Not running in a browser environment'))) {
        this.onCallStatusChange && this.onCallStatusChange(`Critical browser issue: ${support.issues.join(', ')}`);
        return;
      } else {
        console.warn('[WebRTCCallService] Continuing despite compatibility warnings');
      }
    }

    if (support.warnings && support.warnings.length > 0) {
      console.warn('[WebRTCCallService] Browser warnings:', support.warnings);
    }

    console.log('[WebRTCCallService] Setting up shared WebSocket listener...');
    this.setupWebSocket();
  }

  // Setup shared WebSocket listener — single connection per extension via websocketservice
  setupWebSocket() {
    if (!this.extension) {
      console.error('[WebRTCCallService] No extension provided for WebSocket setup');
      return;
    }

    // Ensure the shared WebSocket is connected (login already does, but guard for direct page loads)
    let ws = getWebSocket();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[WebRTCCallService] Shared WebSocket not open, connecting via websocketservice...');
      try {
        connectWebSocket(this.extension);
      } catch (e) {
        console.warn('[WebRTCCallService] connectWebSocket failed:', e);
      }
    }

    // Avoid duplicate subscription
    if (this._wsUnsubscribe) return;

    this._wsUnsubscribe = addMessageListener(async (event) => {
      const raw = typeof event.data === 'string' ? event.data : '';
      const frames = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      for (const frame of frames.length ? frames : [raw]) {
        if (!frame || typeof frame !== 'string') continue;
        let message;
        try {
          message = JSON.parse(frame);
        } catch (e) {
          continue;
        }
        // Only handle WebRTC voice messages; video is handled by videoCallService
        switch (message.type) {
          case 'webrtc_call_invitation':
            if (message.media === 'video') break;
            this.handleIncomingCallInvitation(message);
            break;
          case 'webrtc_call_initiated':
            // Caller side: ensure state reflects ringing if invitation was initiated via call.js
            // No-op here - call.js sets currentCall directly
            break;
          case 'webrtc_call_accepted':
            this.handleCallAccepted(message);
            break;
          case 'webrtc_call_rejected':
            this.handleCallRejected(message);
            break;
          case 'webrtc_call_cancelled':
            this.handleCallCancelled(message);
            break;
          case 'webrtc_offer':
            this.handleOffer(message);
            break;
          case 'webrtc_answer':
            this.handleAnswer(message);
            break;
          case 'webrtc_ice_candidate':
            this.handleIceCandidate(message);
            break;
          case 'webrtc_call_ended':
            this.handleCallEnded(message);
            break;
          case 'call_ended':
            // Backward compat: some hangup paths broadcast call_ended
            this.handleCallEnded(message);
            break;
          default:
            break;
        }
      }
    });

    // Mark as connected if shared socket is open, otherwise wait briefly
    ws = getWebSocket();
    this.connected = !!(ws && ws.readyState === WebSocket.OPEN);
    if (this.connected) {
      this.onCallStatusChange && this.onCallStatusChange('Ready');
    } else {
      // Poll for connection up to 5s
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        const cur = getWebSocket();
        if (cur && cur.readyState === WebSocket.OPEN) {
          clearInterval(check);
          this.connected = true;
          this.onCallStatusChange && this.onCallStatusChange('Ready');
        } else if (attempts > 50) {
          clearInterval(check);
        }
      }, 100);
    }
  }

  // Wait until shared WebSocket connection is ready
  async ensureConnected(timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ws = getWebSocket();
      if (ws && ws.readyState === WebSocket.OPEN) {
        this.connected = true;
        return true;
      }
      // Ensure connection attempt is in progress
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        try { connectWebSocket(this.extension); } catch {}
      }
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('WebSocket connection timeout');
  }

  // Handle incoming call invitation — enforces single call, busy auto-reject, and ring timeout
  handleIncomingCallInvitation(message) {
    console.log('[WebRTCCallService] Incoming call from:', message.caller_extension, message);

    // If already in a call, auto-reject as busy (no duplicate sessions)
    if (this.currentCall) {
      console.log('[WebRTCCallService] Busy - auto rejecting incoming call', message.call_id);
      sendWebSocketMessage({
        type: 'webrtc_call_rejected',
        call_id: message.call_id,
        channel: message.call_id,
        to: message.caller_extension,
        from: this.extension
      }).catch(() => {});
      return;
    }

    this.currentCall = {
      id: message.call_id,
      caller: message.caller_extension,
      callerUsername: message.caller_username,
      callee: this.extension,
      type: 'incoming'
    };

    // Start ring timeout (30s) — auto reject if not answered
    this._clearRingTimeout();
    this._ringTimeoutId = setTimeout(() => {
      console.log('[WebRTCCallService] Ring timeout - auto rejecting', this.currentCall?.id);
      this.rejectCall();
    }, 30000);

    // Notify the UI about incoming call — generic for any extension
    if (this.onIncomingCall) {
      this.onIncomingCall({
        from: message.caller_extension,
        fromUsername: message.caller_username,
        caller_username: message.caller_username,
        callId: message.call_id,
        channel: message.call_id,
        priority: 'normal',
        transport: 'transport-ws',
        onAccept: () => this.acceptCall(),
        onReject: () => this.rejectCall()
      });
    }

    this.onCallStatusChange && this.onCallStatusChange(`Incoming call from ${message.caller_username || message.caller_extension}`);
  }

  // Accept incoming call
  async acceptCall() {
    if (!this.currentCall) return;

    try {
      console.log('[WebRTCCallService] Accepting call:', this.currentCall.id);
      this._clearRingTimeout();

      // Setup local media
      await this.setupLocalMedia();

      // Send acceptance via shared WebSocket
      this.sendMessage({
        type: 'webrtc_call_accepted',
        call_id: this.currentCall.id,
        channel: this.currentCall.id,
        to: this.currentCall.caller,
        from: this.currentCall.callee,
      });

      this.onCallStatusChange && this.onCallStatusChange(`Connecting to ${this.currentCall.caller}...`);

      // Set up connection monitoring
      this.connectionEstablished = false;

    } catch (error) {
      console.error('[WebRTCCallService] Failed to accept call:', error);
      this.onCallStatusChange && this.onCallStatusChange(`Call failed: ${error.message}`);
      setTimeout(() => {
        this.rejectCall();
      }, 3000);
    }
  }

  // Reject incoming call
  rejectCall() {
    if (!this.currentCall) return;

    console.log('[WebRTCCallService] Rejecting call:', this.currentCall.id);
    this._clearRingTimeout();

    this.sendMessage({
      type: 'webrtc_call_rejected',
      call_id: this.currentCall.id,
      channel: this.currentCall.id,
      to: this.currentCall.caller,
      from: this.currentCall.callee,
    });

    this.currentCall = null;
    this.onCallStatusChange && this.onCallStatusChange('Call rejected');
    this.onCallEnded && this.onCallEnded();
  }

  // Caller cancelled while still ringing
  handleCallCancelled(message) {
    console.log('[WebRTCCallService] Call cancelled by caller', message);
    if (!this.currentCall) return;
    const ch = message.call_id || message.channel;
    if (ch && this.currentCall.id !== ch) return;
    this._clearRingTimeout();
    this.currentCall = null;
    this.onCallStatusChange && this.onCallStatusChange('Call cancelled');
    this.onCallEnded && this.onCallEnded();
  }

  // Handle call accepted by target
  async handleCallAccepted(message) {
    console.log('[WebRTCCallService] Call accepted by target', message);

    if (!this.currentCall) {
      console.error('[WebRTCCallService] No current call found when handling acceptance');
      if (message.channel && message.from && message.to) {
        this.currentCall = {
          id: message.channel || message.call_id,
          target: message.from,
          caller: message.to,
          type: 'outgoing'
        };
        console.log('[WebRTCCallService] Reconstructed call info:', this.currentCall);
      } else {
        console.error('[WebRTCCallService] Cannot reconstruct call info from message');
        return;
      }
    }

    const incomingId = message.call_id || message.channel;
    if (incomingId && this.currentCall.id && incomingId !== this.currentCall.id) {
      console.log('[WebRTCCallService] Ignoring acceptance for different call', incomingId, this.currentCall.id);
      return;
    }

    this._clearRingTimeout();

    // Set up connection timeout
    this.connectionTimeout = setTimeout(() => {
      console.warn('[WebRTCCallService] ⏰ Connection timeout - call may be stuck');
      this.onCallStatusChange && this.onCallStatusChange('Connection timeout - retrying...');
      this.retryConnection();
    }, 15000);

    try {
      await this.createPeerConnection();
      await this.createOffer();
      this.onCallStatusChange && this.onCallStatusChange('Connecting...');
    } catch (error) {
      console.error('[WebRTCCallService] Error in call acceptance flow:', error);
      this.onCallStatusChange && this.onCallStatusChange('Connection failed');
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
      }
    }
  }

  // Retry connection mechanism
  async retryConnection() {
    console.log('[WebRTCCallService] Retrying connection...');

    try {
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }
      await this.createPeerConnection();
      await this.createOffer();
      this.onCallStatusChange && this.onCallStatusChange('Retrying connection...');
    } catch (error) {
      console.error('[WebRTCCallService] Retry failed:', error);
      this.onCallStatusChange && this.onCallStatusChange('Connection failed');
    }
  }

  // Handle call rejected by target
  handleCallRejected(message) {
    console.log('[WebRTCCallService] Call rejected by target', message);
    const incomingId = message.call_id || message.channel;
    if (incomingId && this.currentCall && incomingId !== this.currentCall.id) return;

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    this._clearRingTimeout();
    webrtcMonitor.stopMonitoring();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.cleanupLocalMedia();
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }
    this.currentCall = null;
    this.connectionEstablished = false;
    this.isOfferAnswerExchangeComplete = false;
    this.iceCandidateBuffer = [];

    this.onCallStatusChange && this.onCallStatusChange('Call rejected');
    this.onCallEnded && this.onCallEnded();
  }

  // Setup local media (audio) with enhanced error handling
  async setupLocalMedia() {
    try {
      console.log('[WebRTCCallService] Setting up local media...');

      if (this.localStream && this.localStream.active) {
        console.log('[WebRTCCallService] Local media already available');
        return this.localStream;
      }

      this.cleanupLocalMedia();
      this.localStream = await audioManager.setupLocalMedia();

      if (!this.localStream || !this.localStream.active) {
        throw new Error('Failed to get active media stream');
      }

      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length === 0) {
        throw new Error('No audio tracks available');
      }

      console.log('[WebRTCCallService] Local media setup successful:', {
        streamId: this.localStream.id,
        audioTracks: audioTracks.length,
        trackSettings: audioTracks[0].getSettings()
      });

      audioTracks.forEach(track => {
        track.addEventListener('ended', () => {
          console.warn('[WebRTCCallService] Audio track ended');
          this.onCallStatusChange && this.onCallStatusChange('Microphone disconnected');
        });
      });

      return this.localStream;
    } catch (error) {
      console.error('[WebRTCCallService] Failed to get local media:', error);
      let errorMessage = 'Microphone access failed';
      if (error.name === 'NotAllowedError') {
        errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = 'Microphone is being used by another application.';
      }
      this.onCallStatusChange && this.onCallStatusChange(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Clean up local media
  cleanupLocalMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('[WebRTCCallService] Stopped track:', track.kind);
      });
      this.localStream = null;
    }
  }

  // Create peer connection
  async createPeerConnection() {
    console.log('[WebRTCCallService] Creating peer connection with config:', this.rtcConfiguration);

    const RTCPeerConnectionClass = window.RTCPeerConnection ||
                                  window.webkitRTCPeerConnection ||
                                  window.mozRTCPeerConnection;

    if (!RTCPeerConnectionClass) {
      throw new Error('RTCPeerConnection is not supported in this browser');
    }

    this.peerConnection = new RTCPeerConnectionClass(this.rtcConfiguration);

    if (!this.localStream) {
      console.log('[WebRTCCallService] No local stream, setting up media...');
      await this.setupLocalMedia();
    }

    if (this.localStream) {
      console.log('[WebRTCCallService] Adding local stream tracks:', this.localStream.getTracks().length);
      this.localStream.getTracks().forEach(track => {
        console.log('[WebRTCCallService] Adding track:', track.kind, track.enabled);
        this.peerConnection.addTrack(track, this.localStream);
      });
    } else {
      console.error('[WebRTCCallService] No local stream available!');
    }

    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTCCallService] Received remote stream:', event.streams[0]);

      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        this.remoteAudio.srcObject = remoteStream;
        this.remoteAudio.play().then(() => {
          console.log('[WebRTCCallService] Remote audio playing successfully');
          this.onCallStatusChange && this.onCallStatusChange('Audio Connected');
          this.connectionEstablished = true;
          this.connected = true;
        }).catch(error => {
          console.warn('[WebRTCCallService] Remote audio autoplay failed:', error);
          this.onCallStatusChange && this.onCallStatusChange('Audio ready - click to enable');
          const enableAudio = () => {
            this.remoteAudio.play().then(() => {
              console.log('[WebRTCCallService] Audio enabled by user interaction');
              this.onCallStatusChange && this.onCallStatusChange('Audio Connected');
              this.connectionEstablished = true;
              this.connected = true;
              document.removeEventListener('click', enableAudio);
            });
          };
          document.addEventListener('click', enableAudio, { once: true });
        });
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[WebRTCCallService] Connection state:', state);

      switch (state) {
        case 'connected':
          this.connectionEstablished = true;
          this.connected = true;
          this.onCallStatusChange && this.onCallStatusChange('Connected');
          break;
        case 'disconnected':
          this.connectionEstablished = false;
          this.connected = false;
          this.onCallStatusChange && this.onCallStatusChange('Disconnected');
          break;
        case 'failed':
          this.connectionEstablished = false;
          this.connected = false;
          this.onCallStatusChange && this.onCallStatusChange('Connection Failed');
          if (this.currentCall) this.endCall();
          break;
        case 'closed':
          this.connectionEstablished = false;
          this.connected = false;
          break;
        case 'connecting':
          this.onCallStatusChange && this.onCallStatusChange('Connecting...');
          break;
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTCCallService] Sending ICE candidate:', event.candidate.candidate);
        this.sendMessage({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate,
          to: this.currentCall.type === 'outgoing'
            ? (this.currentCall.target || this.currentCall.caller)
            : (this.currentCall.caller || this.currentCall.target),
          from: this.extension,
          channel: this.currentCall.id
        });
      } else {
        console.log('[WebRTCCallService] ICE gathering complete');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTCCallService] ICE connection state:', this.peerConnection.iceConnectionState);

      switch (this.peerConnection.iceConnectionState) {
        case 'connected':
        case 'completed':
          console.log('[WebRTCCallService] ✅ ICE connection established!');
          this.onCallStatusChange && this.onCallStatusChange('Connected - Audio Active');
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          webrtcMonitor.startMonitoring(this.peerConnection, (stats) => {
            const quality = webrtcMonitor.getConnectionQuality();
            console.log('[WebRTCCallService] Connection quality:', quality, stats);
            if (quality === 'poor') {
              this.onCallStatusChange && this.onCallStatusChange('Poor connection quality');
            }
          });
          break;
        case 'checking':
          console.log('[WebRTCCallService] 🔄 ICE connection checking...');
          this.onCallStatusChange && this.onCallStatusChange('Establishing Connection...');
          break;
        case 'disconnected':
          console.log('[WebRTCCallService] ⚠️ ICE connection disconnected');
          this.onCallStatusChange && this.onCallStatusChange('Connection Lost');
          break;
        case 'failed':
          console.log('[WebRTCCallService] ❌ ICE connection failed');
          this.onCallStatusChange && this.onCallStatusChange('Connection Failed');
          break;
      }
    };
  }

  // Create and send offer
  async createOffer() {
    if (!this.currentCall) {
      console.error('[WebRTCCallService] Cannot create offer: no current call');
      return;
    }

    if (!this.peerConnection) {
      console.error('[WebRTCCallService] Cannot create offer: no peer connection');
      return;
    }

    console.log('[WebRTCCallService] Creating offer for call:', this.currentCall);

    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      await this.peerConnection.setLocalDescription(offer);

      this.sendMessage({
        type: 'webrtc_offer',
        offer: offer,
        to: this.currentCall.target,
        from: this.extension,
        channel: this.currentCall.id
      });

      console.log('[WebRTCCallService] ✅ Offer sent to:', this.currentCall.target);
    } catch (error) {
      console.error('[WebRTCCallService] ❌ Failed to create/send offer:', error);
      this.onCallStatusChange && this.onCallStatusChange('Failed to create offer');
    }
  }

  // Handle received offer
  async handleOffer(message) {
    console.log('[WebRTCCallService] Received offer:', message);
    const expected = this.currentCall?.id || message.channel || message.call_id;
    if (this.currentCall && expected && this.currentCall.id !== expected) {
      console.log('[WebRTCCallService] Ignoring offer for different call', expected, this.currentCall.id);
      return;
    }

    try {
      await this.createPeerConnection();

      let offer = message.offer;
      if (typeof offer === 'string') {
        offer = JSON.parse(offer);
      }

      if (!offer || !offer.type || !offer.sdp) {
        console.error('[WebRTCCallService] Invalid offer structure:', offer);
        return;
      }

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.isOfferAnswerExchangeComplete = true;
      await this.processBufferedCandidates();

      this.sendMessage({
        type: 'webrtc_answer',
        answer: answer,
        to: message.from || message.caller_extension || this.currentCall.caller,
        from: this.extension,
        channel: message.channel || message.call_id || this.currentCall.id
      });
    } catch (error) {
      console.error('[WebRTCCallService] Error handling offer:', error);
    }
  }

  // Handle received answer
  async handleAnswer(message) {
    console.log('[WebRTCCallService] Received answer:', message);
    const expected = this.currentCall?.id || message.channel || message.call_id;
    if (this.currentCall && expected && this.currentCall.id !== expected) return;

    try {
      let answer = message.answer;
      if (typeof answer === 'string') {
        answer = JSON.parse(answer);
      }
      if (!answer || !answer.type || !answer.sdp) {
        console.error('[WebRTCCallService] Invalid answer structure:', answer);
        return;
      }
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      this.isOfferAnswerExchangeComplete = true;
      await this.processBufferedCandidates();
      console.log('[WebRTCCallService] Call connected successfully!');
      this.onCallStatusChange && this.onCallStatusChange('Connected');
    } catch (error) {
      console.error('[WebRTCCallService] Error handling answer:', error);
    }
  }

  // Handle ICE candidate with buffering
  async handleIceCandidate(message) {
    try {
      if (!message.candidate) return;
      let candidate = message.candidate;
      if (typeof candidate === 'string') {
        candidate = JSON.parse(candidate);
      }
      if (!this.peerConnection || !this.isOfferAnswerExchangeComplete) {
        this.iceCandidateBuffer.push(candidate);
        return;
      }
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[WebRTCCallService] Error handling ICE candidate:', error);
      if (message.candidate && !this.iceCandidateBuffer.includes(message.candidate)) {
        this.iceCandidateBuffer.push(message.candidate);
      }
    }
  }

  // Process buffered ICE candidates
  async processBufferedCandidates() {
    if (this.iceCandidateBuffer.length === 0) return;
    const candidates = [...this.iceCandidateBuffer];
    this.iceCandidateBuffer = [];
    for (const candidate of candidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('[WebRTCCallService] Failed to add buffered candidate:', error);
      }
    }
  }

  // Handle call ended
  handleCallEnded(message) {
    console.log('[WebRTCCallService] Call ended by peer', message);
    const incomingId = message.call_id || message.channel;
    if (this.currentCall && incomingId && this.currentCall.id !== incomingId) return;
    if (this.onCallEnded) {
      this.onCallEnded();
    }
    this.endCall(true);
  }

  // End current call with comprehensive cleanup — isRemote indicates we already received remote ended
  endCall(isRemote = false) {
    console.log('[WebRTCCallService] Ending call...', isRemote ? '(remote)' : '(local)');
    this._clearRingTimeout();

    if (this.currentCall && !isRemote) {
      const peer =
        this.currentCall.type === 'outgoing'
          ? this.currentCall.target
          : (this.currentCall.caller || this.currentCall.target);

      this.sendMessage({
        type: 'webrtc_call_ended',
        call_id: this.currentCall.id,
        channel: this.currentCall.id,
        to: peer,
        from: this.extension,
      });

      this.callBackendHangup();
    }

    this.cleanup(isRemote);
    this.onCallStatusChange && this.onCallStatusChange('Call ended');
    if (!isRemote) this.onCallEnded && this.onCallEnded();
  }

  // Call backend hangup API
  async callBackendHangup() {
    if (!this.currentCall) return;
    try {
      const response = await fetch(`${CONFIG.API_URL}/protected/call/hangup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          channel: this.currentCall.id
        })
      });
      if (response.ok) {
        console.log('[WebRTCCallService] Backend hangup successful');
      } else {
        console.warn('[WebRTCCallService] Backend hangup failed:', response.status);
      }
    } catch (error) {
      console.warn('[WebRTCCallService] Backend hangup error:', error);
    }
  }

  // Comprehensive cleanup — preserve shared WebSocket unless full destroy
  cleanup(preserveWs = true) {
    console.log('[WebRTCCallService] Performing cleanup...');

    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    this._clearRingTimeout();
    webrtcMonitor.stopMonitoring();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.cleanupLocalMedia();
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }

    // Only tear down shared WS listener on full destroy, not per-call cleanup
    if (!preserveWs) {
      this.cleanupWebSocket();
    }

    this.currentCall = null;
    this.connectionEstablished = false;
    this.isOfferAnswerExchangeComplete = false;
    this.iceCandidateBuffer = [];
    console.log('[WebRTCCallService] Cleanup complete');
  }

  _clearRingTimeout() {
    if (this._ringTimeoutId) {
      clearTimeout(this._ringTimeoutId);
      this._ringTimeoutId = null;
    }
  }

  // Check if connection is established
  isConnected() {
    return this.connectionEstablished;
  }

  // Get connection status
  getConnectionStatus() {
    if (this.connectionEstablished) return 'connected';
    if (this.peerConnection) {
      return this.peerConnection.connectionState || 'connecting';
    }
    const ws = getWebSocket();
    if (ws && ws.readyState === WebSocket.OPEN) return 'ready';
    return 'disconnected';
  }

  // Send message via shared WebSocket
  sendMessage(message) {
    sendWebSocketMessage(message).catch(err => {
      console.error('[WebRTCCallService] Failed to send via shared WS:', err, message);
    });
  }

  // Cleanup shared WebSocket listener (called from external destroy)
  cleanupWebSocket() {
    if (this._wsUnsubscribe) {
      this._wsUnsubscribe();
      this._wsUnsubscribe = null;
    }
    this.connected = false;
  }

  // Full destroy — call on logout/unmount
  destroy() {
    this.cleanup(false);
    this.extension = null;
    this.onIncomingCall = null;
    this.onCallStatusChange = null;
    this.onCallEnded = null;
  }
}

// Export singleton instance
export default new WebRTCCallService();
