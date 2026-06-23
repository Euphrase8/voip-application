import { useState, useEffect, useRef } from "react";
import { FiPlay, FiPause, FiTrash2, FiCheck, FiBell, FiMic, FiSquare, FiSend, FiUser, FiSearch } from "react-icons/fi";
import { Voicemail as FiVoicemail } from 'lucide-react';
import { motion } from "framer-motion";
import { getVoicemails, markVoicemailRead, deleteVoicemail, getVoicemailAudioUrl, getVoicemailUnreadCount, getMissedCalls } from "../services/voicemail";
import { getUsers } from "../services/users";
import { getToken } from "../services/login";
import { CONFIG } from "../services/config";
import axios from "axios";
import { cn } from "../utils/ui";
import toast from "react-hot-toast";

const VoicemailPage = ({ darkMode }) => {
  const [voicemails, setVoicemails] = useState([]);
  const [missedCalls, setMissedCalls] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [playing, setPlaying] = useState(null);
  const [activeTab, setActiveTab] = useState("voicemail");
  const [showSend, setShowSend] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [users, setUsers] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const currentUserId = localStorage.getItem("user_id");

  useEffect(() => {
    loadVoicemails();
    loadMissedCalls();
    loadUnreadCount();
    loadUsers();
  }, []);

  const loadVoicemails = async () => {
    try {
      const data = await getVoicemails();
      if (data.success) setVoicemails(data.voicemails);
    } catch (e) { console.error("Failed to load voicemails", e); }
  };

  const loadMissedCalls = async () => {
    try {
      const data = await getMissedCalls();
      if (data.success) setMissedCalls(data.missed_calls);
    } catch (e) { console.error("Failed to load missed calls", e); }
  };

  const loadUnreadCount = async () => {
    try {
      const data = await getVoicemailUnreadCount();
      if (data.success) setUnreadCount(data.unread_count);
    } catch (e) {}
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      if (data.success) setUsers(data.users.filter(u => String(u.id) !== currentUserId));
    } catch (e) {}
  };

  const handlePlay = async (vm) => {
    if (playing === vm.id) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPaused(true);
      } else if (audioRef.current && isPaused) {
        audioRef.current.play();
        setIsPaused(false);
      }
      return;
    }

    setPlaying(vm.id);
    setIsPaused(false);

    if (!vm.is_read) {
      await markVoicemailRead(vm.id);
      loadVoicemails();
      loadUnreadCount();
    }

    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      const audio = new Audio(getVoicemailAudioUrl(vm.id));
      audioRef.current = audio;
      audio.play().catch(() => { setPlaying(null); setIsPaused(false); });
      audio.onended = () => { setPlaying(null); setIsPaused(false); };
      audio.onpause = () => setIsPaused(true);
      audio.onplay = () => setIsPaused(false);
    }, 100);
  };

  const handleDelete = async (id) => {
    try {
      await deleteVoicemail(id);
      loadVoicemails();
      toast.success("Voicemail deleted");
    } catch (e) { console.error("Failed to delete voicemail", e); }
  };

  const startRecording = async () => {
    if (!selectedRecipient) {
      toast.error("Please select a recipient first");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, {
          type: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
        });
        if (recordingDuration >= 1) {
          await sendVoiceMail(blob);
        }
        setRecordingDuration(0);
        setIsRecording(false);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (e) {
      toast.error("Microphone access denied. Please allow microphone permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordingTimerRef.current);
  };

  const sendVoiceMail = async (blob) => {
    const formData = new FormData();
    formData.append('audio', blob, `voicemail_${Date.now()}.webm`);
    formData.append('callee_id', selectedRecipient.id);
    formData.append('caller_number', localStorage.getItem('extension') || '');
    formData.append('duration', String(recordingDuration));

    try {
      const res = await axios.post(`${CONFIG.API_URL}/protected/voicemail/create`, formData, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      if (res.data.success) {
        toast.success(`Voice mail sent to ${selectedRecipient.username}`);
        setShowSend(false);
        setSelectedRecipient(null);
        loadVoicemails();
      } else {
        toast.error("Failed to send voice mail");
      }
    } catch (e) {
      toast.error("Failed to send voice mail");
    }
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const formatDuration = (seconds) => {
    if (!seconds && seconds !== 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const filteredUsers = users.filter(u =>
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.extension?.includes(searchTerm)
  );

  return (
    <div className={cn("h-full flex flex-col", darkMode ? "text-white" : "text-gray-900")}>
      {/* Header */}
      <div className={cn(
        "flex-shrink-0 border-b",
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      )}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FiVoicemail className="w-5 h-5" />
              <h2 className="font-semibold">Voicemail</h2>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {unreadCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowSend(!showSend)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors",
                showSend
                  ? "bg-blue-500 text-white"
                  : darkMode
                    ? "hover:bg-gray-700 text-gray-300"
                    : "hover:bg-gray-100 text-gray-600"
              )}
            >
              <FiSend className="w-3.5 h-3.5" />
              Send
            </button>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab("voicemail")}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                activeTab === "voicemail"
                  ? "bg-blue-500 text-white"
                  : darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              )}
            >
              Voicemails ({voicemails.length})
            </button>
            <button
              onClick={() => setActiveTab("missed")}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1",
                activeTab === "missed"
                  ? "bg-blue-500 text-white"
                  : darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              )}
            >
              <FiBell className="w-3 h-3" />
              Missed ({missedCalls.length})
            </button>
          </div>
        </div>
      </div>

      {/* Send Voicemail Panel */}
      {showSend && (
        <div className={cn(
          "flex-shrink-0 border-b p-4",
          darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"
        )}>
          <h3 className="text-sm font-semibold mb-3">Send Voice Message</h3>
          {!selectedRecipient ? (
            <>
              <div className="relative mb-3">
                <FiSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search user by name or extension..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn(
                    "w-full pl-9 pr-3 py-2 rounded-lg text-sm border",
                    darkMode
                      ? "bg-gray-700 border-gray-600 text-white"
                      : "bg-white border-gray-200 text-gray-900"
                  )}
                />
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setSelectedRecipient(u); setSearchTerm(""); }}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors",
                      darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
                    )}
                  >
                    <FiUser className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{u.username}</span>
                    <span className="text-xs text-gray-400">{u.extension}</span>
                  </button>
                ))}
                {filteredUsers.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">No users found</p>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                  darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600"
                )}>
                  {selectedRecipient.username?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{selectedRecipient.username}</p>
                  <p className="text-xs text-gray-400">{selectedRecipient.extension}</p>
                </div>
              </div>
              {isRecording ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm text-red-500">{formatDuration(recordingDuration)}</span>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                    title="Stop recording"
                  >
                    <FiSquare className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={startRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                >
                  <FiMic className="w-4 h-4" />
                  Record
                </button>
              )}
              <button
                onClick={() => { setSelectedRecipient(null); setIsRecording(false); clearInterval(recordingTimerRef.current); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Change
              </button>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "voicemail" && (
          <>
            {voicemails.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                <FiVoicemail className="w-12 h-12 mb-2" />
                <p className="text-sm">No voicemails</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {voicemails.map((vm) => (
                  <motion.div
                    key={vm.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-3 rounded-xl flex items-center gap-3 transition-colors",
                      darkMode ? "bg-gray-800 hover:bg-gray-700" : "bg-white hover:bg-gray-50 shadow-sm"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center",
                      darkMode ? "bg-gray-700" : "bg-gray-100"
                    )}>
                      <FiVoicemail className={cn(
                        "w-5 h-5",
                        vm.is_read ? "text-gray-400" : "text-blue-500"
                      )} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <p className={cn(
                          "text-sm truncate",
                          !vm.is_read && "font-semibold"
                        )}>
                          {vm.caller?.username || vm.caller_number || "Unknown"}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs text-gray-400">{formatDuration(vm.duration)}</span>
                          <span className="text-xs text-gray-400">{formatDate(vm.created_at)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Ext: {vm.caller_number || vm.caller?.extension || "Unknown"}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handlePlay(vm)}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          playing === vm.id
                            ? "bg-red-500 text-white"
                            : darkMode
                              ? "hover:bg-gray-600 text-gray-300"
                              : "hover:bg-gray-100 text-gray-600"
                        )}
                        title={playing === vm.id ? (isPaused ? "Resume" : "Pause") : "Play"}
                      >
                        {playing === vm.id && !isPaused ? (
                          <FiPause className="w-4 h-4" />
                        ) : (
                          <FiPlay className={cn("w-4 h-4", playing === vm.id && "animate-pulse")} />
                        )}
                      </button>
                      {!vm.is_read && (
                        <button
                          onClick={async () => {
                            await markVoicemailRead(vm.id);
                            loadVoicemails();
                            loadUnreadCount();
                          }}
                          className={cn(
                            "p-2 rounded-lg transition-colors",
                            darkMode ? "hover:bg-gray-600 text-green-400" : "hover:bg-gray-100 text-green-600"
                          )}
                          title="Mark as read"
                        >
                          <FiCheck className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(vm.id)}
                        className={cn(
                          "p-2 rounded-lg transition-colors",
                          darkMode ? "hover:bg-gray-600 text-red-400" : "hover:bg-gray-100 text-red-600"
                        )}
                        title="Delete"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "missed" && (
          <>
            {missedCalls.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
                <FiBell className="w-12 h-12 mb-2" />
                <p className="text-sm">No missed calls</p>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {missedCalls.map((mc) => (
                  <motion.div
                    key={mc.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "p-3 rounded-xl flex items-center gap-3",
                      darkMode ? "bg-gray-800" : "bg-white shadow-sm"
                    )}
                  >
                    <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                      <FiBell className="w-5 h-5 text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {mc.caller?.username || mc.caller_number || "Unknown"}
                      </p>
                      <p className="text-xs text-gray-400">
                        Ext: {mc.caller_number || mc.caller?.extension || "Unknown"} · {formatDate(mc.created_at)}
                      </p>
                    </div>
                    {!mc.is_notified && (
                      <div className="w-2 h-2 bg-red-500 rounded-full" />
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default VoicemailPage;