import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UnicodeData } from "./data/unicode";
import { getMode, ModeId, MODES } from "./map/colorModes";
import { Camera, MapView } from "./map/MapView";
import { cellToCp, planeRect, rangeRect } from "./map/layout";
import { SearchBox } from "./ui/SearchBox";
import { Legend } from "./ui/Legend";
import { DetailPanel } from "./ui/DetailPanel";
import { Tooltip } from "./ui/Tooltip";
import { Breadcrumb } from "./ui/Breadcrumb";
import { Minimap } from "./ui/Minimap";
import { readHash, writeHash } from "./urlState";
import { HelpOverlay } from "./ui/HelpOverlay";
import { PropertyFilter } from "./ui/PropertyFilter";
import { Timeline } from "./ui/Timeline";
import { loadProps, maskOf, PropOption } from "./data/props";

export function App() {
  const [data, setData] = useState<UnicodeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    UnicodeData.load().then(setData, (e) => setError(String(e)));
  }, []);
  if (error)
    return (
      <div className="splash">
        <p>Couldn't load the Unicode data.</p>
        <p className="muted">Run <code>pnpm data</code> inside <code>nix develop</code> first.</p>
        <pre>{error}</pre>
      </div>
    );
  if (!data)
    return (
      <div className="splash">
        <div className="spinner" />
        <p className="muted">Loading the Unicode Character Database…</p>
      </div>
    );
  return <Explorer data={data} />;
}

