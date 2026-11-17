import type { ReactNode } from "react"

/** The detail panel's layout: titled sections of label–value rows. */
export const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="section">
    <h2>{title}</h2>
    {children}
  </section>
)

export const Rows = ({ children }: { children: ReactNode }) => <dl className="rows">{children}</dl>

export const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="row">
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
)
