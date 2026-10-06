import type { Kind, Side } from "@/lib/game/rules";

export function Glyph({ kind, side }: { kind: Kind; side: Side }) {
  const tone = side === "white" ? "white" : "black";
  return (
    <svg viewBox="0 0 64 64" className={`glyph ${tone}${kind === "pawn" ? " pawn" : ""}`} aria-hidden="true">
      {kind === "knight" && <path d="M16 14h14v20h18v14H16V14z" />}
      {kind === "bishop" && (
        <path
          fillRule="evenodd"
          d="M32 6 56 32 32 58 8 32Z M38 32a6 6 0 1 1-12 0 6 6 0 0 1 12 0"
        />
      )}
      {kind === "rook" && <path d="M14 24V14h8v10h6V14h8v10h6V14h8v38H14V24z" />}
      {kind === "pawn" && (
        <>
          <path d="M32 4 40 15H24Z" />
          <circle cx="32" cy="30" r="11" />
          <rect x="18" y="46" width="28" height="8" rx="2" />
        </>
      )}
    </svg>
  );
}
