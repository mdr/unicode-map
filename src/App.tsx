import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { UnicodeData } from "./data/unicode"
import { getMode, type ModeId, MODES } from "./map/colorModes"
import { type Camera, type Here, MapView } from "./map/MapView"
import { planeRect } from "./map/layout"
import { SearchBox } from "./ui/SearchBox"
import { Legend } from "./ui/Legend"
import { DetailPanel } from "./ui/DetailPanel"
import { Tooltip } from "./ui/Tooltip"
import { Breadcrumb } from "./ui/Breadcrumb"
import { readHash, writeHash } from "./urlState"
import { HelpOverlay } from "./ui/HelpOverlay"
import { PropertyFilter } from "./ui/PropertyFilter"
import { Timeline } from "./ui/Timeline"
import { ChartView } from "./ui/ChartView"
import { loadProps, maskOf, type PropOption } from "./data/props"

export function App() {
  const [data, setData] = useState<UnicodeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    UnicodeData.load().then(setData, (e: unknown) => setError(String(e)))
  }, [])
  if (error)
    return (
      <div className="splash">
        <p>Couldn't load the Unicode data.</p>
        <p className="muted">
          Run <code>pnpm data</code> inside <code>nix develop</code> first.
        </p>
        <pre>{error}</pre>
      </div>
    )
  if (!data)
    return (
      <div className="splash">
        <div className="spinner" />
        <p className="muted">Loading the Unicode Character Database…</p>
      </div>
    )
  return <Explorer data={data} />
}

