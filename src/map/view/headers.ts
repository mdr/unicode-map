import { uplus } from "../../data/unicode"
import { required } from "../../required"
import { planeOrigin, type Rect } from "../layout"
import { BLOCK_LABEL_FULL, BLOCK_LABEL_START, clamp, HEX_START, smooth } from "./constants"
import type { Section } from "./geometry"
import { visibleSections } from "./outlines"
import { measurePill, pill, type PillStyle } from "./pill"
import { blockExists, type FrameView, type Scene } from "./scene"
import type { CodePoint } from "../../units"

/** Where a header sits on screen, and the room it has to its right. */
interface Anchor {
  x: number
  y: number
  room: number
}

/** Header layout for this frame: sizes, the area clear of the axes, and the rects placed so far. */
interface HeaderLayout {
  top: number
  left: number
  size: number
  h: number
  /** How far below the row edge headers sit. */
  drop: number
  placed: Rect[]
  /** Right edge of the block header drawn at each block's start, for its first section to follow. */
  blockHeaderEnd: Map<number, { x: number; y: number }>
}

/**
 * Where a header for code points s..e goes: at the cell where the range starts, scrolling away
 * with it. Returns screen coordinates and the room available to the right, or undefined.
 */
const headerAnchor = (sc: Scene, s: CodePoint, e: CodePoint, top: number, left: number): Anchor | undefined => {
  const vp = sc.vp
  const o = planeOrigin(s >> 16)
  const r0 = (s >> 8) & 255,
    r1 = (e >> 8) & 255
  const y = vp.sy(o.y + r0),
    x = vp.sx(o.x + (s & 255))
  if (y < top || y > vp.h || x < left - 1 || x > vp.w) return undefined
  const x1 = vp.sx(o.x + (r0 === r1 ? (e & 255) + 1 : 256))
  return { x, y, room: x1 - x }
}

/** Whether a rect is clear of the headers placed so far (with a little margin). */
const free = (lay: HeaderLayout, r: Rect): boolean =>
  !lay.placed.some((q) => r.x < q.x + q.w + 3 && r.x + r.w + 3 > q.x && r.y < q.y + q.h + 2 && r.y + r.h + 2 > q.y)

const outOfView = (bb: Rect, vis: Rect): boolean =>
  bb.x > vis.x + vis.w || bb.x + bb.w < vis.x || bb.y > vis.y + vis.h || bb.y + bb.h < vis.y

/** Block names, in a light pill at the cell where each block starts. */
const blockHeaders = (sc: Scene, { planes, vis }: FrameView, lay: HeaderLayout): void => {
  const { ctx, data } = sc
  const planeSet = new Set(planes)
  const blockLit = sc.bm.blockLit
  const a = smooth(BLOCK_LABEL_START, BLOCK_LABEL_FULL, sc.vp.cam.k)
  for (const [i, b] of data.meta.blocks.entries()) {
    if (!planeSet.has(b.s >> 16) || !blockExists(sc, i) || a <= 0.01) continue
    if (outOfView(required(sc.geo.blockBBox[i], "block bounds"), vis)) continue
    const at = headerAnchor(sc, b.s, b.e, lay.top, lay.left)
    if (!at) continue
    const style: PillStyle = {
      size: lay.size + 0.5,
      bold: true,
      minChars: 10,
      fill: "rgba(240, 243, 248, 0.97)",
      ink: "#0d1017",
      dot: required(data.meta.regions[b.region], "block's region").color,
      border: "rgba(8, 10, 14, 0.55)"
    }
    const w = measurePill(ctx, b.name, at.room - 2, style)
    const r = { x: at.x + 2, y: at.y + lay.drop - lay.h / 2, w, h: lay.h }
    if (!w || !free(lay, r)) continue
    lay.placed.push(r)
    if (a > 0.5) sc.st.headerHits.push({ r, s: b.s, e: b.e, name: `Block: ${b.name} · ${uplus(b.s)}–${uplus(b.e)}` })
    ctx.globalAlpha = a * (blockLit && !blockLit[i] ? 0.45 : 1)
    pill(ctx, b.name, r.x, at.y + lay.drop, at.room - 2, style)
    lay.blockHeaderEnd.set(i, { x: r.x + w, y: at.y })
  }
}

