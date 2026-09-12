import {
  Chess,
  DEFAULT_POSITION,
  opposite,
  colourName,
  pieceImage,
  pieceNames,
  resultOf,
  resultCode,
  timeoutResult,
  restoreGame,
  movesOf,
  validPosition,
} from "./ChessGame.js";
import { ChessBoard } from "./ChessBoard.js";
import { StockfishEngine } from "./StockfishEngine.js";
import { OnlineClient } from "./OnlineClient.js";
const $ = (id) => document.getElementById(id),
  engine = new StockfishEngine();
const savedSettings = read("jenga-settings", {});
let mode = "computer",
  human = "w",
  game = new Chess(),
  start = DEFAULT_POSITION,
  result = null,
  view = -1,
  busy = false,
  generation = 0;
let base = 0,
  increment = 0,
  clocks = { w: 0, b: 0 },
  stamp = Date.now(),
  clockHistory = [],
  onlineState = null,
  connection = false,
  analysisTimer = null,
  promotionResolve = null,
  localTimer = null;
let pendingOnlineDrag = null,
  analysisOriginal = null;
let puzzle = null,
  puzzleStep = 0,
  puzzleSolved = false,
  puzzles = [],
  puzzleWrong = 0,
  puzzleAssisted = false;
let sound = !!savedSettings.sound,
  autoQueen = !!savedSettings.autoQueen;
