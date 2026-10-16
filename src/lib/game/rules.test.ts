import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advancePawns,
  deal,
  legalTargets,
  playTurn,
  type Kind,
  type Piece,
  type Rng,
  type Snapshot,
} from "./rules.ts";

function piece(partial: Omit<Piece, "moved"> & { moved?: boolean }): Piece {
  return { moved: false, ...partial };
}

function hand(pieces: Piece[], extra: Partial<Snapshot> = {}): Snapshot {
  return {
    pieces,
    score: 0,
    formLeft: null,
    status: "play",
    seq: 40,
    shake: 0,
    mark: null,
    ...extra,
  };
}

function player(kind: Kind, file: number, rank: number): Piece {
  return piece({ id: "player", kind, side: "white", file, rank });
}

function at(state: Snapshot, id: string): Piece {
  const found = state.pieces.find((p) => p.id === id);
  assert.ok(found, id);
  return found;
}

function boom(): number {
  throw new Error("rng should not be called");
}

test("deal puts a white knight on b1, five officers, two rank-2 pawns", () => {
  for (let i = 0; i < 80; i++) {
    const state = deal();
    const squares = new Set(state.pieces.map((p) => `${p.file},${p.rank}`));
    assert.equal(squares.size, 8);
    assert.equal(state.pieces.length, 8);
    const white = state.pieces.filter((p) => p.side === "white");
    assert.equal(white.length, 1);
    assert.equal(white[0]!.kind, "knight");
    assert.equal(white[0]!.file, 1);
    assert.equal(white[0]!.rank, 0);
    const pawns = state.pieces.filter((p) => p.kind === "pawn");
    assert.equal(pawns.length, 2);
    assert.ok(pawns.every((p) => p.side === "black" && p.rank === 1 && !p.moved));
    const officers = state.pieces.filter((p) => p.side === "black" && p.kind !== "pawn");
    assert.equal(officers.length, 5);
    assert.ok(officers.every((p) => p.kind === "bishop" || p.kind === "rook" || p.kind === "knight"));
  }
});

test("knight on b1 lands on a3, c3, and d2 only", () => {
  const state = hand([player("knight", 1, 0)]);
  const names = legalTargets(state).map((s) => `${s.file},${s.rank}`);
  assert.deepEqual(names, ["2,2", "3,1", "0,2"]);
});

test("illegal taps do nothing", () => {
  const state = hand([player("knight", 1, 0), piece({ id: "p", kind: "pawn", side: "black", file: 4, rank: 1 })]);
  assert.equal(playTurn(state, 1, 1), null);
  assert.equal(playTurn(state, 4, 4), null);
  assert.equal(state.pieces[0]!.file, 1);
});

test("a bishop stops on the first piece and does not pass it", () => {
  const state = hand([
    player("bishop", 0, 0),
    piece({ id: "b", kind: "knight", side: "black", file: 2, rank: 2 }),
  ]);
  const names = legalTargets(state).map((s) => `${s.file},${s.rank}`);
  assert.deepEqual(names, ["1,1", "2,2"]);
});

test("a rook stops on the first piece along a rank or file", () => {
  const state = hand([
    player("rook", 0, 3),
    piece({ id: "up", kind: "knight", side: "black", file: 0, rank: 5 }),
    piece({ id: "right", kind: "knight", side: "black", file: 2, rank: 3 }),
  ]);
  const names = legalTargets(state).map((s) => `${s.file},${s.rank}`);
  assert.deepEqual(names, ["1,3", "2,3", "0,4", "0,5", "0,2", "0,1", "0,0"]);
});

test("a knight jumps occupied squares", () => {
  const state = hand([
    player("knight", 1, 0),
    piece({ id: "a", kind: "pawn", side: "black", file: 1, rank: 1 }),
    piece({ id: "b", kind: "pawn", side: "black", file: 2, rank: 1 }),
    piece({ id: "c", kind: "pawn", side: "black", file: 0, rank: 1 }),
  ]);
  const names = legalTargets(state).map((s) => `${s.file},${s.rank}`);
  assert.ok(names.includes("0,2"));
  assert.ok(names.includes("2,2"));
  assert.ok(names.includes("3,1"));
});

