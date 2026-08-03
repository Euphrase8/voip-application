const MUTE_KEY = "chat_sound_muted";

let muted = false;
let audioCtx = null;

if (typeof window !== "undefined") {
  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "true";
  } catch (e) {
    muted = false;
  }
}

const ensureContext = () => {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
};

// Subtle, friendly "pop" used for incoming chat messages. Synthesized with the
// Web Audio API so no audio asset has to be bundled or downloaded.
export const playMessageSound = () => {
  if (muted) return;
  try {
    const ctx = ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.11);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  } catch (e) {
    // Notifications are best-effort; never break the chat because of audio.
  }
};

export const isChatSoundMuted = () => muted;

export const setChatSoundMuted = (value) => {
  muted = Boolean(value);
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "true" : "false");
  } catch (e) {
    // Ignore storage failures (private browsing, etc.)
  }
  return muted;
};