const online = new OnlineClient(receiveOnline, (ok, message) => {
  connection = ok;
  $("connection-label").textContent = ok
    ? "Connected"
    : message || "Connecting…";
  if (mode === "online") {
    renderStatus();
    renderActions();
  }
});
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function storeSettings() {
  localStorage.setItem(
    "jenga-settings",
    JSON.stringify({
      sound,
      autoQueen,
      dark: $("play").classList.contains("dark-theme"),
    }),
  );
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(localTimer);
  localTimer = setTimeout(() => ($("toast").hidden = true), 5500);
}
function report(e) {
  if (e.message !== "Search cancelled") toast(e.message || String(e));
}
function displayed() {
  if (view < 0) return game;
  return restoreGame(start, movesOf(game).slice(0, view));
}
function isLive() {
  return view < 0 || view === game.history().length;
}
function canMove(c) {
  if (busy || promotionResolve) return false;
  if (mode === "analysis") return c === displayed().turn();
  if (!isLive()) return false;
  if (mode === "puzzle")
    return !puzzleSolved && c === human && c === game.turn();
  if (result) return false;
  if (mode === "online")
    return (
      connection &&
      onlineState?.phase === "active" &&
      online.seat === c &&
      game.turn() === c
    );
  return game.turn() === c && (mode === "local" || c === human);
}
const board = new ChessBoard($("chess-board"), {
  model: displayed,
  canMove,
  onMove: humanMove,
});
$("play").classList.toggle("dark-theme", !!savedSettings.dark);
$("auto-queen").checked = autoQueen;
$("sound").setAttribute("aria-pressed", String(sound));
function clockNow() {
  if (mode === "online") {
    if (!onlineState) return { w: 0, b: 0 };
    const c = { ...onlineState.clock };
    if (onlineState.phase === "active" && onlineState.base > 0)
      c[onlineState.turn] = Math.max(
        0,
        c[onlineState.turn] - (performance.now() - onlineState.received),
      );
    return c;
  }
  const c = { ...clocks };
  if (base > 0 && !result && ["computer", "local"].includes(mode))
    c[game.turn()] = Math.max(0, c[game.turn()] - (Date.now() - stamp));
  return c;
}
function clockText(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}
function renderClocks() {
  const c = clockNow(),
    top = opposite(board.orientation),
    bottom = board.orientation,
    timed =
      (mode === "online" ? onlineState?.base : base) > 0 &&
      ["online", "computer", "local"].includes(mode);
  for (const [id, col] of [
    ["top", top],
    ["bottom", bottom],
  ]) {
    const el = $(id + "-clock");
    el.textContent = timed ? clockText(c[col]) : "∞";
    el.classList.toggle(
      "running",
      timed &&
        !result &&
        game.turn() === col &&
        (mode !== "online" || onlineState?.phase === "active"),
    );
    el.classList.toggle("low", timed && c[col] < 20000 && !result);
  }
  if (mode !== "online" && timed && !result && c[game.turn()] <= 0) {
    result = timeoutResult(game, game.turn());
    clocks = c;
    cancelWork();
    render();
    saveLocal();
  }
}
function playerName(c) {
  if (mode === "online")
    return onlineState?.players[c]?.name || "Waiting for a friend";
  if (mode === "computer") return c === human ? "You" : "Stockfish 18";
  if (mode === "analysis") return colourName(c);
  if (mode === "puzzle") return c === human ? "Your move" : "Puzzle position";
  return colourName(c) + " player";
}
function renderPlayers() {
  for (const [id, c] of [
    ["top", opposite(board.orientation)],
    ["bottom", board.orientation],
  ]) {
    $(id + "-name").textContent = playerName(c);
    $(id + "-avatar").src = pieceImage({ type: "k", color: c });
    $(id + "-detail").textContent =
      mode === "online"
        ? onlineState?.connected[c]
          ? "Connected"
          : "Offline / waiting"
        : mode === "computer" && c !== human
          ? "Computer opponent"
          : colourName(c) + " pieces";
    const caps = $(id + "-captured");
    caps.replaceChildren();
    for (const m of game
      .history({ verbose: true })
      .filter((m) => m.color === c && m.captured)) {
      const img = document.createElement("img");
      img.src = pieceImage({ type: m.captured, color: opposite(c) });
      img.alt = "Captured " + pieceNames[m.captured];
      caps.append(img);
    }
  }
  renderClocks();
}
function renderStatus() {
  let title = colourName(game.turn()) + " to move",
    detail = game.history().length
      ? "Find your next idea."
      : "Make your opening move.",
    label = "IN PLAY";
  if (mode === "online" && !onlineState) {
    title = "Invite a friend";
    detail = "Create a private invitation to start playing.";
    label = "PLAY TOGETHER";
  } else if (mode === "online" && onlineState.phase === "waiting") {
    title = "Waiting for a friend";
    detail = "Share the invitation below. It expires after 24 hours.";
    label = "INVITATION READY";
  } else if (result) {
    title = result.winner ? colourName(result.winner) + " wins" : "Game drawn";
    detail = result.reason;
    label = resultCode(result);
  } else if (mode === "puzzle") {
    title = puzzleSolved
      ? "Puzzle complete"
      : colourName(game.turn()) + " to move";
    detail = puzzleSolved
      ? "Ready for another challenge?"
      : "Find the best continuation.";
    label = "TACTICS";
  } else if (mode === "analysis") {
    title = "Explore the position";
    detail = "Move either side, or browse the game history.";
    label = "ANALYSIS";
  } else if (busy) {
    title = "Stockfish is thinking";
    detail = "Finding a reply to your position…";
  } else if (game.isCheck()) {
    title = colourName(game.turn()) + " is in check";
    detail = "Your king needs a safe response.";
  }
  if (mode === "online" && onlineState && !connection && !result) {
    detail =
      "Connection lost. Clocks continue; moves resume after synchronisation.";
  }
  if (!isLive()) {
    title = "Reviewing move " + Math.ceil(view / 2);
    detail = "The live game continues. Return to the latest position to play.";
  }
  $("game-status").textContent = title;
  $("status-detail").textContent = detail;
  $("status-label").textContent = label;
  $("board-caption").textContent = (
    !isLive()
      ? "REVIEWING POSITION"
      : result
        ? result.reason
        : colourName(displayed().turn()) + " TO MOVE"
  ).toUpperCase();
}
function renderHistory() {
  const hist = movesOf(game),
    el = $("move-history"),
    nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  el.replaceChildren();
  if (!hist.length) {
    const d = document.createElement("div");
    d.className = "empty-moves";
    const img = document.createElement("img");
    img.src = "images/KnightB.png";
    d.append(img);
    const b = document.createElement("b");
    b.textContent = "Every game starts here.";
    d.append(b);
    const p = document.createElement("span");
    p.textContent = "Your moves will appear as you play.";
    d.append(p);
    el.append(d);
  }
  const initialFull = Number(start.split(" ")[5]),
    initialBlack = start.split(" ")[1] === "b";
  let row;
  hist.forEach((m, i) => {
    if (m.color === "w" || !row) {
      row = document.createElement("div");
      row.className = "move-row";
      const n = document.createElement("span");
      n.textContent =
        String(initialFull + Math.floor((i + (initialBlack ? 1 : 0)) / 2)) +
        ".";
      row.append(n);
      if (m.color === "b") {
        const blank = document.createElement("span");
        row.append(blank);
      }
      el.append(row);
    }
    const b = document.createElement("button");
    b.textContent = m.san;
    b.dataset.ply = i + 1;
    b.classList.toggle("current", (view < 0 ? hist.length : view) === i + 1);
    b.addEventListener("click", () => navigate(i + 1));
    row.append(b);
  });
  if (nearBottom && isLive()) el.scrollTop = el.scrollHeight;
  $("return-live").hidden = isLive();
  const current = view < 0 ? hist.length : view;
  $("history-first").disabled = current === 0;
  $("history-prev").disabled = current === 0;
  $("history-next").disabled = current >= hist.length;
  $("history-last").disabled = current >= hist.length;
}
function renderActions() {
  const active = !result,
    network = mode === "online",
    owned = !!online.seat,
    phase = onlineState?.phase;
  $("takeback").disabled =
    busy ||
    (!network && !game.history().length) ||
    (network && (!owned || phase !== "active" || !connection)) ||
    !["computer", "local", "online", "analysis"].includes(mode);
  $("draw").disabled =
    !["local", "online"].includes(mode) ||
    !active ||
    (network && (!owned || phase !== "active" || !connection));
  $("resign").disabled =
    !["computer", "local", "online"].includes(mode) ||
    !active ||
    (network && (!owned || phase !== "active" || !connection));
  $("abort").hidden = !network;
  $("abort").disabled =
    !owned ||
    !["waiting", "active"].includes(phase) ||
    game.history().length >= 2 ||
    !connection;
  $("new-game").textContent = network
    ? result
      ? "Offer rematch"
      : "Game setup →"
    : "New game →";
  $("new-game").disabled =
    network && result && (!owned || !connection || !!onlineState?.offer);
  $("analyse-game").hidden =
    !result || mode === "analysis" || mode === "puzzle";
  $("another-invitation").hidden = !network || phase !== "ended";
  $("online-panel").hidden = !network;
  $("create-challenge").hidden = !!onlineState;
  $("share-box").hidden = !onlineState;
  $("join-challenge").hidden = !(
    onlineState?.phase === "waiting" &&
    !online.seat &&
    !new URLSearchParams(location.search).has("spectate")
  );
  const offer = onlineState?.offer;
  $("offer-box").hidden = !network || !offer;
  if (offer) {
    $("offer-text").textContent =
      `${playerName(offer.from)} offers a ${offer.kind}.`;
    $("accept-offer").disabled = !owned || offer.from === online.seat;
    $("decline-offer").disabled = !owned || offer.from === online.seat;
  }
  $("difficulty-label").hidden = mode !== "computer";
  $("strength-note").hidden = mode !== "computer";
  $("puzzle-panel").hidden = mode !== "puzzle";
}
function render({ last = null, animate = false } = {}) {
  const hist = movesOf(displayed());
  board.render({ last: last || hist.at(-1), animate });
  renderPlayers();
  renderStatus();
  renderHistory();
  renderActions();
}
function beep(capture = false) {
  if (!sound) return;
  try {
    const ctx = (window.jengaAudio ??= new AudioContext());
    ctx.resume();
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = capture ? 360 : 520;
    g.gain.setValueAtTime(0.04, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    o.start();
    o.stop(ctx.currentTime + 0.09);
  } catch {}
}
function cancelWork() {
  generation++;
  clearTimeout(analysisTimer);
  engine.cancel();
  busy = false;
  board.cancel();
  board.selected = null;
  if (promotionResolve) {
    promotionResolve(null);
    promotionResolve = null;
    $("promotion-dialog").close();
  }
}
async function settleEngine() {
  if (engine.loading) await engine.loading.catch(() => {});
}
function confirmAction(title, description = "") {
  return new Promise((resolve) => {
    const d = $("confirm-dialog");
    $("confirm-title").textContent = title;
    $("confirm-description").textContent = description;
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      d.close();
      resolve(v);
    };
    $("confirm-yes").onclick = () => finish(true);
    $("confirm-no").onclick = () => finish(false);
    d.oncancel = (e) => {
      e.preventDefault();
      finish(false);
    };
    d.showModal();
  });
}
function promote(colour) {
  if (autoQueen) return Promise.resolve("q");
  return new Promise((resolve) => {
    promotionResolve = resolve;
    const d = $("promotion-dialog"),
      options = $("promotion-options");
    options.replaceChildren();
    for (const p of ["q", "r", "b", "n"]) {
      const b = document.createElement("button");
      b.setAttribute("aria-label", "Promote to " + pieceNames[p]);
      const img = document.createElement("img");
      img.src = pieceImage({ type: p, color: colour });
      img.alt = pieceNames[p];
      b.append(img);
      b.onclick = () => finish(p);
      options.append(b);
    }
    function finish(v) {
      promotionResolve = null;
      d.close();
      resolve(v);
    }
    $("promotion-cancel").onclick = () => finish(null);
    d.oncancel = (e) => {
      e.preventDefault();
      finish(null);
    };
    d.showModal();
  });
}
async function humanMove(from, to, dragged) {
  const gen = generation,
    p = displayed().get(from),
    promotion =
      p?.type === "p" && /[18]$/.test(to) ? await promote(p.color) : undefined;
  if (gen !== generation || promotion === null) return;
  if (mode === "online") {
    pendingOnlineDrag = dragged ? from + to : null;
    try {
      await online.command("move", { from, to, promotion });
      beep();
    } catch (e) {
      report(e);
    } finally {
      pendingOnlineDrag = null;
    }
    return;
  }
  if (mode === "puzzle") {
    await puzzleMove(from + to + (promotion || ""), dragged);
    return;
  }
  try {
    if (mode === "analysis" && !isLive()) {
      analysisOriginal ??= { start, moves: movesOf(game) };
      game = displayed();
      view = -1;
    }
    const before = clockNow();
    if (base > 0 && before[game.turn()] <= 0 && mode !== "analysis") {
      renderClocks();
      return;
    }
    const m = game.move({ from, to, promotion });
    if (mode !== "analysis") {
      clockHistory.push({ ...before });
      clocks = before;
      if (base) clocks[m.color] += increment * 1000;
      stamp = Date.now();
      result = resultOf(game);
    }
    view = -1;
    board.clearAnnotations();
    render({ last: m, animate: !dragged });
    beep(!!m.captured);
    saveLocal();
    if (mode === "computer" && !result) await engineMove();
    if (mode === "analysis") scheduleAnalysis();
  } catch (e) {
    report(e);
  }
}
function updateEngineOptions() {
  const range = engine.options.UCI_Elo;
  if (!range) return;
  const value = $("engine-rating").value,
    values = [range.min, 1600, 2000, 2400, range.max]
      .filter(
        (n, i, a) => n >= range.min && n <= range.max && a.indexOf(n) === i,
      )
      .sort((a, b) => a - b);
  $("engine-rating").replaceChildren();
  for (const n of values) {
    const o = document.createElement("option");
    o.value = n;
    o.textContent = n + " · native target";
    $("engine-rating").append(o);
  }
  const full = document.createElement("option");
  full.value = "full";
  full.textContent = "Full strength";
  $("engine-rating").append(full);
  $("engine-rating").value = [...$("engine-rating").options].some(
    (o) => o.value === value,
  )
    ? value
    : String(range.min);
}
async function engineMove() {
  if (mode !== "computer" || result || game.turn() === human) return;
  const gen = generation;
  busy = true;
  renderStatus();
  renderActions();
  $("engine-state").textContent = "LOADING…";
  try {
    await settleEngine();
    await engine.ready();
    if (gen !== generation) return;
    updateEngineOptions();
    $("engine-state").textContent = "THINKING…";
    const uci = await engine.search({
      start,
      moves: movesOf(game).map((m) => m.from + m.to + (m.promotion || "")),
      elo:
        $("engine-rating").value === "full"
          ? null
          : Number($("engine-rating").value),
      time: 650,
    });
    if (gen !== generation || !uci || result) return;
    const before = clockNow();
    if (base && before[game.turn()] <= 0) {
      renderClocks();
      return;
    }
    const m = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });
    clockHistory.push({ ...before });
    clocks = before;
    if (base) clocks[m.color] += increment * 1000;
    stamp = Date.now();
    result = resultOf(game);
    board.clearAnnotations();
    render({ last: m, animate: true });
    beep(!!m.captured);
    saveLocal();
  } catch (e) {
    if (gen === generation) {
      $("engine-state").textContent = "RETRY IN TOOLS";
      report(e);
    }
  } finally {
    if (gen === generation) {
      busy = false;
      if (engine.status === "ready")
        $("engine-state").textContent = "STOCKFISH 18";
      renderStatus();
      renderActions();
    }
  }
}
function saveLocal() {
  if (!["computer", "local"].includes(mode)) return;
  localStorage.setItem(
    "jenga-game",
    JSON.stringify({
      mode,
      human,
      start,
      moves: movesOf(game),
      result,
      base,
      increment,
      clocks: clockNow(),
      stamp: Date.now(),
      clockHistory,
    }),
  );
}
function timeSettings() {
  if ($("time-control").value !== "custom")
    return $("time-control").value.split(",").map(Number);
  const b = Number($("custom-minutes").value) * 60,
    i = Number($("custom-increment").value);
  if (
    !Number.isInteger(b) ||
    b < 60 ||
    b > 10800 ||
    !Number.isInteger(i) ||
    i < 0 ||
    i > 120
  )
    throw Error("Enter 1–180 minutes and 0–120 seconds increment.");
  return [b, i];
}
async function startGame(ask = true) {
  if (
    ask &&
    game.history().length &&
    !result &&
    !(await confirmAction(
      "Start a new game?",
      "Your current local game will be replaced.",
    ))
  )
    return;
  try {
    const [b, i] = timeSettings();
    cancelWork();
    online.close();
    onlineState = null;
    history.replaceState(null, "", location.pathname);
    start = DEFAULT_POSITION;
    game = new Chess();
    result = null;
    view = -1;
    base = b;
    increment = i;
    clocks = { w: b * 1000, b: b * 1000 };
    stamp = Date.now();
    clockHistory = [];
    human = $("player-colour").value;
    if (human === "random")
      human = crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? "w" : "b";
    board.orientation = human;
    board.clearAnnotations();
    render();
    saveLocal();
    panel("moves");
    $("format-label").textContent = b
      ? `${b / 60} + ${i} · Casual`
      : "Casual · untimed";
    if (mode === "computer" && human === "b") await engineMove();
    else if (mode === "analysis") scheduleAnalysis();
  } catch (e) {
    report(e);
  }
}
function setModeUI() {
  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.classList.toggle("active", b.dataset.mode === mode);
    b.setAttribute("aria-selected", String(b.dataset.mode === mode));
  });
  const titles = {
    computer: "Your next move.",
    local: "Across the board.",
    online: "Better together.",
    analysis: "Follow the idea.",
    puzzle: "Find the tactic.",
  };
  $("mode-title").textContent = titles[mode];
  $("mode-description").textContent = {
    computer:
      "A quiet place to think. Play the world's best-known chess engine, at your pace.",
    local:
      "Two players. One board. Set a clock, pick a side and enjoy a game together.",
    online:
      "A private board for you and a friend. Share an invitation and meet across the board.",
    analysis:
      "Every position has a story. Replay your moves and explore the possibilities.",
    puzzle:
      "A small challenge. A fresh perspective. Train your eye for the decisive move.",
  }[mode];
  $("evaluation").hidden = mode !== "analysis";
  $("analysis-lines").hidden = mode !== "analysis";
  $("engine-state").textContent =
    mode === "computer" || mode === "analysis"
      ? "STOCKFISH 18"
      : "CASUAL CHESS";
  $("connection-label").textContent =
    mode === "online" ? "Connecting…" : "On your device";
}
async function switchMode(next, keep = false) {
  if (next === mode) return;
  if (
    mode === "online" &&
    onlineState?.phase === "active" &&
    online.seat &&
    !(await confirmAction(
      "Leave this online board?",
      "The game and clock continue. Reopen your invitation link on this browser to return.",
    ))
  )
    return;
  if (
    !keep &&
    game.history().length &&
    !result &&
    mode !== "online" &&
    !(await confirmAction(
      "Change game mode?",
      "Your current board will be replaced. Download its PGN first if you want to keep it.",
    ))
  )
    return;
  cancelWork();
  online.close();
  onlineState = null;
  history.replaceState(null, "", location.pathname);
  mode = next;
  analysisOriginal = null;
  setModeUI();
  if (next === "analysis" && keep) {
    result = null;
    view = -1;
    base = 0;
    render();
    scheduleAnalysis();
    return;
  }
  if (next === "online") {
    start = DEFAULT_POSITION;
    game = new Chess();
    result = null;
    view = -1;
    base = 0;
    render();
    panel("setup");
    online.connect().catch(report);
    return;
  }
  if (next === "puzzle") {
    base = 0;
    result = null;
    view = -1;
    await loadPuzzles();
    nextPuzzle();
    panel("moves");
    return;
  }
  await startGame(false);
}
function panel(name) {
  document.querySelectorAll("[data-panel]").forEach((b) => {
    const active = b.dataset.panel === name;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", String(active));
  });
  for (const n of ["moves", "setup", "tools"])
    $("panel-" + n).hidden = n !== name;
}
function navigate(ply) {
  const n = game.history().length;
  view = ply >= n ? -1 : Math.max(0, ply);
  board.selected = null;
  board.clearAnnotations();
  render();
  if (mode === "analysis") scheduleAnalysis();
}
function scheduleAnalysis() {
  if (mode !== "analysis") return;
  clearTimeout(analysisTimer);
  engine.cancel();
  const gen = ++generation;
  $("analysis-lines").textContent = "Analysing position…";
  analysisTimer = setTimeout(async () => {
    try {
      await settleEngine();
      const position = displayed(),
        fen = position.fen(),
        c = position.turn(),
        scores = new Map();
      await engine.search({
        start: fen,
        time: 3000,
        analysis: true,
        onInfo: (info) => {
          if (gen !== generation) return;
          const sign = c === "w" ? 1 : -1;
          let score = info.cp === null ? null : (info.cp / 100) * sign,
            mate = info.mate === null ? null : info.mate * sign;
          if (info.cp === null && info.mate === null) return;
          const text =
            mate !== null
              ? (mate >= 0 ? "+" : "−") + "M" + Math.abs(mate)
              : (score >= 0 ? "+" : "") + score.toFixed(2);
          const line = [];
          const pvGame = new Chess(fen);
          for (const uci of info.pv.slice(0, 8)) {
            try {
              line.push(
                pvGame.move({
                  from: uci.slice(0, 2),
                  to: uci.slice(2, 4),
                  promotion: uci[4],
                }).san,
              );
            } catch {
              break;
            }
          }
          scores.set(info.multipv, { text, line, depth: info.depth });
          $("analysis-lines").replaceChildren();
          for (const [, s] of [...scores].sort((a, b) => a[0] - b[0])) {
            const d = document.createElement("div"),
              b = document.createElement("strong");
            b.textContent = s.text;
            d.append(
              b,
              document.createTextNode(s.line.join(" ") + " · depth " + s.depth),
            );
            $("analysis-lines").append(d);
          }
          if (info.multipv === 1) {
            $("eval-white").style.height =
              (mate !== null
                ? mate > 0
                  ? 98
                  : 2
                : 50 + 45 * Math.tanh(score / 4)) + "%";
            $("evaluation").setAttribute(
              "aria-label",
              "White evaluation " + text,
            );
            board.engineArrow = info.pv[0]
              ? [info.pv[0].slice(0, 2), info.pv[0].slice(2, 4)]
              : null;
            board.drawArrows();
          }
        },
      });
    } catch (e) {
      if (gen === generation) {
        $("analysis-lines").textContent =
          "Analysis unavailable. Reload Stockfish in Tools.";
        report(e);
      }
    }
  }, 180);
}
function receiveOnline(s) {
  if (mode !== "online") return;
  const old = onlineState,
    previous = game.history().length;
  s.received = performance.now();
  onlineState = s;
  if (old?.version === s.version && old.id === s.id) {
    if (online.seat && board.orientation !== online.seat) {
      board.orientation = online.seat;
      board.render({ last: movesOf(game).at(-1) });
    }
    renderPlayers();
    renderStatus();
    renderActions();
    return;
  }
  if (s.result && !result) cancelWork();
  start = s.start || DEFAULT_POSITION;
  game = restoreGame(start, s.moves);
  result = s.result;
  base = s.base;
  increment = s.increment;
  const newMove = s.moves.length > previous;
  if (old && s.moves.length < previous) view = -1;
  if (view > s.moves.length) view = -1;
  if (online.seat) board.orientation = online.seat;
  const url = new URL(location.href);
  url.search = "";
  url.searchParams.set("game", s.id);
  $("share-link").value = url.href;
  $("format-label").textContent = s.base
    ? `${s.base / 60} + ${s.increment} · Casual`
    : "Casual · untimed";
  render({
    animate:
      newMove &&
      isLive() &&
      pendingOnlineDrag !== s.moves.at(-1)?.from + s.moves.at(-1)?.to,
  });
}
async function createChallenge() {
  try {
    if (onlineState) {
      toast(
        "Finish or abort the existing game before creating another invitation.",
      );
      return;
    }
    const [b, i] = timeSettings();
    await online.create({
      name: $("display-name").value,
      base: b,
      increment: i,
      colour: $("player-colour").value,
    });
    history.replaceState(null, "", `?game=${online.id}`);
    render();
    panel("moves");
    toast("Invitation ready. Copy the link and send it to your friend.");
  } catch (e) {
    report(e);
  }
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied to clipboard.");
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.append(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    toast(ok ? "Copied to clipboard." : "Select and copy the text manually.");
  }
}
function pgn() {
  const c = restoreGame(start, movesOf(game));
  c.header(
    "Event",
    "Jenga Code casual game",
    "Site",
    "https://jenga-code.com/projects/chess/",
    "Date",
    new Date().toISOString().slice(0, 10).replaceAll("-", "."),
    "White",
    playerName("w"),
    "Black",
    playerName("b"),
    "Result",
    resultCode(result),
  );
  return c.pgn();
}
function download(name, text, type = "text/plain") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function importGame(kind) {
  try {
    let c;
    if (kind === "fen") c = validPosition($("fen-input").value.trim());
    else {
      c = new Chess();
      c.loadPgn($("pgn-input").value);
      validPosition(c.fen());
    }
    if (
      mode === "online" &&
      onlineState?.phase === "active" &&
      online.seat &&
      !(await confirmAction(
        "Leave online play for analysis?",
        "Your online clock continues.",
      ))
    )
      return;
    cancelWork();
    online.close();
    onlineState = null;
    mode = "analysis";
    analysisOriginal = null;
    game = c;
    start = movesOf(c)[0]?.before || c.fen();
    result = null;
    view = -1;
    base = 0;
    history.replaceState(null, "", location.pathname);
    board.clearAnnotations();
    setModeUI();
    render();
    panel("moves");
    scheduleAnalysis();
  } catch (e) {
    report(e);
  }
}
async function loadPuzzles() {
  if (puzzles.length) return;
  try {
    puzzles = await (await fetch("data/puzzles.json")).json();
    refreshThemes();
  } catch (e) {
    report(Error("Could not load puzzle collection."));
  }
}
function refreshThemes() {
  const themes = [...new Set(puzzles.flatMap((p) => p.themes))].sort();
  $("puzzle-theme").replaceChildren(
    new Option("All themes", ""),
    ...themes.map((t) => new Option(t, t)),
  );
}
function nextPuzzle() {
  cancelWork();
  const min = Number($("puzzle-min").value),
    max = Number($("puzzle-max").value),
    theme = $("puzzle-theme").value;
  const candidates = puzzles.filter(
    (p) =>
      (p.rating === null || (p.rating >= min && p.rating <= max)) &&
      (!theme || p.themes.includes(theme)),
  );
  if (!candidates.length) {
    puzzle = null;
    game = new Chess();
    start = DEFAULT_POSITION;
    puzzleSolved = true;
    render();
    $("puzzle-detail").textContent =
      "No puzzles match these filters. Import more puzzles or broaden the filters.";
    return;
  }
  const others = candidates.filter((p) => p.id !== puzzle?.id);
  puzzle = (others.length ? others : candidates)[
    Math.floor(Math.random() * (others.length || candidates.length))
  ];
  resetPuzzle();
}
function resetPuzzle() {
  cancelWork();
  if (!puzzle) return;
  try {
    game = new Chess(puzzle.fen);
    start = puzzle.fen;
    game.move({
      from: puzzle.moves[0].slice(0, 2),
      to: puzzle.moves[0].slice(2, 4),
      promotion: puzzle.moves[0][4],
    });
    human = game.turn();
    board.orientation = human;
    puzzleStep = 1;
    puzzleSolved = false;
    puzzleWrong = 0;
    puzzleAssisted = false;
    result = null;
    view = -1;
    board.clearAnnotations();
    render();
    $("puzzle-detail").textContent =
      `${puzzle.id} · ${puzzle.rating === null ? "Unrated exercise" : puzzle.rating + " rating"} · ${puzzle.themes.join(", ")}. ${read("jenga-puzzle-progress", {}).solved || 0} solved.`;
  } catch (e) {
    puzzleSolved = true;
    report(Error("This puzzle has an invalid starting position or move."));
  }
}
async function puzzleMove(uci, dragged) {
  if (!puzzle || puzzleSolved) return;
  if (uci !== puzzle.moves[puzzleStep]) {
    const trial = new Chess(game.fen());
    let mate = false;
    try {
      trial.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4],
      });
      mate = trial.isCheckmate();
    } catch {}
    if (mate) puzzleStep = puzzle.moves.length - 1;
    else {
      puzzleWrong++;
      toast("Not the puzzle continuation. Try another move.");
      return;
    }
  }
  const gen = generation;
  const m = game.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci[4],
  });
  puzzleStep++;
  board.clearAnnotations();
  render({ last: m, animate: !dragged });
  beep();
  if (puzzleStep < puzzle.moves.length) {
    busy = true;
    await new Promise((r) => setTimeout(r, 450));
    if (gen !== generation) return;
    const u = puzzle.moves[puzzleStep++];
    try {
      game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      report(Error("Puzzle solution contains an illegal move."));
      puzzleSolved = true;
    }
    busy = false;
  }
  if (puzzleStep >= puzzle.moves.length) {
    puzzleSolved = true;
    const progress = read("jenga-puzzle-progress", { solved: 0, attempts: 0 });
    progress.attempts++;
    if (!puzzleAssisted && !puzzleWrong) progress.solved++;
    localStorage.setItem("jenga-puzzle-progress", JSON.stringify(progress));
    toast(puzzleAssisted ? "Puzzle completed with help." : "Puzzle complete!");
  }
  render({ animate: true });
}
// Controls
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => switchMode(b.dataset.mode).catch(report);
for (const b of document.querySelectorAll("[data-panel]"))
  b.onclick = () => panel(b.dataset.panel);
