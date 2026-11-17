import { planeName, uplus, type UnicodeData } from "../data/unicode"
import type { Here } from "../map/MapView"
import type { CodePoint, Plane, BlockIndex } from "../units"

export const Breadcrumb = ({
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
  here: Here | undefined
  selected: CodePoint | undefined
  onPlane: (p: Plane) => void
  onBlock: (i: BlockIndex) => void
  onOverview: () => void
  onRange: (s: CodePoint, e: CodePoint) => void
  onPreview: (r: { s: CodePoint; e: CodePoint; name: string } | undefined) => void
}) => {
  // Where are we? The selection if there is one, otherwise the centre of the view (when zoomed in).
  let cp: CodePoint | undefined = selected
  if (cp === undefined && here && here.k > 2.5 && here.cp >= 0) cp = here.cp
  const plane = cp !== undefined ? cp >> 16 : undefined
  const bi = cp !== undefined ? (data.blockIdx[cp] ?? -1) : -1
  const block = bi >= 0 ? data.blockAt(bi) : undefined
  // The chart section, once zoomed in far enough to see sections (or with a selection).
  const section =
    cp !== undefined && (selected !== undefined || (here?.k ?? 0) > 10) ? data.sectionRange(cp) : undefined
  return (
    <nav className="breadcrumb">
      <button onClick={onOverview}>All planes</button>
      {plane !== undefined && (
        <>
          <span className="sep">›</span>
          <button
            onClick={() => onPlane(plane)}
            title={planeName(plane)[0]}
            onMouseEnter={() =>
              onPreview({ s: plane << 16, e: (plane << 16) | 0xffff, name: `Plane ${plane} · ${planeName(plane)[0]}` })
            }
            onMouseLeave={() => onPreview(undefined)}
          >
            Plane {plane}
            {planeName(plane)[1] && <span className="muted"> {planeName(plane)[1]}</span>}
          </button>
        </>
      )}
      {block && (
        <>
          <span className="sep">›</span>
          <button
            onClick={() => onBlock(bi)}
            onMouseEnter={() => onPreview({ s: block.s, e: block.e, name: block.name })}
            onMouseLeave={() => onPreview(undefined)}
          >
            <span className="crumb-dot" style={{ background: data.regionOf(block).color }} />
            {block.name}
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
            onMouseLeave={() => onPreview(undefined)}
          >
            {section[2]}
          </button>
        </>
      )}
      {selected !== undefined && (
        <>
          <span className="sep">›</span>
          <span className="crumb-current mono">{uplus(selected)}</span>
        </>
      )}
    </nav>
  )
}
