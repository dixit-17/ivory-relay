export type Kind = "knight" | "bishop" | "rook" | "pawn";
export type Side = "white" | "black";
export type Cue = "move" | "score" | "form" | "pawn" | "eat" | "over";

export interface Piece {
  id: string;
  kind: Kind;
  side: Side;
  file: number;
  rank: number;
  moved: boolean;
}

export interface Square {
  file: number;
  rank: number;
}

export interface Snapshot {
  pieces: Piece[];
  score: number;
  formLeft: number | null;
  status: "play" | "over";
  seq: number;
  shake: number;
  mark: Square | null;
  pulseId?: string;
  pop?: { file: number; rank: number; text: string; key: number };
  cue?: Cue;
}

export type Rng = () => number;

const OFFICERS: readonly Kind[] = ["bishop", "rook", "knight"];
/** Points for eating a pawn, indexed by rank 1..8 stored as 0..7. */
const PAWN_POINTS = [0, 7, 6, 5, 4, 3, 2, 0];

const KNIGHT_DELTAS: readonly (readonly [number, number])[] = [
  [1, 2],
  [2, 1],
  [-1, 2],
  [-2, 1],
  [1, -2],
  [2, -1],
  [-1, -2],
  [-2, -1],
];

const BISHOP_DIRS: readonly (readonly [number, number])[] = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const ROOK_DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function squareName(file: number, rank: number): string {
  return `${"abcdefgh"[file] ?? "?"}${rank + 1}`;
}

export function kindName(kind: Kind): string {
  switch (kind) {
    case "knight":
      return "Knight";
    case "bishop":
      return "Bishop";
    case "rook":
      return "Rook";
    case "pawn":
      return "Pawn";
  }
}

export function movesLeftText(kind: Kind, formLeft: number | null): string {
  if (kind === "knight" || formLeft == null) return "Steady";
  if (formLeft === 1) return "1 move left";
  return `${formLeft} moves left`;
}

export function pawnPoints(rankIndex: number): number {
  return PAWN_POINTS[rankIndex] ?? 0;
}

function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function pieceAt(pieces: readonly Piece[], file: number, rank: number): Piece | undefined {
  return pieces.find((p) => p.file === file && p.rank === rank);
}

function clonePieces(pieces: readonly Piece[]): Piece[] {
  return pieces.map((p) => ({ ...p }));
}

function pick<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error("No square left to spawn");
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[index]!;
}

function openPawnFiles(pieces: readonly Piece[]): Square[] {
  const files = new Set(pieces.filter((p) => p.kind === "pawn").map((p) => p.file));
  return emptySquares(pieces, 1).filter((square) => !files.has(square.file));
}

function spawnPawn(
  pieces: Piece[],
  seq: number,
  rng: Rng,
): { pieces: Piece[]; seq: number; id: string } | null {
  const spots = openPawnFiles(pieces);
  if (spots.length === 0) return null;
  const spot = pick(spots, rng);
  const id = `p${seq++}`;
  return {
    seq,
    id,
    pieces: [
      ...pieces,
      { id, kind: "pawn", side: "black", file: spot.file, rank: spot.rank, moved: false },
    ],
  };
}

function pawnBlocked(pieces: readonly Piece[], pawn: Piece): boolean {
  const rank = pawn.rank + 1;
  return onBoard(pawn.file, rank) && Boolean(pieceAt(pieces, pawn.file, rank));
}

function emptySquares(pieces: readonly Piece[], onlyRank?: number): Square[] {
  const taken = new Set(pieces.map((p) => `${p.file},${p.rank}`));
  const out: Square[] = [];
  for (let file = 0; file < 8; file++) {
    for (let rank = 0; rank < 8; rank++) {
      if (onlyRank !== undefined && rank !== onlyRank) continue;
      if (taken.has(`${file},${rank}`)) continue;
      out.push({ file, rank });
    }
  }
  return out;
}

function playerOf(pieces: readonly Piece[]): Piece | undefined {
  return pieces.find((p) => p.side === "white");
}

