/** What a key press asks for; the explorer carries it out. */
export enum KeyActionType {
  MOVE = "MOVE",
  NEXT_BLOCK = "NEXT_BLOCK",
  PREVIOUS_BLOCK = "PREVIOUS_BLOCK",
  NEXT_PLANE = "NEXT_PLANE",
  PREVIOUS_PLANE = "PREVIOUS_PLANE",
  FOCUS_SELECTION = "FOCUS_SELECTION",
  TOGGLE_CHART = "TOGGLE_CHART",
  ESCAPE = "ESCAPE",
  ZOOM_IN = "ZOOM_IN",
  ZOOM_OUT = "ZOOM_OUT",
  OVERVIEW = "OVERVIEW",
  TOGGLE_HELP = "TOGGLE_HELP",
  TOGGLE_TIMELINE = "TOGGLE_TIMELINE",
  ENTER_PURE = "ENTER_PURE",
  LEAVE_PURE = "LEAVE_PURE",
  TOGGLE_GLYPH_TEXTURE = "TOGGLE_GLYPH_TEXTURE",
  NEXT_INTERPRETATION = "NEXT_INTERPRETATION",
  OPEN_PROPERTIES = "OPEN_PROPERTIES",
  FOCUS_SEARCH = "FOCUS_SEARCH",
  MODE = "MODE"
}

interface MoveAction {
  type: KeyActionType.MOVE
  /** Code points to step by. */
  delta: number
  /** Skip unassigned code points. */
  assignedOnly: boolean
}
interface ModeAction {
  type: KeyActionType.MODE
  /** Position of the colour mode in the legend, from 0. */
  index: number
}
export interface SimpleAction {
  type: Exclude<KeyActionType, KeyActionType.MOVE | KeyActionType.MODE>
}
export type KeyAction = MoveAction | ModeAction | SimpleAction

const SIMPLE_KEYS: Record<string, SimpleAction["type"]> = {
  "]": KeyActionType.NEXT_BLOCK,
  "[": KeyActionType.PREVIOUS_BLOCK,
  "}": KeyActionType.NEXT_PLANE,
  "{": KeyActionType.PREVIOUS_PLANE,
  Enter: KeyActionType.FOCUS_SELECTION,
  c: KeyActionType.TOGGLE_CHART,
  Escape: KeyActionType.ESCAPE,
  "+": KeyActionType.ZOOM_IN,
  "=": KeyActionType.ZOOM_IN,
  "-": KeyActionType.ZOOM_OUT,
  _: KeyActionType.ZOOM_OUT,
  "0": KeyActionType.OVERVIEW,
  "?": KeyActionType.TOGGLE_HELP,
  t: KeyActionType.TOGGLE_TIMELINE,
  z: KeyActionType.ENTER_PURE,
  g: KeyActionType.TOGGLE_GLYPH_TEXTURE,
  i: KeyActionType.NEXT_INTERPRETATION,
  p: KeyActionType.OPEN_PROPERTIES,
  "/": KeyActionType.FOCUS_SEARCH
}

/** Only zooming and leaving work in pure view. */
const PURE_KEYS: Record<string, SimpleAction["type"]> = {
  z: KeyActionType.LEAVE_PURE,
  Escape: KeyActionType.LEAVE_PURE,
  "+": KeyActionType.ZOOM_IN,
  "=": KeyActionType.ZOOM_IN,
  "-": KeyActionType.ZOOM_OUT,
  _: KeyActionType.ZOOM_OUT,
  "0": KeyActionType.OVERVIEW
}

/**
 * Arrow keys step through the map's rows of 256, or down a chart's columns of 16: there, up and
 * down step by one and left and right by a column. Shift skips unassigned code points along a
 * row of the map or a column of the chart.
 */
const arrowMove = (key: string, shift: boolean, inChart: boolean): MoveAction | undefined => {
  const [across, down] = inChart ? [16, 1] : [1, 256]
  const steps: Record<string, [number, boolean]> = {
    ArrowLeft: [-across, !inChart],
    ArrowRight: [across, !inChart],
    ArrowUp: [-down, inChart],
    ArrowDown: [down, inChart]
  }
  const step = steps[key]
  return step && { type: KeyActionType.MOVE, delta: step[0], assignedOnly: shift && step[1] }
}

export const keyAction = (
  key: string,
  shift: boolean,
  { pure, inChart, modeCount }: { pure: boolean; inChart: boolean; modeCount: number }
): KeyAction | undefined => {
  if (pure) {
    const type = PURE_KEYS[key]
    return type && { type }
  }
  const move = arrowMove(key, shift, inChart)
  if (move) return move
  const type = SIMPLE_KEYS[key]
  if (type) return { type }
  const n = parseInt(key, 10)
  return n >= 1 && n <= modeCount ? { type: KeyActionType.MODE, index: n - 1 } : undefined
}
