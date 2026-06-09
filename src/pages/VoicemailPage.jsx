import { useState, useEffect, useRef } from "react";
import { FiPlay, FiTrash2, FiCheck, FiBell, FiChevronDown } from "react-icons/fi";
import { Voicemail as FiVoicemail } from 'lucide-react';
import { motion } from "framer-motion";
import { getVoicemails, markVoicemailRead, deleteVoicemail, getVoicemailAudioUrl, getVoicemailUnreadCount, getMissedCalls } from "../services/voicemail";
import { cn } from "../utils/ui";

const VoicemailPage = ({ darkMode }) => {
  const [voicemails, setVoicemails] = useState([]);
  const [missedCalls, setMissedCalls] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [playing, setPlaying] = useState(null);
  const [activeTab, setActiveTab] = useState("voicemail");
  const audioRef = useRef(null);

  useEffect(() => {
    loadVoicemails();
    loadMissedCalls();
    loadUnreadCount();
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

  const handlePlay = async (vm) => {
    if (playing === vm.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }

    setPlaying(vm.id);

    if (!vm.is_read) {
      await markVoicemailRead(vm.id);
      loadVoicemails();
      loadUnreadCount();
    }

    setTimeout(() => {
      const audio = new Audio(getVoicemailAudioUrl(vm.id));
      audioRef.current = audio;
      audio.play().catch(() => setPlaying(null));
      audio.onended = () => setPlaying(null);
    }, 100);
  };

  const handleDelete = async (id) => {
    try {
      await deleteVoicemail(id);
      loadVoicemails();
    } catch (e) { console.error("Failed to delete voicemail", e); }
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
    if (!seconds) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

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
          </div>

          {/* Tabs */}
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
                        title={playing === vm.id ? "Stop" : "Play"}
                      >
                        <FiPlay className={cn("w-4 h-4", playing === vm.id && "animate-pulse")} />
                      </button>
                      {!vm.is_read && (
                        <button
                          onClick={async () => {
                            await markVoicemailRead(vm.id);
                            loadVoicemails();
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
