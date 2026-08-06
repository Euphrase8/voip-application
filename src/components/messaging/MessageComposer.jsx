import { useEffect, useRef, useState } from "react";
import { FiSend, FiSmile, FiX } from "react-icons/fi";

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😜",
  "🤔", "😎", "🥳", "😢", "😭", "😡", "👍", "👎",
  "👏", "🙏", "💪", "🤝", "👋", "✌️", "🤞", "🫶",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔",
  "🔥", "✨", "⭐", "🌟", "💯", "✅", "❌", "❗",
  "🎉", "🎊", "🎂", "🍕", "🍔", "☕", "🍺", "🥂",
  "🌹", "🌸", "🌈", "☀️", "🌙", "⚡", "🚀", "🎯",
  "💰", "📞", "📷", "🎵", "🏠", "🐱", "🐶", "👀",
];

function MessageComposer({ dark, value, onChange, onSend, textareaRef, placeholder = "Type a message", disabled }) {
  const [showEmoji, setShowEmoji] = useState(false);
  const composerRef = useRef(null);

  const canSend = !disabled && value.trim().length > 0;

  // Close the emoji panel when clicking anywhere outside the composer.
  useEffect(() => {
    if (!showEmoji) return;
    const onDocClick = (e) => {
      if (composerRef.current && !composerRef.current.contains(e.target)) setShowEmoji(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showEmoji]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const insertEmoji = (emoji) => {
    const ta = textareaRef?.current;
    if (ta) {
      const start = ta.selectionStart ?? value.length;
      const end = ta.selectionEnd ?? value.length;
      const next = value.slice(0, start) + emoji + value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        ta.focus();
        const pos = start + emoji.length;
        ta.setSelectionRange(pos, pos);
      });
    } else {
      onChange(value + emoji);
    }
  };

  return (
    <div
      ref={composerRef}
      className={`px-3 md:px-4 py-3 border-t relative ${
        dark ? "bg-secondary-800 border-secondary-700" : "bg-secondary-50 border-secondary-200"
      }`}
    >
      {/* Emoji picker */}
      {showEmoji && (
        <div
          className={`absolute bottom-full left-3 right-3 sm:right-16 sm:left-auto mb-2 w-[320px] max-w-[calc(100vw-24px)] rounded-2xl shadow-2xl border p-2.5 animate-fade-in z-30 ${
            dark ? "bg-secondary-800 border-secondary-700" : "bg-white border-secondary-100"
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${dark ? "text-secondary-400" : "text-secondary-500"}`}>
              Emoji
            </span>
            <button
              onClick={() => setShowEmoji(false)}
              className={`p-1 rounded-full ${dark ? "hover:bg-secondary-700 text-secondary-400" : "hover:bg-secondary-100 text-secondary-500"}`}
              title="Close"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-8 gap-0.5 max-h-[220px] overflow-y-auto custom-scrollbar">
            {EMOJIS.map((emoji, i) => (
              <button
                key={`${emoji}-${i}`}
                onClick={() => insertEmoji(emoji)}
                className="text-[22px] p-1 rounded-lg hover:bg-secondary-100 dark:hover:bg-secondary-700 transition-colors"
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-2xl pl-3.5 pr-1.5 py-1.5 border focus-within:ring-2 focus-within:ring-[#00a884]/30 transition-shadow ${
          dark
            ? "bg-secondary-900 border-secondary-700"
            : "bg-white border-secondary-200 shadow-sm"
        }`}
      >
        <button
          onClick={() => setShowEmoji((s) => !s)}
          className={`p-2 -ml-1.5 rounded-full transition-colors mb-auto mt-1.5 ${
            showEmoji
              ? "text-[#00a884]"
              : dark
                ? "text-secondary-400 hover:bg-secondary-700"
                : "text-secondary-500 hover:bg-secondary-100"
          }`}
          title="Emoji"
        >
          <FiSmile className="w-[22px] h-[22px]" />
        </button>
        <textarea
          ref={textareaRef}
          rows={1}
          maxLength={5000}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex-1 bg-transparent text-sm outline-none resize-none py-1.5 max-h-[130px] ${
            dark ? "text-white placeholder-secondary-500" : "text-secondary-900 placeholder-secondary-400"
          }`}
        />
        <button
          onClick={onSend}
          disabled={!canSend}
          className="p-2.5 rounded-full bg-[#00a884] text-white hover:bg-[#008f70] disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg active:scale-95"
          title="Send"
        >
          <FiSend className="w-[18px] h-[18px]" />
        </button>
      </div>
      <p className="text-[10px] text-secondary-400 dark:text-secondary-500 mt-1.5 text-center">
        Enter to send · Shift + Enter for a new line
      </p>
    </div>
  );
}

export default MessageComposer;
