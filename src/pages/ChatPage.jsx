import { useState, useEffect, useRef, useCallback } from "react";
import { FiSend, FiChevronLeft, FiSearch, FiCheck, FiClock, FiPhone, FiVideo, FiMoreVertical } from "react-icons/fi";
import { getMessages, getConversations, getUnreadCount, markAsRead, sendMessage } from "../services/messages";
import { getUsers } from "../services/users";
import { addMessageListener } from "../services/websocketservice";

const COLORS = [
  "bg-emerald-500", "bg-blue-500", "bg-violet-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500",
  "bg-cyan-500", "bg-amber-500"
];

function getColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name) {
  return (name || "?").charAt(0).toUpperCase();
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatMsgTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ChatDateSeparator({ dateStr, dark }) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(Date.now() - 86400000);
  let label;
  if (isToday) label = "Today";
  else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
  else label = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  return (
    <div className="flex justify-center my-3">
      <span className={`text-[12px] px-3 py-1 rounded-lg shadow-sm ${dark ? "bg-gray-800 text-gray-300" : "bg-white/70 text-gray-500"}`}>
        {label}
      </span>
    </div>
  );
}

function ConversationItem({ conv, isSelected, online, onClick, dark }) {
  const u = conv.user;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-l-[3px] ${
        isSelected
          ? dark
            ? "bg-gray-700 border-l-emerald-500"
            : "bg-gray-100 border-l-emerald-500"
          : dark
            ? "border-l-transparent hover:bg-gray-800"
            : "border-l-transparent hover:bg-gray-50"
      } ${dark ? "border-b border-gray-800" : "border-b border-gray-100"}`}
    >
      <div className="relative flex-shrink-0">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-medium ${getColor(u.username)}`}>
          {getInitials(u.username)}
        </div>
        {online && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-[2.5px] border-white dark:border-gray-900" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium truncate">{u.username}</p>
          <p className="text-[11px] text-gray-400 flex-shrink-0 ml-2">{conv.last_message_at ? formatTime(conv.last_message_at) : ""}</p>
        </div>
        <p className={`text-[11px] ${dark ? "text-gray-500" : "text-gray-400"} truncate`}>Ext: {u.extension}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <p className={`text-xs truncate ${conv.last_message ? (dark ? "text-gray-400" : "text-gray-500") : "text-gray-400 italic"}`}>
            {conv.last_message || "No messages yet"}
          </p>
        </div>
      </div>
      {conv.unread_count > 0 && (
        <div className="flex-shrink-0 ml-2">
          <span className="bg-emerald-500 text-white text-[11px] font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1.5 shadow-sm">
            {conv.unread_count > 99 ? '99+' : conv.unread_count}
          </span>
        </div>
      )}
    </button>
  );
}

function MessageBubble({ msg, isMine, dark }) {
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"} mb-1`}>
      <div className={`relative max-w-[75%] px-3 py-2 text-sm leading-relaxed shadow-sm ${
        isMine
          ? "bg-emerald-500 text-white rounded-2xl rounded-br-sm"
          : dark
            ? "bg-gray-700 text-gray-100 rounded-2xl rounded-bl-sm"
            : "bg-white text-gray-800 rounded-2xl rounded-bl-sm"
      }`}>
        <p className="whitespace-pre-wrap break-words pr-14">{msg.content}</p>
        <div className={`absolute bottom-1 right-2 flex items-center gap-0.5 ${
          isMine ? "text-white/80" : dark ? "text-gray-400" : "text-gray-400"
        }`}>
          <span className="text-[10px]">{formatMsgTime(msg.created_at)}</span>
          {isMine && (
            msg.is_read
              ? <FiCheck className="w-3 h-3 text-blue-200" />
              : <FiClock className="w-3 h-3 opacity-60" />
          )}
        </div>
      </div>
    </div>
  );
}

function ChatHeader({ user, online, dark, onBack, onVoiceCall, onVideoCall }) {
  return (
    <div className={`px-4 py-2.5 flex items-center gap-3 ${dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"} border-b shadow-sm`}>
      <button onClick={onBack} className="md:hidden p-1 -ml-1">
        <FiChevronLeft className="w-5 h-5" />
      </button>
      <div className="relative flex-shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${getColor(user.username)}`}>
          {getInitials(user.username)}
        </div>
        {online && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">{user.username}</p>
        <p className="text-[11px] text-gray-400">
          {online ? "Online" : "Offline"} · Ext: {user.extension}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onVoiceCall} className={`p-2 rounded-full transition-colors ${dark ? "hover:bg-gray-700" : "hover:bg-gray-200"}`} title="Voice Call">
          <FiPhone className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onVideoCall} className={`p-2 rounded-full transition-colors ${dark ? "hover:bg-gray-700" : "hover:bg-gray-200"}`} title="Video Call">
          <FiVideo className="w-[18px] h-[18px]" />
        </button>
        <button className={`p-2 rounded-full transition-colors ${dark ? "hover:bg-gray-700" : "hover:bg-gray-200"}`} title="More">
          <FiMoreVertical className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}

function EmptyChat({ dark }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center px-8">
        <div className={`w-28 h-28 mx-auto mb-6 rounded-full flex items-center justify-center ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
          <svg viewBox="0 0 24 24" className={`w-14 h-14 ${dark ? "text-gray-600" : "text-gray-300"}`} fill="none" stroke="currentColor" strokeWidth="1.2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
        </div>
        <p className={`text-lg font-semibold mb-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>Select a chat</p>
        <p className={`text-sm max-w-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>
          Choose a conversation from the left panel to start messaging
        </p>
      </div>
    </div>
  );
}

function EmptyConversations({ dark }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 px-6 py-12">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${dark ? "bg-gray-800" : "bg-gray-100"}`}>
        <FiSearch className="w-6 h-6" />
      </div>
      <p className="text-sm font-medium">No conversations yet</p>
      <p className="text-xs mt-1 text-center">Search for a user by name or extension to start a new conversation</p>
    </div>
  );
}