$("apply-setup").onclick = () =>
  mode === "online" ? createChallenge() : startGame();
$("new-game").onclick = () =>
  mode === "online"
    ? result
      ? online.command("offer", { kind: "rematch" }).catch(report)
      : panel("setup")
    : mode === "puzzle"
      ? nextPuzzle()
      : startGame();
$("theme").onclick = () => {
  $("play").classList.toggle("dark-theme");
  storeSettings();
};
$("focus").onclick = () => {
  document.body.classList.toggle("focus-mode");
  board.cancel();
  $("play").scrollIntoView({ block: "start" });
};
$("fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector(".board-column").requestFullscreen();
  } catch {
    toast("Fullscreen is unavailable. Try focus mode.");
  }
};
$("flip-board").onclick = () => {
  board.flip();
  renderPlayers();
};
$("clear-arrows").onclick = () => board.clearAnnotations();
$("sound").onclick = () => {
  sound = !sound;
  $("sound").setAttribute("aria-pressed", String(sound));
  storeSettings();
  beep();
};
$("auto-queen").onchange = () => {
  autoQueen = $("auto-queen").checked;
  storeSettings();
};
$("time-control").onchange = () =>
  ($("custom-time").hidden = $("time-control").value !== "custom");
$("history-first").onclick = () => navigate(0);
$("history-prev").onclick = () =>
  navigate((view < 0 ? game.history().length : view) - 1);
