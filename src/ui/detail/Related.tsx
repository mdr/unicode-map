import { uplus, type UnicodeData } from "../../data/unicode"
import { Glyph } from "../Glyph"
import type { CodePoint } from "../../units"

export const Related = ({
  label,
  cps,
  data,
  onSelect
}: {
  label: string
  cps: number[]
  data: UnicodeData
  onSelect: (cp: CodePoint) => void
}) => {
  if (!cps.length) return undefined
  return (
    <div className="related">
      <div className="related-label">{label}</div>
      <div className="chips">
        {cps.map((c, i) => (
          <CharChip key={`${c}-${i}`} cp={c} data={data} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

const CharChip = ({ cp, data, onSelect }: { cp: CodePoint; data: UnicodeData; onSelect: (cp: CodePoint) => void }) => (
  <button className="char-chip" onClick={() => onSelect(cp)} title={`${uplus(cp)} ${data.name(cp)}`}>
    <Glyph data={data} cp={cp} className="cc-glyph" />
    <span className="cc-text">
      <span className="mono">{uplus(cp)}</span>
      <span className="cc-name">{data.name(cp)}</span>
    </span>
  </button>
)
