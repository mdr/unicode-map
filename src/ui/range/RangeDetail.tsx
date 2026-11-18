import { RangeKind, type RangeSelection } from "../../data/ranges"
import type { DetailProps } from "../detail/detailProps"
import { BlockDetail } from "./BlockDetail"
import { PlaneDetail } from "./PlaneDetail"
import { SectionDetail } from "./SectionDetail"

/** The sidebar for a selected plane, block or section. */
export const RangeDetail = (props: DetailProps & { range: RangeSelection }) => {
  const { range: r, data } = props
  if (r.kind === RangeKind.PLANE) return <PlaneDetail {...props} plane={r.s >> 16} />
  if (r.kind === RangeKind.BLOCK) return <BlockDetail {...props} block={data.blockIdx[r.s] ?? -1} />
  return <SectionDetail {...props} s={r.s} e={r.e} />
}
