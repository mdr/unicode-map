import type { UnicodeData } from "../../data/unicode"
import type { ColorMode } from "../../map/colorModes"
import type { Here } from "../../map/MapView"
import type { CodePoint, Plane, BlockIndex } from "../../units"

export interface DetailProps {
  data: UnicodeData
  mode: ColorMode
  cp: CodePoint | undefined
  here: Here | undefined
  onSelect: (cp: CodePoint) => void
  onBlock: (i: BlockIndex) => void
  onPlane: (p: Plane) => void
  onClose: () => void
  /** Point a range out on the map while hovering it (undefined to stop). */
  onPreview: (r: { s: CodePoint; e: CodePoint; name: string } | undefined) => void
  /** Fly to a code point range (a chart section). */
  onRange: (s: CodePoint, e: CodePoint) => void
  /** Open a block as a code chart. */
  onChart: (block: BlockIndex) => void
  /** The block whose chart is open, if any. */
  chartBlock: number | undefined
}