function Explorer({ data }: { data: UnicodeData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<MapView | null>(null)
  const initial = useMemo(() => readHash(), [])
  const [modeId, setModeId] = useState<ModeId>(initial.mode ?? "region")
  const [selected, setSelected] = useState<number | null>(initial.cp ?? null)
  const [pinned, setPinned] = useState<string[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [hover, setHover] = useState<{ cp: number; x: number; y: number } | null>(null)
  const [camera, setCamera] = useState<Camera | null>(null)
  /** Where the view is (centre of the visible area), updated once the camera settles. */
  const [here, setHere] = useState<Here | null>(null)
  const [help, setHelp] = useState(false)
  const [prop, setProp] = useState<PropOption | null>(null)
  /** Pure view: just the map, no interface or colouring. */
  const [pure, setPure] = useState(initial.pure ?? false)
  const [pureHint, setPureHint] = useState(false)
  /** Glyph texture in the normal view when zoomed out (experimental; `g` toggles it). */
  const [glyphTexture, setGlyphTexture] = useState(true)
  useEffect(() => viewRef.current?.setGlyphTexture(glyphTexture), [glyphTexture])
  /** Timeline position (index into meta.ages), or null when the timeline is closed. */
  const [asOf, setAsOf] = useState<number | null>(() => {
    const i = initial.asOf ? data.meta.ages.indexOf(initial.asOf) : -1
    return i > 0 ? i : null
  })
  /** Chart view: a block laid out like the Unicode code charts, in place of the map. */
  const [chart, setChart] = useState<{ block: number; focus?: [number, number] } | null>(() => {
    const i = initial.chart !== undefined ? data.meta.blocks.findIndex((b) => b.s === initial.chart) : -1
    return i >= 0 ? { block: i } : null
  })
  const chartRef = useRef(chart)
  chartRef.current = chart
  /** The code point at the middle of the chart's visible columns, for the sidebar to follow. */
  const [chartAt, setChartAt] = useState<number | null>(null)
  const mode = useMemo(() => getMode(data, modeId), [data, modeId])
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  // Create the map view once.
  useEffect(() => {
    let camTimer = 0
    const view = new MapView(canvasRef.current!, data, {
      onHover: (cp, x, y) => setHover(cp >= 0 ? { cp, x, y } : null),
      onSelect: (cp) => select(cp, { focus: false }),
      onCamera: () => {
        if (camTimer) return
        camTimer = window.setTimeout(() => {
          camTimer = 0
          setCamera(view.camera)
          // Not mid-flight: a fly-to can pass over other planes or zoom out on the way.
          if (!view.animating) setHere({ cp: view.centreCp(), k: view.camera.k })
        }, 80)
      }
    })
    viewRef.current = view
    // For poking at the renderer from the console and test scripts.
    if (import.meta.env.DEV) (window as unknown as { __view: MapView }).__view = view
    view.setMode(getMode(data, modeId))
    // Pure view from the URL: the effect that applies it ran before the view existed.
    if (initial.pure) view.setPure(true)
    if (initial.view) view.setCamera(initial.view)
    if (initial.cp !== undefined) {
      view.setSelected(initial.cp)
      if (!initial.view) view.focusCp(initial.cp, { animate: false })
    }
    return () => view.dispose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  useEffect(() => {
    viewRef.current?.setMode(mode)
  }, [mode])

  // Legend highlight: hover preview wins over pinned items.
  useEffect(() => {
    const keys = preview ? [preview] : pinned
    if (!keys.length) {
      viewRef.current?.setHighlight(null)
      return
    }
    const values = new Set<number>()
    for (const g of mode.legend)
      for (const it of g.items) if (keys.includes(it.key)) it.values.forEach((v) => values.add(v))
    viewRef.current?.setHighlight(values)
  }, [mode, pinned, preview])

  useEffect(() => {
    setPinned([])
    setPreview(null)
  }, [modeId])

  // Property highlight
  useEffect(() => {
    if (initial.prop) void loadProps().then((opts) => setProp(opts.find((o) => o.key === initial.prop) ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    viewRef.current?.setMask(prop ? maskOf(prop) : null)
  }, [prop])

  // Pure view. A hint on how to leave shows on entering and whenever the mouse moves.
  useEffect(() => {
    viewRef.current?.setPure(pure)
    if (!pure) return
    setHelp(false)
    setHover(null)
    let timer = 0
    const show = () => {
      setPureHint(true)
      clearTimeout(timer)
      timer = window.setTimeout(() => setPureHint(false), 1800)
    }
    show()
    window.addEventListener("mousemove", show)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("mousemove", show)
      setPureHint(false)
    }
  }, [pure])

  // Timeline
  useEffect(() => {
    viewRef.current?.setAsOf(asOf)
  }, [asOf])
  const toggleTimeline = useCallback(() => setAsOf((a) => (a === null ? data.meta.ages.length - 1 : null)), [data])
  const changeMode = useCallback(
    (m: ModeId) => {
      setModeId(m)
      // The timeline is the natural companion to the Age colouring.
      if (m === "age") setAsOf((a) => a ?? data.meta.ages.length - 1)
    },
    [data]
  )

  const select = useCallback((cp: number | null, opts: { focus?: boolean; zoom?: boolean } = {}) => {
    setSelected(cp)
    viewRef.current?.setSelected(cp)
    if (cp !== null && opts.focus !== false) viewRef.current?.focusCp(cp, { zoom: opts.zoom })
  }, [])

  // URL state
  const extras = () => ({
    prop: prop?.key,
    asOf: asOf !== null ? data.meta.ages[asOf] : undefined,
    pure,
    chart: chart ? data.meta.blocks[chart.block].s : undefined
  })
  useEffect(() => {
    writeHash({ cp: selected ?? undefined, mode: modeId, view: camera ?? undefined, ...extras() }, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, modeId, prop, asOf, pure])
  // Opening and closing a chart are history steps, so Back returns to the map.
  const lastChart = useRef(chart?.block)
  useEffect(() => {
    if (lastChart.current === chart?.block) return
    lastChart.current = chart?.block
    writeHash({ cp: selected ?? undefined, mode: modeId, view: viewRef.current?.camera, ...extras() }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart?.block])
  const lastPushed = useRef<number | null | undefined>(initial.cp)
  useEffect(() => {
    if (lastPushed.current === selected) return
    lastPushed.current = selected
    writeHash({ cp: selected ?? undefined, mode: modeId, view: viewRef.current?.camera, ...extras() }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])
  useEffect(() => {
    const onPop = () => {
      const s = readHash()
      lastPushed.current = s.cp ?? null
      setSelected(s.cp ?? null)
      viewRef.current?.setSelected(s.cp ?? null)
      if (s.mode) setModeId(s.mode)
      const ci = s.chart !== undefined ? data.meta.blocks.findIndex((b) => b.s === s.chart) : -1
      lastChart.current = ci >= 0 ? ci : undefined
      setChart(ci >= 0 ? { block: ci } : null)
      if (s.view) viewRef.current?.flyTo(s.view)
      else if (s.cp !== undefined) viewRef.current?.focusCp(s.cp)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [data.meta.blocks])

  const flyToBlock = useCallback(
    (index: number) => {
      const b = data.meta.blocks[index]
      // With a chart open, blocks open in the chart instead.
      if (chartRef.current) setChart({ block: index })
      viewRef.current?.showRange(b.s, b.e)
    },
    [data]
  )
  const flyToRange = useCallback(
    (a: number, b: number) => {
      if (chartRef.current) setChart({ block: data.blockIdx[a], focus: [a, b] })
      viewRef.current?.showRange(a, b)
    },
    [data]
  )
  /** Open the chart for a block, or the block a code point is in. */
  const openChart = useCallback((block: number, focus?: [number, number]) => {
    if (block >= 0) setChart({ block, focus })
  }, [])
  const previewRange = useCallback(
    (r: { s: number; e: number; name: string } | null) => viewRef.current?.setPreview(r),
    []
  )
  const flyToPlane = useCallback((p: number) => {
    viewRef.current?.clearPinned()
    viewRef.current?.flyToRect(planeRect(p), { pad: 1.08 })
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (pure) {
        // Only zooming and leaving work in pure view.
        if (e.key === "z" || e.key === "Escape") setPure(false)
        else if (e.key === "+" || e.key === "=") viewRef.current?.zoomBy(2)
        else if (e.key === "-" || e.key === "_") viewRef.current?.zoomBy(0.5)
        else if (e.key === "0") viewRef.current?.overview()
        else return
        e.preventDefault()
        return
      }
      const view = viewRef.current
      if (!view) return
      const cur = selectedRef.current
      const centre = () => {
        const cp = view.centreCp()
        return cp >= 0 ? cp : 0
      }
      const ch = chartRef.current
      const move = (delta: number, assignedOnly = false) => {
        let cp = cur ?? (ch ? data.meta.blocks[ch.block].s - delta : centre())
        do {
          cp += delta
        } while (assignedOnly && cp > 0 && cp < 0x10ffff && !data.isAssigned(cp))
        cp = Math.max(0, Math.min(0x10ffff, cp))
        if (ch) {
          // In a chart, moving past either end of the block opens the next one's chart.
          const b = data.meta.blocks[ch.block]
          if (cp < b.s || cp > b.e) {
            const nb = data.blockIdx[cp]
            if (nb < 0) return
            setChart({ block: nb })
          }
        }
        select(cp, { zoom: true })
      }
      // A chart reads down its columns of 16: up and down step by one, left and right by a column.
      const [dx, dy] = ch ? [16, 1] : [1, 256]
      const blocks = data.meta.blocks
      switch (e.key) {
        case "ArrowLeft":
          move(-dx, e.shiftKey && !ch)
          break
        case "ArrowRight":
          move(dx, e.shiftKey && !ch)
          break
        case "ArrowUp":
          move(-dy, e.shiftKey && !!ch)
          break
        case "ArrowDown":
          move(dy, e.shiftKey && !!ch)
          break
        case "]":
        case "[": {
          const at = cur ?? centre()
          const i = e.key === "]" ? blocks.findIndex((b) => b.s > at) : blocks.findLastIndex((b) => b.e < at)
          if (i >= 0) {
            select(blocks[i].s, { focus: false })
            flyToBlock(i)
          }
          break
        }
        case "}":
        case "{": {
          const p = ((cur ?? centre()) >> 16) + (e.key === "}" ? 1 : -1)
          if (p >= 0 && p <= 16) {
            select(null)
            flyToPlane(p)
          }
          break
        }
        case "Enter":
          if (cur !== null) view.focusCp(cur)
          break
        case "c": {
          if (chartRef.current) setChart(null)
          else openChart(data.blockIdx[cur ?? centre()])
          break
        }
        case "Escape":
          if (help) setHelp(false)
          else if (chartRef.current) setChart(null)
          else {
            select(null)
            view.clearPinned()
          }
          break
        case "+":
        case "=":
          view.zoomBy(2)
          break
        case "-":
        case "_":
          view.zoomBy(0.5)
          break
        case "0":
          view.overview()
          break
        case "?":
          setHelp((h) => !h)
          break
        case "t":
          toggleTimeline()
          break
        case "z":
          setPure(true)
          break
        case "g":
          setGlyphTexture((g) => !g)
          break
        case "p":
          document.querySelector<HTMLElement>(".pf-open")?.click()
          break
        case "/":
          e.preventDefault()
          document.getElementById("search-input")?.focus()
          break
        default: {
          const n = parseInt(e.key, 10)
          if (n >= 1 && n <= MODES.length) changeMode(MODES[n - 1].id)
          else return
        }
      }
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [data, select, flyToBlock, flyToPlane, help, toggleTimeline, changeMode, pure, openChart])

  return (
    <div className={`app ${pure ? "pure" : ""} ${chart ? "charting" : ""}`}>
      <div className="map-area">
        <canvas ref={canvasRef} className="map-canvas" />
        <div className="top-bar">
          <div className="brand">
            <span className="brand-mark">U+</span>
            <div>
              <div className="brand-title">Unicode Map</div>
              <div className="brand-sub">Unicode {data.meta.version}</div>
            </div>
          </div>
          <SearchBox data={data} onPickCp={(cp) => select(cp, { zoom: true })} onPickBlock={(i) => flyToBlock(i)} />
          <PropertyFilter value={prop} onChange={setProp} />
          <Breadcrumb
            data={data}
            here={here}
            selected={selected}
            onPlane={flyToPlane}
            onBlock={flyToBlock}
            onOverview={() => viewRef.current?.overview()}
            onRange={flyToRange}
            onPreview={previewRange}
          />
        </div>
        <Legend
          mode={mode}
          modeId={modeId}
          onMode={changeMode}
          pinned={pinned}
          onTogglePin={(k) => setPinned((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))}
          onClearPins={() => setPinned([])}
          onPreview={setPreview}
        />
        <div className="map-controls">
          <button title="Zoom in (+)" onClick={() => viewRef.current?.zoomBy(2)}>
            +
          </button>
          <button title="Zoom out (−)" onClick={() => viewRef.current?.zoomBy(0.5)}>
            −
          </button>
          <button title="Show everything (0)" onClick={() => viewRef.current?.overview()}>
            ⤢
          </button>
          <button
            title="Timeline: Unicode through the versions (t)"
            aria-label="Timeline"
            className={asOf !== null ? "on" : ""}
            onClick={toggleTimeline}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button title="Pure view: just the characters (z)" aria-label="Pure view" onClick={() => setPure(true)}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <path
                d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="8" r="2.1" fill="currentColor" />
            </svg>
          </button>
          <button title="Keyboard shortcuts (?)" onClick={() => setHelp(true)}>
            ?
          </button>
        </div>
        {asOf !== null && <Timeline data={data} value={asOf} onChange={setAsOf} onClose={() => setAsOf(null)} />}
        {pure && (
          <button className={`pure-hint ${pureHint ? "show" : ""}`} onClick={() => setPure(false)}>
            Pure view · press <kbd>Z</kbd> or <kbd>Esc</kbd> to leave
          </button>
        )}
        {chart && (
          <ChartView
            data={data}
            mode={mode}
            block={chart.block}
            focus={chart.focus}
            selected={selected}
            onSelect={(cp) => select(cp, { zoom: true })}
            onHover={(cp, x, y) => setHover(cp >= 0 ? { cp, x, y } : null)}
            onView={setChartAt}
            onClose={() => {
              setHover(null)
              setChart(null)
            }}
          />
        )}
        {hover && !pure && <Tooltip data={data} mode={mode} cp={hover.cp} x={hover.x} y={hover.y} />}
        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </div>
      <DetailPanel
        data={data}
        mode={mode}
        cp={selected}
        here={chart ? { cp: chartAt ?? data.meta.blocks[chart.block].s, k: 60 } : here}
        onPreview={previewRange}
        onSelect={(cp) => select(cp, { zoom: true })}
        onBlock={flyToBlock}
        onPlane={flyToPlane}
        onRange={flyToRange}
        onChart={openChart}
        chartBlock={chart?.block ?? null}
        onClose={() => select(null)}
      />
    </div>
  )
}
