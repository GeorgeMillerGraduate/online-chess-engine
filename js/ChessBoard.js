import { pieceImage, pieceNames, colourName } from "./ChessGame.js";
export class ChessBoard {
  constructor(el, { model, canMove, onMove }) {
    this.el = el;
    this.model = model;
    this.canMove = canMove;
    this.onMove = onMove;
    this.orientation = "w";
    this.selected = null;
    this.squares = new Map();
    this.annotations = [];
    this.pending = false;
    for (let i = 0; i < 64; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "square";
      b.tabIndex = i === 56 ? 0 : -1;
      this.el.append(b);
      this.squares.set(i, b);
    }
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.classList.add("annotations");
    this.svg.setAttribute("viewBox", "0 0 8 8");
    this.el.append(this.svg);
    el.addEventListener("pointerdown", (e) => this.down(e));
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("pointermove", (e) => this.drag(e), {
      passive: false,
    });
    window.addEventListener("pointerup", (e) => this.up(e));
    window.addEventListener("pointercancel", () => this.cancel());
    window.addEventListener("blur", () => this.cancel());
    window.addEventListener("resize", () => this.cancel());
    el.addEventListener("keydown", (e) => this.key(e));
  }
  squareAt(e) {
    const r = this.el.getBoundingClientRect(),
      x = Math.floor(((e.clientX - r.left) / r.width) * 8),
      y = Math.floor(((e.clientY - r.top) / r.height) * 8);
    return x < 0 || x > 7 || y < 0 || y > 7 ? null : this.name(x, y);
  }
  name(x, y) {
    return this.orientation === "w"
      ? "abcdefgh"[x] + (8 - y)
      : "hgfedcba"[x] + (y + 1);
  }
  xy(s) {
    let x = "abcdefgh".indexOf(s[0]),
      y = 8 - Number(s[1]);
    return this.orientation === "w" ? [x, y] : [7 - x, 7 - y];
  }
  node(s) {
    return [...this.squares.values()].find((b) => b.dataset.square === s);
  }
  down(e) {
    const from = this.squareAt(e);
    if (!from || this.pending || e.button > 2) return;
    if (e.button === 2) {
      this.pointer = {
        id: e.pointerId,
        from,
        x: e.clientX,
        y: e.clientY,
        right: true,
      };
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const p = this.model().get(from);
    this.pointer = {
      id: e.pointerId,
      from,
      x: e.clientX,
      y: e.clientY,
      draggable: !!p && this.canMove(p.color),
      moved: false,
    };
    if (this.pointer.draggable) e.preventDefault();
    this.node(from)?.focus({ preventScroll: true });
  }
  drag(e) {
    const d = this.pointer;
    if (!d || e.pointerId !== d.id || d.right || !d.draggable) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return;
    e.preventDefault();
    if (!d.moved) {
      d.moved = true;
      this.selected = d.from;
      this.mark();
      const img = this.node(d.from)?.querySelector("img");
      if (!img) return;
      d.original = img;
      img.style.opacity = ".2";
      d.ghost = img.cloneNode();
      d.ghost.className = "drag-ghost";
      d.ghost.style.width = this.el.clientWidth / 8 + "px";
      document.body.append(d.ghost);
    }
    if (d.ghost) {
      d.ghost.style.left = e.clientX + "px";
      d.ghost.style.top = e.clientY + "px";
    }
  }
  async up(e) {
    const d = this.pointer;
    if (!d || e.pointerId !== d.id) return;
    const to = this.squareAt(e);
    this.cancel();
    if (d.right) {
      if (to) {
        const key = d.from + to,
          i = this.annotations.findIndex((a) => a.join("") === key);
        if (i >= 0) this.annotations.splice(i, 1);
        else this.annotations.push([d.from, to]);
        this.drawArrows();
      }
      return;
    }
    if (d.moved) {
      if (to && to !== d.from) await this.attempt(d.from, to, true);
      else {
        this.selected = null;
        this.mark();
      }
      return;
    }
    if (to === d.from) await this.click(to);
  }
  cancel() {
    const d = this.pointer;
    d?.ghost?.remove();
    if (d?.original) d.original.style.opacity = "";
    this.pointer = null;
  }
  async click(s) {
    if (this.pending) return;
    const c = this.model(),
      p = c.get(s);
    if (
      this.selected &&
      s !== this.selected &&
      c.moves({ square: this.selected, verbose: true }).some((m) => m.to === s)
    ) {
      await this.attempt(this.selected, s, false);
      return;
    }
    this.selected =
      this.selected === s ? null : p && this.canMove(p.color) ? s : null;
    this.mark();
  }
  async attempt(from, to, dragged) {
    if (this.pending) return;
    const c = this.model(),
      p = c.get(from);
    this.selected = null;
    this.mark();
    if (
      !p ||
      !this.canMove(p.color) ||
      !c.moves({ square: from, verbose: true }).some((m) => m.to === to)
    )
      return;
    this.pending = true;
    try {
      await this.onMove(from, to, dragged);
    } finally {
      this.pending = false;
      this.mark();
    }
  }
  render({ last = null, animate = false } = {}) {
    this.last = last;
    const c = this.model();
    this.cancel();
    for (const [i, b] of this.squares) {
      const x = i % 8,
        y = Math.floor(i / 8),
        s = this.name(x, y),
        p = c.get(s),
        key = p ? p.color + p.type : "";
      b.dataset.square = s;
      b.className =
        "square " +
        (("abcdefgh".indexOf(s[0]) + Number(s[1])) % 2 === 0
          ? "light"
          : "dark");
      b.setAttribute(
        "aria-label",
        `${s}${p ? ", " + colourName(p.color) + " " + pieceNames[p.type] : ", empty"}`,
      );
      if (b.dataset.piece !== key) {
        b.replaceChildren();
        b.dataset.piece = key;
        if (p) {
          const img = document.createElement("img");
          img.src = pieceImage(p);
          img.alt = "";
          img.draggable = false;
          b.append(img);
        }
      }
      b.querySelectorAll(".coord").forEach((n) => n.remove());
      if (x === 0) this.label(b, s[1], "rank");
      if (y === 7) this.label(b, s[0], "file");
      if (last && (s === last.from || s === last.to))
        b.classList.add("last-move");
      if (p?.type === "k" && p.color === c.turn() && c.isCheck()) {
        b.classList.add("checked");
        const badge = document.createElement("span");
        badge.className = "check-badge";
        badge.textContent = c.isCheckmate() ? "#" : "+";
        badge.setAttribute(
          "aria-label",
          c.isCheckmate() ? "Checkmate" : "Check",
        );
        b.querySelector(".check-badge")?.remove();
        b.append(badge);
      } else b.querySelector(".check-badge")?.remove();
    }
    if (
      animate &&
      last &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      this.animate(last.from, last.to);
      const p = c.get(last.to);
      if (
        p?.type === "k" &&
        Math.abs(last.from.charCodeAt(0) - last.to.charCodeAt(0)) === 2
      )
        this.animate(
          (last.to[0] === "g" ? "h" : "a") + last.to[1],
          (last.to[0] === "g" ? "f" : "d") + last.to[1],
        );
    }
    this.mark();
    this.drawArrows();
  }
  animate(from, to) {
    const img = this.node(to)?.querySelector("img");
    if (!img) return;
    const a = this.xy(from),
      b = this.xy(to),
      n = this.el.clientWidth / 8;
    img.animate(
      [
        {
          transform: `translate(${(a[0] - b[0]) * n}px,${(a[1] - b[1]) * n}px)`,
        },
        { transform: "translate(0,0)" },
      ],
      { duration: 160, easing: "ease-out" },
    );
  }
  label(b, text, cl) {
    const n = document.createElement("span");
    n.className = "coord " + cl;
    n.textContent = text;
    b.append(n);
  }
  mark() {
    for (const b of this.squares.values()) {
      b.classList.remove("selected", "legal", "capture");
      if (b.dataset.square === this.selected) b.classList.add("selected");
    }
    if (this.selected)
      for (const m of this.model().moves({
        square: this.selected,
        verbose: true,
      })) {
        this.node(m.to)?.classList.add(m.captured ? "capture" : "legal");
      }
  }
  flip() {
    this.orientation = this.orientation === "w" ? "b" : "w";
    this.selected = null;
    this.render({ last: this.last });
  }
  clearAnnotations() {
    this.annotations = [];
    this.engineArrow = null;
    this.drawArrows();
  }
  drawArrows() {
    this.svg.replaceChildren();
    for (const [a, b] of [
      ...this.annotations,
      ...(this.engineArrow ? [this.engineArrow] : []),
    ]) {
      const [x, y] = this.xy(a),
        [u, v] = this.xy(b);
      const n = document.createElementNS(
        this.svg.namespaceURI,
        a === b ? "circle" : "path",
      );
      if (a === b) {
        n.setAttribute("cx", x + 0.5);
        n.setAttribute("cy", y + 0.5);
        n.setAttribute("r", ".39");
        n.setAttribute("fill", "none");
      } else {
        const dx = u - x,
          dy = v - y,
          len = Math.hypot(dx, dy),
          ex = u + 0.5 - (dx / len) * 0.15,
          ey = v + 0.5 - (dy / len) * 0.15;
        n.setAttribute(
          "d",
          `M${x + 0.5},${y + 0.5} L${ex},${ey} M${ex - (dx / len) * 0.27 - (dy / len) * 0.18},${ey - (dy / len) * 0.27 + (dx / len) * 0.18} L${ex},${ey} L${ex - (dx / len) * 0.27 + (dy / len) * 0.18},${ey - (dy / len) * 0.27 - (dx / len) * 0.18}`,
        );
      }
      n.setAttribute("stroke", "#d19a20");
      n.setAttribute("stroke-width", ".13");
      n.setAttribute("stroke-linecap", "round");
      n.setAttribute("opacity", ".85");
      this.svg.append(n);
    }
  }
  key(e) {
    const b = e.target.closest(".square");
    if (!b) return;
    const i = [...this.squares.values()].indexOf(b);
    let next = i;
    const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
    if (e.key in offsets) {
      e.preventDefault();
      next = Math.max(0, Math.min(63, i + offsets[e.key]));
      b.tabIndex = -1;
      const n = this.squares.get(next);
      n.tabIndex = 0;
      n.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.click(b.dataset.square);
    } else if (e.key === "Escape") {
      this.selected = null;
      this.cancel();
      this.clearAnnotations();
      this.mark();
    }
  }
}
