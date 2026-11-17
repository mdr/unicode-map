import { hex, type Block, type UnicodeData } from "../../data/unicode"
import { type ColorMode, cpColor } from "../../map/colorModes"
import { Glyph } from "../Glyph"
import { HEAD } from "./chartLayout"

/** One column of a code chart: 16 code points sharing all but their last hex digit. */
export const ChartColumn = ({
  data,
  mode,
  block,
  base,
  left,
  top,
  cell,
  sectionStarts,
  selected,
  outlined,
  lit,
  onSelect,
  onHover
}: {
  data: UnicodeData
  mode: ColorMode
  block: Block
  /** The column's first code point. */
  base: number
  left: number
  top: number
  cell: number
  sectionStarts: Set<number>
  selected: number | undefined
  /** A code point hovered in the names list. */
  outlined: number | undefined
  /** A range being pointed out; everything else is dimmed. */
  lit: [number, number] | undefined
  onSelect: (cp: number) => void
  onHover: (cp: number, x: number, y: number) => void
}) => {
  const showHex = cell >= 62
  return (
    <div className="chart-col" style={{ left, width: cell, top }}>
      <div className="chart-col-head" style={{ height: HEAD }}>
        {hex(base).slice(0, -1)}
      </div>
      <div className="chart-col-cells" style={{ gridTemplateRows: `repeat(16, ${cell}px)` }}>
        {Array.from({ length: 16 }, (_, row) => {
          const cp = base + row
          const inBlock = cp >= block.s && cp <= block.e
          const assigned = inBlock && data.isAssigned(cp)
          const classes = [
            "chart-cell",
            assigned ? "" : "empty",
            cp === selected ? "selected" : "",
            cp === outlined ? "hl" : "",
            lit && (cp < lit[0] || cp > lit[1]) ? "dim" : "",
            sectionStarts.has(cp) && cp !== block.s ? "sec-start" : ""
          ]
          return (
            <button
              type="button"
              // Arrow keys move through the chart, so cells stay out of the tab order.
              tabIndex={-1}
              key={row}
              className={classes.join(" ")}
              style={assigned ? { ["--tint" as string]: cpColor(mode, cp), fontSize: cell * 0.5 } : undefined}
              onClick={() => inBlock && onSelect(cp)}
              onMouseMove={(e) => inBlock && onHover(cp, e.clientX, e.clientY)}
              onMouseLeave={() => onHover(-1, 0, 0)}
            >
              {assigned && <Glyph data={data} cp={cp} className={`chart-glyph ${showHex ? "raised" : ""}`} />}
              {inBlock && showHex && <span className="chart-hex">{hex(cp)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
