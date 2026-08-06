import { addMessageListener, sendWebSocketMessage } from "./websocketservice";
import { getToken } from "./login";
import CONFIG from "./config";

// Single source of truth for video calling state.
//
// Call flow (WhatsApp-like):
//   caller:   idle -> calling -> ringing -> connecting -> connected -> ending/ended
//   callee:   idle -> ringing -> connecting -> connected -> ending/ended
//
// Signaling rides the shared WebSocket (websocketservice). The backend now
// relays the WebRTC payloads (offer/answer/candidate/call_id) intact.

export const VIDEO_CALL_STATES = {
  IDLE: "idle",
  CALLING: "calling",
  RINGING: "ringing",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ENDING: "ending",
  ENDED: "ended",
};

const RING_TIMEOUT_MS = 30000;
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

class VideoCallService {
  constructor() {
    this.state = VIDEO_CALL_STATES.IDLE;
    this.direction = null; // 'outgoing' | 'incoming'
    this.call = null; // { id, peerExtension, peerName, peerUserId }
    this.localStream = null;
    this.remoteStream = null;
    this.isMuted = false;
    this.isVideoOn = true;
    this.connectedSince = null;
    this.pc = null;
    this.iceBuffer = [];
    this.offerAnswerDone = false;
    this.ringTimeoutId = null;
    this.listeners = new Set();
    this._wsCleanup = null;
    this._retryTimeoutId = null;
  }

