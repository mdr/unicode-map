import { required } from "../../required"
import { cpToCell, type Rect } from "../layout"
import { AXIS_LEFT, AXIS_START, AXIS_TOP, clamp, smooth } from "./constants"
import { pill } from "./pill"
import type { Preview } from "./preview"
import type { Scene } from "./scene"

/** Outline a code point's cell, or ring it when cells are too small to outline. */
const mark = (sc: Scene, cp: number, color: string, width: number, strong: boolean): void => {
  const { ctx, vp } = sc
  const k = vp.cam.k
  const c = cpToCell(cp)
  const x = vp.sx(c.x),
    y = vp.sy(c.y)
  if (k < 6) {
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

/** Rings around the few matches of a sparse highlight, at low zoom. */
const markSparse = (sc: Scene, alpha: number): void => {
  const vis = sc.vp.visibleWorld()
  const { valueOf } = required(sc.st.mode, "colour mode")
  sc.ctx.globalAlpha = alpha
  for (const cp of sc.bm.sparseLit) {
    const c = cpToCell(cp)
    if (c.x < vis.x - 1 || c.x > vis.x + vis.w + 1 || c.y < vis.y - 1 || c.y > vis.y + vis.h + 1) continue
    mark(sc, cp, required(sc.pal.fullColors[required(valueOf[cp], "value")], "colour"), 1.5, false)
  }
  sc.ctx.globalAlpha = 1
}

/** The hovered and selected code points, and sparse highlight matches. */
export const renderMarkers = (sc: Scene): void => {
  const ctx = sc.ctx
  const k = sc.vp.cam.k
  const { hovered, selected } = sc.st
  const ringA = 1 - smooth(4, 8, k)
  if (sc.bm.sparseLit.length && ringA > 0.01) markSparse(sc, ringA)
  if (hovered >= 0 && hovered !== selected && k >= 6) mark(sc, hovered, "rgba(255,255,255,0.6)", 1.5, false)
  if (selected !== undefined) {
    ctx.save()
    ctx.shadowColor = "rgba(120,180,255,0.9)"
    ctx.shadowBlur = 12
    mark(sc, selected, "#ffffff", 2.5, true)
    ctx.restore()
  }
}

/** Dim everything outside a range and give it a glowing outline. */
const outlineRange = (sc: Scene, vis: Rect, pv: Preview): void => {
  const ctx = sc.ctx
  ctx.save()
  sc.vp.worldTransform(ctx)
  const outside = new Path2D()
  outside.rect(vis.x - 1, vis.y - 1, vis.w + 2, vis.h + 2)
  outside.addPath(pv.path)
  ctx.fillStyle = `rgba(8, 10, 14, ${pv.soft ? 0.4 : pv === sc.st.pinned ? 0.55 : 0.62})`
  ctx.fill(outside, "evenodd")
  // A glowing outline, at least a few pixels across even when the range is tiny on screen.
  ctx.shadowColor = "rgba(120, 180, 255, 0.95)"
  ctx.shadowBlur = 14
  ctx.strokeStyle = "#ffffff"
  ctx.lineJoin = "round"
  ctx.lineWidth = 2.5 / sc.vp.cam.k
  ctx.stroke(pv.path)
  ctx.restore()
}

/** A range pointed out from the sidebar or a header: the rest dimmed, the range outlined and named. */
export const renderPreview = (sc: Scene, vis: Rect, pv: Preview): void => {
  const { ctx, vp } = sc
  const k = vp.cam.k
  outlineRange(sc, vis, pv)
  if (pv.rect.w * k < 10 && pv.rect.h * k < 10) {
    // Too small to see: ring it.
    ctx.beginPath()
    ctx.arc(vp.sx(pv.rect.x + pv.rect.w / 2), vp.sy(pv.rect.y + pv.rect.h / 2), 12, 0, Math.PI * 2)
    ctx.strokeStyle = "#ffffff"
    ctx.lineWidth = 2
    ctx.stroke()
  }
  // Its full name: over the hovered header, or just above the range's top-left corner.
  // Kept clear of the axis gutters when they're showing.
  const axes = k > AXIS_START
  const x = pv.labelAt ? pv.labelAt.x : clamp(vp.sx(pv.rect.x), axes ? AXIS_LEFT + 6 : 8, vp.w - 40)
  const y = pv.labelAt ? pv.labelAt.y : clamp(vp.sy(pv.rect.y) - 14, axes ? AXIS_TOP + 14 : 14, vp.h - 14)
  pill(ctx, pv.name, x, y, vp.w - x - 8, {
    size: 12.5,
    bold: true,
    fill: "rgba(240, 243, 248, 0.97)",
    ink: "#0d1017",
    border: "rgba(8, 10, 14, 0.55)"
  })
}
