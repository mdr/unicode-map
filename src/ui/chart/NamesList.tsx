import { useEffect, useRef } from "react"
import { hex, type UnicodeData } from "../../data/unicode"
import { required } from "../../required"
import { Glyph } from "../Glyph"

/** The block's characters by name, grouped under their sections, like a code chart's names list. */
export const NamesList = ({
  data,
  block: bi,
  sections,
  selected,
  style,
  onSelect,
  onHoverCp
}: {
  data: UnicodeData
  block: number
  sections: [number, number, string][]
  selected: number | undefined
  style: React.CSSProperties
  onSelect: (cp: number) => void
  onHoverCp: (cp: number | undefined) => void
}) => {
  const b = required(data.meta.blocks[bi], "names list block")
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector(".names-row.selected")?.scrollIntoView({ block: "nearest" })
  }, [selected])
  const rows = []
  let si = 0
  let sec = sections[si]
  for (let cp = b.s; cp <= b.e; cp++) {
    while (sec && sec[1] < cp) sec = sections[++si]
    // A section's heading goes at its start, or at the block's start if it began before it.
    if (sec && (sec[0] === cp || (cp === b.s && sec[0] < cp)))
      rows.push(
        <div key={`h${cp}`} className="names-head">
          {sec[2]}
        </div>
      )
    if (!data.isAssigned(cp)) continue
    rows.push(
      <button
        key={cp}
        className={`names-row ${cp === selected ? "selected" : ""}`}
        onClick={() => onSelect(cp)}
        onMouseEnter={() => onHoverCp(cp)}
        onMouseLeave={() => onHoverCp(undefined)}
      >
        <span className="names-hex">{hex(cp)}</span>
        <Glyph data={data} cp={cp} className="names-glyph" />
        <span className="names-name">{data.name(cp)}</span>
      </button>
    )
  }
  return (
    <div className="names-list" style={style} ref={ref}>
      {rows}
    </div>
  )
}
