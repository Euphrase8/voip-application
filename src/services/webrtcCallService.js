import CONFIG from './config';
import { checkBrowserCompatibility, getMediaStreamWithFallback } from '../utils/browserCompat';
import audioManager from './audioManager';
import webrtcMonitor from '../utils/webrtcMonitor';
import { microphoneFix } from '../utils/microphoneFix';

class WebRTCCallService {
  constructor() {
    this.ws = null;
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

  // Initialize WebRTC service with extension
  initialize(extension, onIncomingCall, onCallStatusChange, onCallEnded) {
    console.log('[WebRTCCallService] Initializing with extension:', extension);
    this.extension = extension;
    this.onIncomingCall = onIncomingCall;
    this.onCallStatusChange = onCallStatusChange;
    this.onCallEnded = onCallEnded;

    // Check browser support
    const support = this.checkBrowserSupport();
    console.log('[WebRTCCallService] Browser support check:', support);

    if (!support.supported) {
      console.warn('[WebRTCCallService] Browser compatibility issues:', support.issues);
      // Don't block initialization, just warn the user
      if (support.issues.some(issue => issue.includes('Not running in a browser environment'))) {
        this.onCallStatusChange && this.onCallStatusChange(`Critical browser issue: ${support.issues.join(', ')}`);
        return;
      } else {
        // For other issues, just log warnings but continue
        console.warn('[WebRTCCallService] Continuing despite compatibility warnings');
      }
    }

    // Show warnings but continue
    if (support.warnings && support.warnings.length > 0) {
      console.warn('[WebRTCCallService] Browser warnings:', support.warnings);
      // Don't block initialization for warnings
    }

    console.log('[WebRTCCallService] Setting up WebSocket connection...');
    this.setupWebSocket();
  }

  // Setup WebSocket connection for WebRTC signaling
  setupWebSocket() {
    if (!this.extension) {
      console.error('[WebRTCCallService] No extension provided for WebSocket setup');
      return;
    }

    // Connection promise so callers can await readiness
    this._connectPromise = new Promise((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;
    });

    // Check if WebSocket is available
    if (!window.WebSocket) {
      console.error('[WebRTCCallService] WebSocket is not supported in this browser');
      this.onCallStatusChange && this.onCallStatusChange('WebSocket not supported');
      return;
    }

    const wsUrl = `${CONFIG.WS_URL}?extension=${encodeURIComponent(this.extension)}`;
    console.log('[WebRTCCallService] Connecting to WebSocket:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (error) {
      console.error('[WebRTCCallService] Failed to create WebSocket:', error);
      this.onCallStatusChange && this.onCallStatusChange('WebSocket connection failed');
      return;
    }

    this.ws.onopen = () => {
      console.log('[WebRTCCallService] WebSocket connected successfully');
      this.connected = true;
      this._connectResolve && this._connectResolve(true);
      this.onCallStatusChange && this.onCallStatusChange('Ready');
    };

    this.ws.onmessage = async (event) => {
      // Some servers may send multiple JSON objects in one frame (newline-separated)
      // or non-JSON keepalive data. Be defensive.
      const raw = typeof event.data === 'string' ? event.data : '';

      const frames = raw
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);

      for (const frame of frames.length ? frames : [raw]) {
        if (!frame || typeof frame !== 'string') continue;

        let message;
        try {
          message = JSON.parse(frame);
        } catch (e) {
          console.warn('[WebRTCCallService] Non-JSON or malformed WS message ignored:', frame.slice(0, 200));
          continue;
        }

        console.log('[WebRTCCallService] Received message:', message);

        switch (message.type) {
          case 'webrtc_call_invitation':
            this.handleIncomingCallInvitation(message);
            break;
          case 'webrtc_call_accepted':
            this.handleCallAccepted(message);
            break;
          case 'webrtc_call_rejected':
            this.handleCallRejected(message);
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
          default:
            // ignore unknown message types
            break;
        }
      }
    };

    this.ws.onclose = (event) => {
      console.log('[WebRTCCallService] WebSocket disconnected:', event.code, event.reason);
      this.connected = false;
      this.onCallStatusChange && this.onCallStatusChange('Disconnected');
    };

    this.ws.onerror = (error) => {
      console.error('[WebRTCCallService] WebSocket error:', error);
      this.connected = false;
      this._connectReject && this._connectReject(error);
      this.onCallStatusChange && this.onCallStatusChange('Connection error');
    };
  }