function Explorer({ data }: { data: UnicodeData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<MapView | null>(null);
  const initial = useMemo(() => readHash(), []);
  const [modeId, setModeId] = useState<ModeId>(initial.mode ?? "region");
  const [selected, setSelected] = useState<number | null>(initial.cp ?? null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [hover, setHover] = useState<{ cp: number; x: number; y: number } | null>(null);
  const [camera, setCamera] = useState<Camera | null>(null);
  const [help, setHelp] = useState(false);
  const [prop, setProp] = useState<PropOption | null>(null);
  /** Timeline position (index into meta.ages), or null when the timeline is closed. */
  const [asOf, setAsOf] = useState<number | null>(() => {
    const i = initial.asOf ? data.meta.ages.indexOf(initial.asOf) : -1;
    return i > 0 ? i : null;
  });
  const mode = useMemo(() => getMode(data, modeId), [data, modeId]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // Create the map view once.
  useEffect(() => {
    let camTimer = 0;
    const view = new MapView(canvasRef.current!, data, {
      onHover: (cp, x, y) => setHover(cp >= 0 ? { cp, x, y } : null),
      onSelect: (cp) => select(cp, { focus: false }),
      onCamera: () => {
        if (camTimer) return;
        camTimer = window.setTimeout(() => {
          camTimer = 0;
          setCamera(view.camera);
        }, 80);
      },
    });
    viewRef.current = view;
    view.setMinimap(minimapRef.current);
    view.setMode(getMode(data, modeId));
    if (initial.view) view.setCamera(initial.view);
    if (initial.cp !== undefined) {
      view.setSelected(initial.cp);
      if (!initial.view) view.focusCp(initial.cp, { animate: false });
    }
    return () => view.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    viewRef.current?.setMode(mode);
  }, [mode]);

  // Legend highlight: hover preview wins over pinned items.
  useEffect(() => {
    const keys = preview ? [preview] : pinned;
    if (!keys.length) {
      viewRef.current?.setHighlight(null);
      return;
    }
    const values = new Set<number>();
    for (const g of mode.legend) for (const it of g.items) if (keys.includes(it.key)) it.values.forEach((v) => values.add(v));
    viewRef.current?.setHighlight(values);
  }, [mode, pinned, preview]);

  useEffect(() => {
    setPinned([]);
    setPreview(null);
  }, [modeId]);

  // Property highlight
  useEffect(() => {
    if (initial.prop) loadProps().then((opts) => setProp(opts.find((o) => o.key === initial.prop) ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    viewRef.current?.setMask(prop ? maskOf(prop) : null);
  }, [prop]);

  // Timeline
  useEffect(() => {
    viewRef.current?.setAsOf(asOf);
  }, [asOf]);
  const toggleTimeline = useCallback(() => setAsOf((a) => (a === null ? data.meta.ages.length - 1 : null)), [data]);
  const changeMode = useCallback(
    (m: ModeId) => {
      setModeId(m);
      // The timeline is the natural companion to the Age colouring.
      if (m === "age") setAsOf((a) => a ?? data.meta.ages.length - 1);
    },
    [data],
  );

  const select = useCallback((cp: number | null, opts: { focus?: boolean; zoom?: boolean } = {}) => {
    setSelected(cp);
    viewRef.current?.setSelected(cp);
    if (cp !== null && opts.focus !== false) viewRef.current?.focusCp(cp, { zoom: opts.zoom });
  }, []);

  // URL state
  const extras = () => ({ prop: prop?.key, asOf: asOf !== null ? data.meta.ages[asOf] : undefined });
  useEffect(() => {
    writeHash({ cp: selected ?? undefined, mode: modeId, view: camera ?? undefined, ...extras() }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, modeId, prop, asOf]);
  const lastPushed = useRef<number | null | undefined>(initial.cp);
  useEffect(() => {
    if (lastPushed.current === selected) return;
    lastPushed.current = selected;
    writeHash({ cp: selected ?? undefined, mode: modeId, view: viewRef.current?.camera, ...extras() }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  useEffect(() => {
    const onPop = () => {
      const s = readHash();
      lastPushed.current = s.cp ?? null;
      setSelected(s.cp ?? null);
      viewRef.current?.setSelected(s.cp ?? null);
      if (s.mode) setModeId(s.mode);
      if (s.view) viewRef.current?.flyTo(s.view);
      else if (s.cp !== undefined) viewRef.current?.focusCp(s.cp);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const flyToBlock = useCallback(
    (index: number) => {
      const b = data.meta.blocks[index];
      viewRef.current?.flyToRect(rangeRect(b.s, b.e));
    },
    [data],
  );
  const flyToPlane = useCallback((p: number) => viewRef.current?.flyToRect(planeRect(p), { pad: 1.08 }), []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const view = viewRef.current;
      if (!view) return;
      const cur = selectedRef.current;
      const centre = () => {
        const c = view.camera;
        const cp = cellToCp(c.cx, c.cy);
        return cp >= 0 ? cp : 0;
      };
      const move = (delta: number, assignedOnly = false) => {
        let cp = cur ?? centre();
        do {
          cp += delta;
        } while (assignedOnly && cp > 0 && cp < 0x10ffff && !data.isAssigned(cp));
        cp = Math.max(0, Math.min(0x10ffff, cp));
        select(cp, { zoom: true });
      };
      const blocks = data.meta.blocks;
      switch (e.key) {
        case "ArrowLeft": move(-1, e.shiftKey); break;
        case "ArrowRight": move(1, e.shiftKey); break;
        case "ArrowUp": move(-256); break;
        case "ArrowDown": move(256); break;
        case "]":
        case "[": {
          const at = cur ?? centre();
          const i = e.key === "]" ? blocks.findIndex((b) => b.s > at) : blocks.findLastIndex((b) => b.e < at);
          if (i >= 0) {
            select(blocks[i].s, { focus: false });
            flyToBlock(i);
          }
          break;
        }
        case "}":
        case "{": {
          const p = ((cur ?? centre()) >> 16) + (e.key === "}" ? 1 : -1);
          if (p >= 0 && p <= 16) {
            select(null);
            flyToPlane(p);
          }
          break;
        }
        case "Enter":
          if (cur !== null) view.focusCp(cur);
          break;
        case "Escape":
          if (help) setHelp(false);
          else select(null);
          break;
        case "+":
        case "=": view.zoomBy(2); break;
        case "-":
        case "_": view.zoomBy(0.5); break;
        case "0": view.overview(); break;
        case "?": setHelp((h) => !h); break;
        case "t": toggleTimeline(); break;
        case "p": (document.querySelector(".pf-open") as HTMLButtonElement | null)?.click(); break;
        case "/":
          e.preventDefault();
          document.getElementById("search-input")?.focus();
          break;
        default: {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= MODES.length) changeMode(MODES[n - 1].id);
          else return;
        }
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, select, flyToBlock, flyToPlane, help, toggleTimeline, changeMode]);

  return (
    <div className="app">
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
          <Breadcrumb data={data} camera={camera} selected={selected} onPlane={flyToPlane} onBlock={flyToBlock} onOverview={() => viewRef.current?.overview()} onRange={(a, b) => viewRef.current?.flyToRect(rangeRect(a, b), { pad: 1.6, maxK: 90 })} />
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
          <button title="Zoom in (+)" onClick={() => viewRef.current?.zoomBy(2)}>+</button>
          <button title="Zoom out (−)" onClick={() => viewRef.current?.zoomBy(0.5)}>−</button>
          <button title="Show everything (0)" onClick={() => viewRef.current?.overview()}>⤢</button>
          <button title="Timeline: Unicode through the versions (t)" className={asOf !== null ? "on" : ""} onClick={toggleTimeline}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
              <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button title="Keyboard shortcuts (?)" onClick={() => setHelp(true)}>?</button>
        </div>
        <Minimap view={viewRef} canvasRef={minimapRef} />
        {asOf !== null && <Timeline data={data} value={asOf} onChange={setAsOf} onClose={() => setAsOf(null)} />}
        {hover && <Tooltip data={data} mode={mode} cp={hover.cp} x={hover.x} y={hover.y} />}
        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </div>
      <DetailPanel
        data={data}
        mode={mode}
        cp={selected}
        camera={camera}
        onSelect={(cp) => select(cp, { zoom: true })}
        onBlock={flyToBlock}
        onPlane={flyToPlane}
        onClose={() => select(null)}
      />
    </div>
  );
}
