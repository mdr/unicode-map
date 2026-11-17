import { interpolateZoom } from "d3-interpolate"
import { type UnicodeData, uplus } from "../data/unicode"
import type { ColorMode } from "./colorModes"
import { cellToCp, cpToCell, type Rect, WORLD } from "./layout"
import { PlaneBitmaps } from "./view/bitmaps"
import { AXIS_LEFT, clamp, READ_K } from "./view/constants"
import { RowFonts } from "./view/fonts"
import { buildGeometry } from "./view/geometry"
import { buildGlyphTile } from "./view/glyphTileDraw"
import { GlyphTiles } from "./view/glyphTiles"
import { InkedGlyphs } from "./view/inkedGlyphs"
import { bindInput, type InputHost } from "./view/input"
import { buildPalette, EMPTY_PALETTE } from "./view/palette"
import { type HeaderHit, makePreview, type PreviewRange } from "./view/preview"
import { renderFrame } from "./view/render"
import type { Scene, ViewState } from "./view/scene"
import { type Insets, Viewport } from "./view/viewport"

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

/** Ease in and out (cubic), for camera flights. */
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export class MapView {
  private ctx: CanvasRenderingContext2D
  private vp = new Viewport()
  private st: ViewState = {
    mode: undefined,
    highlight: undefined,
    mask: undefined,
    asOf: undefined,
    pure: false,
    glyphTexture: true,
    selected: undefined,
    hovered: -1,
    preview: undefined,
    pinned: undefined,
    headerHits: [],
    headerHover: false
  }
  private sc: Scene
  private fonts: RowFonts
  private dirty = true
  private raf = 0
  private anim: { start: number; dur: number; f: (t: number) => Camera } | undefined = undefined
  private resizeObs: ResizeObserver
  private disposers: (() => void)[] = []

  constructor(
    private canvas: HTMLCanvasElement,
    private data: UnicodeData,
    private cb: MapCallbacks
  ) {
    this.ctx = canvas.getContext("2d")!
    const invalidate = (): void => this.invalidate()
    this.fonts = new RowFonts(data, invalidate)
    const tiles = new GlyphTiles(data, this.fonts, invalidate)
    void tiles.loadManifest()
    this.sc = {
      ctx: this.ctx,
      data,
      vp: this.vp,
      st: this.st,
      bm: new PlaneBitmaps(),
      pal: EMPTY_PALETTE,
      geo: buildGeometry(data),
      fonts: this.fonts,
      tiles,
      inked: new InkedGlyphs(),
      colourFont: data.meta.fonts.findIndex((f) => /Color Emoji/i.test(f.family))
    }
    this.resizeObs = new ResizeObserver(() => this.resize())
    this.resizeObs.observe(canvas)
    this.resize()
    this.disposers.push(bindInput(canvas, this.inputHost()))
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop)
      this.step(now)
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
    return { ...this.vp.cam }
  }
  get animating(): boolean {
    return this.anim !== undefined
  }
  /**
   * The code point at the centre of the visible map area (clear of the floating top bar), or -1
   * if that's between planes. Fitted views centre their target here, not on the canvas centre.
   */
  centreCp(): number {
    return this.vp.centreCp()
  }
  get size(): { w: number; h: number } {
    return { w: this.vp.w, h: this.vp.h }
  }

  setMode(mode: ColorMode): void {
    this.st.mode = mode
    this.rebuildBitmaps()
  }

  setHighlight(values: Set<number> | undefined): void {
    this.st.highlight = values
    this.rebuildBitmaps()
  }

  setGlyphTexture(on: boolean): void {
    this.st.glyphTexture = on
    this.invalidate()
  }

  setPure(on: boolean): void {
    if (on === this.st.pure) return
    this.st.pure = on
    // Without the floating top bar, fitted views can use the whole canvas.
    this.insets = on ? { l: 16, t: 16, r: 16, b: 16 } : { l: 16, t: 92, r: 16, b: 16 }
    this.st.preview = undefined
    this.st.pinned = undefined
    this.st.headerHits = []
    this.st.headerHover = false
    this.st.hovered = -1
    this.canvas.style.cursor = ""
    this.rebuildBitmaps()
  }

  /** Point out a range (a plane or block hovered in the sidebar): dim the rest and outline it. */
  setPreview(range: PreviewRange | undefined): void {
    const st = this.st
    st.headerHover = false
    if (range && st.preview && range.s === st.preview.s && range.e === st.preview.e) {
      st.preview.labelAt = range.labelAt
      this.invalidate()
      return
    }
    if (!range && !st.preview) return
    st.preview = range ? makePreview(range) : undefined
    this.invalidate()
  }

  /**
   * Take the user to a block or section and keep it pointed out. Blocks are long strips one or
   * more 256-cell rows wide, so fitting a whole one usually leaves its cells too small to read:
   * instead, zoom to where glyphs are legible and line up the range's start, unless it fits
   * whole at that size. Showing the same range again fits all of it.
   */
  showRange(s: number, e: number): void {
    const vp = this.vp
    const again = this.st.pinned?.s === s && this.st.pinned.e === e
    this.st.preview = undefined
    this.st.headerHover = false
    this.st.pinned = makePreview({ s, e, name: this.rangeName(s, e) })
    const r = this.st.pinned.rect
    const pad = 1.6
    const fit = clamp(Math.min(vp.availW() / (r.w * pad), vp.availH() / (r.h * pad)), 0, 90)
    if (again || fit >= READ_K) {
      this.flyToRect(r, { pad, maxK: 90 })
      return
    }
    const k = clamp(vp.cam.k, READ_K, 72)
    const m = 28 // screen margin around the range, in CSS pixels
    const fitsW = r.w * k <= vp.availW() - 2 * m
    const fitsH = r.h * k <= vp.availH() - 2 * m
    const centre = vp.centreFor(r.x + r.w / 2, r.y + r.h / 2, k)
    // A range that fits vertically sits in the upper part of the view, clear of the legend
    // floating at the bottom.
    const midY = vp.insets.t + Math.max(vp.availH() * 0.33, (r.h * k) / 2 + m)
    this.flyTo({
      k,
      // Line the start up just right of the row numbers, which are showing at this zoom.
      cx: fitsW ? centre.cx : r.x - (Math.max(vp.insets.l, AXIS_LEFT) + m - vp.w / 2) / k,
      cy: fitsH ? r.y + r.h / 2 - (midY - vp.h / 2) / k : r.y - (vp.insets.t + m - vp.h / 2) / k
    })
  }

  /** Stop pointing out the clicked block or section. */
  clearPinned(): void {
    if (!this.st.pinned) return
    this.st.pinned = undefined
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
    this.st.mask = mask
    this.rebuildBitmaps()
  }

  /** Show Unicode as of an age index (see meta.ages), or undefined for the current version. */
  setAsOf(ageIndex: number | undefined): void {
    if (ageIndex === this.st.asOf) return
    this.st.asOf = ageIndex
    this.rebuildBitmaps()
  }

  setSelected(cp: number | undefined): void {
    const pinned = this.st.pinned
    this.st.selected = cp
    // Picking a character outside the pointed-out block or section lets it go.
    if (cp !== undefined && pinned && (cp < pinned.s || cp > pinned.e)) this.st.pinned = undefined
    this.invalidate()
  }

  setCamera(cam: Camera, cancelAnim = true): void {
    if (cancelAnim) this.anim = undefined
    const kMin = this.fitK() * 0.6
    this.vp.cam = { cx: cam.cx, cy: cam.cy, k: clamp(cam.k, kMin, 800) }
    this.invalidate()
    this.cb.onCamera(this.camera)
  }

  /** Screen margins covered by floating UI, respected when fitting things into view. */
  get insets(): Insets {
    return this.vp.insets
  }
  set insets(v: Insets) {
    this.vp.insets = v
  }

  fitK(): number {
    return this.vp.fitK()
  }

  overview(animate = true): void {
    this.clearPinned()
    this.flyToRect(WORLD, { animate, pad: 1 })
  }

  /** Fly so that rect (world) fills the view. */
  flyToRect(r: Rect, opts: { animate?: boolean; pad?: number; maxK?: number } = {}): void {
    const vp = this.vp
    const pad = opts.pad ?? 1.15
    const k = clamp(Math.min(vp.availW() / (r.w * pad), vp.availH() / (r.h * pad)), 0, opts.maxK ?? 140)
    this.flyTo({ ...vp.centreFor(r.x + r.w / 2, r.y + r.h / 2, k), k }, opts.animate ?? true)
  }

  flyTo(target: Camera, animate = true): void {
    if (!animate || this.vp.w === 0) {
      this.setCamera(target)
      return
    }
    const from = this.vp.cam
    const w = this.vp.w
    const interp = interpolateZoom([from.cx, from.cy, w / from.k], [target.cx, target.cy, w / target.k])
    const dur = clamp(interp.duration * 0.9, 350, 1800)
    this.anim = {
      start: performance.now(),
      dur,
      f: (t) => {
        const [cx, cy, vw] = interp(t)
        return { cx, cy, k: this.vp.w / vw }
      }
    }
    this.invalidate()
  }

  /** Bring a code point into view, zooming in to glyph level if needed. */
  focusCp(cp: number, opts: { zoom?: boolean; animate?: boolean } = {}): void {
    const { cam, w, h } = this.vp
    const c = cpToCell(cp)
    const k = opts.zoom === false ? cam.k : Math.max(cam.k, 72)
    const sx = (c.x + 0.5 - cam.cx) * k + w / 2
    const sy = (c.y + 0.5 - cam.cy) * k + h / 2
    const margin = Math.min(140, w / 4)
    if (k === cam.k && sx > margin && sx < w - margin && sy > margin && sy < h - margin) return
    if (k === cam.k && Math.abs(sx - w / 2) < w * 1.5 && Math.abs(sy - h / 2) < h * 1.5) {
      // Nearby: pan just enough.
      const nx = clamp(sx, margin, w - margin)
      const ny = clamp(sy, margin, h - margin)
      this.flyTo({ cx: cam.cx + (sx - nx) / k, cy: cam.cy + (sy - ny) / k, k })
      return
    }
    this.flyTo({ ...this.vp.centreFor(c.x + 0.5, c.y + 0.5, k), k }, opts.animate ?? true)
  }

  zoomBy(factor: number): void {
    this.flyTo({ ...this.vp.cam, k: this.vp.cam.k * factor })
  }

  invalidate(): void {
    this.dirty = true
  }

  /** Screen point → world point. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return this.vp.toWorld(sx, sy)
  }

  /** Whether the fonts for `rows` rows of a plane, from row `y0`, are loaded (asking for them if not). */
  tileFontsReady(p: number, y0: number, rows: number): boolean {
    return this.fonts.tilesReady(p, y0, rows)
  }

  /** Draw one glyph tile: `span`×`span` code points at `res` pixels each (for scripts/build_tiles.ts). */
  buildGlyphTile(p: number, ty: number, tx: number, res: number, span: number): HTMLCanvasElement | undefined {
    return buildGlyphTile(this.data, p, ty, tx, res, span)
  }

  // ---------------------------------------------------------------------------
  // Internals

  /** One animation frame: advance any camera flight, and draw if anything changed. */
  private step(now: number): void {
    if (this.anim) {
      const t = clamp((now - this.anim.start) / this.anim.dur, 0, 1)
      this.setCamera(this.anim.f(easeInOut(t)), false)
      if (t >= 1) this.anim = undefined
    }
    if (this.dirty) {
      this.dirty = false
      this.render()
    }
  }

  private resize(): void {
    const vp = this.vp
    const r = this.canvas.getBoundingClientRect()
    const first = vp.w === 0
    const [ow, oh] = [vp.w, vp.h]
    vp.dpr = window.devicePixelRatio || 1
    vp.w = r.width
    vp.h = r.height
    // The canvas grows and shrinks from its bottom-right (the sidebar is on the right), so keep
    // what's at its top-left in place: toggling pure view or resizing the window doesn't shift the map.
    if (!first && vp.w > 0 && (ow !== vp.w || oh !== vp.h)) {
      const { k, cx, cy } = vp.cam
      this.anim = undefined
      this.setCamera({ k, cx: cx + (vp.w - ow) / 2 / k, cy: cy + (vp.h - oh) / 2 / k })
    }
    this.canvas.width = Math.round(r.width * vp.dpr)
    this.canvas.height = Math.round(r.height * vp.dpr)
    if (first && vp.w > 0) {
      const k = this.fitK()
      this.setCamera({ ...vp.centreFor(WORLD.x + WORLD.w / 2, WORLD.y + WORLD.h / 2, k), k })
    }
    this.invalidate()
  }

  private rebuildBitmaps(): void {
    const { mode, pure } = this.st
    if (!mode) return
    const highlight = pure ? undefined : this.st.highlight
    this.sc.pal = buildPalette(mode, pure, highlight)
    this.sc.bm.rebuild(this.data, mode.valueOf, this.sc.pal, {
      highlight: highlight !== undefined,
      mask: pure ? undefined : this.st.mask,
      asOf: pure ? undefined : this.st.asOf,
      colourFont: this.sc.colourFont
    })
    this.invalidate()
  }

  private render(): void {
    if (!this.st.mode || this.vp.w === 0) return
    renderFrame(this.sc)
  }

  // ---------------------------------------------------------------------------
  // Input

  private inputHost(): InputHost {
    return {
      vp: this.vp,
      stopAnimation: () => {
        this.anim = undefined
      },
      setCamera: (cam) => this.setCamera(cam),
      flyTo: (cam) => this.flyTo(cam),
      hoverAt: (x, y, clientX, clientY) => this.updateHover(x, y, clientX, clientY),
      clickAt: (x, y) => this.clickAt(x, y),
      leave: () => this.leave()
    }
  }

  private headerAt(x: number, y: number): HeaderHit | undefined {
    return this.st.headerHits.findLast(({ r }) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  }

  private clickAt(x: number, y: number): void {
    if (this.st.pure) return
    const hit = this.headerAt(x, y)
    // Clicking a block or section header takes you to it.
    if (hit) {
      this.showRange(hit.s, hit.e)
      return
    }
    const w = this.toWorld(x, y)
    const cp = cellToCp(w.x, w.y)
    const pinned = this.st.pinned
    if (pinned && (cp < pinned.s || cp > pinned.e)) this.clearPinned()
    this.cb.onSelect(cp >= 0 ? cp : undefined)
  }

  private setHovered(cp: number): void {
    if (cp === this.st.hovered) return
    this.st.hovered = cp
    this.invalidate()
  }

  private leave(): void {
    if (this.st.headerHover) this.setPreview(undefined)
    this.canvas.style.cursor = ""
    if (this.st.hovered !== -1) {
      this.setHovered(-1)
      this.cb.onHover(-1, 0, 0)
    }
  }

  private updateHover(x: number, y: number, clientX: number, clientY: number): void {
    if (this.st.pure) return
    // Over a block or section header: show its full name and point out its extent.
    const hit = this.headerAt(x, y)
    if (hit) {
      const { r, s, e, name } = hit
      this.setPreview({ s, e, name, labelAt: { x: r.x, y: r.y + r.h / 2 }, soft: true })
      this.st.headerHover = true
      this.canvas.style.cursor = "pointer"
      this.setHovered(-1)
      this.cb.onHover(-1, 0, 0)
      return
    }
    if (this.st.headerHover) {
      this.setPreview(undefined)
      this.canvas.style.cursor = ""
    }
    const w = this.toWorld(x, y)
    const cp = cellToCp(w.x, w.y)
    this.setHovered(cp)
    this.cb.onHover(cp, clientX, clientY)
  }
}
