import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  FiPhoneOff, FiMic, FiMicOff, FiVideo, FiVideoOff,
  FiMonitor, FiCamera, FiSettings, FiMaximize, FiMinimize,
  FiSearch, FiUsers
} from "react-icons/fi";
import { cn } from "../utils/ui";
import { getWebSocket, sendWebSocketMessage } from "../services/websocketservice";
import { getUsers } from "../services/users";
import toast from "react-hot-toast";

const VideoCallList = ({ darkMode, user, onStartCall, onAcceptIncoming, incomingCall }) => {
  const [contacts, setContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const currentUserId = localStorage.getItem("user_id");

  useEffect(() => {
    loadContacts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadContacts = async () => {
    try {
      const data = await getUsers();
      if (data.success) {
        setContacts(data.users.filter(u => String(u.id) !== currentUserId));
      }
    } catch (e) {
      console.error("Failed to load contacts", e);
    }
  };

  const filteredContacts = contacts.filter(c =>
    !searchTerm ||
    c.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.extension?.includes(searchTerm)
  );

  return (
    <div className="h-full flex flex-col">
      <div className={cn(
        "p-4 border-b flex-shrink-0",
        darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
      )}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <FiVideo className="w-5 h-5" />
            Video Calls
          </h2>
          <span className={cn(
            "text-xs px-2 py-1 rounded-full",
            darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"
          )}>
            {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="relative">
          <FiSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or extension..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(
              "w-full pl-9 pr-3 py-2 rounded-lg text-sm border outline-none",
              darkMode
                ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                : "bg-gray-50 border-gray-200 text-gray-900"
            )}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
            <FiUsers className="w-12 h-12 mb-2" />
            <p className="text-sm">No contacts available</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {filteredContacts.map((contact) => (
              <motion.div
                key={contact.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-colors",
                  darkMode ? "hover:bg-gray-700 bg-gray-800" : "hover:bg-gray-50 bg-white shadow-sm"
                )}
              >
                <div className="relative flex-shrink-0">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center text-base font-medium",
                    darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600"
                  )}>
                    {contact.username?.charAt(0).toUpperCase()}
                  </div>
                  {contact.status === "online" && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{contact.username}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn(
                      "text-xs",
                      contact.status === "online" ? "text-green-500" : "text-gray-400"
                    )}>
                      {contact.status === "online" ? "Online" : "Offline"}
                    </span>
                    <span className="text-xs text-gray-400">Ext: {contact.extension}</span>
                  </div>
                </div>
                <button
                  onClick={() => onStartCall(contact)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0",
                    "bg-blue-500 text-white hover:bg-blue-600"
                  )}
                >
                  <FiVideo className="w-4 h-4" />
                  <span className="hidden sm:inline">Video Call</span>
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
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
    <span className="text-[10px] hidden sm:inline">{label}</span>
  </button>
);

const VideoCallActive = ({ darkMode, contact, onEndCall }) => {
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
  const [networkQuality, setNetworkQuality] = useState("good");
  const [isPiP, setIsPiP] = useState(false);
  const [callState, setCallState] = useState("calling");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const containerRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const timerRef = useRef(null);
  const iceBufferRef = useRef([]);
  const offerAnswerDoneRef = useRef(false);

  const currentExtension = localStorage.getItem("extension");
  const currentUsername = localStorage.getItem("username");
  const currentUserId = localStorage.getItem("user_id");
  const targetExtension = contact?.extension || "";

  useEffect(() => {
    initCall();
    enumerateDevices();
    const cleanup = setupWebSocketListener();
    return () => {
      if (cleanup) cleanup();
    };
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
      timerRef.current = setInterval(() => setCallTimer((t) => t + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isConnected]);

  const setupWebSocketListener = () => {
    const socket = getWebSocket();
    if (!socket) return () => {};
    const handler = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "webrtc_offer":
            handleOffer(data);
            break;
          case "webrtc_answer":
            handleAnswer(data);
            break;
          case "webrtc_ice_candidate":
            handleIceCandidate(data);
            break;
          case "webrtc_call_ended":
            handleRemoteEnded();
            break;
          case "webrtc_call_rejected":
            handleRemoteRejected();
            break;
          default:
            break;
        }
      } catch (e) {}
    };
    socket.addEventListener("message", handler);
    return () => socket.removeEventListener("message", handler);
  };

  const initCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      setLocalStream(stream);
      setCallState("calling");
      await createPeerConnection(stream);
      await sendWebSocketMessage({
        type: "video_call_request",
        to: targetExtension,
        from: currentExtension,
        fromUsername: currentUsername,
        caller_id: currentUserId
      });
      await createOffer();
    } catch (err) {
      console.error("Failed to get media:", err);
      toast.error("Camera/microphone access denied");
    }
  };

  const createPeerConnection = async (stream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });

    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        setRemoteStream(event.streams[0]);
        setIsConnected(true);
        setCallState("connected");
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWebSocketMessage({
          type: "webrtc_ice_candidate",
          candidate: event.candidate,
          to: targetExtension,
          from: currentExtension,
          video: true
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      const states = {
        connected: "good",
        checking: "fair",
        disconnected: "poor",
        failed: "poor"
      };
      setNetworkQuality(states[pc.iceConnectionState] || "fair");
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        handleRemoteEnded();
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  const createOffer = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      sendWebSocketMessage({
        type: "webrtc_offer",
        offer,
        to: targetExtension,
        from: currentExtension,
        video: true
      });
    } catch (err) {
      console.error("Failed to create offer:", err);
    }
  };

  const handleOffer = async (data) => {
    try {
      const stream = localStream || await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      if (!localStream) setLocalStream(stream);
      const pc = await createPeerConnection(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      offerAnswerDoneRef.current = true;
      for (const candidate of iceBufferRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
      }
      iceBufferRef.current = [];
      sendWebSocketMessage({
        type: "webrtc_answer",
        answer,
        to: data.from,
        from: currentExtension,
        video: true
      });
    } catch (err) {
      console.error("Failed to handle offer:", err);
    }
  };

  const handleAnswer = async (data) => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      offerAnswerDoneRef.current = true;
      for (const candidate of iceBufferRef.current) {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
      }
      iceBufferRef.current = [];
    } catch (err) {
      console.error("Failed to handle answer:", err);
    }
  };

  const handleIceCandidate = async (data) => {
    if (!data.candidate) return;
    if (!offerAnswerDoneRef.current || !peerConnectionRef.current) {
      iceBufferRef.current.push(data.candidate);
      return;
    }
    try {
      await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("Failed to add ICE candidate:", err);
    }
  };

  const handleRemoteEnded = () => {
    toast("Video call ended", { duration: 3000 });
    cleanup();
    if (onEndCall) onEndCall();
  };

  const handleRemoteRejected = () => {
    toast.error("Call rejected", { duration: 3000 });
    cleanup();
    if (onEndCall) onEndCall();
  };

  const enumerateDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter(d => d.kind === "videoinput"));
      setMicSources(devices.filter(d => d.kind === "audioinput"));
      setSpeakerSources(devices.filter(d => d.kind === "audiooutput"));
      const dc = devices.find(d => d.kind === "videoinput");
      if (dc) setSelectedCamera(dc.deviceId);
      const dm = devices.find(d => d.kind === "audioinput");
      if (dm) setSelectedMic(dm.deviceId);
    } catch (err) {}
  };

  const toggleMute = () => {
    if (localStream) {
      const t = localStream.getAudioTracks()[0];
      if (t) { t.enabled = isMuted; setIsMuted(!isMuted); }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const t = localStream.getVideoTracks()[0];
      if (t) { t.enabled = isVideoEnabled; setIsVideoEnabled(!isVideoEnabled); }
    }
  };

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    const idx = (cameras.findIndex(c => c.deviceId === selectedCamera) + 1) % cameras.length;
    await changeCamera(cameras[idx].deviceId);
  };

  const changeCamera = async (deviceId) => {
    setSelectedCamera(deviceId);
    if (!localStream) return;
    localStream.getVideoTracks().forEach(t => t.stop());
    try {
      const ns = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      const nt = ns.getVideoTracks()[0];
      const ot = localStream.getVideoTracks()[0];
      if (ot) { localStream.removeTrack(ot); localStream.addTrack(nt); }
      if (peerConnectionRef.current) {
        const s = peerConnectionRef.current.getSenders().find(s => s.track?.kind === "video");
        if (s) await s.replaceTrack(nt);
      }
    } catch (err) {}
  };

  const changeMic = async (deviceId) => {
    setSelectedMic(deviceId);
    if (!localStream) return;
    localStream.getAudioTracks().forEach(t => t.stop());
    try {
      const ns = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
        video: false
      });
      const nt = ns.getAudioTracks()[0];
      const ot = localStream.getAudioTracks()[0];
      if (ot) { localStream.removeTrack(ot); localStream.addTrack(nt); }
      if (peerConnectionRef.current) {
        const s = peerConnectionRef.current.getSenders().find(s => s.track?.kind === "audio");
        if (s) await s.replaceTrack(nt);
      }
    } catch (err) {}
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
    if (!remoteVideoRef.current || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await remoteVideoRef.current.requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (err) {}
  };

  const endCall = useCallback(() => {
    sendWebSocketMessage({
      type: "webrtc_call_ended",
      to: targetExtension,
      from: currentExtension,
      video: true
    }).catch(() => {});
    cleanup();
    if (onEndCall) onEndCall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onEndCall, targetExtension, currentExtension]);

  const cleanup = () => {
    clearInterval(timerRef.current);
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (document.fullscreenElement) document.exitFullscreen();
    if (document.pictureInPictureElement) document.exitPictureInPicture();
    setLocalStream(null);
    setRemoteStream(null);
    setIsConnected(false);
    setCallTimer(0);
    iceBufferRef.current = [];
    offerAnswerDoneRef.current = false;
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

  const contactName = contact?.name || contact?.username || contact?.extension || "User";
  const contactExt = contact?.extension || "";

  return (
    <div ref={containerRef} className={cn("h-full flex flex-col relative overflow-hidden", darkMode ? "bg-gray-900" : "bg-gray-100")}>
      <div className="flex-1 relative bg-black">
        <video ref={remoteVideoRef} autoPlay playsInline className={cn("w-full h-full object-cover", !remoteStream && "hidden")} />
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className={cn("w-24 h-24 rounded-full flex items-center justify-center text-3xl font-bold", darkMode ? "bg-gray-700 text-white" : "bg-gray-200 text-gray-600")}>
              {contactName.charAt(0).toUpperCase()}
            </div>
          </div>
        )}

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
              <span className="text-white text-xs capitalize">{networkQuality}</span>
            </div>
            <div className={cn("px-3 py-1.5 rounded-full text-white text-sm font-mono", isConnected ? "bg-green-600/80" : "bg-yellow-600/80")}>
              {isConnected ? formatTime(callTimer) : callState === "ringing" ? "Incoming..." : callState === "calling" ? "Calling..." : "Connecting..."}
            </div>
          </div>
        </div>

        {callState === "calling" && !isConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
            <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center mb-4 animate-pulse">
              <FiVideo className="w-8 h-8" />
            </div>
            <p className="text-lg font-semibold">Calling {contactName}...</p>
            <p className="text-sm text-gray-300">Waiting for answer</p>
          </div>
        )}
      </div>

      <div className={cn("absolute bottom-24 right-4 w-36 h-48 rounded-xl overflow-hidden shadow-2xl border-2 border-white/30 z-10", !localStream && "hidden")}>
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        {!isVideoEnabled && (
          <div className="absolute inset-0 bg-gray-800 flex items-center justify-center">
            <FiVideoOff className="w-8 h-8 text-gray-400" />
          </div>
        )}
      </div>

      <div className="flex-shrink-0 px-4 py-4 flex items-center justify-center gap-3 bg-gray-900/90 backdrop-blur-sm">
        <ControlButton icon={isMuted ? FiMicOff : FiMic} label={isMuted ? "Unmute" : "Mute"} active={!isMuted} danger={isMuted} onClick={toggleMute} />
        <ControlButton icon={isVideoEnabled ? FiVideo : FiVideoOff} label={isVideoEnabled ? "Camera On" : "Camera Off"} active={isVideoEnabled} danger={!isVideoEnabled} onClick={toggleVideo} />
        {cameras.length > 1 && <ControlButton icon={FiCamera} label="Switch Camera" onClick={switchCamera} />}
        <ControlButton icon={isFullScreen ? FiMinimize : FiMaximize} label={isFullScreen ? "Exit Full" : "Full Screen"} onClick={toggleFullScreen} />
        {document.pictureInPictureEnabled && <ControlButton icon={FiMonitor} label={isPiP ? "Exit PiP" : "PiP"} onClick={togglePiP} />}
        <ControlButton icon={FiSettings} label="Settings" active={showSettings} onClick={() => setShowSettings(!showSettings)} />
        <button onClick={endCall} className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg hover:shadow-red-500/40 active:scale-95" title="End Call">
          <FiPhoneOff className="w-6 h-6" />
        </button>
      </div>

      {showSettings && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={cn("absolute bottom-24 right-4 w-72 rounded-xl shadow-xl border z-20 p-4", darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
          <h3 className={cn("text-sm font-semibold mb-3", darkMode ? "text-white" : "text-gray-900")}>Device Settings</h3>
          <div className="space-y-3">
            <div>
              <label className={cn("text-xs block mb-1", darkMode ? "text-gray-300" : "text-gray-600")}>Camera</label>
              <select value={selectedCamera} onChange={(e) => changeCamera(e.target.value)} className={cn("w-full px-2 py-1.5 text-sm rounded-lg border", darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200")}>
                {cameras.map(cam => <option key={cam.deviceId} value={cam.deviceId}>{cam.label || `Camera ${cam.deviceId.slice(0, 8)}`}</option>)}
              </select>
            </div>
            <div>
              <label className={cn("text-xs block mb-1", darkMode ? "text-gray-300" : "text-gray-600")}>Microphone</label>
              <select value={selectedMic} onChange={(e) => changeMic(e.target.value)} className={cn("w-full px-2 py-1.5 text-sm rounded-lg border", darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200")}>
                {micSources.map(mic => <option key={mic.deviceId} value={mic.deviceId}>{mic.label || `Mic ${mic.deviceId.slice(0, 8)}`}</option>)}
              </select>
            </div>
            <div>
              <label className={cn("text-xs block mb-1", darkMode ? "text-gray-300" : "text-gray-600")}>Speaker</label>
              <select value={selectedSpeaker} onChange={(e) => setSelectedSpeaker(e.target.value)} className={cn("w-full px-2 py-1.5 text-sm rounded-lg border", darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200")}>
                {speakerSources.map(spk => <option key={spk.deviceId} value={spk.deviceId}>{spk.label || `Speaker ${spk.deviceId.slice(0, 8)}`}</option>)}
              </select>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

const IncomingVideoCall = ({ darkMode, contact, onAccept, onReject }) => {
  const contactName = contact?.name || contact?.username || contact?.extension || "Unknown";

  return (
    <div className="h-full flex flex-col items-center justify-center bg-black/80 p-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center"
      >
        <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center mb-6 mx-auto animate-pulse shadow-lg shadow-blue-500/50">
          <FiVideo className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Incoming Video Call</h2>
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center text-lg font-medium",
            darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600"
          )}>
            {contactName.charAt(0).toUpperCase()}
          </div>
          <div className="text-left">
            <p className="text-white font-semibold text-lg">{contactName}</p>
            <p className="text-gray-300 text-sm">Ext: {contact?.extension || ""}</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={onReject}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all shadow-lg hover:shadow-red-500/40"
          >
            <FiPhoneOff className="w-5 h-5" />
            Reject
          </button>
          <button
            onClick={onAccept}
            className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-full hover:bg-green-700 transition-all shadow-lg hover:shadow-green-500/40"
          >
            <FiVideo className="w-5 h-5" />
            Accept
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const VideoCallPage = ({ darkMode, user, contact, onEndCall, callType = "outgoing" }) => {
  const [inCall, setInCall] = useState(false);
  const [callContact, setCallContact] = useState(null);
  const [showIncoming, setShowIncoming] = useState(false);

  useEffect(() => {
    if (contact && callType === "incoming") {
      setCallContact(contact);
      setShowIncoming(true);
    }
  }, [contact, callType]);

  const handleStartCall = (selectedContact) => {
    setCallContact(selectedContact);
    setInCall(true);
  };

  const handleAcceptIncoming = () => {
    setShowIncoming(false);
    setInCall(true);
    sendWebSocketMessage({
      type: "webrtc_call_accepted",
      to: callContact?.extension,
      from: localStorage.getItem("extension"),
      video: true
    }).catch(() => {});
  };

  const handleRejectIncoming = () => {
    setShowIncoming(false);
    setCallContact(null);
    sendWebSocketMessage({
      type: "webrtc_call_rejected",
      to: callContact?.extension,
      from: localStorage.getItem("extension"),
      video: true
    }).catch(() => {});
    if (onEndCall) onEndCall();
  };

  const handleEndCall = () => {
    setInCall(false);
    setCallContact(null);
    if (onEndCall) onEndCall();
  };

  if (showIncoming && callContact) {
    return (
      <IncomingVideoCall
        darkMode={darkMode}
        contact={callContact}
        onAccept={handleAcceptIncoming}
        onReject={handleRejectIncoming}
      />
    );
  }

  if (inCall && callContact) {
    return (
      <VideoCallActive
        darkMode={darkMode}
        contact={callContact}
        onEndCall={handleEndCall}
      />
    );
  }

  return (
    <VideoCallList
      darkMode={darkMode}
      user={user}
      onStartCall={handleStartCall}
    />
  );
};

export default VideoCallPage;
