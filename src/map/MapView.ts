import { interpolateZoom } from "d3-interpolate"
import { displayString, hex, planeName, type UnicodeData, uplus } from "../data/unicode"
import { required } from "../required"
import { type ColorMode, PLANE_BG, type RGB } from "./colorModes"
import {
  cellToCp,
  cpToCell,
  labelRect,
  PLANE_COUNT,
  PLANE_SIZE,
  planeOrigin,
  rangeOutline,
  rangeRect,
  type Rect,
  WORLD
} from "./layout"

/** Where the view is: the code point at the centre of the visible area (-1 if none), and zoom. */
export interface Here {
  cp: number
  k: number
}

export interface Camera {
  cx: number
  cy: number
  k: number // screen pixels per cell
}

export interface MapCallbacks {
  onHover(cp: number, clientX: number, clientY: number): void
  onSelect(cp: number | undefined): void
  onCamera(cam: Camera): void
}

const PAGE_BG = "#0b0e14"
const UI_FONT = "Inter, ui-sans-serif, system-ui, sans-serif"
const MONO_FONT = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

// Zoom thresholds (pixels per cell)
const GRID_START = 5
const CARD_START = 22
const CARD_FULL = 36
const HEX_START = 58
const NAME_START = 120
const AXIS_START = 13
/** The sticky axes: column numbers along the top, row numbers down the left (CSS px). */
const AXIS_TOP = 20
const AXIS_LEFT = 58
/** Zoom at which the dividers between chart sections appear. */
const SECTION_START = 16
/**
 * Labels come in three steps as you zoom in, one kind at a time:
 * - landmarks: big names centred in blocks of several rows, while glyphs are too small to read;
 * - block names: a label at the start of every block, once rows are tall enough for one;
 * - section names: added once the cards with readable glyphs appear.
 * The landmark names fade out completely before the block labels fade in, so they never overlap.
 */
const LANDMARK_END = 12
const BLOCK_LABEL_START = 14
const BLOCK_LABEL_FULL = 16
/** Code points per side of a highlight tile at low zoom. */
const TILE = 4
/** Value index of noncharacters in every colour mode (see colorModes). */
const V_NONCHAR = 1
/** Highlights with at most this many matches are ringed at low zoom. */
const SPARSE_MAX = 400
/** Pure view's glyph tiles: the levels of the pyramid, and limits. */
interface GlyphLevel {
  /** Device pixels per code point. */
  res: number
  /** Code points per tile side. */
  span: number
  /** Whether `pnpm tiles` pre-builds this level as WebP files. */
  prebuilt: boolean
}
/** Exported for scripts/build_tiles.ts, which pre-builds the levels marked so. */
/** @public Also read by scripts/build_tiles.ts, inside the page. */
export const GLYPH_LEVELS: GlyphLevel[] = [
  // Below a few pixels a glyph is a smudge, but how much ink it has still shows: dense ideographs
  // bright, marks and punctuation faint, emoji in colour. That texture is the point of this level.
  { res: 2, span: 128, prebuilt: true },
  { res: 6, span: 64, prebuilt: true },
  { res: 12, span: 32, prebuilt: true },
  { res: 24, span: 16, prebuilt: true },
  { res: 48, span: 16, prebuilt: false }
]
/** The finest level, for zoom beyond all of them. */
const FINEST_GLYPH_LEVEL = required(GLYPH_LEVELS.at(-1), "glyph levels")
const tileKey = (res: number, p: number, ty: number, tx: number): string => `${res}:${p}:${ty}:${tx}`
/** Pre-built tile files fetched at once. */
const GLYPH_TILE_LOADS = 12
/** Zoom (CSS px per code point) where glyph tiles start to fade in, and where they're fully in. */
const GLYPH_TILE_START = 0.3
const GLYPH_TILE_FULL = 0.6
/** Smallest size glyphs are drawn at; smaller tiles are drawn at this size and scaled down. */
const GLYPH_DRAW_MIN = 6
const GLYPH_TILE_BUDGET_MS = 10
const GLYPH_TILE_MAX_BYTES = 192 * 1024 * 1024
/** Glyph ink on light and dark cells (as on the cards). */
const INK_DARK: RGB = [13, 16, 23]
const INK_LIGHT: RGB = [238, 241, 246]
/** Cell colour of assigned code points in pure view. */
const PURE_CELL: RGB = [52, 58, 71]

const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
/** The outline of a range of code points, as a closed path in world coordinates. */
const outlinePath = (start: number, end: number): Path2D => {
  const path = new Path2D()
  const pts = rangeOutline(start, end)
  const [x0, y0] = required(pts[0], `outline of ${hex(start)}–${hex(end)}`)
  path.moveTo(x0, y0)
  for (const [x, y] of pts.slice(1)) path.lineTo(x, y)
  path.closePath()
  return path
}

