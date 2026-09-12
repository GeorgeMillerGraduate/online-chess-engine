import { ENGINE_URL } from "./config.js";
export class StockfishEngine {
  constructor() {
    this.worker = null;
    this.generation = 0;
    this.waiters = [];
    this.current = null;
    this.options = {};
    this.status = "idle";
  }
  async ready() {
    if (this.worker && this.status === "ready") return;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      this.status = "loading";
      const w = (this.worker = new Worker(ENGINE_URL));
      w.onmessage = (e) =>
        String(e.data)
          .split(/\r?\n/)
          .forEach((l) => this.line(l.trim()));
      w.onerror = (e) =>
        this.fail(Error(e.message || "Stockfish could not load."));
      await this.wait("uciok", "uci");
      await this.wait("readyok", "isready");
      this.status = "ready";
    })()
      .catch((e) => {
        this.destroy();
        throw e;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }
  line(line) {
    if (line.startsWith("option name ")) {
      const m = line.match(/^option name (.*?) type (\w+)(.*)$/);
      if (m)
        this.options[m[1]] = {
          type: m[2],
          min: Number(m[3].match(/ min (-?\d+)/)?.[1]),
          max: Number(m[3].match(/ max (-?\d+)/)?.[1]),
        };
    }
    const i = this.waiters.findIndex((w) => line === w.line);
    if (i >= 0) {
      const w = this.waiters.splice(i, 1)[0];
      clearTimeout(w.timer);
      w.resolve();
    }
    if (line.startsWith("info ") && this.current?.onInfo) {
      const val = (key) =>
        line.match(new RegExp("\\b" + key + " (-?\\d+)"))?.[1];
      const pv = line.split(" pv ")[1]?.trim().split(/\s+/) || [];
      if (val("depth"))
        this.current.onInfo({
          depth: Number(val("depth")),
          cp: val("score cp") === undefined ? null : Number(val("score cp")),
          mate:
            val("score mate") === undefined ? null : Number(val("score mate")),
          multipv: Number(val("multipv") || 1),
          pv,
        });
    }
    if (line.startsWith("bestmove ") && this.current) {
      const c = this.current;
      this.current = null;
      clearTimeout(c.timer);
      const m = line.split(" ")[1];
      c.resolve(m === "(none)" || m === "0000" ? null : m);
    }
  }
  send(s) {
    if (!this.worker) throw Error("Engine not ready");
    this.worker.postMessage(s);
  }
  wait(line, cmd) {
    return new Promise((resolve, reject) => {
      const w = {
        line,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((x) => x !== w);
          reject(Error("Stockfish timed out."));
        }, 15000),
      };
      this.waiters.push(w);
      this.send(cmd);
    });
  }
  // Termination is a hard cancellation boundary: a discarded worker can never send a result into a new search.
  cancel() {
    this.generation++;
    this.destroy();
  }
  destroy() {
    this.worker?.terminate();
    this.worker = null;
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.reject(Error("Search cancelled"));
    }
    this.waiters = [];
    if (this.current) {
      clearTimeout(this.current.timer);
      this.current.resolve(null);
      this.current = null;
    }
    this.status = "idle";
  }
  fail(e) {
    if (this.current) {
      this.current.reject(e);
      clearTimeout(this.current.timer);
      this.current = null;
    }
    this.destroy();
  }
  async search({
    start,
    moves = [],
    elo = null,
    time = 700,
    analysis = false,
    onInfo,
  }) {
    const gen = this.generation;
    await this.ready();
    if (gen !== this.generation) return null;
    if (this.current) throw Error("A search is already running");
    if (this.options.UCI_LimitStrength)
      this.send(
        `setoption name UCI_LimitStrength value ${analysis || elo === null ? "false" : "true"}`,
      );
    const range = this.options.UCI_Elo;
    if (!analysis && elo !== null && range)
      this.send(
        `setoption name UCI_Elo value ${Math.max(range.min, Math.min(range.max, elo))}`,
      );
    if (this.options.MultiPV)
      this.send(`setoption name MultiPV value ${analysis ? 3 : 1}`);
    this.send(
      `position ${start ? "fen " + start : "startpos"}${moves.length ? " moves " + moves.join(" ") : ""}`,
    );
    return new Promise((resolve, reject) => {
      this.current = {
        resolve,
        reject,
        onInfo,
        timer: setTimeout(
          () => this.fail(Error("Stockfish search timed out")),
          Math.max(20000, time + 5000),
        ),
      };
      this.send(`go movetime ${time}`);
    });
  }
}