test("eating a rank-2 pawn scores 7 and replaces it on rank 2", () => {
  const state = hand([
    player("knight", 1, 0),
    piece({ id: "meal", kind: "pawn", side: "black", file: 3, rank: 1 }),
    piece({ id: "other", kind: "pawn", side: "black", file: 7, rank: 1 }),
  ]);
  const frames = playTurn(state, 3, 1, () => 0);
  assert.ok(frames);
  const first = frames[0]!;
  assert.equal(first.score, 7);
  assert.equal(first.pop?.text, "+7");
  assert.equal(at(first, "player").kind, "knight");
  assert.equal(at(first, "player").file, 3);
  assert.equal(first.pieces.filter((p) => p.kind === "pawn").length, 2);
  const spawned = first.pieces.find((p) => p.kind === "pawn" && p.id !== "other");
  assert.ok(spawned);
  assert.equal(spawned.rank, 1);
  assert.notEqual(spawned.file, 7);
  assert.notEqual(`${spawned.file},${spawned.rank}`, "3,1");
  assert.ok(first.pieces.every((p, i, all) => all.findIndex((q) => q.file === p.file && q.rank === p.rank) === i));
});

test("pawn points fall from 7 on rank 2 to 2 on rank 7", () => {
  const expectations: [number, number][] = [
    [1, 7],
    [2, 6],
    [3, 5],
    [4, 4],
    [5, 3],
    [6, 2],
  ];
  for (const [rank, points] of expectations) {
    const state = hand(
      [player("rook", 0, rank), piece({ id: "meal", kind: "pawn", side: "black", file: 1, rank })],
      { formLeft: 3 },
    );
    const frames = playTurn(state, 1, rank, () => 0);
    assert.equal(frames?.[0]?.score, points);
  }
});

test("eating a rook becomes a rook for three moves and replaces an officer", () => {
  const state = hand([
    player("knight", 1, 0),
    piece({ id: "meal", kind: "rook", side: "black", file: 2, rank: 2 }),
  ]);
  const frames = playTurn(state, 2, 2, () => 0);
  assert.ok(frames);
  const next = frames[0]!;
  assert.equal(at(next, "player").kind, "rook");
  assert.equal(at(next, "player").side, "white");
  assert.equal(next.formLeft, 3);
  assert.equal(next.score, 0);
  assert.equal(next.pieces.some((p) => p.id === "meal"), false);
  const spawned = next.pieces.find((p) => p.side === "black");
  assert.ok(spawned);
  assert.ok(spawned.kind === "bishop" || spawned.kind === "rook" || spawned.kind === "knight");
  assert.notEqual(spawned.file === 2 && spawned.rank === 2, true);
});

test("capturing an officer freezes the pawns so the player moves again", () => {
  const state = hand([
    player("knight", 1, 0),
    piece({ id: "meal", kind: "bishop", side: "black", file: 2, rank: 2 }),
    piece({ id: "p", kind: "pawn", side: "black", file: 4, rank: 1 }),
  ]);
  const frames = playTurn(state, 2, 2, () => 0);
  assert.ok(frames);
  assert.equal(frames.length, 1);
  assert.equal(at(frames[0]!, "p").file, 4);
  assert.equal(at(frames[0]!, "p").rank, 1);
  assert.equal(at(frames[0]!, "player").kind, "bishop");
  assert.equal(frames[0]!.formLeft, 3);
});

test("a rook or bishop form lasts three player moves, then the knight returns", () => {
  let state = hand([player("rook", 0, 0)], { formLeft: 3 });
  const steps: [number, number][] = [
    [1, 0],
    [2, 0],
    [3, 0],
  ];
  const lefts: (number | null)[] = [];
  const kinds: Kind[] = [];
  for (const [file, rank] of steps) {
    const frames = playTurn(state, file, rank, boom);
    assert.ok(frames);
    state = frames[frames.length - 1]!;
    lefts.push(state.formLeft);
    kinds.push(at(state, "player").kind);
  }
  assert.deepEqual(lefts, [2, 1, null]);
  assert.deepEqual(kinds, ["rook", "rook", "knight"]);
});