export class MapView {
  private ctx: CanvasRenderingContext2D
  private cam: Camera = { cx: 0, cy: 0, k: 1 }
  private w = 0
  private h = 0
  private dpr = 1
  private mode: ColorMode | undefined = undefined
  private highlight: Set<number> | undefined = undefined
  private planeBitmaps: HTMLCanvasElement[] = []
  private fullColors: string[] = []
  private dimColors: string[] = []
  private valueOn = new Uint8Array(0)
  /** Per value: whether text on a card of that colour should be dark (the colour is light). */
  private inkDark: boolean[] = []
  private mask: Uint8Array | undefined = undefined
  private tileBitmaps: HTMLCanvasElement[] = []
  /**
   * Per plane, one pixel per code point: the ink its glyph is drawn in (dark or light to suit the
   * cell colour, as on the cards) and how strongly (faint if dimmed, none if not shown). Glyph
   * tiles are recoloured with it in the normal view.
   */
  private inkBitmaps: HTMLCanvasElement[] = []
  /**
   * Per plane, cells whose glyph is a colour emoji: the texture shows those as drawn rather than
   * recoloured, or they'd become solid ink silhouettes. Null for planes without any.
   */
  private colourBitmaps: (HTMLCanvasElement | undefined)[] = []
  /** Index of the colour emoji font, if any. */
  private colourFont = -1
  /** Offscreen layer the glyph tiles are drawn into and recoloured on, in the normal view. */
  private glyphLayer: HTMLCanvasElement | undefined = undefined
  private inkLayer: HTMLCanvasElement | undefined = undefined
  private colourLayer: HTMLCanvasElement | undefined = undefined
  /** Show glyph texture from the tiles when zoomed out in the normal view. */
  private glyphTexture = true
  private tilesOn = false
  private sparseLit: number[] = []
  private preview: Preview | undefined = undefined
  /** A block or section that was clicked: stays pointed out until you click elsewhere or press Esc. */
  private pinned: Preview | undefined = undefined
  /** Headers drawn in the last frame (screen rects), for hover and click. */
  private headerHits: { r: Rect; s: number; e: number; name: string }[] = []
  /** Whether the current preview comes from hovering a header on the map (not the sidebar). */
  private headerHover = false
  /** Pure view: no colour, labels or chrome; just the cells and their glyphs. */
  private pure = false
  /** Pre-rendered glyph tiles (16×16 code points at a few resolutions) for mid zoom in pure view. */
  private glyphTiles = new Map<string, HTMLCanvasElement | HTMLImageElement | undefined>()
  private glyphTileBytes = 0
  /** Pre-built tile files ("res/plane/ty-tx"), if there are any, and their version for cache busting. */
  private staticTiles: Set<string> | undefined = undefined
  private staticTilesVersion = ""
  private tileLoads = new Set<string>()
  private blockLit: Uint8Array | undefined = undefined
  private asOf: number | undefined = undefined
  private blockFirstAge: number[]
  private sections: { s: number; e: number; title: string; path: Path2D; plane: number; block: number; bbox: Rect }[]
  private blockBBox: Rect[]
  private sectionFirstAge: number[]
  private blockPaths: Path2D[]
  private selected: number | undefined = undefined
  private hovered = -1
  private dirty = true
  private raf = 0
  private anim: { start: number; dur: number; f: (t: number) => Camera } | undefined = undefined
  private loadedRows = new Set<number>()
  private pendingRows = new Set<number>()
  private lastResortReady = false
  private resizeObs: ResizeObserver
  private disposers: (() => void)[] = []
  private movingTimer = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private data: UnicodeData,
    private cb: MapCallbacks
  ) {
    this.ctx = canvas.getContext("2d")!
    void this.loadTileManifest()
    this.colourFont = data.meta.fonts.findIndex((f) => /Color Emoji/i.test(f.family))
    this.blockPaths = data.meta.blocks.map((b) => outlinePath(b.s, b.e))
    const firstAge = (a: number, b: number): number => {
      let min = Infinity
      for (let cp = a; cp <= b; cp++) {
        // Per code point, and cp is below MAX_CP: ageIdx has an entry for it.
        const age = data.ageIdx[cp]!
        if (data.isAssigned(cp) && age < min) min = age
      }
      return min
    }
    this.blockFirstAge = data.meta.blocks.map((b) => firstAge(b.s, b.e))
    this.sections = data.meta.sections.map(([s, e, title]) => ({
      s,
      e,
      title,
      path: outlinePath(s, e),
      plane: s >> 16,
      block: required(data.blockIdx[s], `block index of ${hex(s)}`),
      bbox: rangeRect(s, e)
    }))
    this.sectionFirstAge = this.sections.map((sec) => firstAge(sec.s, sec.e))
    this.blockBBox = data.meta.blocks.map((b) => rangeRect(b.s, b.e))
    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(canvas)
    this.resize()
    this.bindInput()
    void document.fonts.load(`16px "UMap Last Resort"`, "A").then(() => {
      this.lastResortReady = true
      this.invalidate()
    })
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop)
      if (this.anim) {
        const t = clamp((now - this.anim.start) / this.anim.dur, 0, 1)
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        this.setCamera(this.anim.f(e), false)
        if (t >= 1) this.anim = undefined
      }
      if (this.dirty) {
        this.dirty = false
        this.render()
      }
    }
    this.raf = requestAnimationFrame(loop)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    this.resizeObs.disconnect()
    this.disposers.forEach((d) => d())
  }

  // ---------------------------------------------------------------------------
  // Public API

  get camera(): Camera {
    return { ...this.cam }
  }
  get animating(): boolean {
    return this.anim !== undefined
  }
  /**
   * The code point at the centre of the visible map area (clear of the floating top bar), or -1
   * if that's between planes. Fitted views centre their target here, not on the canvas centre.
   */
  centreCp(): number {
    const { cx, cy, k } = this.cam
    return cellToCp(cx + (this.insets.l - this.insets.r) / 2 / k, cy + (this.insets.t - this.insets.b) / 2 / k)
  }
  get size(): { w: number; h: number } {
    return { w: this.w, h: this.h }
  }

  setMode(mode: ColorMode): void {
    this.mode = mode
    this.rebuildBitmaps()
  }

  setHighlight(values: Set<number> | undefined): void {
    this.highlight = values
    this.rebuildBitmaps()
  }

  setGlyphTexture(on: boolean): void {
    this.glyphTexture = on
    this.invalidate()
  }

  setPure(on: boolean): void {
    if (on === this.pure) return
    this.pure = on
    // Without the floating top bar, fitted views can use the whole canvas.
    this.insets = on ? { l: 16, t: 16, r: 16, b: 16 } : { l: 16, t: 92, r: 16, b: 16 }
    this.preview = undefined
    this.pinned = undefined
    this.headerHits = []
    this.headerHover = false
    this.hovered = -1
    this.canvas.style.cursor = ""
    this.rebuildBitmaps()
  }

  /** Point out a range (a plane or block hovered in the sidebar): dim the rest and outline it. */
  setPreview(
    range: { s: number; e: number; name: string; labelAt?: { x: number; y: number }; soft?: boolean } | undefined
  ): void {
    this.headerHover = false
    if (range && this.preview && range.s === this.preview.s && range.e === this.preview.e) {
      this.preview.labelAt = range.labelAt
      this.invalidate()
      return
    }
    if (!range) {
      if (!this.preview) return
      this.preview = undefined
    } else {
      this.preview = makePreview(range)
    }
    this.invalidate()
  }

  /**
   * Take the user to a block or section and keep it pointed out. Blocks are long strips one or
   * more 256-cell rows wide, so fitting a whole one usually leaves its cells too small to read:
   * instead, zoom to where glyphs are legible and line up the range's start, unless it fits
   * whole at that size. Showing the same range again fits all of it.
   */
  showRange(s: number, e: number): void {
    const again = this.pinned?.s === s && this.pinned.e === e
    this.preview = undefined
    this.headerHover = false
    this.pinned = makePreview({ s, e, name: this.rangeName(s, e) })
    const r = this.pinned.rect
    const pad = 1.6
    const fit = clamp(Math.min(this.availW() / (r.w * pad), this.availH() / (r.h * pad)), 0, 90)
    if (again || fit >= READ_K) {
      this.flyToRect(r, { pad, maxK: 90 })
      return
    }
    const k = clamp(this.cam.k, READ_K, 72)
    const m = 28 // screen margin around the range, in CSS pixels
    const fitsW = r.w * k <= this.availW() - 2 * m
    const fitsH = r.h * k <= this.availH() - 2 * m
    const centre = this.centreFor(r.x + r.w / 2, r.y + r.h / 2, k)
    // A range that fits vertically sits in the upper part of the view, clear of the legend
    // floating at the bottom.
    const midY = this.insets.t + Math.max(this.availH() * 0.33, (r.h * k) / 2 + m)
    this.flyTo({
      k,
      // Line the start up just right of the row numbers, which are showing at this zoom.
      cx: fitsW ? centre.cx : r.x - (Math.max(this.insets.l, AXIS_LEFT) + m - this.w / 2) / k,
      cy: fitsH ? r.y + r.h / 2 - (midY - this.h / 2) / k : r.y - (this.insets.t + m - this.h / 2) / k
    })
  }

  /** Stop pointing out the clicked block or section. */
  clearPinned(): void {
    if (!this.pinned) return
    this.pinned = undefined
    this.invalidate()
  }

  private rangeName(s: number, e: number): string {
    const b = this.data.meta.blocks.find((b) => b.s === s && b.e === e)
    if (b) return b.name
    const sec = this.data.sectionRange(s)
    return sec?.[0] === s && sec[1] === e ? sec[2] : uplus(s)
  }

  /** Dim everything outside a per-code-point mask (property highlight). */
  setMask(mask: Uint8Array | undefined): void {
    this.mask = mask
    this.rebuildBitmaps()
  }

  /** Show Unicode as of an age index (see meta.ages), or undefined for the current version. */
  setAsOf(ageIndex: number | undefined): void {
    if (ageIndex === this.asOf) return
    this.asOf = ageIndex
    this.rebuildBitmaps()
  }

  setSelected(cp: number | undefined): void {
    this.selected = cp
    // Picking a character outside the pointed-out block or section lets it go.
    if (cp !== undefined && this.pinned && (cp < this.pinned.s || cp > this.pinned.e)) this.pinned = undefined
    this.invalidate()
  }

  setCamera(cam: Camera, cancelAnim = true): void {
    if (cancelAnim) this.anim = undefined
    const kMin = this.fitK() * 0.6
    this.cam = { cx: cam.cx, cy: cam.cy, k: clamp(cam.k, kMin, 800) }
    this.invalidate()
    this.cb.onCamera(this.camera)
  }

  /** Screen margins covered by floating UI, respected when fitting things into view. */
  insets = { l: 16, t: 92, r: 16, b: 16 }

  fitK(): number {
    return Math.min(this.availW() / WORLD.w, this.availH() / WORLD.h) * 0.98
  }
  private availW(): number {
    return Math.max(100, this.w - this.insets.l - this.insets.r)
  }
  private availH(): number {
    return Math.max(100, this.h - this.insets.t - this.insets.b)
  }
  /** Camera centre that puts world point (x, y) in the middle of the unobscured area. */
  private centreFor(x: number, y: number, k: number): { cx: number; cy: number } {
    return { cx: x - (this.insets.l - this.insets.r) / 2 / k, cy: y - (this.insets.t - this.insets.b) / 2 / k }
  }

  overview(animate = true): void {
    this.clearPinned()
    this.flyToRect(WORLD, { animate, pad: 1 })
  }

  /** Fly so that rect (world) fills the view. */
  flyToRect(r: Rect, opts: { animate?: boolean; pad?: number; maxK?: number } = {}): void {
    const pad = opts.pad ?? 1.15
    const k = clamp(Math.min(this.availW() / (r.w * pad), this.availH() / (r.h * pad)), 0, opts.maxK ?? 140)
    this.flyTo({ ...this.centreFor(r.x + r.w / 2, r.y + r.h / 2, k), k }, opts.animate ?? true)
  }

  flyTo(target: Camera, animate = true): void {
    if (!animate || this.w === 0) {
      this.setCamera(target)
      return
    }
    const from = this.cam
    const interp = interpolateZoom([from.cx, from.cy, this.w / from.k], [target.cx, target.cy, this.w / target.k])
    const dur = clamp(interp.duration * 0.9, 350, 1800)
    this.anim = {
      start: performance.now(),
      dur,
      f: (t) => {
        const [cx, cy, vw] = interp(t)
        return { cx, cy, k: this.w / vw }
      }
    }
    this.invalidate()
  }

  /** Bring a code point into view, zooming in to glyph level if needed. */
  focusCp(cp: number, opts: { zoom?: boolean; animate?: boolean } = {}): void {
    const c = cpToCell(cp)
    const k = opts.zoom === false ? this.cam.k : Math.max(this.cam.k, 72)
    const sx = (c.x + 0.5 - this.cam.cx) * k + this.w / 2
    const sy = (c.y + 0.5 - this.cam.cy) * k + this.h / 2
    const margin = Math.min(140, this.w / 4)
    if (k === this.cam.k && sx > margin && sx < this.w - margin && sy > margin && sy < this.h - margin) return
    if (k === this.cam.k && Math.abs(sx - this.w / 2) < this.w * 1.5 && Math.abs(sy - this.h / 2) < this.h * 1.5) {
      // Nearby: pan just enough.
      const nx = clamp(sx, margin, this.w - margin)
      const ny = clamp(sy, margin, this.h - margin)
      this.flyTo({ cx: this.cam.cx + (sx - nx) / k, cy: this.cam.cy + (sy - ny) / k, k })
      return
    }
    this.flyTo({ ...this.centreFor(c.x + 0.5, c.y + 0.5, k), k }, opts.animate ?? true)
  }

  zoomBy(factor: number): void {
    this.flyTo({ ...this.cam, k: this.cam.k * factor })
  }

  invalidate(): void {
    this.dirty = true
  }

  /** Screen point → world point. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.w / 2) / this.cam.k + this.cam.cx, y: (sy - this.h / 2) / this.cam.k + this.cam.cy }
  }

  // ---------------------------------------------------------------------------
  // Internals

  private resize(): void {
    const r = this.canvas.getBoundingClientRect()
    const first = this.w === 0
    const [ow, oh] = [this.w, this.h]
    this.dpr = window.devicePixelRatio || 1
    this.w = r.width
    this.h = r.height
    // The canvas grows and shrinks from its bottom-right (the sidebar is on the right), so keep
    // what's at its top-left in place: toggling pure view or resizing the window doesn't shift the map.
    if (!first && this.w > 0 && (ow !== this.w || oh !== this.h)) {
      const { k, cx, cy } = this.cam
      this.anim = undefined
      this.setCamera({ k, cx: cx + (this.w - ow) / 2 / k, cy: cy + (this.h - oh) / 2 / k })
    }
    this.canvas.width = Math.round(r.width * this.dpr)
    this.canvas.height = Math.round(r.height * this.dpr)
    if (first && this.w > 0) {
      const k = this.fitK()
      this.setCamera({ ...this.centreFor(WORLD.x + WORLD.w / 2, WORLD.y + WORLD.h / 2, k), k })
    }
    this.invalidate()
  }

  private rebuildBitmaps(): void {
    const mode = this.mode
    if (!mode) return
    const { valueOf } = mode
    // Pure view: every assigned code point the same neutral grey, reserved ones background.
    let colors = this.pure ? mode.colors.map((_, v): RGB => (v <= V_NONCHAR ? PLANE_BG : PURE_CELL)) : mode.colors
    const data = this.data
    const hl = this.pure ? undefined : this.highlight
    const mask = this.pure ? undefined : this.mask
    const asOf = this.pure ? undefined : this.asOf
    const dim = (c: RGB): RGB => [
      Math.round(PLANE_BG[0] + (c[0] - PLANE_BG[0]) * 0.16),
      Math.round(PLANE_BG[1] + (c[1] - PLANE_BG[1]) * 0.16),
      Math.round(PLANE_BG[2] + (c[2] - PLANE_BG[2]) * 0.16)
    ]
    const dimmed = colors.map(dim)
    // Highlighted values that are normally drawn near-black (reserved code points, noncharacters,
    // dark legend entries) light up while highlighted, or highlighting them would show nothing.
    const lum = (c: RGB): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    const shown = colors.map((c, v): RGB => {
      if (!hl?.has(v) || lum(c) >= 70) return c
      if (v === V_NONCHAR) return [226, 92, 128]
      return c.map((x) => Math.round(x + (255 - x) * 0.55)) as RGB
    })
    colors = shown
    this.fullColors = colors.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)
    this.dimColors = dimmed.map((c) => `rgb(${c[0]},${c[1]},${c[2]})`)
    this.inkDark = colors.map((c) => lum(c) > 150)
    // Per value: is it highlighted by the legend?
    this.valueOn = new Uint8Array(colors.length).fill(1)
    if (hl) this.valueOn.fill(0).forEach((_, v) => (this.valueOn[v] = hl.has(v) ? 1 : 0))

    // When something is highlighted, sparse matches vanish at low zoom (a plane is ~170px wide
    // for 256 cells), so also build coarse tiles that light up if any cell in them matches.
    const filtering = hl !== undefined || mask !== undefined
    this.blockLit = filtering ? new Uint8Array(data.meta.blocks.length) : undefined
    const sparse: number[] = []

    for (let p = 0; p < PLANE_COUNT; p++) {
      let tile: ImageData | undefined = undefined
      let tc = this.tileBitmaps[p]
      if (filtering) {
        if (!tc) {
          tc = document.createElement("canvas")
          tc.width = tc.height = PLANE_SIZE / TILE
          this.tileBitmaps[p] = tc
        }
        tile = tc.getContext("2d")!.createImageData(PLANE_SIZE / TILE, PLANE_SIZE / TILE)
      }
      let cv = this.planeBitmaps[p]
      if (!cv) {
        cv = document.createElement("canvas")
        cv.width = cv.height = PLANE_SIZE
        this.planeBitmaps[p] = cv
      }
      const c = cv.getContext("2d")!
      const img = c.createImageData(PLANE_SIZE, PLANE_SIZE)
      const d = img.data
      let icv = this.inkBitmaps[p]
      if (!icv) {
        icv = document.createElement("canvas")
        icv.width = icv.height = PLANE_SIZE
        this.inkBitmaps[p] = icv
      }
      const ink = icv.getContext("2d")!.createImageData(PLANE_SIZE, PLANE_SIZE)
      const id = ink.data
      let colour: ImageData | undefined = undefined
      const base = p << 16
      for (let i = 0; i < 65536; i++) {
        const cp = base + i
        let col: RGB
        // Per code point: cp is below MAX_CP, so it's in ageIdx, valueOf and mask, and every value
        // valueOf gives has a colour.
        if (asOf !== undefined && data.ageIdx[cp]! > asOf) col = PLANE_BG // not yet encoded
        else {
          const v = valueOf[cp]!
          const lit = this.valueOn[v] && (!mask || mask[cp])
          col = lit ? colors[v]! : dimmed[v]!
          // Ink as on the cards: dark or light to suit the colour, faint when dimmed.
          const io = i * 4
          if (this.colourFont >= 0 && data.fontIdx[cp] === this.colourFont + 1) {
            // Colour emoji: no ink; shown as drawn instead.
            colour ??= new ImageData(PLANE_SIZE, PLANE_SIZE)
            colour.data[io + 3] = lit ? 255 : 64
          } else {
            const inkCol = lit && this.inkDark[v] ? INK_DARK : INK_LIGHT
            id[io] = inkCol[0]
            id[io + 1] = inkCol[1]
            id[io + 2] = inkCol[2]
            id[io + 3] = lit ? 255 : 64
          }
          if (lit && filtering && sparse.length <= SPARSE_MAX) sparse.push(cp)
          if (tile && lit) {
            const t = (((i >> 8) / TILE) | 0) * (PLANE_SIZE / TILE) + (((i & 255) / TILE) | 0)
            const to = t * 4
            tile.data[to] = col[0]
            tile.data[to + 1] = col[1]
            tile.data[to + 2] = col[2]
            tile.data[to + 3] = 255
            const b = data.blockIdx[cp]!
            if (b >= 0) this.blockLit![b] = 1
          }
        }
        const o = i * 4
        d[o] = col[0]
        d[o + 1] = col[1]
        d[o + 2] = col[2]
        d[o + 3] = 255
      }
      c.putImageData(img, 0, 0)
      icv.getContext("2d")!.putImageData(ink, 0, 0)
      if (colour) {
        let ccv = this.colourBitmaps[p]
        if (!ccv) {
          ccv = document.createElement("canvas")
          ccv.width = ccv.height = PLANE_SIZE
          this.colourBitmaps[p] = ccv
        }
        ccv.getContext("2d")!.putImageData(colour, 0, 0)
      } else this.colourBitmaps[p] = undefined
      if (tile && tc) tc.getContext("2d")!.putImageData(tile, 0, 0)
    }
    this.tilesOn = filtering
    // A handful of matches (noncharacters, a rare property…) get rings so they can be found.
    this.sparseLit = filtering && sparse.length <= SPARSE_MAX ? sparse : []
    this.invalidate()
  }

  /** Whether a code point is dimmed by the legend highlight or the property mask. */
  private isDim(cp: number, v: number): boolean {
    if (this.pure) return false
    return !this.valueOn[v] || (this.mask !== undefined && !this.mask[cp])
  }

  /** Whether a code point exists in the version being shown. */
  private exists(cp: number): boolean {
    return this.data.isAssigned(cp) && (this.pure || this.asOf === undefined || this.data.ageIdx[cp]! <= this.asOf)
  }

  private visibleWorld(): Rect {
    const { cx, cy, k } = this.cam
    return { x: cx - this.w / 2 / k, y: cy - this.h / 2 / k, w: this.w / k, h: this.h / k }
  }

  private sx(wx: number): number {
    return (wx - this.cam.cx) * this.cam.k + this.w / 2
  }
  private sy(wy: number): number {
    return (wy - this.cam.cy) * this.cam.k + this.h / 2
  }

  private render(): void {
    if (!this.mode || this.w === 0) return
    const ctx = this.ctx
    const { k } = this.cam
    const dpr = this.dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = PAGE_BG
    ctx.fillRect(0, 0, this.w, this.h)

    const vis = this.visibleWorld()
    const planes: number[] = []
    for (let p = 0; p < PLANE_COUNT; p++) {
      const o = planeOrigin(p)
      if (o.x + PLANE_SIZE < vis.x || o.x > vis.x + vis.w || o.y + PLANE_SIZE < vis.y || o.y > vis.y + vis.h) continue
      planes.push(p)
    }

    // 1. Plane bitmaps
    ctx.imageSmoothingEnabled = false
    for (const p of planes) {
      const o = planeOrigin(p)
      const bitmap = this.planeBitmaps[p]
      if (bitmap) ctx.drawImage(bitmap, this.sx(o.x), this.sy(o.y), PLANE_SIZE * k, PLANE_SIZE * k)
    }

    if (this.pure) {
      const cardT = smooth(CARD_START, CARD_FULL, k)
      // Glyphs from pre-rendered tiles until real font rendering takes over. Even far out, where
      // glyphs are under a pixel, the tiles average down to a texture showing what's where.
      // Once cards start, their opaque cells cover the tiles and draw the same glyphs live.
      const tileGA = smooth(GLYPH_TILE_START, GLYPH_TILE_FULL, k)
      if (tileGA > 0.01 && cardT === 0) this.renderGlyphTiles(planes, vis, tileGA)
      if (cardT > 0) this.renderCells(planes, vis, cardT)
      const gridA = smooth(GRID_START, GRID_START * 3, k) * (1 - cardT)
      if (gridA > 0.01) this.renderGrid(planes, vis, gridA)
      return
    }

    // Highlight tiles at low zoom
    const tileA = this.tilesOn ? 1 - smooth(1.6, 4, k) : 0
    if (tileA > 0.01) {
      ctx.globalAlpha = tileA
      for (const p of planes) {
        const o = planeOrigin(p)
        const bitmap = this.tileBitmaps[p]
        if (bitmap) ctx.drawImage(bitmap, this.sx(o.x), this.sy(o.y), PLANE_SIZE * k, PLANE_SIZE * k)
      }
      ctx.globalAlpha = 1
    }

    // 2. Cards & glyphs at high zoom; below that, glyph texture from the tiles, in each cell's ink.
    const cardT = smooth(CARD_START, CARD_FULL, k)
    if (this.glyphTexture && cardT === 0) {
      // Fades in as in pure view, so the texture shows even far out.
      const a = smooth(GLYPH_TILE_START, GLYPH_TILE_FULL, k)
      if (a > 0.01) this.renderInkedGlyphs(planes, vis, a)
    }
    if (cardT > 0) this.renderCells(planes, vis, cardT)

    // 3. Grid lines
    const gridA = smooth(GRID_START, GRID_START * 3, k) * (1 - cardT)
    if (gridA > 0.01) this.renderGrid(planes, vis, gridA)

    // 4. Section dividers and block outlines
    const sectionA = smooth(SECTION_START, SECTION_START * 1.15, k)
    if (sectionA > 0.01) this.renderSectionDividers(planes, vis, sectionA, cardT)
    this.renderBlockOutlines(planes, cardT)

    // 5. Plane frames and titles
    for (const p of planes) this.renderPlaneFrame(p)

    // 6. Landmark names, centred in big blocks, while zoomed out
    const axisA = smooth(AXIS_START, AXIS_START * 1.6, k)
    this.renderBlockLabels(planes, vis)

    // 7. Hover / selection
    this.renderMarkers()

    // 8. Block and section headers on the row edges, placed without overlapping
    // Section labels wait for readable glyphs, after block labels have had a step of their own.
    this.renderHeaders(planes, vis, smooth(CARD_START, CARD_START * 1.15, k), axisA)

    // Sidebar hover preview, over everything but the axes
    const pv = this.preview ?? this.pinned
    if (pv) this.renderPreview(vis, pv)

    // 9. Sticky axes
    if (axisA > 0.01) this.renderAxes(planes, vis, axisA)
  }

  private renderGrid(planes: number[], vis: Rect, alpha: number): void {
    const ctx = this.ctx
    const k = this.cam.k
    ctx.strokeStyle = `rgba(8, 10, 14, ${0.55 * alpha})`
    ctx.lineWidth = 1
    ctx.beginPath()
    for (const p of planes) {
      const o = planeOrigin(p)
      const x0 = Math.max(o.x, Math.floor(vis.x))
      const x1 = Math.min(o.x + PLANE_SIZE, Math.ceil(vis.x + vis.w))
      const y0 = Math.max(o.y, Math.floor(vis.y))
      const y1 = Math.min(o.y + PLANE_SIZE, Math.ceil(vis.y + vis.h))
      const top = this.sy(Math.max(o.y, vis.y)),
        bottom = this.sy(Math.min(o.y + PLANE_SIZE, vis.y + vis.h))
      const left = this.sx(Math.max(o.x, vis.x)),
        right = this.sx(Math.min(o.x + PLANE_SIZE, vis.x + vis.w))
      for (let x = x0; x <= x1; x++) {
        const s = Math.round(this.sx(x)) + 0.5
        ctx.moveTo(s, top)
        ctx.lineTo(s, bottom)
      }
      for (let y = y0; y <= y1; y++) {
        const s = Math.round(this.sy(y)) + 0.5
        ctx.moveTo(left, s)
        ctx.lineTo(right, s)
      }
    }
    ctx.stroke()
    // Stronger lines every 16 cells
    if (k > GRID_START * 1.5) {
      ctx.strokeStyle = `rgba(8, 10, 14, ${0.8 * alpha})`
      ctx.lineWidth = 1.5
      ctx.beginPath()
      for (const p of planes) {
        const o = planeOrigin(p)
        for (let x = o.x; x <= o.x + PLANE_SIZE; x += 16) {
          if (x < vis.x - 1 || x > vis.x + vis.w + 1) continue
          ctx.moveTo(this.sx(x), this.sy(o.y))
          ctx.lineTo(this.sx(x), this.sy(o.y + PLANE_SIZE))
        }
        for (let y = o.y; y <= o.y + PLANE_SIZE; y += 16) {
          if (y < vis.y - 1 || y > vis.y + vis.h + 1) continue
          ctx.moveTo(this.sx(o.x), this.sy(y))
          ctx.lineTo(this.sx(o.x + PLANE_SIZE), this.sy(y))
        }
      }
      ctx.stroke()
    }
  }

  private renderCells(planes: number[], vis: Rect, t: number): void {
    const ctx = this.ctx
    const data = this.data
    const k = this.cam.k
    const { valueOf } = required(this.mode, "colour mode")
    const hexA = this.pure ? 0 : smooth(HEX_START, HEX_START * 1.3, k)
    // Once headers sit inside the top of rows (with the code points), glyphs shrink a little and
    // move down to leave them room.
    const glyphPx = k * (0.5 - 0.06 * hexA)
    const nameA = this.pure ? 0 : smooth(NAME_START, NAME_START * 1.3, k)
    const gap = Math.max(1, k * 0.04)
    let lastFont = ""
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"

    for (const p of planes) {
      const o = planeOrigin(p)
      const x0 = Math.max(0, Math.floor(vis.x - o.x))
      const x1 = Math.min(PLANE_SIZE - 1, Math.floor(vis.x + vis.w - o.x))
      const y0 = Math.max(0, Math.floor(vis.y - o.y))
      const y1 = Math.min(PLANE_SIZE - 1, Math.floor(vis.y + vis.h - o.y))
      if (x0 > x1 || y0 > y1) continue

      // Cover the bitmap with a dark backdrop, faded in: it shows as the gaps between cards.
      ctx.globalAlpha = t
      ctx.fillStyle = PAGE_BG
      ctx.fillRect(this.sx(o.x + x0), this.sy(o.y + y0), (x1 - x0 + 1) * k, (y1 - y0 + 1) * k)

      for (let ly = y0; ly <= y1; ly++) {
        const rowCp = (p << 16) | (ly << 8)
        const rowReady = this.ensureRowFonts(rowCp)
        const sy = this.sy(o.y + ly)
        for (let lx = x0; lx <= x1; lx++) {
          const cp = rowCp | lx
          // Per cell: cp is a code point, so valueOf has it, and the colour tables have its value.
          const v = valueOf[cp]!
          const sx = this.sx(o.x + lx)
          if (!this.exists(cp)) {
            if (!this.pure && this.highlight && this.valueOn[v] && !data.isAssigned(cp) && this.mask?.[cp] !== 0) {
              // Highlighted reserved code point / noncharacter: shown lit, like its cell colour.
              ctx.globalAlpha = 1
              ctx.fillStyle = this.fullColors[v]!
              ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, k - 2 * gap)
              continue
            }
            ctx.globalAlpha = t
            ctx.fillStyle = data.nonchar[cp] ? "#2a1820" : "#12161e"
            ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, k - 2 * gap)
            continue
          }
          ctx.globalAlpha = 1
          const dim = this.isDim(cp, v)
          // Cards keep their cell's colour at every zoom; the ink is fixed per colour.
          ctx.fillStyle = dim ? this.dimColors[v]! : this.fullColors[v]!
          ctx.fillRect(sx + gap, sy + gap, k - 2 * gap, k - 2 * gap)
          const dark = !dim && this.inkDark[v]!
          const glyphColor = dark ? "#0d1017" : "#eef1f6"

          const glyphY = sy + k * (nameA > 0 ? 0.45 : 0.53)
          const str = displayString(data, cp)
          if (str) {
            if (rowReady) {
              // Pure view: the glyph tiles already showed this at full strength, so no fade-in.
              ctx.globalAlpha = this.pure ? 1 : (this.glyphTexture ? 1 : t) * (dim ? 0.25 : 1)
              ctx.fillStyle = glyphColor
              const font = `${glyphPx}px ${data.glyphFamily(cp)}`
              if (font !== lastFont) ctx.font = lastFont = font
              ctx.fillText(str, sx + k / 2, glyphY)
            }
          } else {
            this.drawSpecial(cp, sx, k, glyphY, (this.pure || this.glyphTexture ? 1 : t) * (dim ? 0.3 : 1), dark)
            lastFont = ""
          }
          if (hexA > 0) {
            ctx.globalAlpha = t * hexA * (dim ? 0.3 : 0.7)
            ctx.fillStyle = dark ? "#0d1017" : "#c4cad6"
            ctx.font = lastFont = `500 ${Math.min(14, k * 0.12)}px ${MONO_FONT}`
            ctx.fillText(hex(cp), sx + k / 2, sy + k * 0.88)
          }
          if (nameA > 0) {
            ctx.globalAlpha = t * nameA * (dim ? 0.3 : 0.85)
            ctx.fillStyle = dark ? "#0d1017" : "#dde2ea"
            const fs = Math.min(12, k * 0.075)
            ctx.font = lastFont = `500 ${fs}px ${UI_FONT}`
            this.wrapText(data.name(cp), sx + k / 2, sy + k * 0.72, k * 0.88, fs * 1.15, 2)
          }
        }
      }
    }
    ctx.globalAlpha = 1
  }

  /** Placeholder for a code point with no visible glyph: a dashed box with its abbreviation. */
  private drawSpecial(
    cp: number,
    sx: number,
    k: number,
    cy: number,
    alpha: number,
    dark: boolean,
    ctx = this.ctx
  ): void {
    const gc = this.data.gc(cp).code
    let label: string | undefined
    if (gc === "Co") label = "PUA"
    else if (gc === "Cs") label = "SUR"
    else label = this.data.abbr(cp) ?? hex(cp)
    if (!label) return
    const bw = k * 0.62
    const bh = k * 0.36
    ctx.globalAlpha = alpha * 0.8
    ctx.strokeStyle = dark ? "rgba(13,16,23,0.7)" : "#8b95a8"
    ctx.lineWidth = Math.max(1, k * 0.012)
    ctx.setLineDash([Math.max(2, k * 0.03), Math.max(2, k * 0.03)])
    ctx.strokeRect(sx + (k - bw) / 2, cy - bh / 2, bw, bh)
    ctx.setLineDash([])
    ctx.fillStyle = dark ? "#0d1017" : "#c9d0dc"
    ctx.font = `600 ${Math.min(bh * 0.55, (bw / label.length) * 1.5)}px ${MONO_FONT}`
    ctx.fillText(label, sx + k / 2, cy + 1)
  }

  private wrapText(text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number): void {
    const ctx = this.ctx
    const words = text.split(" ")
    const lines: string[] = []
    let cur = ""
    for (const w of words) {
      const next = cur ? cur + " " + w : w
      if (ctx.measureText(next).width > maxW && cur) {
        lines.push(cur)
        cur = w
      } else cur = next
    }
    if (cur) lines.push(cur)
    if (lines.length > maxLines) {
      lines.length = maxLines
      const last = lines[maxLines - 1]
      if (last !== undefined) lines[maxLines - 1] = `${last}…`
    }
    const startY = y - ((lines.length - 1) * lineH) / 2
    lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineH, maxW))
  }

  /** Ask the browser to load the font faces needed for a row; returns whether they're ready. */
  private ensureRowFonts(rowCp: number): boolean {
    const row = rowCp >> 8
    if (this.loadedRows.has(row)) return this.lastResortReady
    if (!this.pendingRows.has(row)) {
      this.pendingRows.add(row)
      // Group the row's characters by font family and load each family for its characters.
      const byFamily = new Map<string, string>()
      for (let i = 0; i < 256; i++) {
        const cp = rowCp | i
        const str = displayString(this.data, cp)
        if (!str) continue
        const fam = this.data.glyphFamily(cp)
        byFamily.set(fam, (byFamily.get(fam) ?? "") + str)
      }
      const done = (): void => {
        this.pendingRows.delete(row)
        this.loadedRows.add(row)
        this.invalidate()
      }
      Promise.all([...byFamily].map(([fam, s]) => document.fonts.load(`32px ${fam}`, s))).then(done, done)
    }
    return false
  }

  private renderBlockOutlines(planes: number[], cardT: number): void {
    const ctx = this.ctx
    const { k, cx, cy } = this.cam
    const dpr = this.dpr
    const planeSet = new Set(planes)
    ctx.save()
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - cx * k), dpr * (this.h / 2 - cy * k))
    ctx.lineJoin = "round"
    const blocks = this.data.meta.blocks
    const base = clamp(0.5 - k * 0.004, 0.25, 0.5)
    ctx.strokeStyle = `rgba(8, 10, 14, ${base + 0.25})`
    ctx.lineWidth = Math.max(1.2, Math.min(3, k * 0.08)) / k
    blocks.forEach((b, i) => {
      if (planeSet.has(b.s >> 16) && this.blockExists(i)) ctx.stroke(required(this.blockPaths[i], "block path"))
    })
    if (cardT > 0.01) {
      // Among the cards the gaps are dark, so block boundaries become light lines.
      ctx.strokeStyle = `rgba(214, 222, 236, ${0.62 * cardT})`
      ctx.lineWidth = Math.max(2, k * 0.06) / k
      blocks.forEach((b, i) => {
        if (planeSet.has(b.s >> 16) && this.blockExists(i)) ctx.stroke(required(this.blockPaths[i], "block path"))
      })
    }
    // Hovered block, at low zoom
    const hb = this.hovered >= 0 ? (this.data.blockIdx[this.hovered] ?? -1) : -1
    if (hb >= 0 && k < CARD_START) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)"
      ctx.lineWidth = 2 / k
      ctx.stroke(required(this.blockPaths[hb], "block path"))
    }
    const sb = this.selected !== undefined ? (this.data.blockIdx[this.selected] ?? -1) : -1
    if (sb >= 0 && sb !== hb) {
      ctx.strokeStyle = "rgba(255,255,255,0.55)"
      ctx.lineWidth = 1.5 / k
      ctx.stroke(required(this.blockPaths[sb], "block path"))
    }
    ctx.restore()
  }

  private renderPlaneFrame(p: number): void {
    const ctx = this.ctx
    const k = this.cam.k
    const o = planeOrigin(p)
    const x = this.sx(o.x),
      y = this.sy(o.y),
      s = PLANE_SIZE * k
    ctx.strokeStyle = "rgba(255,255,255,0.12)"
    ctx.lineWidth = 1
    ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(s) + 1, Math.round(s) + 1)

    const [name, abbr] = planeName(p)
    const fs = clamp(s * 0.045, 11, 22)
    if (y - fs * 1.6 < -fs * 2) return
    ctx.textAlign = "left"
    ctx.textBaseline = "alphabetic"
    ctx.font = `600 ${fs}px ${UI_FONT}`
    ctx.fillStyle = "#e6e9ef"
    const title = `Plane ${p}`
    const ty = y - fs * 0.55
    ctx.fillText(title, x, ty)
    const tw = ctx.measureText(title).width
    ctx.font = `400 ${fs * 0.82}px ${UI_FONT}`
    ctx.fillStyle = "#8d96a8"
    const sub = `${name}${abbr ? ` (${abbr})` : ""}`
    const range = `U+${hex(p << 16)}–U+${hex((p << 16) | 0xffff)}`
    const maxW = s - tw - fs
    let text = `${sub} · ${range}`
    if (ctx.measureText(text).width > maxW) text = sub
    if (ctx.measureText(text).width > maxW) text = abbr || ""
    ctx.fillText(text, x + tw + fs * 0.5, ty)
  }

  /**
   * How far a block has switched from its centred name to a header on its top edge (0–1).
   * Blocks with chart sections switch when the sections appear; others when cards appear.
   */
  /** Opacity of block labels (at the block's start). */
  private blockHeaderA(): number {
    return smooth(BLOCK_LABEL_START, BLOCK_LABEL_FULL, this.cam.k)
  }

  private blockExists(i: number): boolean {
    return this.asOf === undefined || required(this.blockFirstAge[i], "block's first age") <= this.asOf
  }

  /**
   * Fit a label into a world rect clipped to the view: returns screen centre and font size,
   * or undefined if it doesn't fit at the minimum size.
   */
  private fitLabel(
    text: string,
    r: Rect,
    vis: Rect,
    weight: number,
    maxFs: number,
    heightFrac: number
  ): { cx: number; cy: number; fs: number } | undefined {
    const x0 = Math.max(r.x, vis.x),
      y0 = Math.max(r.y, vis.y)
    const x1 = Math.min(r.x + r.w, vis.x + vis.w),
      y1 = Math.min(r.y + r.h, vis.y + vis.h)
    if (x1 <= x0 || y1 <= y0) return undefined
    const sw = (x1 - x0) * this.cam.k,
      sh = (y1 - y0) * this.cam.k
    let fs = Math.min(sh * heightFrac, maxFs)
    if (fs < 8) return undefined
    this.ctx.font = `${weight} ${fs}px ${UI_FONT}`
    const tw = this.ctx.measureText(text).width
    if (tw > sw * 0.9) {
      fs *= (sw * 0.9) / tw
      if (fs < 8) return undefined
      this.ctx.font = `${weight} ${fs}px ${UI_FONT}`
    }
    return { cx: this.sx((x0 + x1) / 2), cy: this.sy((y0 + y1) / 2), fs }
  }

  private haloText(text: string, x: number, y: number, fs: number, fill: string): void {
    const ctx = this.ctx
    ctx.strokeStyle = "rgba(8,10,14,0.75)"
    ctx.lineWidth = Math.max(2, fs * 0.22)
    ctx.strokeText(text, x, y)
    ctx.fillStyle = fill
    ctx.fillText(text, x, y)
  }

  /**
   * Block names. Zoomed out they sit large in the middle of the block; once the block's chart
   * sections are labelled instead, the block name moves to a small tab in its top-left corner.
   */
  private renderBlockLabels(planes: number[], vis: Rect): void {
    const ctx = this.ctx
    const planeSet = new Set(planes)
    ctx.lineJoin = "round"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    const blocks = this.data.meta.blocks
    for (const [i, b] of blocks.entries()) {
      if (!planeSet.has(b.s >> 16) || !this.blockExists(i)) continue
      const a =
        (1 - smooth(LANDMARK_END * 0.8, LANDMARK_END, this.cam.k)) * (this.blockLit && !this.blockLit[i] ? 0.3 : 1)
      if (a <= 0.01) continue
      const lr = labelRect(b.s, b.e)
      // Landmarks only: a one-row strip can't carry a name at a readable size.
      if (lr.h < 2) continue
      const fit =
        lr.h === 1 ? this.fitLabel(b.name, lr, vis, 600, 15, 0.62) : this.fitLabel(b.name, lr, vis, 600, 30, 0.42)
      if (fit) {
        ctx.globalAlpha = a * clamp((fit.fs - 8) / 3, 0, 1)
        this.haloText(b.name, fit.cx, fit.cy, fit.fs, "#ffffff")
      }
    }
    ctx.globalAlpha = 1
  }

  /** Thin dividers between chart sections, among the cards. */
  private renderSectionDividers(planes: number[], vis: Rect, alpha: number, cardT: number): void {
    const ctx = this.ctx
    const { k, cx, cy } = this.cam
    const dpr = this.dpr
    ctx.save()
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - cx * k), dpr * (this.h / 2 - cy * k))
    // Dark lines on the coloured cells; light ones once cards have dark gaps between them.
    const secs = this.visibleSections(planes, vis)
    ctx.lineWidth = Math.max(2, k * 0.05) / k
    if (cardT < 0.99) {
      ctx.strokeStyle = `rgba(8, 10, 14, ${0.75 * alpha * (1 - cardT)})`
      for (const sec of secs) ctx.stroke(sec.path)
    }
    if (cardT > 0.01) {
      ctx.strokeStyle = `rgba(214, 222, 236, ${0.4 * alpha * cardT})`
      for (const sec of secs) ctx.stroke(sec.path)
    }
    ctx.restore()
  }

  private visibleSections(
    planes: number[],
    vis: Rect
  ): { s: number; e: number; title: string; path: Path2D; plane: number; block: number; bbox: Rect }[] {
    const planeSet = new Set(planes)
    return this.sections.filter(
      (sec, i) =>
        planeSet.has(sec.plane) &&
        (this.asOf === undefined || required(this.sectionFirstAge[i], "section's first age") <= this.asOf) &&
        sec.bbox.x < vis.x + vis.w &&
        sec.bbox.x + sec.bbox.w > vis.x &&
        sec.bbox.y < vis.y + vis.h &&
        sec.bbox.y + sec.bbox.h > vis.y
    )
  }

  /**
   * Where a header for code points s..e goes: on the top edge of the range's first row that's
   * on screen, at its first visible cell, sliding along (sticky) while the range is in view.
   * Returns screen coordinates and the room available to the right, or undefined.
   */
  private headerAnchor(
    s: number,
    e: number,
    top: number,
    left: number,
    sticky = true
  ): { x: number; y: number; room: number } | undefined {
    const k = this.cam.k
    const o = planeOrigin(s >> 16)
    const r0 = (s >> 8) & 255,
      r1 = (e >> 8) & 255
    if (!sticky) {
      // Pinned to the range's first cell: it scrolls away with it.
      const y = this.sy(o.y + r0),
        x = this.sx(o.x + (s & 255))
      if (y < top || y > this.h || x < left - 1 || x > this.w) return undefined
      const x1 = this.sx(o.x + (r0 === r1 ? (e & 255) + 1 : 256))
      return { x, y, room: x1 - x }
    }
    let y = this.sy(o.y + r0)
    if (y < top) {
      // Scrolled past the start: stick to the top while the range continues, then get pushed up.
      const bottom = this.sy(o.y + r1 + 1)
      y = Math.min(top, bottom - k * 0.5)
      if (y < top - k * 0.5) return undefined
    }
    const row = clamp(Math.floor((y - this.sy(o.y)) / k + 0.001), r0, r1)
    if (y > this.h) return undefined
    const c0 = row === r0 ? s & 255 : 0
    const c1 = row === r1 ? (e & 255) + 1 : 256
    const x0 = this.sx(o.x + c0),
      x1 = this.sx(o.x + c1)
    const x = Math.max(x0, left)
    if (x1 - x < 30 || x > this.w) return undefined
    return { x, y, room: x1 - x }
  }

  /** Width a pill would take (0 if it doesn't fit in `room`), without drawing it. */
  private measurePill(text: string, room: number, opts: PillStyle): number {
    const ctx = this.ctx
    const { size } = opts
    ctx.font = `${opts.bold ? 650 : 500} ${size}px ${UI_FONT}`
    const padX = size * 0.6,
      dotW = opts.dot ? size * 0.85 : 0
    const maxText = room - 2 * padX - dotW - 4
    if (maxText < size * 2) return 0
    const label = ellipsize(ctx, text, maxText)
    if (label !== text && label.length - 1 < Math.min(opts.minChars ?? 7, text.length)) return 0
    return ctx.measureText(label).width + 2 * padX + dotW
  }

  private pill(text: string, x: number, y: number, room: number, opts: PillStyle): number {
    const ctx = this.ctx
    const { size, bold } = opts
    ctx.font = `${bold ? 650 : 500} ${size}px ${UI_FONT}`
    const padX = size * 0.6,
      dotW = opts.dot ? size * 0.85 : 0
    const h = Math.round(size * 1.6)
    const maxText = room - 2 * padX - dotW - 4
    if (maxText < size * 2) return 0
    const label = ellipsize(ctx, text, maxText)
    // A stub like "Co…" says nothing: leave just the divider.
    if (label !== text && label.length - 1 < Math.min(opts.minChars ?? 7, text.length)) return 0
    const w = ctx.measureText(label).width + 2 * padX + dotW
    const top = Math.round(y - h / 2)
    ctx.fillStyle = opts.fill
    ctx.beginPath()
    ctx.roundRect(Math.round(x), top, w, h, h / 2)
    ctx.fill()
    if (opts.border) {
      ctx.strokeStyle = opts.border
      ctx.lineWidth = 1
      ctx.stroke()
    }
    if (opts.dot) {
      ctx.fillStyle = opts.dot
      ctx.beginPath()
      ctx.arc(x + padX + size * 0.3, y, size * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = opts.ink
    ctx.textAlign = "left"
    ctx.textBaseline = "middle"
    ctx.fillText(label, x + padX + dotW, y + 0.5)
    return w
  }

  /**
   * Block and section headers that sit on the top edge of where each starts, like the headings
   * in the code charts, and stay on screen while you pan through the block or section.
   * Headers are placed in priority order (blocks, then longer sections first) and any that would
   * overlap one already placed are skipped, so busy areas thin out instead of piling up.
   */
  private renderHeaders(planes: number[], vis: Rect, sectionA: number, axisA: number): void {
    const ctx = this.ctx
    const data = this.data
    const k = this.cam.k
    const top = axisA > 0.01 ? 26 : 4
    const left = axisA > 0.01 ? 64 : 4
    const planeSet = new Set(planes)
    const size = clamp(9.5 + (k - 14) * 0.05, 10, 12.5)
    const h = Math.round(size * 1.6)
    // Straddle the row edge until code points appear at the bottom of cards, then sit just inside.
    const drop = smooth(HEX_START * 0.85, HEX_START * 1.15, k) * (h / 2 + Math.max(1, k * 0.04))
    const valueOf = required(this.mode, "colour mode").valueOf
    const placed: Rect[] = []
    this.headerHits = []
    const free = (r: Rect): boolean =>
      !placed.some((q) => r.x < q.x + q.w + 3 && r.x + r.w + 3 > q.x && r.y < q.y + q.h + 2 && r.y + r.h + 2 > q.y)
    /** Right edge of the block header drawn at each block's start, for its first section to follow. */
    const blockHeaderEnd = new Map<number, { x: number; y: number }>()

    const blocks = data.meta.blocks
    for (const [i, b] of blocks.entries()) {
      if (!planeSet.has(b.s >> 16) || !this.blockExists(i)) continue
      const a = this.blockHeaderA()
      if (a <= 0.01) continue
      const bb = required(this.blockBBox[i], "block bounds")
      if (bb.x > vis.x + vis.w || bb.x + bb.w < vis.x || bb.y > vis.y + vis.h || bb.y + bb.h < vis.y) continue
      // Like sections, a block's label sits at the cell where it starts and scrolls away with it.
      const at = this.headerAnchor(b.s, b.e, top, left, false)
      if (!at) continue
      const style = {
        size: size + 0.5,
        bold: true,
        minChars: 10,
        fill: "rgba(240, 243, 248, 0.97)",
        ink: "#0d1017",
        dot: required(data.meta.regions[b.region], "block's region").color,
        border: "rgba(8, 10, 14, 0.55)"
      }
      const w = this.measurePill(b.name, at.room - 2, style)
      if (!w) continue
      const r = { x: at.x + 2, y: at.y + drop - h / 2, w, h }
      if (!free(r)) continue
      placed.push(r)
      if (a > 0.5) this.headerHits.push({ r, s: b.s, e: b.e, name: `Block: ${b.name} · ${uplus(b.s)}–${uplus(b.e)}` })
      ctx.globalAlpha = a * (this.blockLit && !this.blockLit[i] ? 0.45 : 1)
      this.pill(b.name, r.x, at.y + drop, at.room - 2, style)
      blockHeaderEnd.set(i, { x: r.x + w, y: at.y })
    }

    if (sectionA > 0.01) {
      const secs = this.visibleSections(planes, vis).sort((p, q) => q.e - q.s - (p.e - p.s))
      for (const sec of secs) {
        // Section labels sit at the cell where the section starts, not following you around.
        const at = this.headerAnchor(sec.s, sec.e, top, left, false)
        if (!at) continue
        let x = at.x + 2
        // A section starting where its block starts follows the block's header.
        const bh = blockHeaderEnd.get(sec.block)
        if (bh && Math.abs(bh.y - at.y) < 1 && blocks[sec.block]?.s === sec.s) x = bh.x + 4
        const style = {
          size,
          bold: false,
          fill: "rgba(13, 16, 23, 0.92)",
          ink: "rgba(238, 241, 246, 0.95)",
          border: "rgba(255, 255, 255, 0.18)",
          dot: this.fullColors[required(valueOf[sec.s], "section's value")],
          // Leave it out rather than cut it to a stub; hovering a cell still names its section.
          minChars: Infinity
        }
        const room = at.x + at.room - x
        const w = this.measurePill(sec.title, room, style)
        if (!w) continue
        const r = { x, y: at.y + drop - h / 2, w, h }
        if (!free(r)) continue
        placed.push(r)
        if (sectionA > 0.5) {
          const range = sec.s === sec.e ? uplus(sec.s) : `${uplus(sec.s)}–${uplus(sec.e)}`
          this.headerHits.push({
            r,
            s: sec.s,
            e: sec.e,
            name: `Section: ${sec.title} · in ${blocks[sec.block]?.name ?? "no block"} · ${range}`
          })
        }
        ctx.globalAlpha = sectionA * (this.blockLit && !this.blockLit[sec.block] ? 0.45 : 1)
        this.pill(sec.title, x, at.y + drop, room, style)
      }
    }
    ctx.globalAlpha = 1
  }

  private renderMarkers(): void {
    const ctx = this.ctx
    const k = this.cam.k
    const mark = (cp: number, color: string, width: number, strong: boolean): void => {
      const c = cpToCell(cp)
      const x = this.sx(c.x),
        y = this.sy(c.y)
      if (k < 6) {
        // Too small to outline the cell: draw a ring around it.
        const r = strong ? 9 : 6
        ctx.beginPath()
        ctx.arc(x + k / 2, y + k / 2, r, 0, Math.PI * 2)
        ctx.strokeStyle = "rgba(0,0,0,0.6)"
        ctx.lineWidth = width + 2
        ctx.stroke()
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
        return
      }
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.strokeRect(x + width / 2, y + width / 2, k - width, k - width)
    }
    const ringA = 1 - smooth(4, 8, k)
    if (this.sparseLit.length && ringA > 0.01) {
      const vis = this.visibleWorld()
      ctx.globalAlpha = ringA
      const { valueOf } = required(this.mode, "colour mode")
      for (const cp of this.sparseLit) {
        const c = cpToCell(cp)
        if (c.x < vis.x - 1 || c.x > vis.x + vis.w + 1 || c.y < vis.y - 1 || c.y > vis.y + vis.h + 1) continue
        mark(cp, required(this.fullColors[required(valueOf[cp], "value")], "colour"), 1.5, false)
      }
      ctx.globalAlpha = 1
    }
    if (this.hovered >= 0 && this.hovered !== this.selected && k >= 6)
      mark(this.hovered, "rgba(255,255,255,0.6)", 1.5, false)
    if (this.selected !== undefined) {
      this.ctx.save()
      this.ctx.shadowColor = "rgba(120,180,255,0.9)"
      this.ctx.shadowBlur = 12
      mark(this.selected, "#ffffff", 2.5, true)
      this.ctx.restore()
    }
  }

  private renderAxes(planes: number[], vis: Rect, alpha: number): void {
    const ctx = this.ctx
    const k = this.cam.k
    const top = AXIS_TOP,
      left = AXIS_LEFT
    // Opaque gutters, so the numbers never sit over cells; cells slide under them like a
    // spreadsheet's headers, with a hairline edge.
    ctx.globalAlpha = alpha
    ctx.fillStyle = "#0b0e14"
    ctx.fillRect(0, 0, this.w, top)
    ctx.fillRect(0, top, left, this.h - top)
    ctx.fillStyle = "rgba(255,255,255,0.08)"
    ctx.fillRect(left - 1, top, 1, this.h - top)
    ctx.fillRect(left, top - 1, this.w - left, 1)
    ctx.font = `500 10px ${MONO_FONT}`
    ctx.fillStyle = "#8d96a8"
    ctx.textBaseline = "middle"
    ctx.textAlign = "center"
    const step = k < 22 ? 2 : 1
    for (const p of planes) {
      const o = planeOrigin(p)
      for (let lx = Math.max(0, Math.floor(vis.x - o.x)); lx <= Math.min(255, vis.x + vis.w - o.x); lx++) {
        if (lx % step) continue
        const x = this.sx(o.x + lx + 0.5)
        if (x < left + 8) continue
        ctx.fillText(lx.toString(16).toUpperCase().padStart(2, "0"), x, top / 2)
      }
    }
    ctx.textAlign = "right"
    for (const p of planes) {
      const o = planeOrigin(p)
      for (let ly = Math.max(0, Math.floor(vis.y - o.y)); ly <= Math.min(255, vis.y + vis.h - o.y); ly++) {
        const y = this.sy(o.y + ly + 0.5)
        if (y < top + 6) continue
        // Only label rows of planes overlapping the left edge, so labels aren't ambiguous.
        if (o.x > vis.x + vis.w * 0.5 || o.x + PLANE_SIZE < vis.x) continue
        ctx.fillText(hex((p << 16) | (ly << 8)).slice(0, -2) + "xx", left - 6, y)
      }
    }
    ctx.globalAlpha = 1
  }

  /**
   * Draw glyphs from cached tile images. Each level of the pyramid draws its tiles at a fixed
   * resolution; coarser levels cover more code points per tile, so a screen needs a few dozen
   * images at any zoom. We use the smallest resolution at least the current zoom (in device
   * pixels), so images only shrink. Tiles come from pre-built WebP files when there are some
   * (`pnpm tiles`), otherwise they're drawn here, nearest-first within a time budget per frame.
   * Until a tile is ready, the same area from another level stands in if it's cached.
   */
  private renderGlyphTiles(planes: number[], vis: Rect, alpha: number, ctx = this.ctx): void {
    const k = this.cam.k
    const dk = k * this.dpr
    const level = GLYPH_LEVELS.find((l) => l.res >= dk) ?? FINEST_GLYPH_LEVEL
    const T = level.span
    const others = GLYPH_LEVELS.filter((l) => l !== level).sort(
      (a, b) => Math.abs(Math.log(a.res / level.res)) - Math.abs(Math.log(b.res / level.res))
    )
    const missing: { key: string; p: number; ty: number; tx: number; d: number }[] = []
    const cx = vis.x + vis.w / 2,
      cy = vis.y + vis.h / 2
    const n = PLANE_SIZE / T
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = alpha
    for (const p of planes) {
      const o = planeOrigin(p)
      const tx0 = Math.max(0, Math.floor((vis.x - o.x) / T)),
        tx1 = Math.min(n - 1, Math.floor((vis.x + vis.w - o.x) / T))
      const ty0 = Math.max(0, Math.floor((vis.y - o.y) / T)),
        ty1 = Math.min(n - 1, Math.floor((vis.y + vis.h - o.y) / T))
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          // Whole-pixel edges, so neighbouring tiles meet without seams.
          const x = Math.round(this.sx(o.x + tx * T)),
            y = Math.round(this.sy(o.y + ty * T))
          const w = Math.round(this.sx(o.x + (tx + 1) * T)) - x,
            h = Math.round(this.sy(o.y + (ty + 1) * T)) - y
          const key = tileKey(level.res, p, ty, tx)
          const img = this.glyphTiles.get(key)
          if (img) {
            ctx.drawImage(img, x, y, w, h)
            continue
          }
          if (this.glyphTiles.has(key)) continue // cached as empty: nothing to draw here
          missing.push({ key, p, ty, tx, d: Math.hypot(o.x + (tx + 0.5) * T - cx, o.y + (ty + 0.5) * T - cy) })
          for (const alt of others) if (this.drawTileArea(ctx, alt, p, tx * T, ty * T, T, x, y, w, h)) break
        }
      }
    }
    ctx.globalAlpha = 1
    ctx.imageSmoothingEnabled = false
    if (!missing.length) return
    missing.sort((a, b) => a.d - b.d)

    // Pre-built tiles: fetch the nearest few at a time; the browser decodes them off-thread.
    if (this.staticTiles && level.prebuilt) {
      for (const t of missing) {
        if (this.tileLoads.has(t.key)) continue
        if (!this.staticTiles.has(`${level.res}/${t.p}/${t.ty}-${t.tx}`)) {
          this.storeGlyphTile(t.key, undefined)
          continue
        }
        if (this.tileLoads.size >= GLYPH_TILE_LOADS) break
        this.tileLoads.add(t.key)
        const img = new Image()
        img.src = `./tiles/${level.res}/${t.p}/${t.ty}-${t.tx}.webp?v=${this.staticTilesVersion}`
        img
          .decode()
          .then(
            () => this.storeGlyphTile(t.key, img),
            () => this.storeGlyphTile(t.key, undefined)
          )
          .finally(() => {
            this.tileLoads.delete(t.key)
            this.invalidate()
          })
      }
      return
    }

    // Otherwise draw them here, nearest the centre first, for a few milliseconds per frame.
    const start = performance.now()
    for (const t of missing) {
      if (performance.now() - start > GLYPH_TILE_BUDGET_MS) break
      // Fonts still loading for these rows: they invalidate when ready, and we come back.
      if (!this.tileFontsReady(t.p, t.ty * T, T)) continue
      this.storeGlyphTile(t.key, this.buildGlyphTile(t.p, t.ty, t.tx, level.res, T))
    }
    this.invalidate() // draw what was just built, and carry on with the rest
  }

  /**
   * Glyph texture for the normal view: draw the glyph tiles into an offscreen layer, keep only
   * their shapes filled with each cell's ink (scaled up from the ink bitmaps), and lay that over
   * the map. Dimmed and not-yet-encoded characters come out faint or absent for free.
   */
  private renderInkedGlyphs(planes: number[], vis: Rect, alpha: number): void {
    const W = this.canvas.width,
      H = this.canvas.height
    let layer = this.glyphLayer
    if (!layer || layer.width !== W || layer.height !== H) {
      layer = this.glyphLayer = document.createElement("canvas")
      layer.width = W
      layer.height = H
    }
    const lc = layer.getContext("2d")!
    lc.setTransform(1, 0, 0, 1, 0, 0)
    lc.globalCompositeOperation = "source-over"
    lc.clearRect(0, 0, W, H)
    lc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    this.renderGlyphTiles(planes, vis, 1, lc)
    // Colour emoji keep their colours: copy the glyphs aside before they're recoloured, to keep
    // just those cells of the copy below.
    const colourPlanes = planes.filter((p) => this.colourBitmaps[p])
    let cc: CanvasRenderingContext2D | undefined = undefined
    if (colourPlanes.length) {
      let cl = this.colourLayer
      if (!cl || cl.width !== W || cl.height !== H) {
        cl = this.colourLayer = document.createElement("canvas")
        cl.width = W
        cl.height = H
      }
      cc = cl.getContext("2d")!
      cc.globalCompositeOperation = "copy"
      cc.drawImage(layer, 0, 0)
      cc.globalCompositeOperation = "source-over"
    }
    // Every visible plane's ink goes into a second layer first: compositing with "source-in"
    // clears whatever lies outside the image drawn, so recolouring plane by plane would wipe out
    // all but the last plane.
    let inkLayer = this.inkLayer
    if (!inkLayer || inkLayer.width !== W || inkLayer.height !== H) {
      inkLayer = this.inkLayer = document.createElement("canvas")
      inkLayer.width = W
      inkLayer.height = H
    }
    const ic = inkLayer.getContext("2d")!
    ic.setTransform(1, 0, 0, 1, 0, 0)
    ic.clearRect(0, 0, W, H)
    ic.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ic.imageSmoothingEnabled = false
    const k = this.cam.k
    for (const p of planes) {
      const o = planeOrigin(p)
      const bitmap = this.inkBitmaps[p]
      if (bitmap) ic.drawImage(bitmap, this.sx(o.x), this.sy(o.y), PLANE_SIZE * k, PLANE_SIZE * k)
    }
    lc.setTransform(1, 0, 0, 1, 0, 0)
    lc.globalCompositeOperation = "source-in"
    lc.drawImage(inkLayer, 0, 0)
    lc.globalCompositeOperation = "source-over"
    if (cc) {
      // Reuse the ink layer for the colour cells' mask, and keep only those cells of the copy.
      ic.setTransform(1, 0, 0, 1, 0, 0)
      ic.clearRect(0, 0, W, H)
      ic.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      for (const p of colourPlanes) {
        const o = planeOrigin(p)
        ic.drawImage(this.colourBitmaps[p]!, this.sx(o.x), this.sy(o.y), PLANE_SIZE * k, PLANE_SIZE * k)
      }
      cc.globalCompositeOperation = "destination-in"
      cc.drawImage(inkLayer, 0, 0)
      cc.globalCompositeOperation = "source-over"
      lc.drawImage(this.colourLayer!, 0, 0)
    }
    const ctx = this.ctx
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = alpha
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
  }

  /**
   * Draw a square of code points (plane-local, `span` on a side) from another level's cached
   * tiles, as a stand-in. Returns false unless every tile it needs is cached.
   */
  private drawTileArea(
    ctx: CanvasRenderingContext2D,
    level: GlyphLevel,
    p: number,
    cx0: number,
    cy0: number,
    span: number,
    x: number,
    y: number,
    w: number,
    h: number
  ): boolean {
    const T = level.span
    if (T >= span) {
      const ty = Math.floor(cy0 / T),
        tx = Math.floor(cx0 / T)
      const key = tileKey(level.res, p, ty, tx)
      if (!this.glyphTiles.has(key)) return false
      const img = this.glyphTiles.get(key)
      if (img) {
        const r = level.res
        ctx.drawImage(img, (cx0 - tx * T) * r, (cy0 - ty * T) * r, span * r, span * r, x, y, w, h)
      }
      return true
    }
    const m = span / T
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        if (!this.glyphTiles.has(tileKey(level.res, p, cy0 / T + j, cx0 / T + i))) return false
      }
    }
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) {
        const img = this.glyphTiles.get(tileKey(level.res, p, cy0 / T + j, cx0 / T + i))
        if (img) ctx.drawImage(img, x + (w * i) / m, y + (h * j) / m, w / m, h / m)
      }
    }
    return true
  }

  /** Whether the fonts for `rows` rows of a plane, from row `y0`, are loaded (asking for them if not). */
  tileFontsReady(p: number, y0: number, rows: number): boolean {
    // The placeholders' labels use the monospace interface font.
    let ready = document.fonts.check(`12px ${MONO_FONT}`, "WJ")
    if (!ready) void document.fonts.load(`12px ${MONO_FONT}`, "WJ").then(() => this.invalidate())
    for (let r = 0; r < rows; r++) if (!this.ensureRowFonts((p << 16) | ((y0 + r) << 8))) ready = false
    return ready
  }

  /** Draw one tile: `span`×`span` code points at `res` pixels each. Null if there's nothing to draw. */
  buildGlyphTile(p: number, ty: number, tx: number, res: number, span: number): HTMLCanvasElement | undefined {
    if (res < GLYPH_DRAW_MIN) {
      // Fonts don't draw usefully at a pixel or two: draw at a legible size and average it down.
      const big = this.buildGlyphTile(p, ty, tx, GLYPH_DRAW_MIN, span)
      if (!big) return undefined
      const cv = document.createElement("canvas")
      cv.width = cv.height = span * res
      const c = cv.getContext("2d")!
      c.imageSmoothingEnabled = true
      c.imageSmoothingQuality = "high"
      c.drawImage(big, 0, 0, cv.width, cv.height)
      big.width = big.height = 0
      return cv
    }
    const data = this.data
    let cv: HTMLCanvasElement | undefined = undefined
    let c: CanvasRenderingContext2D | undefined = undefined
    let lastFont = ""
    for (let y = 0; y < span; y++) {
      for (let x = 0; x < span; x++) {
        const cp = (p << 16) | ((ty * span + y) << 8) | (tx * span + x)
        const str = displayString(data, cp)
        if (!str && !data.isAssigned(cp)) continue
        if (!c) {
          cv = document.createElement("canvas")
          cv.width = cv.height = span * res
          c = cv.getContext("2d")!
          c.textAlign = "center"
          c.textBaseline = "middle"
          c.fillStyle = "#eef1f6"
        }
        // Same size and position as on the cards, so the switch to real rendering is seamless.
        if (!str) {
          // No visible glyph (spaces, format characters, private use…): the cards' placeholder.
          this.drawSpecial(cp, x * res, res, y * res + res * 0.53, 1, false, c)
          c.fillStyle = "#eef1f6"
          lastFont = ""
          continue
        }
        const font = `${res * 0.5}px ${data.glyphFamily(cp)}`
        if (font !== lastFont) c.font = lastFont = font
        c.globalAlpha = 1
        c.fillText(str, x * res + res / 2, y * res + res * 0.53)
      }
    }
    return cv
  }

  private storeGlyphTile(key: string, img: HTMLCanvasElement | HTMLImageElement | undefined): void {
    this.glyphTiles.set(key, img)
    if (img) this.glyphTileBytes += img.width * img.height * 4
    // Evict the oldest tiles past the memory cap.
    for (const [old, oldImg] of this.glyphTiles) {
      if (this.glyphTileBytes <= GLYPH_TILE_MAX_BYTES) break
      if (old === key) continue
      this.glyphTiles.delete(old)
      if (oldImg) {
        this.glyphTileBytes -= oldImg.width * oldImg.height * 4
        if (oldImg instanceof HTMLCanvasElement) oldImg.width = oldImg.height = 0 // release it now
      }
    }
  }

  /** Look for pre-built glyph tiles (see scripts/build_tiles.ts). */
  private async loadTileManifest(): Promise<void> {
    try {
      const r = await fetch("./tiles/manifest.json")
      if (!r.ok) return
      const m = (await r.json()) as { version: string; tiles: string[] }
      this.staticTiles = new Set(m.tiles)
      this.staticTilesVersion = m.version
      // Forget tiles drawn here at pre-built levels, in favour of the files.
      for (const key of [...this.glyphTiles.keys()]) {
        if (GLYPH_LEVELS.some((l) => l.prebuilt && key.startsWith(`${l.res}:`))) this.glyphTiles.delete(key)
      }
      this.invalidate()
    } catch {
      // No pre-built tiles: draw them in the browser.
    }
  }

  private renderPreview(vis: Rect, pv: Preview): void {
    const ctx = this.ctx
    const { k, cx, cy } = this.cam
    const dpr = this.dpr
    ctx.save()
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - cx * k), dpr * (this.h / 2 - cy * k))
    // Dim everything outside the range.
    const outside = new Path2D()
    outside.rect(vis.x - 1, vis.y - 1, vis.w + 2, vis.h + 2)
    outside.addPath(pv.path)
    ctx.fillStyle = `rgba(8, 10, 14, ${pv.soft ? 0.4 : pv === this.pinned ? 0.55 : 0.62})`
    ctx.fill(outside, "evenodd")
    // A glowing outline, at least a few pixels across even when the range is tiny on screen.
    ctx.shadowColor = "rgba(120, 180, 255, 0.95)"
    ctx.shadowBlur = 14
    ctx.strokeStyle = "#ffffff"
    ctx.lineJoin = "round"
    ctx.lineWidth = 2.5 / k
    ctx.stroke(pv.path)
    ctx.restore()
    if (pv.rect.w * k < 10 && pv.rect.h * k < 10) {
      // Too small to see: ring it.
      ctx.beginPath()
      ctx.arc(this.sx(pv.rect.x + pv.rect.w / 2), this.sy(pv.rect.y + pv.rect.h / 2), 12, 0, Math.PI * 2)
      ctx.strokeStyle = "#ffffff"
      ctx.lineWidth = 2
      ctx.stroke()
    }
    // Its full name: over the hovered header, or just above the range's top-left corner.
    // Kept clear of the axis gutters when they're showing.
    const axes = k > AXIS_START
    const x = pv.labelAt ? pv.labelAt.x : clamp(this.sx(pv.rect.x), axes ? AXIS_LEFT + 6 : 8, this.w - 40)
    const y = pv.labelAt ? pv.labelAt.y : clamp(this.sy(pv.rect.y) - 14, axes ? AXIS_TOP + 14 : 14, this.h - 14)
    this.pill(pv.name, x, y, this.w - x - 8, {
      size: 12.5,
      bold: true,
      fill: "rgba(240, 243, 248, 0.97)",
      ink: "#0d1017",
      border: "rgba(8, 10, 14, 0.55)"
    })
  }

  // ---------------------------------------------------------------------------
  // Input

  private bindInput(): void {
    const el = this.canvas
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean; id: number } | undefined = undefined
    const pointers = new Map<number, { x: number; y: number }>()
    /** The two pointers of a pinch (only called while there are exactly two). */
    const pinchPointers = (): [{ x: number; y: number }, { x: number; y: number }] => {
      const [a, b] = pointers.values()
      return [required(a, "first pointer"), required(b, "second pointer")]
    }
    let pinch: { d: number; k: number; wx: number; wy: number } | undefined = undefined

    const local = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const r = el.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }

    const onDown = (e: PointerEvent): void => {
      el.setPointerCapture(e.pointerId)
      const p = local(e)
      pointers.set(e.pointerId, p)
      if (pointers.size === 2) {
        const [a, b] = pinchPointers()
        const mid = this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2)
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: this.cam.k, wx: mid.x, wy: mid.y }
        drag = undefined
        return
      }
      this.anim = undefined
      drag = { x: p.x, y: p.y, cx: this.cam.cx, cy: this.cam.cy, moved: false, id: e.pointerId }
    }
    const onMove = (e: PointerEvent): void => {
      const p = local(e)
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p)
      if (pinch && pointers.size === 2) {
        const [a, b] = pinchPointers()
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const k = clamp(pinch.k * (d / pinch.d), this.fitK() * 0.6, 800)
        const mx = (a.x + b.x) / 2,
          my = (a.y + b.y) / 2
        this.setCamera({ k, cx: pinch.wx - (mx - this.w / 2) / k, cy: pinch.wy - (my - this.h / 2) / k })
        this.noteMoving()
        return
      }
      if (drag && drag.id === e.pointerId) {
        const dx = p.x - drag.x,
          dy = p.y - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true
        if (drag.moved) {
          el.style.cursor = "grabbing"
          this.setCamera({ k: this.cam.k, cx: drag.cx - dx / this.cam.k, cy: drag.cy - dy / this.cam.k })
          this.noteMoving()
        }
        return
      }
      this.updateHover(p.x, p.y, e.clientX, e.clientY)
    }
    const onUp = (e: PointerEvent): void => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = undefined
      if (drag && drag.id === e.pointerId) {
        if (!drag.moved && !this.pure) {
          const p = local(e)
          const hit = this.headerAt(p.x, p.y)
          if (hit) {
            // Clicking a block or section header takes you to it.
            this.showRange(hit.s, hit.e)
          } else {
            const w = this.toWorld(p.x, p.y)
            const cp = cellToCp(w.x, w.y)
            if (this.pinned && (cp < this.pinned.s || cp > this.pinned.e)) this.clearPinned()
            this.cb.onSelect(cp >= 0 ? cp : undefined)
          }
        }
        drag = undefined
        el.style.cursor = ""
      }
    }
    const onLeave = (): void => {
      if (this.headerHover) this.setPreview(undefined)
      el.style.cursor = ""
      if (this.hovered !== -1) {
        this.hovered = -1
        this.invalidate()
        this.cb.onHover(-1, 0, 0)
      }
    }
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      this.anim = undefined
      this.noteMoving()
      const p = local(e)
      // Pinch gestures arrive as ctrl+wheel. Trackpad scrolls (small or horizontal deltas) pan;
      // mouse wheels (large line-sized steps) zoom.
      const isTrackpadPan = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0.5 || Math.abs(e.deltaY) < 40)
      if (isTrackpadPan) {
        this.setCamera({
          k: this.cam.k,
          cx: this.cam.cx + e.deltaX / this.cam.k,
          cy: this.cam.cy + e.deltaY / this.cam.k
        })
      } else {
        const dy = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY
        const factor = Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0025))
        const before = this.toWorld(p.x, p.y)
        const k = clamp(this.cam.k * factor, this.fitK() * 0.6, 800)
        this.setCamera({ k, cx: before.x - (p.x - this.w / 2) / k, cy: before.y - (p.y - this.h / 2) / k })
      }
      this.updateHover(p.x, p.y, e.clientX, e.clientY)
    }
    const onDbl = (e: MouseEvent): void => {
      const p = local(e)
      const w = this.toWorld(p.x, p.y)
      const k = this.cam.k * (e.shiftKey ? 0.4 : 2.5)
      this.flyTo({ k, cx: w.x - (p.x - this.w / 2) / k, cy: w.y - (p.y - this.h / 2) / k })
    }

    el.addEventListener("pointerdown", onDown)
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointercancel", onUp)
    el.addEventListener("pointerleave", onLeave)
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("dblclick", onDbl)
    this.disposers.push(() => {
      el.removeEventListener("pointerdown", onDown)
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerup", onUp)
      el.removeEventListener("pointercancel", onUp)
      el.removeEventListener("pointerleave", onLeave)
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("dblclick", onDbl)
    })
  }

  /**
   * While you pan or zoom by hand, mark the map area as moving (the class `moving`), so the
   * floating panels can fade out of the way until you stop.
   */
  private noteMoving(): void {
    const area = this.canvas.parentElement
    if (!area) return
    area.classList.add("moving")
    clearTimeout(this.movingTimer)
    this.movingTimer = window.setTimeout(() => area.classList.remove("moving"), 450)
  }

  private headerAt(x: number, y: number): { r: Rect; s: number; e: number; name: string } | undefined {
    return this.headerHits.findLast(({ r }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  }

  private updateHover(x: number, y: number, clientX: number, clientY: number): void {
    if (this.pure) return
    // Over a block or section header: show its full name and point out its extent.
    const hit = this.headerAt(x, y)
    if (hit) {
      this.setPreview({
        s: hit.s,
        e: hit.e,
        name: hit.name,
        labelAt: { x: hit.r.x, y: hit.r.y + hit.r.h / 2 },
        soft: true
      })
      this.headerHover = true
      this.canvas.style.cursor = "pointer"
      if (this.hovered !== -1) {
        this.hovered = -1
        this.invalidate()
      }
      this.cb.onHover(-1, 0, 0)
      return
    }
    if (this.headerHover) {
      this.setPreview(undefined)
      this.canvas.style.cursor = ""
    }
    const w = this.toWorld(x, y)
    const cp = cellToCp(w.x, w.y)
    if (cp !== this.hovered) {
      this.hovered = cp
      this.invalidate()
    }
    this.cb.onHover(cp, clientX, clientY)
  }
}

/** Zoom (CSS px per cell) at which block clicks land: glyph cards are fully drawn. */
const READ_K = 40

const makePreview = (range: {
  s: number
  e: number
  name: string
  labelAt?: { x: number; y: number }
  soft?: boolean
}): Preview => ({ ...range, path: outlinePath(range.s, range.e), rect: rangeRect(range.s, range.e) })

interface Preview {
  s: number
  e: number
  name: string
  path: Path2D
  rect: Rect
  /** Where to put the name label (screen), if not above the range. */
  labelAt?: { x: number; y: number }
  /** Lighter dimming, for previews from hovering the map itself. */
  soft?: boolean
}

interface PillStyle {
  size: number
  bold: boolean
  fill: string
  ink: string
  dot?: string
  border?: string
  minChars?: number
}

/** Truncate text with an ellipsis to fit a width in the current font. */
const ellipsize = (ctx: CanvasRenderingContext2D, text: string, maxW: number): string => {
  if (ctx.measureText(text).width <= maxW) return text
  let lo = 0,
    hi = text.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(text.slice(0, mid).trimEnd() + "…").width <= maxW) lo = mid
    else hi = mid - 1
  }
  return lo ? text.slice(0, lo).trimEnd() + "…" : ""
}
