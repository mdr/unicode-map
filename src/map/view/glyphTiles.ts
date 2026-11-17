import type { UnicodeData } from "../../data/unicode"
import { planeOrigin, PLANE_SIZE, type Rect } from "../layout"
import type { RowFonts } from "./fonts"
import { FINEST_GLYPH_LEVEL, GLYPH_LEVELS, type GlyphLevel, tileKey } from "./glyphLevels"
import { buildGlyphTile } from "./glyphTileDraw"
import type { Viewport } from "./viewport"
import type { Plane } from "../../units"

/** Pre-built tile files fetched at once. */
const GLYPH_TILE_LOADS = 12
const GLYPH_TILE_BUDGET_MS = 10
const GLYPH_TILE_MAX_BYTES = 192 * 1024 * 1024

type TileImage = HTMLCanvasElement | HTMLImageElement

interface MissingTile {
  key: string
  p: Plane
  ty: number
  tx: number
  /** Distance from the view's centre (world units), to fill in nearest first. */
  d: number
}

/** A screen rect, in whole pixels. */
interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Pre-rendered glyph tiles (squares of code points at a few resolutions), cached, for drawing
 * glyphs while they're too small for live font rendering to be worth it.
 */
export class GlyphTiles {
  private tiles = new Map<string, TileImage | undefined>()
  private bytes = 0
  /** Pre-built tile files ("res/plane/ty-tx"), if there are any, and their version for cache busting. */
  private staticTiles: Set<string> | undefined = undefined
  private staticTilesVersion = ""
  private loads = new Set<string>()

  constructor(
    private data: UnicodeData,
    private fonts: RowFonts,
    private invalidate: () => void
  ) {}

  /** Look for pre-built glyph tiles (see scripts/build_tiles.ts). */
  async loadManifest(): Promise<void> {
    try {
      const r = await fetch("./tiles/manifest.json")
      if (!r.ok) return
      const m = (await r.json()) as { version: string; tiles: string[] }
      this.staticTiles = new Set(m.tiles)
      this.staticTilesVersion = m.version
      // Forget tiles drawn here at pre-built levels, in favour of the files.
      for (const key of [...this.tiles.keys()]) {
        if (GLYPH_LEVELS.some((l) => l.prebuilt && key.startsWith(`${l.res}:`))) this.tiles.delete(key)
      }
      this.invalidate()
    } catch {
      // No pre-built tiles: draw them in the browser.
    }
  }

  /**
   * Draw glyphs from cached tile images. Each level of the pyramid draws its tiles at a fixed
   * resolution; coarser levels cover more code points per tile, so a screen needs a few dozen
   * images at any zoom. We use the smallest resolution at least the current zoom (in device
   * pixels), so images only shrink. Tiles come from pre-built WebP files when there are some
   * (`pnpm tiles`), otherwise they're drawn here, nearest-first within a time budget per frame.
   * Until a tile is ready, the same area from another level stands in if it's cached.
   */
  render(ctx: CanvasRenderingContext2D, vp: Viewport, planes: number[], vis: Rect, alpha: number): void {
    const dk = vp.cam.k * vp.dpr
    const level = GLYPH_LEVELS.find((l) => l.res >= dk) ?? FINEST_GLYPH_LEVEL
    const others = GLYPH_LEVELS.filter((l) => l !== level).sort(
      (a, b) => Math.abs(Math.log(a.res / level.res)) - Math.abs(Math.log(b.res / level.res))
    )
    const missing: MissingTile[] = []
    ctx.imageSmoothingEnabled = true
    ctx.globalAlpha = alpha
    for (const p of planes) this.drawPlane(ctx, vp, level, others, p, vis, missing)
    ctx.globalAlpha = 1
    ctx.imageSmoothingEnabled = false
    if (!missing.length) return
    missing.sort((a, b) => a.d - b.d)
    // Pre-built tiles: fetch the nearest few at a time; the browser decodes them off-thread.
    if (this.staticTiles && level.prebuilt) this.fetchTiles(this.staticTiles, level, missing)
    else this.buildTiles(level, missing)
  }

