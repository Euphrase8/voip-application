import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiPhone as Phone,
  FiPhoneOff as PhoneOff,
  FiMic as Mic,
  FiMicOff as MicOff,
  FiVolume2 as Volume,
  FiVolumeX as VolumeOff,
  FiUser as User,
  FiClock as Clock,
  FiPause as Pause,
  FiPlay as Play
} from 'react-icons/fi';
import PropTypes from 'prop-types';
import webrtcCallService from '../services/webrtcCallService';
import { hangupCall as comprehensiveHangup } from '../services/hangupService';
import audioManager from '../services/audioManager';
import { cn, getInitials } from '../utils/ui';
import {
  buildButtonClass,
  buildNotificationClass,
  touchTargetStyles
} from '../utils/styling';

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

  return (
    <div className={cn(
      'min-h-screen flex items-center justify-center relative overflow-hidden',
      // Mobile-first responsive padding
      'px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:px-8 lg:py-10',
      darkMode
        ? 'bg-slate-900'
        : 'bg-indigo-50'
    )}>
      {/* Decorative Background Elements - Responsive */}
      <div className="absolute inset-0">
        {/* Top decorative circles - Hidden on small screens, visible on larger */}
        <div className="hidden sm:block absolute top-8 left-8 w-16 h-16 md:w-20 md:h-20 lg:w-24 lg:h-24 bg-indigo-200 rounded-full opacity-30"></div>
        <div className="hidden md:block absolute top-16 right-12 w-12 h-12 lg:w-16 lg:h-16 bg-purple-200 rounded-full opacity-40"></div>
        <div className="hidden lg:block absolute top-32 left-1/4 w-10 h-10 lg:w-12 lg:h-12 bg-pink-200 rounded-full opacity-35"></div>

        {/* Middle decorative elements - Responsive sizing */}
        <div className="hidden sm:block absolute top-1/2 left-2 sm:left-4 w-12 h-12 md:w-16 md:h-16 lg:w-20 lg:h-20 bg-blue-200 rounded-full opacity-25"></div>
        <div className="hidden md:block absolute top-1/2 right-4 lg:right-8 w-10 h-10 lg:w-14 lg:h-14 bg-emerald-200 rounded-full opacity-30"></div>

        {/* Bottom decorative circles - Responsive */}
        <div className="hidden sm:block absolute bottom-16 left-8 lg:left-16 w-14 h-14 lg:w-18 lg:h-18 bg-amber-200 rounded-full opacity-35"></div>
        <div className="hidden md:block absolute bottom-8 right-1/4 w-16 h-16 lg:w-22 lg:h-22 bg-rose-200 rounded-full opacity-30"></div>
        <div className="hidden lg:block absolute bottom-24 right-4 w-8 h-8 lg:w-10 lg:h-10 bg-cyan-200 rounded-full opacity-40"></div>

        {/* Decorative squares - Hidden on mobile */}
        <div className="hidden md:block absolute top-1/4 right-1/3 w-6 h-6 lg:w-8 lg:h-8 bg-violet-200 rounded-lg opacity-25 rotate-45"></div>
        <div className="hidden lg:block absolute bottom-1/3 left-1/3 w-5 h-5 lg:w-6 lg:h-6 bg-teal-200 rounded-lg opacity-30 rotate-12"></div>
      </div>

      {/* Professional Notification */}
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={buildNotificationClass(
            notification.type === 'success' ? 'success' :
            notification.type === 'error' ? 'danger' :
            notification.type === 'warning' ? 'warning' : 'info'
          )}
        >
          <div className="flex items-center space-x-2">
            <div className={cn(
              'w-2 h-2 rounded-full animate-pulse',
              notification.type === 'success' ? 'bg-success-600' :
              notification.type === 'error' ? 'bg-danger-600' :
              notification.type === 'warning' ? 'bg-warning-600' : 'bg-primary-600'
            )}></div>
            <span className="font-medium">{notification.message}</span>
          </div>
        </motion.div>
      )}

      {/* Desktop Layout Container */}
      <div className="w-full max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-center lg:space-x-8 xl:space-x-12">

        {/* Main Calling Card - Enhanced for Desktop */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className={cn(
            // Enhanced mobile-first responsive width
            'w-full max-w-[280px] xs:max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl',
            'mx-auto lg:mx-0 relative z-10 rounded-xl xs:rounded-2xl sm:rounded-3xl shadow-2xl border-2',
            // Mobile-optimized height for small screens
            'min-h-[450px] xs:min-h-[500px] sm:min-h-[550px] md:min-h-[600px] lg:min-h-[650px]',
            // Better mobile spacing
            'mb-16 xs:mb-20 sm:mb-24 md:mb-0',
            darkMode
              ? 'bg-slate-800 border-slate-700'
              : 'bg-white border-indigo-100'
          )}
        >
        {/* Decorative header bar - Responsive height */}
        <div className={cn(
          'h-1.5 sm:h-2 rounded-t-2xl sm:rounded-t-3xl',
          darkMode ? 'bg-indigo-600' : 'bg-indigo-500'
        )}></div>

        <div className="p-3 xs:p-4 sm:p-6 md:p-8 lg:p-10">
          {/* Header - Enhanced Mobile Responsive */}
          <div className="text-center mb-4 sm:mb-6 md:mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className={cn(
                // Enhanced mobile-first avatar sizing
                'inline-flex items-center justify-center rounded-full mb-2 xs:mb-3 sm:mb-4 shadow-lg border-3 xs:border-4',
                'w-12 h-12 xs:w-16 xs:h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 lg:w-28 lg:h-28',
                darkMode
                  ? 'bg-indigo-600 border-indigo-500'
                  : 'bg-indigo-500 border-indigo-400'
              )}
            >
              {contact?.avatar ? (
                <img
                  src={contact.avatar}
                  alt={contact.name || 'Contact'}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className={cn(
                  'font-bold text-white',
                  // Enhanced mobile-first text sizing
                  'text-sm xs:text-lg sm:text-xl md:text-2xl lg:text-3xl'
                )}>
                  {getInitials(contact?.name || contact?.extension || 'U')}
                </span>
              )}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={cn(
                // Responsive title sizing
                'text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2',
                // Better line height for mobile
                'leading-tight',
                darkMode ? 'text-white' : 'text-slate-800'
              )}
            >
              {contact?.name || `Extension ${contact?.extension}` || 'Unknown'}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className={cn(
                // Responsive subtitle sizing
                'text-xs sm:text-sm md:text-base mb-2 sm:mb-3 font-medium',
                darkMode ? 'text-slate-300' : 'text-slate-600'
              )}
            >
              {isOutgoing ? 'Outgoing Call' : 'Incoming Call'}
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className={cn(
                // Responsive status indicator
                'inline-flex items-center justify-center space-x-1.5 sm:space-x-2',
                'text-xs sm:text-sm md:text-base font-medium',
                'px-3 sm:px-4 py-1.5 sm:py-2 rounded-full',
                // Better mobile touch target
                'min-h-[32px] sm:min-h-[36px]',
                darkMode
                  ? 'text-slate-300 bg-slate-700'
                  : 'text-slate-600 bg-slate-100'
              )}
            >
              <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
              <span className="truncate">
                {isConnected ? formatTime(callTime) : currentCallStatus}
              </span>
            </motion.div>
          </div>

          {/* Call Status Indicator - Enhanced Mobile */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6 }}
            className="flex justify-center mb-4 sm:mb-6 md:mb-8"
          >
            <div className={cn(
              // Responsive status indicator sizing
              'w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 lg:w-24 lg:h-24',
              'rounded-full flex items-center justify-center shadow-lg border-4',
              isConnected
                ? 'bg-emerald-500 border-emerald-400 text-white'
                : currentCallStatus === 'Ringing'
                ? 'bg-amber-500 border-amber-400 text-white animate-pulse'
                : 'bg-blue-500 border-blue-400 text-white'
            )}>
              <Phone className="w-4 h-4 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10" />
            </div>
          </motion.div>

          {/* Call Controls - Enhanced Mobile Touch Targets */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="flex justify-center space-x-3 sm:space-x-4 md:space-x-6 mb-4 sm:mb-6"
          >
            {/* Mute Button - Enhanced Mobile */}
            <button
              onClick={handleMuteToggle}
              className={cn(
                // Better mobile touch targets and responsive sizing
                'p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl',
                'transition-all duration-200 shadow-lg border-2',
                // Mobile-friendly hover states
                'active:scale-95 sm:hover:scale-105',
                // Minimum touch target size for mobile
                'min-w-[44px] min-h-[44px] sm:min-w-[48px] sm:min-h-[48px]',
                'flex items-center justify-center',
                isMuted
                  ? 'bg-red-500 border-red-400 text-white active:bg-red-600 sm:hover:bg-red-600'
                  : darkMode
                  ? 'bg-slate-700 border-slate-600 text-slate-300 active:bg-slate-600 sm:hover:bg-slate-600'
                  : 'bg-slate-100 border-slate-200 text-slate-600 active:bg-slate-200 sm:hover:bg-slate-200'
              )}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMuted ?
                <MicOff className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" /> :
                <Mic className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
              }
            </button>

            {/* Hold Button - Enhanced Mobile */}
            <button
              onClick={handleHoldToggle}
              className={cn(
                'p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl',
                'transition-all duration-200 shadow-lg border-2',
                'active:scale-95 sm:hover:scale-105',
                'min-w-[44px] min-h-[44px] sm:min-w-[48px] sm:min-h-[48px]',
                'flex items-center justify-center',
                isOnHold
                  ? 'bg-yellow-500 border-yellow-400 text-white active:bg-yellow-600 sm:hover:bg-yellow-600'
                  : darkMode
                  ? 'bg-slate-700 border-slate-600 text-slate-300 active:bg-slate-600 sm:hover:bg-slate-600'
                  : 'bg-slate-100 border-slate-200 text-slate-600 active:bg-slate-200 sm:hover:bg-slate-200'
              )}
              aria-label={isOnHold ? 'Resume call' : 'Hold call'}
            >
              {isOnHold ?
                <Play className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" /> :
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
              }
            </button>

            {/* Speaker Button - Enhanced Mobile */}
            <button
              onClick={handleSpeakerToggle}
              className={cn(
                // Better mobile touch targets and responsive sizing
                'p-2.5 sm:p-3 md:p-4 rounded-xl sm:rounded-2xl',
                'transition-all duration-200 shadow-lg border-2',
                // Mobile-friendly hover states
                'active:scale-95 sm:hover:scale-105',
                // Minimum touch target size for mobile
                'min-w-[44px] min-h-[44px] sm:min-w-[48px] sm:min-h-[48px]',
                'flex items-center justify-center',
                !isSpeakerOn
                  ? 'bg-amber-500 border-amber-400 text-white active:bg-amber-600 sm:hover:bg-amber-600'
                  : darkMode
                  ? 'bg-slate-700 border-slate-600 text-slate-300 active:bg-slate-600 sm:hover:bg-slate-600'
                  : 'bg-slate-100 border-slate-200 text-slate-600 active:bg-slate-200 sm:hover:bg-slate-200'
              )}
              aria-label={isSpeakerOn ? 'Turn off speaker' : 'Turn on speaker'}
            >
              {isSpeakerOn ?
                <Volume className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" /> :
                <VolumeOff className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6" />
              }
            </button>
          </motion.div>

          {/* End Call Button - Professional Styling */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleEndCall}
            disabled={hangupInProgressRef.current}
            className={cn(
              buildButtonClass('danger', 'lg'),
              'w-full space-x-1.5 sm:space-x-2',
              touchTargetStyles.large,
              // Responsive text sizing
              'text-sm sm:text-base md:text-lg',
              // Enhanced mobile states
              hangupInProgressRef.current && 'opacity-75 cursor-not-allowed'
            )}
            aria-label="End the current call"
          >
            <PhoneOff className="w-3.5 h-3.5 sm:w-4 sm:h-4 md:w-5 md:h-5 flex-shrink-0" />
            <span>
              {hangupInProgressRef.current ? 'Ending Call...' : 'End Call'}
            </span>
          </motion.button>
        </div>
      </motion.div>

      {/* Desktop Side Panel - Additional Info (Hidden on Mobile) */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
        className="hidden lg:block lg:w-80 xl:w-96"
      >
        <div className={cn(
          'rounded-2xl shadow-xl border-2 p-6',
          darkMode
            ? 'bg-slate-800 border-slate-700'
            : 'bg-white border-indigo-100'
        )}>
          {/* Call Information */}
          <div className="mb-6">
            <h3 className={cn(
              'text-lg font-semibold mb-4',
              darkMode ? 'text-white' : 'text-slate-800'
            )}>
              Call Information
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className={cn(
                  'text-sm',
                  darkMode ? 'text-slate-400' : 'text-slate-600'
                )}>
                  Extension:
                </span>
                <span className={cn(
                  'text-sm font-medium',
                  darkMode ? 'text-slate-200' : 'text-slate-800'
                )}>
                  {contact?.extension || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={cn(
                  'text-sm',
                  darkMode ? 'text-slate-400' : 'text-slate-600'
                )}>
                  Call Type:
                </span>
                <span className={cn(
                  'text-sm font-medium',
                  darkMode ? 'text-slate-200' : 'text-slate-800'
                )}>
                  {isOutgoing ? 'Outgoing' : 'Incoming'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className={cn(
                  'text-sm',
                  darkMode ? 'text-slate-400' : 'text-slate-600'
                )}>
                  Status:
                </span>
                <span className={cn(
                  'text-sm font-medium',
                  isConnected ? 'text-emerald-500' : 'text-amber-500'
                )}>
                  {isConnected ? 'Connected' : currentCallStatus}
                </span>
              </div>
              {isConnected && (
                <div className="flex justify-between">
                  <span className={cn(
                    'text-sm',
                    darkMode ? 'text-slate-400' : 'text-slate-600'
                  )}>
                    Duration:
                  </span>
                  <span className={cn(
                    'text-sm font-medium font-mono',
                    darkMode ? 'text-slate-200' : 'text-slate-800'
                  )}>
                    {formatTime(callTime)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions (Desktop Only) */}
          <div className="mb-6">
            <h3 className={cn(
              'text-lg font-semibold mb-4',
              darkMode ? 'text-white' : 'text-slate-800'
            )}>
              Quick Actions
            </h3>
            <div className="space-y-2">
              <button
                className={cn(
                  'w-full text-left px-4 py-3 rounded-lg transition-all duration-200',
                  'flex items-center space-x-3',
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                )}
              >
                <User className="w-4 h-4" />
                <span className="text-sm">View Contact Details</span>
              </button>
              <button
                className={cn(
                  'w-full text-left px-4 py-3 rounded-lg transition-all duration-200',
                  'flex items-center space-x-3',
                  darkMode
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                )}
              >
                <Clock className="w-4 h-4" />
                <span className="text-sm">Call History</span>
              </button>
            </div>
          </div>

          {/* Call Quality Indicator (Desktop Only) */}
          <div>
            <h3 className={cn(
              'text-lg font-semibold mb-4',
              darkMode ? 'text-white' : 'text-slate-800'
            )}>
              Connection Quality
            </h3>
            <div className="flex items-center space-x-2">
              <div className="flex space-x-1">
                <div className="w-2 h-4 bg-emerald-500 rounded-sm"></div>
                <div className="w-2 h-4 bg-emerald-500 rounded-sm"></div>
                <div className="w-2 h-4 bg-emerald-500 rounded-sm"></div>
                <div className="w-2 h-4 bg-emerald-500 rounded-sm"></div>
                <div className={cn(
                  'w-2 h-4 rounded-sm',
                  darkMode ? 'bg-slate-600' : 'bg-slate-300'
                )}></div>
              </div>
              <span className={cn(
                'text-sm font-medium',
                darkMode ? 'text-slate-200' : 'text-slate-700'
              )}>
                Excellent
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      </div>
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
