import { Overview } from "./Overview"
import { CodePointDetail } from "./CodePointDetail"
import { RangeDetail } from "../range/RangeDetail"
import type { DetailProps } from "./detailProps"

export const DetailPanel = (props: DetailProps) => (
  <aside className="detail">
    {props.cp !== undefined ? (
      <CodePointDetail {...props} cp={props.cp} />
    ) : props.range ? (
      <RangeDetail {...props} range={props.range} />
    ) : (
      <Overview {...props} />
    )}
  </aside>
)
