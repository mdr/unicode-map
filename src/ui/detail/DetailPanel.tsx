import { useState } from "react"
import { RangeKind, type RangeSelection } from "../../data/ranges"
import { planeName, uplus, type UnicodeData } from "../../data/unicode"
import { Overview } from "./Overview"
import { CodePointDetail } from "./CodePointDetail"
import { RangeDetail } from "../range/RangeDetail"
import type { DetailProps } from "./detailProps"
import { SheetState } from "./sheet"
import { SheetHandle } from "./SheetHandle"

/** A selected range's name. */
const rangeName = (data: UnicodeData, r: RangeSelection): string => {
  if (r.kind === RangeKind.PLANE) return `Plane ${r.s >> 16} · ${planeName(r.s >> 16)[0]}`
  if (r.kind === RangeKind.BLOCK) return data.block(r.s)?.name ?? ""
  return data.section(r.s) ?? ""
}

/** What the panel shows, in a few words: for the sheet's handle while it's lowered. */
const summary = ({ data, cp, range }: DetailProps): string => {
  if (cp !== undefined) return `${uplus(cp)} ${data.name(cp)}`
  return range ? rangeName(data, range) : "About the map"
}

export const DetailPanel = (props: DetailProps) => {
  const { cp, range } = props
  // On a narrow screen, a new selection raises the sheet to show it, and clearing it lowers it.
  const selection = cp !== undefined ? `U+${cp}` : range ? `${range.kind}=${range.s}` : undefined
  const [sheet, setSheet] = useState(selection === undefined ? SheetState.LOWERED : SheetState.PART)
  const [shown, setShown] = useState(selection)
  if (selection !== shown) {
    setShown(selection)
    if (selection === undefined) setSheet(SheetState.LOWERED)
    else if (sheet === SheetState.LOWERED) setSheet(SheetState.PART)
  }
  return (
    <aside className={`detail sheet-${sheet}`}>
      <SheetHandle state={sheet} label={summary(props)} onChange={setSheet} />
      {cp !== undefined ? (
        <CodePointDetail {...props} cp={cp} />
      ) : range ? (
        <RangeDetail {...props} range={range} />
      ) : (
        <Overview {...props} />
      )}
    </aside>
  )
}
