import { displayString, hex, type Block, type UnicodeData } from "../../data/unicode"
import { type ColorMode, cpColor } from "../../map/colorModes"
import { Glyph } from "../Glyph"
import { HEAD } from "./chartLayout"
import type { CodePoint } from "../../units"
import styles from "./chart.module.css"
import { pageGlyphScale } from "../../map/view/glyphFit"

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
  selected: CodePoint | undefined
  /** A code point hovered in the names list. */
  outlined: number | undefined
  /** A range being pointed out; everything else is dimmed. */
  lit: [number, number] | undefined
  onSelect: (cp: CodePoint) => void
  onHover: (cp: CodePoint, x: number, y: number) => void
}) => {
  const showHex = cell >= 62
  /** Shrinks the rare glyph too big for its cell, as on the map's cards. */
  const glyphFit = (cp: CodePoint): number => {
    const str = displayString(data, cp)
    return str ? pageGlyphScale(cp, str, data.glyphFamily(cp)) : 1
  }
  return (
    <div className={styles.chartCol} style={{ left, width: cell, top }}>
      <div className={styles.chartColHead} style={{ height: HEAD }}>
        {hex(base).slice(0, -1)}
      </div>
      <div className={styles.chartColCells} style={{ gridTemplateRows: `repeat(16, ${cell}px)` }}>
        {Array.from({ length: 16 }, (_, row) => {
          const cp = base + row
          const inBlock = cp >= block.s && cp <= block.e
          const assigned = inBlock && data.isAssigned(cp)
          const classes = [
            styles.chartCell,
            assigned ? "" : "empty",
            cp === selected ? styles.selected : "",
            cp === outlined ? styles.hl : "",
            lit && (cp < lit[0] || cp > lit[1]) ? "dim" : "",
            sectionStarts.has(cp) && cp !== block.s ? styles.secStart : ""
          ]
          return (
            <button
              type="button"
              // Arrow keys move through the chart, so cells stay out of the tab order.
              tabIndex={-1}
              key={row}
              className={classes.join(" ")}
              style={
                assigned ? { ["--tint" as string]: cpColor(mode, cp), fontSize: cell * 0.5 * glyphFit(cp) } : undefined
              }
              onClick={() => inBlock && onSelect(cp)}
              onMouseMove={(e) => inBlock && onHover(cp, e.clientX, e.clientY)}
              onMouseLeave={() => onHover(-1, 0, 0)}
            >
              {assigned && (
                <Glyph data={data} cp={cp} className={`${styles.chartGlyph} ${showHex ? styles.raised : ""}`} />
              )}
              {inBlock && showHex && <span className={styles.chartHex}>{hex(cp)}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
