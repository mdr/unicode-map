import type { Detail, UnicodeData } from "../../data/unicode"
import { Section, Rows, Row } from "./Rows"
import { Linkified } from "./Linkified"
import type { CodePoint } from "../../units"
import styles from "./detail.module.css"

const ALIAS_LABELS: Record<string, string> = {
  correction: "Corrected name",
  control: "Control name",
  alternate: "Alternate name",
  figment: "Figment",
  abbreviation: "Abbreviation"
}
const aliasLabel = (type: string): string => ALIAS_LABELS[type] ?? type

/** Aliases and NamesList annotations. */
export const NamesNotes = ({
  data,
  detail: d,
  onSelect
}: {
  data: UnicodeData
  detail: Detail
  onSelect: (cp: CodePoint) => void
}) => {
  if (![d.aliases, d.alsoKnownAs, d.formalAlias, d.notes, d.variations].some(Boolean)) return undefined
  return (
    <Section title="Names & notes">
      {d.aliases && (
        <Rows>
          {d.aliases.map(([a, t]) => (
            <Row key={a} label={aliasLabel(t)}>
              {a}
            </Row>
          ))}
        </Rows>
      )}
      {d.formalAlias && (
        <Rows>
          {d.formalAlias.map((a) => (
            <Row key={a} label="Formal alias">
              {a}
            </Row>
          ))}
        </Rows>
      )}
      {d.alsoKnownAs && (
        <div className={`${styles.chips} text`}>
          {d.alsoKnownAs.map((a) => (
            <span key={a} className={styles.chip}>
              {a}
            </span>
          ))}
        </div>
      )}
      {d.notes && (
        <ul className={styles.notes}>
          {d.notes.map((n) => (
            <li key={n}>
              <Linkified text={n} data={data} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
      {d.variations && (
        <ul className={styles.notes}>
          {d.variations.map((n) => (
            <li key={n}>
              <Linkified text={n} data={data} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
