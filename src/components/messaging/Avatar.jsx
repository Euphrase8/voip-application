import { FiCheck, FiClock } from "react-icons/fi";
import { cn, getInitials, getAvatarColor } from "../../utils/ui";
import { PRESENCE_LABEL } from "../../utils/messaging";

const PRESENCE_DOT = {
  online: "bg-[#00a884]",
  busy: "bg-amber-500",
  away: "bg-orange-400",
};

// Instagram-style avatar: a subtle green ring when online, a small status
// dot when busy/away, and nothing when offline.
export function Avatar({ user, size = "md", presence = "offline", className = "" }) {
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
  const isOnline = presence === "online";
  const dotColor = isOnline ? null : PRESENCE_DOT[presence];
  const ringCls = isOnline
    ? "p-[2px] rounded-full bg-gradient-to-br from-[#00a884] to-emerald-400 shadow-sm"
    : "";
  return (
    <div className={cn("relative flex-shrink-0", ringCls, className)}>
      <div
        className={`${sizeCls} rounded-full flex items-center justify-center text-white font-semibold select-none ${getAvatarColor(name)}`}
      >
        {getInitials(name)}
      </div>
      {dotColor && (
        <span
          className={`absolute ${dotCls} ${dotColor} rounded-full border-2 border-white dark:border-secondary-900`}
        />
      )}
    </div>
  );
}

export function MessageStatus({ status }) {
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
}

export function TypingIndicator({ colorClass = "bg-[#00a884]", className = "" }) {
  return (
    <span className={cn("inline-flex items-center gap-[3px]", className)}>
      <span className={`w-1.5 h-1.5 rounded-full ${colorClass} animate-bounce`} />
      <span className={`w-1.5 h-1.5 rounded-full ${colorClass} animate-bounce`} style={{ animationDelay: "150ms" }} />
      <span className={`w-1.5 h-1.5 rounded-full ${colorClass} animate-bounce`} style={{ animationDelay: "300ms" }} />
    </span>
  );
}

export { PRESENCE_LABEL };
