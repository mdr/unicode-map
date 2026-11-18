import { RangeKind, type RangeSelection } from "../data/ranges"
import type { MapView } from "../map/MapView"

/** Point a selected range out on the map, flying to it, or (`fly` false, as from the URL) staying put. */
export const showRangeOnMap = (view: MapView | undefined, r: RangeSelection, fly = true): void => {
  if (!fly) view?.pin(r.s, r.e)
  else if (r.kind === RangeKind.PLANE) view?.showPlane(r.s >> 16)
  else view?.showRange(r.s, r.e)
}

/** A range as the URL has it: by kind and start, a plane by its number. */
export const rangeToUrl = (r: RangeSelection | undefined): { kind: RangeKind; s: number } | undefined =>
  r && { kind: r.kind, s: r.kind === RangeKind.PLANE ? r.s >> 16 : r.s }