export function deal(rng: Rng = Math.random): Snapshot {
  const pieces: Piece[] = [
    { id: "player", kind: "knight", side: "white", file: 1, rank: 0, moved: false },
  ];
  let seq = 1;
  for (let i = 0; i < 5; i++) {
    const spot = pick(emptySquares(pieces), rng);
    const kind = pick(OFFICERS, rng);
    pieces.push({
      id: `o${seq++}`,
      kind,
      side: "black",
      file: spot.file,
      rank: spot.rank,
      moved: false,
    });
  }
  for (let i = 0; i < 2; i++) {
    const spot = pick(emptySquares(pieces, 1), rng);
    pieces.push({
      id: `p${seq++}`,
      kind: "pawn",
      side: "black",
      file: spot.file,
      rank: spot.rank,
      moved: false,
    });
  }
  return {
    pieces,
    score: 0,
    formLeft: null,
    status: "play",
    seq,
    shake: 0,
    mark: null,
  };
}

export function legalTargets(state: Snapshot): Square[] {
  if (state.status !== "play") return [];
  const player = playerOf(state.pieces);
  if (!player) return [];
  if (player.kind === "knight") {
    const out: Square[] = [];
    for (const [df, dr] of KNIGHT_DELTAS) {
      const file = player.file + df;
      const rank = player.rank + dr;
      if (!onBoard(file, rank)) continue;
      const occ = pieceAt(state.pieces, file, rank);
      if (occ && occ.side === "white") continue;
      out.push({ file, rank });
    }
    return out;
  }
  const dirs = player.kind === "bishop" ? BISHOP_DIRS : ROOK_DIRS;
  const out: Square[] = [];
  for (const [df, dr] of dirs) {
    let file = player.file + df;
    let rank = player.rank + dr;
    while (onBoard(file, rank)) {
      const occ = pieceAt(state.pieces, file, rank);
      if (!occ) {
        out.push({ file, rank });
      } else {
        if (occ.side === "black") out.push({ file, rank });
        break;
      }
      file += df;
      rank += dr;
    }
  }
  return out;
}

function tickForm(kind: Kind, formLeft: number | null): { kind: Kind; formLeft: number | null } {
  if (formLeft == null) return { kind, formLeft: null };
  const left = formLeft - 1;
  if (left <= 0) return { kind: "knight", formLeft: null };
  return { kind, formLeft: left };
}

function freeze(state: Snapshot): Snapshot {
  return {
    ...state,
    pieces: clonePieces(state.pieces),
    mark: state.mark ? { ...state.mark } : null,
    pop: state.pop ? { ...state.pop } : undefined,
  };
}

interface PawnStep {
  pieces: Piece[];
  seq: number;
  changed: boolean;
  ate: boolean;
  mark: Square | null;
  pawnId: string;
  reached: boolean;
}

function stepPawn(pieces: Piece[], id: string, seq: number): PawnStep {
  const pawn = pieces.find((p) => p.id === id);
  const idle: PawnStep = {
    pieces,
    seq,
    changed: false,
    ate: false,
    mark: null,
    pawnId: id,
    reached: false,
  };
  if (!pawn || pawn.kind !== "pawn") return idle;

  const rank = pawn.rank + 1;
  if (!onBoard(pawn.file, rank) || pieceAt(pieces, pawn.file, rank)) return idle;

  const next = pieces.map((p) => (p.id === id ? { ...p, rank, moved: true } : p));
  return {
    pieces: next,
    seq,
    changed: true,
    ate: false,
    mark: { file: pawn.file, rank },
    pawnId: id,
    reached: rank === 7,
  };
}

