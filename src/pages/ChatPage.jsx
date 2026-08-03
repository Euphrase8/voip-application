import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  FiSend,
  FiChevronLeft,
  FiSearch,
  FiCheck,
  FiClock,
  FiPhone,
  FiVideo,
  FiRefreshCw,
  FiArrowDown,
  FiAlertTriangle,
  FiCornerUpLeft,
  FiCopy,
  FiInfo,
  FiTrash2,
  FiX,
  FiChevronDown,
  FiBell,
  FiBellOff,
} from "react-icons/fi";
import { getMessages, getConversations, markAsRead, sendMessage, deleteMessage } from "../services/messages";
import { getUsers } from "../services/users";
import {
  addMessageListener,
  addConnectionStatusListener,
  sendWebSocketMessage,
  getConnectionStatus,
} from "../services/websocketservice";
import { getInitials, getAvatarColor, copyToClipboard } from "../utils/ui";
import { playMessageSound, isChatSoundMuted, setChatSoundMuted } from "../utils/notificationSound";

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

const genClientMessageId = () => {
  if (typeof window !== "undefined" && window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `cmid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// WhatsApp-style message wallpaper (subtle dot pattern)
const makePattern = (fill) =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'><g fill='${fill}' fill-opacity='0.5'><circle cx='18' cy='18' r='2.4'/><circle cx='63' cy='18' r='2.4'/><circle cx='108' cy='18' r='2.4'/><circle cx='153' cy='18' r='2.4'/><circle cx='40' cy='63' r='2.4'/><circle cx='85' cy='63' r='2.4'/><circle cx='130' cy='63' r='2.4'/><circle cx='18' cy='108' r='2.4'/><circle cx='63' cy='108' r='2.4'/><circle cx='108' cy='108' r='2.4'/><circle cx='153' cy='108' r='2.4'/><circle cx='40' cy='153' r='2.4'/><circle cx='85' cy='153' r='2.4'/><circle cx='130' cy='153' r='2.4'/></g></svg>`
  ) +
  "\")";

const CHAT_BG_LIGHT = makePattern("#cfc8b8");
const CHAT_BG_DARK = makePattern("#263238");

// Message status is derived from the server state when available,
// otherwise from the client-side optimistic state.
const deriveStatus = (m) => {
  if (m && (m._status === "failed" || m._status === "sending")) return m._status;
  if (m && m.is_read) return "read";
  if (m && m.delivered_at) return "delivered";
  if (!m || !m.id) return "sending";
  return "sent";
};

const STATUS_LABELS = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

// Merge an incoming/acknowledged message into the list, deduplicating by
// stable key, server id or client_message_id so messages never appear twice.
const mergeMessage = (prev, incoming) => {
  const incomingKey = incoming.key;
  const idx = prev.findIndex(
    (m) =>
      (incomingKey && m.key === incomingKey) ||
      (incoming.id && m.id && String(m.id) === String(incoming.id)) ||
      (incoming.client_message_id && m.client_message_id === incoming.client_message_id)
  );
  if (idx === -1) {
    return [...prev, incoming];
  }
  const existing = prev[idx];
  const merged = {
    ...existing,
    ...incoming,
    key: existing.key || incomingKey,
  };
  merged._status = deriveStatus(merged);
  const next = prev.slice();
  next[idx] = merged;
  return next;
};

const sortConversations = (list) =>
  list.slice().sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));

// Messages from the same sender within the same day and a short time window are
// grouped into one visually-connected run (single timestamp, connected bubbles).
const GROUP_GAP_MS = 10 * 60 * 1000;

const groupMessages = (messages) => {
  const groups = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    const prev = last ? last.items[last.items.length - 1] : null;
    const sameSender = prev && prev.sender_id === m.sender_id;
    const sameDay =
      prev &&
      new Date(m.created_at).toDateString() === new Date(prev.created_at).toDateString();
    const gap = prev ? new Date(m.created_at) - new Date(prev.created_at) : Infinity;
    if (sameSender && sameDay && gap <= GROUP_GAP_MS) {
      last.items.push(m);
    } else {
      groups.push({ items: [m] });
    }
  }
  return groups;
};

