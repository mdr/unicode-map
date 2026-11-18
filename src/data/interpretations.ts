import { type Interpretation, interpretationFamily, type UnicodeData } from "./unicode"

/** Interpretations of the Private Use Areas there are to choose from (see scripts/build_pua.py). */
export const INTERPRETATIONS: { id: string; name: string }[] = [{ id: "conscript", name: "ConScript" }]

/** The interpretation shown unless the URL says otherwise. */
const DEFAULT_INTERPRETATION = "conscript"
/** How "no interpretation" is written in the URL, where leaving `pua` out means the default. */
const NONE = "none"

/** The interpretation a URL's `pua` asks for. */
export const interpretationFromUrl = (pua: string | undefined): string | undefined =>
  pua === NONE ? undefined : (pua ?? DEFAULT_INTERPRETATION)

/** What to write as `pua` in the URL for an interpretation: nothing for the default. */
export const interpretationToUrl = (id: string | undefined): string | undefined =>
  id === DEFAULT_INTERPRETATION ? undefined : (id ?? NONE)

/** The interpretation after this one, through none and back round. */
export const nextInterpretation = (id: string | undefined): string | undefined => {
  const ids = [undefined, ...INTERPRETATIONS.map((i) => i.id)]
  return ids[(ids.indexOf(id) + 1) % ids.length]
}

const loaded = new Map<string, Promise<Interpretation>>()

/** Fetch an interpretation (once) and register its fonts, which the browser loads when they're used. */
const load = (id: string): Promise<Interpretation> => {
  let p = loaded.get(id)
  if (!p) {
    p = fetch(`./data/pua/${id}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`No interpretation "${id}"`)
        return r.json() as Promise<Interpretation>
      })
      .then((interp) => {
        interp.fonts.forEach((f, n) =>
          document.fonts.add(
            new FontFace(interpretationFamily(interp, n).slice(1, -1), `url(./fonts-pua/${f.file})`, {
              display: "block"
            })
          )
        )
        return interp
      })
    loaded.set(id, p)
  }
  return p
}

/** The data with an interpretation laid over it, or as it is without one. */
export const interpret = async (base: UnicodeData, id: string | undefined): Promise<UnicodeData> =>
  id ? base.withInterpretation(await load(id)) : base
