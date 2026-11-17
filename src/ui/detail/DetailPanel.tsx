import { Overview } from "./Overview"
import { CodePointDetail } from "./CodePointDetail"
import type { DetailProps } from "./detailProps"

export const DetailPanel = (props: DetailProps) => (
  <aside className="detail">
    {props.cp === undefined ? <Overview {...props} /> : <CodePointDetail {...props} cp={props.cp} />}
  </aside>
)
