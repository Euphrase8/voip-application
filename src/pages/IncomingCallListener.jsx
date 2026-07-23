import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiPhone as Phone,
  FiPhoneOff as PhoneOff,
} from 'react-icons/fi';
import { connectWebSocket, sendWebSocketMessage, addMessageListener } from '../services/websocketservice';
import { answerCall } from '../services/call';
import webrtcCallService from '../services/webrtcCallService';
import { hangupCall as comprehensiveHangup } from '../services/hangupService';
import { getInitials } from '../utils/ui';

const IncomingCallListener = ({ user, onCallAccepted, onCallRejected }) => {
  const [callInfo, setCallInfo] = useState(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [error, setError] = useState(null);
  const ringtoneRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    connectWebSocket();

    const handleMessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'incoming_call') {
          setCallInfo({
            caller: message.caller,
            channel: message.channel,
            priority: message.priority || 'normal',
            transport: message.transport || 'transport-ws',
          });
        } else if (message.type === 'call_ended' || message.type === 'hangup') {
          setCallInfo(null);
        }
      } catch (err) {
        console.error('Invalid message format:', event.data);
      }
    };

    const removeListener = addMessageListener(handleMessage);
    return removeListener;
  }, []);

  // Start ringtone when call comes in
  useEffect(() => {
    if (callInfo && !ringtoneRef.current) {
      try {
        ringtoneRef.current = new Audio('/sounds/ringtone.mp3');
        ringtoneRef.current.loop = true;
        ringtoneRef.current.volume = 0.7;
        ringtoneRef.current.play().catch(e => console.warn('Ringtone play failed:', e));
      } catch (error) {
        console.warn('Failed to play ringtone:', error);
      }

      // Auto-reject after 30 seconds
      timeoutRef.current = setTimeout(() => {
        handleReject();
      }, 30000);
    }

    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause();
        ringtoneRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [callInfo]);

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      ringtoneRef.current.pause();
      ringtoneRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const handleAnswer = async () => {
    if (isAnswering || !callInfo) return;

    setIsAnswering(true);
    setError(null);
    stopRingtone();

    try {
      console.log('[IncomingCallListener] Answering call:', callInfo);

      // Check if this is a WebRTC call
      const isWebRTCCall = callInfo.channel && (
        callInfo.channel.startsWith('webrtc-call-') ||
        callInfo.channel.includes('webrtc')
      );

      if (isWebRTCCall) {
        // Handle WebRTC call
        console.log('[IncomingCallListener] Answering WebRTC call');
        webrtcCallService.answerCall();
      } else {
        // Handle SIP call
        console.log('[IncomingCallListener] Answering SIP call');
        const { stream } = await answerCall(callInfo.channel);

        await sendWebSocketMessage({
          type: 'answer_call',
          channel: callInfo.channel,
          extension: callInfo.caller,
          transport: callInfo.transport,
        });

        // Dispatch event for DashboardPage to handle
      window.dispatchEvent(new CustomEvent('incomingCallAccepted', {
        detail: {
          contact: { extension: callInfo.caller, name: `Ext ${callInfo.caller}` },
          callStatus: 'Connected',
          isOutgoing: false,
          channel: callInfo.channel,
          transport: callInfo.transport,
          isWebRTCCall: isWebRTCCall,
          callId: callInfo.channel
        }
      }));

      setCallInfo(null);

      if (onCallAccepted) {
        onCallAccepted(callInfo);
      }

    } catch (error) {
      console.error('[IncomingCallListener] Failed to answer call:', error);
      setError(`Failed to answer call: ${error.message}`);
      setCallInfo(null);
    } finally {
      setIsAnswering(false);
    }
  };

  const handleReject = async () => {
    if (isRejecting || !callInfo) return;

    setIsRejecting(true);
    setError(null);
    stopRingtone();

    try {
      console.log('[IncomingCallListener] Rejecting call:', callInfo);

      // Check if this is a WebRTC call
      const isWebRTCCall = callInfo.channel && (
        callInfo.channel.startsWith('webrtc-call-') ||
        callInfo.channel.includes('webrtc')
      );

      if (isWebRTCCall) {
        // Handle WebRTC call rejection
        console.log('[IncomingCallListener] Rejecting WebRTC call');
        webrtcCallService.rejectCall();
      } else {
        // Handle SIP call rejection
        console.log('[IncomingCallListener] Rejecting SIP call');
        await sendWebSocketMessage({
          type: 'hangup_call',
          channel: callInfo.channel,
        });

        // Also try comprehensive hangup
        try {
          await comprehensiveHangup(callInfo.channel);
        } catch (hangupError) {
          console.warn('[IncomingCallListener] Comprehensive hangup failed:', hangupError);
        }
      }

      // Notify other components
      window.dispatchEvent(new CustomEvent('incomingCallRejected', {
        detail: { channel: callInfo.channel }
      }));

      if (onCallRejected) {
        onCallRejected(callInfo);
      }

      setCallInfo(null);

    } catch (error) {
      console.error('[IncomingCallListener] Failed to reject call:', error);
      setError(`Failed to reject call: ${error.message}`);
    } finally {
      setIsRejecting(false);
    }
  };

  if (!callInfo) {
    return null; // Don't show anything when no incoming call
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border-2 border-indigo-100"
      >
        {/* Header */}
        <div className="bg-indigo-500 px-6 py-4 relative">
          {/* Decorative elements */}
          <div className="absolute top-2 right-4 w-2 h-2 bg-indigo-300 rounded-full opacity-60"></div>
          <div className="absolute bottom-2 right-8 w-1 h-1 bg-indigo-300 rounded-full opacity-40"></div>

          <div className="flex items-center space-x-3">
            <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-lg"></div>
            <h3 className="text-white font-bold text-lg">Incoming Call</h3>
          </div>
        </div>

        {/* Caller Info */}
        <div className="p-6 text-center bg-slate-50">
          {/* Avatar */}
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mx-auto bg-indigo-500 border-4 border-indigo-400 shadow-lg">
              <span className="text-2xl font-bold text-white">
                {getInitials(callInfo.caller || 'Unknown')}
              </span>
            </div>
          </div>

          {/* Caller Name */}
          <h2 className="text-xl font-bold text-slate-800 mb-2">
            {callInfo.caller || 'Unknown Caller'}
          </h2>

          {/* Call Details */}
          <div className="space-y-2 mb-6">
            <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-slate-600 text-sm font-medium">
                Extension: <span className="text-indigo-600 font-semibold">{callInfo.caller}</span>
              </p>
            </div>
            <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <p className="text-slate-600 text-xs">
                Channel: <span className="text-slate-800 font-medium">{callInfo.channel}</span>
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-4">
            {/* Reject Button */}
            <button
              onClick={handleReject}
              disabled={isAnswering || isRejecting}
              className={`flex-1 py-3 px-4 rounded-2xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg border-2 ${
                isRejecting
                  ? 'bg-gray-400 border-gray-300 cursor-not-allowed'
                  : 'bg-red-500 hover:bg-red-600 text-white border-red-400 hover:border-red-500 hover:scale-105'
              }`}
            >
              {isRejecting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Declining...</span>
                </>
              ) : (
                <>
                  <PhoneOff className="w-5 h-5" />
                  <span>Decline</span>
                </>
              )}
            </button>

            {/* Answer Button */}
            <button
              onClick={handleAnswer}
              disabled={isAnswering || isRejecting}
              className={`flex-1 py-3 px-4 rounded-2xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg border-2 ${
                isAnswering
                  ? 'bg-gray-400 border-gray-300 cursor-not-allowed'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-400 hover:border-emerald-500 hover:scale-105'
              }`}
            >
              {isAnswering ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Answering...</span>
                </>
              ) : (
                <>
                  <Phone className="w-5 h-5" />
                  <span>Answer</span>
                </>
              )}
            </button>
          </div>

          {/* Call Type Indicator */}
          <div className="mt-4 text-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {callInfo.channel && (callInfo.channel.startsWith('webrtc-call-') || callInfo.channel.includes('webrtc'))
                ? '🌐 WebRTC Call'
                : '📞 SIP Call'
              }
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default IncomingCallListener;