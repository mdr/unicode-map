import { uplus, type UnicodeData } from "../../data/unicode"
import { Glyph } from "../Glyph"
import type { CodePoint } from "../../units"
import styles from "./detail.module.css"

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
    <div className={styles.related}>
      <div className={styles.relatedLabel}>{label}</div>
      <div className={styles.chips}>
        {cps.map((c, i) => (
          <CharChip key={`${c}-${i}`} cp={c} data={data} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

const CharChip = ({ cp, data, onSelect }: { cp: CodePoint; data: UnicodeData; onSelect: (cp: CodePoint) => void }) => (
  <button className={styles.charChip} onClick={() => onSelect(cp)} title={`${uplus(cp)} ${data.name(cp)}`}>
    <Glyph data={data} cp={cp} className={styles.ccGlyph} />
    <span className={styles.ccText}>
      <span className="mono">{uplus(cp)}</span>
      <span className={styles.ccName}>{data.name(cp)}</span>
    </span>
  </button>
)