const ChatPage = ({ darkMode, onVoiceCall, onVideoCall }) => {
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

  useEffect(() => { loadConversations(); loadUnreadCount(); fetchOnlineUsers(); }, []);

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
          if (data.status === "online") setOnlineUsers(prev => new Set(prev).add(data.from));
          else setOnlineUsers(prev => { const n = new Set(prev); n.delete(data.from); return n; });
        }
      } catch (e) {}
    };
    const unsub = addMessageListener(listener);
    return () => unsub();
  }, [selectedUser, currentUserId]);

  const fetchOnlineUsers = async () => {
    try {
      const data = await getUsers();
      if (data.success) {
        setOnlineUsers(new Set(data.users.filter(u => u.status === "online").map(u => u.extension)));
      }
    } catch (e) {}
  };

  const loadConversations = async () => {
    try {
      const data = await getConversations();
      if (data.success) {
        const sorted = (data.conversations || []).sort((a, b) => {
          const aT = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bT = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return bT - aT;
        });
        setConversations(sorted);
      }
    } catch (e) {}
  };

  const loadUnreadCount = async () => {
    try { await getUnreadCount(); } catch (e) {}
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
      const data = await sendMessage(selectedUser.id, content);
      if (data.success && data.message) {
        setMessages(prev => prev.find(m => String(m.id) === String(data.message.id)) ? prev : [...prev, data.message]);
        loadConversations();
      } else {
        setMessages(prev => [...prev, { id: Date.now(), sender_id: Number(currentUserId), receiver_id: selectedUser.id, content, created_at: new Date().toISOString(), msg_type: "text" }]);
        loadConversations();
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now(), sender_id: Number(currentUserId), receiver_id: selectedUser.id, content, created_at: new Date().toISOString(), msg_type: "text" }]);
      loadConversations();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const filteredConversations = conversations.filter(c =>
    !searchTerm ||
    c.user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.user.extension?.includes(searchTerm)
  );

  const isOnline = (ext) => onlineUsers.has(ext);

  return (
    <div className="flex h-full" style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>
      {/* Left Panel */}
      <div className={`${showSidebar || !selectedUser ? "flex" : "hidden md:flex"} w-full md:w-[420px] flex-shrink-0 flex-col ${darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"} border-r`}>
        {/* Header */}
        <div className={`${darkMode ? "bg-gray-850" : "bg-gray-50"} border-b ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold">Chats</h2>
              <span className="text-xs text-gray-400">{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or extension..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-colors ${
                  darkMode
                    ? "bg-gray-800 text-white placeholder-gray-500 border border-gray-700 focus:border-gray-500"
                    : "bg-gray-100 text-gray-900 border border-transparent focus:border-gray-300"
                }`}
              />
            </div>
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <EmptyConversations dark={darkMode} />
          ) : (
            filteredConversations.map((conv) => (
              <ConversationItem
                key={conv.conversation_id || conv.user.id}
                conv={conv}
                isSelected={selectedUser?.id === conv.user.id}
                online={isOnline(conv.user.extension)}
                onClick={() => loadMessages(conv.user)}
                dark={darkMode}
              />
            ))
          )}
        </div>
      </div>

      {/* Right Panel */}
      <div className={`${!selectedUser ? "hidden md:flex" : "flex"} flex-1 flex-col`}>
        {selectedUser ? (
          <>
            <ChatHeader
              user={selectedUser}
              online={isOnline(selectedUser.extension)}
              dark={darkMode}
              onBack={() => { setSelectedUser(null); setMessages([]); setShowSidebar(true); }}
              onVoiceCall={() => onVoiceCall && onVoiceCall(selectedUser)}
              onVideoCall={() => onVideoCall && onVideoCall(selectedUser)}
            />

            {/* Messages */}
            <div className={`flex-1 overflow-y-auto px-4 py-3 relative ${
              darkMode ? "bg-gray-900" : "bg-[#efeae2]"
            }`}
              style={!darkMode ? { backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d4d4d4\' fill-opacity=\'0.12\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' } : {}}
            >
              {messages.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>No messages yet</p>
                    <p className={`text-xs mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>Send a message to start the conversation</p>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg, idx) => {
                    const isMine = String(msg.sender_id) === String(currentUserId);
                    const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx - 1]?.created_at).toDateString();
                    return (
                      <div key={msg.id || idx}>
                        {showDate && <ChatDateSeparator dateStr={msg.created_at} dark={darkMode} />}
                        <MessageBubble msg={msg} isMine={isMine} dark={darkMode} />
                      </div>
                    );
                  })}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className={`px-4 py-3 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"} border-t`}>
              <div className={`flex items-center gap-2 rounded-xl px-4 py-2 border ${
                darkMode ? "bg-gray-700 border-gray-600" : "bg-white border-gray-200"
              }`}>
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className={`flex-1 bg-transparent text-sm outline-none py-1 ${darkMode ? "text-white placeholder-gray-400" : "text-gray-900"}`}
                />
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim()}
                  className="p-2 text-emerald-500 hover:text-emerald-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <FiSend className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <EmptyChat dark={darkMode} />
        )}
      </div>
    </div>
  );
};

export default ChatPage;