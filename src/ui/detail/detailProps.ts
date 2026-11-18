import type { UnicodeData } from "../../data/unicode"
import type { ColorMode } from "../../map/colorModes"
import type { Here } from "../../map/MapView"
import type { CodePoint, Plane, BlockIndex } from "../../units"
import type { RangeSelection } from "../../data/ranges"

export interface DetailProps {
  data: UnicodeData
  mode: ColorMode
  cp: CodePoint | undefined
  /** A selected plane, block or section (with no code point selected). */
  range: RangeSelection | undefined
  /** Select a plane, block or section, to describe here. */
  onSelectRange: (r: RangeSelection) => void
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
  onChart: (block: BlockIndex, focus?: [CodePoint, CodePoint]) => void
  /** The block whose chart is open, if any. */
  chartBlock: number | undefined
  /** Choose an interpretation of the Private Use Areas (undefined for none). */
  onInterpretation: (id: string | undefined) => void
}
