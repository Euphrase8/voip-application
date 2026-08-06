import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FiPhoneOff, FiVideo, FiSearch, FiUsers } from "react-icons/fi";
import { cn } from "../utils/ui";
import { getUsers } from "../services/users";
import { getInitials, getAvatarColor } from "../utils/ui";
import videoCallService from "../services/videoCallService";
import { startRingback, stopRinging } from "../utils/ringtone";
import toast from "react-hot-toast";

const VideoCallList = ({ darkMode, user, onStartCall, calling }) => {
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
        setContacts(data.users.filter((u) => String(u.id) !== currentUserId));
      }
    } catch (e) {
      console.error("Failed to load contacts", e);
    }
  };

  const filteredContacts = contacts.filter(
    (c) =>
      !searchTerm ||
      c.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.extension?.includes(searchTerm)
  );

  return (
    <div className="h-full flex flex-col">
      <div
        className={cn(
          "p-4 border-b flex-shrink-0",
          darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
        )}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <FiVideo className="w-5 h-5" />
            Video Calls
          </h2>
          <span
            className={cn(
              "text-xs px-2 py-1 rounded-full",
              darkMode ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"
            )}
          >
            {filteredContacts.length} contact{filteredContacts.length !== 1 ? "s" : ""}
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
                  <div
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white",
                      getAvatarColor(contact.username || contact.extension)
                    )}
                  >
                    {getInitials(contact.username || contact.extension)}
                  </div>
                  {contact.status === "online" && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{contact.username}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className={cn(
                        "text-xs",
                        contact.status === "online" ? "text-green-500" : "text-gray-400"
                      )}
                    >
                      {contact.status === "online" ? "Online" : "Offline"}
                    </span>
                    <span className="text-xs text-gray-400">Ext: {contact.extension}</span>
                  </div>
                </div>
                <button
                  onClick={() => onStartCall(contact)}
                  disabled={calling}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0",
                    "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
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

const OutgoingCallPanel = ({ darkMode, snapshot, onCancel }) => {
  const { call, state } = snapshot;
  const name = call?.peerName || "Unknown";
  const ext = call?.peerExtension || "";

  return (
    <div className="h-full flex flex-col items-center justify-center bg-black p-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-blue-900/40 via-black to-black pointer-events-none" />
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 text-center"
      >
        <div className="relative mx-auto w-28 h-28 mb-8">
          <div
            className={cn(
              "w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold text-white shadow-2xl",
              getAvatarColor(name)
            )}
          >
            {getInitials(name)}
          </div>
          <div className="absolute inset-0 rounded-full border-2 border-blue-400/50 animate-ping" />
        </div>

        <h2 className="text-2xl font-bold text-white mb-1">{name}</h2>
        <p className="text-gray-300 text-sm mb-8">Extension: {ext}</p>

        <div className="flex items-center justify-center gap-2 mb-10">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-gray-300 text-sm">
            {state === "ringing" ? "Ringing..." : "Calling..."}
          </span>
        </div>

        <button
          onClick={onCancel}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition-all shadow-lg hover:shadow-red-500/40"
        >
          <FiPhoneOff className="w-5 h-5" />
          Cancel
        </button>
      </motion.div>
    </div>
  );
};

const VideoCallPage = ({ darkMode, user }) => {
  const [snapshot, setSnapshot] = useState(videoCallService.getSnapshot());
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    return videoCallService.subscribe(setSnapshot);
  }, []);

  // Outgoing ringback while calling/ringing; stop otherwise.
  const outgoingActive = snapshot.direction === "outgoing" &&
    (snapshot.state === "calling" || snapshot.state === "ringing");

  useEffect(() => {
    if (outgoingActive) {
      startRingback();
      return () => stopRinging();
    }
    stopRinging();
  }, [outgoingActive]);

  // Cancel any in-flight call when leaving the page.
  useEffect(() => {
    return () => {
      if (videoCallService.direction === "outgoing" &&
          (videoCallService.state === "calling" || videoCallService.state === "ringing")) {
        videoCallService.cancelCall("cancelled");
      }
    };
  }, []);

  const handleStartCall = async (contact) => {
    if (starting) return;
    setStarting(true);
    try {
      await videoCallService.startCall(contact);
    } catch (err) {
      toast.error(err.message || "Failed to start the call");
    } finally {
      setStarting(false);
    }
  };

  if (outgoingActive) {
    return (
      <OutgoingCallPanel
        darkMode={darkMode}
        snapshot={snapshot}
        onCancel={() => videoCallService.cancelCall("cancelled")}
      />
    );
  }

  return (
    <VideoCallList
      darkMode={darkMode}
      user={user}
      calling={starting}
      onStartCall={handleStartCall}
    />
  );
};

export default VideoCallPage;
