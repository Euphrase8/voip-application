import axios from 'axios';
import { sendWebSocketMessage } from './websocketservice';
import { getToken } from './login';
import CONFIG from './config';
import sipManager from './sipManager';
import webrtcCallService from './webrtcCallService';

const API_URL = CONFIG.API_URL;
const MEDIA_CONSTRAINTS = CONFIG.MEDIA_CONSTRAINTS;

export const toAppChannelFormat = (apiChannel) => {
  const ext = apiChannel?.replace(/^PJSIP\//, '');
  return `${ext}@${CONFIG.SIP_SERVER}:${CONFIG.SIP_PORT}`;
};

export const toApiChannelFormat = (appChannel) => {
  const [ext] = appChannel?.split('@') || [];
  return `PJSIP/${ext}`;
};

const getAuthHeaders = () => {
  const token = getToken();
  if (!token) throw new Error('Authentication token is missing.');
  return { Authorization: `Bearer ${token}` };
};

export const getAppMediaStream = async () => {
  try {
    console.log('[call.js] Requesting media stream...');

    // Try multiple methods for getUserMedia
    let stream = null;

    // Method 1: Modern getUserMedia
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      } catch (modernError) {
        console.warn('[call.js] Modern getUserMedia failed:', modernError);

        // Try basic constraints
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch (basicError) {
          console.warn('[call.js] Basic getUserMedia failed:', basicError);
        }
      }
    }

    // Method 2: Legacy getUserMedia fallback
    if (!stream) {
      const getUserMedia = navigator.getUserMedia ||
                         navigator.webkitGetUserMedia ||
                         navigator.mozGetUserMedia ||
                         navigator.msGetUserMedia;

      if (getUserMedia) {
        console.log('[call.js] Trying legacy getUserMedia...');
        stream = await new Promise((resolve, reject) => {
          getUserMedia.call(navigator, MEDIA_CONSTRAINTS, resolve, reject);
        });
      }
    }

    if (!stream) {
      const isHTTP = window.location.protocol === 'http:' &&
                    window.location.hostname !== 'localhost' &&
                    window.location.hostname !== '127.0.0.1';

      if (isHTTP) {
        throw new Error("Microphone access not available. For HTTP sites, please:\n1. Enable microphone in browser settings\n2. Use HTTPS for better compatibility\n3. Try Chrome with --unsafely-treat-insecure-origin-as-secure flag");
      } else {
        throw new Error("getUserMedia is not supported in this browser.");
      }
    }

    console.log('[call.js] Media stream obtained successfully');
    return stream;
  } catch (err) {
    console.error('[call.js] Failed to access microphone:', err);
    throw err;
  }
};

export const call = async (extension) => {
  console.log(`[call.js] Initiating call to extension: ${extension}`);

  // Validate extension parameter
  if (!extension) {
    console.error('[call.js] ERROR: Extension is null or undefined');
    throw new Error('Extension is required');
  }

  if (typeof extension !== 'string' && typeof extension !== 'number') {
    console.error('[call.js] ERROR: Extension must be a string or number, got:', typeof extension);
    throw new Error(`Extension must be a string or number, got ${typeof extension}`);
  }

  const extensionStr = String(extension);
  if (!/^\d{3,6}$/.test(extensionStr)) {
    console.error(`[call.js] ERROR: Invalid extension format: "${extensionStr}"`);
    throw new Error(`Invalid extension "${extensionStr}". Must be 3-6 digits.`);
  }

  // Debug: Check WebRTC service state
  console.log('[call.js] DEBUG: WebRTC service state:', {
    available: !!webrtcCallService,
    extension: webrtcCallService?.extension,
    currentCall: webrtcCallService?.currentCall,
    connected: webrtcCallService?.connected
  });

  try {
    console.log('[call.js] Step 1: Notifying backend about call initiation');
    console.log('[call.js] DEBUG: API URL:', API_URL);
    console.log('[call.js] DEBUG: Auth headers:', getAuthHeaders());

    // Ensure WebRTC signaling WebSocket is connected BEFORE initiating.
    // Otherwise callee acceptance cannot be delivered back to caller.
    if (!webrtcCallService?.connected) {
      console.log('[call.js] Waiting for WebRTC signaling WebSocket to connect...');
      await webrtcCallService.ensureConnected(7000);
      console.log('[call.js] WebRTC signaling WebSocket is connected');
    }

    // First, notify backend about call initiation using WebRTC method
    const { data } = await axios.post(
      `${API_URL}/protected/call/initiate?method=webrtc`,
      { target_extension: extensionStr },
      { headers: getAuthHeaders() }
    );

    console.log('[call.js] Step 2: Backend call initiation successful:', data);

    // Check if this is a WebRTC call (no need for SIP manager)
    if (data.method === 'webrtc') {
      console.log('[call.js] Step 3: WebRTC call initiated, waiting for target response');

      // Set up the outgoing call in WebRTC service
      if (webrtcCallService) {
        // Ensure media is set up before call
        try {
          await webrtcCallService.setupLocalMedia();
          console.log('[call.js] Media setup complete for outgoing call');
        } catch (error) {
          console.error('[call.js] Media setup failed:', error);
          throw new Error(`Media setup failed: ${error.message}`);
        }

        webrtcCallService.currentCall = {
          id: data.call_id,
          target: extensionStr,
          caller: webrtcCallService.extension,
          type: 'outgoing'
        };
        console.log('[call.js] Step 4: WebRTC service prepared for outgoing call');
        console.log('[call.js] WebRTC service extension:', webrtcCallService.extension);
        console.log('[call.js] Current call set:', webrtcCallService.currentCall);
      } else {
        console.error('[call.js] WebRTC service not available!');
        throw new Error('WebRTC service not available');
      }

      return {
        apiChannel: data.channel,
        appChannel: data.call_id,
        message: data.message,
        priority: data.priority,
        method: 'webrtc',
        call_id: data.call_id,
      };
    } else {
      console.log('[call.js] Step 3: Making SIP call through sipManager');

      // Use SIP manager to make the actual call (traditional method)
      const session = await sipManager.makeCall(extension);

      console.log('[call.js] Step 4: SIP call initiated successfully');

      return {
        apiChannel: data.channel,
        appChannel: toAppChannelFormat(data.channel),
        message: data.message,
        priority: data.priority,
        session: session,
      };
    }
  } catch (error) {
    console.error('[call.js] Call initiation failed:', error);

    // Provide more specific error messages
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.message;
      console.error(`[call.js] Backend error ${status}: ${message}`);
      throw new Error(`Call failed: ${message}`);
    } else if (error.message.includes('SIP not registered')) {
      throw new Error('SIP client not registered. Please refresh and try again.');
    } else {
      throw new Error(`Call failed: ${error.message}`);
    }
  }
};

