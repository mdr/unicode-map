import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { uplus, type UnicodeData } from "../../data/unicode"
import type { ColorMode } from "../../map/colorModes"
import { ChartColumn } from "./ChartColumn"
import { ChartHeader } from "./ChartHeader"
import { GUTTER, HEAD, LANE, sectionLabels, visibleColumns } from "./chartLayout"
import { NamesList } from "./NamesList"
import { useChartScroller } from "./useChartScroller"
import type { CodePoint, BlockIndex } from "../../units"

/**
 * A block laid out like Unicode's code charts: columns of 16 code points, one hex "decade" per
 * column (U+1800–180F, U+1810–181F…), read down then across. Replaces the map while it's open.
 * Only the columns in view are rendered, so even CJK Unified Ideographs (1,300+ columns) is quick.
 */
export const ChartView = ({
  data,
  mode,
  block: bi,
  focus,
  selected,
  onSelect,
  onHover,
  onView,
  onClose
}: {
  data: UnicodeData
  mode: ColorMode
  block: BlockIndex
  /** A range to scroll to and point out (a section), if any. */
  focus?: [number, number]
  selected: CodePoint | undefined
  onSelect: (cp: CodePoint) => void
  onHover: (cp: CodePoint, x: number, y: number) => void
  /** Reports the code point at the middle of the visible columns as you scroll. */
  onView: (cp: CodePoint) => void
  onClose: () => void
}) => {
  const b = data.blockAt(bi)
  const first = b.s & ~15
  const cols = ((b.e | 15) - first + 1) / 16
  const sections = useMemo(() => data.meta.sections.filter(([s, e]) => s <= b.e && e >= b.s), [data, b])
  const sectionStarts = useMemo(() => new Set(sections.map(([s]) => s)), [sections])
  const assigned = useMemo(() => {
    let n = 0
    for (let cp = b.s; cp <= b.e; cp++) if (data.isAssigned(cp)) n++
    return n
  }, [data, b])

  const scroller = useRef<HTMLDivElement>(null)
  const { box, cell: c, scrollLeft, setScrollLeft, zoomBy } = useChartScroller(scroller)
  const secLabels = useMemo(() => sectionLabels(sections, b, c), [sections, b, c])
  const lanes = secLabels.reduce((m, l) => Math.max(m, l.lane + 1), 0)
  const band = lanes ? LANE * lanes + 4 : 0
  const colX = (col: number): number => GUTTER + col * c

  const inBlock = (cp: CodePoint | undefined): cp is number => cp !== undefined && cp >= b.s && cp <= b.e
  /** Scroll a code point's column into view, a column in from the left if it has to move. */
  const reveal = (cp: CodePoint, always: boolean): void => {
    const el = scroller.current
    if (!el) return
    const x = colX(Math.floor((cp - first) / 16))
    if (always || x < el.scrollLeft + GUTTER || x + c > el.scrollLeft + el.clientWidth)
      el.scrollLeft = Math.max(0, x - GUTTER - c)
  }
  // Open at the focused section, else the selection, else the start.
  useLayoutEffect(() => {
    reveal(focus?.[0] ?? (inBlock(selected) ? selected : b.s), true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bi, focus?.[0]])
  // Follow the selection (arrow keys) without jumping when it's already in view.
  useLayoutEffect(() => {
    if (inBlock(selected)) reveal(selected, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Tell the sidebar where we are, once scrolling pauses.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const col = Math.floor((scrollLeft + Math.min(box.w, colX(cols)) / 2 - GUTTER) / c)
      onView(Math.max(b.s, Math.min(b.e, first + Math.max(0, col) * 16)))
    }, 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollLeft, c, box.w, bi])

  /** The section being pointed out: hovered in the band, else the focused one. */
  const [hoverSec, setHoverSec] = useState<[number, number]>()
  const lit = hoverSec ?? focus
  /** A code point hovered in the names list, outlined in the grid. */
  const [hoverCp, setHoverCp] = useState<number>()

  const { from, to } = visibleColumns(scrollLeft, box.w, c, cols)
  // When the whole block fits with room to spare, the space beside it holds a names list, like
  // the facing pages of the printed charts.
  const gridW = colX(cols) + 24
  const namesW = Math.min(560, box.w - gridW - 8)

  return (
    <div className="chart-view">
      <ChartHeader
        data={data}
        block={b}
        assigned={assigned}
        sectionCount={sections.length}
        onZoom={(factor) => zoomBy(factor)}
        onClose={onClose}
      />
      <div className="chart-body">
        <div className="chart-scroll" ref={scroller} onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
          <div className="chart-inner" style={{ width: gridW, height: band + HEAD + 16 * c }}>
            {/* Sections: a band over the columns they cover, in up to three lanes. */}
            {secLabels
              .filter(({ a, z }) => z >= from && a <= to)
              .map(({ s, e, title, a, z, lane }) => (
                <button
                  key={s}
                  className={`chart-sec ${lit?.[0] === s && lit[1] === e ? "on" : ""}`}
                  style={{ left: colX(a) + 1, width: (z - a + 1) * c - 2, top: 2 + lane * LANE }}
                  title={`${title} · ${uplus(s)}–${uplus(e)}`}
                  onMouseEnter={() => setHoverSec([s, e])}
                  onMouseLeave={() => setHoverSec(undefined)}
                >
                  <span style={{ position: "sticky", left: GUTTER + 6 }}>{title}</span>
                </button>
              ))}
            {Array.from({ length: to - from + 1 }, (_, i) => from + i).map((col) => (
              <ChartColumn
                key={col}
                data={data}
                mode={mode}
                block={b}
                base={first + col * 16}
                left={colX(col)}
                top={band}
                cell={c}
                sectionStarts={sectionStarts}
                selected={selected}
                outlined={hoverCp}
                lit={lit}
                onSelect={onSelect}
                onHover={onHover}
              />
            ))}
          </div>
        </div>
        {namesW >= 320 && (
          <NamesList
            data={data}
            block={bi}
            sections={sections}
            selected={selected}
            style={{ left: gridW, width: namesW, top: band + HEAD }}
            onSelect={onSelect}
            onHoverCp={setHoverCp}
          />
        )}
        {/* Row digits, fixed at the left while the columns scroll under them. */}
        <div className="chart-rows" style={{ top: band + HEAD, width: GUTTER }}>
          {Array.from({ length: 16 }, (_, r) => (
            <div key={r} style={{ height: c }}>
              {r.toString(16).toUpperCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
