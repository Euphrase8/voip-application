import { memo } from "react";
import { FiCheck, FiEdit2, FiSearch, FiUsers, FiX, FiBell, FiBellOff } from "react-icons/fi";
import { cn } from "../../utils/ui";
import { formatTime, getPresence, PRESENCE_LABEL } from "../../utils/messaging";
import { Avatar, TypingIndicator } from "./Avatar";

const SectionLabel = ({ children, className = "" }) => (
  <p
    className={cn(
      "px-4 pt-4 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-secondary-400 dark:text-secondary-500",
      className
    )}
  >
    {children}
  </p>
);

const ConversationItem = memo(function ConversationItem({ conv, isSelected, presence, typing, onClick, dark }) {
  const u = conv.user || {};
  const name = u.username || u.name || `Ext ${u.extension}`;
  const preview = conv.last_message || "No messages yet";
  const isOwnLast = conv.last_mine === true;
  const hasUnread = (conv.unread_count || 0) > 0;
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors duration-150 relative ${
        isSelected
          ? dark
            ? "bg-secondary-800/90"
            : "bg-[#e8f9f3]"
          : dark
            ? "hover:bg-secondary-800/50"
            : "hover:bg-secondary-50"
      }`}
    >
      {isSelected && <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#00a884]" />}
      <Avatar user={u} presence={presence} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("text-[15px] truncate", hasUnread ? "font-bold" : "font-semibold")}>{name}</p>
          <span
            className={cn(
              "text-[11px] flex-shrink-0",
              hasUnread ? "text-[#00a884] font-semibold" : dark ? "text-secondary-500" : "text-secondary-400"
            )}
          >
            {formatTime(conv.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className="flex-1 min-w-0">
            {typing ? (
              <span className="text-xs text-[#00a884] font-medium inline-flex items-center gap-1">
                <TypingIndicator colorClass="bg-[#00a884]" /> typing…
              </span>
            ) : (
              <p
                className={cn(
                  "flex items-center gap-1 text-[13px] truncate",
                  hasUnread
                    ? "font-semibold"
                    : dark
                      ? "text-secondary-400"
                      : "text-secondary-500"
                )}
              >
                {isOwnLast && (
                  <span className="text-[#00a884] flex-shrink-0">
                    {conv.last_read ? (
                      <span className="inline-flex items-center">
                        <FiCheck className="w-3.5 h-3.5 -mr-[3px] text-[#53bdeb]" />
                        <FiCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                      </span>
                    ) : (
                      <FiCheck className="w-3.5 h-3.5" />
                    )}
                  </span>
                )}
                <span className={cn("truncate", conv.last_message ? "" : dark ? "text-secondary-600" : "text-secondary-300")}>
                  {isOwnLast ? `You: ${preview}` : preview}
                </span>
              </p>
            )}
          </div>
          {hasUnread && (
            <span className="flex-shrink-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#00a884] text-white text-[11px] font-bold flex items-center justify-center shadow-sm">
              {conv.unread_count > 99 ? "99+" : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});

// A user row used in contact search results and the "Contacts" sidebar section.
// Always shows avatar, name, extension and live presence (Online/Busy/Away/Offline).
const ContactItem = memo(function ContactItem({ user, presence = "offline", hasConversation, onClick, dark }) {
  const u = user || {};
  const name = u.username || u.name || `Ext ${u.extension}`;
  const presenceText = PRESENCE_LABEL[presence] || "Offline";
  const presenceDot =
    presence === "online"
      ? "bg-[#00a884]"
      : presence === "busy"
        ? "bg-amber-500"
        : presence === "away"
          ? "bg-orange-400"
          : "bg-secondary-400";
  const presenceTextCls =
    presence === "online"
      ? "text-[#00a884]"
      : presence === "busy"
        ? "text-amber-500"
        : presence === "away"
          ? "text-orange-400"
          : dark
            ? "text-secondary-500"
            : "text-secondary-400";
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
        dark ? "hover:bg-secondary-800/50" : "hover:bg-secondary-50"
      }`}
    >
      <Avatar user={u} presence={presence} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn("text-xs", dark ? "text-secondary-500" : "text-secondary-400")}>
            {u.extension}
          </span>
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${presenceTextCls}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${presenceDot}`} />
            {presenceText}
          </span>
        </div>
      </div>
      {hasConversation && (
        <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#00a884]/10 text-[#00a884]">
          Chat
        </span>
      )}
    </button>
  );
});

function EmptyConversations({ dark }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-secondary-400 px-6 py-12">
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${dark ? "bg-secondary-800" : "bg-secondary-100"}`}>
        <FiUsers className="w-6 h-6" />
      </div>
      <p className="text-sm font-medium">No conversations yet</p>
      <p className="text-xs mt-1 text-center">Search for a contact below to start your first chat.</p>
    </div>
  );
}