// Merge the "other" user object, never clobbering existing fields with undefined.
const mergeOtherUser = (base, extra) => {
  const out = { ...base };
  if (extra && extra.id !== undefined) out.id = extra.id;
  ["username", "name", "extension", "email", "status", "role", "is_online", "avatar", "profile_image"].forEach((k) => {
    if (extra && extra[k] !== undefined && extra[k] !== null && extra[k] !== "") out[k] = extra[k];
  });
  return out;
};

const setMsgStatus = (setMessages, messageId, status) => {
  setMessages((prev) =>
    prev.map((m) => (String(m.id) === String(messageId) ? { ...m, _status: status } : m))
  );
};

const markAllDeliveredTo = (setMessages, me, receiverId) => {
  setMessages((prev) =>
    prev.map((m) => {
      if (
        String(m.sender_id) === String(me) &&
        String(m.receiver_id) === String(receiverId) &&
        m._status !== "read"
      ) {
        return { ...m, _status: m.is_read ? "read" : "delivered", delivered_at: m.delivered_at || m.created_at };
      }
      return m;
    })
  );
};

const markReadBy = (setMessages, me, readerId) => {
  setMessages((prev) =>
    prev.map((m) => {
      if (String(m.sender_id) === String(me) && String(m.receiver_id) === String(readerId)) {
        return { ...m, is_read: true, _status: "read" };
      }
      return m;
    })
  );
};

const clearUnread = (setConversations, userId) => {
  setConversations((prev) =>
    prev.map((c) => (String(c.user.id) === String(userId) ? { ...c, unread_count: 0 } : c))
  );
};

// Update the conversation list when a message is created/received.
const upsertConversationFromMessage = (setConversations, msg, me, incrementUnread) => {
  const other =
    String(msg.sender_id) === String(me)
      ? { id: msg.receiver_id, ...(msg.receiver || {}) }
      : { id: msg.sender_id, ...(msg.sender || {}) };

  setConversations((prev) => {
    let found = false;
    const next = prev.map((c) => {
      if (String(c.user.id) === String(other.id)) {
        found = true;
        const unread = incrementUnread ? (c.unread_count || 0) + 1 : c.unread_count || 0;
        return {
          ...c,
          user: mergeOtherUser(c.user, other),
          last_message: msg.content,
          last_message_at: msg.created_at,
          unread_count: unread,
        };
      }
      return c;
    });
    if (!found) {
      next.push({
        conversation_id: other.id,
        user: mergeOtherUser({ id: other.id }, other),
        last_message: msg.content,
        last_message_at: msg.created_at,
        unread_count: incrementUnread ? 1 : 0,
      });
    }
    return sortConversations(next);
  });
};

// Set a conversation's preview text/timestamp (used after a message is deleted).
const updateConversationPreview = (setConversations, otherUserId, lastMessage, lastMessageAt) => {
  setConversations((prev) =>
    sortConversations(
      prev.map((c) =>
        String(c.user.id) === String(otherUserId)
          ? { ...c, last_message: lastMessage || "", last_message_at: lastMessageAt || null }
          : c
      )
    )
  );
};

const formatTime = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const formatMsgTime = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatFullDate = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/* ------------------------------------------------------------------ */
/* Small presentational components                                     */
/* ------------------------------------------------------------------ */

const PRESENCE_DOT = {
  online: "bg-[#00a884]",
  busy: "bg-amber-500",
  away: "bg-orange-400",
};

function Avatar({ user, size = "md", presence = "offline", className = "" }) {
  const sizeCls =
    size === "lg"
      ? "w-12 h-12 text-base"
      : size === "sm"
        ? "w-9 h-9 text-xs"
        : size === "xs"
          ? "w-7 h-7 text-[9px]"
          : "w-11 h-11 text-sm";
  const dotCls =
    size === "lg" ? "w-3.5 h-3.5 -bottom-0.5 -right-0.5 border-[2.5px]" : "w-3 h-3 -bottom-0 -right-0 border-2";
  const name = user?.username || user?.name || "?";
  const dotColor = PRESENCE_DOT[presence];
  return (
    <div className={`relative flex-shrink-0 ${className}`}>
      <div
        className={`${sizeCls} rounded-full flex items-center justify-center text-white font-semibold select-none ${getAvatarColor(name)}`}
      >
        {getInitials(name)}
      </div>
      {dotColor && (
        <span
          className={`absolute ${dotCls} ${dotColor} rounded-full border-white dark:border-gray-900`}
        />
      )}
    </div>
  );
}