/** Every free pawn steps, file order. Rank 8 ends the run before later pawns act. */
export function advancePawns(state: Snapshot, rng: Rng = Math.random): Snapshot[] {
  let pieces = clonePieces(state.pieces);
  let seq = state.seq;
  const order = pieces
    .filter((p) => p.kind === "pawn")
    .sort((a, b) => a.file - b.file || a.rank - b.rank || (a.id < b.id ? -1 : 1))
    .map((p) => p.id);

  const frames: Snapshot[] = [];
  for (const id of order) {
    if (!pieces.some((p) => p.id === id)) continue;
    const step = stepPawn(pieces, id, seq);
    if (!step.changed) continue;
    pieces = step.pieces;
    seq = step.seq;
    const over = step.reached;
    frames.push(
      freeze({
        pieces,
        score: state.score,
        formLeft: state.formLeft,
        status: over ? "over" : "play",
        seq,
        shake: over ? 0.72 : step.ate ? 0.4 : 0.16,
        mark: step.mark,
        pulseId: step.pawnId,
        cue: over ? "over" : step.ate ? "eat" : "pawn",
      }),
    );
    if (over) return frames;
  }

  const pawns = pieces.filter((p) => p.kind === "pawn");
  const stuck = pawns.filter((pawn) => pawnBlocked(pieces, pawn));
  if (stuck.length >= 2 && pawns.length < 8) {
    const born = spawnPawn(pieces, seq, rng);
    if (born) {
      pieces = born.pieces;
      seq = born.seq;
      const baby = pieces.find((p) => p.id === born.id)!;
      frames.push(
        freeze({
          pieces,
          score: state.score,
          formLeft: state.formLeft,
          status: "play",
          seq,
          shake: 0.16,
          mark: { file: baby.file, rank: baby.rank },
          pulseId: baby.id,
          cue: "pawn",
        }),
      );
    }
  }
  return frames;
}

/** Apply one landing, then let every pawn step. Null if the tap is illegal. */
export function playTurn(state: Snapshot, file: number, rank: number, rng: Rng = Math.random): Snapshot[] | null {
  if (state.status !== "play") return null;
  const player = playerOf(state.pieces);
  if (!player) return null;
  const legal = legalTargets(state);
  if (!legal.some((s) => s.file === file && s.rank === rank)) return null;

  let pieces = clonePieces(state.pieces);
  let seq = state.seq;
  let score = state.score;
  let formLeft = state.formLeft;
  let kind = player.kind;
  let shake = 0.12;
  let cue: Cue = "move";
  let pop: Snapshot["pop"];

  const captured = pieceAt(pieces, file, rank);
  if (captured) pieces = pieces.filter((p) => p.id !== captured.id);
  pieces = pieces.map((p) => (p.id === player.id ? { ...p, file, rank } : p));

  if (captured?.kind === "pawn") {
    const gained = pawnPoints(captured.rank);
    score += gained;
    pop = { file, rank, text: `+${gained}`, key: seq };
    shake = 0.48;
    cue = "score";
    const before = pieces.filter((p) => p.kind === "pawn").length + 1;
    if (before <= 2) {
      const born = spawnPawn(pieces, seq, rng);
      if (born) {
        pieces = born.pieces;
        seq = born.seq;
      }
    }
    const formed = tickForm(kind, formLeft);
    kind = formed.kind;
    formLeft = formed.formLeft;
  } else if (captured) {
    kind = captured.kind;
    formLeft = kind === "knight" ? null : 3;
    shake = 0.58;
    cue = "form";
    const spawnKind = pick(OFFICERS, rng);
    const spot = pick(emptySquares(pieces), rng);
    pieces = [
      ...pieces,
      {
        id: `o${seq++}`,
        kind: spawnKind,
        side: "black",
        file: spot.file,
        rank: spot.rank,
        moved: false,
      },
    ];
  } else {
    const formed = tickForm(kind, formLeft);
    kind = formed.kind;
    formLeft = formed.formLeft;
  }

  pieces = pieces.map((p) => (p.id === player.id ? { ...p, kind } : p));

  const afterPlayer = freeze({
    pieces,
    score,
    formLeft,
    status: "play",
    seq,
    shake,
    mark: { file, rank },
    pulseId: player.id,
    pop,
    cue,
  });

  const pawnFrames = advancePawns(afterPlayer, rng);
  return [afterPlayer, ...pawnFrames];
}
