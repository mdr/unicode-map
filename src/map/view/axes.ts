import { hex } from "../../data/unicode"
import { planeOrigin, PLANE_SIZE } from "../layout"
import { AXIS_LEFT, AXIS_TOP, MONO_FONT } from "./constants"
import type { FrameView, Scene } from "./scene"

/** Column numbers (00–FF) along the top. */
const columnLabels = (sc: Scene, { planes, vis }: FrameView): void => {
  const { ctx, vp } = sc
  const step = vp.cam.k < 22 ? 2 : 1
  ctx.textAlign = "center"
  for (const p of planes) {
    const o = planeOrigin(p)
    for (let lx = Math.max(0, Math.floor(vis.x - o.x)); lx <= Math.min(255, vis.x + vis.w - o.x); lx++) {
      const x = vp.sx(o.x + lx + 0.5)
      if (lx % step || x < AXIS_LEFT + 8) continue
      ctx.fillText(lx.toString(16).toUpperCase().padStart(2, "0"), x, AXIS_TOP / 2)
    }
  }
}

/** Row numbers (U+xxxx with the last two digits xx) down the left. */
const rowLabels = (sc: Scene, { planes, vis }: FrameView): void => {
  const { ctx, vp } = sc
  ctx.textAlign = "right"
  for (const p of planes) {
    const o = planeOrigin(p)
    // Only label rows of planes overlapping the left edge, so labels aren't ambiguous.
    if (o.x > vis.x + vis.w * 0.5 || o.x + PLANE_SIZE < vis.x) continue
    for (let ly = Math.max(0, Math.floor(vis.y - o.y)); ly <= Math.min(255, vis.y + vis.h - o.y); ly++) {
      const y = vp.sy(o.y + ly + 0.5)
      if (y < AXIS_TOP + 6) continue
      ctx.fillText(hex((p << 16) | (ly << 8)).slice(0, -2) + "xx", AXIS_LEFT - 6, y)
    }
  }
}

/** The sticky axes, over everything. */
export const renderAxes = (sc: Scene, fv: FrameView, alpha: number): void => {
  const { ctx, vp } = sc
  const top = AXIS_TOP,
    left = AXIS_LEFT
  // Opaque gutters, so the numbers never sit over cells; cells slide under them like a
  // spreadsheet's headers, with a hairline edge.
  ctx.globalAlpha = alpha
  ctx.fillStyle = "#0b0e14"
  ctx.fillRect(0, 0, vp.w, top)
  ctx.fillRect(0, top, left, vp.h - top)
  ctx.fillStyle = "rgba(255,255,255,0.08)"
  ctx.fillRect(left - 1, top, 1, vp.h - top)
  ctx.fillRect(left, top - 1, vp.w - left, 1)
  ctx.font = `500 10px ${MONO_FONT}`
  ctx.fillStyle = "#8d96a8"
  ctx.textBaseline = "middle"
  columnLabels(sc, fv)
  rowLabels(sc, fv)
  ctx.globalAlpha = 1
}
