// Web-Audio ringtones so the app does not depend on any audio asset.
//  - startRingtone(): WhatsApp-style two-tone incoming ring (looped)
//  - startRingback(): softer single-tone outgoing ringback (looped)
//  - stopRinging():  stops any tone currently playing

let audioContext = null;
let intervalId = null;
let activeMode = null;

function getContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

function playTone(context, freq, startOffset, duration, gainValue) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, context.currentTime + startOffset);

  gain.gain.setValueAtTime(0.0001, context.currentTime + startOffset);
  gain.gain.exponentialRampToValueAtTime(gainValue, context.currentTime + startOffset + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + startOffset + duration);

  osc.connect(gain);
  gain.connect(context.destination);

  osc.start(context.currentTime + startOffset);
  osc.stop(context.currentTime + startOffset + duration + 0.05);
}

// Incoming call: "ring ring" pair repeated every ~6 seconds.
function scheduleIncomingBurst(context, startOffset) {
  playTone(context, 1000, startOffset, 0.5, 0.12);
  playTone(context, 1450, startOffset, 0.5, 0.12);
  playTone(context, 1000, startOffset + 0.7, 0.5, 0.12);
  playTone(context, 1450, startOffset + 0.7, 0.5, 0.12);
}

// Outgoing ringback: single soft pulse every ~4 seconds.
function scheduleRingbackBurst(context, startOffset) {
  playTone(context, 440, startOffset, 0.4, 0.05);
  playTone(context, 440, startOffset + 0.5, 0.4, 0.05);
}

function startLoop(scheduler, intervalMs, mode) {
  const context = getContext();
  if (!context) return;

  stopRinging();

  activeMode = mode;
  scheduler(context, 0.05);
  intervalId = setInterval(() => {
    const ctx = getContext();
    if (!ctx) return;
    scheduler(ctx, 0.05);
  }, intervalMs);
}

export function startRingtone() {
  startLoop(scheduleIncomingBurst, 6000, "ringtone");
}

export function startRingback() {
  startLoop(scheduleRingbackBurst, 4000, "ringback");
}

export function stopRinging() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  activeMode = null;
}

export function isRinging() {
  return activeMode !== null;
}

export function currentMode() {
  return activeMode;
}
