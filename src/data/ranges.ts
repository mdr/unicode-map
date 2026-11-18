import type { UnicodeData } from "./unicode"
import type { BlockIndex, CodePoint, Plane } from "../units"

/** What a selected range is: a plane, a block, or a code chart section. */
export enum RangeKind {
  PLANE = "plane",
  BLOCK = "block",
  SECTION = "section"
}

/**
 * A plane, block or section picked out as a whole, to show in the sidebar. The kind is kept
 * because one range can be two things: plane 15 is also the block Supplementary Private Use
 * Area-A.
 */
export interface RangeSelection {
  kind: RangeKind
  s: CodePoint
  e: CodePoint
}

export const planeRange = (p: Plane): RangeSelection => ({ kind: RangeKind.PLANE, s: p << 16, e: (p << 16) | 0xffff })

export const blockRange = (data: UnicodeData, i: BlockIndex): RangeSelection => {
  const b = data.blockAt(i)
  return { kind: RangeKind.BLOCK, s: b.s, e: b.e }
}

export const sectionRange = (s: CodePoint, e: CodePoint): RangeSelection => ({ kind: RangeKind.SECTION, s, e })

/** The range a kind and start (as in the URL: a plane's number, or where a block or section starts) name. */
export const findRange = (data: UnicodeData, kind: RangeKind, s: number): RangeSelection | undefined => {
  if (kind === RangeKind.PLANE) return s >= 0 && s <= 16 ? planeRange(s) : undefined
  if (kind === RangeKind.BLOCK) {
    const i = data.meta.blocks.findIndex((b) => b.s === s)
    return i >= 0 ? blockRange(data, i) : undefined
  }
  const sec = data.sectionRange(s)
  return sec?.[0] === s ? sectionRange(sec[0], sec[1]) : undefined
}
