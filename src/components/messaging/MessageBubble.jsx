import { memo } from "react";
import { FiAlertTriangle, FiChevronDown, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { cn } from "../../utils/ui";
import { bubbleRadius, formatMsgTime, formatDateLabel } from "../../utils/messaging";
import { Avatar, MessageStatus } from "./Avatar";

export const DateSeparator = memo(function DateSeparator({ dateStr, dark }) {
  const label = formatDateLabel(dateStr);
  return (
    <div className="flex justify-center my-5">
      <span
        className={`text-[11px] px-3 py-1 rounded-full font-semibold tracking-wide backdrop-blur-sm ${
          dark
            ? "bg-secondary-900/70 text-secondary-300 border border-secondary-700"
            : "bg-white/85 text-secondary-500 border border-black/5 shadow-sm"
        }`}
      >
        {label}
      </span>
    </div>
  );
});

const QuotedBlock = memo(function QuotedBlock({ replyTo, quoteName, dark, mine }) {
  const border = mine ? "border-[#4db6ac]" : dark ? "border-secondary-500" : "border-secondary-300";
  const textCls = mine ? (dark ? "text-secondary-200" : "text-secondary-700") : dark ? "text-secondary-200" : "text-secondary-700";
  const subCls = mine ? (dark ? "text-secondary-300" : "text-secondary-500") : dark ? "text-secondary-400" : "text-secondary-500";
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

export const MessageBubble = memo(function MessageBubble({
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
    "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-full text-secondary-400 hover:bg-black/10 dark:hover:bg-white/10 self-center";
  // Within a run of grouped bubbles the rows sit tight; at run boundaries we
  // leave a gap so separate bubbles are visually distinct.
  const rowMargin = groupStyle === "start" || groupStyle === "middle" ? "mb-[3px]" : "mb-3";
  const bubbleBg = isMine
    ? dark
      ? "bg-[#005c4b]"
      : "bg-[#d9fdd3]"
    : dark
      ? "bg-secondary-700"
      : "bg-white";
  const bubbleBorder = !isMine && !dark ? "border border-secondary-900/5" : "";
  const bubbleShadow = isMine
    ? "shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
    : dark
      ? "shadow-md shadow-black/15"
      : "shadow-[0_1px_3px_rgba(0,0,0,0.06)]";
  const bubbleBody = `relative px-3.5 py-2 text-[14px] leading-relaxed animate-fade-in ${bubbleRadius(
    isMine,
    groupStyle
  )} ${bubbleBg} ${bubbleBorder} ${bubbleShadow} ${
    dark ? "text-secondary-100" : "text-secondary-800"
  }`;
  // Show the sender's name above the first bubble of each incoming run, like
  // messaging apps do. Own messages are identified by their accent color.
  const showName =
    !isMine &&
    (groupStyle === "single" || groupStyle === "start") &&
    msg.sender?.username;
  // Timestamp + delivery status flow inline right after the message text, so
  // short words like "hi"/"okay" are never forced into single-character lines.
  const metaBlock = (
    <span
      className={`ml-2 align-baseline inline-flex items-center gap-1 text-[10px] whitespace-nowrap ${
        isMine ? (dark ? "text-secondary-300" : "text-secondary-500") : dark ? "text-secondary-400" : "text-secondary-400"
      }`}
    >
      <span>{formatMsgTime(msg.created_at)}</span>
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
    </span>
  );
  const contentRow = (content) => (
    <div className="max-w-full">
      <p className="inline whitespace-pre-wrap break-words">{content}</p>
      {metaBlock}
    </div>
  );

  return (
    <div className={`group flex items-end ${isMine ? "justify-end" : "justify-start"} ${rowMargin}`}>
      {!isMine && showAvatar && <Avatar user={msg.sender} size="xs" className="mr-2 mb-0.5" />}
      {isMine ? (
        <div className="flex items-end gap-0.5">
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
          <div onContextMenu={(e) => onMenu(msg, e)} className={cn(bubbleBody, "max-w-[85%] sm:max-w-[72%] lg:max-w-[62%]")}>
            {showQuote && <QuotedBlock replyTo={msg.reply_to} quoteName={quoteName} dark={dark} mine={isMine} />}
            {contentRow(msg.content)}
            {/* WhatsApp-style tail on the last bubble of a group */}
            {showTime && (
              <span
                className={`absolute bottom-[-2px] right-[-1px] w-[9px] h-[9px] rounded-[1px] rotate-45 ${bubbleBg}`}
              />
            )}
            {status === "failed" && (
              <div className="absolute -top-3 left-2 inline-flex items-center gap-1 text-red-500 dark:text-red-400 text-[10px] font-medium">
                <FiAlertTriangle className="w-3 h-3" /> Failed
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start max-w-[85%] sm:max-w-[72%] lg:max-w-[62%]">
          {showName && (
            <span className="ml-1 mb-0.5 max-w-full truncate text-[11px] font-semibold text-[#00a884] dark:text-emerald-400">
              {msg.sender.username}
            </span>
          )}
          <div onContextMenu={(e) => onMenu(msg, e)} className={bubbleBody}>
            {showQuote && <QuotedBlock replyTo={msg.reply_to} quoteName={quoteName} dark={dark} mine={isMine} />}
            {contentRow(msg.content)}
            {/* WhatsApp-style tail on the last bubble of a group */}
            {showTime && (
              <span
                className={`absolute bottom-[-2px] left-[-1px] w-[9px] h-[9px] rounded-[1px] rotate-45 ${bubbleBg}`}
              />
            )}
            {status === "failed" && (
              <div className="absolute -top-3 left-2 inline-flex items-center gap-1 text-red-500 dark:text-red-400 text-[10px] font-medium">
                <FiAlertTriangle className="w-3 h-3" /> Failed
              </div>
            )}
          </div>
        </div>
      )}
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
  );
});

const Skeleton = ({ className = "" }) => (
  <div className={cn("animate-pulse bg-secondary-300 dark:bg-secondary-600", className)} />
);

export const MessageSkeletons = () => (
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