const MessageStatus = ({ status }) => {
  if (status === "sending") return <FiClock className="w-3.5 h-3.5" />;
  if (status === "read") {
    return (
      <span className="inline-flex items-center">
        <FiCheck className="w-3.5 h-3.5 -mr-[3px] text-[#53bdeb]" />
        <FiCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center">
        <FiCheck className="w-3.5 h-3.5 -mr-[3px]" />
        <FiCheck className="w-3.5 h-3.5" />
      </span>
    );
  }
  return <FiCheck className="w-3.5 h-3.5" />;
};

const TypingDots = ({ colorClass }) => (
  <span className="inline-flex items-center gap-[3px]">
    <span className={`w-1.5 h-1.5 rounded-full ${colorClass} animate-bounce`} />
    <span className={`w-1.5 h-1.5 rounded-full ${colorClass} animate-bounce`} style={{ animationDelay: "150ms" }} />
    <span className={`w-1.5 h-1.5 rounded-full ${colorClass} animate-bounce`} style={{ animationDelay: "300ms" }} />
  </span>
);

const DateSeparator = memo(function DateSeparator({ dateStr, dark }) {
  const d = new Date(dateStr);
  const now = new Date();
  let label;
  if (d.toDateString() === now.toDateString()) label = "Today";
  else {
    const yesterday = new Date(Date.now() - 86400000);
    if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  }
  return (
    <div className="flex justify-center my-4">
      <span
        className={`text-[12px] px-3 py-1 rounded-lg shadow-sm ${
          dark ? "bg-gray-800 text-gray-300" : "bg-white/70 text-gray-500"
        }`}
      >
        {label}
      </span>
    </div>
  );
});

