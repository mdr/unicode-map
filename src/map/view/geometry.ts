import { hex, type UnicodeData } from "../../data/unicode"
import { required } from "../../required"
import { rangeOutline, rangeRect, type Rect } from "../layout"

/** The outline of a range of code points, as a closed path in world coordinates. */
export const outlinePath = (start: number, end: number): Path2D => {
  const path = new Path2D()
  const pts = rangeOutline(start, end)
  const [x0, y0] = required(pts[0], `outline of ${hex(start)}–${hex(end)}`)
  path.moveTo(x0, y0)
  for (const [x, y] of pts.slice(1)) path.lineTo(x, y)
  path.closePath()
  return path
}

export interface Section {
  s: number
  e: number
  title: string
  path: Path2D
  plane: number
  block: number
  bbox: Rect
}

/** Outlines, bounds and first ages of the blocks and chart sections, computed once. */
export interface MapGeometry {
  blockPaths: Path2D[]
  blockBBox: Rect[]
  blockFirstAge: number[]
  sections: Section[]
  sectionFirstAge: number[]
}

/** The earliest age index of any assigned code point in a..b. */
const firstAge = (data: UnicodeData, a: number, b: number): number => {
  let min = Infinity
  for (let cp = a; cp <= b; cp++) {
    // Per code point, and cp is below MAX_CP: ageIdx has an entry for it.
    const age = data.ageIdx[cp]!
    if (data.isAssigned(cp) && age < min) min = age
  }
  return min
}

export const buildGeometry = (data: UnicodeData): MapGeometry => {
  const blocks = data.meta.blocks
  const sections = data.meta.sections.map(([s, e, title]) => ({
    s,
    e,
    title,
    path: outlinePath(s, e),
    plane: s >> 16,
    block: required(data.blockIdx[s], `block index of ${hex(s)}`),
    bbox: rangeRect(s, e)
  }))
  return {
    blockPaths: blocks.map((b) => outlinePath(b.s, b.e)),
    blockFirstAge: blocks.map((b) => firstAge(data, b.s, b.e)),
    sections,
    sectionFirstAge: sections.map((sec) => firstAge(data, sec.s, sec.e)),
    blockBBox: blocks.map((b) => rangeRect(b.s, b.e))
  }
}
