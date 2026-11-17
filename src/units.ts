/**
 * Units as flavours, as in Whereabouts: a plain number is accepted where one is wanted and
 * arithmetic needs no wrapping, but a value of one unit can't be passed where another is wanted.
 */
declare const unit: unique symbol
type Flavour<U extends string> = number & { readonly [unit]?: U }

/** A Unicode code point, 0 to 0x10FFFF. */
export type CodePoint = Flavour<"CodePoint">
/** A plane, 0 to 16. */
export type Plane = Flavour<"Plane">
/** An index into the list of blocks (`meta.blocks`). */
export type BlockIndex = Flavour<"BlockIndex">
/** Map (world) coordinates, in cells: one code point is one cell. */
export type Cells = Flavour<"Cells">
/** The map's zoom: CSS pixels per cell. */
export type Zoom = Flavour<"Zoom">
/** CSS pixels on screen. */
export type Px = Flavour<"Px">