const ConversationItem = memo(function ConversationItem({ conv, isSelected, presence, typing, onClick, dark }) {
  const u = conv.user || {};
  const name = u.username || u.name || `Ext ${u.extension}`;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-150 relative ${
        isSelected
          ? dark
            ? "bg-gray-700/70"
            : "bg-[#f0faf3]"
          : dark
            ? "hover:bg-gray-800"
            : "hover:bg-gray-100"
      }`}
    >
      {isSelected && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#00a884]" />}
      <Avatar user={u} presence={presence} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold truncate">{name}</p>
          <span className={`text-[11px] flex-shrink-0 ${dark ? "text-gray-500" : "text-gray-400"}`}>
            {formatTime(conv.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex-1 min-w-0">
            {typing ? (
              <span className="text-xs text-[#00a884] font-medium inline-flex items-center gap-1">
                <TypingDots colorClass="bg-[#00a884]" /> typing…
              </span>
            ) : (
              <p
                className={`text-[13px] truncate ${
                  conv.last_message
                    ? dark
                      ? "text-gray-400"
                      : "text-gray-500"
                    : dark
                      ? "text-gray-600"
                      : "text-gray-400"
                }`}
              >
                {conv.last_message || "No messages yet"}
              </p>
            )}
          </div>
          {conv.unread_count > 0 && (
            <span className="flex-shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#00a884] text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
              {conv.unread_count > 99 ? "99+" : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

// Quoted message preview rendered inside a bubble that is a reply.
const QuotedBlock = memo(function QuotedBlock({ replyTo, quoteName, dark, mine }) {
  const border = mine ? "border-[#4db6ac]" : dark ? "border-gray-500" : "border-gray-300";
  const textCls = mine ? (dark ? "text-gray-200" : "text-gray-700") : dark ? "text-gray-200" : "text-gray-700";
  const subCls = mine ? (dark ? "text-gray-300" : "text-gray-500") : dark ? "text-gray-400" : "text-gray-500";
  return (
    <div className={`mb-1.5 pl-2 border-l-2 ${border}`}>
      {replyTo && replyTo.content ? (
        <>
          <p className={`text-[12px] font-semibold leading-tight ${textCls}`}>
            {replyTo.sender && quoteName ? (String(replyTo.sender_id) === quoteName.myId ? "You" : replyTo.sender.username) : ""}
          </p>
          <p className={`text-[12px] leading-snug truncate ${subCls}`}>{replyTo.content}</p>
        </>
      ) : (
        <p className={`text-[12px] italic ${subCls}`}>Original message unavailable</p>
      )}
    </div>
  );
});

// Resolve the bubble corner radii for WhatsApp-style grouped messages.
// `single`: isolated bubble, classic pointed corner.
// `start`: first of a run – pointed corner on top, connects to the next.
// `middle`: connected both sides (nearly square on the near edge).
// `end`: last of a run – connects above, pointed corner + tail below.
const bubbleRadius = (isMine, groupStyle) => {
  if (isMine) {
    switch (groupStyle) {
      case "start":
        return "rounded-tl-xl rounded-bl-xl rounded-tr-sm rounded-br-lg";
      case "middle":
        return "rounded-tl-xl rounded-bl-xl rounded-tr-[5px] rounded-br-[5px]";
      case "end":
        return "rounded-tl-xl rounded-bl-xl rounded-tr-[5px] rounded-br-sm";
      default:
        return "rounded-xl rounded-tr-sm";
    }
  }
  switch (groupStyle) {
    case "start":
      return "rounded-tr-xl rounded-br-xl rounded-tl-sm rounded-bl-lg";
    case "middle":
      return "rounded-tr-xl rounded-br-xl rounded-tl-[5px] rounded-bl-[5px]";
    case "end":
      return "rounded-tr-xl rounded-br-xl rounded-tl-[5px] rounded-bl-sm";
    default:
      return "rounded-xl rounded-tl-sm";
  }
};

const MessageBubble = memo(function MessageBubble({
  msg,
  isMine,
  dark,
  status,
  myId,
  canDelete,
  onRetry,
  onMenu,
  onDelete,
  groupStyle = "single",
  showTime = true,
  showAvatar = false,
}) {
  const showQuote = msg.reply_to_id || msg.reply_to;
  const quoteName = { myId };
  const actionBtnCls =
    "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full text-gray-400 hover:bg-black/10 dark:hover:bg-white/10 self-center";
  // Within a run of grouped bubbles the rows sit tight; at run boundaries we
  // leave a gap so separate bubbles are visually distinct.
  const rowMargin = groupStyle === "start" || groupStyle === "middle" ? "mb-[2px]" : "mb-2.5";
  const bubbleBg = isMine
    ? dark
      ? "bg-[#005c4b]"
      : "bg-[#d9fdd3]"
    : dark
      ? "bg-gray-700"
      : "bg-white";
  return (
    <div className={`group flex items-end ${isMine ? "justify-end" : "justify-start"} ${rowMargin}`}>
      {!isMine && showAvatar && <Avatar user={msg.sender} size="xs" className="mr-1.5 mb-0.5" />}
      <div className="flex items-end gap-0.5">
        {isMine && (
          <>
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(msg);
                }}
                className={`${actionBtnCls} hover:text-red-500`}
                title="Delete message"
              >
                <FiTrash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(e) => onMenu(msg, e)}
              onContextMenu={(e) => onMenu(msg, e)}
              className={actionBtnCls}
              title="Message options"
            >
              <FiChevronDown className="w-4 h-4" />
            </button>
          </>
        )}
        <div
          onContextMenu={(e) => onMenu(msg, e)}
          className={`relative max-w-[85%] sm:max-w-[75%] md:max-w-[70%] px-2.5 py-1.5 text-[14px] leading-relaxed shadow-sm animate-fade-in ${bubbleRadius(
            isMine,
            groupStyle
          )} ${bubbleBg} ${isMine ? "text-gray-100 dark:text-gray-100" : dark ? "text-gray-100" : "text-gray-800"}`}
        >
          {showQuote && <QuotedBlock replyTo={msg.reply_to} quoteName={quoteName} dark={dark} mine={isMine} />}
          <p className={`whitespace-pre-wrap break-words ${showTime ? "pr-12" : "pr-1"}`}>{msg.content}</p>
          {showTime && (
            <div
              className={`absolute bottom-1 right-2 flex items-center gap-1 ${
                isMine ? (dark ? "text-gray-300" : "text-gray-500") : dark ? "text-gray-400" : "text-gray-400"
              }`}
            >
              <span className="text-[10px]">{formatMsgTime(msg.created_at)}</span>
              {isMine &&
                (status === "failed" ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(msg);
                    }}
                    title="Message failed. Tap to retry."
                    className="text-red-300 hover:text-red-100 transition-colors"
                  >
                    <FiRefreshCw className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <MessageStatus status={status} />
                ))}
            </div>
          )}
          {/* WhatsApp-style tail on the last bubble of a group */}
          {showTime && (
            <span
              className={`absolute bottom-[-2px] ${
                isMine ? "right-[-1px]" : "left-[-1px]"
              } w-[9px] h-[9px] rounded-[1px] rotate-45 ${bubbleBg}`}
            />
          )}
          {isMine && status === "failed" && (
            <div className="absolute -top-3 left-2 inline-flex items-center gap-1 text-red-500 dark:text-red-400 text-[10px] font-medium">
              <FiAlertTriangle className="w-3 h-3" /> Failed
            </div>
          )}
        </div>
        {!isMine && (
          <>
            <button
              onClick={(e) => onMenu(msg, e)}
              onContextMenu={(e) => onMenu(msg, e)}
              className={actionBtnCls}
              title="Message options"
            >
              <FiChevronDown className="w-4 h-4" />
            </button>
            {canDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(msg);
                }}
                className={`${actionBtnCls} hover:text-red-500`}
                title="Delete message"
              >
                <FiTrash2 className="w-4 h-4" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});

function MessageContextMenu({ x, y, dark, items }) {
  const menuW = 200;
  const menuH = items.length * 44 + 14;
  const left = Math.max(8, Math.min(x, window.innerWidth - menuW - 8));
  const top = Math.max(8, Math.min(y, window.innerHeight - menuH - 8));
  return (
    <div
      style={{ position: "fixed", left, top, zIndex: 70 }}
      className={`w-[200px] rounded-xl shadow-2xl py-1.5 text-sm overflow-hidden border animate-fade-in ${
        dark ? "bg-gray-800 border-gray-700 text-gray-100" : "bg-white border-gray-100 text-gray-800"
      }`}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
            item.danger ? "text-red-500" : ""
          } ${dark ? "hover:bg-gray-700" : "hover:bg-gray-50"}`}
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
      <span className={dark ? "text-gray-400" : "text-gray-500"}>{label}</span>
      <span className="font-medium text-right">{value || "—"}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative w-full max-w-sm rounded-2xl shadow-xl p-6 animate-fade-in ${
          dark ? "bg-gray-800 text-white" : "bg-white text-gray-900"
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
          className="mt-5 w-full py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
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
          dark ? "bg-gray-800 text-white" : "bg-white text-gray-900"
        }`}
      >
        <h3 className="text-lg font-semibold mb-2">Delete this message?</h3>
        <p className={`text-sm mb-6 ${dark ? "text-gray-300" : "text-gray-500"}`}>
          This message will be removed for everyone in this chat.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 transition-colors"
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

function ChatHeader({ user, presence, typing, dark, onBack, onVoiceCall, onVideoCall }) {
  const presenceText = { online: "Online", busy: "Busy", away: "Away", offline: "Offline" }[presence] || "Offline";
  const presenceDot = { online: "bg-[#00a884]", busy: "bg-amber-500", away: "bg-orange-400" }[presence] || "bg-gray-400";
  const presenceTextCls =
    presence === "online"
      ? "text-[#00a884]"
      : presence === "busy"
        ? "text-amber-500"
        : presence === "away"
          ? "text-orange-400"
          : dark
            ? "text-gray-500"
            : "text-gray-400";
  return (
    <div
      className={`px-4 py-2.5 flex items-center gap-3 border-b ${
        dark ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"
      }`}
    >
      <button onClick={onBack} className="md:hidden p-1 -ml-1 text-gray-500 dark:text-gray-300" title="Back">
        <FiChevronLeft className="w-5 h-5" />
      </button>
      <Avatar user={user} size="sm" presence={presence} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {user?.username || user?.name || `Ext ${user?.extension}`}
          {user?.extension && (
            <span className={`ml-1.5 font-normal text-xs ${dark ? "text-gray-400" : "text-gray-500"}`}>
              {user.extension}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
          {typing ? (
            <span className="text-[#00a884] font-medium inline-flex items-center gap-1">
              <TypingDots colorClass="bg-[#00a884]" /> typing…
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 font-medium ${presenceTextCls}`}>
              <span className={`w-2 h-2 rounded-full ${presenceDot}`} />
              {presenceText}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={onVoiceCall}
          className={`p-2.5 rounded-full transition-colors ${
            dark ? "hover:bg-gray-700" : "hover:bg-gray-200"
          } text-gray-600 dark:text-gray-200`}
          title="Voice call"
        >
          <FiPhone className="w-[18px] h-[18px]" />
        </button>
        <button
          onClick={onVideoCall}
          className={`p-2.5 rounded-full transition-colors ${
            dark ? "hover:bg-gray-700" : "hover:bg-gray-200"
          } text-gray-600 dark:text-gray-200`}
          title="Video call"
        >
          <FiVideo className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  );
}

