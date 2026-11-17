import { rangeRect, type Rect } from "../layout"
import { outlinePath } from "./geometry"
import type { CodePoint } from "../../units"

/** A range pointed out on the map, as given by the caller. */
export interface PreviewRange {
  s: CodePoint
  e: CodePoint
  name: string
  /** Where to put the name label (screen), if not above the range. */
  labelAt?: { x: number; y: number }
  /** Lighter dimming, for previews from hovering the map itself. */
  soft?: boolean
}

export interface Preview extends PreviewRange {
  path: Path2D
  rect: Rect
}

export const makePreview = (range: PreviewRange): Preview => ({
  ...range,
  path: outlinePath(range.s, range.e),
  rect: rangeRect(range.s, range.e)
})

/** A block or section header drawn in the last frame (screen rect), for hover and click. */
export interface HeaderHit {
  r: Rect
  s: CodePoint
  e: CodePoint
  name: string
}
