import { useState, useEffect, useRef } from "react";
import {
  FiPlay, FiPause, FiTrash2, FiCheck, FiMic, FiSquare,
  FiSend, FiUser, FiSearch, FiDownload, FiSkipBack, FiSkipForward,
  FiFilter, FiArrowUp, FiArrowDown, FiRefreshCw, FiMail,
  FiX, FiInbox, FiClock
} from "react-icons/fi";
import { Voicemail as VoicemailIcon } from 'lucide-react';
import { motion } from "framer-motion";
import {
  getVoicemails, getSentVoicemails, markVoicemailRead, markVoicemailUnread,
  deleteVoicemail, getVoicemailAudioUrl, getVoicemailDownloadUrl,
  getVoicemailUnreadCount, incrementPlaybackCount, createVoicemail
} from "../services/voicemail";
import { getUsers } from "../services/users";
import { cn } from "../utils/ui";
import toast from "react-hot-toast";
import { getWebSocket } from "../services/websocketservice";

const TABS = { INBOX: "inbox", SENT: "sent" };

const VoicemailPage = ({ darkMode, preselectedContact }) => {
  const [voicemails, setVoicemails] = useState([]);
  const [filteredVms, setFilteredVms] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [playing, setPlaying] = useState(null);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showSend, setShowSend] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordingPreviewUrl, setRecordingPreviewUrl] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedRecipient, setSelectedRecipient] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterSender, setFilterSender] = useState("");
  const [filterDate, setFilterDate] = useState("all");
  const [sortOrder, setSortOrder] = useState("desc");
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(TABS.INBOX);

  const audioRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const currentUserId = localStorage.getItem("user_id");
  const progressRef = useRef(null);
  const previewAudioRef = useRef(null);
  const preselectedHandledRef = useRef(null);

  // If a preselected contact is provided, auto-show the send panel (only once per contact)
  useEffect(() => {
    if (preselectedContact && preselectedContact !== preselectedHandledRef.current) {
      preselectedHandledRef.current = preselectedContact;
      setSelectedRecipient(preselectedContact);
      setShowSend(true);
      setActiveTab(TABS.INBOX);
    }
  }, [preselectedContact]);

  useEffect(() => {
    loadVoicemails();
    loadUnreadCount();
    loadUsers();
    const socket = getWebSocket();
    const handler = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "voicemail_new") {
          loadVoicemails();
          loadUnreadCount();
          const vm = data.data;
          toast.success(`Voicemail from ${vm.sender_name || vm.caller?.username || "Unknown"}`, { duration: 4000 });
        } else if (data.type === "voicemail_sent") {
          if (activeTab === TABS.SENT) loadVoicemails();
        }
      } catch (e) {}
    };
    if (socket) socket.addEventListener("message", handler);
    const interval = setInterval(() => { loadUnreadCount(); }, 10000);
    return () => {
      if (socket) socket.removeEventListener("message", handler);
      clearInterval(interval);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    filterAndSort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voicemails, searchTerm, filterSender, filterDate, sortOrder, activeTab]);

  const loadVoicemails = async () => {
    try {
      setIsLoading(true);
      const data = activeTab === TABS.INBOX ? await getVoicemails() : await getSentVoicemails();
      if (data.success) {
        setVoicemails(data.voicemails || []);
      }
    } catch (e) {
      console.error("Failed to load voicemails", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadVoicemails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadUnreadCount = async () => {
    try {
      const data = await getVoicemailUnreadCount();
      if (data.success) setUnreadCount(data.unread_count || 0);
    } catch (e) {}
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      if (data.success) setUsers((data.users || []).filter(u => String(u.id) !== currentUserId));
    } catch (e) {}
  };

  const filterAndSort = () => {
    let filtered = [...voicemails];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(vm =>
        (vm.sender_name || vm.caller?.username || vm.callee?.username || "").toLowerCase().includes(term) ||
        (vm.recipient_name || "").toLowerCase().includes(term) ||
        (vm.sender_extension || vm.caller_number || vm.caller?.extension || vm.callee?.extension || "").includes(term)
      );
    }
    if (filterSender) {
      filtered = filtered.filter(vm =>
        (vm.sender_name || vm.caller?.username || "").toLowerCase().includes(filterSender.toLowerCase())
      );
    }
    const now = new Date();
    if (filterDate === "today") {
      filtered = filtered.filter(vm => new Date(vm.created_at).toDateString() === now.toDateString());
    } else if (filterDate === "week") {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(vm => new Date(vm.created_at) >= weekAgo);
    } else if (filterDate === "month") {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(vm => new Date(vm.created_at) >= monthAgo);
    }
    filtered.sort((a, b) => {
      const da = new Date(a.created_at).getTime();
      const db = new Date(b.created_at).getTime();
      return sortOrder === "desc" ? db - da : da - db;
    });
    setFilteredVms(filtered);
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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(vm.id);
    setIsPaused(false);
    setCurrentTime(0);
    setDuration(0);
    if (!vm.is_read && activeTab === TABS.INBOX) {
      await markVoicemailRead(vm.id);
      loadVoicemails();
      loadUnreadCount();
    }
    await incrementPlaybackCount(vm.id);
    const audio = new Audio(getVoicemailAudioUrl(vm.id));
    audioRef.current = audio;
    audio.addEventListener("loadedmetadata", () => { setDuration(audio.duration); });
    audio.addEventListener("timeupdate", () => { setCurrentTime(audio.currentTime); });
    audio.play().catch(() => { setPlaying(null); setIsPaused(false); });
    audio.onended = () => { setPlaying(null); setIsPaused(false); setCurrentTime(0); };
    audio.onpause = () => setIsPaused(true);
    audio.onplay = () => setIsPaused(false);
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const seekTime = pos * duration;
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  const handleSeekForward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 10, duration);
    }
  };

  const handleSeekBackward = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 10, 0);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this voicemail?")) return;
    try {
      await deleteVoicemail(id);
      setVoicemails(prev => prev.filter(v => v.id !== id));
      loadUnreadCount();
      toast.success("Voicemail deleted");
      if (playing === id) {
        setPlaying(null);
        setIsPaused(false);
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      }
    } catch (e) { toast.error("Failed to delete voicemail"); }
  };

  const handleMarkRead = async (id) => {
    await markVoicemailRead(id);
    setVoicemails(prev => prev.map(v => v.id === id ? { ...v, is_read: true } : v));
    loadUnreadCount();
  };

  const handleMarkUnread = async (id) => {
    await markVoicemailUnread(id);
    setVoicemails(prev => prev.map(v => v.id === id ? { ...v, is_read: false } : v));
    loadUnreadCount();
  };

  const handleDownload = (id) => {
    window.open(getVoicemailDownloadUrl(id), "_blank");
  };

  const handleSelectRecipient = (u) => {
    setSelectedRecipient(u);
    setSearchTerm("");
    setRecordedBlob(null);
    setRecordingPreviewUrl(null);
    setRecordingDuration(0);
  };

  const startRecording = async () => {
    if (!selectedRecipient) { toast.error("Select a recipient first"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setRecordedBlob(null);
      setRecordingPreviewUrl(null);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setRecordingPreviewUrl(URL.createObjectURL(blob));
        if (recordingDuration < 1) {
          setRecordingDuration(0);
        }
        setIsRecording(false);
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (e) { toast.error("Microphone access denied"); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordingTimerRef.current);
  };

  const playPreview = () => {
    if (!recordingPreviewUrl) return;
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    const audio = new Audio(recordingPreviewUrl);
    previewAudioRef.current = audio;
    audio.play().catch(() => {});
  };

  const reRecord = () => {
    setRecordedBlob(null);
    setRecordingPreviewUrl(null);
    setRecordingDuration(0);
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    startRecording();
  };

  const sendVoiceMail = async () => {
    if (!recordedBlob || !selectedRecipient) { toast.error("Record a message first"); return; }
    const formData = new FormData();
    formData.append('audio', recordedBlob, `voicemail_${Date.now()}.webm`);
    formData.append('callee_id', selectedRecipient.id);
    formData.append('caller_number', localStorage.getItem('extension') || '');
    formData.append('sender_extension', localStorage.getItem('extension') || '');
    formData.append('sender_name', localStorage.getItem('username') || '');
    formData.append('duration', String(recordingDuration));
    formData.append('recipient_name', selectedRecipient.username);
    formData.append('recipient_extension', selectedRecipient.extension);
    formData.append('caller_id', currentUserId);
    try {
      const res = await createVoicemail(formData);
      if (res.success) {
        toast.success(`Voicemail sent to ${selectedRecipient.username}`);
        setShowSend(false);
        setSelectedRecipient(null);
        setRecordedBlob(null);
        setRecordingPreviewUrl(null);
        loadVoicemails();
        loadUnreadCount();
      } else {
        toast.error(res.error || "Failed to send voicemail");
      }
    } catch (e) { toast.error("Failed to send voicemail"); }
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
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const formatTimeDetailed = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const getAvatarText = (vm) => {
    const name = activeTab === TABS.INBOX
      ? (vm.sender_name || vm.caller?.username || vm.caller_number || "?")
      : (vm.recipient_name || vm.callee?.username || "?");
    return name.charAt(0).toUpperCase();
  };

  const getCallerDisplay = (vm) => {
    if (activeTab === TABS.INBOX) {
      return vm.sender_name || vm.caller?.username || vm.caller_number || "Unknown";
    }
    return vm.recipient_name || vm.callee?.username || vm.recipient_extension || "Unknown";
  };

  const getExtDisplay = (vm) => {
    if (activeTab === TABS.INBOX) {
      return vm.sender_extension || vm.caller_number || vm.caller?.extension || "-";
    }
    return vm.recipient_extension || vm.callee?.extension || "-";
  };

  const filteredUsers = users.filter(u =>
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.extension?.includes(searchTerm)
  );

  return (
    <div className={cn("h-full flex flex-col", darkMode ? "text-white" : "text-gray-900")}>
      {/* Header */}
      <div className={cn("flex-shrink-0 border-b", darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FiMail className="w-5 h-5" />
              <h2 className="font-semibold">Voicemail</h2>
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 font-medium">{unreadCount}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadVoicemails} className={cn("p-2 rounded-lg transition-colors", darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100")} title="Refresh">
                <FiRefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => setShowSend(!showSend)} className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors", showSend ? "bg-blue-500 text-white" : darkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-600")}>
                <FiSend className="w-3.5 h-3.5" />
                Send
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-3 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button onClick={() => setActiveTab(TABS.INBOX)} className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all flex-1 justify-center", activeTab === TABS.INBOX ? "bg-white dark:bg-gray-600 shadow-sm font-medium" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200")}>
              <FiInbox className="w-4 h-4" />
              Inbox
              {unreadCount > 0 && <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{unreadCount}</span>}
            </button>
            <button onClick={() => setActiveTab(TABS.SENT)} className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all flex-1 justify-center", activeTab === TABS.SENT ? "bg-white dark:bg-gray-600 shadow-sm font-medium" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200")}>
              <FiClock className="w-4 h-4" />
              Sent
            </button>
          </div>

          {/* Search bar */}
          <div className="relative mb-2">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder={activeTab === TABS.INBOX ? "Search by name or extension..." : "Search by recipient..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={cn("w-full pl-9 pr-4 py-2 rounded-lg text-sm border outline-none", darkMode ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : "bg-gray-50 border-gray-200 text-gray-900")} />
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters(!showFilters)} className={cn("flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg transition-colors", showFilters ? "bg-blue-500 text-white" : darkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-600")}>
              <FiFilter className="w-3 h-3" /> Filters
            </button>
            <select value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className={cn("px-2 py-1.5 text-xs rounded-lg border outline-none", darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200")}>
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
            <button onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")} className={cn("flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg", darkMode ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-100 text-gray-600")} title={`Sort ${sortOrder === "desc" ? "oldest first" : "newest first"}`}>
              {sortOrder === "desc" ? <FiArrowDown className="w-3 h-3" /> : <FiArrowUp className="w-3 h-3" />}
              {sortOrder === "desc" ? "Newest" : "Oldest"}
            </button>
            {filterSender && <button onClick={() => setFilterSender("")} className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500/20 text-red-500 rounded-lg"><FiX className="w-3 h-3" />{filterSender}</button>}
          </div>
        </div>
      </div>

      {/* Send Voicemail Panel */}
      {showSend && (
        <div className={cn("flex-shrink-0 border-b p-4", darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50")}>
          <h3 className="text-sm font-semibold mb-3">Send Voice Message</h3>
          {!selectedRecipient ? (
            <>
              <div className="relative mb-3">
                <FiSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input type="text" placeholder="Search user by name or extension..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={cn("w-full pl-9 pr-3 py-2 rounded-lg text-sm border", darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-200")} />
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {filteredUsers.map((u) => (
                  <button key={u.id} onClick={() => handleSelectRecipient(u)} className={cn("w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm transition-colors", darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200")}>
                    <FiUser className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{u.username}</span>
                    <span className="text-xs text-gray-400">{u.extension}</span>
                  </button>
                ))}
                {filteredUsers.length === 0 && <p className="text-xs text-gray-400 text-center py-2">No users found</p>}
              </div>
            </>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium", darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600")}>
                    {selectedRecipient.username?.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{selectedRecipient.username}</p>
                    <p className="text-xs text-gray-400">{selectedRecipient.extension}</p>
                  </div>
                </div>
                <button onClick={() => { setSelectedRecipient(null); setRecordedBlob(null); setRecordingPreviewUrl(null); clearInterval(recordingTimerRef.current); setIsRecording(false); }} className="text-xs text-gray-400 hover:text-gray-600">Change</button>
              </div>

              {isRecording ? (
                <div className="flex items-center justify-center gap-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm text-red-500 font-medium">{formatDuration(recordingDuration)}</span>
                  </div>
                  <button onClick={stopRecording} className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"><FiSquare className="w-4 h-4" /></button>
                </div>
              ) : recordedBlob ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3">
                    <button onClick={playPreview} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"><FiPlay className="w-4 h-4" /> Playback</button>
                    <button onClick={reRecord} className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm"><FiMic className="w-4 h-4" /> Re-record</button>
                    <button onClick={() => { setRecordedBlob(null); setRecordingPreviewUrl(null); }} className="p-1.5 text-gray-400 hover:text-gray-600"><FiTrash2 className="w-4 h-4" /></button>
                  </div>
                  <div className="flex justify-center">
                    <button onClick={sendVoiceMail} className="flex items-center gap-1.5 px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"><FiSend className="w-4 h-4" /> Send Voicemail</button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <button onClick={startRecording} className="flex items-center gap-1.5 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"><FiMic className="w-4 h-4" /> Start Recording</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
            <FiRefreshCw className="w-8 h-8 mb-2 animate-spin" />
            <p className="text-sm">Loading voicemails...</p>
          </div>
        ) : filteredVms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
            <VoicemailIcon className="w-12 h-12 mb-2" />
            <p className="text-sm">{activeTab === TABS.INBOX ? "No voicemails in inbox" : "No sent voicemails"}</p>
            {(searchTerm || filterSender || filterDate !== "all") && (
              <button onClick={() => { setSearchTerm(""); setFilterSender(""); setFilterDate("all"); }} className="text-blue-500 text-xs mt-2 hover:underline">Clear filters</button>
            )}
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {filteredVms.map((vm) => (
              <motion.div key={vm.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={cn("p-3 rounded-xl transition-colors", darkMode ? "bg-gray-800 hover:bg-gray-700" : "bg-white hover:bg-gray-50 shadow-sm", playing === vm.id && (darkMode ? "ring-2 ring-blue-500" : "ring-2 ring-blue-400"))}>
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0", vm.is_read ? (darkMode ? "bg-gray-600 text-gray-300" : "bg-gray-200 text-gray-500") : "bg-blue-500 text-white")}>
                    {getAvatarText(vm)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn("text-sm truncate", !vm.is_read && "font-semibold")}>{getCallerDisplay(vm)}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!vm.is_read && activeTab === TABS.INBOX && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                        <span className="text-xs text-gray-400">{formatDuration(vm.duration)}</span>
                        <span className="text-xs text-gray-400">{formatDate(vm.created_at)}</span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {activeTab === TABS.INBOX ? "Ext: " : "To: "}{getExtDisplay(vm)}
                    </p>
                    {playing === vm.id && (
                      <div className="mt-2">
                        <div ref={progressRef} onClick={handleSeek} className={cn("h-1.5 rounded-full cursor-pointer relative", darkMode ? "bg-gray-600" : "bg-gray-200")}>
                          <div className="h-full rounded-full bg-blue-500" style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-400">{formatTimeDetailed(currentTime)}</span>
                          <span className="text-xs text-gray-400">{formatTimeDetailed(duration)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <button onClick={handleSeekBackward} className="p-1 rounded hover:bg-gray-600/30" title="-10s"><FiSkipBack className="w-3 h-3" /></button>
                          <button onClick={handleSeekForward} className="p-1 rounded hover:bg-gray-600/30" title="+10s"><FiSkipForward className="w-3 h-3" /></button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handlePlay(vm)} className={cn("p-2 rounded-lg transition-colors", playing === vm.id ? "bg-red-500 text-white" : darkMode ? "hover:bg-gray-600 text-gray-300" : "hover:bg-gray-100 text-gray-600")} title={playing === vm.id ? (isPaused ? "Resume" : "Pause") : "Play"}>
                      {playing === vm.id && !isPaused ? <FiPause className="w-4 h-4" /> : <FiPlay className="w-4 h-4" />}
                    </button>
                    {activeTab === TABS.INBOX && (vm.is_read ? (
                      <button onClick={() => handleMarkUnread(vm.id)} className={cn("p-2 rounded-lg transition-colors", darkMode ? "hover:bg-gray-600 text-yellow-400" : "hover:bg-gray-100 text-yellow-600")} title="Mark as unread"><FiMail className="w-4 h-4" /></button>
                    ) : (
                      <button onClick={() => handleMarkRead(vm.id)} className={cn("p-2 rounded-lg transition-colors", darkMode ? "hover:bg-gray-600 text-green-400" : "hover:bg-gray-100 text-green-600")} title="Mark as read"><FiCheck className="w-4 h-4" /></button>
                    ))}
                    <button onClick={() => handleDownload(vm.id)} className={cn("p-2 rounded-lg transition-colors", darkMode ? "hover:bg-gray-600 text-blue-400" : "hover:bg-gray-100 text-blue-600")} title="Download"><FiDownload className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(vm.id)} className={cn("p-2 rounded-lg transition-colors", darkMode ? "hover:bg-gray-600 text-red-400" : "hover:bg-gray-100 text-red-600")} title="Delete"><FiTrash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoicemailPage;