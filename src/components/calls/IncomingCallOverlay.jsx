import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FiVideo, FiPhoneOff, FiPhoneIncoming } from "react-icons/fi";
import videoCallService from "../../services/videoCallService";
import { startRingtone, stopRinging } from "../../utils/ringtone";
import { getInitials, getAvatarColor } from "../../utils/ui";
import { useTheme } from "../../contexts/ThemeContext";
import { cn } from "../../utils/ui";

const RING_TIMEOUT_SECONDS = 30;

const IncomingCallOverlay = () => {
  const { darkMode } = useTheme();
  const [snapshot, setSnapshot] = useState(videoCallService.getSnapshot());
  const [timeLeft, setTimeLeft] = useState(RING_TIMEOUT_SECONDS);
  const [accepting, setAccepting] = useState(false);

  const show = snapshot.state === "ringing" && snapshot.direction === "incoming" && !!snapshot.call;
  const callerName = snapshot.call?.peerName || "Unknown";
  const callerExt = snapshot.call?.peerExtension || "";

  // Subscribe to the call service
  useEffect(() => {
    return videoCallService.subscribe(setSnapshot);
  }, []);

  // Play the ringtone while an incoming call is ringing; stop otherwise.
  useEffect(() => {
    if (show) {
      startRingtone();
      setTimeLeft(RING_TIMEOUT_SECONDS);
      return () => stopRinging();
    }
    stopRinging();
  }, [show]);

  // Countdown shown to the user (service auto-rejects at the deadline).
  useEffect(() => {
    if (!show) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [show]);

  const handleAccept = async () => {
    if (accepting) return;
    setAccepting(true);
    stopRinging();
    await videoCallService.acceptCall();
    setAccepting(false);
  };

  const handleReject = () => {
    stopRinging();
    videoCallService.rejectCall();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", damping: 22, stiffness: 260 }}
        className={cn(
          "w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border",
          darkMode ? "bg-secondary-800 border-secondary-700" : "bg-white border-gray-200"
        )}
      >
        {/* Top bar */}
        <div className={cn("px-6 py-3 flex items-center justify-center gap-2", darkMode ? "bg-secondary-900" : "bg-gray-50")}>
          <FiPhoneIncoming className="w-4 h-4 text-green-500" />
          <span className={cn("text-sm font-semibold tracking-wide", darkMode ? "text-secondary-300" : "text-secondary-600")}>
            Incoming Video Call
          </span>
        </div>

        <div className="px-8 py-8 flex flex-col items-center">
          <div className="relative mb-6">
            <div className={cn("w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold text-white shadow-lg", getAvatarColor(callerName))}>
              {getInitials(callerName)}
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-green-500 border-4 border-white dark:border-secondary-800 flex items-center justify-center">
              <FiVideo className="w-4 h-4 text-white" />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-green-400/50 animate-ping" />
          </div>

          <h2 className={cn("text-2xl font-bold mb-1", darkMode ? "text-white" : "text-gray-900")}>{callerName}</h2>
          <p className={cn("text-sm mb-6", darkMode ? "text-secondary-400" : "text-secondary-500")}>
            Extension: {callerExt}
          </p>

          <div className="flex items-center gap-2 mb-8">
            <span className={cn("w-2 h-2 rounded-full bg-green-500 animate-pulse")} />
            <span className={cn("text-sm", darkMode ? "text-secondary-400" : "text-secondary-500")}>
              Ringing... ({timeLeft}s)
            </span>
          </div>

          <div className="flex items-center justify-center gap-8">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleReject}
              disabled={accepting}
              className="flex flex-col items-center gap-2"
              aria-label="Reject call"
            >
              <span className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/40 transition-colors">
                <FiPhoneOff className="w-6 h-6" />
              </span>
              <span className={cn("text-xs font-medium", darkMode ? "text-secondary-300" : "text-secondary-600")}>Decline</span>
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={handleAccept}
              disabled={accepting}
              className="flex flex-col items-center gap-2"
              aria-label="Accept call"
            >
              <span className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center shadow-lg shadow-green-500/40 transition-colors">
                {accepting ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <FiVideo className="w-6 h-6" />
                )}
              </span>
              <span className={cn("text-xs font-medium", darkMode ? "text-secondary-300" : "text-secondary-600")}>Accept</span>
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default IncomingCallOverlay;
