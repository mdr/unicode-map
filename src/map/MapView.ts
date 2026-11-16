import { interpolateZoom } from "d3-interpolate";
import { displayString, hex, planeName, UnicodeData } from "../data/unicode";
import { ColorMode, PLANE_BG, RGB } from "./colorModes";
import {
  cellToCp,
  cpToCell,
  labelRect,
  PLANE_COUNT,
  PLANE_SIZE,
  planeOrigin,
  rangeOutline,
  rangeRect,
  Rect,
  WORLD,
} from "./layout";

export interface Camera {
  cx: number;
  cy: number;
  k: number; // screen pixels per cell
}

export interface MapCallbacks {
  onHover(cp: number, clientX: number, clientY: number): void;
  onSelect(cp: number | null): void;
  onCamera(cam: Camera): void;
}

const PAGE_BG = "#0b0e14";
const UI_FONT = 'Inter, ui-sans-serif, system-ui, sans-serif';
const MONO_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

// Zoom thresholds (pixels per cell)
const GRID_START = 5;
const CARD_START = 22;
const CARD_FULL = 36;
const HEX_START = 58;
const NAME_START = 120;
const AXIS_START = 13;
const SECTION_START = 5.5;
/** Code points per side of a highlight tile at low zoom. */
const TILE = 4;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class MapView {
  private ctx: CanvasRenderingContext2D;
  private cam: Camera = { cx: 0, cy: 0, k: 1 };
  private w = 0;
  private h = 0;
  private dpr = 1;
  private mode!: ColorMode;
  private highlight: Set<number> | null = null;
  private planeBitmaps: HTMLCanvasElement[] = [];
  private cardColors: string[] = [];
  private dimCardColors: string[] = [];
  private fullColors: string[] = [];
  private dimColors: string[] = [];
  private valueOn = new Uint8Array(0);
  private mask: Uint8Array | null = null;
  private tileBitmaps: HTMLCanvasElement[] = [];
  private tilesOn = false;
  private blockLit: Uint8Array | null = null;
  private asOf: number | null = null;
  private blockFirstAge: number[];
  private sections: { s: number; e: number; title: string; path: Path2D; plane: number; block: number; bbox: Rect }[];
  private blockLabelRows: number[];
  private sectionFirstAge: number[];
  private blockHasSections: boolean[];
  private blockPaths: Path2D[];
  private selected: number | null = null;
  private hovered = -1;
  private dirty = true;
  private raf = 0;
  private anim: { start: number; dur: number; f: (t: number) => Camera } | null = null;
  private loadedRows = new Set<number>();
  private pendingRows = new Set<number>();
  private lastResortReady = false;
  private minimap: HTMLCanvasElement | null = null;
  private resizeObs: ResizeObserver;
  private disposers: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private data: UnicodeData,
    private cb: MapCallbacks,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.blockPaths = data.meta.blocks.map((b) => {
      const p = new Path2D();
      const pts = rangeOutline(b.s, b.e);
      p.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) p.lineTo(x, y);
      p.closePath();
      return p;
    });
    this.blockFirstAge = data.meta.blocks.map((b) => {
      let min = Infinity;
      for (let cp = b.s; cp <= b.e; cp++) if (data.isAssigned(cp) && data.ageIdx[cp] < min) min = data.ageIdx[cp];
      return min;
    });
    this.sections = data.meta.sections.map(([s, e, title]) => {
      const path = new Path2D();
      const pts = rangeOutline(s, e);
      path.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) path.lineTo(x, y);
      path.closePath();
      return { s, e, title, path, plane: s >> 16, block: data.blockIdx[s], bbox: rangeRect(s, e) };
    });
    const firstAge = (a: number, b: number) => {
      let min = Infinity;
      for (let cp = a; cp <= b; cp++) if (data.isAssigned(cp) && data.ageIdx[cp] < min) min = data.ageIdx[cp];
      return min;
    };
    this.sectionFirstAge = this.sections.map((sec) => firstAge(sec.s, sec.e));
    this.blockHasSections = data.meta.blocks.map(() => false);
    this.blockLabelRows = data.meta.blocks.map((b) => labelRect(b.s, b.e).h);
    for (const sec of this.sections) {
      const bi = data.blockIdx[sec.s];
      if (bi >= 0) this.blockHasSections[bi] = true;
    }
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas);
    this.resize();
    this.bindInput();
    document.fonts.load(`16px "UMap Last Resort"`, "A").then(() => {
      this.lastResortReady = true;
      this.invalidate();
    });
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      if (this.anim) {
        const t = clamp((now - this.anim.start) / this.anim.dur, 0, 1);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        this.setCamera(this.anim.f(e), false);
        if (t >= 1) this.anim = null;
      }
      if (this.dirty) {
        this.dirty = false;
        this.render();
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.disposers.forEach((d) => d());
  }

  // ---------------------------------------------------------------------------
  // Public API

  get camera(): Camera {
    return { ...this.cam };
  }
  get size() {
    return { w: this.w, h: this.h };
  }

  setMode(mode: ColorMode) {
    this.mode = mode;
    this.rebuildBitmaps();
  }

  setHighlight(values: Set<number> | null) {
    this.highlight = values;
    this.rebuildBitmaps();
  }

  /** Dim everything outside a per-code-point mask (property highlight). */
  setMask(mask: Uint8Array | null) {
    this.mask = mask;
    this.rebuildBitmaps();
  }

  /** Show Unicode as of an age index (see meta.ages), or null for the current version. */
  setAsOf(ageIndex: number | null) {
    if (ageIndex === this.asOf) return;
    this.asOf = ageIndex;
    this.rebuildBitmaps();
  }

  setSelected(cp: number | null) {
    this.selected = cp;
    this.invalidate();
  }

  setMinimap(canvas: HTMLCanvasElement | null) {
    this.minimap = canvas;
    this.invalidate();
  }

  setCamera(cam: Camera, cancelAnim = true) {
    if (cancelAnim) this.anim = null;
    const kMin = this.fitK() * 0.6;
    this.cam = { cx: cam.cx, cy: cam.cy, k: clamp(cam.k, kMin, 800) };
    this.invalidate();
    this.cb.onCamera(this.camera);
  }

  /** Screen margins covered by floating UI, respected when fitting things into view. */
  insets = { l: 16, t: 92, r: 16, b: 16 };

  fitK() {
    return Math.min(this.availW() / WORLD.w, this.availH() / WORLD.h) * 0.98;
  }
  private availW() {
    return Math.max(100, this.w - this.insets.l - this.insets.r);
  }
  private availH() {
    return Math.max(100, this.h - this.insets.t - this.insets.b);
  }
  /** Camera centre that puts world point (x, y) in the middle of the unobscured area. */
  private centreFor(x: number, y: number, k: number) {
    return { cx: x - (this.insets.l - this.insets.r) / 2 / k, cy: y - (this.insets.t - this.insets.b) / 2 / k };
  }

  overview(animate = true) {
    this.flyToRect(WORLD, { animate, pad: 1 });
  }

  /** Fly so that rect (world) fills the view. */
  flyToRect(r: Rect, opts: { animate?: boolean; pad?: number; maxK?: number } = {}) {
    const pad = opts.pad ?? 1.15;
    const k = clamp(Math.min(this.availW() / (r.w * pad), this.availH() / (r.h * pad)), 0, opts.maxK ?? 140);
    this.flyTo({ ...this.centreFor(r.x + r.w / 2, r.y + r.h / 2, k), k }, opts.animate ?? true);
  }

  flyTo(target: Camera, animate = true) {
    if (!animate || this.w === 0) {
      this.setCamera(target);
      return;
    }
    const from = this.cam;
    const interp = interpolateZoom([from.cx, from.cy, this.w / from.k], [target.cx, target.cy, this.w / target.k]);
    const dur = clamp(interp.duration * 0.9, 350, 1800);
    this.anim = {
      start: performance.now(),
      dur,
      f: (t) => {
        const [cx, cy, vw] = interp(t);
        return { cx, cy, k: this.w / vw };
      },
    };
    this.invalidate();
  }

  /** Bring a code point into view, zooming in to glyph level if needed. */
  focusCp(cp: number, opts: { zoom?: boolean; animate?: boolean } = {}) {
    const c = cpToCell(cp);
    const k = opts.zoom === false ? this.cam.k : Math.max(this.cam.k, 72);
    const sx = (c.x + 0.5 - this.cam.cx) * k + this.w / 2;
    const sy = (c.y + 0.5 - this.cam.cy) * k + this.h / 2;
    const margin = Math.min(140, this.w / 4);
    if (k === this.cam.k && sx > margin && sx < this.w - margin && sy > margin && sy < this.h - margin) return;
    if (k === this.cam.k && Math.abs(sx - this.w / 2) < this.w * 1.5 && Math.abs(sy - this.h / 2) < this.h * 1.5) {
      // Nearby: pan just enough.
      const nx = clamp(sx, margin, this.w - margin);
      const ny = clamp(sy, margin, this.h - margin);
      this.flyTo({ cx: this.cam.cx + (sx - nx) / k, cy: this.cam.cy + (sy - ny) / k, k });
      return;
    }
    this.flyTo({ ...this.centreFor(c.x + 0.5, c.y + 0.5, k), k }, opts.animate ?? true);
  }

  zoomBy(factor: number) {
    this.flyTo({ ...this.cam, k: this.cam.k * factor });
  }

  invalidate() {
    this.dirty = true;
  }

  /** Screen point → world point. */
  toWorld(sx: number, sy: number) {
    return { x: (sx - this.w / 2) / this.cam.k + this.cam.cx, y: (sy - this.h / 2) / this.cam.k + this.cam.cy };
  }

  // ---------------------------------------------------------------------------
  // Internals

  private resize() {
    const r = this.canvas.getBoundingClientRect();
    const first = this.w === 0;
    this.dpr = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    if (first && this.w > 0) {
      const k = this.fitK();
      this.setCamera({ ...this.centreFor(WORLD.x + WORLD.w / 2, WORLD.y + WORLD.h / 2, k), k });
    }
    this.invalidate();
  }

  private rebuildBitmaps() {
    if (!this.mode) return;
    const { valueOf, colors } = this.mode;
    const data = this.data;
    const hl = this.highlight;
    const mask = this.mask;
    const asOf = this.asOf;
    const dim = (c: RGB): RGB => [
      Math.round(PLANE_BG[0] + (c[0] - PLANE_BG[0]) * 0.16),
      Math.round(PLANE_BG[1] + (c[1] - PLANE_BG[1]) * 0.16),
      Math.round(PLANE_BG[2] + (c[2] - PLANE_BG[2]) * 0.16),
    ];
    const card = (c: RGB, f: number) =>
      `rgb(${Math.round(PAGE_BG_RGB[0] + (c[0] - PAGE_BG_RGB[0]) * f)},${Math.round(PAGE_BG_RGB[1] + (c[1] - PAGE_BG_RGB[1]) * f)},${Math.round(PAGE_BG_RGB[2] + (c[2] - PAGE_BG_RGB[2]) * f)})`;
    const dimmed = colors.map(dim);
    this.fullColors = colors.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);
    this.dimColors = dimmed.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);
    this.cardColors = colors.map((c) => card(c, 0.2));
    this.dimCardColors = colors.map((c) => card(c, 0.05));
    // Per value: is it highlighted by the legend?
    this.valueOn = new Uint8Array(colors.length).fill(1);
    if (hl) this.valueOn.fill(0).forEach((_, v) => (this.valueOn[v] = hl.has(v) ? 1 : 0));

    // When something is highlighted, sparse matches vanish at low zoom (a plane is ~170px wide
    // for 256 cells), so also build coarse tiles that light up if any cell in them matches.
    const filtering = hl !== null || mask !== null;
    this.blockLit = filtering ? new Uint8Array(data.meta.blocks.length) : null;

    for (let p = 0; p < PLANE_COUNT; p++) {
      let tile: ImageData | null = null;
      if (filtering) {
        let tc = this.tileBitmaps[p];
        if (!tc) {
          tc = document.createElement("canvas");
          tc.width = tc.height = PLANE_SIZE / TILE;
          this.tileBitmaps[p] = tc;
        }
        tile = tc.getContext("2d")!.createImageData(PLANE_SIZE / TILE, PLANE_SIZE / TILE);
      }
      let cv = this.planeBitmaps[p];
      if (!cv) {
        cv = document.createElement("canvas");
        cv.width = cv.height = PLANE_SIZE;
        this.planeBitmaps[p] = cv;
      }
      const c = cv.getContext("2d")!;
      const img = c.createImageData(PLANE_SIZE, PLANE_SIZE);
      const d = img.data;
      const base = p << 16;
      for (let i = 0; i < 65536; i++) {
        const cp = base + i;
        let col: RGB;
        if (asOf !== null && data.ageIdx[cp] > asOf) col = PLANE_BG; // not yet encoded
        else {
          const v = valueOf[cp];
          const lit = this.valueOn[v] && (!mask || mask[cp]);
          col = lit ? colors[v] : dimmed[v];
          if (tile && lit && data.isAssigned(cp)) {
            const t = (((i >> 8) / TILE) | 0) * (PLANE_SIZE / TILE) + (((i & 255) / TILE) | 0);
            const to = t * 4;
            tile.data[to] = col[0];
            tile.data[to + 1] = col[1];
            tile.data[to + 2] = col[2];
            tile.data[to + 3] = 255;
            const b = data.blockIdx[cp];
            if (b >= 0) this.blockLit![b] = 1;
          }
        }
        const o = i * 4;
        d[o] = col[0];
        d[o + 1] = col[1];
        d[o + 2] = col[2];
        d[o + 3] = 255;
      }
      c.putImageData(img, 0, 0);
      if (tile) this.tileBitmaps[p].getContext("2d")!.putImageData(tile, 0, 0);
    }
    this.tilesOn = filtering;
    this.invalidate();
  }

  /** Whether a code point is dimmed by the legend highlight or the property mask. */
  private isDim(cp: number, v: number) {
    return !this.valueOn[v] || (this.mask !== null && !this.mask[cp]);
  }

  /** Whether a code point exists in the version being shown. */
  private exists(cp: number) {
    return this.data.isAssigned(cp) && (this.asOf === null || this.data.ageIdx[cp] <= this.asOf);
  }

  private visibleWorld(): Rect {
    const { cx, cy, k } = this.cam;
    return { x: cx - this.w / 2 / k, y: cy - this.h / 2 / k, w: this.w / k, h: this.h / k };
  }

  private sx(wx: number) {
    return (wx - this.cam.cx) * this.cam.k + this.w / 2;
  }
  private sy(wy: number) {
    return (wy - this.cam.cy) * this.cam.k + this.h / 2;
  }

  private render() {
    if (!this.mode || this.w === 0) return;
    const ctx = this.ctx;
    const { k } = this.cam;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAGE_BG;
    ctx.fillRect(0, 0, this.w, this.h);

    const vis = this.visibleWorld();
    const planes: number[] = [];
    for (let p = 0; p < PLANE_COUNT; p++) {
      const o = planeOrigin(p);
      if (o.x + PLANE_SIZE < vis.x || o.x > vis.x + vis.w || o.y + PLANE_SIZE < vis.y || o.y > vis.y + vis.h) continue;
      planes.push(p);
    }

    // 1. Plane bitmaps
    ctx.imageSmoothingEnabled = false;
    for (const p of planes) {
      const o = planeOrigin(p);
      ctx.drawImage(this.planeBitmaps[p], this.sx(o.x), this.sy(o.y), PLANE_SIZE * k, PLANE_SIZE * k);
    }

    // Highlight tiles at low zoom
    const tileA = this.tilesOn ? 1 - smooth(1.6, 4, k) : 0;
    if (tileA > 0.01) {
      ctx.globalAlpha = tileA;
      for (const p of planes) {
        const o = planeOrigin(p);
        ctx.drawImage(this.tileBitmaps[p], this.sx(o.x), this.sy(o.y), PLANE_SIZE * k, PLANE_SIZE * k);
      }
      ctx.globalAlpha = 1;
    }

    // 2. Cards & glyphs at high zoom
    const cardT = smooth(CARD_START, CARD_FULL, k);
    if (cardT > 0) this.renderCells(planes, vis, cardT);

    // 3. Grid lines
    const gridA = smooth(GRID_START, GRID_START * 3, k) * (1 - cardT);
    if (gridA > 0.01) this.renderGrid(planes, vis, gridA);

    // 4. Block outlines
    this.renderBlockOutlines(planes);

    // 5. Plane frames and titles
    for (const p of planes) this.renderPlaneFrame(p);

    // 6. Chart sections, then block labels
    const labelA = 1 - smooth(CARD_START * 0.75, CARD_START * 1.05, k);
    const sectionA = smooth(SECTION_START, SECTION_START * 1.5, k);
    const axisA = smooth(AXIS_START, AXIS_START * 1.6, k);
    if (sectionA * labelA > 0.01) this.renderSections(planes, vis, labelA, sectionA);
    if (labelA > 0.01) this.renderBlockLabels(planes, vis, labelA, sectionA, axisA);

    // 7. Hover / selection
    this.renderMarkers();

    // 8. Sticky axes
    if (axisA > 0.01) this.renderAxes(planes, vis, axisA);

    this.renderMinimap();
  }

  private renderGrid(planes: number[], vis: Rect, alpha: number) {
    const ctx = this.ctx;
    const k = this.cam.k;
    ctx.strokeStyle = `rgba(8, 10, 14, ${0.55 * alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const p of planes) {
      const o = planeOrigin(p);
      const x0 = Math.max(o.x, Math.floor(vis.x));
      const x1 = Math.min(o.x + PLANE_SIZE, Math.ceil(vis.x + vis.w));
      const y0 = Math.max(o.y, Math.floor(vis.y));
      const y1 = Math.min(o.y + PLANE_SIZE, Math.ceil(vis.y + vis.h));
      const top = this.sy(Math.max(o.y, vis.y)), bottom = this.sy(Math.min(o.y + PLANE_SIZE, vis.y + vis.h));
      const left = this.sx(Math.max(o.x, vis.x)), right = this.sx(Math.min(o.x + PLANE_SIZE, vis.x + vis.w));
      for (let x = x0; x <= x1; x++) {
        const s = Math.round(this.sx(x)) + 0.5;
        ctx.moveTo(s, top);
        ctx.lineTo(s, bottom);
      }
      for (let y = y0; y <= y1; y++) {
        const s = Math.round(this.sy(y)) + 0.5;
        ctx.moveTo(left, s);
        ctx.lineTo(right, s);
      }
    }
    ctx.stroke();
    // Stronger lines every 16 cells
    if (k > GRID_START * 1.5) {
      ctx.strokeStyle = `rgba(8, 10, 14, ${0.8 * alpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const p of planes) {
        const o = planeOrigin(p);
        for (let x = o.x; x <= o.x + PLANE_SIZE; x += 16) {
          if (x < vis.x - 1 || x > vis.x + vis.w + 1) continue;
          ctx.moveTo(this.sx(x), this.sy(o.y));
          ctx.lineTo(this.sx(x), this.sy(o.y + PLANE_SIZE));
        }
        for (let y = o.y; y <= o.y + PLANE_SIZE; y += 16) {
          if (y < vis.y - 1 || y > vis.y + vis.h + 1) continue;
          ctx.moveTo(this.sx(o.x), this.sy(y));
          ctx.lineTo(this.sx(o.x + PLANE_SIZE), this.sy(y));
        }
      }
      ctx.stroke();
    }
  }

  private renderCells(planes: number[], vis: Rect, t: number) {
    const ctx = this.ctx;
    const data = this.data;
    const k = this.cam.k;
    const { valueOf } = this.mode;
    const glyphPx = k * 0.5;
    const hexA = smooth(HEX_START, HEX_START * 1.3, k);
    const nameA = smooth(NAME_START, NAME_START * 1.3, k);
    const gap = Math.max(1, k * 0.04);
    const bar = Math.max(2, k * 0.05);
    let lastFont = "";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (const p of planes) {
      const o = planeOrigin(p);
      const x0 = Math.max(0, Math.floor(vis.x - o.x));
      const x1 = Math.min(PLANE_SIZE - 1, Math.floor(vis.x + vis.w - o.x));
      const y0 = Math.max(0, Math.floor(vis.y - o.y));
      const y1 = Math.min(PLANE_SIZE - 1, Math.floor(vis.y + vis.h - o.y));
      if (x0 > x1 || y0 > y1) continue;

      // Cover the bitmap with a dark backdrop, faded in.
      ctx.globalAlpha = t;
      ctx.fillStyle = PAGE_BG;
      ctx.fillRect(this.sx(o.x + x0), this.sy(o.y + y0), (x1 - x0 + 1) * k, (y1 - y0 + 1) * k);

      for (let ly = y0; ly <= y1; ly++) {
        const rowCp = (p << 16) | (ly << 8);
        const rowReady = this.ensureRowFonts(rowCp);
        const sy = this.sy(o.y + ly);
        for (let lx = x0; lx <= x1; lx++) {
          const cp = rowCp | lx;
          const v = valueOf[cp];
          const sx = this.sx(o.x + lx);
          ctx.globalAlpha = t;
          if (!this.exists(cp)) {
            ctx.fillStyle = data.nonchar[cp] ? "#2a1820" : "#12161e";
            ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, k - 2 * gap);
            continue;
          }
          const dim = this.isDim(cp, v);
          ctx.fillStyle = dim ? this.dimCardColors[v] : this.cardColors[v];
          ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, k - 2 * gap);
          ctx.fillStyle = dim ? this.dimColors[v] : this.fullColors[v];
          ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, bar);

          const glyphY = sy + k * (nameA > 0 ? 0.42 : hexA > 0 ? 0.47 : 0.53);
          const str = displayString(data, cp);
          if (str) {
            if (rowReady) {
              ctx.globalAlpha = t * (dim ? 0.25 : 1);
              ctx.fillStyle = "#eef1f6";
              const font = `${glyphPx}px ${data.glyphFamily(cp)}`;
              if (font !== lastFont) ctx.font = lastFont = font;
              ctx.fillText(str, sx + k / 2, glyphY);
            }
          } else {
            this.drawSpecial(cp, sx, k, glyphY, t * (dim ? 0.3 : 1));
            lastFont = "";
          }
          if (hexA > 0) {
            ctx.globalAlpha = t * hexA * (dim ? 0.3 : 0.75);
            ctx.fillStyle = "#aab3c3";
            ctx.font = lastFont = `500 ${Math.min(14, k * 0.12)}px ${MONO_FONT}`;
            ctx.fillText(hex(cp), sx + k / 2, sy + k * 0.88);
          }
          if (nameA > 0) {
            ctx.globalAlpha = t * nameA * (dim ? 0.3 : 0.85);
            ctx.fillStyle = "#c4cad6";
            const fs = Math.min(12, k * 0.075);
            ctx.font = lastFont = `500 ${fs}px ${UI_FONT}`;
            this.wrapText(data.name(cp), sx + k / 2, sy + k * 0.72, k * 0.88, fs * 1.15, 2);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawSpecial(cp: number, sx: number, k: number, cy: number, alpha: number) {
    const ctx = this.ctx;
    const gc = this.data.gc(cp).code;
    let label: string | undefined;
    if (gc === "Co") label = "PUA";
    else if (gc === "Cs") label = "SUR";
    else label = this.data.abbr(cp) ?? hex(cp);
    if (!label) return;
    const bw = k * 0.62;
    const bh = k * 0.36;
    ctx.globalAlpha = alpha * 0.8;
    ctx.strokeStyle = "#8b95a8";
    ctx.lineWidth = Math.max(1, k * 0.012);
    ctx.setLineDash([Math.max(2, k * 0.03), Math.max(2, k * 0.03)]);
    ctx.strokeRect(sx + (k - bw) / 2, cy - bh / 2, bw, bh);
    ctx.setLineDash([]);
    ctx.fillStyle = "#c9d0dc";
    ctx.font = `600 ${Math.min(bh * 0.55, (bw / label.length) * 1.5)}px ${MONO_FONT}`;
    ctx.fillText(label, sx + k / 2, cy + 1);
  }

  private wrapText(text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
    const ctx = this.ctx;
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (ctx.measureText(next).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] += "…";
    }
    const startY = y - ((lines.length - 1) * lineH) / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineH, maxW));
  }

  /** Ask the browser to load the font faces needed for a row; returns whether they're ready. */
  private ensureRowFonts(rowCp: number): boolean {
    const row = rowCp >> 8;
    if (this.loadedRows.has(row)) return this.lastResortReady;
    if (!this.pendingRows.has(row)) {
      this.pendingRows.add(row);
      // Group the row's characters by font family and load each family for its characters.
      const byFamily = new Map<string, string>();
      for (let i = 0; i < 256; i++) {
        const cp = rowCp | i;
        const str = displayString(this.data, cp);
        if (!str) continue;
        const fam = this.data.glyphFamily(cp);
        byFamily.set(fam, (byFamily.get(fam) ?? "") + str);
      }
      const done = () => {
        this.pendingRows.delete(row);
        this.loadedRows.add(row);
        this.invalidate();
      };
      Promise.all([...byFamily].map(([fam, s]) => document.fonts.load(`32px ${fam}`, s))).then(done, done);
    }
    return false;
  }

  private renderBlockOutlines(planes: number[]) {
    const ctx = this.ctx;
    const { k, cx, cy } = this.cam;
    const dpr = this.dpr;
    const planeSet = new Set(planes);
    ctx.save();
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - cx * k), dpr * (this.h / 2 - cy * k));
    ctx.lineJoin = "round";
    const blocks = this.data.meta.blocks;
    const base = clamp(0.5 - k * 0.004, 0.25, 0.5);
    ctx.strokeStyle = `rgba(8, 10, 14, ${base + 0.25})`;
    ctx.lineWidth = Math.max(1.2, Math.min(3, k * 0.08)) / k;
    blocks.forEach((b, i) => {
      if (planeSet.has(b.s >> 16) && this.blockExists(i)) ctx.stroke(this.blockPaths[i]);
    });
    // Hovered block, at low zoom
    const hb = this.hovered >= 0 ? this.data.blockIdx[this.hovered] : -1;
    if (hb >= 0 && k < CARD_START) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2 / k;
      ctx.stroke(this.blockPaths[hb]);
    }
    const sb = this.selected !== null ? this.data.blockIdx[this.selected] : -1;
    if (sb >= 0 && sb !== hb) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.5 / k;
      ctx.stroke(this.blockPaths[sb]);
    }
    ctx.restore();
  }

  private renderPlaneFrame(p: number) {
    const ctx = this.ctx;
    const k = this.cam.k;
    const o = planeOrigin(p);
    const x = this.sx(o.x), y = this.sy(o.y), s = PLANE_SIZE * k;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(s) + 1, Math.round(s) + 1);

    const [name, abbr] = planeName(p);
    const fs = clamp(s * 0.045, 11, 22);
    if (y - fs * 1.6 < -fs * 2) return;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = `600 ${fs}px ${UI_FONT}`;
    ctx.fillStyle = "#e6e9ef";
    const title = `Plane ${p}`;
    const ty = y - fs * 0.55;
    ctx.fillText(title, x, ty);
    const tw = ctx.measureText(title).width;
    ctx.font = `400 ${fs * 0.82}px ${UI_FONT}`;
    ctx.fillStyle = "#8d96a8";
    const sub = `${name}${abbr ? ` (${abbr})` : ""}`;
    const range = `U+${hex(p << 16)}–U+${hex((p << 16) | 0xffff)}`;
    const maxW = s - tw - fs;
    let text = `${sub} · ${range}`;
    if (ctx.measureText(text).width > maxW) text = sub;
    if (ctx.measureText(text).width > maxW) text = abbr || "";
    ctx.fillText(text, x + tw + fs * 0.5, ty);
  }

  /** How far a block has switched from its own label to its sections' labels (0–1). */
  private blockSectionAlpha(i: number, sectionA: number) {
    if (!this.blockHasSections[i] || sectionA <= 0) return 0;
    // Only once the block is tall enough on screen to hold a tab plus section labels.
    // Single-row blocks keep their own name: there's no room for both.
    return sectionA * smooth(34, 40, this.blockLabelRows[i] * this.cam.k);
  }

  private blockExists(i: number) {
    return this.asOf === null || this.blockFirstAge[i] <= this.asOf;
  }

  /**
   * Fit a label into a world rect clipped to the view: returns screen centre and font size,
   * or null if it doesn't fit at the minimum size.
   */
  private fitLabel(text: string, r: Rect, vis: Rect, weight: number, maxFs: number, heightFrac: number) {
    const x0 = Math.max(r.x, vis.x), y0 = Math.max(r.y, vis.y);
    const x1 = Math.min(r.x + r.w, vis.x + vis.w), y1 = Math.min(r.y + r.h, vis.y + vis.h);
    if (x1 <= x0 || y1 <= y0) return null;
    const sw = (x1 - x0) * this.cam.k, sh = (y1 - y0) * this.cam.k;
    let fs = Math.min(sh * heightFrac, maxFs);
    if (fs < 8) return null;
    this.ctx.font = `${weight} ${fs}px ${UI_FONT}`;
    const tw = this.ctx.measureText(text).width;
    if (tw > sw * 0.9) {
      fs *= (sw * 0.9) / tw;
      if (fs < 8) return null;
      this.ctx.font = `${weight} ${fs}px ${UI_FONT}`;
    }
    return { cx: this.sx((x0 + x1) / 2), cy: this.sy((y0 + y1) / 2), fs };
  }

  private haloText(text: string, x: number, y: number, fs: number, fill: string) {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(8,10,14,0.75)";
    ctx.lineWidth = Math.max(2, fs * 0.22);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  /**
   * Block names. Zoomed out they sit large in the middle of the block; once the block's chart
   * sections are labelled instead, the block name moves to a small tab in its top-left corner.
   */
  private renderBlockLabels(planes: number[], vis: Rect, alpha: number, sectionA: number, axisA: number) {
    const ctx = this.ctx;
    const planeSet = new Set(planes);
    ctx.lineJoin = "round";
    const blocks = this.data.meta.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!planeSet.has(b.s >> 16) || !this.blockExists(i)) continue;
      const lr = labelRect(b.s, b.e);
      const secA = this.blockSectionAlpha(i, sectionA);
      const litA = this.blockLit && !this.blockLit[i] ? 0.3 : 1;
      const centreA = alpha * litA * (1 - secA);
      if (centreA > 0.01) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fit = lr.h === 1 ? this.fitLabel(b.name, lr, vis, 600, 15, 0.62) : this.fitLabel(b.name, lr, vis, 600, 30, 0.42);
        if (fit) {
          ctx.globalAlpha = centreA * clamp((fit.fs - 8) / 3, 0, 1);
          this.haloText(b.name, fit.cx, fit.cy, fit.fs, "#ffffff");
        }
      }
      const tabA = alpha * litA * secA;
      if (tabA > 0.01) this.renderBlockTab(b.name, lr, vis, tabA, axisA);
    }
    ctx.globalAlpha = 1;
  }

  private renderBlockTab(name: string, lr: Rect, vis: Rect, alpha: number, axisA: number) {
    const ctx = this.ctx;
    // Keep the tab on screen (and clear of the sticky axes) while any of the block is visible.
    const minX = vis.x + (axisA > 0.01 ? 62 / this.cam.k : 0);
    const minY = vis.y + (axisA > 0.01 ? 24 / this.cam.k : 0);
    const x = this.sx(Math.max(lr.x, minX)) + 4;
    const y = this.sy(Math.max(lr.y, minY)) + 4;
    const right = this.sx(lr.x + lr.w), bottom = this.sy(lr.y + lr.h);
    ctx.font = `600 12px ${UI_FONT}`;
    const tw = ctx.measureText(name).width;
    const w = tw + 14, h = 20;
    if (x + w > right - 2 || y + h > bottom - 2) return;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(11,14,20,0.88)";
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(name, x + 7, y + h / 2 + 0.5);
  }

  /** Chart sections ("Weather and astrological symbols" …): faint outlines and labels at mid zoom. */
  private renderSections(planes: number[], vis: Rect, alpha: number, sectionA: number) {
    const ctx = this.ctx;
    const { k, cx, cy } = this.cam;
    const dpr = this.dpr;
    const planeSet = new Set(planes);
    const visible = this.sections.filter(
      (sec, i) =>
        planeSet.has(sec.plane) &&
        (this.asOf === null || this.sectionFirstAge[i] <= this.asOf) &&
        sec.bbox.x < vis.x + vis.w && sec.bbox.x + sec.bbox.w > vis.x &&
        sec.bbox.y < vis.y + vis.h && sec.bbox.y + sec.bbox.h > vis.y,
    );
    ctx.save();
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - cx * k), dpr * (this.h / 2 - cy * k));
    ctx.strokeStyle = `rgba(255,255,255,${0.28 * alpha})`; // further scaled per block below
    ctx.lineWidth = 1 / k;
    ctx.setLineDash([3 / k, 3 / k]);
    for (const sec of visible) {
      const a = this.blockSectionAlpha(sec.block, sectionA);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      ctx.stroke(sec.path);
    }
    ctx.restore();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const sec of visible) {
      const a = alpha * this.blockSectionAlpha(sec.block, sectionA);
      if (a <= 0.01) continue;
      const lr = labelRect(sec.s, sec.e);
      const fit = this.fitLabel(sec.title, lr, vis, 500, 16, lr.h === 1 ? 0.62 : 0.4);
      if (!fit) continue;
      ctx.globalAlpha = a * clamp((fit.fs - 8) / 2, 0, 1);
      this.haloText(sec.title, fit.cx, fit.cy, fit.fs, "rgba(255,255,255,0.95)");
    }
    ctx.globalAlpha = 1;
  }

  private renderMarkers() {
    const ctx = this.ctx;
    const k = this.cam.k;
    const mark = (cp: number, color: string, width: number, strong: boolean) => {
      const c = cpToCell(cp);
      const x = this.sx(c.x), y = this.sy(c.y);
      if (k < 6) {
        // Too small to outline the cell: draw a ring around it.
        const r = strong ? 9 : 6;
        ctx.beginPath();
        ctx.arc(x + k / 2, y + k / 2, r, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.6)";
        ctx.lineWidth = width + 2;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
        return;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(x + width / 2, y + width / 2, k - width, k - width);
    };
    if (this.hovered >= 0 && this.hovered !== this.selected && k >= 6) mark(this.hovered, "rgba(255,255,255,0.6)", 1.5, false);
    if (this.selected !== null) {
      this.ctx.save();
      this.ctx.shadowColor = "rgba(120,180,255,0.9)";
      this.ctx.shadowBlur = 12;
      mark(this.selected, "#ffffff", 2.5, true);
      this.ctx.restore();
    }
  }

  private renderAxes(planes: number[], vis: Rect, alpha: number) {
    const ctx = this.ctx;
    const k = this.cam.k;
    const top = 20, left = 58;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(11,14,20,0.86)";
    ctx.fillRect(0, 0, this.w, top);
    ctx.fillRect(0, top, left, this.h - top);
    ctx.font = `500 10px ${MONO_FONT}`;
    ctx.fillStyle = "#8d96a8";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const step = k < 22 ? 2 : 1;
    for (const p of planes) {
      const o = planeOrigin(p);
      for (let lx = Math.max(0, Math.floor(vis.x - o.x)); lx <= Math.min(255, vis.x + vis.w - o.x); lx++) {
        if (lx % step) continue;
        const x = this.sx(o.x + lx + 0.5);
        if (x < left + 8) continue;
        ctx.fillText(lx.toString(16).toUpperCase().padStart(2, "0"), x, top / 2);
      }
    }
    ctx.textAlign = "right";
    for (const p of planes) {
      const o = planeOrigin(p);
      for (let ly = Math.max(0, Math.floor(vis.y - o.y)); ly <= Math.min(255, vis.y + vis.h - o.y); ly++) {
        const y = this.sy(o.y + ly + 0.5);
        if (y < top + 6) continue;
        // Only label rows of planes overlapping the left edge, so labels aren't ambiguous.
        if (o.x > vis.x + vis.w * 0.5 || o.x + PLANE_SIZE < vis.x) continue;
        ctx.fillText(hex((p << 16) | (ly << 8)).slice(0, -2) + "xx", left - 6, y);
      }
    }
    ctx.globalAlpha = 1;
  }

  private renderMinimap() {
    const mm = this.minimap;
    if (!mm) return;
    const r = mm.getBoundingClientRect();
    const dpr = this.dpr;
    if (mm.width !== Math.round(r.width * dpr)) {
      mm.width = Math.round(r.width * dpr);
      mm.height = Math.round(r.height * dpr);
    }
    const c = mm.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, r.width, r.height);
    const s = Math.min(r.width / WORLD.w, r.height / WORLD.h);
    const ox = (r.width - WORLD.w * s) / 2 - WORLD.x * s;
    const oy = (r.height - WORLD.h * s) / 2 - WORLD.y * s;
    c.imageSmoothingEnabled = true;
    for (let p = 0; p < PLANE_COUNT; p++) {
      const o = planeOrigin(p);
      c.drawImage(this.planeBitmaps[p], ox + o.x * s, oy + o.y * s, PLANE_SIZE * s, PLANE_SIZE * s);
    }
    const vis = this.visibleWorld();
    const vx = ox + vis.x * s, vy = oy + vis.y * s, vw = Math.max(3, vis.w * s), vh = Math.max(3, vis.h * s);
    c.fillStyle = "rgba(255,255,255,0.12)";
    c.fillRect(vx, vy, vw, vh);
    c.strokeStyle = "#ffffff";
    c.lineWidth = 1.5;
    c.strokeRect(vx, vy, vw, vh);
    (mm as HTMLCanvasElement & { _map?: { s: number; ox: number; oy: number } })._map = { s, ox, oy };
  }

  /** Minimap pointer position → centre the camera there. */
  minimapNavigate(clientX: number, clientY: number, animate: boolean) {
    const mm = this.minimap as (HTMLCanvasElement & { _map?: { s: number; ox: number; oy: number } }) | null;
    if (!mm?._map) return;
    const r = mm.getBoundingClientRect();
    const { s, ox, oy } = mm._map;
    const wx = (clientX - r.left - ox) / s;
    const wy = (clientY - r.top - oy) / s;
    this.flyTo({ ...this.cam, cx: wx, cy: wy }, animate);
  }

  // ---------------------------------------------------------------------------
  // Input

  private bindInput() {
    const el = this.canvas;
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { d: number; k: number; wx: number; wy: number } | null = null;

    const local = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      const p = local(e);
      pointers.set(e.pointerId, p);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const mid = this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.cam.k, wx: mid.x, wy: mid.y };
        drag = null;
        return;
      }
      this.anim = null;
      drag = { x: p.x, y: p.y, cx: this.cam.cx, cy: this.cam.cy, moved: false, id: e.pointerId };
    };
    const onMove = (e: PointerEvent) => {
      const p = local(e);
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const k = clamp(pinch.k * (d / pinch.d), this.fitK() * 0.6, 800);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.setCamera({ k, cx: pinch.wx - (mx - this.w / 2) / k, cy: pinch.wy - (my - this.h / 2) / k });
        return;
      }
      if (drag && drag.id === e.pointerId) {
        const dx = p.x - drag.x, dy = p.y - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) {
          el.style.cursor = "grabbing";
          this.setCamera({ k: this.cam.k, cx: drag.cx - dx / this.cam.k, cy: drag.cy - dy / this.cam.k });
        }
        return;
      }
      this.updateHover(p.x, p.y, e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && drag.id === e.pointerId) {
        if (!drag.moved) {
          const p = local(e);
          const w = this.toWorld(p.x, p.y);
          const cp = cellToCp(w.x, w.y);
          this.cb.onSelect(cp >= 0 ? cp : null);
        }
        drag = null;
        el.style.cursor = "";
      }
    };
    const onLeave = () => {
      if (this.hovered !== -1) {
        this.hovered = -1;
        this.invalidate();
        this.cb.onHover(-1, 0, 0);
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.anim = null;
      const p = local(e);
      // Pinch gestures arrive as ctrl+wheel. Trackpad scrolls (small or horizontal deltas) pan;
      // mouse wheels (large line-sized steps) zoom.
      const isTrackpadPan = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0.5 || Math.abs(e.deltaY) < 40);
      if (isTrackpadPan) {
        this.setCamera({ k: this.cam.k, cx: this.cam.cx + e.deltaX / this.cam.k, cy: this.cam.cy + e.deltaY / this.cam.k });
      } else {
        const dy = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY;
        const factor = Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0025));
        const before = this.toWorld(p.x, p.y);
        const k = clamp(this.cam.k * factor, this.fitK() * 0.6, 800);
        this.setCamera({ k, cx: before.x - (p.x - this.w / 2) / k, cy: before.y - (p.y - this.h / 2) / k });
      }
      this.updateHover(p.x, p.y, e.clientX, e.clientY);
    };
    const onDbl = (e: MouseEvent) => {
      const p = local(e);
      const w = this.toWorld(p.x, p.y);
      const k = this.cam.k * (e.shiftKey ? 0.4 : 2.5);
      this.flyTo({ k, cx: w.x - (p.x - this.w / 2) / k, cy: w.y - (p.y - this.h / 2) / k });
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDbl);
    this.disposers.push(() => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDbl);
    });
  }

  private updateHover(x: number, y: number, clientX: number, clientY: number) {
    const w = this.toWorld(x, y);
    const cp = cellToCp(w.x, w.y);
    if (cp !== this.hovered) {
      this.hovered = cp;
      this.invalidate();
    }
    this.cb.onHover(cp, clientX, clientY);
  }
}

const PAGE_BG_RGB: RGB = [11, 14, 20];

export { rangeRect };