  private drawPlane(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    level: GlyphLevel,
    others: GlyphLevel[],
    p: Plane,
    vis: Rect,
    missing: MissingTile[]
  ): void {
    const T = level.span
    const n = PLANE_SIZE / T
    const cx = vis.x + vis.w / 2,
      cy = vis.y + vis.h / 2
    const o = planeOrigin(p)
    const tx0 = Math.max(0, Math.floor((vis.x - o.x) / T)),
      tx1 = Math.min(n - 1, Math.floor((vis.x + vis.w - o.x) / T))
    const ty0 = Math.max(0, Math.floor((vis.y - o.y) / T)),
      ty1 = Math.min(n - 1, Math.floor((vis.y + vis.h - o.y) / T))
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        // Whole-pixel edges, so neighbouring tiles meet without seams.
        const x = Math.round(vp.sx(o.x + tx * T)),
          y = Math.round(vp.sy(o.y + ty * T))
        const r = { x, y, w: Math.round(vp.sx(o.x + (tx + 1) * T)) - x, h: Math.round(vp.sy(o.y + (ty + 1) * T)) - y }
        const key = tileKey(level.res, p, ty, tx)
        const img = this.tiles.get(key)
        if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h)
        else if (!this.tiles.has(key)) {
          // Not cached as empty either: fill it in, showing another level meanwhile.
          missing.push({ key, p, ty, tx, d: Math.hypot(o.x + (tx + 0.5) * T - cx, o.y + (ty + 0.5) * T - cy) })
          this.drawStandIn(ctx, others, p, tx * T, ty * T, T, r)
        }
      }
    }
  }

  private drawStandIn(
    ctx: CanvasRenderingContext2D,
    others: GlyphLevel[],
    p: Plane,
    cx0: number,
    cy0: number,
    span: number,
    r: PixelRect
  ): void {
    for (const alt of others) {
      const drawn =
        alt.span >= span
          ? this.drawFromCoarser(ctx, alt, p, cx0, cy0, span, r)
          : this.drawFromFiner(ctx, alt, p, cx0, cy0, span, r)
      if (drawn) return
    }
  }

  /**
   * Draw a square of code points (plane-local, `span` on a side) from part of a coarser level's
   * cached tile. Returns false unless that tile is cached.
   */
  private drawFromCoarser(
    ctx: CanvasRenderingContext2D,
    level: GlyphLevel,
    p: Plane,
    cx0: number,
    cy0: number,
    span: number,
    r: PixelRect
  ): boolean {
    const T = level.span
    const ty = Math.floor(cy0 / T),
      tx = Math.floor(cx0 / T)
    const key = tileKey(level.res, p, ty, tx)
    if (!this.tiles.has(key)) return false
    const img = this.tiles.get(key)
    const res = level.res
    if (img) ctx.drawImage(img, (cx0 - tx * T) * res, (cy0 - ty * T) * res, span * res, span * res, r.x, r.y, r.w, r.h)
    return true
  }

  /** The same from a finer level's tiles: returns false unless every tile it needs is cached. */
  private drawFromFiner(
    ctx: CanvasRenderingContext2D,
    level: GlyphLevel,
    p: Plane,
    cx0: number,
    cy0: number,
    span: number,
    r: PixelRect
  ): boolean {
    const T = level.span
    const m = span / T
    const keys: string[] = []
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) keys.push(tileKey(level.res, p, cy0 / T + j, cx0 / T + i))
    if (!keys.every((key) => this.tiles.has(key))) return false
    keys.forEach((key, n) => {
      const img = this.tiles.get(key)
      const i = n % m,
        j = Math.floor(n / m)
      if (img) ctx.drawImage(img, r.x + (r.w * i) / m, r.y + (r.h * j) / m, r.w / m, r.h / m)
    })
    return true
  }

  private fetchTiles(staticTiles: Set<string>, level: GlyphLevel, missing: MissingTile[]): void {
    for (const t of missing) {
      if (this.loads.has(t.key)) continue
      if (!staticTiles.has(`${level.res}/${t.p}/${t.ty}-${t.tx}`)) {
        this.store(t.key, undefined)
        continue
      }
      if (this.loads.size >= GLYPH_TILE_LOADS) break
      this.loads.add(t.key)
      const img = new Image()
      img.src = `./tiles/${level.res}/${t.p}/${t.ty}-${t.tx}.webp?v=${this.staticTilesVersion}`
      img
        .decode()
        .then(
          () => this.store(t.key, img),
          () => this.store(t.key, undefined)
        )
        .finally(() => {
          this.loads.delete(t.key)
          this.invalidate()
        })
    }
  }

  /** Draw missing tiles here, nearest the centre first, for a few milliseconds per frame. */
  private buildTiles(level: GlyphLevel, missing: MissingTile[]): void {
    const T = level.span
    const start = performance.now()
    for (const t of missing) {
      if (performance.now() - start > GLYPH_TILE_BUDGET_MS) break
      // Fonts still loading for these rows: they invalidate when ready, and we come back.
      if (!this.fonts.tilesReady(t.p, t.ty * T, T)) continue
      this.store(t.key, buildGlyphTile(this.data, t.p, t.ty, t.tx, level.res, T))
    }
    this.invalidate() // draw what was just built, and carry on with the rest
  }

  private store(key: string, img: TileImage | undefined): void {
    this.tiles.set(key, img)
    if (img) this.bytes += img.width * img.height * 4
    // Evict the oldest tiles past the memory cap.
    for (const [old, oldImg] of this.tiles) {
      if (this.bytes <= GLYPH_TILE_MAX_BYTES) break
      if (old === key) continue
      this.tiles.delete(old)
      if (oldImg) this.release(oldImg)
    }
  }

  private release(img: TileImage): void {
    this.bytes -= img.width * img.height * 4
    if (img instanceof HTMLCanvasElement) img.width = img.height = 0 // release it now
  }
}
