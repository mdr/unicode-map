import { useState } from "react"
import { ColorMode, ModeId, MODES } from "../map/colorModes"

export function Legend({
  mode,
  modeId,
  onMode,
  pinned,
  onTogglePin,
  onClearPins,
  onPreview
}: {
  mode: ColorMode
  modeId: ModeId
  onMode: (m: ModeId) => void
  pinned: string[]
  onTogglePin: (key: string) => void
  onClearPins: () => void
  onPreview: (key: string | null) => void
}) {
  const [filter, setFilter] = useState("")
  // Just the mode tabs until you ask for the key; remembered between visits.
  const [open, setOpenState] = useState(() => {
    try {
      return localStorage.getItem("umap.legend") === "open"
    } catch {
      return false
    }
  })
  const setOpen = (o: boolean) => {
    setOpenState(o)
    try {
      localStorage.setItem("umap.legend", o ? "open" : "closed")
    } catch {
      /* private mode etc. */
    }
  }
  const total = mode.legend.reduce((n, g) => n + g.items.length, 0)
  const f = filter.trim().toLowerCase()

  return (
    <div className={`legend panel ${open ? "" : "collapsed"}`}>
      <div className="mode-tabs" role="tablist">
        {MODES.map((m, i) => (
          <button
            key={m.id}
            role="tab"
            className={m.id === modeId ? "active" : ""}
            title={`${m.description} (${i + 1})`}
            onClick={() => onMode(m.id)}
          >
            {m.label}
          </button>
        ))}
        <button
          className="legend-toggle"
          title={open ? "Hide the key" : "Show the key: what the colours mean"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path
              d={open ? "M3 7.5 6 4.5l3 3" : "M3 4.5 6 7.5l3-3"}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
      {!open && pinned.length > 0 && (
        <div className="legend-pins">
          Highlighting {pinned.length} {pinned.length === 1 ? "item" : "items"}
          <button className="link" onClick={onClearPins}>
            Clear
          </button>
        </div>
      )}
      {open && (
        <>
          <div className="legend-head">
            <span className="legend-desc">{mode.description}</span>
          </div>
          {total > 16 && (
            <input
              className="legend-filter"
              placeholder={`Filter ${total} items…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          {pinned.length > 0 && (
            <div className="legend-pins">
              Highlighting {pinned.length} {pinned.length === 1 ? "item" : "items"}
              <button className="link" onClick={onClearPins}>
                Clear
              </button>
            </div>
          )}
          <div className="legend-body" onMouseLeave={() => onPreview(null)}>
            {mode.legend.map((g, gi) => {
              const items = g.items.filter(
                (it) => !f || it.label.toLowerCase().includes(f) || it.sublabel?.toLowerCase().includes(f)
              )
              if (!items.length) return null
              return (
                <div key={gi} className="legend-group">
                  {g.label && <div className="legend-group-label">{g.label}</div>}
                  {items.map((it) => (
                    <button
                      key={it.key}
                      className={`legend-item ${pinned.includes(it.key) ? "pinned" : ""}`}
                      onMouseEnter={() => onPreview(it.key)}
                      onClick={() => onTogglePin(it.key)}
                      title="Hover to highlight, click to pin"
                    >
                      <span className="swatch" style={{ background: it.color }} />
                      <span className="legend-label">
                        {it.label}
                        {it.sublabel && <span className="legend-sub">{it.sublabel}</span>}
                      </span>
                      <span className="legend-count">{it.count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
