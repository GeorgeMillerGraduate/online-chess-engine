import { Chess, DEFAULT_POSITION } from "../vendor/chess.js";
export { Chess, DEFAULT_POSITION };
export const opposite = (c) => (c === "w" ? "b" : "w");
export const colourName = (c) => (c === "w" ? "White" : "Black");
export const pieceFiles = {
  p: "Pawn",
  n: "Knight",
  b: "Bish",
  r: "Rook",
  q: "Queen",
  k: "King",
};
export const pieceNames = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};
export const pieceImage = (p) =>
  `images/${pieceFiles[p.type]}${p.color.toUpperCase()}.png`;
export function resultOf(chess) {
  if (chess.isCheckmate())
    return { winner: opposite(chess.turn()), reason: "Checkmate" };
  if (chess.isStalemate()) return { winner: null, reason: "Stalemate" };
  if (chess.isInsufficientMaterial())
    return { winner: null, reason: "Insufficient material" };
  // Casual house rules: no claim required for repetition or the fifty-move rule.
  if (chess.isThreefoldRepetition())
    return { winner: null, reason: "Threefold repetition" };
  if (chess.isDrawByFiftyMoves())
    return { winner: null, reason: "Fifty-move rule" };
  return null;
}
export function timeoutResult(chess, loser) {
  const winner = opposite(loser),
    pieces = chess.board().flat().filter(Boolean);
  const own = pieces.filter((p) => p.color === winner && p.type !== "k");
  const other = pieces.filter((p) => p.color === loser && p.type !== "k");
  // Conservative material policy; see README for the explicitly supported cases.
  if (
    !own.length ||
    chess.isInsufficientMaterial() ||
    (other.length === 0 && own.length === 1 && "bn".includes(own[0].type))
  )
    return {
      winner: null,
      reason: "Time expired · insufficient mating material",
    };
  return { winner, reason: "Time expired" };
}
export function resultCode(r) {
  return !r
    ? "*"
    : r.winner === "w"
      ? "1-0"
      : r.winner === "b"
        ? "0-1"
        : "1/2-1/2";
}
export function restoreGame(start = DEFAULT_POSITION, moves = []) {
  const c = new Chess(start);
  for (const m of moves)
    c.move(
      typeof m === "string"
        ? m
        : { from: m.from, to: m.to, promotion: m.promotion },
    );
  return c;
}
export function movesOf(c) {
  return c
    .history({ verbose: true })
    .map((m) => ({
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      san: m.san,
      before: m.before,
      after: m.after,
      color: m.color,
    }));
}
export function validPosition(fen) {
  const c = new Chess(fen);
  const kings = c
    .board()
    .flat()
    .filter((p) => p?.type === "k");
  if (kings.length !== 2)
    throw Error("A position needs exactly one king of each colour.");
  if (
    c
      .board()
      .flat()
      .some((p) => p?.type === "p" && /[18]$/.test(p.square))
  )
    throw Error("Pawns cannot start on rank 1 or 8.");
  const previous = opposite(c.turn()),
    king = kings.find((p) => p.color === previous);
  if (c.isAttacked(king.square, c.turn()))
    throw Error("The side that just moved cannot be left in check.");
  return c;
}