export const answerCall = async (session) => {
  try {
    // Answer the call using SIP manager
    await sipManager.answerCall(session);

    // Notify backend about call answer
    const extension = session.remote_identity.uri.user;
    const apiChannel = `PJSIP/${extension}`;

    const { data } = await axios.post(
      `${API_URL}/protected/call/answer`,
      { channel: apiChannel },
      { headers: getAuthHeaders() }
    );

    return {
      apiChannel,
      message: data.message,
      session: session,
    };
  } catch (error) {
    console.error('[call.js] Answer call failed:', error);
    throw error;
  }
};

export const hangupCall = async (session = null) => {
  try {
    // End the call using SIP manager
    if (session) {
      session.terminate();
    } else {
      sipManager.endCall();
    }

    // Notify backend about call hangup
    const currentSession = session || sipManager.currentSession;
    if (currentSession) {
      const extension = currentSession.remote_identity.uri.user;
      const apiChannel = `PJSIP/${extension}`;

      try {
        await sendWebSocketMessage({ type: 'hangup', channel: apiChannel });
      } catch (wsError) {
        console.warn('[call.js] WebSocket hangup message failed:', wsError);
      }

      const { data } = await axios.post(
        `${API_URL}/protected/call/hangup`,
        { channel: apiChannel },
        { headers: getAuthHeaders() }
      );

      return { message: data.message };
    }

    return { message: 'Call ended' };
  } catch (error) {
    console.error('[call.js] Hangup call failed:', error);
    throw error;
  }
};

export const initializeSIP = async ({ extension }, onIncomingCall, useWebRTC = true) => {
  console.log(`[initializeSIP] Initializing SIP for extension: ${extension}, WebRTC mode: ${useWebRTC}`);

  // Initialize WebRTC service if using WebRTC mode
  if (useWebRTC) {
    console.log('[initializeSIP] Using WebRTC mode - initializing WebRTC service');

    try {
      // Initialize WebRTC service for both incoming and outgoing calls
      webrtcCallService.initialize(
        extension,
        onIncomingCall,
        (status) => {
          console.log(`[initializeSIP] WebRTC call status: ${status}`);
        },
        () => {
          console.log('[initializeSIP] WebRTC call ended');
        }
      );

      console.log('[initializeSIP] WebRTC service initialized successfully');
      return { success: true, method: 'webrtc', service: webrtcCallService };
    } catch (error) {
      console.error('[initializeSIP] WebRTC initialization failed:', error);
      throw new Error(`WebRTC initialization failed: ${error.message}`);
    }
  }

  try {
    const sipPassword = localStorage.getItem('sipPassword') || `password${extension}`;
    console.log(`[initializeSIP] Using SIP password: password${extension}`);

    // Initialize SIP manager and wait for registration
    console.log('[initializeSIP] Starting SIP initialization...');
    await sipManager.initialize(extension, sipPassword);
    console.log('[initializeSIP] SIP initialization completed successfully');

    // Set up event listeners
    sipManager.on('registered', () => {
      console.log(`[initializeSIP] SIP registered for extension: ${extension}`);
      localStorage.setItem(`sipRegistered_${extension}`, 'true');
    });

    sipManager.on('unregistered', () => {
      console.log(`[initializeSIP] SIP unregistered for extension: ${extension}`);
      localStorage.removeItem(`sipRegistered_${extension}`);
    });

    sipManager.on('incomingCall', (data) => {
      console.log(`[initializeSIP] Incoming call from: ${data.from}`);
      if (onIncomingCall) {
        onIncomingCall({
          from: data.from,
          session: data.session,
          message: `Incoming call from ${data.from}`
        });
      }
    });

    sipManager.on('registrationFailed', (cause) => {
      console.error(`[initializeSIP] Registration failed: ${cause}`);
      localStorage.removeItem(`sipRegistered_${extension}`);
    });

    // Mark as registered in localStorage since we waited for registration
    localStorage.setItem(`sipRegistered_${extension}`, 'true');

    return sipManager;
  } catch (error) {
    console.error('[initializeSIP] SIP initialization failed:', error);
    throw new Error(`SIP initialization failed: ${error.message}`);
  }
};