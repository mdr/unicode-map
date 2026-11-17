import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { hex, uplus, UnicodeData } from "../data/unicode"
import { ColorMode, cpColor } from "../map/colorModes"
import { Glyph } from "./Glyph"

/**
 * A block laid out like Unicode's code charts: columns of 16 code points, one hex "decade" per
 * column (U+1800–180F, U+1810–181F…), read down then across. Replaces the map while it's open.
 * Only the columns in view are rendered, so even CJK Unified Ideographs (1,300+ columns) is quick.
 */
export function ChartView({
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
  block: number
  /** A range to scroll to and point out (a section), if any. */
  focus?: [number, number]
  selected: number | null
  onSelect: (cp: number) => void
  onHover: (cp: number, x: number, y: number) => void
  /** Reports the code point at the middle of the visible columns as you scroll. */
  onView: (cp: number) => void
  onClose: () => void
}) {
  const b = data.meta.blocks[bi]
  const first = b.s & ~15
  const cols = ((b.e | 15) - first + 1) / 16
  const sections = useMemo(() => data.meta.sections.filter(([s, e]) => s <= b.e && e >= b.s), [data, b])
  const assigned = useMemo(() => {
    let n = 0
    for (let cp = b.s; cp <= b.e; cp++) if (data.isAssigned(cp)) n++
    return n
  }, [data, b])

  // Size: the 16 rows fill the height by default; pinch or the buttons zoom from there.
  const scroller = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 800, h: 600 })
  const [zoom, setZoom] = useState(1)
  const [scrollLeft, setScrollLeft] = useState(0)
  useLayoutEffect(() => {
    const el = scroller.current!
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])
  const MAX_LANES = 3,
    LANE = 22,
    HEAD = 22,
    GUTTER = 30
  const fit = Math.floor((box.h - LANE * 2 - HEAD - 16) / 16)
  const c = Math.round(Math.max(28, Math.min(160, Math.max(36, Math.min(fit, 96)) * zoom)))
  // Section labels: each spans the columns its section covers, in the first lane where it fits.
  // Sections too narrow to name at this size get no label; hovering a cell still names them.
  const secLabels = useMemo(() => {
    const ends: number[] = []
    const out: { s: number; e: number; title: string; a: number; z: number; lane: number }[] = []
    for (const [s, e, title] of sections) {
      const a = Math.floor((Math.max(s, b.s) - first) / 16),
        z = Math.floor((Math.min(e, b.e) - first) / 16)
      if ((z - a + 1) * c < 56) continue
      const lane = [0, 1, 2].slice(0, MAX_LANES).find((l) => (ends[l] ?? -1) < a)
      if (lane === undefined) continue
      ends[lane] = z
      out.push({ s, e, title, a, z, lane })
    }
    return out
  }, [sections, b, first, c])
  const lanes = secLabels.reduce((m, l) => Math.max(m, l.lane + 1), 0)
  const BAND = lanes ? LANE * lanes + 4 : 0

  // Keep the column under the pointer still while zooming.
  const anchor = useRef<{ col: number; px: number } | null>(null)
  useLayoutEffect(() => {
    const a = anchor.current
    if (!a || !scroller.current) return
    scroller.current.scrollLeft = a.col * c + GUTTER - a.px
    anchor.current = null
  }, [c])
  const zoomBy = (f: number, px = box.w / 2) => {
    anchor.current = { col: (scrollLeft + px - GUTTER) / c, px }
    setZoom((z) => Math.max(0.4, Math.min(3, z * f)))
  }

  // Plain wheel and trackpad scrolling move sideways; pinch (ctrl+wheel) zooms.
  useEffect(() => {
    const el = scroller.current!
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const r = el.getBoundingClientRect()
        zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left)
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollHeight <= el.clientHeight + 1) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  })

  const inBlock = (cp: number | null): cp is number => cp !== null && cp >= b.s && cp <= b.e
  /** Scroll a code point's column into view, a column in from the left if it has to move. */
  const reveal = (cp: number, always: boolean) => {
    const el = scroller.current
    if (!el) return
    const x = GUTTER + Math.floor((cp - first) / 16) * c
    if (always || x < el.scrollLeft + GUTTER || x + c > el.scrollLeft + el.clientWidth)
      el.scrollLeft = Math.max(0, x - GUTTER - c)
  }
  // Open at the focused section, else the selection, else the start.
  useLayoutEffect(() => {
    const at = focus?.[0] ?? (inBlock(selected) ? selected : b.s)
    reveal(at, true)
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
  const [hoverSec, setHoverSec] = useState<[number, number] | null>(null)
  const lit = hoverSec ?? focus ?? null
  /** A code point hovered in the names list, outlined in the grid. */
  const [hoverCp, setHoverCp] = useState<number | null>(null)

  const c0 = Math.max(0, Math.floor((scrollLeft - GUTTER) / c) - 3)
  const c1 = Math.min(cols - 1, Math.ceil((scrollLeft + box.w) / c) + 3)
  function colX(col: number) {
    return GUTTER + col * c
  }
  // When the whole block fits with room to spare, the space beside it holds a names list, like
  // the facing pages of the printed charts.
  const gridW = colX(cols) + 24
  const namesW = Math.min(560, box.w - gridW - 8)
  const showNames = namesW >= 320
  const fontPx = c * 0.5
  const showHex = c >= 62

  const columns = []
  for (let col = c0; col <= c1; col++) {
    const base = first + col * 16
    const cells = []
    for (let r = 0; r < 16; r++) {
      const cp = base + r
      const inBlock = cp >= b.s && cp <= b.e
      const isAssigned = inBlock && data.isAssigned(cp)
      const startsSection = sections.some(([s]) => s === cp) && cp !== b.s
      const dim = lit && (cp < lit[0] || cp > lit[1])
      cells.push(
        <div
          key={r}
          className={`chart-cell ${isAssigned ? "" : "empty"} ${cp === selected ? "selected" : ""} ${cp === hoverCp ? "hl" : ""} ${dim ? "dim" : ""} ${startsSection ? "sec-start" : ""}`}
          style={isAssigned ? { ["--tint" as string]: cpColor(mode, cp), fontSize: fontPx } : undefined}
          onClick={() => inBlock && onSelect(cp)}
          onMouseMove={(e) => inBlock && onHover(cp, e.clientX, e.clientY)}
          onMouseLeave={() => onHover(-1, 0, 0)}
        >
          {isAssigned && <Glyph data={data} cp={cp} className={`chart-glyph ${showHex ? "raised" : ""}`} />}
          {inBlock && showHex && <span className="chart-hex">{hex(cp)}</span>}
        </div>
      )
    }
    columns.push(
      <div key={col} className="chart-col" style={{ left: colX(col), width: c, top: BAND }}>
        <div className="chart-col-head" style={{ height: HEAD }}>
          {hex(base).slice(0, -1)}
        </div>
        <div className="chart-col-cells" style={{ gridTemplateRows: `repeat(16, ${c}px)` }}>
          {cells}
        </div>
      </div>
    )
  }

  return (
    <div className="chart-view">
      <header className="chart-head">
        <div className="chart-title">
          <span className="swatch" style={{ background: data.meta.regions[b.region].color }} />
          <h2>{b.name}</h2>
          <span className="muted mono small">
            {uplus(b.s)}–{uplus(b.e)}
          </span>
          <span className="muted small">
            · {assigned.toLocaleString()} of {(b.e - b.s + 1).toLocaleString()} assigned
            {sections.length > 1 && ` · ${sections.length} sections`}
          </span>
        </div>
        <div className="chart-actions">
          <button title="Smaller" onClick={() => zoomBy(1 / 1.25)}>
            −
          </button>
          <button title="Larger" onClick={() => zoomBy(1.25)}>
            +
          </button>
          <a
            className="chart-pdf"
            href={`https://www.unicode.org/charts/PDF/U${hex(b.s)}.pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Official chart ↗
          </a>
          <button className="chart-close" title="Back to the map (Esc)" onClick={onClose}>
            Back to map
          </button>
        </div>
      </header>
      <div className="chart-body">
        <div className="chart-scroll" ref={scroller} onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}>
          <div className="chart-inner" style={{ width: colX(cols) + 24, height: BAND + HEAD + 16 * c }}>
            {/* Sections: a band over the columns they cover, alternating between two lanes. */}
            {secLabels.map(({ s, e, title, a, z, lane }) => {
              if (z < c0 || a > c1) return null
              const on = lit && lit[0] === s && lit[1] === e
              return (
                <button
                  key={s}
                  className={`chart-sec ${on ? "on" : ""}`}
                  style={{ left: colX(a) + 1, width: (z - a + 1) * c - 2, top: 2 + lane * LANE }}
                  title={`${title} · ${uplus(s)}–${uplus(e)}`}
                  onMouseEnter={() => setHoverSec([s, e])}
                  onMouseLeave={() => setHoverSec(null)}
                >
                  <span style={{ position: "sticky", left: GUTTER + 6 }}>{title}</span>
                </button>
              )
            })}
            {columns}
          </div>
        </div>
        {showNames && (
          <NamesList
            data={data}
            block={bi}
            sections={sections}
            selected={selected}
            style={{ left: gridW, width: namesW, top: BAND + HEAD }}
            onSelect={onSelect}
            onHoverCp={setHoverCp}
          />
        )}
        {/* Row digits, fixed at the left while the columns scroll under them. */}
        <div className="chart-rows" style={{ top: BAND + HEAD, width: GUTTER }}>
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

/** The block's characters by name, grouped under their sections, like a code chart's names list. */
function NamesList({
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
  selected: number | null
  style: React.CSSProperties
  onSelect: (cp: number) => void
  onHoverCp: (cp: number | null) => void
}) {
  const b = data.meta.blocks[bi]
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector(".names-row.selected")?.scrollIntoView({ block: "nearest" })
  }, [selected])
  const rows = []
  let si = 0
  for (let cp = b.s; cp <= b.e; cp++) {
    while (si < sections.length && sections[si][1] < cp) si++
    const sec = sections[si]
    if (sec && sec[0] === cp)
      rows.push(
        <div key={`h${cp}`} className="names-head">
          {sec[2]}
        </div>
      )
    else if (sec && cp === b.s && sec[0] < cp)
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
        onMouseLeave={() => onHoverCp(null)}
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
