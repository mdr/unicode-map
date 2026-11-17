import { useEffect, useMemo, useRef, useState } from "react"
import { type UnicodeData, VERSION_YEARS } from "../data/unicode"

/**
 * Scrub through Unicode's history: the map shows only what had been encoded by the chosen version.
 * `value` is an index into meta.ages (1 = Unicode 1.1, last = the current version).
 */
export function Timeline({
  data,
  value,
  onChange,
  onClose
}: {
  data: UnicodeData
  value: number
  onChange: (i: number) => void
  onClose: () => void
}) {
  const ages = data.meta.ages
  const last = ages.length - 1
  const [playing, setPlaying] = useState(false)
  const valueRef = useRef(value)
  valueRef.current = value

  // Characters added per version, and the blocks that first appeared in each.
  const stats = useMemo(() => {
    const added = new Array<number>(ages.length).fill(0)
    for (let cp = 0; cp < data.ageIdx.length; cp++) if (data.isAssigned(cp)) added[data.ageIdx[cp]]++
    const total: number[] = []
    added.reduce((sum, n, i) => (total[i] = sum + n), 0)
    const newBlocks: { name: string; count: number }[][] = ages.map(() => [])
    for (const b of data.meta.blocks) {
      let first = Infinity,
        n = 0
      for (let cp = b.s; cp <= b.e; cp++) {
        if (!data.isAssigned(cp)) continue
        if (data.ageIdx[cp] < first) {
          first = data.ageIdx[cp]
          n = 0
        }
        if (data.ageIdx[cp] === first) n++
      }
      if (first !== Infinity) newBlocks[first].push({ name: b.name, count: n })
    }
    for (const nb of newBlocks) nb.sort((a, b) => b.count - a.count)
    return { added, total, newBlocks }
  }, [data, ages])

  useEffect(() => {
    if (!playing) return
    if (valueRef.current >= last) onChange(1)
    const id = setInterval(() => {
      const v = valueRef.current
      if (v >= last) {
        setPlaying(false)
        return
      }
      onChange(v + 1)
    }, 650)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  const version = ages[value]
  const nb = stats.newBlocks[value]
  const maxAdded = Math.max(...stats.added.slice(1))

  return (
    <div className="timeline panel">
      <div className="tl-row">
        <button
          className="tl-play"
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "Pause" : "Play from the start"}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <rect x="3" y="2" width="3" height="10" rx="1" fill="currentColor" />
              <rect x="8" y="2" width="3" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
              <path
                d="M4 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z"
                fill="currentColor"
              />
            </svg>
          )}
        </button>
        <div className="tl-track">
          <div className="tl-bars" aria-hidden>
            {stats.added.slice(1).map((n, i) => (
              <span
                key={i}
                className={i + 1 <= value ? "in" : ""}
                style={{ height: `${Math.max(6, Math.sqrt(n / maxAdded) * 100)}%` }}
                title={`Unicode ${ages[i + 1]}: ${n.toLocaleString()} characters added`}
              />
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={last}
            step={1}
            value={value}
            onChange={(e) => {
              setPlaying(false)
              onChange(+e.target.value)
            }}
            aria-label="Unicode version"
          />
        </div>
        <button className="tl-close link" onClick={onClose} title="Close the timeline (t)">
          ×
        </button>
      </div>
      <div className="tl-info">
        <span className="tl-version">
          Unicode {version} <span className="tl-year">{VERSION_YEARS[version] ?? ""}</span>
        </span>
        <span className="tl-stat">
          <b>{stats.total[value].toLocaleString()}</b> characters · <b>+{stats.added[value].toLocaleString()}</b> new
        </span>
        {nb.length > 0 && (
          <span className="tl-blocks" title={nb.map((b) => b.name).join(", ")}>
            New blocks:{" "}
            {nb
              .slice(0, 3)
              .map((b) => b.name)
              .join(", ")}
            {nb.length > 3 && ` and ${nb.length - 3} more`}
          </span>
        )}
      </div>
    </div>
  )
}
