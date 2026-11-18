import { INTERPRETATIONS } from "../data/interpretations"
import styles from "./InterpretationChoice.module.css"

/** A choice of interpretation for the Private Use Areas, or none. */
export const InterpretationChoice = ({
  value,
  onChange
}: {
  value: string | undefined
  onChange: (id: string | undefined) => void
}) => (
  <div className={styles.choices} role="radiogroup" aria-label="Interpretation of the Private Use Areas">
    {[{ id: undefined, name: "None" }, ...INTERPRETATIONS].map((c) => (
      <button
        key={c.name}
        role="radio"
        aria-checked={value === c.id}
        className={value === c.id ? "on" : ""}
        onClick={() => value !== c.id && onChange(c.id)}
      >
        {c.name}
      </button>
    ))}
  </div>
)