$("history-next").onclick = () =>
  navigate((view < 0 ? game.history().length : view) + 1);
$("history-last").onclick = $("return-live").onclick = () =>
  navigate(game.history().length);
window.addEventListener("keydown", (e) => {
  if (e.target.closest("input,textarea,select,dialog,#chess-board")) return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    $("history-prev").click();
  }
  if (e.key === "ArrowRight") {
    e.preventDefault();
    $("history-next").click();
  }
  if (e.key === "Escape") {
    board.clearAnnotations();
    board.selected = null;
    board.mark();
  }
});
$("takeback").onclick = async () => {
  if (mode === "online") {
    await online.command("offer", { kind: "takeback" }).catch(report);
    return;
  }
  cancelWork();
  let count = mode === "computer" && game.turn() === human ? 2 : 1;
  while (count-- && game.history().length) {
    game.undo();
    clocks = clockHistory.pop() || clocks;
  }
  stamp = Date.now();
  result = null;
  view = -1;
  render();
  saveLocal();
  if (mode === "analysis") scheduleAnalysis();
};
$("resign").onclick = async () => {
  if (!(await confirmAction("Resign this game?", "The other player will win.")))
    return;
  if (mode === "online") online.command("resign").catch(report);
  else {
    const loser = mode === "computer" ? human : game.turn();
    clocks = clockNow();
    result = { winner: opposite(loser), reason: "Resignation" };
    cancelWork();
    render();
    saveLocal();
  }
};
$("draw").onclick = async () => {
  if (mode === "online")
    online.command("offer", { kind: "draw" }).catch(report);
  else if (
    await confirmAction("Agree to a draw?", "Both local players should agree.")
  ) {
    clocks = clockNow();
    result = { winner: null, reason: "Draw by agreement" };
    cancelWork();
    render();
    saveLocal();
  }
};
$("abort").onclick = () => online.command("abort").catch(report);
$("accept-offer").onclick = () => online.command("accept").catch(report);
$("decline-offer").onclick = () => online.command("decline").catch(report);
$("analyse-game").onclick = () => switchMode("analysis", true);
$("create-challenge").onclick = createChallenge;
$("join-challenge").onclick = () =>
  online
    .join($("display-name").value)
    .then(() => {
      render();
      panel("moves");
    })
    .catch(report);
