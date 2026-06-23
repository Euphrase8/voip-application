import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiSend, FiMessageSquare, FiChevronLeft, FiUsers, FiSearch,
  FiMic, FiSquare, FiPlay, FiPause, FiVolume2, FiCheck, FiClock
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import {
  sendMessage, getMessages, getConversations, getUnreadCount, markAsRead,
  sendVoiceMessage, getVoiceMessageAudioUrl
} from "../services/messages";
import { getUsers } from "../services/users";
import { getWebSocket, sendWebSocketMessage } from "../services/websocketservice";
import { cn } from "../utils/ui";
import toast from "react-hot-toast";

const ChatPage = ({ darkMode, currentUser }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNewChat, setShowNewChat] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [playingVoice, setPlayingVoice] = useState(null);
  const [voiceProgress, setVoiceProgress] = useState({});
  const [typingUser, setTypingUser] = useState(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const audioRef = useRef(null);
  const voiceIntervalRef = useRef(null);

  const currentUserId = localStorage.getItem("user_id");

  const scrollToBottom = useCallback(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  useEffect(() => { loadConversations(); loadUnreadCount(); loadUsers(); }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    const socket = getWebSocket();
    if (!socket) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "chat_message") {
          const msg = data.data;
          if (selectedUser && (String(msg.sender_id) === String(selectedUser.id))) {
            setMessages(prev => [...prev, msg]);
            markAsRead(msg.sender_id);
          } else if (String(msg.sender_id) !== currentUserId) {
            toast.custom((t) => (
              <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5`}>
                <div className="flex-1 w-0 p-3">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {msg.sender?.username || "New Message"}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-300 truncate">{msg.content || "[Voice Message]"}</p>
                </div>
                <div className="flex border-l border-gray-200 dark:border-gray-700">
                  <button onClick={() => { toast.dismiss(t.id); }} className="w-full border border-transparent rounded-none rounded-r-lg p-3 flex items-center justify-center text-sm font-medium text-blue-600 hover:text-blue-500 focus:outline-none">
                    View
                  </button>
                </div>
              </div>
            ), { duration: 4000 });
          }
          loadConversations();
          loadUnreadCount();
        } else if (data.type === "chat_message_sent") {
          const msg = data.data;
          if (selectedUser && (String(msg.receiver_id) === String(selectedUser.id))) {
            setMessages(prev => {
              if (prev.find(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        } else if (data.type === "chat_typing") {
          if (data.data?.is_typing) {
            setTypingUser(data.from);
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 3000);
          } else {
            setTypingUser(null);
          }
        } else if (data.type === "user_status_changed") {
          setUsers(prev => prev.map(u =>
            u.extension === data.extension ? { ...u, status: data.status, is_online: data.is_online } : u
          ));
          setConversations(prev => prev.map(c =>
            c.user.extension === data.extension
              ? { ...c, user: { ...c.user, status: data.status, is_online: data.is_online } }
              : c
          ));
        }
      } catch (e) {}
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [selectedUser, currentUserId]);

  const loadConversations = async () => {
    try {
      const data = await getConversations();
      if (data.success) setConversations(data.conversations);
    } catch (e) { console.error("Failed to load conversations", e); }
  };

  const loadUnreadCount = async () => {
    try {
      const data = await getUnreadCount();
      if (data.success) setUnreadCount(data.unread_count);
    } catch (e) {}
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      if (data.success) setUsers(data.users.filter(u => String(u.id) !== currentUserId));
    } catch (e) {}
  };

  const loadMessages = async (user) => {
    setSelectedUser(user);
    setShowNewChat(false);
    setShowSidebar(false);
    try {
      const data = await getMessages(user.id);
      if (data.success) {
        setMessages(data.messages);
        markAsRead(user.id);
        loadUnreadCount();
      }
    } catch (e) { console.error("Failed to load messages", e); }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedUser) return;
    const content = newMessage.trim();
    setNewMessage("");
    try {
      const data = await sendMessage(selectedUser.id, content);
      if (data.success) {
        setMessages(prev => [...prev, data.message]);
        loadConversations();
      }
    } catch (e) { console.error("Failed to send message", e); }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (recordingDuration >= 1 && selectedUser) {
          try {
            const data = await sendVoiceMessage(selectedUser.id, blob, recordingDuration);
            if (data.success) {
              setMessages(prev => [...prev, data.message]);
              loadConversations();
              toast.success("Voice message sent");
            }
          } catch (e) {
            toast.error("Failed to send voice message");
          }
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

  const handlePlayVoice = (msg) => {
    if (playingVoice === msg.id) {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        clearInterval(voiceIntervalRef.current);
      } else if (audioRef.current) {
        audioRef.current.play();
        voiceIntervalRef.current = setInterval(() => {
          if (audioRef.current) {
            setVoiceProgress(prev => ({ ...prev, [msg.id]: audioRef.current.currentTime }));
          }
        }, 200);
      }
      return;
    }

    setPlayingVoice(msg.id);
    const audio = new Audio(getVoiceMessageAudioUrl(msg.id));
    audioRef.current = audio;

    audio.ontimeupdate = () => {
      setVoiceProgress(prev => ({ ...prev, [msg.id]: audio.currentTime }));
    };

    audio.onended = () => {
      setPlayingVoice(null);
      setVoiceProgress(prev => ({ ...prev, [msg.id]: 0 }));
      clearInterval(voiceIntervalRef.current);
    };

    audio.onpause = () => clearInterval(voiceIntervalRef.current);
    audio.onplay = () => {
      voiceIntervalRef.current = setInterval(() => {
        if (audioRef.current) {
          setVoiceProgress(prev => ({ ...prev, [msg.id]: audioRef.current.currentTime }));
        }
      }, 200);
    };

    audio.play().catch(() => setPlayingVoice(null));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTyping = () => {
    if (selectedUser) {
      clearTimeout(typingTimeoutRef.current);
      sendWebSocketMessage({
        type: "chat_typing",
        to: selectedUser.extension,
        data: { is_typing: true },
      }).catch(() => {});
      typingTimeoutRef.current = setTimeout(() => {
        sendWebSocketMessage({
          type: "chat_typing",
          to: selectedUser.extension,
          data: { is_typing: false },
        }).catch(() => {});
      }, 2000);
    }
  };

  const filteredUsers = users.filter(u =>
    u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.extension?.includes(searchTerm)
  );

  const formatTime = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return formatTime(dateStr);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString();
  };

  const formatDuration = (s) => {
    if (!s) return "0:00";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const renderVoiceProgress = (msg) => {
    const current = voiceProgress[msg.id] || 0;
    const duration = msg.duration || 0;
    const pct = duration > 0 ? (current / duration) * 100 : 0;
    return (
      <div className="w-full h-1 bg-gray-300 dark:bg-gray-600 rounded-full mt-1 overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-200" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    );
  };

  const renderCheckmarks = (msg) => {
    if (!msg.is_read) {
      return <FiCheck className="w-3 h-3" />;
    }
    return (
      <span className="relative">
        <FiCheck className="w-3 h-3" style={{ marginRight: '-4px' }} />
        <FiCheck className="w-3 h-3" style={{ marginLeft: '4px', position: 'absolute', left: 0 }} />
      </span>
    );
  };

  return (
    <div className={cn("flex h-full", darkMode ? "text-white" : "text-gray-900")}>
      {/* Conversations Sidebar */}
      <div className={cn(
        showSidebar || !selectedUser ? "flex" : "hidden md:flex",
        "w-full md:w-72 flex-shrink-0 border-r flex-col",
        darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
      )}>
        <div className={cn(
          "p-3 border-b flex items-center justify-between",
          darkMode ? "border-gray-700" : "border-gray-200"
        )}>
          <h2 className="font-semibold flex items-center gap-2">
            <FiMessageSquare className="w-4 h-4" />
            Messages
          </h2>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {unreadCount}
              </span>
            )}
            <button
              onClick={() => setShowNewChat(true)}
              className={cn(
                "p-1.5 rounded-lg transition-colors",
                darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
              )}
              title="New conversation"
            >
              <FiUsers className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showNewChat ? (
          <div className="flex flex-col flex-1">
            <div className={cn(
              "p-2 border-b",
              darkMode ? "border-gray-700" : "border-gray-200"
            )}>
              <button
                onClick={() => setShowNewChat(false)}
                className="flex items-center gap-1 text-sm text-blue-500 mb-2"
              >
                <FiChevronLeft className="w-4 h-4" /> Back
              </button>
              <div className="relative">
                <FiSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users by name or extension..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={cn(
                    "w-full pl-9 pr-3 py-2 rounded-lg text-sm border",
                    darkMode
                      ? "bg-gray-700 border-gray-600 text-white"
                      : "bg-gray-50 border-gray-200 text-gray-900"
                  )}
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => loadMessages(user)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 text-left transition-colors",
                    darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                  )}
                >
                  <div className="relative">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium",
                      darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {user.username?.charAt(0).toUpperCase()}
                    </div>
                    {user.status === "online" && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{user.username}</p>
                    <p className="text-xs text-gray-400 truncate">Ext: {user.extension}</p>
                  </div>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">No users found</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 p-4">
                <FiMessageSquare className="w-10 h-10 mb-2" />
                <p className="text-sm">No conversations yet</p>
                <button
                  onClick={() => setShowNewChat(true)}
                  className="text-blue-500 text-sm mt-2 hover:underline"
                >
                  Start a new chat
                </button>
              </div>
            ) : (
              conversations.map((conv) => (
                <button
                  key={conv.conversation_id}
                  onClick={() => loadMessages(conv.user)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 text-left transition-colors",
                    selectedUser?.id === conv.user.id
                      ? darkMode ? "bg-gray-700" : "bg-blue-50"
                      : darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"
                  )}
                >
                  <div className="relative">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium",
                      darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600"
                    )}>
                      {conv.user.username?.charAt(0).toUpperCase()}
                    </div>
                    {conv.user.status === "online" && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium truncate">{conv.user.username}</p>
                      <p className="text-xs text-gray-400">{conv.last_message_at ? formatDate(conv.last_message_at) : ""}</p>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{conv.last_message || "No messages yet"}</p>
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0">
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Chat Area - WhatsApp Style */}
      <div className={cn(
        !selectedUser ? "hidden md:flex" : "flex",
        "flex-1 flex-col"
      )}>
        {selectedUser ? (
          <>
            {/* WhatsApp-style Chat Header */}
            <div className={cn(
              "px-4 py-2 border-b flex items-center gap-3",
              darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white",
              "shadow-sm"
            )}>
              <button
                onClick={() => { setSelectedUser(null); setMessages([]); setShowSidebar(true); }}
                className="md:hidden p-1"
              >
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <div className="relative">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium",
                  darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600"
                )}>
                  {selectedUser.username?.charAt(0).toUpperCase()}
                </div>
                {selectedUser.status === "online" && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{selectedUser.username}</p>
                <p className="text-xs text-gray-400">
                  {selectedUser.status === "online" ? "Online" : "Offline"}
                </p>
              </div>
            </div>

            {/* WhatsApp-style Messages Area */}
            <div className={cn(
              "flex-1 overflow-y-auto px-3 py-2",
              darkMode ? "bg-gray-900" : "bg-[#e5ddd5]"
            )}
              style={!darkMode ? { backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4d4d4\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' } : {}}
            >
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => {
                  const isMine = String(msg.sender_id) === String(currentUserId);
                  const showAvatar = !isMine && (idx === 0 || messages[idx - 1]?.sender_id !== msg.sender_id);
                  return (
                    <motion.div
                      key={msg.id || idx}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                      className={cn("flex mb-1", isMine ? "justify-end" : "justify-start")}
                    >
                      <div className={cn("flex items-end gap-1 max-w-[75%]", isMine ? "flex-row-reverse" : "flex-row")}>
                        {showAvatar && (
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 bg-blue-100 text-blue-600">
                            {msg.sender?.username?.charAt(0).toUpperCase() || selectedUser.username?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {!showAvatar && !isMine && <div className="w-7 flex-shrink-0" />}
                        <div className={cn(
                          "px-3 py-1.5 shadow-sm relative",
                          isMine
                            ? "bg-[#dcf8c6] dark:bg-[#056162] text-gray-900 dark:text-white rounded-lg rounded-br-sm"
                            : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg rounded-bl-sm",
                        )}>
                          {msg.msg_type === "voice" ? (
                            <div className="flex flex-col gap-1 min-w-[160px]">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handlePlayVoice(msg)}
                                  className={cn(
                                    "p-1.5 rounded-full transition-colors flex-shrink-0",
                                    playingVoice === msg.id
                                      ? "bg-blue-500 text-white"
                                      : isMine ? "hover:bg-green-300 dark:hover:bg-gray-600" : "hover:bg-gray-200 dark:hover:bg-gray-600"
                                  )}
                                >
                                  {playingVoice === msg.id ? <FiPause className="w-4 h-4" /> : <FiPlay className="w-4 h-4" />}
                                </button>
                                <div className="flex-1">
                                  <div className="flex items-center gap-1">
                                    <FiVolume2 className="w-3 h-3 opacity-70 flex-shrink-0" />
                                    <span className="text-xs">{formatDuration(msg.duration)}</span>
                                  </div>
                                </div>
                              </div>
                              {renderVoiceProgress(msg)}
                              <div className={cn(
                                "flex items-center justify-end gap-1 -mb-1",
                                isMine ? "text-gray-500 dark:text-gray-300" : "text-gray-400 dark:text-gray-400"
                              )}>
                                <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                                {isMine && (
                                  <span className="text-[10px] opacity-70">
                                    {renderCheckmarks(msg)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
                              <div className={cn(
                                "flex items-center justify-end gap-1 -mb-1",
                                isMine ? "text-gray-500 dark:text-gray-300" : "text-gray-400 dark:text-gray-400"
                              )}>
                                <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                                {isMine && (
                                  <span className="text-[10px] opacity-70">
                                    {renderCheckmarks(msg)}
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Typing Indicator */}
              {typingUser && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start mb-1"
                >
                  <div className="bg-white dark:bg-gray-700 px-3 py-2 rounded-lg rounded-bl-sm shadow-sm">
                    <div className="flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* WhatsApp-style Input Area */}
            <div className={cn(
              "px-3 py-2 border-t",
              darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-gray-50"
            )}>
              {isRecording ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1 bg-white dark:bg-gray-700 rounded-xl px-3 py-2">
                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium text-red-500">
                      Recording {formatDuration(recordingDuration)}
                    </span>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="p-2.5 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors"
                    title="Stop recording"
                  >
                    <FiSquare className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={startRecording}
                    className={cn(
                      "p-2.5 rounded-xl transition-colors",
                      darkMode
                        ? "hover:bg-gray-700 text-gray-400 hover:text-white"
                        : "hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                    )}
                    title="Record voice message"
                  >
                    <FiMic className="w-4 h-4" />
                  </button>
                  <div className="flex-1 flex items-center gap-2 bg-white dark:bg-gray-700 rounded-xl px-3 py-1 border dark:border-gray-600">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newMessage}
                      onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent text-sm outline-none py-1.5"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!newMessage.trim()}
                      className="p-1.5 text-blue-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <FiSend className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <FiMessageSquare className="w-16 h-16 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1">Choose a user from the list to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;