test("capturing another officer refreshes the form instead of expiring it", () => {
  const state = hand(
    [player("rook", 0, 3), piece({ id: "meal", kind: "bishop", side: "black", file: 0, rank: 5 })],
    { formLeft: 1 },
  );
  const frames = playTurn(state, 0, 5, () => 0);
  assert.equal(frames?.[0] && at(frames[0], "player").kind, "bishop");
  assert.equal(frames?.[0]?.formLeft, 3);
});

test("capturing a knight clears the timer", () => {
  const state = hand(
    [player("bishop", 0, 0), piece({ id: "meal", kind: "knight", side: "black", file: 1, rank: 1 })],
    { formLeft: 2 },
  );
  const frames = playTurn(state, 1, 1, () => 0);
  assert.equal(frames?.[0] && at(frames[0], "player").kind, "knight");
  assert.equal(frames?.[0]?.formLeft, null);
});

test("a pawn always steps one square, never two", () => {
  const start = hand([
    player("knight", 7, 0),
    piece({ id: "p", kind: "pawn", side: "black", file: 4, rank: 1 }),
  ]);
  const first = advancePawns(start, () => 0.9);
  assert.equal(at(first[0]!, "p").rank, 2);
  assert.equal(at(first[0]!, "p").file, 4);
  assert.equal(at(first[0]!, "p").moved, true);

  const later = hand([
    player("knight", 7, 0),
    piece({ id: "p", kind: "pawn", side: "black", file: 4, rank: 2, moved: true }),
  ]);
  const stepped = advancePawns(later, boom);
  assert.equal(at(stepped[0]!, "p").rank, 3);
  assert.equal(at(stepped[0]!, "p").file, 4);
});

test("every free pawn steps", () => {
  const state = hand([
    player("knight", 7, 0),
    piece({ id: "left", kind: "pawn", side: "black", file: 1, rank: 2, moved: true }),
    piece({ id: "right", kind: "pawn", side: "black", file: 4, rank: 2, moved: true }),
  ]);
  const frames = advancePawns(state, boom);
  assert.equal(frames.length, 2);
  assert.equal(at(frames[1]!, "left").rank, 3);
  assert.equal(at(frames[1]!, "right").rank, 3);
});

test("a blocked pawn stays, even when a forward diagonal is empty", () => {
  const state = hand([
    player("knight", 7, 0),
    piece({ id: "p", kind: "pawn", side: "black", file: 4, rank: 1 }),
    piece({ id: "block", kind: "knight", side: "black", file: 4, rank: 2 }),
  ]);
  assert.equal(advancePawns(state, boom).length, 0);
  assert.equal(at(state, "p").file, 4);
  assert.equal(at(state, "p").rank, 1);

  const clear = hand([
    player("knight", 7, 0),
    piece({ id: "p", kind: "pawn", side: "black", file: 4, rank: 1 }),
  ]);
  const frames = advancePawns(clear, boom);
  assert.equal(at(frames[0]!, "p").file, 4);
  assert.equal(at(frames[0]!, "p").rank, 2);
});

test("a pawn does not step or eat diagonally", () => {
  const state = hand([
    player("knight", 7, 0),
    piece({ id: "p", kind: "pawn", side: "black", file: 3, rank: 3, moved: true }),
    piece({ id: "block", kind: "rook", side: "black", file: 3, rank: 4 }),
    piece({ id: "left", kind: "knight", side: "black", file: 2, rank: 4 }),
    piece({ id: "right", kind: "knight", side: "black", file: 4, rank: 4 }),
  ]);
  const frames = advancePawns(state, () => 0);
  assert.equal(frames.length, 0);
  assert.equal(at(state, "p").file, 3);
  assert.equal(at(state, "p").rank, 3);
  assert.equal(state.pieces.some((p) => p.id === "left"), true);
  assert.equal(state.pieces.some((p) => p.id === "right"), true);
  assert.equal(state.pieces.filter((p) => p.kind === "bishop").length, 0);
});

test("a pawn never moves onto the player", () => {
  const state = hand([
    player("knight", 1, 4),
    piece({ id: "p", kind: "pawn", side: "black", file: 1, rank: 3, moved: true }),
  ]);
  assert.equal(advancePawns(state, boom).length, 0);
  assert.equal(at(state, "p").file, 1);
  assert.equal(at(state, "p").rank, 3);
  assert.equal(at(state, "player").rank, 4);
});