/** Where a section's header starts: after its block's header if the section starts where its block does. */
const sectionX = (lay: HeaderLayout, sec: Section, at: Anchor, blockStart: number | undefined): number => {
  const bh = lay.blockHeaderEnd.get(sec.block)
  return bh && Math.abs(bh.y - at.y) < 1 && blockStart === sec.s ? bh.x + 4 : at.x + 2
}

/** Chart section titles, in dark pills, longest sections first. */
const sectionHeaders = (sc: Scene, fv: FrameView, lay: HeaderLayout, sectionA: number): void => {
  const { ctx, data } = sc
  const blocks = data.meta.blocks
  const blockLit = sc.bm.blockLit
  const valueOf = required(sc.st.mode, "colour mode").valueOf
  const secs = visibleSections(sc, fv).sort((p, q) => q.e - q.s - (p.e - p.s))
  for (const sec of secs) {
    const at = headerAnchor(sc, sec.s, sec.e, lay.top, lay.left)
    if (!at) continue
    const x = sectionX(lay, sec, at, blocks[sec.block]?.s)
    const style: PillStyle = {
      size: lay.size,
      bold: false,
      fill: "rgba(13, 16, 23, 0.92)",
      ink: "rgba(238, 241, 246, 0.95)",
      border: "rgba(255, 255, 255, 0.18)",
      dot: sc.pal.fullColors[required(valueOf[sec.s], "section's value")],
      // Leave it out rather than cut it to a stub; hovering a cell still names its section.
      minChars: Infinity
    }
    const room = at.x + at.room - x
    const w = measurePill(ctx, sec.title, room, style)
    const r = { x, y: at.y + lay.drop - lay.h / 2, w, h: lay.h }
    if (!w || !free(lay, r)) continue
    lay.placed.push(r)
    if (sectionA > 0.5) {
      const range = sec.s === sec.e ? uplus(sec.s) : `${uplus(sec.s)}–${uplus(sec.e)}`
      const name = `Section: ${sec.title} · in ${blocks[sec.block]?.name ?? "no block"} · ${range}`
      sc.st.headerHits.push({ r, s: sec.s, e: sec.e, name })
    }
    ctx.globalAlpha = sectionA * (blockLit && !blockLit[sec.block] ? 0.45 : 1)
    pill(ctx, sec.title, x, at.y + lay.drop, room, style)
  }
}

/**
 * Block and section headers that sit on the top edge of where each starts, like the headings
 * in the code charts. Headers are placed in priority order (blocks, then longer sections first)
 * and any that would overlap one already placed are skipped, so busy areas thin out instead of
 * piling up.
 */
export const renderHeaders = (sc: Scene, fv: FrameView, sectionA: number, axisA: number): void => {
  const k = sc.vp.cam.k
  const size = clamp(9.5 + (k - 14) * 0.05, 10, 12.5)
  const h = Math.round(size * 1.6)
  const lay: HeaderLayout = {
    top: axisA > 0.01 ? 26 : 4,
    left: axisA > 0.01 ? 64 : 4,
    size,
    h,
    // Straddle the row edge until code points appear at the bottom of cards, then sit just inside.
    drop: smooth(HEX_START * 0.85, HEX_START * 1.15, k) * (h / 2 + Math.max(1, k * 0.04)),
    placed: [],
    blockHeaderEnd: new Map()
  }
  blockHeaders(sc, fv, lay)
  if (sectionA > 0.01) sectionHeaders(sc, fv, lay, sectionA)
  sc.ctx.globalAlpha = 1
}
