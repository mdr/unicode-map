import { planeOrigin, PLANE_SIZE, type Rect } from "../layout"
import type { PlaneBitmaps } from "./bitmaps"
import type { GlyphTiles } from "./glyphTiles"
import type { Viewport } from "./viewport"

/** A canvas the given size: `cv` if it already is, else a new one. */
const sized = (cv: HTMLCanvasElement | undefined, W: number, H: number): HTMLCanvasElement => {
  if (cv?.width === W && cv.height === H) return cv
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  return c
}

/** Clear a context's whole canvas, then leave it drawing in CSS pixels. */
const reset = (c: CanvasRenderingContext2D, W: number, H: number, dpr: number): void => {
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.clearRect(0, 0, W, H)
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
}

/** Draw one per-plane bitmap for each plane, stretched over the plane. */
const drawPlanes = (
  c: CanvasRenderingContext2D,
  vp: Viewport,
  planes: number[],
  bitmaps: (HTMLCanvasElement | undefined)[]
): void => {
  const k = vp.cam.k
  for (const p of planes) {
    const o = planeOrigin(p)
    const bitmap = bitmaps[p]
    if (bitmap) c.drawImage(bitmap, vp.sx(o.x), vp.sy(o.y), PLANE_SIZE * k, PLANE_SIZE * k)
  }
}

/**
 * Glyph texture for the normal view: draw the glyph tiles into an offscreen layer, keep only
 * their shapes filled with each cell's ink (scaled up from the ink bitmaps), and lay that over
 * the map. Dimmed and not-yet-encoded characters come out faint or absent for free.
 */
export class InkedGlyphs {
  private glyphLayer: HTMLCanvasElement | undefined = undefined
  private inkLayer: HTMLCanvasElement | undefined = undefined
  private colourLayer: HTMLCanvasElement | undefined = undefined

  render(
    ctx: CanvasRenderingContext2D,
    vp: Viewport,
    tiles: GlyphTiles,
    bm: PlaneBitmaps,
    planes: number[],
    vis: Rect,
    alpha: number
  ): void {
    const W = ctx.canvas.width,
      H = ctx.canvas.height
    const layer = (this.glyphLayer = sized(this.glyphLayer, W, H))
    const lc = layer.getContext("2d")!
    lc.globalCompositeOperation = "source-over"
    reset(lc, W, H, vp.dpr)
    tiles.render(lc, vp, planes, vis, 1)
    // Colour emoji keep their colours: copy the glyphs aside before they're recoloured, to keep
    // just those cells of the copy below.
    const colourPlanes = planes.filter((p) => bm.colour[p])
    const cc = colourPlanes.length ? this.copyGlyphs(layer, W, H) : undefined
    // Every visible plane's ink goes into a second layer first: compositing with "source-in"
    // clears whatever lies outside the image drawn, so recolouring plane by plane would wipe out
    // all but the last plane.
    const inkLayer = (this.inkLayer = sized(this.inkLayer, W, H))
    const ic = inkLayer.getContext("2d")!
    reset(ic, W, H, vp.dpr)
    ic.imageSmoothingEnabled = false
    drawPlanes(ic, vp, planes, bm.ink)
    lc.setTransform(1, 0, 0, 1, 0, 0)
    lc.globalCompositeOperation = "source-in"
    lc.drawImage(inkLayer, 0, 0)
    lc.globalCompositeOperation = "source-over"
    if (cc) {
      // Reuse the ink layer for the colour cells' mask, and keep only those cells of the copy.
      reset(ic, W, H, vp.dpr)
      drawPlanes(ic, vp, colourPlanes, bm.colour)
      cc.globalCompositeOperation = "destination-in"
      cc.drawImage(inkLayer, 0, 0)
      cc.globalCompositeOperation = "source-over"
      lc.drawImage(cc.canvas, 0, 0)
    }
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = alpha
    ctx.drawImage(layer, 0, 0)
    ctx.restore()
  }

  /** Copy the glyph layer into the colour layer; returns its context. */
  private copyGlyphs(layer: HTMLCanvasElement, W: number, H: number): CanvasRenderingContext2D {
    const cl = (this.colourLayer = sized(this.colourLayer, W, H))
    const cc = cl.getContext("2d")!
    cc.globalCompositeOperation = "copy"
    cc.drawImage(layer, 0, 0)
    cc.globalCompositeOperation = "source-over"
    return cc
  }
}