function EmptyChat({ dark }) {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center px-8">
        <div
          className={`w-28 h-28 mx-auto mb-6 rounded-full flex items-center justify-center ${
            dark ? "bg-gray-800" : "bg-gray-100"
          }`}
        >
          <FiSend className={`w-12 h-12 ${dark ? "text-gray-600" : "text-gray-300"} -scale-x-100`} />
        </div>
        <p className={`text-lg font-semibold mb-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>
          Select a conversation to start chatting
        </p>
        <p className={`text-sm max-w-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>
          Choose a chat from the left panel to start messaging. Messages stay in sync in real time.
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
      <p className="text-xs mt-1 text-center">Start a chat from your contacts and it will appear here.</p>
    </div>
  );
}

const Skeleton = ({ className = "" }) => (
  <div className={`animate-pulse bg-gray-300 dark:bg-gray-600 ${className}`} />
);

const ConversationSkeletons = () => (
  <div className="px-4 py-2">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 py-2.5">
        <Skeleton className="w-12 h-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 rounded w-1/3" />
          <Skeleton className="h-3 rounded w-2/3" />
        </div>
      </div>
    ))}
  </div>
);

const MessageSkeletons = () => (
  <div className="space-y-3 px-2 pt-6">
    <div className="flex justify-center">
      <Skeleton className="h-6 w-28 rounded-full" />
    </div>
    <div className="flex justify-start">
      <Skeleton className="h-14 w-56 rounded-xl rounded-tl-sm" />
    </div>
    <div className="flex justify-end">
      <Skeleton className="h-16 w-64 rounded-xl rounded-tr-sm" />
    </div>
    <div className="flex justify-start">
      <Skeleton className="h-12 w-44 rounded-xl rounded-tl-sm" />
    </div>
    <div className="flex justify-end">
      <Skeleton className="h-14 w-52 rounded-xl rounded-tr-sm" />
    </div>
  </div>
);

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

  // Presence is tracked per extension as a live map (online/busy/away), fed by
  // the users list on load and by WebSocket status broadcasts afterwards.
  const getPresence = useCallback(
    (user) => {
      if (!user) return "offline";
      if (user.extension && presenceMap.has(user.extension)) return presenceMap.get(user.extension);
      if (user.status && user.status !== "" && user.status !== "offline") return user.status;
      if (user.is_online === true) return "online";
      return "offline";
    },
    [presenceMap]
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
        const map = new Map();
        (data.users || []).forEach((u) => {
          if (u.extension && u.status && u.status !== "offline") map.set(u.extension, u.status);
        });
        setPresenceMap(map);
      }
    } catch (e) {}
  }, []);

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

  const handleComposerChange = (e) => {
    const value = e.target.value;
    draftRef.current = value;
    setDraft(value);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 130) + "px";
    }
    sendTyping();
  };

  const handleComposerKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleBack = () => {
    setSelectedUser(null);
    setMessages([]);
    setShowSidebar(true);
  };

  /* ---------------- derived render state ---------------- */

  const filteredConversations = conversations.filter((c) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const u = c.user || {};
    return (
      (u.username || "").toLowerCase().includes(q) ||
      (u.name || "").toLowerCase().includes(q) ||
      (u.extension || "").includes(q)
    );
  });

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
        <div
          className={`${showSidebar || !selectedUser ? "flex" : "hidden md:flex"} w-full md:w-[400px] lg:w-[430px] flex-shrink-0 flex-col ${
            darkMode ? "bg-gray-900 border-gray-700" : "bg-white border-gray-200"
          } border-r`}
        >
          <div
            className={`px-4 pt-3 pb-2 border-b ${
              darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <h2 className="text-lg font-bold">Chats</h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSoundMuted(setChatSoundMuted(!isChatSoundMuted()))}
                  className={`p-2 rounded-full transition-colors ${
                    darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
                  } ${soundMuted ? "text-[#00a884]" : "text-gray-400 dark:text-gray-500"}`}
                  title={soundMuted ? "Unmute message sounds" : "Mute message sounds"}
                >
                  {soundMuted ? <FiBellOff className="w-[18px] h-[18px]" /> : <FiBell className="w-[18px] h-[18px]" />}
                </button>
                <span className="text-xs text-gray-400 mr-1">
                  {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            <div className="relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-gray-400" />
              <input
                type="text"
                placeholder="Search conversations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-sm outline-none transition-colors ${
                  darkMode
                    ? "bg-gray-900 text-white placeholder-gray-500 border border-gray-700 focus:border-[#00a884]"
                    : "bg-gray-100 text-gray-900 border border-transparent focus:border-[#00a884]"
                }`}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  title="Clear search"
                >
                  <FiX className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loadingConversations ? (
              <ConversationSkeletons />
            ) : conversations.length === 0 ? (
              <EmptyConversations dark={darkMode} />
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 px-6">
                <FiSearch className="w-5 h-5 mb-2" />
                <p className="text-xs text-center">No chats match “{searchTerm}”</p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <ConversationItem
                  key={conv.conversation_id || conv.user.id}
                  conv={conv}
                  isSelected={String(selectedUser?.id) === String(conv.user.id)}
                  presence={getPresence(conv.user)}
                  typing={isTyping(conv.user.extension)}
                  onClick={() => openConversation(conv.user)}
                  dark={darkMode}
                />
              ))
            )}
          </div>
        </div>

        {/* ---------------- Right panel: chat window ---------------- */}
        <div className={`${!selectedUser ? "hidden md:flex" : "flex"} flex-1 flex-col min-w-0 relative`}>
          {selectedUser ? (
            <>
              <ChatHeader
                user={selectedUser}
                presence={getPresence(selectedUser)}
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
                  className="h-full overflow-y-auto custom-scrollbar px-4 md:px-8 lg:px-16 py-3"
                  style={{
                    backgroundImage: darkMode ? CHAT_BG_DARK : CHAT_BG_LIGHT,
                    backgroundColor: darkMode ? "#0b141a" : "#efeae2",
                  }}
                >
                  {loadingMessages ? (
                    <MessageSkeletons />
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>No messages yet</p>
                        <p className={`text-xs mt-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                          Say hello to start the conversation
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
                    className="absolute right-4 md:right-8 bottom-5 z-10 p-2.5 rounded-full bg-white dark:bg-gray-700 shadow-lg text-gray-600 dark:text-gray-200 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
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
                    darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex-1 min-w-0 border-l-4 border-[#00a884] pl-3">
                    <p className="text-xs font-semibold text-[#00a884]">Replying to {replyName}</p>
                    <p className="text-xs truncate text-gray-500 dark:text-gray-400">
                      {replyTarget.content || "Media message"}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyTarget(null)}
                    className="p-1.5 rounded-full text-gray-400 hover:bg-black/10 dark:hover:bg-white/10"
                    title="Cancel reply"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Composer */}
              <div
                className={`px-3 md:px-4 py-3 border-t ${
                  darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"
                }`}
              >
                <div
                  className={`flex items-end gap-2 rounded-2xl pl-3.5 pr-1.5 py-1.5 border focus-within:ring-2 focus-within:ring-[#00a884]/30 transition-shadow ${
                    darkMode
                      ? "bg-gray-900 border-gray-700"
                      : "bg-white border-gray-200 shadow-sm"
                  }`}
                >
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    maxLength={5000}
                    value={draft}
                    onChange={handleComposerChange}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Type a message"
                    className={`flex-1 bg-transparent text-sm outline-none resize-none py-1.5 max-h-[130px] ${
                      darkMode ? "text-white placeholder-gray-500" : "text-gray-900 placeholder-gray-400"
                    }`}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim()}
                    className="p-2.5 rounded-full bg-[#00a884] text-white hover:bg-[#008f70] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-md hover:shadow-lg active:scale-95"
                    title="Send"
                  >
                    <FiSend className="w-[18px] h-[18px]" />
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1.5 text-center">
                  Enter to send · Shift + Enter for a new line
                </p>
              </div>
            </>
          ) : (
            <EmptyChat dark={darkMode} />
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-lg bg-gray-900 text-white text-sm shadow-lg animate-fade-in">
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