test("two stuck pawns spawn another on a free file while fewer than eight remain", () => {
  const state = hand([
    player("knight", 7, 0),
    piece({ id: "a", kind: "pawn", side: "black", file: 0, rank: 2, moved: true }),
    piece({ id: "block-a", kind: "rook", side: "black", file: 0, rank: 3 }),
    piece({ id: "b", kind: "pawn", side: "black", file: 2, rank: 2, moved: true }),
    piece({ id: "block-b", kind: "knight", side: "black", file: 2, rank: 3 }),
  ]);
  const frames = advancePawns(state, () => 0);
  assert.equal(frames.length, 1);
  assert.equal(at(frames[0]!, "a").rank, 2);
  assert.equal(at(frames[0]!, "b").rank, 2);
  const pawns = frames[0]!.pieces.filter((p) => p.kind === "pawn");
  assert.equal(pawns.length, 3);
  const baby = pawns.find((p) => p.id !== "a" && p.id !== "b");
  assert.ok(baby);
  assert.equal(baby.rank, 1);
  assert.notEqual(baby.file, 0);
  assert.notEqual(baby.file, 2);
});

test("one stuck pawn does not spawn, and eight pawns do not spawn", () => {
  const one = hand([
    player("knight", 7, 0),
    piece({ id: "stuck", kind: "pawn", side: "black", file: 0, rank: 2, moved: true }),
    piece({ id: "block", kind: "rook", side: "black", file: 0, rank: 3 }),
    piece({ id: "free", kind: "pawn", side: "black", file: 3, rank: 2, moved: true }),
  ]);
  const moved = advancePawns(one, boom);
  assert.equal(moved.length, 1);
  assert.equal(moved[0]!.pieces.filter((p) => p.kind === "pawn").length, 2);
  assert.equal(at(moved[0]!, "free").rank, 3);
  assert.equal(at(moved[0]!, "stuck").rank, 2);

  const full = hand([
    player("knight", 0, 0),
    ...Array.from({ length: 8 }, (_, file) =>
      piece({ id: `p${file}`, kind: "pawn", side: "black", file, rank: file < 2 ? 3 : 1, moved: true }),
    ),
    piece({ id: "ba", kind: "rook", side: "black", file: 0, rank: 4 }),
    piece({ id: "bb", kind: "rook", side: "black", file: 1, rank: 4 }),
  ]);
  const stayed = advancePawns(full, () => 0);
  assert.ok(stayed.every((frame) => frame.pieces.filter((p) => p.kind === "pawn").length === 8));
});

test("a pawn with no step stays", () => {
  const state = hand([
    player("knight", 7, 7),
    piece({ id: "p", kind: "pawn", side: "black", file: 0, rank: 3, moved: true }),
    piece({ id: "block", kind: "rook", side: "black", file: 0, rank: 4 }),
    piece({ id: "diag", kind: "knight", side: "black", file: 1, rank: 4 }),
  ]);
  assert.equal(advancePawns(state, boom).length, 0);
});

test("the run ends when a pawn reaches rank 8, before the other pawn acts", () => {
  const state = hand([
    player("knight", 7, 0),
    piece({ id: "lead", kind: "pawn", side: "black", file: 0, rank: 6, moved: true }),
    piece({ id: "late", kind: "pawn", side: "black", file: 7, rank: 1, moved: true }),
  ]);
  const frames = advancePawns(state, boom);
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.status, "over");
  assert.equal(at(frames[0]!, "lead").rank, 7);
  assert.equal(at(frames[0]!, "late").rank, 1);
});

test("after a capture the newborn steps with the other pawns", () => {
  const state = hand([
    player("bishop", 0, 0),
    piece({ id: "meal", kind: "pawn", side: "black", file: 1, rank: 1 }),
  ], { formLeft: 3 });
  let n = 0;
  const rng: Rng = () => {
    n += 1;
    return 0;
  };
  const frames = playTurn(state, 1, 1, rng);
  assert.ok(frames);
  assert.equal(frames[0]!.score, 7);
  assert.equal(frames[0]!.formLeft, 2);
  const final = frames[frames.length - 1]!;
  const pawn = final.pieces.find((p) => p.kind === "pawn");
  assert.ok(pawn);
  assert.equal(pawn.rank, 2);
  assert.ok(n >= 1);
});

