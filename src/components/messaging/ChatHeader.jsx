import { FiChevronLeft, FiPhone, FiVideo, FiMessageSquare } from "react-icons/fi";
import { cn } from "../../utils/ui";
import { PRESENCE_LABEL } from "../../utils/messaging";
import { Avatar, TypingIndicator } from "./Avatar";

function ChatHeader({ user, presence, typing, dark, onBack, onVoiceCall, onVideoCall }) {
  const presenceText = PRESENCE_LABEL[presence] || "Offline";
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
  const iconBtnCls = cn(
    "p-2.5 rounded-full transition-colors",
    dark ? "hover:bg-secondary-700 text-secondary-200" : "hover:bg-secondary-100 text-secondary-600"
  );
  return (
    <div
      className={`px-3 py-2.5 flex items-center gap-3 border-b ${
        dark ? "bg-secondary-800 border-secondary-700" : "bg-white border-secondary-200"
      }`}
    >
      <button onClick={onBack} className="md:hidden p-1 -ml-1 text-secondary-500 dark:text-secondary-300" title="Back">
        <FiChevronLeft className="w-5 h-5" />
      </button>
      <Avatar user={user} size="sm" presence={presence} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate">
          {user?.username || user?.name || `Ext ${user?.extension}`}
          {user?.extension && (
            <span className={`ml-1.5 font-normal text-xs ${dark ? "text-secondary-400" : "text-secondary-500"}`}>
              {user.extension}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] mt-0.5">
          {typing ? (
            <span className="text-[#00a884] font-medium inline-flex items-center gap-1">
              <TypingIndicator colorClass="bg-[#00a884]" /> typing…
            </span>
          ) : (
            <span className={`inline-flex items-center gap-1.5 font-medium ${presenceTextCls}`}>
              <span className="w-2 h-2 rounded-full bg-current" />
              {presenceText}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <button onClick={onVoiceCall} className={iconBtnCls} title="Voice call">
          <FiPhone className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onVideoCall} className={iconBtnCls} title="Video call">
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
          className={`w-28 h-28 mx-auto mb-6 rounded-full flex items-center justify-center border-4 border-dashed ${
            dark ? "bg-secondary-800 border-secondary-700" : "bg-secondary-50 border-secondary-200"
          }`}
        >
          <FiMessageSquare className={`w-11 h-11 ${dark ? "text-secondary-600" : "text-secondary-300"}`} />
        </div>
        <p className={`text-lg font-semibold mb-1 ${dark ? "text-secondary-200" : "text-secondary-700"}`}>
          Your messages
        </p>
        <p className={`text-sm max-w-xs ${dark ? "text-secondary-500" : "text-secondary-400"}`}>
          Select a conversation to start chatting, or search for a contact. Messages stay in sync in real time.
        </p>
      </div>
    </div>
  );
}

export { ChatHeader, EmptyChat };