  // ------------------------------------------------------------------
  // Subscriptions / snapshot
  // ------------------------------------------------------------------

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return {
      state: this.state,
      direction: this.direction,
      call: this.call,
      localStream: this.localStream,
      remoteStream: this.remoteStream,
      isMuted: this.isMuted,
      isVideoOn: this.isVideoOn,
      connectedSince: this.connectedSince,
    };
  }

  _notify() {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (err) {
        console.error("[videoCallService] listener error:", err);
      }
    });
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  init() {
    if (this._wsCleanup) return;
    this._wsCleanup = addMessageListener((event) => {
      try {
        const data = JSON.parse(event.data);
        this._handleMessage(data);
      } catch (err) {
        // Ignore non-JSON frames (keepalives etc.)
      }
    });
  }

  destroy() {
    if (this._wsCleanup) {
      this._wsCleanup();
      this._wsCleanup = null;
    }
    this._cleanupCall();
    this.call = null;
    this.direction = null;
    this.state = VIDEO_CALL_STATES.IDLE;
    this._notify();
  }

  // ------------------------------------------------------------------
  // Incoming WebSocket messages
  // ------------------------------------------------------------------

  _handleMessage(msg) {
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "webrtc_call_invitation":
        if (msg.media === "video") this._handleInvitation(msg);
        break;
      case "webrtc_call_initiated":
        this._handleInitiated(msg);
        break;
      case "webrtc_call_accepted":
        this._handleAccepted(msg);
        break;
      case "webrtc_call_rejected":
        this._handleRejected(msg);
        break;
      case "webrtc_call_cancelled":
        this._handleCancelled(msg);
        break;
      case "webrtc_offer":
        this._handleOffer(msg);
        break;
      case "webrtc_answer":
        this._handleAnswer(msg);
        break;
      case "webrtc_ice_candidate":
        this._handleIceCandidate(msg);
        break;
      case "webrtc_call_ended":
        this._handleRemoteEnded(msg);
        break;
      case "call_status":
        if (msg.status === "ended") this._handleRemoteEnded(msg);
        break;
      default:
        break;
    }
  }

  _handleInvitation(msg) {
    // Already in a call -> automatically decline the new one (busy).
    if (this.state !== VIDEO_CALL_STATES.IDLE) {
      this._send(
        { type: "webrtc_call_rejected", call_id: msg.call_id, channel: msg.call_id, to: msg.caller_extension, from: this._myExtension() },
        true
      );
      this._callBackendHangup(msg.call_id, true);
      return;
    }

    this._resetState();
    this.direction = "incoming";
    this.call = {
      id: msg.call_id,
      peerExtension: msg.caller_extension,
      peerName: msg.caller_username || `Ext ${msg.caller_extension}`,
      peerUserId: msg.caller_id || null,
    };
    this.state = VIDEO_CALL_STATES.RINGING;
    this._startRingTimeout(() => this.rejectCall());
    this._notify();
  }

  _handleInitiated(msg) {
    if (this.direction !== "outgoing" || !this.call) return;
    if (this.state === VIDEO_CALL_STATES.CALLING) {
      this.call.id = msg.call_id || this.call.id;
      this.state = VIDEO_CALL_STATES.RINGING;
      this._startRingTimeout(() => this.cancelCall("timeout"));
      this._notify();
    }
  }

  _handleAccepted(msg) {
    if (this.direction !== "outgoing" || !this.call) return;
    if (msg.channel && this.call.id && msg.channel !== this.call.id) return;
    this._clearRingTimeout();
    this.state = VIDEO_CALL_STATES.CONNECTING;
    this._notify();
    this._callerCreateOffer().catch((err) => {
      console.error("[videoCallService] Offer creation failed:", err);
      this._failCall("Failed to establish the call");
    });
  }

  _handleRejected(msg) {
    if (this.direction !== "outgoing" || !this.call) return;
    if (msg.channel && this.call.id && msg.channel !== this.call.id) return;
    this._clearRingTimeout();
    this._cleanupCall();
    this.state = VIDEO_CALL_STATES.ENDED;
    this.call = { ...this.call, endReason: "declined" };
    this._notify();
    this._autoReturnToIdle();
  }

  _handleCancelled(msg) {
    if (this.direction !== "incoming" || !this.call) return;
    if (msg.channel && this.call.id && msg.channel !== this.call.id) return;
    this._clearRingTimeout();
    this._cleanupCall();
    this.state = VIDEO_CALL_STATES.ENDED;
    this.call = { ...this.call, endReason: "cancelled" };
    this._notify();
    this._autoReturnToIdle();
  }

  _handleRemoteEnded(msg) {
    if (!this.call) return;
    if (msg.channel && this.call.id && msg.channel !== this.call.id) return;
    if (msg.from && this.call.peerExtension && msg.from !== this.call.peerExtension) return;
    this._clearRingTimeout();
    this._cleanupCall();
    this.state = VIDEO_CALL_STATES.ENDED;
    this.call = { ...this.call, endReason: "peer-ended" };
    this._notify();
    this._autoReturnToIdle();
  }

  // ------------------------------------------------------------------
  // Outgoing call
  // ------------------------------------------------------------------

  async startCall(contact) {
    if (this.state !== VIDEO_CALL_STATES.IDLE) {
      throw new Error("A call is already in progress");
    }
    if (!contact || !contact.extension) {
      throw new Error("Invalid contact");
    }

    this._resetState();
    this.direction = "outgoing";
    this.call = {
      id: null,
      peerExtension: String(contact.extension),
      peerName: contact.username || contact.name || contact.extension || `Ext ${contact.extension}`,
      peerUserId: contact.id || null,
    };
    this.state = VIDEO_CALL_STATES.CALLING;
    this._notify();

    try {
      const res = await fetch(`${CONFIG.API_URL}/protected/call/initiate?method=webrtc`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ target_extension: this.call.peerExtension, media: "video" }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (err) {
        /* ignore parse errors */
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to start the call");
      }

      this.call.id = data.call_id || data.channel || this.call.id;
      // Remaining transition (CALLING -> RINGING) happens on webrtc_call_initiated.
    } catch (err) {
      this._failCall(err.message || "Failed to start the call");
      throw err;
    }
  }

  // Cancel an outgoing call while it is still ringing/calling.
  async cancelCall(reason = "cancelled") {
    if (this.direction !== "outgoing" || !this.call) {
      this._cleanupCall();
      this.state = VIDEO_CALL_STATES.ENDED;
      this._notify();
      this._autoReturnToIdle();
      return;
    }
    this._clearRingTimeout();
    const { id } = this.call;
    if (id) {
      this._send(
        { type: "webrtc_call_cancelled", call_id: id, channel: id, to: this.call.peerExtension, from: this._myExtension() },
        true
      );
      this._callBackendHangup(id, true);
    }
    this._cleanupCall();
    this.state = VIDEO_CALL_STATES.ENDED;
    this.call = { ...this.call, endReason: reason };
    this._notify();
    this._autoReturnToIdle();
  }

  // ------------------------------------------------------------------
  // Incoming call controls
  // ------------------------------------------------------------------

  async acceptCall() {
    if (this.direction !== "incoming" || !this.call) return;
    this._clearRingTimeout();

    try {
      this.state = VIDEO_CALL_STATES.CONNECTING;
      this._notify();

      await this._ensureLocalMedia();

      await this._send({
        type: "webrtc_call_accepted",
        call_id: this.call.id,
        channel: this.call.id,
        to: this.call.peerExtension,
        from: this._myExtension(),
      });
    } catch (err) {
      console.error("[videoCallService] Accept failed:", err);
      this._failCall("Could not access camera/microphone");
    }
  }

  async rejectCall() {
    if (this.direction !== "incoming" || !this.call) return;
    this._clearRingTimeout();
    const { id } = this.call;
    if (id) {
      this._send(
        { type: "webrtc_call_rejected", call_id: id, channel: id, to: this.call.peerExtension, from: this._myExtension() },
        true
      );
      this._callBackendHangup(id, true);
    }
    this._cleanupCall();
    this.call = null;
    this.direction = null;
    this.state = VIDEO_CALL_STATES.IDLE;
    this._notify();
  }

  // ------------------------------------------------------------------
  // Hang up an active call
  // ------------------------------------------------------------------

  async endCall() {
    if (!this.call) {
      this._cleanupCall();
      this.state = VIDEO_CALL_STATES.IDLE;
      this._notify();
      return;
    }
    this._clearRingTimeout();
    const { id } = this.call;
    if (id) {
      this._send(
        { type: "webrtc_call_ended", call_id: id, channel: id, to: this.call.peerExtension, from: this._myExtension() },
        true
      );
      this._callBackendHangup(id, true);
    }
    this._cleanupCall();
    this.state = VIDEO_CALL_STATES.ENDED;
    this.call = { ...this.call, endReason: "local-ended" };
    this._notify();
    this._autoReturnToIdle();
  }

  // ------------------------------------------------------------------
  // Media / device controls
  // ------------------------------------------------------------------

  setMuted(muted) {
    this.isMuted = muted;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    this._notify();
  }

  toggleMute() {
    this.setMuted(!this.isMuted);
  }

  setVideoEnabled(enabled) {
    this.isVideoOn = enabled;
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }
    this._notify();
  }

  toggleVideo() {
    this.setVideoEnabled(!this.isVideoOn);
  }

  async switchCamera() {
    if (!this.localStream) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");
      if (cameras.length < 2) return;
      const current = this.localStream.getVideoTracks()[0]?.getSettings().deviceId;
      const idx = cameras.findIndex((c) => c.deviceId === current);
      const next = cameras[(idx + 1) % cameras.length];
      if (!next) return;
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: next.deviceId } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = this.pc?.getSenders().find((s) => s.track?.kind === "video");
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack);
      }
      this.localStream.getVideoTracks().forEach((t) => t.stop());
      this.localStream.removeTrack(this.localStream.getVideoTracks()[0]);
      this.localStream.addTrack(newTrack);
      this._notify();
    } catch (err) {
      console.error("[videoCallService] Failed to switch camera:", err);
    }
  }

  getConnectionQuality() {
    if (!this.pc) return "unknown";
    switch (this.pc.iceConnectionState) {
      case "connected":
      case "completed":
        return "good";
      case "checking":
        return "checking";
      case "disconnected":
        return "poor";
      case "failed":
        return "failed";
      default:
        return "unknown";
    }
  }

  // ------------------------------------------------------------------
  // Peer connection / offer-answer / ICE
  // ------------------------------------------------------------------

  async _callerCreateOffer() {
    await this._ensureLocalMedia();
    await this._createPeerConnection();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._send({
      type: "webrtc_offer",
      offer,
      channel: this.call.id,
      to: this.call.peerExtension,
      from: this._myExtension(),
    });
  }

  async _handleOffer(msg) {
    if (this.direction !== "incoming" || !this.call) return;
    if (msg.channel && this.call.id && msg.channel !== this.call.id) return;
    try {
      await this._ensureLocalMedia();
      await this._createPeerConnection();

      const offer = typeof msg.offer === "string" ? JSON.parse(msg.offer) : msg.offer;
      if (!offer || !offer.type || !offer.sdp) {
        throw new Error("Invalid offer");
      }
      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      this.offerAnswerDone = true;
      await this._flushIceBuffer();

      await this._send({
        type: "webrtc_answer",
        answer,
        channel: this.call.id,
        to: msg.from || this.call.peerExtension,
        from: this._myExtension(),
      });
    } catch (err) {
      console.error("[videoCallService] Failed to handle offer:", err);
      this._failCall("Failed to establish the call");
    }
  }

  async _handleAnswer(msg) {
    if (!this.pc) return;
    try {
      const answer = typeof msg.answer === "string" ? JSON.parse(msg.answer) : msg.answer;
      if (!answer || !answer.type || !answer.sdp) return;
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      this.offerAnswerDone = true;
      await this._flushIceBuffer();
    } catch (err) {
      console.error("[videoCallService] Failed to handle answer:", err);
    }
  }

  async _handleIceCandidate(msg) {
    if (!msg.candidate) return;
    const candidate = typeof msg.candidate === "string" ? JSON.parse(msg.candidate) : msg.candidate;
    if (!this.pc || !this.offerAnswerDone) {
      this.iceBuffer.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error("[videoCallService] Failed to add ICE candidate:", err);
      this.iceBuffer.push(candidate);
    }
  }

  async _flushIceBuffer() {
    const buffered = this.iceBuffer.splice(0, this.iceBuffer.length);
    for (const candidate of buffered) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("[videoCallService] Failed to add buffered ICE candidate:", err);
      }
    }
  }

  async _createPeerConnection() {
    if (this.pc) return this.pc;

    const Ctor = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
    if (!Ctor) throw new Error("WebRTC is not supported in this browser");

    this.pc = new Ctor({
      iceServers: ICE_SERVERS,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      iceCandidatePoolSize: 10,
    });

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => this.pc.addTrack(track, this.localStream));
    }

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.call && this.call.id) {
        this._send(
          {
            type: "webrtc_ice_candidate",
            candidate: event.candidate,
            channel: this.call.id,
            to: this.call.peerExtension,
            from: this._myExtension(),
          },
          true
        );
      }
    };

    this.pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this._markConnected();
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === "connected") {
        this._markConnected();
      } else if (state === "failed" || state === "closed") {
        console.warn("[videoCallService] Connection failed:", state);
        this._failCall("Connection lost");
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      this._notify();
    };

    return this.pc;
  }

  _markConnected() {
    if (this.state === VIDEO_CALL_STATES.CONNECTED) return;
    this.state = VIDEO_CALL_STATES.CONNECTED;
    this.connectedSince = Date.now();
    this._notify();
  }

  async _ensureLocalMedia() {
    if (this.localStream && this.localStream.active) return this.localStream;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: "user",
      },
    });
    return this.localStream;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  _myExtension() {
    return localStorage.getItem("extension");
  }

  async _send(message, swallowErrors = false) {
    try {
      await sendWebSocketMessage(message);
    } catch (err) {
      if (!swallowErrors) throw err;
      console.warn("[videoCallService] Failed to send message:", err);
    }
  }

  async _callBackendHangup(channel, swallowErrors = true) {
    if (!channel) return;
    try {
      await fetch(`${CONFIG.API_URL}/protected/call/hangup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ channel }),
      });
    } catch (err) {
      if (!swallowErrors) console.warn("[videoCallService] Hangup API error:", err);
    }
  }

  _startRingTimeout(handler) {
    this._clearRingTimeout();
    this.ringTimeoutId = setTimeout(handler, RING_TIMEOUT_MS);
  }

  _clearRingTimeout() {
    if (this.ringTimeoutId) {
      clearTimeout(this.ringTimeoutId);
      this.ringTimeoutId = null;
    }
  }

  _failCall(message) {
    this._clearRingTimeout();
    this._cleanupCall();
    this.state = VIDEO_CALL_STATES.ENDED;
    this.call = this.call ? { ...this.call, endReason: "error", errorMessage: message } : null;
    this._notify();
    this._autoReturnToIdle();
  }

  _autoReturnToIdle() {
    if (this._retryTimeoutId) clearTimeout(this._retryTimeoutId);
    this._retryTimeoutId = setTimeout(() => {
      if (this.state === VIDEO_CALL_STATES.ENDED) {
        this.state = VIDEO_CALL_STATES.IDLE;
        this.call = null;
        this.direction = null;
        this._notify();
      }
    }, 1500);
  }

  _cleanupCall() {
    this._clearRingTimeout();
    if (this.pc) {
      try {
        this.pc.close();
      } catch (err) {
        /* ignore */
      }
      this.pc = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }
    this.remoteStream = null;
    this.iceBuffer = [];
    this.offerAnswerDone = false;
    this.connectedSince = null;
  }

  _resetState() {
    this._cleanupCall();
    this.call = null;
    this.direction = null;
    this.state = VIDEO_CALL_STATES.IDLE;
    this.isMuted = false;
    this.isVideoOn = true;
  }
}

// Export singleton
const videoCallService = new VideoCallService();
export default videoCallService;
