import { useState, useEffect, useRef, useCallback } from "react";
import { FiSend, FiChevronLeft, FiSearch, FiCheck, FiClock } from "react-icons/fi";
import { getMessages, getConversations, getUnreadCount, markAsRead } from "../services/messages";
import { getUsers } from "../services/users";
import { addMessageListener } from "../services/websocketservice";

const ChatPage = ({ darkMode, currentUser }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const currentUserId = localStorage.getItem("user_id");

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }));
  }, []);

  useEffect(() => {
    loadConversations();
    loadUnreadCount();
    fetchOnlineUsers();
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    const listener = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "chat_message") {
          const msg = data.data;
          if (selectedUser && String(msg.sender_id) === String(selectedUser.id)) {
            setMessages(prev => {
              if (prev.find(m => String(m.id) === String(msg.id))) return prev;
              return [...prev, msg];
            });
            markAsRead(msg.sender_id);
          }
          loadConversations();
          loadUnreadCount();
        } else if (data.type === "chat_message_sent") {
          const msg = data.data;
          if (selectedUser && String(msg.receiver_id) === String(selectedUser.id)) {
            setMessages(prev => {
              if (prev.find(m => String(m.id) === String(msg.id))) return prev;
              return [...prev, msg];
            });
          }
          loadConversations();
        } else if (data.type === "user_status_changed") {
          if (data.status === "online") {
            setOnlineUsers(prev => new Set(prev).add(data.from));
          } else {
            setOnlineUsers(prev => {
              const next = new Set(prev);
              next.delete(data.from);
              return next;
            });
          }
        }
      } catch (e) {}
    };
    const unsubscribe = addMessageListener(listener);
    return () => unsubscribe();
  }, [selectedUser, currentUserId]);

  const fetchOnlineUsers = async () => {
    try {
      const data = await getUsers();
      if (data.success) {
        const online = new Set(data.users.filter(u => u.status === "online").map(u => u.extension));
        setOnlineUsers(online);
      }
    } catch (e) {}
  };

  const loadConversations = async () => {
    try {
      const data = await getConversations();
      if (data.success) {
        const sorted = (data.conversations || []).sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return bTime - aTime;
        });
        setConversations(sorted);
      }
    } catch (e) {}
  };

  const loadUnreadCount = async () => {
    try {
      await getUnreadCount();
    } catch (e) {}
  };

  const loadMessages = async (user) => {
    setSelectedUser(user);
    setShowSidebar(false);
    try {
      const data = await getMessages(user.id);
      if (data.success) {
        setMessages(data.messages || []);
        markAsRead(user.id);
        loadConversations();
        loadUnreadCount();
      }
    } catch (e) {}
  };

  const handleSend = async () => {
    if (!newMessage.trim() || !selectedUser) return;
    const content = newMessage.trim();
    setNewMessage("");
    try {
      const { sendMessage } = await import("../services/messages");
      const data = await sendMessage(selectedUser.id, content);
      if (data.success) {
        setMessages(prev => {
          if (prev.find(m => String(m.id) === String(data.message?.id))) return prev;
          return [...prev, data.message];
        });
        loadConversations();
      }
    } catch (e) {}
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const filteredConversations = conversations.filter(c =>
    !searchTerm ||
    c.user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.user.extension?.includes(searchTerm)
  );

  const formatTime = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const formatMessageTime = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getInitials = (name) => (name || "?").charAt(0).toUpperCase();

  const getAvatarColor = (name) => {
    const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500"];
    let hash = 0;
    for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };

  const isUserOnline = (extension) => onlineUsers.has(extension);

  return (
    <div className="flex h-full" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Left Panel - Conversations */}
      <div className={`${showSidebar || !selectedUser ? "flex" : "hidden md:flex"} w-full md:w-96 flex-shrink-0 border-r flex-col ${darkMode ? "border-gray-700 bg-gray-900" : "border-gray-200 bg-white"}`}>
        {/* Header */}
        <div className={`px-4 py-3 border-b ${darkMode ? "border-gray-700 bg-gray-850" : "border-gray-200 bg-gray-50"}`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Chats</h2>
            <span className="text-xs text-gray-400">{conversations.length} conversations</span>
          </div>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search or start a new chat..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none ${darkMode ? "bg-gray-800 text-white placeholder-gray-500 border border-gray-700" : "bg-gray-100 text-gray-900 border border-gray-200"}`}
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                <FiSearch className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs mt-1 text-center">Search for a user to start a new conversation</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const convUser = conv.user;
              const isSelected = selectedUser?.id === convUser.id;
              const online = isUserOnline(convUser.extension);
              return (
                <button
                  key={conv.conversation_id || convUser.id}
                  onClick={() => loadMessages(convUser)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b ${darkMode ? "border-gray-800" : "border-gray-100"} ${
                    isSelected
                      ? darkMode ? "bg-gray-700" : "bg-blue-50"
                      : darkMode ? "hover:bg-gray-800" : "hover:bg-gray-50"
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(convUser.username)}`}>
                      {getInitials(convUser.username)}
                    </div>
                    {online && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-900" />
                    )}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{convUser.username}</p>
                      <p className="text-[11px] text-gray-400 flex-shrink-0 ml-2">{conv.last_message_at ? formatTime(conv.last_message_at) : ""}</p>
                    </div>
                    <p className="text-[11px] text-gray-400">Ext: {convUser.extension}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <p className={`text-xs truncate ${conv.last_message ? (darkMode ? "text-gray-400" : "text-gray-500") : "text-gray-400 italic"}`}>
                        {conv.last_message || "No messages yet"}
                      </p>
                    </div>
                  </div>
                  {/* Unread Badge */}
                  {conv.unread_count > 0 && (
                    <div className="flex-shrink-0">
                      <span className="bg-green-500 text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5">
                        {conv.unread_count > 99 ? '99+' : conv.unread_count}
                      </span>
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - Chat Area */}
      <div className={`${!selectedUser ? "hidden md:flex" : "flex"} flex-1 flex-col`}>
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className={`px-4 py-2.5 border-b flex items-center gap-3 ${darkMode ? "border-gray-700 bg-gray-850" : "border-gray-200 bg-gray-50"} shadow-sm`}>
              <button onClick={() => { setSelectedUser(null); setMessages([]); setShowSidebar(true); }} className="md:hidden p-1">
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <div className="relative flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(selectedUser.username)}`}>
                  {getInitials(selectedUser.username)}
                </div>
                {isUserOnline(selectedUser.extension) && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{selectedUser.username}</p>
                <p className="text-[11px] text-gray-400">
                  {isUserOnline(selectedUser.extension) ? "Online" : "Offline"} · Ext: {selectedUser.extension}
                </p>
              </div>
            </div>

            {/* Messages Area - WhatsApp style */}
            <div className={`flex-1 overflow-y-auto px-4 py-3 ${darkMode ? "bg-gray-900" : "bg-[#efeae2]"}`}>
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-sm text-gray-400">No messages yet</p>
                    <p className="text-xs text-gray-400 mt-1">Send a message to start the conversation</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {messages.map((msg, idx) => {
                    const isMine = String(msg.sender_id) === String(currentUserId);
                    const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx - 1]?.created_at).toDateString();
                    return (
                      <div key={msg.id || idx}>
                        {showDate && (
                          <div className="flex justify-center my-2">
                            <span className={`text-[11px] px-2 py-0.5 rounded ${darkMode ? "bg-gray-800 text-gray-400" : "bg-white/80 text-gray-500 shadow-sm"}`}>
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-0.5`}>
                          <div className={`max-w-[70%] px-3 py-1.5 shadow-sm relative text-sm leading-relaxed ${
                            isMine
                              ? "bg-[#d9fdd3] dark:bg-[#005c4b] text-gray-900 dark:text-white rounded-lg rounded-br-sm"
                              : "bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg rounded-bl-sm"
                          }`}>
                            <p className="whitespace-pre-wrap break-words pr-12">{msg.content}</p>
                            <div className={`absolute bottom-0.5 right-1.5 flex items-center gap-0.5 ${isMine ? "text-gray-500 dark:text-gray-300" : "text-gray-400"}`}>
                              <span className="text-[10px]">{formatMessageTime(msg.created_at)}</span>
                              {isMine && (
                                msg.is_read
                                  ? <FiCheck className="w-3 h-3 text-blue-500" />
                                  : <FiClock className="w-3 h-3 opacity-60" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className={`px-4 py-2.5 border-t ${darkMode ? "border-gray-700 bg-gray-850" : "border-gray-200 bg-gray-50"}`}>
              <div className="flex items-center gap-2">
                <div className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-1.5 border ${darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className={`flex-1 bg-transparent text-sm outline-none py-1 ${darkMode ? "text-white placeholder-gray-500" : "text-gray-900"}`}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim()}
                    className="p-1 text-blue-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <FiSend className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty state - no conversation selected */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${darkMode ? "bg-gray-800" : "bg-gray-100"}`}>
                <svg viewBox="0 0 24 24" className={`w-12 h-12 ${darkMode ? "text-gray-600" : "text-gray-300"}`} fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
              <p className={`text-lg font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>Select a chat</p>
              <p className={`text-sm ${darkMode ? "text-gray-500" : "text-gray-400"}`}>Choose a conversation from the left panel to start messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;