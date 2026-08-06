import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiMic,
  FiMicOff,
  FiVideo,
  FiVideoOff,
  FiPhoneOff,
  FiRepeat,
} from "react-icons/fi";
import videoCallService from "../../services/videoCallService";
import { formatDuration, getInitials, getAvatarColor, cn } from "../../utils/ui";
import { useTheme } from "../../contexts/ThemeContext";

const VideoCallScreen = () => {
  const { darkMode } = useTheme();
  const [snapshot, setSnapshot] = useState(videoCallService.getSnapshot());
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [quality, setQuality] = useState("unknown");
  const [pipPos, setPipPos] = useState({ x: null, y: null });
  const dragState = useRef(null);
  const hideControlsTimer = useRef(null);

  const { state, call } = snapshot;

  const show = state === "connecting" || state === "connected" || state === "ended";
  const connected = state === "connected";
  const peerName = call?.peerName || "Unknown";
  const peerExt = call?.peerExtension || "";
  const duration = snapshot.connectedSince
    ? Math.floor((Date.now() - snapshot.connectedSince) / 1000)
    : 0;

  useEffect(() => {
    return videoCallService.subscribe(setSnapshot);
  }, []);

  // Attach streams to the video elements
  useEffect(() => {
    if (remoteVideoRef.current && snapshot.remoteStream) {
      remoteVideoRef.current.srcObject = snapshot.remoteStream;
    }
  }, [snapshot.remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && snapshot.localStream) {
      localVideoRef.current.srcObject = snapshot.localStream;
    }
  }, [snapshot.localStream]);

  // Quality + duration polling while connected
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      setQuality(videoCallService.getConnectionQuality());
      setSnapshot(videoCallService.getSnapshot());
    }, 2000);
    return () => clearInterval(interval);
  }, [connected]);

  // Auto-hide controls after inactivity
  const pokeControls = () => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 4000);
  };

  useEffect(() => {
    pokeControls();
    return () => {
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    };
  }, [show]);

  // End the call if the tab is closed
  useEffect(() => {
    const handler = () => {
      if (state === "connected" || state === "connecting") videoCallService.endCall();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  // Local PiP drag
  const onPipPointerDown = (e) => {
    dragState.current = { startX: e.clientX, startY: e.clientY, baseX: pipPos.x, baseY: pipPos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPipPointerMove = (e) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setPipPos({
      x: (dragState.current.baseX ?? window.innerWidth - 176) + dx,
      y: (dragState.current.baseY ?? window.innerHeight - 260) + dy,
    });
  };

  const onPipPointerUp = () => {
    dragState.current = null;
  };

  if (!show) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 z-[80] bg-black flex flex-col overflow-hidden select-none",
        darkMode ? "text-white" : "text-white"
      )}
      onPointerMove={pokeControls}
    >
      {/* Remote video (fills the screen) */}
      {snapshot.remoteStream ? (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted={false}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-secondary-900 via-secondary-800 to-black">
          <div className={cn("w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-2xl", getAvatarColor(peerName))}>
            {getInitials(peerName)}
          </div>
          <p className="text-lg text-secondary-200">{connected ? "Connecting..." : "Waiting for video..."}</p>
        </div>
      )}

      {/* Top info bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 px-5 py-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn("w-11 h-11 rounded-full flex items-center justify-center text-lg font-bold text-white", getAvatarColor(peerName))}>
            {getInitials(peerName)}
          </div>
          <div>
            <p className="font-semibold leading-tight">{peerName}</p>
            <p className="text-xs text-secondary-200">
              {peerExt ? `Extension: ${peerExt}` : ""}
              {connected ? `  •  ${formatDuration(duration)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1.5",
              quality === "good" && "bg-green-500/90",
              quality === "checking" && "bg-yellow-500/90",
              quality === "poor" && "bg-orange-500/90",
              quality === "failed" && "bg-red-500/90",
              quality === "unknown" && "bg-white/20"
            )}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            {quality === "good" ? "Good" : quality === "checking" ? "Checking" : quality === "poor" ? "Poor" : quality === "failed" ? "Dropped" : "Video"}
          </span>
        </div>
      </div>

      {/* Local PiP */}
      {snapshot.localStream && (
        <div
          className="absolute w-40 aspect-[3/4] rounded-2xl overflow-hidden shadow-2xl ring-2 ring-white/20 cursor-grab active:cursor-grabbing"
          style={{
            right: pipPos.x !== null ? undefined : 16,
            bottom: pipPos.y !== null ? undefined : 24,
            transform: pipPos.x !== null ? `translate(${pipPos.x}px, ${pipPos.y}px)` : undefined,
            touchAction: "none",
          }}
          onPointerDown={onPipPointerDown}
          onPointerMove={onPipPointerMove}
          onPointerUp={onPipPointerUp}
        >
          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
          {!snapshot.isVideoOn && (
            <div className="absolute inset-0 bg-secondary-900 flex items-center justify-center">
              <FiVideoOff className="w-6 h-6 text-secondary-400" />
            </div>
          )}
          {snapshot.isMuted && (
            <div className="absolute bottom-1 left-1 w-7 h-7 rounded-full bg-red-500/90 flex items-center justify-center">
              <FiMicOff className="w-4 h-4 text-white" />
            </div>
          )}
        </div>
      )}

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 px-6 pb-8 pt-12 flex items-center justify-center gap-6 bg-gradient-to-t from-black/70 to-transparent transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => videoCallService.toggleMute()}
          className="flex flex-col items-center gap-1.5"
          aria-label="Toggle microphone"
        >
          <span
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
              snapshot.isMuted ? "bg-red-500 hover:bg-red-600" : "bg-white/15 hover:bg-white/25"
            )}
          >
            {snapshot.isMuted ? <FiMicOff className="w-6 h-6 text-white" /> : <FiMic className="w-6 h-6 text-white" />}
          </span>
          <span className="text-[11px] text-secondary-200">Mute</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => videoCallService.toggleVideo()}
          className="flex flex-col items-center gap-1.5"
          aria-label="Toggle camera"
        >
          <span
            className={cn(
              "w-14 h-14 rounded-full flex items-center justify-center transition-colors",
              snapshot.isVideoOn ? "bg-white/15 hover:bg-white/25" : "bg-red-500 hover:bg-red-600"
            )}
          >
            {snapshot.isVideoOn ? <FiVideo className="w-6 h-6 text-white" /> : <FiVideoOff className="w-6 h-6 text-white" />}
          </span>
          <span className="text-[11px] text-secondary-200">{snapshot.isVideoOn ? "Camera" : "Camera off"}</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => videoCallService.switchCamera()}
          className="flex flex-col items-center gap-1.5"
          aria-label="Switch camera"
        >
          <span className="w-14 h-14 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
            <FiRepeat className="w-6 h-6 text-white" />
          </span>
          <span className="text-[11px] text-secondary-200">Flip</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => videoCallService.endCall()}
          className="flex flex-col items-center gap-1.5"
          aria-label="End call"
        >
          <span className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/40 flex items-center justify-center transition-colors">
            <FiPhoneOff className="w-7 h-7 text-white" />
          </span>
          <span className="text-[11px] text-secondary-200">Hang up</span>
        </motion.button>
      </div>

      {/* Call ended flash */}
      <AnimatePresence>
        {state === "ended" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3"
          >
            <p className="text-xl font-semibold text-white">Call ended</p>
            <p className="text-sm text-secondary-300">
              {call?.endReason === "declined" ? "The other person declined the call" : ""}
              {call?.endReason === "peer-ended" ? "The other person hung up" : ""}
              {call?.endReason === "cancelled" ? "Call was cancelled" : ""}
              {call?.endReason === "error" ? call.errorMessage || "Something went wrong" : ""}
              {!call?.endReason || call?.endReason === "local-ended" ? "Thanks for calling" : ""}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default VideoCallScreen;
