/** Short two-tone alert for new customer-service messages (no asset file). */

type AudioContextCtor = typeof AudioContext;

let sharedContext: AudioContext | null = null;
let unlockBound = false;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ||
    null
  );
}

function ensureContext(): AudioContext | null {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return null;
  if (!sharedContext || sharedContext.state === 'closed') {
    sharedContext = new Ctor();
  }
  if (sharedContext.state === 'suspended') {
    void sharedContext.resume();
  }
  return sharedContext;
}

/** Call once so browsers allow sound after the first click/keypress. */
export function unlockCustomerServiceAlertAudio(): void {
  if (unlockBound || typeof document === 'undefined') return;
  unlockBound = true;
  const unlock = () => {
    const ctx = ensureContext();
    if (ctx?.state === 'suspended') void ctx.resume();
  };
  document.addEventListener('pointerdown', unlock, { once: true, capture: true });
  document.addEventListener('keydown', unlock, { once: true, capture: true });
}

export function playCustomerServiceAlert(): void {
  try {
    unlockCustomerServiceAlertAudio();
    const ctx = ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const playTone = (frequency: number, start: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, now + start);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + duration + 0.04);
    };

    playTone(880, 0, 0.11);
    playTone(1175, 0.13, 0.16);
  } catch {
    /* ignore autoplay / AudioContext errors */
  }
}
