import { useEffect, useMemo, useRef, useState } from "react";
import {
  deal,
  kindName,
  legalTargets,
  movesLeftText,
  playTurn,
  squareName,
  type Snapshot,
} from "@/lib/game/rules";
import { Glyph } from "@/components/ivory/pieces";
import { playCue, resumeAudio, unlockAudio } from "@/components/ivory/sound";

const BEST_KEY = "ivory-relay-best";
const STEP_MS = 420;

interface FloatText {
  file: number;
  rank: number;
  text: string;
  key: number;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function IvoryRelay() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [best, setBest] = useState(0);
  const [busy, setBusy] = useState(false);
  const [freshBest, setFreshBest] = useState(false);
  const [floatText, setFloatText] = useState<FloatText | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState(0);
  const boardRef = useRef<HTMLDivElement>(null);
  const dealRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<number[]>([]);
  const snapRef = useRef<Snapshot | null>(null);
  const bestRef = useRef(0);
  snapRef.current = snap;
  bestRef.current = best;

  function clearTimers() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
  }

  useEffect(() => {
    const stored = Number(window.localStorage.getItem(BEST_KEY) || "0");
    const nextBest = Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
    setBest(nextBest);
    bestRef.current = nextBest;
    setSnap(deal());
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") resumeAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    window.__ivory = {
      snapshot: () => snapRef.current,
      load: (next: Snapshot) => {
        clearTimers();
        setBusy(false);
        setFreshBest(false);
        setFloatText(null);
        setSnap(next);
      },
    };
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearTimers();
      delete window.__ivory;
    };
  }, []);

  useEffect(() => {
    const measure = () => {
      const shell = document.querySelector(".shell");
      const hud = document.querySelector(".hud");
      const form = document.querySelector(".formbar");
      const hint = document.querySelector(".hint");
      if (!(shell instanceof HTMLElement) || !hud || !form || !hint) return;
      const cs = getComputedStyle(shell);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const gap = parseFloat(cs.rowGap || cs.gap || "0") || 0;
      const chrome =
        hud.getBoundingClientRect().height +
        form.getBoundingClientRect().height +
        hint.getBoundingClientRect().height;
      const availH = shell.getBoundingClientRect().height - padY - chrome - gap * 3 - 6;
      const availW = shell.clientWidth - padX;
      const next = Math.floor(Math.min(availW, Math.max(0, availH)));
      if (next < 8) return;
      setSide((prev) => (Math.abs(prev - next) < 2 ? prev : next));
    };
    measure();
    const shell = document.querySelector(".shell");
    const observer = new ResizeObserver(measure);
    if (shell) observer.observe(shell);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    if (snap?.status === "over") dealRef.current?.focus();
  }, [snap?.status]);

  useEffect(() => {
    const el = boardRef.current;
    if (!el || !snap || snap.shake <= 0 || reducedMotion()) {
      if (el) el.style.transform = "";
      return;
    }
    let trauma = snap.shake;
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      trauma = Math.max(0, trauma - dt * 2.1);
      const mag = trauma * trauma;
      const x = (Math.random() * 2 - 1) * 6 * mag;
      const y = (Math.random() * 2 - 1) * 5 * mag;
      el.style.transform = mag > 0.002 ? `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)` : "";
      if (trauma > 0.02) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [snap]);

  function noteBest(score: number) {
    const prev = bestRef.current;
    if (score > prev) {
      bestRef.current = score;
      setBest(score);
      window.localStorage.setItem(BEST_KEY, String(score));
      if (score > 0) setFreshBest(true);
    }
  }

  function show(frame: Snapshot) {
    setSnap(frame);
    playCue(frame.cue);
    if (frame.pop) setFloatText(frame.pop);
    if (frame.status === "over") noteBest(frame.score);
  }

  function run(frames: Snapshot[]) {
    unlockAudio();
    clearTimers();
    if (reducedMotion()) {
      for (const frame of frames) show(frame);
      setBusy(false);
      return;
    }
    show(frames[0]!);
    if (frames.length === 1) {
      setBusy(false);
      return;
    }
    setBusy(true);
    let index = 1;
    const tick = () => {
      show(frames[index]!);
      index += 1;
      if (index < frames.length) {
        timers.current.push(window.setTimeout(tick, STEP_MS));
      } else {
        setBusy(false);
      }
    };
    timers.current.push(window.setTimeout(tick, STEP_MS));
  }

  function onSquare(file: number, rank: number) {
    if (!snap || busy || snap.status !== "play") return;
    const frames = playTurn(snap, file, rank);
    if (!frames) return;
    run(frames);
  }

  function redeal() {
    clearTimers();
    setBusy(false);
    setFreshBest(false);
    setFloatText(null);
    setSnap(deal());
  }

  const player = snap?.pieces.find((p) => p.side === "white");
  const formKind = player?.kind ?? "knight";
  const formLeft = snap?.formLeft ?? null;
  const score = snap?.score ?? 0;
  const over = snap?.status === "over";

  const legal = useMemo(() => {
    if (!snap || snap.status !== "play") return new Set<string>();
    return new Set(legalTargets(snap).map((s) => `${s.file},${s.rank}`));
  }, [snap]);

  const ranks = [7, 6, 5, 4, 3, 2, 1, 0];
  const files = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <main className="shell">
      <header className="hud">
        <div className="titleblock">
          <h1>Ivory Relay</h1>
          <p className="tag">Stop the discs before rank 8.</p>
        </div>
        <div className="scorebox">
          <p className="score" aria-live="polite">
            {score}
          </p>
          <p className="best">Best {best}</p>
        </div>
      </header>

      <section className="formbar" aria-live="polite">
        <span className="formtoken">
          <Glyph kind={formKind} side="white" />
        </span>
        <div className="formcopy">
          <p className="formname">{kindName(formKind)}</p>
          <p className="formsub">{movesLeftText(formKind, formLeft)}</p>
        </div>
        {formLeft != null && (
          <div className="pips" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <i key={n} className={n <= formLeft ? "on" : ""} />
            ))}
          </div>
        )}
      </section>

      <div className={`stage${over ? " ended" : ""}`} ref={stageRef}>
        <div
          className="board-wrap"
          ref={boardRef}
          style={side > 0 ? { width: side, height: side } : undefined}
        >
          <div className="ranks" aria-hidden="true">
            {ranks.map((rank) => (
              <span key={rank}>{rank + 1}</span>
            ))}
          </div>
          <div className={`grid${busy ? " busy" : ""}`} data-status={snap?.status ?? "deal"}>
            {ranks.map((rank) =>
              files.map((file) => {
                const occ = snap?.pieces.find((p) => p.file === file && p.rank === rank);
                const key = `${file},${rank}`;
                const isLegal = legal.has(key);
                const dark = (file + rank) % 2 === 0;
                const last = snap?.mark?.file === file && snap?.mark?.rank === rank;
                const hot = occ?.kind === "pawn" && occ.rank === 6;
                const cls = [
                  "sq",
                  dark ? "dark" : "light",
                  isLegal ? "legal" : "",
                  isLegal && occ ? "take" : "",
                  last ? "last" : "",
                  occ?.side === "white" ? "you" : "",
                  hot ? "hot" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const name = squareName(file, rank);
                let label = `${name}, empty`;
                if (occ?.side === "white") label = `${name}, your ${occ.kind}`;
                else if (isLegal && occ) label = `${name}, legal, take black ${occ.kind}`;
                else if (isLegal) label = `${name}, legal landing`;
                else if (occ) label = `${name}, black ${occ.kind}`;
                return (
                  <button key={key} type="button" className={cls} aria-label={label} data-legal={isLegal ? "true" : "false"} data-file={file} data-rank={rank} onClick={() => onSquare(file, rank)}>
                    {isLegal && !occ && <span className="dot" />}
                  </button>
                );
              }),
            )}
            <div className="pieces">
              {snap?.pieces.map((p) => (
                <div
                  key={p.id}
                  className={`piece${snap.pulseId === p.id ? " pulse" : ""}`}
                  data-side={p.side}
                  data-kind={p.kind}
                  data-file={p.file}
                  data-rank={p.rank}
                  style={{ left: `${p.file * 12.5}%`, top: `${(7 - p.rank) * 12.5}%` }}
                >
                  <Glyph key={p.kind} kind={p.kind} side={p.side} />
                </div>
              ))}
              {floatText && (
                <span
                  key={floatText.key}
                  className="pop"
                  style={{ left: `${(floatText.file + 0.5) * 12.5}%`, top: `${(7 - floatText.rank) * 12.5}%` }}
                >
                  {floatText.text}
                </span>
              )}
            </div>
          </div>
          <div className="files" aria-hidden="true">
            {"abcdefgh".split("").map((file) => (
              <span key={file}>{file}</span>
            ))}
          </div>
        </div>

        {over && (
          <div className="veil">
            <div className="card" role="dialog" aria-labelledby="end-title">
              <p className="eyebrow">Run over</p>
              <h2 id="end-title">Eighth rank</h2>
              <p className="endcopy">A pawn reached rank 8.</p>
              <p className="endscore">{score}</p>
              <p className="endbest">{freshBest ? "New best" : `Best ${best}`}</p>
              <button ref={dealRef} type="button" className="deal" onClick={redeal}>
                Deal a new board
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="hint">Tap a lit square. Discs march after you — 7 on rank 2, down to 2.</p>
    </main>
  );
}

declare global {
  interface Window {
    __ivory?: {
      snapshot: () => Snapshot | null;
      load: (next: Snapshot) => void;
    };
  }
}
