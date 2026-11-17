import { required } from "../../required"
import { planeOrigin, PLANE_SIZE, type Rect } from "../layout"
import { CARD_START, clamp, GRID_START } from "./constants"
import type { Section } from "./geometry"
import { blockExists, type FrameView, type Scene } from "./scene"

/** Thin lines between all cells of the visible part of each plane. */
const cellLines = (sc: Scene, { planes, vis }: FrameView): void => {
  const { ctx, vp } = sc
  for (const p of planes) {
    const o = planeOrigin(p)
    const x0 = Math.max(o.x, Math.floor(vis.x))
    const x1 = Math.min(o.x + PLANE_SIZE, Math.ceil(vis.x + vis.w))
    const y0 = Math.max(o.y, Math.floor(vis.y))
    const y1 = Math.min(o.y + PLANE_SIZE, Math.ceil(vis.y + vis.h))
    const top = vp.sy(Math.max(o.y, vis.y)),
      bottom = vp.sy(Math.min(o.y + PLANE_SIZE, vis.y + vis.h))
    const left = vp.sx(Math.max(o.x, vis.x)),
      right = vp.sx(Math.min(o.x + PLANE_SIZE, vis.x + vis.w))
    for (let x = x0; x <= x1; x++) {
      const s = Math.round(vp.sx(x)) + 0.5
      ctx.moveTo(s, top)
      ctx.lineTo(s, bottom)
    }
    for (let y = y0; y <= y1; y++) {
      const s = Math.round(vp.sy(y)) + 0.5
      ctx.moveTo(left, s)
      ctx.lineTo(right, s)
    }
  }
}

/** Stronger lines every 16 cells. */
const sixteenLines = (sc: Scene, { planes, vis }: FrameView): void => {
  const { ctx, vp } = sc
  for (const p of planes) {
    const o = planeOrigin(p)
    for (let x = o.x; x <= o.x + PLANE_SIZE; x += 16) {
      if (x < vis.x - 1 || x > vis.x + vis.w + 1) continue
      ctx.moveTo(vp.sx(x), vp.sy(o.y))
      ctx.lineTo(vp.sx(x), vp.sy(o.y + PLANE_SIZE))
    }
    for (let y = o.y; y <= o.y + PLANE_SIZE; y += 16) {
      if (y < vis.y - 1 || y > vis.y + vis.h + 1) continue
      ctx.moveTo(vp.sx(o.x), vp.sy(y))
      ctx.lineTo(vp.sx(o.x + PLANE_SIZE), vp.sy(y))
    }
  }
}

export const renderGrid = (sc: Scene, fv: FrameView, alpha: number): void => {
  const ctx = sc.ctx
  ctx.strokeStyle = `rgba(8, 10, 14, ${0.55 * alpha})`
  ctx.lineWidth = 1
  ctx.beginPath()
  cellLines(sc, fv)
  ctx.stroke()
  if (sc.vp.cam.k > GRID_START * 1.5) {
    ctx.strokeStyle = `rgba(8, 10, 14, ${0.8 * alpha})`
    ctx.lineWidth = 1.5
    ctx.beginPath()
    sixteenLines(sc, fv)
    ctx.stroke()
  }
}

/** Stroke the outlines of the blocks in these planes, in the current style. */
const strokeBlocks = (sc: Scene, planeSet: Set<number>): void => {
  sc.data.meta.blocks.forEach((b, i) => {
    if (planeSet.has(b.s >> 16) && blockExists(sc, i)) sc.ctx.stroke(required(sc.geo.blockPaths[i], "block path"))
  })
}

/** The hovered block's outline at low zoom, and the selected character's block. */
const strokeCurrentBlocks = (sc: Scene): void => {
  const { ctx, data } = sc
  const { hovered, selected } = sc.st
  const k = sc.vp.cam.k
  const hb = hovered >= 0 ? (data.blockIdx[hovered] ?? -1) : -1
  if (hb >= 0 && k < CARD_START) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)"
    ctx.lineWidth = 2 / k
    ctx.stroke(required(sc.geo.blockPaths[hb], "block path"))
  }
  const sb = selected !== undefined ? (data.blockIdx[selected] ?? -1) : -1
  if (sb >= 0 && sb !== hb) {
    ctx.strokeStyle = "rgba(255,255,255,0.55)"
    ctx.lineWidth = 1.5 / k
    ctx.stroke(required(sc.geo.blockPaths[sb], "block path"))
  }
}

export const renderBlockOutlines = (sc: Scene, planes: number[], cardT: number): void => {
  const ctx = sc.ctx
  const k = sc.vp.cam.k
  const planeSet = new Set(planes)
  ctx.save()
  sc.vp.worldTransform(ctx)
  ctx.lineJoin = "round"
  const base = clamp(0.5 - k * 0.004, 0.25, 0.5)
  ctx.strokeStyle = `rgba(8, 10, 14, ${base + 0.25})`
  ctx.lineWidth = Math.max(1.2, Math.min(3, k * 0.08)) / k
  strokeBlocks(sc, planeSet)
  if (cardT > 0.01) {
    // Among the cards the gaps are dark, so block boundaries become light lines.
    ctx.strokeStyle = `rgba(214, 222, 236, ${0.62 * cardT})`
    ctx.lineWidth = Math.max(2, k * 0.06) / k
    strokeBlocks(sc, planeSet)
  }
  strokeCurrentBlocks(sc)
  ctx.restore()
}

const overlaps = (r: Rect, vis: Rect): boolean =>
  r.x < vis.x + vis.w && r.x + r.w > vis.x && r.y < vis.y + vis.h && r.y + r.h > vis.y

/** Chart sections in view (and in the version shown). */
export const visibleSections = (sc: Scene, { planes, vis }: FrameView): Section[] => {
  const planeSet = new Set(planes)
  const asOf = sc.st.asOf
  return sc.geo.sections.filter(
    (sec, i) =>
      planeSet.has(sec.plane) &&
      (asOf === undefined || required(sc.geo.sectionFirstAge[i], "section's first age") <= asOf) &&
      overlaps(sec.bbox, vis)
  )
}

/** Thin dividers between chart sections, among the cards. */
export const renderSectionDividers = (sc: Scene, fv: FrameView, alpha: number, cardT: number): void => {
  const ctx = sc.ctx
  const k = sc.vp.cam.k
  ctx.save()
  sc.vp.worldTransform(ctx)
  // Dark lines on the coloured cells; light ones once cards have dark gaps between them.
  const secs = visibleSections(sc, fv)
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
