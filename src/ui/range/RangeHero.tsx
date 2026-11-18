import type { ReactNode } from "react"
import { hex } from "../../data/unicode"
import type { CodePoint } from "../../units"
import styles from "../detail/detail.module.css"

/** The top of a plane's, block's or section's panel: what it is, its name and range, and links. */
export const RangeHero = ({
  kind,
  title,
  s,
  e,
  accent,
  onClose,
  children
}: {
  /** What it is: "Block", "Plane 1"… */
  kind: string
  title: string
  s: CodePoint
  e: CodePoint
  accent: string
  onClose: () => void
  /** Links, as in a character's hero. */
  children?: ReactNode
}) => (
  <div className={styles.cpHero} style={{ ["--accent" as string]: accent }}>
    <button className={styles.close} onClick={onClose} title="Close (Esc)">
      ×
    </button>
    <div className={styles.cpSection}>{kind}</div>
    <h1 className={styles.cpName}>{title}</h1>
    <div className={`mono ${styles.cpUplus}`}>
      U+{hex(s)}–U+{hex(e)}
    </div>
    {children && <div className={styles.cpLinks}>{children}</div>}
  </div>
)
