import type { Cue } from "@/lib/game/rules";

let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
}

export function resumeAudio(): void {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0): void {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp);
  amp.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function playCue(cue: Cue | undefined): void {
  if (!cue || !ctx) return;
  switch (cue) {
    case "move":
      tone(494, 0.07, "sine", 0.035);
      break;
    case "score":
      tone(659, 0.09, "triangle", 0.05);
      tone(880, 0.12, "sine", 0.04, 0.07);
      break;
    case "form":
      tone(392, 0.14, "triangle", 0.045);
      tone(587, 0.16, "sine", 0.03, 0.04);
      break;
    case "pawn":
      tone(174, 0.06, "sine", 0.03);
      break;
    case "eat":
      tone(146, 0.1, "triangle", 0.045);
      tone(220, 0.08, "sine", 0.03, 0.05);
      break;
    case "over":
      tone(440, 0.14, "sine", 0.04);
      tone(330, 0.16, "triangle", 0.04, 0.12);
      tone(220, 0.28, "sine", 0.045, 0.24);
      break;
  }
}
