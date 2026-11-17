import type { UnicodeData } from "../../data/unicode"
import type { ColorMode } from "../../map/colorModes"
import type { Here } from "../../map/MapView"

export interface DetailProps {
  data: UnicodeData
  mode: ColorMode
  cp: number | undefined
  here: Here | undefined
  onSelect: (cp: number) => void
  onBlock: (i: number) => void
  onPlane: (p: number) => void
  onClose: () => void
  /** Point a range out on the map while hovering it (undefined to stop). */
  onPreview: (r: { s: number; e: number; name: string } | undefined) => void
  /** Fly to a code point range (a chart section). */
  onRange: (s: number, e: number) => void
  /** Open a block as a code chart. */
  onChart: (block: number) => void
  /** The block whose chart is open, if any. */
  chartBlock: number | undefined
}
