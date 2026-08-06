/* ------------------------------------------------------------------ */
/* Shared messaging utilities: formatting, grouping, bubble radius     */
/* Used by the chat components and ChatPage orchestration.             */
/* ------------------------------------------------------------------ */

/**
 * Generate a unique client-side message id (used for optimistic messages).
 */
export const genClientMessageId = () => {
  if (typeof window !== "undefined" && window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `cmid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

// Message status is derived from the server state when available,
// otherwise from the client-side optimistic state.
export const deriveStatus = (m) => {
  if (m && (m._status === "failed" || m._status === "sending")) return m._status;
  if (m && m.is_read) return "read";
  if (m && m.delivered_at) return "delivered";
  if (!m || !m.id) return "sending";
  return "sent";
};

export const STATUS_LABELS = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
  failed: "Failed",
};

/**
 * Merge an incoming/acknowledged message into a list, deduplicating by
 * stable key, server id or client_message_id so messages never appear twice.
 */
export const mergeMessage = (prev, incoming) => {
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

export const sortConversations = (list) =>
  list.slice().sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));

// Messages from the same sender within the same day and a short time window are
// grouped into one visually-connected run (single timestamp, connected bubbles).
export const GROUP_GAP_MS = 10 * 60 * 1000;

export const groupMessages = (messages) => {
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
export const mergeOtherUser = (base, extra) => {
  const out = { ...base };
  if (extra && extra.id !== undefined) out.id = extra.id;
  ["username", "name", "extension", "email", "status", "role", "is_online", "avatar", "profile_image"].forEach((k) => {
    if (extra && extra[k] !== undefined && extra[k] !== null && extra[k] !== "") out[k] = extra[k];
  });
  return out;
};

export const setMsgStatus = (setMessages, messageId, status) => {
  setMessages((prev) =>
    prev.map((m) => (String(m.id) === String(messageId) ? { ...m, _status: status } : m))
  );
};

export const markAllDeliveredTo = (setMessages, me, receiverId) => {
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

export const markReadBy = (setMessages, me, readerId) => {
  setMessages((prev) =>
    prev.map((m) => {
      if (String(m.sender_id) === String(me) && String(m.receiver_id) === String(readerId)) {
        return { ...m, is_read: true, _status: "read" };
      }
      return m;
    })
  );
};

export const clearUnread = (setConversations, userId) => {
  setConversations((prev) =>
    prev.map((c) => (String(c.user.id) === String(userId) ? { ...c, unread_count: 0 } : c))
  );
};

// Update the conversation list when a message is created/received.
export const upsertConversationFromMessage = (setConversations, msg, me, incrementUnread) => {
  const mine = String(msg.sender_id) === String(me);
  const other = mine
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
          last_mine: mine,
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
        last_mine: mine,
        unread_count: incrementUnread ? 1 : 0,
      });
    }
    return sortConversations(next);
  });
};

// Set a conversation's preview text/timestamp (used after a message is deleted).
export const updateConversationPreview = (setConversations, otherUserId, lastMessage, lastMessageAt) => {
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

/* --------------------------- date formatting --------------------------- */

export const formatTime = (dateStr) => {
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

export const formatMsgTime = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

export const formatFullDate = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

// Label used by the DateSeparator: Today / Yesterday / e.g. "Monday, January 5".
export const formatDateLabel = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
};

/* ------------------------- presence helpers ------------------------- */

export const PRESENCE_LABEL = { online: "Online", busy: "Busy", away: "Away", offline: "Offline" };

// Resolve live presence for a user: presenceMap (keyed by extension) wins,
// otherwise fall back to the user's stored status/is_online flags.
export const getPresence = (user, presenceMap) => {
  if (!user) return "offline";
  if (presenceMap && user.extension && presenceMap.has(user.extension)) return presenceMap.get(user.extension);
  if (user.status && user.status !== "" && user.status !== "offline") return user.status;
  if (user.is_online === true) return "online";
  return "offline";
};

/* ----------------------- chat wallpaper pattern ----------------------- */

// Subtle chat wallpaper (WhatsApp-style dot pattern)
const makePattern = (fill) =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'><g fill='${fill}' fill-opacity='0.5'><circle cx='18' cy='18' r='2.4'/><circle cx='63' cy='18' r='2.4'/><circle cx='108' cy='18' r='2.4'/><circle cx='153' cy='18' r='2.4'/><circle cx='40' cy='63' r='2.4'/><circle cx='85' cy='63' r='2.4'/><circle cx='130' cy='63' r='2.4'/><circle cx='18' cy='108' r='2.4'/><circle cx='63' cy='108' r='2.4'/><circle cx='108' cy='108' r='2.4'/><circle cx='153' cy='108' r='2.4'/><circle cx='40' cy='153' r='2.4'/><circle cx='85' cy='153' r='2.4'/><circle cx='130' cy='153' r='2.4'/></g></svg>`
  ) +
  "\")";

export const CHAT_BG_LIGHT = makePattern("#c9c2b4");
export const CHAT_BG_DARK = makePattern("#2a3a45");

/* ------------------------- bubble corner radii ------------------------- */

// Resolve the bubble corner radii for grouped messages.
// `single`: isolated bubble, classic pointed corner.
// `start`: first of a run – pointed corner on top, connects to the next.
// `middle`: connected both sides (nearly square on the near edge).
// `end`: last of a run – connects above, pointed corner + tail below.
export const bubbleRadius = (isMine, groupStyle) => {
  if (isMine) {
    switch (groupStyle) {
      case "start":
        return "rounded-tl-2xl rounded-bl-2xl rounded-tr-sm rounded-br-lg";
      case "middle":
        return "rounded-tl-2xl rounded-bl-2xl rounded-tr-[6px] rounded-br-[6px]";
      case "end":
        return "rounded-tl-2xl rounded-bl-2xl rounded-tr-[6px] rounded-br-sm";
      default:
        return "rounded-2xl rounded-tr-sm";
    }
  }
  switch (groupStyle) {
    case "start":
      return "rounded-tr-2xl rounded-br-2xl rounded-tl-sm rounded-bl-lg";
    case "middle":
      return "rounded-tr-2xl rounded-br-2xl rounded-tl-[6px] rounded-bl-[6px]";
    case "end":
      return "rounded-tr-2xl rounded-br-2xl rounded-tl-[6px] rounded-bl-sm";
    default:
      return "rounded-2xl rounded-tl-sm";
  }
};
