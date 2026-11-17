import { planeName, uplus, UnicodeData } from "../data/unicode"
import type { Here } from "../map/MapView"

export function Breadcrumb({
  data,
  here,
  selected,
  onPlane,
  onBlock,
  onOverview,
  onRange,
  onPreview
}: {
  data: UnicodeData
  here: Here | null
  selected: number | null
  onPlane: (p: number) => void
  onBlock: (i: number) => void
  onOverview: () => void
  onRange: (s: number, e: number) => void
  onPreview: (r: { s: number; e: number; name: string } | null) => void
}) {
  // Where are we? The selection if there is one, otherwise the centre of the view (when zoomed in).
  let cp: number | null = selected
  if (cp === null && here && here.k > 2.5 && here.cp >= 0) cp = here.cp
  const plane = cp !== null ? cp >> 16 : null
  const bi = cp !== null ? data.blockIdx[cp] : -1
  // The chart section, once zoomed in far enough to see sections (or with a selection).
  const section = cp !== null && (selected !== null || (here?.k ?? 0) > 10) ? data.sectionRange(cp) : undefined
  return (
    <nav className="breadcrumb">
      <button onClick={onOverview}>All planes</button>
      {plane !== null && (
        <>
          <span className="sep">›</span>
          <button
            onClick={() => onPlane(plane)}
            title={planeName(plane)[0]}
            onMouseEnter={() =>
              onPreview({ s: plane << 16, e: (plane << 16) | 0xffff, name: `Plane ${plane} · ${planeName(plane)[0]}` })
            }
            onMouseLeave={() => onPreview(null)}
          >
            Plane {plane}
            {planeName(plane)[1] && <span className="muted"> {planeName(plane)[1]}</span>}
          </button>
        </>
      )}
      {bi >= 0 && (
        <>
          <span className="sep">›</span>
          <button
            onClick={() => onBlock(bi)}
            onMouseEnter={() =>
              onPreview({ s: data.meta.blocks[bi].s, e: data.meta.blocks[bi].e, name: data.meta.blocks[bi].name })
            }
            onMouseLeave={() => onPreview(null)}
          >
            <span className="crumb-dot" style={{ background: data.meta.regions[data.meta.blocks[bi].region].color }} />
            {data.meta.blocks[bi].name}
          </button>
        </>
      )}
      {section && (
        <>
          <span className="sep">›</span>
          <button
            onClick={() => onRange(section[0], section[1])}
            className="crumb-section"
            onMouseEnter={() => onPreview({ s: section[0], e: section[1], name: section[2] })}
            onMouseLeave={() => onPreview(null)}
          >
            {section[2]}
          </button>
        </>
      )}
      {selected !== null && (
        <>
          <span className="sep">›</span>
          <span className="crumb-current mono">{uplus(selected)}</span>
        </>
      )}
    </nav>
  )
}
