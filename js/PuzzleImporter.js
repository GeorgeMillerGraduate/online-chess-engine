// Incremental CSV parsing in a worker: bounded result set, no whole-file read.
self.onmessage = async ({ data: { file, min, max, theme } }) => {
  try {
    const reader = file
      .stream()
      .pipeThrough(new TextDecoderStream())
      .getReader();
    let pending = "",
      header = null,
      count = 0;
    const puzzles = [];
    const parse = (line) => {
      const out = [];
      let q = false,
        s = "";
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          if (q && line[i + 1] === '"') {
            s += '"';
            i++;
          } else q = !q;
        } else if (c === "," && !q) {
          out.push(s);
          s = "";
        } else s += c;
      }
      out.push(s);
      return out;
    };
    const process = (line) => {
      if (!line.trim()) return;
      if (!header) {
        header = parse(line.replace(/^\uFEFF/, ""));
        if (
          !["PuzzleId", "FEN", "Moves", "Rating", "Themes"].every((k) =>
            header.includes(k),
          )
        )
          throw Error("Expected the Lichess puzzle CSV header.");
        return;
      }
      const a = parse(line),
        get = (k) => a[header.indexOf(k)],
        rating = Number(get("Rating")),
        themes = (get("Themes") || "").split(" ");
      count++;
      if (count % 10000 === 0) postMessage({ progress: count });
      if (
        rating >= min &&
        rating <= max &&
        (!theme || themes.includes(theme))
      ) {
        const moves = (get("Moves") || "").split(" ");
        if (
          moves.length > 1 &&
          moves.every((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))
        )
          puzzles.push({
            id: get("PuzzleId"),
            fen: get("FEN"),
            moves,
            rating,
            themes,
          });
      }
    };
    while (puzzles.length < 10000) {
      const { value, done } = await reader.read();
      if (done) {
        if (pending) process(pending);
        break;
      }
      pending += value;
      if (pending.length > 4e6 && !pending.includes("\n"))
        throw Error("CSV row is too large.");
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) {
        process(line);
        if (puzzles.length >= 10000) break;
      }
    }
    await reader.cancel();
    postMessage({ puzzles });
  } catch (e) {
    postMessage({ error: e.message });
  }
};