const Skeleton = ({ className = "" }) => (
  <div className={`animate-pulse bg-secondary-300 dark:bg-secondary-600 ${className}`} />
);

export const ConversationSkeletons = () => (
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

const NoSearchResults = ({ query, dark }) => (
  <div className="flex flex-col items-center justify-center py-12 text-secondary-400 px-6">
    <FiSearch className="w-6 h-6 mb-2" />
    <p className="text-sm font-medium text-secondary-500 dark:text-secondary-400">No results</p>
    <p className="text-xs mt-1 text-center">Nothing matches "{query}"</p>
  </div>
);

/**
 * The whole left panel: header ("Chats" + new message + sound mute), search
 * bar and the scrollable list of conversations/contacts with search modes.
 */
function ConversationList({
  dark,
  conversations,
  allUsers,
  selectedUserId,
  presenceMap,
  typingMap,
  loading,
  searchTerm,
  onSearchChange,
  onOpenConversation,
  soundMuted,
  onToggleSound,
  searchInputRef,
}) {
  const searchActive = searchTerm.trim().length > 0;
  const searchQuery = searchTerm.trim().toLowerCase();

  // Existing conversations filtered by the search term.
  const filteredConversations = conversations.filter((c) => {
    if (!searchActive) return true;
    const u = c.user || {};
    return (
      (u.username || "").toLowerCase().includes(searchQuery) ||
      (u.name || "").toLowerCase().includes(searchQuery) ||
      (u.extension || "").includes(searchQuery)
    );
  });

  // Contact search results across ALL registered users (self excluded).
  const matchedUsers = searchActive
    ? allUsers.filter((u) => {
        const haystack =
          `${u.username || ""} ${u.name || ""} ${u.extension || ""} ${u.email || ""}`.toLowerCase();
        return haystack.includes(searchQuery);
      })
    : [];

  // For the sidebar "Contacts" section: users that don't already have a chat.
  const inConversationIds = new Set(conversations.map((c) => String(c.user?.id)));
  const contactsWithoutChat = allUsers.filter((u) => !inConversationIds.has(String(u.id)));

  const userHasConversation = (user) => inConversationIds.has(String(user?.id));
  const isTyping = (ext) => typingMap.has(ext);

  return (
    <div
      className={`w-full md:w-[360px] xl:w-[400px] flex-shrink-0 flex-col ${
        dark ? "bg-secondary-900 border-secondary-700" : "bg-white border-secondary-200"
      } border-r flex`}
    >
      {/* Panel header */}
      <div
        className={`px-4 pt-3.5 pb-2.5 border-b ${
          dark ? "bg-secondary-900 border-secondary-700" : "bg-white border-secondary-200"
        }`}
      >
        <div className="flex items-center justify-between mb-2.5 px-1">
          <h2 className="text-xl font-bold tracking-tight">Chats</h2>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => searchInputRef?.current?.focus()}
              className={`p-2 rounded-full transition-colors ${
                dark ? "hover:bg-secondary-800 text-secondary-300" : "hover:bg-secondary-100 text-secondary-600"
              }`}
              title="New message"
            >
              <FiEdit2 className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={onToggleSound}
              className={`p-2 rounded-full transition-colors ${
                dark ? "hover:bg-secondary-800" : "hover:bg-secondary-100"
              } ${soundMuted ? "text-[#00a884]" : "text-secondary-400 dark:text-secondary-500"}`}
              title={soundMuted ? "Unmute message sounds" : "Mute message sounds"}
            >
              {soundMuted ? <FiBellOff className="w-[18px] h-[18px]" /> : <FiBell className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-secondary-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search contacts or conversations…"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className={`w-full pl-10 pr-10 py-2.5 rounded-full text-sm outline-none transition-all duration-200 ${
              dark
                ? "bg-secondary-800 text-white placeholder-secondary-500 border border-transparent focus:border-[#00a884] focus:ring-2 focus:ring-[#00a884]/20"
                : "bg-secondary-100 text-secondary-900 border border-transparent focus:border-[#00a884] focus:bg-white focus:ring-2 focus:ring-[#00a884]/20"
            }`}
          />
          {searchTerm && (
            <button
              onClick={() => {
                onSearchChange("");
                searchInputRef?.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              title="Clear search"
            >
              <FiX className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Panel list */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-2">
        {loading ? (
          <ConversationSkeletons />
        ) : searchActive ? (
          /* ---- Search mode: matching chats, then matching contacts ---- */
          filteredConversations.length === 0 && matchedUsers.length === 0 ? (
            <NoSearchResults query={searchTerm} dark={dark} />
          ) : (
            <>
              {filteredConversations.length > 0 && (
                <>
                  <SectionLabel>Chats</SectionLabel>
                  {filteredConversations.map((conv) => (
                    <ConversationItem
                      key={conv.conversation_id || conv.user.id}
                      conv={conv}
                      isSelected={String(selectedUserId) === String(conv.user.id)}
                      presence={getPresence(conv.user, presenceMap)}
                      typing={isTyping(conv.user.extension)}
                      onClick={() => onOpenConversation(conv.user)}
                      dark={dark}
                    />
                  ))}
                </>
              )}
              {matchedUsers.length > 0 && (
                <>
                  <SectionLabel>Contacts</SectionLabel>
                  {matchedUsers.map((u) => (
                    <ContactItem
                      key={u.id}
                      user={u}
                      presence={getPresence(u, presenceMap)}
                      hasConversation={userHasConversation(u)}
                      onClick={() => onOpenConversation(u)}
                      dark={dark}
                    />
                  ))}
                </>
              )}
            </>
          )
        ) : (
          /* ---- Browse mode: existing chats, then all other contacts ---- */
          <>
            {conversations.length > 0 && (
              <>
                <SectionLabel>Recent</SectionLabel>
                {filteredConversations.map((conv) => (
                  <ConversationItem
                    key={conv.conversation_id || conv.user.id}
                    conv={conv}
                    isSelected={String(selectedUserId) === String(conv.user.id)}
                    presence={getPresence(conv.user, presenceMap)}
                    typing={isTyping(conv.user.extension)}
                    onClick={() => onOpenConversation(conv.user)}
                    dark={dark}
                  />
                ))}
              </>
            )}
            {contactsWithoutChat.length > 0 && (
              <>
                <SectionLabel>Contacts</SectionLabel>
                {contactsWithoutChat.map((u) => (
                  <ContactItem
                    key={u.id}
                    user={u}
                    presence={getPresence(u, presenceMap)}
                    onClick={() => onOpenConversation(u)}
                    dark={dark}
                  />
                ))}
              </>
            )}
            {conversations.length === 0 && contactsWithoutChat.length === 0 && (
              <EmptyConversations dark={dark} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ConversationList;
