import { type Detail, hex, MAX_CP, uplus, type UnicodeData } from "../../data/unicode"
import { type ColorMode, cpColor } from "../../map/colorModes"
import { Glyph } from "../Glyph"
import { CopyButton } from "./CopyButton"
import type { CodePoint } from "../../units"
import styles from "./detail.module.css"

export const CharacterHero = ({
  data,
  mode,
  cp,
  detail: d,
  onSelect,
  onClose
}: {
  data: UnicodeData
  mode: ColorMode
  cp: CodePoint
  detail: Detail
  onSelect: (cp: CodePoint) => void
  onClose: () => void
}) => {
  const assigned = data.isAssigned(cp)
  const gc = data.gc(cp)
  const block = data.block(cp)
  return (
    <div className={styles.cpHero} style={{ ["--accent" as string]: cpColor(mode, cp) }}>
      <button className={styles.close} onClick={onClose} title="Close (Esc)">
        ×
      </button>
      <div className={styles.cpGlyph}>{assigned && <Glyph data={data} cp={cp} />}</div>
      <div className={styles.cpId}>
        <span className={`mono ${styles.cpUplus}`}>{uplus(cp)}</span>
        <CopyButton text={String.fromCodePoint(cp)} label="Copy character" disabled={gc.code === "Cs"} />
      </div>
      <h1 className={styles.cpName}>{data.name(cp)}</h1>
      {d.section && <div className={styles.cpSection}>{d.section}</div>}
      <div className={styles.cpNav}>
        <button onClick={() => cp > 0 && onSelect(cp - 1)} title="Previous (←)">
          ‹ {hex(Math.max(0, cp - 1))}
        </button>
        <button onClick={() => cp < MAX_CP - 1 && onSelect(cp + 1)} title="Next (→)">
          {hex(Math.min(MAX_CP - 1, cp + 1))} ›
        </button>
      </div>
      <div className={styles.cpLinks}>
        <a
          href={`https://util.unicode.org/UnicodeJsps/character.jsp?a=${hex(cp)}`}
          target="_blank"
          rel="noreferrer"
          title="This character's properties, on the Unicode Consortium's site"
        >
          unicode.org ↗
        </a>
        {block && (
          <a
            href={`https://www.unicode.org/charts/PDF/U${hex(block.s)}.pdf`}
            target="_blank"
            rel="noreferrer"
            title={`The official code chart for ${block.name} (PDF)`}
          >
            Code chart ↗
          </a>
        )}
        {d.unihan && (
          <a
            href={`https://www.unicode.org/cgi-bin/GetUnihanData.pl?codepoint=${hex(cp)}`}
            target="_blank"
            rel="noreferrer"
            title="This ideograph in the Unihan database"
          >
            Unihan ↗
          </a>
        )}
      </div>
    </div>
  )
}