  // Wait until WebSocket connection is ready
  async ensureConnected(timeoutMs = 5000) {
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) return true;

    if (!this._connectPromise) {
      // Not initialized yet
      throw new Error('WebRTC signaling is not initialized (WebSocket not created)');
    }

    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('WebSocket connection timeout')), timeoutMs);
    });

    await Promise.race([this._connectPromise, timeout]);
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // Handle incoming call invitation
  handleIncomingCallInvitation(message) {
    console.log('[WebRTCCallService] Incoming call from:', message.caller_extension);
    
    this.currentCall = {
      id: message.call_id,
      caller: message.caller_extension,
      callerUsername: message.caller_username,
      callee: this.extension,
      type: 'incoming'
    };

    // Notify the UI about incoming call
    if (this.onIncomingCall) {
      this.onIncomingCall({
        from: message.caller_extension,
        fromUsername: message.caller_username,
        callId: message.call_id,
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
      
      // Setup local media
      await this.setupLocalMedia();
      
      // Send acceptance via WebSocket
      this.sendMessage({
        type: 'webrtc_call_accepted',
        call_id: this.currentCall.id,
        to: this.currentCall.caller,
        from: this.currentCall.callee,
        channel: this.currentCall.id
      });

      this.onCallStatusChange && this.onCallStatusChange(`Connecting to ${this.currentCall.caller}...`);

      // Set up connection monitoring
      this.connectionEstablished = false;
      
    } catch (error) {
      console.error('[WebRTCCallService] Failed to accept call:', error);

      // Provide user-friendly error message
      this.onCallStatusChange && this.onCallStatusChange(`Call failed: ${error.message}`);

      // Auto-reject the call after a brief delay to show the error
      setTimeout(() => {
        this.rejectCall();
      }, 3000);
    }
  }

  // Reject incoming call
  rejectCall() {
    if (!this.currentCall) return;

    console.log('[WebRTCCallService] Rejecting call:', this.currentCall.id);
    
    this.sendMessage({
      type: 'webrtc_call_rejected',
      call_id: this.currentCall.id,
      to: this.currentCall.caller,
      from: this.currentCall.callee,
      channel: this.currentCall.id
    });

    this.currentCall = null;
    this.onCallStatusChange && this.onCallStatusChange('Call rejected');
  }

  // Handle call accepted by target
  async handleCallAccepted(message) {
    console.log('[WebRTCCallService] Call accepted by target', message);

    // Check if we have a current call
    if (!this.currentCall) {
      console.error('[WebRTCCallService] No current call found when handling acceptance');
      console.log('[WebRTCCallService] Message details:', message);

      // Try to reconstruct call info from the message
      if (message.channel && message.from && message.to) {
        this.currentCall = {
          id: message.channel,
          target: message.from, // The person who accepted (we're calling them)
          caller: message.to,   // Us (the caller)
          type: 'outgoing'
        };
        console.log('[WebRTCCallService] Reconstructed call info:', this.currentCall);
      } else {
        console.error('[WebRTCCallService] Cannot reconstruct call info from message');
        return;
      }
    }

    // Set up connection timeout
    this.connectionTimeout = setTimeout(() => {
      console.warn('[WebRTCCallService] ⏰ Connection timeout - call may be stuck');
      this.onCallStatusChange && this.onCallStatusChange('Connection timeout - retrying...');

      // Try to restart the connection
      this.retryConnection();
    }, 15000); // 15 second timeout

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
      // Clean up existing connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      // Recreate connection
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
    console.log('[WebRTCCallService] Call rejected by target');
    this.currentCall = null;
    this.onCallStatusChange && this.onCallStatusChange('Call rejected');
  }

  // Setup local media (audio) with enhanced error handling
  async setupLocalMedia() {
    try {
      console.log('[WebRTCCallService] Setting up local media...');

      // Check if media is already available
      if (this.localStream && this.localStream.active) {
        console.log('[WebRTCCallService] Local media already available');
        return this.localStream;
      }

      // Clean up any existing stream
      this.cleanupLocalMedia();

      // Use audio manager to setup local media with proper constraints
      this.localStream = await audioManager.setupLocalMedia();

      // Verify stream is active
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

      // Handle track ended events
      audioTracks.forEach(track => {
        track.addEventListener('ended', () => {
          console.warn('[WebRTCCallService] Audio track ended');
          this.onCallStatusChange && this.onCallStatusChange('Microphone disconnected');
        });
      });

      return this.localStream;
    } catch (error) {
      console.error('[WebRTCCallService] Failed to get local media:', error);

      // Provide user-friendly error messages
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

    // Use RTCPeerConnection with fallbacks for older browsers
    const RTCPeerConnectionClass = window.RTCPeerConnection ||
                                  window.webkitRTCPeerConnection ||
                                  window.mozRTCPeerConnection;

    if (!RTCPeerConnectionClass) {
      throw new Error('RTCPeerConnection is not supported in this browser');
    }

    this.peerConnection = new RTCPeerConnectionClass(this.rtcConfiguration);

    // Setup local media first
    if (!this.localStream) {
      console.log('[WebRTCCallService] No local stream, setting up media...');
      await this.setupLocalMedia();
    }

    // Add local stream
    if (this.localStream) {
      console.log('[WebRTCCallService] Adding local stream tracks:', this.localStream.getTracks().length);
      this.localStream.getTracks().forEach(track => {
        console.log('[WebRTCCallService] Adding track:', track.kind, track.enabled);
        this.peerConnection.addTrack(track, this.localStream);
      });
    } else {
      console.error('[WebRTCCallService] No local stream available!');
    }

    // Handle remote stream with enhanced audio setup
    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTCCallService] Received remote stream:', event.streams[0]);

      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];

        // Use the pre-configured audio element
        this.remoteAudio.srcObject = remoteStream;

        // Ensure audio plays automatically
        this.remoteAudio.play().then(() => {
          console.log('[WebRTCCallService] Remote audio playing successfully');
          this.onCallStatusChange && this.onCallStatusChange('Audio Connected');

          // Mark connection as established
          this.connectionEstablished = true;
          this.connected = true;
        }).catch(error => {
          console.warn('[WebRTCCallService] Remote audio autoplay failed:', error);
          // Try to enable audio with user interaction
          this.onCallStatusChange && this.onCallStatusChange('Audio ready - click to enable');

          // Add click handler to enable audio
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

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[WebRTCCallService] Connection state:', this.peerConnection.connectionState);

      switch (this.peerConnection.connectionState) {
        case 'connected':
          this.connectionEstablished = true;
          this.connected = true;
          this.onCallStatusChange && this.onCallStatusChange('Connected');
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          this.connectionEstablished = false;
          this.connected = false;
          this.onCallStatusChange && this.onCallStatusChange('Disconnected');
          break;
        case 'connecting':
          this.onCallStatusChange && this.onCallStatusChange('Connecting...');
          break;
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTCCallService] Sending ICE candidate:', event.candidate.candidate);
        this.sendMessage({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate,
          to: this.currentCall.caller || this.currentCall.target,
          from: this.extension,
          channel: this.currentCall.id
        });
      } else {
        console.log('[WebRTCCallService] ICE gathering complete');
      }
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTCCallService] ICE connection state:', this.peerConnection.iceConnectionState);

      switch (this.peerConnection.iceConnectionState) {
        case 'connected':
        case 'completed':
          console.log('[WebRTCCallService] ✅ ICE connection established!');
          this.onCallStatusChange && this.onCallStatusChange('Connected - Audio Active');

          // Clear connection timeout on successful connection
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }

          // Start performance monitoring
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

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection.connectionState;
      console.log('[WebRTCCallService] Connection state:', state);
      
      if (state === 'connected') {
        this.onCallStatusChange && this.onCallStatusChange('Connected');
      } else if (state === 'failed' || state === 'disconnected') {
        this.endCall();
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
    console.log('[WebRTCCallService] Peer connection state:', this.peerConnection.connectionState);
    console.log('[WebRTCCallService] ICE connection state:', this.peerConnection.iceConnectionState);

    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      console.log('[WebRTCCallService] Offer created:', offer.type, offer.sdp.length, 'chars');

      await this.peerConnection.setLocalDescription(offer);
      console.log('[WebRTCCallService] Local description set');

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
    console.log('[WebRTCCallService] Offer object:', message.offer);
    console.log('[WebRTCCallService] Offer type:', typeof message.offer);

    try {
      await this.createPeerConnection();

      // Ensure the offer is in the correct format
      let offer = message.offer;
      if (typeof offer === 'string') {
        console.log('[WebRTCCallService] Offer is string, parsing...');
        offer = JSON.parse(offer);
      }

      // Validate offer structure
      if (!offer || !offer.type || !offer.sdp) {
        console.error('[WebRTCCallService] Invalid offer structure:', offer);
        return;
      }

      console.log('[WebRTCCallService] Setting remote description with offer:', offer.type, offer.sdp.length, 'chars');
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      console.log('[WebRTCCallService] ✅ Remote description set');

      console.log('[WebRTCCallService] Creating answer...');
      const answer = await this.peerConnection.createAnswer();
      console.log('[WebRTCCallService] Answer created:', answer.type, answer.sdp.length, 'chars');

      await this.peerConnection.setLocalDescription(answer);
      console.log('[WebRTCCallService] ✅ Local description set with answer');

      // Mark offer/answer exchange as complete
      this.isOfferAnswerExchangeComplete = true;

      // Process any buffered ICE candidates
      await this.processBufferedCandidates();

      console.log('[WebRTCCallService] Sending answer to:', message.from);

      this.sendMessage({
        type: 'webrtc_answer',
        answer: answer,
        to: message.from || message.caller_extension || this.currentCall.caller,
        from: this.extension,
        channel: message.channel || this.currentCall.id
      });
    } catch (error) {
      console.error('[WebRTCCallService] Error handling offer:', error);
      console.error('[WebRTCCallService] Offer that caused error:', message.offer);
    }
  }

  // Handle received answer
  async handleAnswer(message) {
    console.log('[WebRTCCallService] Received answer:', message);
    console.log('[WebRTCCallService] Answer object:', message.answer);

    try {
      // Ensure the answer is in the correct format
      let answer = message.answer;
      if (typeof answer === 'string') {
        console.log('[WebRTCCallService] Answer is string, parsing...');
        answer = JSON.parse(answer);
      }

      // Validate answer structure
      if (!answer || !answer.type || !answer.sdp) {
        console.error('[WebRTCCallService] Invalid answer structure:', answer);
        return;
      }

      console.log('[WebRTCCallService] Setting remote description with answer:', answer);
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

      // Mark offer/answer exchange as complete
      this.isOfferAnswerExchangeComplete = true;

      // Process any buffered ICE candidates
      await this.processBufferedCandidates();

      console.log('[WebRTCCallService] Call connected successfully!');
      this.onCallStatusChange && this.onCallStatusChange('Connected');
    } catch (error) {
      console.error('[WebRTCCallService] Error handling answer:', error);
      console.error('[WebRTCCallService] Answer that caused error:', message.answer);
    }
  }

  // Handle ICE candidate with buffering
  async handleIceCandidate(message) {
    console.log('[WebRTCCallService] Received ICE candidate:', message);

    try {
      if (!message.candidate) {
        console.log('[WebRTCCallService] Received end-of-candidates signal');
        return;
      }

      // Ensure the candidate is in the correct format
      let candidate = message.candidate;
      if (typeof candidate === 'string') {
        candidate = JSON.parse(candidate);
      }

      // Buffer candidates if peer connection is not ready
      if (!this.peerConnection || !this.isOfferAnswerExchangeComplete) {
        console.log('[WebRTCCallService] Buffering ICE candidate until peer connection is ready');
        this.iceCandidateBuffer.push(candidate);
        return;
      }

      console.log('[WebRTCCallService] Adding ICE candidate:', candidate);
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[WebRTCCallService] Error handling ICE candidate:', error);
      console.error('[WebRTCCallService] Candidate that caused error:', message.candidate);

      // If adding candidate fails, buffer it for retry
      if (message.candidate && !this.iceCandidateBuffer.includes(message.candidate)) {
        this.iceCandidateBuffer.push(message.candidate);
      }
    }
  }

  // Process buffered ICE candidates
  async processBufferedCandidates() {
    if (this.iceCandidateBuffer.length === 0) return;

    console.log('[WebRTCCallService] Processing', this.iceCandidateBuffer.length, 'buffered ICE candidates');

    const candidates = [...this.iceCandidateBuffer];
    this.iceCandidateBuffer = [];

    for (const candidate of candidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        console.log('[WebRTCCallService] Successfully added buffered candidate');
      } catch (error) {
        console.error('[WebRTCCallService] Failed to add buffered candidate:', error);
      }
    }
  }

  // Handle call ended
  handleCallEnded(message) {
    console.log('[WebRTCCallService] Call ended by peer');

    // Notify UI that call ended (to clear incoming call UI)
    if (this.onCallEnded) {
      this.onCallEnded();
    }

    this.endCall();
  }

  // End current call with comprehensive cleanup
  endCall() {
    console.log('[WebRTCCallService] Ending call...');

    if (this.currentCall) {
      // Send WebRTC call ended message
      this.sendMessage({
        type: 'webrtc_call_ended',
        call_id: this.currentCall.id,
        to: this.currentCall.caller || this.currentCall.target,
        from: this.extension,
        channel: this.currentCall.id
      });

      // Also send hangup message for backend cleanup
      this.sendMessage({
        type: 'hangup',
        call_id: this.currentCall.id,
        to: this.currentCall.caller || this.currentCall.target,
        from: this.extension,
        channel: this.currentCall.id
      });

      // Call backend hangup API for proper cleanup
      this.callBackendHangup();
    }

    // Comprehensive cleanup
    this.cleanup();

    this.onCallStatusChange && this.onCallStatusChange('Call ended');
    this.onCallEnded && this.onCallEnded();
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



  // Comprehensive cleanup method
  cleanup() {
    console.log('[WebRTCCallService] Performing cleanup...');

    // Clear timeouts
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // Stop performance monitoring
    webrtcMonitor.stopMonitoring();

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Clean up media streams
    this.cleanupLocalMedia();

    // Stop remote audio
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
    }

    // Clean up WebSocket connection
    this.cleanupWebSocket();

    // Reset state
    this.currentCall = null;
    this.connectionEstablished = false;
    this.connected = false;
    this.isOfferAnswerExchangeComplete = false;
    this.iceCandidateBuffer = [];

    console.log('[WebRTCCallService] Cleanup complete');
  }

  // Check if connection is established
  isConnected() {
    return this.connected && this.connectionEstablished;
  }

  // Get connection status
  getConnectionStatus() {
    if (this.connectionEstablished) return 'connected';
    if (this.peerConnection) {
      return this.peerConnection.connectionState || 'connecting';
    }
    return 'disconnected';
  }

  // Send message via WebSocket
  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('[WebRTCCallService] WebSocket not connected');
    }
  }

  // Cleanup WebSocket connection (called from external cleanup)
  cleanupWebSocket() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// Export singleton instance
export default new WebRTCCallService();
