import { interpolateZoom } from "d3-interpolate";
import { displayString, hex, planeName, UnicodeData, uplus } from "../data/unicode";
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

/** Where the view is: the code point at the centre of the visible area (-1 if none), and zoom. */
export interface Here {
  cp: number;
  k: number;
}

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
/** Zoom at which chart sections appear (as headers) and blocks with sections switch to headers. */
const SECTION_START = 16;
/** Code points per side of a highlight tile at low zoom. */
const TILE = 4;
/** Value index of noncharacters in every colour mode (see colorModes). */
const V_NONCHAR = 1;
/** Highlights with at most this many matches are ringed at low zoom. */
const SPARSE_MAX = 400;
/** Pure view's glyph tiles: the levels of the pyramid, and limits. */
interface GlyphLevel {
  /** Device pixels per code point. */
  res: number;
  /** Code points per tile side. */
  span: number;
  /** Whether `pnpm tiles` pre-builds this level as WebP files. */
  prebuilt: boolean;
}
/** Exported for scripts/build_tiles.mjs, which pre-builds the levels marked so. */
export const GLYPH_LEVELS: GlyphLevel[] = [
  { res: 6, span: 64, prebuilt: true },
  { res: 12, span: 32, prebuilt: true },
  { res: 24, span: 16, prebuilt: true },
  { res: 48, span: 16, prebuilt: false },
];
const tileKey = (res: number, p: number, ty: number, tx: number) => `${res}:${p}:${ty}:${tx}`;
/** Pre-built tile files fetched at once. */
const GLYPH_TILE_LOADS = 12;
const GLYPH_TILE_START = 2.5;
const GLYPH_TILE_BUDGET_MS = 10;
const GLYPH_TILE_MAX_BYTES = 192 * 1024 * 1024;
/** Cell colour of assigned code points in pure view. */
const PURE_CELL: RGB = [52, 58, 71];

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
  private fullColors: string[] = [];
  private dimColors: string[] = [];
  private valueOn = new Uint8Array(0);
  /** Per value: whether text on a card of that colour should be dark (the colour is light). */
  private inkDark: boolean[] = [];
  private mask: Uint8Array | null = null;
  private tileBitmaps: HTMLCanvasElement[] = [];
  private tilesOn = false;
  private sparseLit: number[] = [];
  private preview: Preview | null = null;
  /** Headers drawn in the last frame (screen rects), for hover and click. */
  private headerHits: { r: Rect; s: number; e: number; name: string }[] = [];
  /** Whether the current preview comes from hovering a header on the map (not the sidebar). */
  private headerHover = false;
  /** Pure view: no colour, labels or chrome; just the cells and their glyphs. */
  private pure = false;
  /** Pre-rendered glyph tiles (16×16 code points at a few resolutions) for mid zoom in pure view. */
  private glyphTiles = new Map<string, HTMLCanvasElement | HTMLImageElement | null>();
  private glyphTileBytes = 0;
  /** Pre-built tile files ("res/plane/ty-tx"), if there are any, and their version for cache busting. */
  private staticTiles: Set<string> | null = null;
  private staticTilesVersion = "";
  private tileLoads = new Set<string>();
  private blockLit: Uint8Array | null = null;
  private asOf: number | null = null;
  private blockFirstAge: number[];
  private sections: { s: number; e: number; title: string; path: Path2D; plane: number; block: number; bbox: Rect }[];
  private blockBBox: Rect[];
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
    void this.loadTileManifest();
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
    this.blockBBox = data.meta.blocks.map((b) => rangeRect(b.s, b.e));
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
  get animating() {
    return this.anim !== null;
  }
  /**
   * The code point at the centre of the visible map area (clear of the floating top bar), or -1
   * if that's between planes. Fitted views centre their target here, not on the canvas centre.
   */
  centreCp(): number {
    const { cx, cy, k } = this.cam;
    return cellToCp(cx + (this.insets.l - this.insets.r) / 2 / k, cy + (this.insets.t - this.insets.b) / 2 / k);
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

  setPure(on: boolean) {
    if (on === this.pure) return;
    this.pure = on;
    // Without the floating top bar, fitted views can use the whole canvas.
    this.insets = on ? { l: 16, t: 16, r: 16, b: 16 } : { l: 16, t: 92, r: 16, b: 16 };
    this.preview = null;
    this.headerHits = [];
    this.headerHover = false;
    this.hovered = -1;
    this.canvas.style.cursor = "";
    this.rebuildBitmaps();
  }

  /** Point out a range (a plane or block hovered in the sidebar): dim the rest and outline it. */
  setPreview(range: { s: number; e: number; name: string; labelAt?: { x: number; y: number }; soft?: boolean } | null) {
    this.headerHover = false;
    if (range && this.preview && range.s === this.preview.s && range.e === this.preview.e) {
      this.preview.labelAt = range.labelAt;
      this.invalidate();
      return;
    }
    if (!range) {
      if (!this.preview) return;
      this.preview = null;
    } else {
      const path = new Path2D();
      const pts = rangeOutline(range.s, range.e);
      path.moveTo(pts[0][0], pts[0][1]);
      for (const [x, y] of pts.slice(1)) path.lineTo(x, y);
      path.closePath();
      this.preview = { ...range, path, rect: rangeRect(range.s, range.e) };
    }
    this.invalidate();
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
    const { valueOf } = this.mode;
    // Pure view: every assigned code point the same neutral grey, reserved ones background.
    let colors = this.pure ? this.mode.colors.map((_, v): RGB => (v <= V_NONCHAR ? PLANE_BG : PURE_CELL)) : this.mode.colors;
    const data = this.data;
    const hl = this.pure ? null : this.highlight;
    const mask = this.pure ? null : this.mask;
    const asOf = this.pure ? null : this.asOf;
    const dim = (c: RGB): RGB => [
      Math.round(PLANE_BG[0] + (c[0] - PLANE_BG[0]) * 0.16),
      Math.round(PLANE_BG[1] + (c[1] - PLANE_BG[1]) * 0.16),
      Math.round(PLANE_BG[2] + (c[2] - PLANE_BG[2]) * 0.16),
    ];
    const dimmed = colors.map(dim);
    // Highlighted values that are normally drawn near-black (reserved code points, noncharacters,
    // dark legend entries) light up while highlighted, or highlighting them would show nothing.
    const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const shown = colors.map((c, v): RGB => {
      if (!hl?.has(v) || lum(c) >= 70) return c;
      if (v === V_NONCHAR) return [226, 92, 128];
      return c.map((x) => Math.round(x + (255 - x) * 0.55)) as RGB;
    });
    colors = shown;
    this.fullColors = colors.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);
    this.dimColors = dimmed.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`);
    this.inkDark = colors.map((c) => lum(c) > 150);
    // Per value: is it highlighted by the legend?
    this.valueOn = new Uint8Array(colors.length).fill(1);
    if (hl) this.valueOn.fill(0).forEach((_, v) => (this.valueOn[v] = hl.has(v) ? 1 : 0));

    // When something is highlighted, sparse matches vanish at low zoom (a plane is ~170px wide
    // for 256 cells), so also build coarse tiles that light up if any cell in them matches.
    const filtering = hl !== null || mask !== null;
    this.blockLit = filtering ? new Uint8Array(data.meta.blocks.length) : null;
    const sparse: number[] = [];

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
          if (lit && filtering && sparse.length <= SPARSE_MAX) sparse.push(cp);
          if (tile && lit) {
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
    // A handful of matches (noncharacters, a rare property…) get rings so they can be found.
    this.sparseLit = filtering && sparse.length <= SPARSE_MAX ? sparse : [];
    this.invalidate();
  }

  /** Whether a code point is dimmed by the legend highlight or the property mask. */
  private isDim(cp: number, v: number) {
    if (this.pure) return false;
    return !this.valueOn[v] || (this.mask !== null && !this.mask[cp]);
  }

  /** Whether a code point exists in the version being shown. */
  private exists(cp: number) {
    return this.data.isAssigned(cp) && (this.pure || this.asOf === null || this.data.ageIdx[cp] <= this.asOf);
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

    if (this.pure) {
      const cardT = smooth(CARD_START, CARD_FULL, k);
      // Glyphs from pre-rendered tiles until real font rendering takes over. Below ~2.5px a
      // glyph is a speck and the grey cells say as much.
      // Once cards start, their opaque cells cover the tiles and draw the same glyphs live.
      const tileGA = smooth(GLYPH_TILE_START, GLYPH_TILE_START * 1.6, k);
      if (tileGA > 0.01 && cardT === 0) this.renderGlyphTiles(planes, vis, tileGA);
      if (cardT > 0) this.renderCells(planes, vis, cardT);
      const gridA = smooth(GRID_START, GRID_START * 3, k) * (1 - cardT);
      if (gridA > 0.01) this.renderGrid(planes, vis, gridA);
      this.renderMinimap();
      return;
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

    // 4. Section dividers and block outlines
    const sectionA = smooth(SECTION_START, SECTION_START * 1.15, k);
    if (sectionA > 0.01) this.renderSectionDividers(planes, vis, sectionA, cardT);
    this.renderBlockOutlines(planes, cardT);

    // 5. Plane frames and titles
    for (const p of planes) this.renderPlaneFrame(p);

    // 6. Block names, centred in the block, until the block switches to headers
    const axisA = smooth(AXIS_START, AXIS_START * 1.6, k);
    this.renderBlockLabels(planes, vis);

    // 7. Hover / selection
    this.renderMarkers();

    // 8. Block and section headers on the row edges, placed without overlapping
    this.renderHeaders(planes, vis, sectionA, axisA);

    // Sidebar hover preview, over everything but the axes
    if (this.preview) this.renderPreview(vis);

    // 9. Sticky axes
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
    const hexA = this.pure ? 0 : smooth(HEX_START, HEX_START * 1.3, k);
    // Once headers sit inside the top of rows (with the code points), glyphs shrink a little and
    // move down to leave them room.
    const glyphPx = k * (0.5 - 0.06 * hexA);
    const nameA = this.pure ? 0 : smooth(NAME_START, NAME_START * 1.3, k);
    const gap = Math.max(1, k * 0.04);
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

      // Cover the bitmap with a dark backdrop, faded in: it shows as the gaps between cards.
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
          if (!this.exists(cp)) {
            if (!this.pure && this.highlight && this.valueOn[v] && !data.isAssigned(cp) && (!this.mask || this.mask[cp])) {
              // Highlighted reserved code point / noncharacter: shown lit, like its cell colour.
              ctx.globalAlpha = 1;
              ctx.fillStyle = this.fullColors[v];
              ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, k - 2 * gap);
              continue;
            }
            ctx.globalAlpha = t;
            ctx.fillStyle = data.nonchar[cp] ? "#2a1820" : "#12161e";
            ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, k - 2 * gap);
            continue;
          }
          ctx.globalAlpha = 1;
          const dim = this.isDim(cp, v);
          // Cards keep their cell's colour at every zoom; the ink is fixed per colour.
          ctx.fillStyle = dim ? this.dimColors[v] : this.fullColors[v];
          ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, k - 2 * gap);
          const dark = !dim && this.inkDark[v];
          const glyphColor = dark ? "#0d1017" : "#eef1f6";

          const glyphY = sy + k * (nameA > 0 ? 0.45 : 0.53);
          const str = displayString(data, cp);
          if (str) {
            if (rowReady) {
              // Pure view: the glyph tiles already showed this at full strength, so no fade-in.
              ctx.globalAlpha = this.pure ? 1 : t * (dim ? 0.25 : 1);
              ctx.fillStyle = glyphColor;
              const font = `${glyphPx}px ${data.glyphFamily(cp)}`;
              if (font !== lastFont) ctx.font = lastFont = font;
              ctx.fillText(str, sx + k / 2, glyphY);
            }
          } else {
            this.drawSpecial(cp, sx, k, glyphY, t * (dim ? 0.3 : 1), dark);
            lastFont = "";
          }
          if (hexA > 0) {
            ctx.globalAlpha = t * hexA * (dim ? 0.3 : 0.7);
            ctx.fillStyle = dark ? "#0d1017" : "#c4cad6";
            ctx.font = lastFont = `500 ${Math.min(14, k * 0.12)}px ${MONO_FONT}`;
            ctx.fillText(hex(cp), sx + k / 2, sy + k * 0.88);
          }
          if (nameA > 0) {
            ctx.globalAlpha = t * nameA * (dim ? 0.3 : 0.85);
            ctx.fillStyle = dark ? "#0d1017" : "#dde2ea";
            const fs = Math.min(12, k * 0.075);
            ctx.font = lastFont = `500 ${fs}px ${UI_FONT}`;
            this.wrapText(data.name(cp), sx + k / 2, sy + k * 0.72, k * 0.88, fs * 1.15, 2);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawSpecial(cp: number, sx: number, k: number, cy: number, alpha: number, dark: boolean) {
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
    ctx.strokeStyle = dark ? "rgba(13,16,23,0.7)" : "#8b95a8";
    ctx.lineWidth = Math.max(1, k * 0.012);
    ctx.setLineDash([Math.max(2, k * 0.03), Math.max(2, k * 0.03)]);
    ctx.strokeRect(sx + (k - bw) / 2, cy - bh / 2, bw, bh);
    ctx.setLineDash([]);
    ctx.fillStyle = dark ? "#0d1017" : "#c9d0dc";
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

  private renderBlockOutlines(planes: number[], cardT: number) {
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
    if (cardT > 0.01) {
      // Among the cards the gaps are dark, so block boundaries become light lines.
      ctx.strokeStyle = `rgba(214, 222, 236, ${0.62 * cardT})`;
      ctx.lineWidth = Math.max(2, k * 0.06) / k;
      blocks.forEach((b, i) => {
        if (planeSet.has(b.s >> 16) && this.blockExists(i)) ctx.stroke(this.blockPaths[i]);
      });
    }
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

  /**
   * How far a block has switched from its centred name to a header on its top edge (0–1).
   * Blocks with chart sections switch when the sections appear; others when cards appear.
   */
  private blockHeaderA(i: number) {
    const k = this.cam.k;
    return this.blockHasSections[i]
      ? smooth(SECTION_START, SECTION_START * 1.15, k)
      : smooth(CARD_START * 0.8, CARD_START, k);
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
  private renderBlockLabels(planes: number[], vis: Rect) {
    const ctx = this.ctx;
    const planeSet = new Set(planes);
    ctx.lineJoin = "round";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const blocks = this.data.meta.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!planeSet.has(b.s >> 16) || !this.blockExists(i)) continue;
      const a = (1 - this.blockHeaderA(i)) * (this.blockLit && !this.blockLit[i] ? 0.3 : 1);
      if (a <= 0.01) continue;
      const lr = labelRect(b.s, b.e);
      const fit = lr.h === 1 ? this.fitLabel(b.name, lr, vis, 600, 15, 0.62) : this.fitLabel(b.name, lr, vis, 600, 30, 0.42);
      if (fit) {
        ctx.globalAlpha = a * clamp((fit.fs - 8) / 3, 0, 1);
        this.haloText(b.name, fit.cx, fit.cy, fit.fs, "#ffffff");
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Thin dividers between chart sections, among the cards. */
  private renderSectionDividers(planes: number[], vis: Rect, alpha: number, cardT: number) {
    const ctx = this.ctx;
    const { k, cx, cy } = this.cam;
    const dpr = this.dpr;
    ctx.save();
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - cx * k), dpr * (this.h / 2 - cy * k));
    // Dark lines on the coloured cells; light ones once cards have dark gaps between them.
    const secs = this.visibleSections(planes, vis);
    ctx.lineWidth = Math.max(2, k * 0.05) / k;
    if (cardT < 0.99) {
      ctx.strokeStyle = `rgba(8, 10, 14, ${0.75 * alpha * (1 - cardT)})`;
      for (const sec of secs) ctx.stroke(sec.path);
    }
    if (cardT > 0.01) {
      ctx.strokeStyle = `rgba(214, 222, 236, ${0.4 * alpha * cardT})`;
      for (const sec of secs) ctx.stroke(sec.path);
    }
    ctx.restore();
  }

  private visibleSections(planes: number[], vis: Rect) {
    const planeSet = new Set(planes);
    return this.sections.filter(
      (sec, i) =>
        planeSet.has(sec.plane) &&
        (this.asOf === null || this.sectionFirstAge[i] <= this.asOf) &&
        sec.bbox.x < vis.x + vis.w && sec.bbox.x + sec.bbox.w > vis.x &&
        sec.bbox.y < vis.y + vis.h && sec.bbox.y + sec.bbox.h > vis.y,
    );
  }

  /**
   * Where a header for code points s..e goes: on the top edge of the range's first row that's
   * on screen, at its first visible cell, sliding along (sticky) while the range is in view.
   * Returns screen coordinates and the room available to the right, or null.
   */
  private headerAnchor(s: number, e: number, top: number, left: number) {
    const k = this.cam.k;
    const o = planeOrigin(s >> 16);
    const r0 = (s >> 8) & 255, r1 = (e >> 8) & 255;
    let y = this.sy(o.y + r0);
    if (y < top) {
      // Scrolled past the start: stick to the top while the range continues, then get pushed up.
      const bottom = this.sy(o.y + r1 + 1);
      y = Math.min(top, bottom - k * 0.5);
      if (y < top - k * 0.5) return null;
    }
    const row = clamp(Math.floor((y - this.sy(o.y)) / k + 0.001), r0, r1);
    if (y > this.h) return null;
    const c0 = row === r0 ? s & 255 : 0;
    const c1 = row === r1 ? (e & 255) + 1 : 256;
    const x0 = this.sx(o.x + c0), x1 = this.sx(o.x + c1);
    const x = Math.max(x0, left);
    if (x1 - x < 30 || x > this.w) return null;
    return { x, y, room: x1 - x };
  }

  /** Width a pill would take (0 if it doesn't fit in `room`), without drawing it. */
  private measurePill(text: string, room: number, opts: PillStyle) {
    const ctx = this.ctx;
    const { size } = opts;
    ctx.font = `${opts.bold ? 650 : 500} ${size}px ${UI_FONT}`;
    const padX = size * 0.6, dotW = opts.dot ? size * 0.85 : 0;
    const maxText = room - 2 * padX - dotW - 4;
    if (maxText < size * 2) return 0;
    const label = ellipsize(ctx, text, maxText);
    if (label !== text && label.length - 1 < Math.min(opts.minChars ?? 7, text.length)) return 0;
    return ctx.measureText(label).width + 2 * padX + dotW;
  }

  private pill(text: string, x: number, y: number, room: number, opts: PillStyle) {
    const ctx = this.ctx;
    const { size, bold } = opts;
    ctx.font = `${bold ? 650 : 500} ${size}px ${UI_FONT}`;
    const padX = size * 0.6, dotW = opts.dot ? size * 0.85 : 0;
    const h = Math.round(size * 1.6);
    const maxText = room - 2 * padX - dotW - 4;
    if (maxText < size * 2) return 0;
    const label = ellipsize(ctx, text, maxText);
    // A stub like "Co…" says nothing: leave just the divider.
    if (label !== text && label.length - 1 < Math.min(opts.minChars ?? 7, text.length)) return 0;
    const w = ctx.measureText(label).width + 2 * padX + dotW;
    const top = Math.round(y - h / 2);
    ctx.fillStyle = opts.fill;
    ctx.beginPath();
    ctx.roundRect(Math.round(x), top, w, h, h / 2);
    ctx.fill();
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (opts.dot) {
      ctx.fillStyle = opts.dot;
      ctx.beginPath();
      ctx.arc(x + padX + size * 0.3, y, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = opts.ink;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + padX + dotW, y + 0.5);
    return w;
  }

  /**
   * Block and section headers that sit on the top edge of where each starts, like the headings
   * in the code charts, and stay on screen while you pan through the block or section.
   * Headers are placed in priority order (blocks, then longer sections first) and any that would
   * overlap one already placed are skipped, so busy areas thin out instead of piling up.
   */
  private renderHeaders(planes: number[], vis: Rect, sectionA: number, axisA: number) {
    const ctx = this.ctx;
    const data = this.data;
    const k = this.cam.k;
    const top = axisA > 0.01 ? 26 : 4;
    const left = axisA > 0.01 ? 64 : 4;
    const planeSet = new Set(planes);
    const size = clamp(9.5 + (k - 14) * 0.05, 10, 12.5);
    const h = Math.round(size * 1.6);
    // Straddle the row edge until code points appear at the bottom of cards, then sit just inside.
    const drop = smooth(HEX_START * 0.85, HEX_START * 1.15, k) * (h / 2 + Math.max(1, k * 0.04));
    const valueOf = this.mode.valueOf;
    const placed: Rect[] = [];
    this.headerHits = [];
    const free = (r: Rect) =>
      !placed.some((q) => r.x < q.x + q.w + 3 && r.x + r.w + 3 > q.x && r.y < q.y + q.h + 2 && r.y + r.h + 2 > q.y);
    /** Right edge of the block header drawn at each block's start, for its first section to follow. */
    const blockHeaderEnd = new Map<number, { x: number; y: number }>();

    const blocks = data.meta.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (!planeSet.has(b.s >> 16) || !this.blockExists(i)) continue;
      const a = this.blockHeaderA(i);
      if (a <= 0.01) continue;
      const bb = this.blockBBox[i];
      if (bb.x > vis.x + vis.w || bb.x + bb.w < vis.x || bb.y > vis.y + vis.h || bb.y + bb.h < vis.y) continue;
      const at = this.headerAnchor(b.s, b.e, top, left);
      if (!at) continue;
      const style = {
        size: size + 0.5,
        bold: true,
        minChars: 10,
        fill: "rgba(240, 243, 248, 0.97)",
        ink: "#0d1017",
        dot: data.meta.regions[b.region].color,
        border: "rgba(8, 10, 14, 0.55)",
      };
      const w = this.measurePill(b.name, at.room - 2, style);
      if (!w) continue;
      const r = { x: at.x + 2, y: at.y + drop - h / 2, w, h };
      if (!free(r)) continue;
      placed.push(r);
      if (a > 0.5) this.headerHits.push({ r, s: b.s, e: b.e, name: `Block: ${b.name} · ${uplus(b.s)}–${uplus(b.e)}` });
      ctx.globalAlpha = a * (this.blockLit && !this.blockLit[i] ? 0.45 : 1);
      this.pill(b.name, r.x, at.y + drop, at.room - 2, style);
      blockHeaderEnd.set(i, { x: r.x + w, y: at.y });
    }

    if (sectionA > 0.01) {
      const secs = this.visibleSections(planes, vis).sort((p, q) => q.e - q.s - (p.e - p.s));
      for (const sec of secs) {
        const at = this.headerAnchor(sec.s, sec.e, top, left);
        if (!at) continue;
        let x = at.x + 2;
        // A section starting where its block starts follows the block's header.
        const bh = blockHeaderEnd.get(sec.block);
        if (bh && Math.abs(bh.y - at.y) < 1 && blocks[sec.block].s === sec.s) x = bh.x + 4;
        const style = {
          size,
          bold: false,
          fill: "rgba(13, 16, 23, 0.92)",
          ink: "rgba(238, 241, 246, 0.95)",
          border: "rgba(255, 255, 255, 0.18)",
          dot: this.fullColors[valueOf[sec.s]],
        };
        const room = at.x + at.room - x;
        const w = this.measurePill(sec.title, room, style);
        if (!w) continue;
        const r = { x, y: at.y + drop - h / 2, w, h };
        if (!free(r)) continue;
        placed.push(r);
        if (sectionA > 0.5) {
          const range = sec.s === sec.e ? uplus(sec.s) : `${uplus(sec.s)}–${uplus(sec.e)}`;
          this.headerHits.push({ r, s: sec.s, e: sec.e, name: `Section: ${sec.title} · in ${blocks[sec.block]?.name ?? "no block"} · ${range}` });
        }
        ctx.globalAlpha = sectionA * (this.blockLit && !this.blockLit[sec.block] ? 0.45 : 1);
        this.pill(sec.title, x, at.y + drop, room, style);
      }
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
    const ringA = 1 - smooth(4, 8, k);
    if (this.sparseLit.length && ringA > 0.01) {
      const vis = this.visibleWorld();
      ctx.globalAlpha = ringA;
      for (const cp of this.sparseLit) {
        const c = cpToCell(cp);
        if (c.x < vis.x - 1 || c.x > vis.x + vis.w + 1 || c.y < vis.y - 1 || c.y > vis.y + vis.h + 1) continue;
        mark(cp, this.fullColors[this.mode.valueOf[cp]], 1.5, false);
      }
      ctx.globalAlpha = 1;
    }
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

  /**
   * Draw glyphs from cached tile images. Each level of the pyramid draws its tiles at a fixed
   * resolution; coarser levels cover more code points per tile, so a screen needs a few dozen
   * images at any zoom. We use the smallest resolution at least the current zoom (in device
   * pixels), so images only shrink. Tiles come from pre-built WebP files when there are some
   * (`pnpm tiles`), otherwise they're drawn here, nearest-first within a time budget per frame.
   * Until a tile is ready, the same area from another level stands in if it's cached.
   */
  private renderGlyphTiles(planes: number[], vis: Rect, alpha: number) {
    const ctx = this.ctx;
    const k = this.cam.k;
    const dk = k * this.dpr;
    const level = GLYPH_LEVELS.find((l) => l.res >= dk) ?? GLYPH_LEVELS[GLYPH_LEVELS.length - 1];
    const T = level.span;
    const others = GLYPH_LEVELS.filter((l) => l !== level).sort(
      (a, b) => Math.abs(Math.log(a.res / level.res)) - Math.abs(Math.log(b.res / level.res)),
    );
    const missing: { key: string; p: number; ty: number; tx: number; d: number }[] = [];
    const cx = vis.x + vis.w / 2, cy = vis.y + vis.h / 2;
    const n = PLANE_SIZE / T;
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = alpha;
    for (const p of planes) {
      const o = planeOrigin(p);
      const tx0 = Math.max(0, Math.floor((vis.x - o.x) / T)), tx1 = Math.min(n - 1, Math.floor((vis.x + vis.w - o.x) / T));
      const ty0 = Math.max(0, Math.floor((vis.y - o.y) / T)), ty1 = Math.min(n - 1, Math.floor((vis.y + vis.h - o.y) / T));
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          // Whole-pixel edges, so neighbouring tiles meet without seams.
          const x = Math.round(this.sx(o.x + tx * T)), y = Math.round(this.sy(o.y + ty * T));
          const w = Math.round(this.sx(o.x + (tx + 1) * T)) - x, h = Math.round(this.sy(o.y + (ty + 1) * T)) - y;
          const key = tileKey(level.res, p, ty, tx);
          const img = this.glyphTiles.get(key);
          if (img) {
            ctx.drawImage(img, x, y, w, h);
            continue;
          }
          if (img === null) continue; // nothing to draw here
          missing.push({ key, p, ty, tx, d: Math.hypot(o.x + (tx + 0.5) * T - cx, o.y + (ty + 0.5) * T - cy) });
          for (const alt of others) if (this.drawTileArea(alt, p, tx * T, ty * T, T, x, y, w, h)) break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    if (!missing.length) return;
    missing.sort((a, b) => a.d - b.d);

    // Pre-built tiles: fetch the nearest few at a time; the browser decodes them off-thread.
    if (this.staticTiles && level.prebuilt) {
      for (const t of missing) {
        if (this.tileLoads.has(t.key)) continue;
        if (!this.staticTiles.has(`${level.res}/${t.p}/${t.ty}-${t.tx}`)) {
          this.storeGlyphTile(t.key, null);
          continue;
        }
        if (this.tileLoads.size >= GLYPH_TILE_LOADS) break;
        this.tileLoads.add(t.key);
        const img = new Image();
        img.src = `./tiles/${level.res}/${t.p}/${t.ty}-${t.tx}.webp?v=${this.staticTilesVersion}`;
        img.decode().then(
          () => this.storeGlyphTile(t.key, img),
          () => this.storeGlyphTile(t.key, null),
        ).finally(() => {
          this.tileLoads.delete(t.key);
          this.invalidate();
        });
      }
      return;
    }

    // Otherwise draw them here, nearest the centre first, for a few milliseconds per frame.
    const start = performance.now();
    for (const t of missing) {
      if (performance.now() - start > GLYPH_TILE_BUDGET_MS) break;
      // Fonts still loading for these rows: they invalidate when ready, and we come back.
      if (!this.tileFontsReady(t.p, t.ty * T, T)) continue;
      this.storeGlyphTile(t.key, this.buildGlyphTile(t.p, t.ty, t.tx, level.res, T));
    }
    this.invalidate(); // draw what was just built, and carry on with the rest
  }

  /**
   * Draw a square of code points (plane-local, `span` on a side) from another level's cached
   * tiles, as a stand-in. Returns false unless every tile it needs is cached.
   */
  private drawTileArea(level: GlyphLevel, p: number, cx0: number, cy0: number, span: number, x: number, y: number, w: number, h: number) {
    const ctx = this.ctx;
    const T = level.span;
    if (T >= span) {
      const ty = Math.floor(cy0 / T), tx = Math.floor(cx0 / T);
      const img = this.glyphTiles.get(tileKey(level.res, p, ty, tx));
      if (img === undefined) return false;
      if (img) {
        const r = level.res;
        ctx.drawImage(img, (cx0 - tx * T) * r, (cy0 - ty * T) * r, span * r, span * r, x, y, w, h);
      }
      return true;
    }
    const m = span / T;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        if (this.glyphTiles.get(tileKey(level.res, p, cy0 / T + j, cx0 / T + i)) === undefined) return false;
      }
    }
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const img = this.glyphTiles.get(tileKey(level.res, p, cy0 / T + j, cx0 / T + i));
        if (img) ctx.drawImage(img, x + (w * i) / m, y + (h * j) / m, w / m, h / m);
      }
    }
    return true;
  }

  /** Whether the fonts for `rows` rows of a plane, from row `y0`, are loaded (asking for them if not). */
  tileFontsReady(p: number, y0: number, rows: number) {
    let ready = true;
    for (let r = 0; r < rows; r++) if (!this.ensureRowFonts((p << 16) | ((y0 + r) << 8))) ready = false;
    return ready;
  }

  /** Draw one tile: `span`×`span` code points at `res` pixels each. Null if there's nothing to draw. */
  buildGlyphTile(p: number, ty: number, tx: number, res: number, span: number): HTMLCanvasElement | null {
    const data = this.data;
    let cv: HTMLCanvasElement | null = null;
    let c: CanvasRenderingContext2D | null = null;
    let lastFont = "";
    for (let y = 0; y < span; y++) {
      for (let x = 0; x < span; x++) {
        const cp = (p << 16) | ((ty * span + y) << 8) | (tx * span + x);
        const str = displayString(data, cp);
        if (!str) continue;
        if (!c) {
          cv = document.createElement("canvas");
          cv.width = cv.height = span * res;
          c = cv.getContext("2d")!;
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.fillStyle = "#eef1f6";
        }
        // Same size and position as on the cards, so the switch to real rendering is seamless.
        const font = `${res * 0.5}px ${data.glyphFamily(cp)}`;
        if (font !== lastFont) c.font = lastFont = font;
        c.fillText(str, x * res + res / 2, y * res + res * 0.53);
      }
    }
    return cv;
  }

  private storeGlyphTile(key: string, img: HTMLCanvasElement | HTMLImageElement | null) {
    this.glyphTiles.set(key, img);
    if (img) this.glyphTileBytes += img.width * img.height * 4;
    // Evict the oldest tiles past the memory cap.
    for (const [old, oldImg] of this.glyphTiles) {
      if (this.glyphTileBytes <= GLYPH_TILE_MAX_BYTES) break;
      if (old === key) continue;
      this.glyphTiles.delete(old);
      if (oldImg) {
        this.glyphTileBytes -= oldImg.width * oldImg.height * 4;
        if (oldImg instanceof HTMLCanvasElement) oldImg.width = oldImg.height = 0; // release it now
      }
    }
  }

  /** Look for pre-built glyph tiles (see scripts/build_tiles.mjs). */
  private async loadTileManifest() {
    try {
      const r = await fetch("./tiles/manifest.json");
      if (!r.ok) return;
      const m: { version: string; tiles: string[] } = await r.json();
      this.staticTiles = new Set(m.tiles);
      this.staticTilesVersion = m.version;
      // Forget tiles drawn here at pre-built levels, in favour of the files.
      for (const key of [...this.glyphTiles.keys()]) {
        if (GLYPH_LEVELS.some((l) => l.prebuilt && key.startsWith(`${l.res}:`))) this.glyphTiles.delete(key);
      }
      this.invalidate();
    } catch {
      // No pre-built tiles: draw them in the browser.
    }
  }

  private renderPreview(vis: Rect) {
    const ctx = this.ctx;
    const pv = this.preview!;
    const { k, cx, cy } = this.cam;
    const dpr = this.dpr;
    ctx.save();
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - cx * k), dpr * (this.h / 2 - cy * k));
    // Dim everything outside the range.
    const outside = new Path2D();
    outside.rect(vis.x - 1, vis.y - 1, vis.w + 2, vis.h + 2);
    outside.addPath(pv.path);
    ctx.fillStyle = `rgba(8, 10, 14, ${pv.soft ? 0.4 : 0.62})`;
    ctx.fill(outside, "evenodd");
    // A glowing outline, at least a few pixels across even when the range is tiny on screen.
    ctx.shadowColor = "rgba(120, 180, 255, 0.95)";
    ctx.shadowBlur = 14;
    ctx.strokeStyle = "#ffffff";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5 / k;
    ctx.stroke(pv.path);
    ctx.restore();
    if (pv.rect.w * k < 10 && pv.rect.h * k < 10) {
      // Too small to see: ring it.
      ctx.beginPath();
      ctx.arc(this.sx(pv.rect.x + pv.rect.w / 2), this.sy(pv.rect.y + pv.rect.h / 2), 12, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Its full name: over the hovered header, or just above the range's top-left corner.
    const x = pv.labelAt ? pv.labelAt.x : clamp(this.sx(pv.rect.x), 8, this.w - 40);
    const y = pv.labelAt ? pv.labelAt.y : clamp(this.sy(pv.rect.y) - 14, 14, this.h - 14);
    this.pill(pv.name, x, y, this.w - x - 8, {
      size: 12.5,
      bold: true,
      fill: "rgba(240, 243, 248, 0.97)",
      ink: "#0d1017",
      border: "rgba(8, 10, 14, 0.55)",
    });
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
    if (this.preview) {
      const pr = this.preview.rect;
      const w = Math.max(4, pr.w * s), h = Math.max(4, pr.h * s);
      const x = ox + (pr.x + pr.w / 2) * s - w / 2, y = oy + (pr.y + pr.h / 2) * s - h / 2;
      c.strokeStyle = "#8ab4ff";
      c.lineWidth = 2;
      c.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
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
        if (!drag.moved && !this.pure) {
          const p = local(e);
          const hit = this.headerAt(p.x, p.y);
          if (hit) {
            // Clicking a block or section header zooms to it.
            this.setPreview(null);
            this.flyToRect(rangeRect(hit.s, hit.e), { pad: 1.6, maxK: 90 });
          } else {
            const w = this.toWorld(p.x, p.y);
            const cp = cellToCp(w.x, w.y);
            this.cb.onSelect(cp >= 0 ? cp : null);
          }
        }
        drag = null;
        el.style.cursor = "";
      }
    };
    const onLeave = () => {
      if (this.headerHover) this.setPreview(null);
      el.style.cursor = "";
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

  private headerAt(x: number, y: number) {
    for (let i = this.headerHits.length - 1; i >= 0; i--) {
      const { r } = this.headerHits[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return this.headerHits[i];
    }
    return null;
  }

  private updateHover(x: number, y: number, clientX: number, clientY: number) {
    if (this.pure) return;
    // Over a block or section header: show its full name and point out its extent.
    const hit = this.headerAt(x, y);
    if (hit) {
      this.setPreview({ s: hit.s, e: hit.e, name: hit.name, labelAt: { x: hit.r.x, y: hit.r.y + hit.r.h / 2 }, soft: true });
      this.headerHover = true;
      this.canvas.style.cursor = "pointer";
      if (this.hovered !== -1) {
        this.hovered = -1;
        this.invalidate();
      }
      this.cb.onHover(-1, 0, 0);
      return;
    }
    if (this.headerHover) {
      this.setPreview(null);
      this.canvas.style.cursor = "";
    }
    const w = this.toWorld(x, y);
    const cp = cellToCp(w.x, w.y);
    if (cp !== this.hovered) {
      this.hovered = cp;
      this.invalidate();
    }
    this.cb.onHover(cp, clientX, clientY);
  }
}


export { rangeRect };

interface Preview {
  s: number;
  e: number;
  name: string;
  path: Path2D;
  rect: Rect;
  /** Where to put the name label (screen), if not above the range. */
  labelAt?: { x: number; y: number };
  /** Lighter dimming, for previews from hovering the map itself. */
  soft?: boolean;
}

interface PillStyle {
  size: number;
  bold: boolean;
  fill: string;
  ink: string;
  dot?: string;
  border?: string;
  minChars?: number;
}

/** Truncate text with an ellipsis to fit a width in the current font. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid).trimEnd() + "…").width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo ? text.slice(0, lo).trimEnd() + "…" : "";
}