test("capturing a pawn when more than two are out does not replace it", () => {
  const state = hand([
    player("rook", 0, 1),
    piece({ id: "meal", kind: "pawn", side: "black", file: 3, rank: 1 }),
    piece({ id: "a", kind: "pawn", side: "black", file: 5, rank: 2, moved: true }),
    piece({ id: "b", kind: "pawn", side: "black", file: 6, rank: 2, moved: true }),
  ]);
  const frames = playTurn(state, 3, 1, () => 0);
  assert.ok(frames);
  assert.equal(frames[0]!.score, 7);
  assert.equal(frames[0]!.pieces.filter((p) => p.kind === "pawn").length, 2);
  const last = frames[frames.length - 1]!;
  assert.equal(last.pieces.filter((p) => p.kind === "pawn").length, 2);
  assert.equal(at(last, "a").rank, 3);
  assert.equal(at(last, "b").rank, 3);
});

test("capturing down to two stuck pawns still brings one in", () => {
  const state = hand([
    player("rook", 0, 1),
    piece({ id: "meal", kind: "pawn", side: "black", file: 3, rank: 1 }),
    piece({ id: "a", kind: "pawn", side: "black", file: 5, rank: 2, moved: true }),
    piece({ id: "ba", kind: "bishop", side: "black", file: 5, rank: 3 }),
    piece({ id: "b", kind: "pawn", side: "black", file: 6, rank: 2, moved: true }),
    piece({ id: "bb", kind: "bishop", side: "black", file: 6, rank: 3 }),
  ]);
  const frames = playTurn(state, 3, 1, () => 0);
  assert.ok(frames);
  assert.equal(frames[0]!.pieces.filter((p) => p.kind === "pawn").length, 2);
  const last = frames[frames.length - 1]!;
  const pawns = last.pieces.filter((p) => p.kind === "pawn");
  assert.equal(pawns.length, 3);
  const baby = pawns.find((p) => p.id !== "a" && p.id !== "b");
  assert.ok(baby);
  assert.equal(baby.rank, 1);
  assert.notEqual(baby.file, 5);
  assert.notEqual(baby.file, 6);
  assert.equal(at(last, "a").rank, 2);
  assert.equal(at(last, "b").rank, 2);
});

test("play is ignored once a pawn has reached rank 8", () => {
  const state = hand(
    [player("knight", 1, 0), piece({ id: "p", kind: "pawn", side: "black", file: 0, rank: 7 })],
    { status: "over" },
  );
  assert.equal(playTurn(state, 0, 2), null);
  assert.deepEqual(legalTargets(state), []);
});

function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("random games keep one white piece, unique squares, and a legal step", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const rng = mulberry32(seed);
    let state = deal(rng);
    for (let turn = 0; turn < 50 && state.status === "play"; turn++) {
      const moves = legalTargets(state);
      assert.ok(moves.length > 0, `seed ${seed} turn ${turn} had no move`);
      const choice = moves[Math.floor(rng() * moves.length)]!;
      const before = state.score;
      const frames = playTurn(state, choice.file, choice.rank, rng);
      assert.ok(frames);
      state = frames[frames.length - 1]!;
      const squares = new Set(state.pieces.map((p) => `${p.file},${p.rank}`));
      assert.equal(squares.size, state.pieces.length);
      const white = state.pieces.filter((p) => p.side === "white");
      assert.equal(white.length, 1);
      assert.notEqual(white[0]!.kind, "pawn");
      assert.ok(state.pieces.filter((p) => p.kind === "pawn").every((p) => p.side === "black"));
      if (white[0]!.kind === "knight") assert.equal(state.formLeft, null);
      else assert.ok(state.formLeft === 1 || state.formLeft === 2 || state.formLeft === 3);
      assert.ok(state.score === before || state.score - before >= 2);
      if (state.status === "over") {
        assert.ok(state.pieces.some((p) => p.kind === "pawn" && p.rank === 7));
      } else {
        assert.ok(state.pieces.filter((p) => p.kind === "pawn").every((p) => p.rank < 7));
      }
    }
  }
});
