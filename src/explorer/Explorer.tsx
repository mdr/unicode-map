import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { UnicodeData } from "../data/unicode"
import { getMode, ModeId, MODES } from "../map/colorModes"
import { type Camera, type Here, MapView } from "../map/MapView"
import { planeRect } from "../map/layout"
import { required } from "../required"
import { SearchBox } from "../ui/SearchBox"
import { Legend } from "../ui/Legend"
import { DetailPanel } from "../ui/detail/DetailPanel"
import { Tooltip } from "../ui/Tooltip"
import { Breadcrumb } from "../ui/Breadcrumb"
import { readHash, writeHash } from "../urlState"
import { HelpOverlay } from "../ui/HelpOverlay"
import { PropertyFilter } from "../ui/PropertyFilter"
import { Timeline } from "../ui/Timeline"
import { ChartView } from "../ui/chart/ChartView"
import { loadProps, maskOf, type PropOption } from "../data/props"
import { KeyActionType, type SimpleAction } from "./keyActions"
import { MapControls } from "./MapControls"
import { neighbourBlock, stepCodePoint } from "./navigation"
import { useKeyboard } from "./useKeyboard"
import type { CodePoint, Plane, BlockIndex } from "../units"
import styles from "./Explorer.module.css"

export const Explorer = ({ data }: { data: UnicodeData }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<MapView>(undefined)
  const initial = useMemo(() => readHash(), [])
  const [modeId, setModeId] = useState<ModeId>(initial.mode ?? ModeId.REGION)
  const [selected, setSelected] = useState<number | undefined>(initial.cp)
  const [pinned, setPinned] = useState<string[]>([])
  const [preview, setPreview] = useState<string>()
  const [hover, setHover] = useState<{ cp: CodePoint; x: number; y: number }>()
  const [camera, setCamera] = useState<Camera>()
  /** Where the view is (centre of the visible area), updated once the camera settles. */
  const [here, setHere] = useState<Here>()
  const [help, setHelp] = useState(false)
  const [prop, setProp] = useState<PropOption>()
  /** Pure view: just the map, no interface or colouring. */
  const [pure, setPure] = useState(initial.pure ?? false)
  const [pureHint, setPureHint] = useState(false)
  /** Glyph texture in the normal view when zoomed out (experimental; `g` toggles it). */
  const [glyphTexture, setGlyphTexture] = useState(true)
  useEffect(() => viewRef.current?.setGlyphTexture(glyphTexture), [glyphTexture])
  /** Timeline position (index into meta.ages), or undefined when the timeline is closed. */
  const [asOf, setAsOf] = useState<number | undefined>(() => {
    const i = initial.asOf ? data.meta.ages.indexOf(initial.asOf) : -1
    return i > 0 ? i : undefined
  })
  /** Chart view: a block laid out like the Unicode code charts, in place of the map. */
  const [chart, setChart] = useState<{ block: BlockIndex; focus?: [number, number] } | undefined>(() => {
    const i = initial.chart !== undefined ? data.meta.blocks.findIndex((b) => b.s === initial.chart) : -1
    return i >= 0 ? { block: i } : undefined
  })
  const chartRef = useRef(chart)
  chartRef.current = chart
  /** The code point at the middle of the chart's visible columns, for the sidebar to follow. */
  const [chartAt, setChartAt] = useState<number>()
  const mode = useMemo(() => getMode(data, modeId), [data, modeId])

  // Create the map view once.
  useEffect(() => {
    let camTimer = 0
    const view = new MapView(canvasRef.current!, data, {
      onHover: (cp, x, y) => setHover(cp >= 0 ? { cp, x, y } : undefined),
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
      viewRef.current?.setHighlight(undefined)
      return
    }
    const values = new Set<number>()
    for (const g of mode.legend)
      for (const it of g.items) if (keys.includes(it.key)) it.values.forEach((v) => values.add(v))
    viewRef.current?.setHighlight(values)
  }, [mode, pinned, preview])

  useEffect(() => {
    setPinned([])
    setPreview(undefined)
  }, [modeId])

  // Property highlight
  useEffect(() => {
    if (initial.prop) void loadProps().then((opts) => setProp(opts.find((o) => o.key === initial.prop)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    viewRef.current?.setMask(prop ? maskOf(prop) : undefined)
  }, [prop])

  // Pure view. A hint on how to leave shows on entering and whenever the mouse moves.
  useEffect(() => {
    viewRef.current?.setPure(pure)
    if (!pure) return
    setHelp(false)
    setHover(undefined)
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
  const toggleTimeline = useCallback(
    () => setAsOf((a) => (a === undefined ? data.meta.ages.length - 1 : undefined)),
    [data]
  )
  const changeMode = useCallback(
    (m: ModeId) => {
      setModeId(m)
      // The timeline is the natural companion to the Age colouring.
      if (m === ModeId.AGE) setAsOf((a) => a ?? data.meta.ages.length - 1)
    },
    [data]
  )

  const select = useCallback((cp: CodePoint | undefined, opts: { focus?: boolean; zoom?: boolean } = {}) => {
    setSelected(cp)
    viewRef.current?.setSelected(cp)
    if (cp !== undefined && opts.focus !== false) viewRef.current?.focusCp(cp, { zoom: opts.zoom })
  }, [])

  // URL state
  const extras = () => ({
    prop: prop?.key,
    asOf: asOf !== undefined ? data.meta.ages[asOf] : undefined,
    pure,
    chart: chart ? data.blockAt(chart.block).s : undefined
  })
  useEffect(() => {
    writeHash({ cp: selected, mode: modeId, view: camera, ...extras() }, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, modeId, prop, asOf, pure])
  // Opening and closing a chart are history steps, so Back returns to the map.
  const lastChart = useRef(chart?.block)
  useEffect(() => {
    if (lastChart.current === chart?.block) return
    lastChart.current = chart?.block
    writeHash({ cp: selected, mode: modeId, view: viewRef.current?.camera, ...extras() }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart?.block])
  const lastPushed = useRef<number | undefined>(initial.cp)
  useEffect(() => {
    if (lastPushed.current === selected) return
    lastPushed.current = selected
    writeHash({ cp: selected, mode: modeId, view: viewRef.current?.camera, ...extras() }, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])
  useEffect(() => {
    const onPop = () => {
      const s = readHash()
      lastPushed.current = s.cp
      setSelected(s.cp)
      viewRef.current?.setSelected(s.cp)
      if (s.mode) setModeId(s.mode)
      const ci = s.chart !== undefined ? data.meta.blocks.findIndex((b) => b.s === s.chart) : -1
      lastChart.current = ci >= 0 ? ci : undefined
      setChart(ci >= 0 ? { block: ci } : undefined)
      if (s.view) viewRef.current?.flyTo(s.view)
      else if (s.cp !== undefined) viewRef.current?.focusCp(s.cp)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [data.meta.blocks])

  const flyToBlock = useCallback(
    (index: BlockIndex) => {
      const b = data.blockAt(index)
      // With a chart open, blocks open in the chart instead.
      if (chartRef.current) setChart({ block: index })
      viewRef.current?.showRange(b.s, b.e)
    },
    [data]
  )
  const flyToRange = useCallback(
    (a: number, b: number) => {
      if (chartRef.current) setChart({ block: data.blockIdx[a] ?? -1, focus: [a, b] })
      viewRef.current?.showRange(a, b)
    },
    [data]
  )
  /** Open the chart for a block, or the block a code point is in. */
  const openChart = useCallback((block: BlockIndex, focus?: [number, number]) => {
    if (block >= 0) setChart({ block, focus })
  }, [])
  const previewRange = useCallback(
    (r: { s: CodePoint; e: CodePoint; name: string } | undefined) => viewRef.current?.setPreview(r),
    []
  )
  const flyToPlane = useCallback((p: Plane) => {
    viewRef.current?.clearPinned()
    viewRef.current?.flyToRect(planeRect(p), { pad: 1.08 })
  }, [])

  // Keyboard navigation
  const centreCp = (): number => Math.max(0, viewRef.current?.centreCp() ?? 0)
  const moveSelection = (delta: number, assignedOnly: boolean): void => {
    const ch = chart
    const from = selected ?? (ch ? data.blockAt(ch.block).s - delta : centreCp())
    const cp = stepCodePoint(from, delta, assignedOnly, (c) => data.isAssigned(c))
    // In a chart, moving past either end of the block opens the next one's chart.
    const b = ch && data.blockAt(ch.block)
    if (b && (cp < b.s || cp > b.e)) {
      const next = data.blockIdx[cp] ?? -1
      if (next < 0) return
      setChart({ block: next })
    }
    // Arrow keys only ever pan the map, never zoom it.
    select(cp, { zoom: false })
  }
  const stepBlock = (direction: 1 | -1): void => {
    const i = neighbourBlock(data.meta.blocks, selected ?? centreCp(), direction)
    if (i < 0) return
    select(data.blockAt(i).s, { focus: false })
    flyToBlock(i)
  }
  const stepPlane = (direction: 1 | -1): void => {
    const p = ((selected ?? centreCp()) >> 16) + direction
    if (p < 0 || p > 16) return
    select(undefined)
    flyToPlane(p)
  }
  const escape = (): void => {
    if (help) setHelp(false)
    else if (chart) setChart(undefined)
    else {
      select(undefined)
      viewRef.current?.clearPinned()
    }
  }
  const keyHandlers: Record<SimpleAction["type"], () => void> = {
    [KeyActionType.NEXT_BLOCK]: () => stepBlock(1),
    [KeyActionType.PREVIOUS_BLOCK]: () => stepBlock(-1),
    [KeyActionType.NEXT_PLANE]: () => stepPlane(1),
    [KeyActionType.PREVIOUS_PLANE]: () => stepPlane(-1),
    [KeyActionType.FOCUS_SELECTION]: () => selected !== undefined && viewRef.current?.focusCp(selected),
    [KeyActionType.TOGGLE_CHART]: () =>
      chart ? setChart(undefined) : openChart(data.blockIdx[selected ?? centreCp()] ?? -1),
    [KeyActionType.ESCAPE]: escape,
    [KeyActionType.ZOOM_IN]: () => viewRef.current?.zoomBy(2),
    [KeyActionType.ZOOM_OUT]: () => viewRef.current?.zoomBy(0.5),
    [KeyActionType.OVERVIEW]: () => viewRef.current?.overview(),
    [KeyActionType.TOGGLE_HELP]: () => setHelp((h) => !h),
    [KeyActionType.TOGGLE_TIMELINE]: toggleTimeline,
    [KeyActionType.ENTER_PURE]: () => setPure(true),
    [KeyActionType.LEAVE_PURE]: () => setPure(false),
    [KeyActionType.TOGGLE_GLYPH_TEXTURE]: () => setGlyphTexture((g) => !g),
    [KeyActionType.OPEN_PROPERTIES]: () => document.querySelector<HTMLElement>(".pf-open")?.click(),
    [KeyActionType.FOCUS_SEARCH]: () => document.getElementById("search-input")?.focus()
  }
  useKeyboard({ pure, inChart: chart !== undefined, modeCount: MODES.length }, (action) => {
    if (!viewRef.current) return false
    if (action.type === KeyActionType.MOVE) moveSelection(action.delta, action.assignedOnly)
    else if (action.type === KeyActionType.MODE) changeMode(required(MODES[action.index], "colour mode").id)
    else keyHandlers[action.type]()
    return true
  })

  return (
    <div className={`app ${pure ? "pure" : ""} ${chart ? styles.charting : ""}`}>
      <div className="map-area">
        <canvas ref={canvasRef} className="map-canvas" />
        <div className={styles.topBar}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>U+</span>
            <div>
              <div className={styles.brandTitle}>Unicode Map</div>
              <div className={styles.brandSub}>Unicode {data.meta.version}</div>
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
        <MapControls
          timelineOpen={asOf !== undefined}
          onZoom={(factor) => viewRef.current?.zoomBy(factor)}
          onOverview={() => viewRef.current?.overview()}
          onTimeline={toggleTimeline}
          onPure={() => setPure(true)}
          onHelp={() => setHelp(true)}
        />
        {asOf !== undefined && (
          <Timeline data={data} value={asOf} onChange={setAsOf} onClose={() => setAsOf(undefined)} />
        )}
        {pure && (
          <button className={`${styles.pureHint} ${pureHint ? "show" : ""}`} onClick={() => setPure(false)}>
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
            onHover={(cp, x, y) => setHover(cp >= 0 ? { cp, x, y } : undefined)}
            onView={setChartAt}
            onClose={() => {
              setHover(undefined)
              setChart(undefined)
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
        here={chart ? { cp: chartAt ?? data.blockAt(chart.block).s, k: 60 } : here}
        onPreview={previewRange}
        onSelect={(cp) => select(cp, { zoom: true })}
        onBlock={flyToBlock}
        onPlane={flyToPlane}
        onRange={flyToRange}
        onChart={openChart}
        chartBlock={chart?.block}
        onClose={() => select(undefined)}
      />
    </div>
  )
}
