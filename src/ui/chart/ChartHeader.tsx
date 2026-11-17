import { hex, uplus, type Block, type UnicodeData } from "../../data/unicode"

export const ChartHeader = ({
  data,
  block,
  assigned,
  sectionCount,
  onZoom,
  onClose
}: {
  data: UnicodeData
  block: Block
  assigned: number
  sectionCount: number
  onZoom: (factor: number) => void
  onClose: () => void
}) => (
  <header className="chart-head">
    <div className="chart-title">
      <span className="swatch" style={{ background: data.regionOf(block).color }} />
      <h2>{block.name}</h2>
      <span className="muted mono small">
        {uplus(block.s)}–{uplus(block.e)}
      </span>
      <span className="muted small">
        · {assigned.toLocaleString()} of {(block.e - block.s + 1).toLocaleString()} assigned
        {sectionCount > 1 && ` · ${sectionCount} sections`}
      </span>
    </div>
    <div className="chart-actions">
      <button title="Smaller" onClick={() => onZoom(1 / 1.25)}>
        −
      </button>
      <button title="Larger" onClick={() => onZoom(1.25)}>
        +
      </button>
      <a
        className="chart-pdf"
        href={`https://www.unicode.org/charts/PDF/U${hex(block.s)}.pdf`}
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
)
