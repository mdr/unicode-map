import type { UnicodeData } from "../../data/unicode"
import type { CodePoint } from "../../units"
import { InterpretationChoice } from "../InterpretationChoice"
import { Row, Rows, Section } from "./Rows"
import styles from "./detail.module.css"

/**
 * Private use, for a private-use code point or block (no `cp`): what it means, a choice of
 * interpretation to show private-use characters by, and what the one in effect makes of the
 * code point.
 */
export const PrivateUse = ({
  data,
  cp,
  onInterpretation
}: {
  data: UnicodeData
  cp?: CodePoint
  onInterpretation: (id: string | undefined) => void
}) => {
  const interp = data.interpretation
  const ic = cp === undefined ? undefined : data.interpretedChar(cp)
  const section = cp === undefined ? undefined : data.section(cp)
  const gcName = ic && data.meta.gc.find((g) => g.code === ic.gc)?.name
  return (
    <Section title="Private use">
      <p className={styles.puaNote}>
        Unicode gives {cp === undefined ? "these code points" : "this code point"} no meaning of its own: they're left
        for private agreements, such as registries of invented scripts. Show private-use characters as:
      </p>
      <InterpretationChoice value={interp?.id} onChange={onInterpretation} />
      {interp && ic && (
        <Rows>
          <Row label="Name">{ic.name}</Row>
          {section && <Row label="Script">{section}</Row>}
          {gcName && <Row label="Category">{gcName}</Row>}
          <Row label="Font">{interp.fonts[ic.font]?.family ?? "None has it"}</Row>
        </Rows>
      )}
      {interp && cp !== undefined && !ic && (
        <p className={styles.puaNote}>The {interp.name} registry doesn't assign this code point.</p>
      )}
      {interp && (
        <p className={styles.puaNote}>
          From the{" "}
          <a href={interp.url} target="_blank" rel="noreferrer">
            {interp.source}
          </a>
          , where constructed and fictional scripts, such as Tengwar, Klingon and Toki Pona's sitelen pona, get agreed
          private-use code points.
        </p>
      )}
    </Section>
  )
}
