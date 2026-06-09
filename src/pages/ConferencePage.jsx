import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FiPlus, FiUsers, FiLogIn, FiX, FiCopy, FiCheck } from "react-icons/fi";
import { Users, Phone as PhoneIcon } from "lucide-react";
import axios from "axios";
import { CONFIG } from "../services/config";
import { getToken } from "../services/login";
import { cn } from "../utils/ui";

const API_URL = CONFIG.API_URL;
const authHeaders = () => ({ headers: { Authorization: `Bearer ${getToken()}` } });

const ConferencePage = ({ darkMode, onStartCall }) => {
  const [conferences, setConferences] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [joinRoom, setJoinRoom] = useState("");
  const [copied, setCopied] = useState(null);

  useEffect(() => { loadConferences(); }, []);

  const loadConferences = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/protected/conference/list`, authHeaders());
      if (data.success) setConferences(data.conferences);
    } catch (e) { console.error("Failed to load conferences", e); }
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const { data } = await axios.post(`${API_URL}/protected/conference/create`, { name: newName }, authHeaders());
      if (data.success) {
        setConferences(prev => [data.conference, ...prev]);
        setNewName("");
        setShowCreate(false);
      }
    } catch (e) { console.error("Failed to create conference", e); }
  };

  const handleJoin = async (roomNum) => {
    try {
      const { data } = await axios.post(`${API_URL}/protected/conference/join`, { room_num: roomNum }, authHeaders());
      if (data.success && onStartCall) {
        onStartCall({ extension: roomNum, name: `Conference ${roomNum}`, channel: data.channel, isConference: true });
      }
    } catch (e) { console.error("Failed to join conference", e); }
  };

  const copyRoom = (roomNum) => {
    navigator.clipboard.writeText(roomNum);
    setCopied(roomNum);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className={cn("h-full flex flex-col", darkMode ? "text-white" : "text-gray-900")}>
      <div className={cn(
        "flex-shrink-0 border-b p-4",
        darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      )}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            <h2 className="font-semibold">Conferences</h2>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-600"
          >
            <FiPlus className="w-4 h-4" /> New Room
          </button>
        </div>
        {showCreate && (
          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Conference name..."
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className={cn(
                "flex-1 px-3 py-1.5 rounded-lg text-sm border outline-none",
                darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"
              )}
            />
            <button onClick={handleCreate} className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-600">
              Create
            </button>
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            value={joinRoom}
            onChange={(e) => setJoinRoom(e.target.value)}
            placeholder="Enter room number to join..."
            onKeyDown={(e) => e.key === "Enter" && handleJoin(joinRoom)}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-lg text-sm border outline-none",
              darkMode ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-200"
            )}
          />
          <button onClick={() => handleJoin(joinRoom)} className="flex items-center gap-1 bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-600">
            <FiLogIn className="w-4 h-4" /> Join
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {conferences.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Users className="w-12 h-12 mb-2" />
            <p className="text-sm">No active conferences</p>
            <p className="text-xs mt-1">Create a room to get started</p>
          </div>
        ) : (
          conferences.map((conf) => (
            <motion.div
              key={conf.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-4 rounded-xl",
                darkMode ? "bg-gray-800" : "bg-white shadow-sm"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium">{conf.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      darkMode ? "bg-green-900/30 text-green-400" : "bg-green-100 text-green-700"
                    )}>Active</span>
                    <span className="text-xs text-gray-400">
                      Room: {conf.room_num}
                    </span>
                    <button
                      onClick={() => copyRoom(conf.room_num)}
                      className="text-xs text-gray-400 hover:text-blue-500"
                      title="Copy room number"
                    >
                      {copied === conf.room_num ? <FiCheck className="w-3 h-3 text-green-500" /> : <FiCopy className="w-3 h-3" />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Created by {conf.creator?.username || "Unknown"} · {new Date(conf.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleJoin(conf.room_num)}
                  className="flex items-center gap-1 bg-green-500 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-600 ml-2"
                >
                  <PhoneIcon className="w-4 h-4" /> Join
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default ConferencePage;
