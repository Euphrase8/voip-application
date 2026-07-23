import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FiPhoneOff, FiMic, FiMicOff, FiVideo, FiVideoOff,
  FiMonitor, FiCamera, FiSettings, FiMaximize, FiMinimize
} from "react-icons/fi";
import { cn } from "../utils/ui";

const VideoCallPage = ({ darkMode, user, contact, onEndCall, callType = "outgoing" }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [callTimer, setCallTimer] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [micSources, setMicSources] = useState([]);
  const [selectedMic, setSelectedMic] = useState("");
  const [speakerSources, setSpeakerSources] = useState([]);
  const [selectedSpeaker, setSelectedSpeaker] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [networkQuality] = useState("good");
  const [isPiP, setIsPiP] = useState(false);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const containerRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const timerRef = useRef(null);
  useEffect(() => {
    initCall();
    enumerateDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (isConnected) {
      timerRef.current = setInterval(() => {
        setCallTimer((t) => t + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isConnected]);

  const initCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      setLocalStream(stream);
      setIsConnected(true);
      setIsVideoEnabled(true);
    } catch (err) {
      console.error("Failed to get media:", err);
    }
  };

  const enumerateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter(d => d.kind === "videoinput"));
      setMicSources(devices.filter(d => d.kind === "audioinput"));
      setSpeakerSources(devices.filter(d => d.kind === "audiooutput"));
      const defaultCam = devices.find(d => d.kind === "videoinput");
      if (defaultCam) setSelectedCamera(defaultCam.deviceId);
      const defaultMic = devices.find(d => d.kind === "audioinput");
      if (defaultMic) setSelectedMic(defaultMic.deviceId);
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = isMuted;
        setIsMuted(!isMuted);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    const currentId = selectedCamera;
    const currentIdx = cameras.findIndex(c => c.deviceId === currentId);
    const nextIdx = (currentIdx + 1) % cameras.length;
    const nextCam = cameras[nextIdx];

    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.stop());
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: nextCam.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = localStream.getVideoTracks()[0];
        if (oldTrack) {
          localStream.removeTrack(oldTrack);
          localStream.addTrack(newTrack);
          if (peerConnectionRef.current) {
            const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === "video");
            if (sender) await sender.replaceTrack(newTrack);
          }
        }
        setSelectedCamera(nextCam.deviceId);
      } catch (err) {
        console.error("Failed to switch camera:", err);
      }
    }
  };

  const toggleFullScreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen();
      setIsFullScreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullScreen(false);
    }
  };

  const togglePiP = async () => {
    if (remoteVideoRef.current && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
          setIsPiP(false);
        } else {
          await remoteVideoRef.current.requestPictureInPicture();
          setIsPiP(true);
        }
      } catch (err) {
        console.error("PiP failed:", err);
      }
    }
  };

  const changeCamera = async (deviceId) => {
    setSelectedCamera(deviceId);
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.stop());
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = localStream.getVideoTracks()[0];
        if (oldTrack) {
          localStream.removeTrack(oldTrack);
          localStream.addTrack(newTrack);
          if (peerConnectionRef.current) {
            const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === "video");
            if (sender) await sender.replaceTrack(newTrack);
          }
        }
      } catch (err) {}
    }
  };

  const changeMic = async (deviceId) => {
    setSelectedMic(deviceId);
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.stop());
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
          video: false
        });
        const newTrack = newStream.getAudioTracks()[0];
        const oldTrack = localStream.getAudioTracks()[0];
        if (oldTrack) {
          localStream.removeTrack(oldTrack);
          localStream.addTrack(newTrack);
          if (peerConnectionRef.current) {
            const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === "audio");
            if (sender) await sender.replaceTrack(newTrack);
          }
        }
      } catch (err) {}
    }
  };

  const endCall = useCallback(() => {
    cleanup();
    if (onEndCall) onEndCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEndCall]);

  const cleanup = () => {
    clearInterval(timerRef.current);
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture();
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
    setCallTimer(0);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const getQualityColor = (q) => {
    switch (q) {
      case "excellent": return "bg-green-500";
      case "good": return "bg-green-400";
      case "fair": return "bg-yellow-400";
      case "poor": return "bg-red-400";
      default: return "bg-gray-400";
    }
  };

  const contactName = contact?.name || contact?.extension || user?.username || "User";
  const contactExt = contact?.extension || user?.extension || "";

  return (
    <div
      ref={containerRef}
      className={cn(
        "h-full flex flex-col relative overflow-hidden",
        darkMode ? "bg-gray-900" : "bg-gray-100"
      )}
    >
      {/* Remote Video (main) */}
      <div className="flex-1 relative bg-black">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className={cn(
            "w-full h-full object-cover",
            !remoteStream && "hidden"
          )}
        />
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn(
              "w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold",
              darkMode ? "bg-gray-700 text-white" : "bg-gray-200 text-gray-600"
            )}>
              {contactName.charAt(0).toUpperCase()}
            </div>
          </div>
        )}

        {/* Call overlay info */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-white">
              <p className="font-semibold text-lg">{contactName}</p>
              <p className="text-sm text-gray-300">{contactExt && `Ext: ${contactExt}`}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black/50 px-3 py-1.5 rounded-full">
              <div className={cn("w-2 h-2 rounded-full", getQualityColor(networkQuality))} />
              <span className="text-white text-xs">{networkQuality}</span>
            </div>
            <div className={cn(
              "px-3 py-1.5 rounded-full text-white text-sm font-mono",
              isConnected ? "bg-green-600/80" : "bg-yellow-600/80"
            )}>
              {isConnected ? formatTime(callTimer) : "Connecting..."}
            </div>
          </div>
        </div>

        {/* Incoming call status */}
        {!isConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mb-4 animate-pulse">
              <FiVideo className="w-8 h-8" />
            </div>
            <p className="text-lg font-semibold">Video Call</p>
            <p className="text-sm text-gray-300">Waiting for connection...</p>
          </div>
        )}
      </div>

      {/* Local video (PiP) */}
      <div className={cn(
        "absolute bottom-24 right-4 w-36 h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-white/30 z-10",
        !localStream && "hidden"
      )}>
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        {!isVideoEnabled && (
          <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
            <FiVideoOff className="w-8 h-8 text-gray-400" />
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="flex-shrink-0 px-4 py-4 flex items-center justify-center gap-3 bg-gray-900/90 backdrop-blur-sm">
        <ControlButton
          icon={isMuted ? FiMicOff : FiMic}
          label={isMuted ? "Unmute" : "Mute"}
          active={!isMuted}
          danger={isMuted}
          onClick={toggleMute}
        />
        <ControlButton
          icon={isVideoEnabled ? FiVideo : FiVideoOff}
          label={isVideoEnabled ? "Camera On" : "Camera Off"}
          active={isVideoEnabled}
          danger={!isVideoEnabled}
          onClick={toggleVideo}
        />
        {cameras.length > 1 && (
          <ControlButton
            icon={FiCamera}
            label="Switch Camera"
            onClick={switchCamera}
          />
        )}
        <ControlButton
          icon={isFullScreen ? FiMinimize : FiMaximize}
          label={isFullScreen ? "Exit Full" : "Full Screen"}
          onClick={toggleFullScreen}
        />
        {document.pictureInPictureEnabled && (
          <ControlButton
            icon={FiMonitor}
            label={isPiP ? "Exit PiP" : "PiP"}
            onClick={togglePiP}
          />
        )}
        <ControlButton
          icon={FiSettings}
          label="Settings"
          active={showSettings}
          onClick={() => setShowSettings(!showSettings)}
        />

        {/* End Call */}
        <button
          onClick={endCall}
          className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg hover:shadow-red-500/40 active:scale-95"
          title="End Call"
        >
          <FiPhoneOff className="w-6 h-6" />
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "absolute bottom-24 right-4 w-72 rounded-xl shadow-xl border z-20 p-4",
            darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
          )}
        >
          <h3 className={cn("text-sm font-semibold mb-3", darkMode ? "text-white" : "text-gray-900")}>
            Device Settings
          </h3>

          <div className="space-y-3">
            <div>
              <label className={cn("text-xs block mb-1", darkMode ? "text-gray-300" : "text-gray-600")}>
                Camera
              </label>
              <select
                value={selectedCamera}
                onChange={(e) => changeCamera(e.target.value)}
                className={cn(
                  "w-full px-2 py-1.5 text-sm rounded-lg border",
                  darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"
                )}
              >
                {cameras.map((cam) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Camera ${cam.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={cn("text-xs block mb-1", darkMode ? "text-gray-300" : "text-gray-600")}>
                Microphone
              </label>
              <select
                value={selectedMic}
                onChange={(e) => changeMic(e.target.value)}
                className={cn(
                  "w-full px-2 py-1.5 text-sm rounded-lg border",
                  darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"
                )}
              >
                {micSources.map((mic) => (
                  <option key={mic.deviceId} value={mic.deviceId}>
                    {mic.label || `Mic ${mic.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={cn("text-xs block mb-1", darkMode ? "text-gray-300" : "text-gray-600")}>
                Speaker
              </label>
              <select
                value={selectedSpeaker}
                onChange={(e) => setSelectedSpeaker(e.target.value)}
                className={cn(
                  "w-full px-2 py-1.5 text-sm rounded-lg border",
                  darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"
                )}
              >
                {speakerSources.map((spk) => (
                  <option key={spk.deviceId} value={spk.deviceId}>
                    {spk.label || `Speaker ${spk.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

const ControlButton = ({ icon: Icon, label, active, danger, onClick }) => (
  <button
    onClick={onClick}
    className={cn(
      "p-3 rounded-full transition-all active:scale-95 flex flex-col items-center gap-1",
      active && "bg-green-600 text-white",
      danger && "bg-red-600 text-white",
      !active && !danger && "bg-gray-700 text-gray-300 hover:bg-gray-600"
    )}
    title={label}
  >
    <Icon className="w-5 h-5" />
    <span className="text-[10px]">{label}</span>
  </button>
);

export default VideoCallPage;
