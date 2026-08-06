import { useState, useEffect, useRef, useCallback } from "react";
import {
  FiArrowDown,
  FiCornerUpLeft,
  FiCopy,
  FiInfo,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { getMessages, getConversations, markAsRead, sendMessage, deleteMessage } from "../services/messages";
import { getUsers } from "../services/users";
import {
  addMessageListener,
  addConnectionStatusListener,
  sendWebSocketMessage,
  getConnectionStatus,
} from "../services/websocketservice";
import { copyToClipboard } from "../utils/ui";
import { playMessageSound, isChatSoundMuted, setChatSoundMuted } from "../utils/notificationSound";
import {
  genClientMessageId,
  deriveStatus,
  STATUS_LABELS,
  mergeMessage,
  sortConversations,
  groupMessages,
  setMsgStatus,
  markAllDeliveredTo,
  markReadBy,
  clearUnread,
  upsertConversationFromMessage,
  updateConversationPreview,
  getPresence,
  formatFullDate,
} from "../utils/messaging";
import { Avatar } from "../components/messaging/Avatar";
import ConversationList from "../components/messaging/ConversationList";
import { ChatHeader, EmptyChat } from "../components/messaging/ChatHeader";
import { MessageBubble, DateSeparator, MessageSkeletons } from "../components/messaging/MessageBubble";
import MessageComposer from "../components/messaging/MessageComposer";

/* ------------------------------------------------------------------ */
/* Context menu + info / delete modals                                 */
/* ------------------------------------------------------------------ */

function MessageContextMenu({ x, y, dark, items }) {
  const menuW = 200;
  const menuH = items.length * 44 + 14;
  const left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));
  return (
    <div
      style={{ position: "fixed", left, top, zIndex: 70 }}
      className={`w-[200px] rounded-xl shadow-2xl py-1.5 text-sm overflow-hidden border animate-fade-in ${
        dark ? "bg-secondary-800 border-secondary-700 text-secondary-100" : "bg-white border-secondary-100 text-secondary-800"
      }`}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
            item.danger ? "text-red-500" : ""
          } ${dark ? "hover:bg-secondary-700" : "hover:bg-secondary-50"}`}
        >
          <span className="text-base">{item.icon}</span>
          <span className="font-medium">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function MessageInfoModal({ msg, isMine, dark, onClose }) {
  const status = deriveStatus(msg);
  const Row = ({ label, value }) => (
    <div className="flex justify-between gap-4">
      <span className={dark ? "text-secondary-400" : "text-secondary-500"}>{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative w-full max-w-sm rounded-2xl shadow-xl p-6 animate-fade-in ${
          dark ? "bg-secondary-800 text-white" : "bg-white text-secondary-900"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Message information</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10">
            <FiX className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3 text-sm">
          <Row label="Sender" value={isMine ? "You" : msg.sender?.username || `User ${msg.sender_id}`} />
          <Row label="Date" value={formatFullDate(msg.created_at)} />
          {isMine && <Row label="Status" value={STATUS_LABELS[status]} />}
          {isMine && msg.delivered_at && <Row label="Delivered" value={formatFullDate(msg.delivered_at)} />}
          {isMine && msg.read_at && <Row label="Read" value={formatFullDate(msg.read_at)} />}
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-xl text-sm font-medium bg-secondary-100 dark:bg-secondary-700 hover:bg-secondary-200 dark:hover:bg-secondary-600 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ dark, deleting, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div
        className={`relative w-full max-w-sm rounded-2xl shadow-xl p-6 animate-fade-in ${
          dark ? "bg-secondary-800 text-white" : "bg-white text-secondary-900"
        }`}
      >
        <h3 className="text-lg font-semibold mb-2">Delete this message?</h3>
        <p className={`text-sm mb-6 ${dark ? "text-secondary-300" : "text-secondary-500"}`}>
          This message will be removed for everyone in this chat.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-secondary-100 dark:bg-secondary-700 hover:bg-secondary-200 dark:hover:bg-secondary-600 text-secondary-700 dark:text-secondary-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

const ChatPage = ({ darkMode, onVoiceCall, onVideoCall, initialContact }) => {
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [draft, setDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [presenceMap, setPresenceMap] = useState(new Map());
  const [allUsers, setAllUsers] = useState([]);
  const [typingMap, setTypingMap] = useState(new Map());
  const [showSidebar, setShowSidebar] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [menu, setMenu] = useState(null);
  const [infoTarget, setInfoTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [soundMuted, setSoundMuted] = useState(() => isChatSoundMuted());

  const me = Number(localStorage.getItem("user_id") || 0);
  const myUsername = localStorage.getItem("username") || "";
  const myRole = localStorage.getItem("userRole") || "";

  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const searchInputRef = useRef(null);
  const draftRef = useRef("");
  const atBottomRef = useRef(true);
  const forceScrollRef = useRef(false);
  const selectedUserRef = useRef(null);
  const wsConnectedRef = useRef(false);
  const lastTypingSentRef = useRef(0);
  const messagesRef = useRef([]);
  const toastTimerRef = useRef(null);
  const openRequestRef = useRef(0);
  const prevWsConnectedRef = useRef(false);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    wsConnectedRef.current = wsConnected;
  }, [wsConnected]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setMenu(null);
        setInfoTarget(null);
        setDeleteTarget(null);
        setReplyTarget(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = useCallback((text) => {
    setToast(text);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 1800);
  }, []);

  const isMyMessage = useCallback(
    (msg) => me && msg && String(msg.sender_id) === String(me),
    [me]
  );

  const isTyping = useCallback((ext) => typingMap.has(ext), [typingMap]);

  /* ---------------- data loading ---------------- */

  const loadConversations = useCallback(async () => {
    try {
      const data = await getConversations();
      if (data.success) {
        setConversations(sortConversations((data.conversations || []).slice()));
      }
    } catch (e) {
      // keep existing list on failure
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const fetchOnlineUsers = useCallback(async () => {
    try {
      const data = await getUsers();
      if (data.success) {
        // The backend already excludes the logged-in user, but filter
        // defensively so the authenticated account can never appear in
        // search results or the contact list.
        const list = (data.users || []).filter(
          (u) => u && u.id !== undefined && String(u.id) !== String(me)
        );
        setAllUsers(list);
        const map = new Map();
        list.forEach((u) => {
          if (u.extension && u.status && u.status !== "offline") map.set(u.extension, u.status);
        });
        setPresenceMap(map);
      }
    } catch (e) {}
  }, [me]);

  const openConversation = useCallback(async (user) => {
    if (!user || !user.id) return;
    // Guard against stale responses: if the user quickly opens another chat
    // before this request resolves, this response must be discarded.
    const requestId = ++openRequestRef.current;
    selectedUserRef.current = user;
    setSelectedUser(user);
    setShowSidebar(false);
    setTypingMap(new Map());
    setReplyTarget(null);
    setLoadingMessages(true);
    setMessages([]);
    forceScrollRef.current = true;
    try {
      const data = await getMessages(user.id);
      if (openRequestRef.current !== requestId) return;
      const list = (data.messages || []).map((m) => ({
        ...m,
        key: `m-${m.id}`,
        _status: deriveStatus(m),
      }));
      setMessages(list);
      clearUnread(setConversations, user.id);
      markAsRead(user.id).catch(() => {});
    } catch (e) {
      if (openRequestRef.current !== requestId) return;
      setMessages([]);
    } finally {
      if (openRequestRef.current !== requestId) return;
      setLoadingMessages(false);
      forceScrollRef.current = true;
    }
  }, []);

  /* ---------------- scrolling ---------------- */

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = dist < 140;
    setShowScrollDown(dist > 140);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (forceScrollRef.current) {
      forceScrollRef.current = false;
      el.scrollTop = el.scrollHeight;
      atBottomRef.current = true;
      setShowScrollDown(false);
    } else if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, selectedUser?.id]);

  /* ---------------- typing indicator ---------------- */

  // Expire typing indicators after ~3.5s of inactivity.
  useEffect(() => {
    const iv = setInterval(() => {
      setTypingMap((prev) => {
        const now = Date.now();
        let changed = false;
        const next = new Map();
        prev.forEach((ts, ext) => {
          if (now - ts < 3500) next.set(ext, ts);
          else changed = true;
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const sendTyping = useCallback(() => {
    const user = selectedUserRef.current;
    const now = Date.now();
    if (!user || !wsConnectedRef.current) return;
    if (now - lastTypingSentRef.current < 2500) return;
    lastTypingSentRef.current = now;
    sendWebSocketMessage({ type: "chat_typing", to: user.extension, data: { is_typing: true } }).catch(
      () => {}
    );
  }, []);

  /* ---------------- web socket events ---------------- */

  const handleWSEvent = useCallback(
    (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (!data || !data.type) return;

      switch (data.type) {
        case "chat_message": {
          const msg = data.data;
          if (!msg || String(msg.sender_id) === String(me)) return;
          const isOpen = String(selectedUserRef.current?.id) === String(msg.sender_id);
          const incoming = { ...msg, key: `m-${msg.id}`, _status: "sent" };
          if (isOpen) {
            setMessages((prev) => mergeMessage(prev, incoming));
            clearUnread(setConversations, msg.sender_id);
            markAsRead(msg.sender_id).catch(() => {});
          }
          upsertConversationFromMessage(setConversations, msg, me, !isOpen);
          // Audible cue when the incoming chat isn't on screen or the tab is hidden.
          if (!isOpen || document.hidden) {
            playMessageSound();
          }
          break;
        }
        case "chat_message_sent": {
          const msg = data.data;
          if (!msg || String(msg.sender_id) !== String(me)) return;
          if (String(msg.receiver_id) === String(selectedUserRef.current?.id)) {
            setMessages((prev) =>
              mergeMessage(prev, { ...msg, key: `m-${msg.id}`, _status: deriveStatus(msg) })
            );
          }
          upsertConversationFromMessage(setConversations, msg, me, false);
          break;
        }
        case "chat_message_delivered": {
          const d = data.data || {};
          if (d.message_id) setMsgStatus(setMessages, d.message_id, "delivered");
          else if (d.receiver_id) markAllDeliveredTo(setMessages, me, d.receiver_id);
          break;
        }
        case "chat_message_read": {
          const d = data.data || {};
          if (d.reader_id) markReadBy(setMessages, me, d.reader_id);
          break;
        }
        case "chat_message_deleted": {
          const d = data.data || {};
          if (!d.message_id) break;
          setMessages((prev) => prev.filter((m) => String(m.id) !== String(d.message_id)));
          if (d.sender_id && d.receiver_id) {
            const otherId = String(d.sender_id) === String(me) ? d.receiver_id : d.sender_id;
            const conv = d.conversation || {};
            updateConversationPreview(
              setConversations,
              otherId,
              conv.last_message || "",
              conv.last_message_at || null
            );
          }
          break;
        }
        case "chat_typing": {
          if (data.from) setTypingMap((prev) => new Map(prev).set(data.from, Date.now()));
          break;
        }
        case "user_status_changed": {
          const ext = data.from || data.extension;
          const status = data.status;
          if (ext) {
            setPresenceMap((prev) => {
              const next = new Map(prev);
              if (status === "offline") next.delete(ext);
              else next.set(ext, status);
              return next;
            });
          }
          break;
        }
        case "user_status": {
          const ext = data.from || data.extension;
          const status = data.status;
          if (ext && status) {
            setPresenceMap((prev) => {
              const next = new Map(prev);
              if (status === "offline") next.delete(ext);
              else next.set(ext, status);
              return next;
            });
          }
          break;
        }
        default:
          break;
      }
    },
    [me]
  );

  /* ---------------- effects ---------------- */

  useEffect(() => {
    loadConversations();
    fetchOnlineUsers();
  }, [loadConversations, fetchOnlineUsers]);

  useEffect(() => {
    const unsubStatus = addConnectionStatusListener(({ connected }) => {
      const wasConnected = prevWsConnectedRef.current;
      prevWsConnectedRef.current = connected;
      setWsConnected(connected);
      // After a reconnect, catch up on anything that arrived while the socket
      // was down: refresh the conversation list and re-open the active chat.
      if (connected && !wasConnected) {
        loadConversations();
        const openUser = selectedUserRef.current;
        if (openUser && openUser.id) openConversation(openUser);
      }
    });
    const initialConnected = getConnectionStatus().isConnected;
    prevWsConnectedRef.current = initialConnected;
    setWsConnected(initialConnected);
    const unsubMsg = addMessageListener(handleWSEvent);
    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, [handleWSEvent, loadConversations, openConversation]);

  // Open a conversation passed from the Contacts tab.
  useEffect(() => {
    if (initialContact?.id) {
      setConversations((prev) =>
        prev.some((c) => String(c.user.id) === String(initialContact.id))
          ? prev
          : sortConversations([
              ...prev,
              {
                conversation_id: initialContact.id,
                user: initialContact,
                last_message: "",
                last_message_at: new Date().toISOString(),
                unread_count: 0,
              },
            ])
      );
      openConversation(initialContact);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContact?.id]);

  /* ---------------- sending ---------------- */

  const handleSend = useCallback(async () => {
    const user = selectedUserRef.current;
    const content = (draftRef.current || "").trim();
    if (!content || !user) return;

    const reply = replyTarget;
    draftRef.current = "";
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const cmid = genClientMessageId();
    const optimistic = {
      key: `t-${cmid}`,
      _tempId: cmid,
      _status: "sending",
      id: null,
      client_message_id: cmid,
      sender_id: me,
      receiver_id: user.id,
      content,
      msg_type: "text",
      created_at: new Date().toISOString(),
      is_read: false,
      delivered_at: null,
      sender: { id: me, username: myUsername, extension: localStorage.getItem("extension") },
      reply_to_id: reply?.id,
      reply_to: reply
        ? {
            content: reply.content,
            sender_id: reply.sender_id,
            sender: {
              username: String(reply.sender_id) === String(me) ? myUsername : reply.sender?.username || "",
            },
          }
        : null,
    };

    setMessages((prev) => [...prev, optimistic]);
    upsertConversationFromMessage(setConversations, optimistic, me, false);
    forceScrollRef.current = true;

    try {
      const res = await sendMessage(user.id, content, cmid, "text", reply?.id);
      if (res && res.success && res.message) {
        const serverMsg = { ...res.message, key: `t-${cmid}`, _status: deriveStatus(res.message) };
        setMessages((prev) => mergeMessage(prev, serverMsg));
        upsertConversationFromMessage(setConversations, res.message, me, false);
      } else {
        setMessages((prev) => prev.map((m) => (m._tempId === cmid ? { ...m, _status: "failed" } : m)));
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m._tempId === cmid ? { ...m, _status: "failed" } : m)));
    } finally {
      setReplyTarget(null);
    }
  }, [me, myUsername, replyTarget]);

  const retryMessage = useCallback((msg) => {
    if (!msg || !msg._tempId) return;
    setMessages((prev) => prev.map((m) => (m._tempId === msg._tempId ? { ...m, _status: "sending" } : m)));
    sendMessage(msg.receiver_id, msg.content, msg._tempId, "text", msg.reply_to_id)
      .then((res) => {
        if (res && res.success && res.message) {
          setMessages((prev) =>
            mergeMessage(prev, { ...res.message, key: `t-${msg._tempId}`, _status: deriveStatus(res.message) })
          );
        } else {
          setMessages((prev) =>
            prev.map((m) => (m._tempId === msg._tempId ? { ...m, _status: "failed" } : m))
          );
        }
      })
      .catch(() => {
        setMessages((prev) => prev.map((m) => (m._tempId === msg._tempId ? { ...m, _status: "failed" } : m)));
      });
  }, []);

  /* ---------------- context menu / message actions ---------------- */

  const openMessageMenu = useCallback((msg, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!msg) return;
    setMenu({ msg, x: e?.clientX || 0, y: e?.clientY || 0 });
  }, []);

  const buildMenuItems = useCallback(
    (msg) => {
      const isMine = isMyMessage(msg);
      const items = [
        {
          icon: <FiCornerUpLeft className="w-4 h-4" />,
          label: "Reply",
          onClick: () => {
            setReplyTarget(msg);
            setMenu(null);
            textareaRef.current?.focus();
          },
        },
        {
          icon: <FiCopy className="w-4 h-4" />,
          label: "Copy",
          onClick: () => {
            copyToClipboard(msg.content).then((ok) => {
              if (ok) showToast("Message copied");
            });
            setMenu(null);
          },
        },
        {
          icon: <FiInfo className="w-4 h-4" />,
          label: "Information",
          onClick: () => {
            setInfoTarget(msg);
            setMenu(null);
          },
        },
      ];
      if (msg.id && (isMine || myRole === "admin")) {
        items.push({
          icon: <FiTrash2 className="w-4 h-4" />,
          label: "Delete",
          danger: true,
          onClick: () => {
            setDeleteTarget(msg);
            setMenu(null);
          },
        });
      }
      return items;
    },
    [isMyMessage, myRole, showToast]
  );

  /* ---------------- deleting ---------------- */

  const handleDeleteConfirm = useCallback(async () => {
    const msg = deleteTarget;
    setDeleting(true);
    if (!msg || !msg.id) {
      setDeleteTarget(null);
      setDeleting(false);
      return;
    }
    const otherId = String(msg.sender_id) === String(me) ? msg.receiver_id : msg.sender_id;
    try {
      await deleteMessage(msg.id);
      const next = messagesRef.current.filter((m) => String(m.id) !== String(msg.id));
      const latest = next
        .filter((m) => String(m.sender_id) === String(otherId) || String(m.receiver_id) === String(otherId))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      setMessages(next);
      updateConversationPreview(setConversations, otherId, latest?.content || "", latest?.created_at || null);
      // The backend broadcasts `chat_message_deleted` to both users in real
      // time, so no client-side fallback event is needed here.
    } catch (e) {
      showToast("Couldn't delete the message");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, me, showToast]);

  const handleComposerChange = (value) => {
    draftRef.current = value;
    setDraft(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 130) + "px";
    }
    sendTyping();
  };

  const handleBack = () => {
    setSelectedUser(null);
    setMessages([]);
    setShowSidebar(true);
  };

  /* ---------------- derived render state ---------------- */

  const messageGroups = groupMessages(messages);

  const selectedTyping = selectedUser && isTyping(selectedUser.extension);

  const replyName = replyTarget
    ? isMyMessage(replyTarget)
      ? "You"
      : replyTarget.sender?.username || "this message"
    : "";

  /* ---------------- render ---------------- */

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>
      {!wsConnected && (
        <div className="px-3 py-1.5 text-xs font-medium text-center bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-b border-amber-200 dark:border-amber-800">
          Reconnecting to server… live updates will resume shortly
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ---------------- Left panel: conversation list ---------------- */}
        <div className={`${showSidebar || !selectedUser ? "flex" : "hidden md:flex"} min-w-0`}>
          <ConversationList
            dark={darkMode}
            conversations={conversations}
            allUsers={allUsers}
            selectedUserId={selectedUser?.id}
            presenceMap={presenceMap}
            typingMap={typingMap}
            loading={loadingConversations}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onOpenConversation={openConversation}
            soundMuted={soundMuted}
            onToggleSound={() => setSoundMuted(setChatSoundMuted(!isChatSoundMuted()))}
            searchInputRef={searchInputRef}
          />
        </div>

        {/* ---------------- Right panel: chat window ---------------- */}
        <div className={`${!selectedUser ? "hidden md:flex" : "flex"} flex-1 flex-col min-w-0 relative`}>
          {selectedUser ? (
            <>
              <ChatHeader
                user={selectedUser}
                presence={getPresence(selectedUser, presenceMap)}
                typing={selectedTyping}
                dark={darkMode}
                onBack={handleBack}
                onVoiceCall={() => onVoiceCall && onVoiceCall(selectedUser)}
                onVideoCall={() => onVideoCall && onVideoCall(selectedUser)}
              />

              <div className="relative flex-1 min-h-0">
                <div
                  ref={scrollContainerRef}
                  onScroll={handleScroll}
                  className="h-full overflow-y-auto custom-scrollbar px-3 sm:px-6 md:px-10 lg:px-16 py-4"
                  style={{
                    backgroundColor: darkMode ? "#0b141a" : "#f0ebe1",
                    backgroundImage: darkMode
                      ? "linear-gradient(180deg, #0d1a21 0%, #0b141a 100%)"
                      : "linear-gradient(180deg, #f2ede3 0%, #ece4d6 100%)",
                  }}
                >
                  <div className="max-w-[860px] mx-auto h-full">
                    {loadingMessages ? (
                      <MessageSkeletons />
                    ) : messages.length === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center px-8">
                          <Avatar user={selectedUser} size="lg" presence={getPresence(selectedUser, presenceMap)} className="mx-auto mb-4" />
                          <p className={`text-sm font-semibold ${darkMode ? "text-secondary-200" : "text-secondary-700"}`}>
                            Start your conversation with{" "}
                            {selectedUser?.username || selectedUser?.name || `Ext ${selectedUser?.extension}`}.
                          </p>
                          <p className={`text-xs mt-1 ${darkMode ? "text-secondary-500" : "text-secondary-400"}`}>
                            Say hello to send the first message
                          </p>
                        </div>
                      </div>
                    ) : (
                      messageGroups.map((group, gi) => {
                        const prevMsg =
                          gi > 0 ? messageGroups[gi - 1].items[messageGroups[gi - 1].items.length - 1] : null;
                        const first = group.items[0];
                        const showDate =
                          !prevMsg ||
                          new Date(first.created_at).toDateString() !==
                            new Date(prevMsg.created_at).toDateString();
                        const groupMine = isMyMessage(first);
                        return (
                          <div key={`g-${gi}`}>
                            {showDate && <DateSeparator dateStr={first.created_at} dark={darkMode} />}
                            {group.items.map((msg, mi) => {
                              const isLast = mi === group.items.length - 1;
                              const groupStyle =
                                group.items.length === 1
                                  ? "single"
                                  : mi === 0
                                    ? "start"
                                    : isLast
                                      ? "end"
                                      : "middle";
                              return (
                                <MessageBubble
                                  key={msg.key || msg._tempId || msg.id}
                                  msg={msg}
                                  isMine={groupMine}
                                  dark={darkMode}
                                  status={deriveStatus(msg)}
                                  myId={me}
                                  canDelete={!!msg.id && (isMyMessage(msg) || myRole === "admin")}
                                  onRetry={retryMessage}
                                  onMenu={openMessageMenu}
                                  onDelete={(m) => setDeleteTarget(m)}
                                  groupStyle={groupStyle}
                                  showTime={isLast}
                                  showAvatar={!groupMine && isLast}
                                />
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {showScrollDown && (
                  <button
                    onClick={() => {
                      forceScrollRef.current = true;
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                      }
                      atBottomRef.current = true;
                      setShowScrollDown(false);
                    }}
                    className="absolute right-4 md:right-8 bottom-5 z-10 p-2.5 rounded-full bg-white dark:bg-secondary-700 shadow-lg text-secondary-600 dark:text-secondary-200 border border-secondary-200 dark:border-secondary-600 hover:bg-secondary-100 dark:hover:bg-secondary-600 transition-colors"
                    title="Scroll to bottom"
                  >
                    <FiArrowDown className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Reply bar */}
              {replyTarget && (
                <div
                  className={`flex items-center gap-3 px-4 py-2 border-t ${
                    darkMode ? "bg-secondary-800 border-secondary-700" : "bg-secondary-50 border-secondary-200"
                  }`}
                >
                  <div className="flex-1 min-w-0 border-l-4 border-[#00a884] pl-3">
                    <p className="text-xs font-semibold text-[#00a884]">Replying to {replyName}</p>
                    <p className="text-xs truncate text-secondary-500 dark:text-secondary-400">
                      {replyTarget.content || "Media message"}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyTarget(null)}
                    className="p-1.5 rounded-full text-secondary-400 hover:bg-black/10 dark:hover:bg-white/10"
                    title="Cancel reply"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Composer */}
              <MessageComposer
                dark={darkMode}
                value={draft}
                onChange={handleComposerChange}
                onSend={handleSend}
                textareaRef={textareaRef}
                disabled={!draft.trim()}
              />
            </>
          ) : (
            <EmptyChat dark={darkMode} />
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-lg bg-secondary-900 text-white text-sm shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      {/* Context menu */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <MessageContextMenu
            x={menu.x}
            y={menu.y}
            dark={darkMode}
            items={buildMenuItems(menu.msg)}
          />
        </>
      )}

      {infoTarget && (
        <MessageInfoModal
          msg={infoTarget}
          isMine={isMyMessage(infoTarget)}
          dark={darkMode}
          onClose={() => setInfoTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          dark={darkMode}
          deleting={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
};

export default ChatPage;
