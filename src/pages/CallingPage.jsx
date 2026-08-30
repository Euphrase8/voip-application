import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiPhoneOff as PhoneOff,
  FiMic as Mic,
  FiMicOff as MicOff,
  FiVolume2 as Volume,
  FiVolumeX as VolumeOff,
  FiClock as Clock,
  FiPause as Pause,
  FiPlay as Play
} from 'react-icons/fi';
import PropTypes from 'prop-types';
import webrtcCallService from '../services/webrtcCallService';
import { hangupCall as comprehensiveHangup } from '../services/hangupService';
import audioManager from '../services/audioManager';
import { cn, getInitials } from '../utils/ui';
import { buildNotificationClass } from '../utils/styling';

const CallingPage = ({
  darkMode = false,
  contact: propContact,
  callStatus: propCallStatus,
  isOutgoing: propIsOutgoing,
  channel: propChannel,
  transport: propTransport,
  onEndCall,
  callAccepted: propCallAccepted,
  isWebRTCCall: propIsWebRTCCall,
  callId: propCallId
}) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Use props as fallback if navigation state is not available
  const navigationState = location.state || {};
  const contact = navigationState.contact || propContact;
  const initialCallStatus = navigationState.callStatus || propCallStatus || 'Connecting...';
  const isOutgoing = navigationState.isOutgoing !== undefined ? navigationState.isOutgoing : (propIsOutgoing !== undefined ? propIsOutgoing : true);
  const initialChannel = navigationState.channel || propChannel;
  // const transport = navigationState.transport || propTransport; // Currently unused
  const callAccepted = navigationState.callAccepted !== undefined ? navigationState.callAccepted : (propCallAccepted !== undefined ? propCallAccepted : false);
  const isWebRTCCall = navigationState.isWebRTCCall !== undefined ? navigationState.isWebRTCCall : (propIsWebRTCCall !== undefined ? propIsWebRTCCall : false);
  const callId = navigationState.callId || propCallId;

  const [callTime, setCallTime] = useState(0);
  const [currentCallStatus, setCurrentCallStatus] = useState(initialCallStatus || 'Connecting...');
  const [isConnected, setIsConnected] = useState(initialCallStatus === 'Connected');
  const [notification, setNotification] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isOnHold, setIsOnHold] = useState(false);
  // const [wsConnected, setWsConnected] = useState(false); // Currently unused
  const [channel] = useState(initialChannel); // setChannel removed as unused
  const callStartTimeRef = useRef(null);
  // const animationFrameRef = useRef(null); // Currently unused
  // const wsRef = useRef(null); // Currently unused
  const hangupInProgressRef = useRef(false);

  // Format time helper
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle call end
  const handleEndCall = async () => {
    if (hangupInProgressRef.current) return;
    hangupInProgressRef.current = true;

    try {
      setCurrentCallStatus('Ending call...');
      setNotification({ message: 'Ending call...', type: 'info' });

      // Use comprehensive hangup service for all call types
      if (channel) {
        console.log('[CallingPage] Ending call with comprehensive hangup service');
        const hangupResult = await comprehensiveHangup(channel);

        if (hangupResult.success) {
          console.log('[CallingPage] Hangup successful:', hangupResult);
        } else {
          console.warn('[CallingPage] Hangup failed:', hangupResult);
          // Still continue with cleanup
        }
      } else {
        // No channel available, try WebRTC service directly
        console.log('[CallingPage] No channel available, trying WebRTC service');
        webrtcCallService.endCall();
      }

      setNotification({ message: 'Call ended successfully', type: 'success' });

      // Wait a moment to show the success message
      setTimeout(() => {
        if (onEndCall) {
          onEndCall();
        } else {
          navigate(-1);
        }
      }, 1000);

    } catch (error) {
      console.error('[CallingPage] Error ending call:', error);
      setNotification({
        message: `Failed to end call: ${error.message || 'Unknown error'}`,
        type: 'error'
      });

      // Still navigate away after showing error
      setTimeout(() => {
        if (onEndCall) {
          onEndCall();
        } else {
          navigate(-1);
        }
      }, 2000);
    } finally {
      hangupInProgressRef.current = false;
    }
  };

  // Handle mute toggle
  const handleMuteToggle = () => {
    try {
      const microphoneEnabled = audioManager.toggleMute();
      setIsMuted(!microphoneEnabled); // isMuted is opposite of microphoneEnabled
      setNotification({
        message: microphoneEnabled ? 'Microphone enabled' : 'Microphone muted',
        type: 'info'
      });
      setTimeout(() => setNotification(null), 2000);
    } catch (error) {
      console.error('[CallingPage] Failed to toggle mute:', error);
      setNotification({ message: 'Failed to toggle microphone', type: 'error' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Handle speaker toggle (volume control)
  const handleSpeakerToggle = () => {
    try {
      const currentVolume = audioManager.getVolume();
      const newVolume = currentVolume > 0 ? 0 : 0.8; // Toggle between 0 and 80%
      audioManager.setVolume(newVolume);
      setIsSpeakerOn(newVolume > 0);
      setNotification({
        message: newVolume > 0 ? 'Speaker enabled' : 'Speaker muted',
        type: 'info'
      });
      setTimeout(() => setNotification(null), 2000);
    } catch (error) {
      console.error('[CallingPage] Failed to toggle speaker:', error);
      setNotification({ message: 'Failed to toggle speaker', type: 'error' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Handle hold toggle
  const handleHoldToggle = () => {
    try {
      const newHoldState = !isOnHold;
      setIsOnHold(newHoldState);

      if (newHoldState) {
        webrtcCallService.setMute(true);
        setCurrentCallStatus('On Hold');
      } else {
        webrtcCallService.setMute(false);
        setCurrentCallStatus('Connected');
      }

      setNotification({
        message: newHoldState ? 'Call on hold' : 'Call resumed',
        type: 'info'
      });
      setTimeout(() => setNotification(null), 2000);
    } catch (error) {
      console.error('[CallingPage] Failed to toggle hold:', error);
      setNotification({ message: 'Failed to toggle hold', type: 'error' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // Update call timer
  useEffect(() => {
    let interval;
    if (isConnected && callStartTimeRef.current) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTimeRef.current) / 1000);
        setCallTime(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected]);

  // Set call start time when connected
  useEffect(() => {
    if (currentCallStatus === 'Connected' && !callStartTimeRef.current) {
      callStartTimeRef.current = Date.now();
      setIsConnected(true);
    }
  }, [currentCallStatus]);

  // Sync connected state from the parent when the WebRTC service reports it
  useEffect(() => {
    if (propCallStatus === 'Connected' && currentCallStatus !== 'Connected') {
      setCurrentCallStatus('Connected');
    } else if (propCallStatus && propCallStatus !== currentCallStatus && !isConnected) {
      // Surface real-time status updates (Connecting, ICE, quality, errors) from
      // the WebRTC service instead of hiding them behind a frozen placeholder.
      setCurrentCallStatus(propCallStatus);
    }
  }, [propCallStatus, currentCallStatus, isConnected]);

  // Sync UI state with audio manager state
  useEffect(() => {
    if (isConnected) {
      // Sync mute state
      const micMuted = audioManager.isMuted();
      setIsMuted(micMuted);

      // Sync volume state
      const currentVolume = audioManager.getVolume();
      setIsSpeakerOn(currentVolume > 0);
    }
  }, [isConnected]);

  // Handle call initialization and communication setup
  useEffect(() => {
    if (callAccepted && !isOutgoing) {
      // This is an accepted incoming call, initialize communication
      console.log('[CallingPage] Initializing communication for accepted call');

      if (isWebRTCCall) {
        // For WebRTC calls, set up connection monitoring
        setCurrentCallStatus('Establishing WebRTC Connection...');

        // Monitor WebRTC call service for connection status
        const checkWebRTCConnection = () => {
          // Check if WebRTC service has established connection
          if (webrtcCallService.isConnected && webrtcCallService.isConnected()) {
            setCurrentCallStatus('Connected');
            setIsConnected(true);
            callStartTimeRef.current = Date.now();
          } else {
            // Keep checking for connection
            setTimeout(checkWebRTCConnection, 500);
          }
        };

        // Start monitoring after a brief delay
        setTimeout(checkWebRTCConnection, 1000);

      } else {
        // For SIP calls, simulate connection establishment
        setCurrentCallStatus('Establishing Connection...');

        setTimeout(() => {
          setCurrentCallStatus('Connected');
          setIsConnected(true);
          callStartTimeRef.current = Date.now();
        }, 2000);
      }
    } else if (isOutgoing) {
      // This is an outgoing call, handle differently
      console.log('[CallingPage] Handling outgoing call');

      // For outgoing calls, wait for actual connection confirmation
      if (initialCallStatus === 'Connected') {
        // Don't immediately show as connected for outgoing calls
        setCurrentCallStatus('Connecting...');
        setIsConnected(false);
      }
    }
  }, [callAccepted, isOutgoing, isWebRTCCall, callId, initialCallStatus]);

  const controlLabelClass = darkMode ? 'text-secondary-300' : 'text-secondary-600';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-6 left-1/2 -translate-x-1/2 z-[71] w-full max-w-xs px-4"
        >
          <div className={buildNotificationClass(
            notification.type === 'success' ? 'success' :
            notification.type === 'error' ? 'danger' :
            notification.type === 'warning' ? 'warning' : 'info'
          )}>
            <div className="flex items-center space-x-2">
              <div className={cn(
                'w-2 h-2 rounded-full animate-pulse',
                notification.type === 'success' ? 'bg-success-600' :
                notification.type === 'error' ? 'bg-danger-600' :
                notification.type === 'warning' ? 'bg-warning-600' : 'bg-primary-600'
              )}></div>
              <span className="font-medium">{notification.message}</span>
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 260 }}
        className={cn(
          "w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border",
          darkMode ? "bg-secondary-900 border-secondary-700" : "bg-white border-gray-200"
        )}
      >
        {/* Accent bar */}
        <div className={cn("h-1.5", isConnected ? "bg-green-500" : "bg-indigo-500")} />

        <div className="p-6 sm:p-8">
          {/* Contact info */}
          <div className="flex flex-col items-center mb-7">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
              className="relative mb-4"
            >
              {!isConnected && (
                <div className="absolute -inset-2 rounded-full border-2 border-indigo-400/50 animate-ping" />
              )}
              <div className={cn(
                "w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg",
                isConnected ? "bg-green-500" : "bg-indigo-500"
              )}>
                {contact?.avatar ? (
                  <img
                    src={contact.avatar}
                    alt={contact.name || 'Contact'}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials(contact?.name || contact?.extension || 'U')
                )}
              </div>
            </motion.div>

            <h2 className={cn("text-xl sm:text-2xl font-bold mb-1 text-center", darkMode ? "text-white" : "text-gray-900")}>
              {contact?.name || `Extension ${contact?.extension}` || 'Unknown'}
            </h2>
            <p className={cn("text-sm font-medium mb-3", darkMode ? "text-secondary-400" : "text-secondary-500")}>
              {isOutgoing ? 'Outgoing Call' : 'Incoming Call'}
            </p>

            <div className={cn(
              "inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium",
              darkMode ? "bg-secondary-800 text-secondary-200" : "bg-gray-100 text-secondary-600"
            )}>
              <Clock className="w-4 h-4" />
              <span>{isConnected ? formatTime(callTime) : currentCallStatus}</span>
            </div>
          </div>

          {/* Call controls */}
          <div className="flex items-center justify-center gap-4 sm:gap-5 mb-7">
            {/* Mute */}
            <button
              onClick={handleMuteToggle}
              className="flex flex-col items-center gap-1.5"
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              <span className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
                isMuted
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : darkMode
                    ? "bg-secondary-800 hover:bg-secondary-700 text-secondary-300"
                    : "bg-gray-100 hover:bg-gray-200 text-secondary-600"
              )}>
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </span>
              <span className={cn("text-[11px]", controlLabelClass)}>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>

            {/* Hold */}
            <button
              onClick={handleHoldToggle}
              className="flex flex-col items-center gap-1.5"
              aria-label={isOnHold ? 'Resume call' : 'Hold call'}
            >
              <span className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
                isOnHold
                  ? "bg-yellow-500 hover:bg-yellow-600 text-white"
                  : darkMode
                    ? "bg-secondary-800 hover:bg-secondary-700 text-secondary-300"
                    : "bg-gray-100 hover:bg-gray-200 text-secondary-600"
              )}>
                {isOnHold ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              </span>
              <span className={cn("text-[11px]", controlLabelClass)}>{isOnHold ? 'Resume' : 'Hold'}</span>
            </button>

            {/* Speaker */}
            <button
              onClick={handleSpeakerToggle}
              className="flex flex-col items-center gap-1.5"
              aria-label={isSpeakerOn ? 'Turn off speaker' : 'Turn on speaker'}
            >
              <span className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
                !isSpeakerOn
                  ? "bg-amber-500 hover:bg-amber-600 text-white"
                  : darkMode
                    ? "bg-secondary-800 hover:bg-secondary-700 text-secondary-300"
                    : "bg-gray-100 hover:bg-gray-200 text-secondary-600"
              )}>
                {isSpeakerOn ? <Volume className="w-5 h-5" /> : <VolumeOff className="w-5 h-5" />}
              </span>
              <span className={cn("text-[11px]", controlLabelClass)}>{isSpeakerOn ? 'Speaker' : 'Muted'}</span>
            </button>
          </div>

          {/* End call */}
          <button
            onClick={handleEndCall}
            disabled={hangupInProgressRef.current}
            className={cn(
              "w-full py-3.5 rounded-2xl font-semibold text-white flex items-center justify-center gap-2 shadow-lg shadow-red-500/30 transition-colors",
              "bg-red-500 hover:bg-red-600",
              hangupInProgressRef.current && "opacity-75 cursor-not-allowed"
            )}
            aria-label="End the current call"
          >
            <PhoneOff className="w-5 h-5" />
            <span>{hangupInProgressRef.current ? 'Ending Call...' : 'End Call'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};

CallingPage.propTypes = {
  darkMode: PropTypes.bool,
  contact: PropTypes.object,
  callStatus: PropTypes.string,
  isOutgoing: PropTypes.bool,
  channel: PropTypes.string,
  transport: PropTypes.string,
  onEndCall: PropTypes.func,
  callAccepted: PropTypes.bool,
  isWebRTCCall: PropTypes.bool,
  callId: PropTypes.string
};

export default CallingPage;
