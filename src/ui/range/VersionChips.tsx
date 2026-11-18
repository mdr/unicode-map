import styles from "../detail/detail.module.css"

/** When a range's characters were added: a chip per Unicode version, with how many. */
export const VersionChips = ({ byAge }: { byAge: [string, number][] }) => (
  <div className={styles.chips}>
    {byAge.map(([v, n]) => (
      <span key={v} className={styles.chip} title={`${n.toLocaleString()} added in Unicode ${v}`}>
        {v} <span className="muted">· {n.toLocaleString()}</span>
      </span>
    ))}
  </div>
)
