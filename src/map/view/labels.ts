import { hex, planeName } from "../../data/unicode"
import { labelRect, planeOrigin, PLANE_SIZE, type Rect } from "../layout"
import { clamp, LANDMARK_END, smooth, UI_FONT } from "./constants"
import { blockExists, type FrameView, type Scene } from "./scene"

/**
 * Fit a label into a world rect clipped to the view: returns screen centre and font size,
 * or undefined if it doesn't fit at the minimum size. Leaves the font set.
 */
const fitLabel = (
  sc: Scene,
  text: string,
  r: Rect,
  vis: Rect,
  maxFs: number,
  heightFrac: number
): { cx: number; cy: number; fs: number } | undefined => {
  const { ctx, vp } = sc
  const x0 = Math.max(r.x, vis.x),
    y0 = Math.max(r.y, vis.y)
  const x1 = Math.min(r.x + r.w, vis.x + vis.w),
    y1 = Math.min(r.y + r.h, vis.y + vis.h)
  if (x1 <= x0 || y1 <= y0) return undefined
  const sw = (x1 - x0) * vp.cam.k,
    sh = (y1 - y0) * vp.cam.k
  let fs = Math.min(sh * heightFrac, maxFs)
  if (fs < 8) return undefined
  ctx.font = `600 ${fs}px ${UI_FONT}`
  const tw = ctx.measureText(text).width
  if (tw > sw * 0.9) {
    fs *= (sw * 0.9) / tw
    if (fs < 8) return undefined
    ctx.font = `600 ${fs}px ${UI_FONT}`
  }
  return { cx: vp.sx((x0 + x1) / 2), cy: vp.sy((y0 + y1) / 2), fs }
}

const haloText = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fs: number,
  fill: string
): void => {
  ctx.strokeStyle = "rgba(8,10,14,0.75)"
  ctx.lineWidth = Math.max(2, fs * 0.22)
  ctx.strokeText(text, x, y)
  ctx.fillStyle = fill
  ctx.fillText(text, x, y)
}

/** Landmark names: big block names centred in blocks of several rows, while zoomed out. */
export const renderBlockLabels = (sc: Scene, { planes, vis }: FrameView): void => {
  const ctx = sc.ctx
  const planeSet = new Set(planes)
  const fade = 1 - smooth(LANDMARK_END * 0.8, LANDMARK_END, sc.vp.cam.k)
  const blockLit = sc.bm.blockLit
  ctx.lineJoin = "round"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  for (const [i, b] of sc.data.meta.blocks.entries()) {
    if (!planeSet.has(b.s >> 16) || !blockExists(sc, i)) continue
    const a = fade * (blockLit && !blockLit[i] ? 0.3 : 1)
    if (a <= 0.01) continue
    const lr = labelRect(b.s, b.e)
    // Landmarks only: a one-row strip can't carry a name at a readable size.
    if (lr.h < 2) continue
    const fit = fitLabel(sc, b.name, lr, vis, 30, 0.42)
    if (!fit) continue
    ctx.globalAlpha = a * clamp((fit.fs - 8) / 3, 0, 1)
    haloText(ctx, b.name, fit.cx, fit.cy, fit.fs, "#ffffff")
  }
  ctx.globalAlpha = 1
}

/** The subtitle beside a plane's title: as much of its name and range as fits in `maxW`. */
const planeSubtitle = (ctx: CanvasRenderingContext2D, p: number, maxW: number): string => {
  const [name, abbr] = planeName(p)
  const sub = `${name}${abbr ? ` (${abbr})` : ""}`
  const range = `U+${hex(p << 16)}–U+${hex((p << 16) | 0xffff)}`
  let text = `${sub} · ${range}`
  if (ctx.measureText(text).width > maxW) text = sub
  if (ctx.measureText(text).width > maxW) text = abbr || ""
  return text
}

/** A plane's frame, and its title above it. */
export const renderPlaneFrame = (sc: Scene, p: number): void => {
  const { ctx, vp } = sc
  const o = planeOrigin(p)
  const x = vp.sx(o.x),
    y = vp.sy(o.y),
    s = PLANE_SIZE * vp.cam.k
  ctx.strokeStyle = "rgba(255,255,255,0.12)"
  ctx.lineWidth = 1
  ctx.strokeRect(Math.round(x) - 0.5, Math.round(y) - 0.5, Math.round(s) + 1, Math.round(s) + 1)

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
  ctx.fillText(planeSubtitle(ctx, p, s - tw - fs), x + tw + fs * 0.5, ty)
}
