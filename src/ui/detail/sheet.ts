/**
 * On a narrow screen the detail panel is a sheet over the bottom of the map: lowered to a strip,
 * raised partway (the map still shows above it), or raised over most of the map.
 */
export enum SheetState {
  LOWERED = "lowered",
  PART = "part",
  FULL = "full"
}

/** Swiping up raises the sheet a step. */
export const raised = (s: SheetState): SheetState => (s === SheetState.LOWERED ? SheetState.PART : SheetState.FULL)

/** Swiping down lowers it a step. */
export const lowered = (s: SheetState): SheetState => (s === SheetState.FULL ? SheetState.PART : SheetState.LOWERED)

/** A tap on the handle raises it, or from full, takes it back to partway. */
export const tapped = (s: SheetState): SheetState => (s === SheetState.FULL ? SheetState.PART : raised(s))
