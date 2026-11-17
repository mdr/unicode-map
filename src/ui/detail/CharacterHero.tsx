import { type RefObject, useLayoutEffect, useRef } from "react"
import { type Detail, displayString, hex, MAX_CP, uplus, type UnicodeData } from "../../data/unicode"
import { type ColorMode, cpColor } from "../../map/colorModes"
import { Glyph } from "../Glyph"
import { pageInkReach } from "../../map/view/glyphFit"
import { CopyButton } from "./CopyButton"
import type { CodePoint } from "../../units"
import styles from "./detail.module.css"

/** Room kept between a glyph's ink and the edge of the hero box. */
const HERO_MARGIN = 10

/** Shrinks the hero's glyph when its ink won't fit its box (﷽, tall stacks), once its font has loaded. */
const useFitGlyph = (data: UnicodeData, cp: CodePoint): RefObject<HTMLDivElement | null> => {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const str = displayString(data, cp)
    const fit = (): void => {
      const el = box.current
      const glyph = el?.firstElementChild
      const reach = str && pageInkReach(str, data.glyphFamily(cp))
      if (!el || !(glyph instanceof HTMLElement) || !reach) return
      const em = parseFloat(getComputedStyle(el).fontSize)
      const scale = Math.min(
        1,
        (el.clientWidth / 2 - HERO_MARGIN) / (reach.x * em),
        (el.clientHeight / 2 - HERO_MARGIN) / (reach.y * em)
      )
      glyph.style.fontSize = scale < 1 ? `${scale}em` : ""
    }
    fit()
    document.fonts.addEventListener("loadingdone", fit)
    return () => document.fonts.removeEventListener("loadingdone", fit)
  }, [data, cp])
  return box
}

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
  const glyphBox = useFitGlyph(data, cp)
  return (
    <div className={styles.cpHero} style={{ ["--accent" as string]: cpColor(mode, cp) }}>
      <button className={styles.close} onClick={onClose} title="Close (Esc)">
        ×
      </button>
      <div className={styles.cpGlyph} ref={glyphBox}>
        {assigned && <Glyph data={data} cp={cp} />}
      </div>
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
