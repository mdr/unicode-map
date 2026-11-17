import { useState } from "react"
import { type ColorMode, type ModeId, MODES } from "../map/colorModes"
import styles from "./Legend.module.css"

export const Legend = ({
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
  onPreview: (key: string | undefined) => void
}) => {
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
    <div className={`legend panel ${open ? "" : styles.collapsed}`}>
      <div className={styles.modeTabs} role="tablist">
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
          className={styles.legendToggle}
          title={open ? "Hide the key" : "Show the key: what the colours mean"}
          aria-label={open ? "Hide the key" : "Show the key"}
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
        <div className={styles.legendPins}>
          Highlighting {pinned.length} {pinned.length === 1 ? "item" : "items"}
          <button className="link" onClick={onClearPins}>
            Clear
          </button>
        </div>
      )}
      {open && (
        <>
          <div className={styles.legendHead}>
            <span className={styles.legendDesc}>{mode.description}</span>
          </div>
          {total > 16 && (
            <input
              className={styles.legendFilter}
              placeholder={`Filter ${total} items…`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          {pinned.length > 0 && (
            <div className={styles.legendPins}>
              Highlighting {pinned.length} {pinned.length === 1 ? "item" : "items"}
              <button className="link" onClick={onClearPins}>
                Clear
              </button>
            </div>
          )}
          <div className={styles.legendBody} onMouseLeave={() => onPreview(undefined)}>
            {mode.legend.map((g, gi) => {
              const items = g.items.filter(
                (it) => !f || it.label.toLowerCase().includes(f) || it.sublabel?.toLowerCase().includes(f)
              )
              if (!items.length) return undefined
              return (
                <div key={gi} className="legend-group">
                  {g.label && <div className={styles.legendGroupLabel}>{g.label}</div>}
                  {items.map((it) => (
                    <button
                      key={it.key}
                      className={`${styles.legendItem} ${pinned.includes(it.key) ? styles.pinned : ""}`}
                      onMouseEnter={() => onPreview(it.key)}
                      onClick={() => onTogglePin(it.key)}
                      title="Hover to highlight, click to pin"
                    >
                      <span className="swatch" style={{ background: it.color }} />
                      <span className={styles.legendLabel}>
                        {it.label}
                        {it.sublabel && <span className={styles.legendSub}>{it.sublabel}</span>}
                      </span>
                      <span className={styles.legendCount}>{it.count.toLocaleString()}</span>
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
