import { useState, useEffect, useRef, useCallback } from "react";
import { FiSend, FiMessageSquare, FiChevronLeft, FiUsers, FiSearch } from "react-icons/fi";
import { motion } from "framer-motion";
import { sendMessage, getMessages, getConversations, getUnreadCount, markAsRead } from "../services/messages";
import { getUsers } from "../services/users";
import { getWebSocket, sendWebSocketMessage } from "../services/websocketservice";
import { cn } from "../utils/ui";

const ChatPage = ({ darkMode, currentUser }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newMessage, setNewMessage] = useState("");
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNewChat, setShowNewChat] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const currentUserId = localStorage.getItem("user_id");

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    loadConversations();
    loadUnreadCount();
    loadUsers();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const socket = getWebSocket();
    if (!socket) return;

    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "chat_message") {
          const msg = data.data;
          if (selectedUser && (msg.sender_id === selectedUser.id || msg.sender_id.toString() === selectedUser.id?.toString())) {
            setMessages(prev => [...prev, msg]);
            markAsRead(msg.sender_id);
          }
          loadConversations();
          loadUnreadCount();
        } else if (data.type === "chat_typing") {
          // could show typing indicator
        }
      } catch (e) {}
    };

    socket.addEventListener("message", handleMessage);
    return () => socket.removeEventListener("message", handleMessage);
  }, [selectedUser]);

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
      if (data.success) setUsers(data.users.filter(u => u.id?.toString() !== currentUserId));
    } catch (e) {}
  };

  const loadMessages = async (user) => {
    setSelectedUser(user);
    setShowNewChat(false);
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

  return (
    <div className={cn("flex h-full", darkMode ? "text-white" : "text-gray-900")}>
      {/* Conversations List */}
      <div className={cn(
        "w-72 flex-shrink-0 border-r flex flex-col",
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
                  placeholder="Search users..."
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
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                    darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600"
                  )}>
                    {user.username?.charAt(0).toUpperCase()}
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
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
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

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className={cn(
              "p-3 border-b flex items-center gap-3",
              darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
            )}>
              <button
                onClick={() => { setSelectedUser(null); setMessages([]); }}
                className="lg:hidden mr-1"
              >
                <FiChevronLeft className="w-5 h-5" />
              </button>
              <div className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium",
                darkMode ? "bg-gray-600" : "bg-blue-100 text-blue-600"
              )}>
                {selectedUser.username?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-sm">{selectedUser.username}</p>
                <p className="text-xs text-gray-400">Ext: {selectedUser.extension}</p>
              </div>
            </div>

            {/* Messages Area */}
            <div className={cn(
              "flex-1 overflow-y-auto p-3 space-y-2",
              darkMode ? "bg-gray-900" : "bg-gray-50"
            )}>
              {messages.map((msg, idx) => {
                const isMine = msg.sender_id?.toString() === currentUserId || msg.sender_id === parseInt(currentUserId);
                return (
                  <motion.div
                    key={msg.id || idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn("flex", isMine ? "justify-end" : "justify-start")}
                  >
                    <div className={cn(
                      "max-w-[75%] px-3 py-2 rounded-2xl",
                      isMine
                        ? "bg-blue-500 text-white rounded-br-md"
                        : darkMode
                          ? "bg-gray-700 text-white rounded-bl-md"
                          : "bg-white text-gray-900 rounded-bl-md shadow-sm border",
                      darkMode && !isMine ? "border-gray-600" : ""
                    )}>
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                      <p className={cn(
                        "text-xs mt-1",
                        isMine ? "text-blue-200" : "text-gray-400"
                      )}>
                        {formatTime(msg.created_at)}
                        {isMine && (
                          <span className="ml-1">{msg.is_read ? "✓✓" : "✓"}</span>
                        )}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className={cn(
              "p-3 border-t",
              darkMode ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
            )}>
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  className={cn(
                    "flex-1 px-4 py-2 rounded-xl text-sm border outline-none",
                    darkMode
                      ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                      : "bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500"
                  )}
                />
                <button
                  onClick={handleSend}
                  disabled={!newMessage.trim()}
                  className="p-2.5 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiSend className="w-4 h-4" />
                </button>
              </div>
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