$("copy-invite").onclick = () => copy($("share-link").value);
$("copy-spectator").onclick = () => {
  const u = new URL($("share-link").value);
  u.searchParams.set("spectate", "1");
  copy(u.href);
};
$("load-fen").onclick = () => importGame("fen");
$("copy-fen").onclick = () => {
  $("fen-input").value = displayed().fen();
  copy(displayed().fen());
};
$("load-pgn").onclick = () => importGame("pgn");
$("export-pgn").onclick = () =>
  download("jenga-chess-game.pgn", pgn(), "application/x-chess-pgn");
$("pgn-file").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 2e6) return toast("Please use a PGN smaller than 2 MB.");
  $("pgn-input").value = await f.text();
  await importGame("pgn");
};
$("restore-mainline").onclick = () => {
  if (!analysisOriginal) return toast("You are on the original game line.");
  cancelWork();
  start = analysisOriginal.start;
  game = restoreGame(start, analysisOriginal.moves);
  analysisOriginal = null;
  view = -1;
  render();
  scheduleAnalysis();
};
$("another-invitation").onclick = () => {
  if (onlineState?.phase !== "ended") return;
  online.close();
  onlineState = null;
  game = new Chess();
  start = DEFAULT_POSITION;
  result = null;
  view = -1;
  history.replaceState(null, "", location.pathname);
  render();
  panel("setup");
};
$("engine-retry").onclick = () => {
  engine.cancel();
  if (mode === "analysis") scheduleAnalysis();
  else if (mode === "computer" && game.turn() !== human) engineMove();
  else toast("Stockfish will reload on its next turn.");
};
$("puzzle-next").onclick = nextPuzzle;
$("puzzle-retry").onclick = resetPuzzle;
$("puzzle-hint").onclick = () => {
  const u = puzzle?.moves[puzzleStep];
  if (!u || puzzleSolved) return;
  puzzleAssisted = true;
  board.selected = u.slice(0, 2);
  board.mark();
  toast("Look for a move with the highlighted piece.");
};
$("puzzle-reveal").onclick = async () => {
  if (!puzzle || puzzleSolved) return;
  puzzleAssisted = true;
  const gen = generation;
  busy = true;
  while (puzzleStep < puzzle.moves.length) {
    const u = puzzle.moves[puzzleStep++];
    try {
      game.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      break;
    }
    render({ animate: true });
    await new Promise((r) => setTimeout(r, 500));
    if (gen !== generation) return;
  }
  busy = false;
  puzzleSolved = true;
  render();
};
$("puzzle-file").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const w = new Worker(new URL("./PuzzleImporter.js", import.meta.url), {
    type: "module",
  });
  $("puzzle-detail").textContent = "Importing… up to 10,000 matching puzzles.";
  w.onmessage = (e) => {
    if (mode !== "puzzle") {
      w.terminate();
      return;
    }
    if (e.data.error) {
      report(Error(e.data.error));
      w.terminate();
      return;
    }
    if (e.data.progress) {
      $("puzzle-detail").textContent =
        `Read ${e.data.progress.toLocaleString()} rows…`;
      return;
    }
    puzzles = e.data.puzzles;
    refreshThemes();
    w.terminate();
    nextPuzzle();
    toast(
      `Imported ${puzzles.length.toLocaleString()} puzzles for this session.`,
    );
  };
  w.onerror = () => {
    w.terminate();
    toast("Puzzle import failed. Use an uncompressed Lichess CSV.");
  };
  w.postMessage({
    file: f,
    min: Number($("puzzle-min").value),
    max: Number($("puzzle-max").value),
    theme: $("puzzle-theme").value,
  });
};
setInterval(renderClocks, 100);
window.addEventListener("pagehide", saveLocal);
// Restore casual local progress without silently pausing a running clock.
const invitation = new URLSearchParams(location.search).get("game");
if (invitation) {
  mode = "online";
  setModeUI();
  render();
  online
    .open(invitation)
    .then(() => {
      render();
      panel("moves");
    })
    .catch(report);
} else {
  const saved = read("jenga-game", null);
  if (saved) {
    try {
      mode = ["computer", "local"].includes(saved.mode)
        ? saved.mode
        : "computer";
      human = saved.human;
      start = saved.start;
      game = restoreGame(start, saved.moves);
      result = saved.result;
      base = saved.base;
      increment = saved.increment;
      clocks = saved.clocks;
      stamp = saved.stamp;
      clockHistory = saved.clockHistory || [];
      board.orientation = human;
    } catch {
      game = new Chess();
      start = DEFAULT_POSITION;
    }
  }
  setModeUI();
  render();
  if (mode === "computer" && !result && game.turn() !== human) engineMove();
}

// Small local SVG controls avoid platform-dependent missing glyphs.
const icons = {
  focus: "M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6",
  fullscreen: "M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6",
  "flip-board": "M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4",
  "clear-arrows": "M3 12 9 5h12v14H9ZM12 9l5 6m0-6-5 6",
  sound:
    "M9 18V5l11-2v12M9 8l11-2M9 18c0 2-6 4-6 1s6-4 6-1M20 15c0 2-6 4-6 1s6-4 6-1",
};
for (const [id, path] of Object.entries(icons))
  $(id).innerHTML =
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg>`;
