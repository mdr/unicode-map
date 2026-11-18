import { useCallback, useEffect, useRef, useState } from "react"
import { UnicodeData } from "./data/unicode"
import { interpret, interpretationFromUrl } from "./data/interpretations"
import { Explorer } from "./explorer/Explorer"
import { FontLoading } from "./ui/FontLoading"
import { readHash } from "./urlState"

export const App = () => {
  /** The data as loaded, and with the chosen interpretation of the Private Use Areas laid over it. */
  const base = useRef<UnicodeData>(undefined)
  const [data, setData] = useState<UnicodeData>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    UnicodeData.load().then(
      async (d) => {
        base.current = d
        // An interpretation in the URL that can't be loaded is left out rather than failing the page.
        setData(await interpret(d, interpretationFromUrl(readHash().pua)).catch(() => d))
      },
      (e: unknown) => setError(String(e))
    )
  }, [])
  const changeInterpretation = useCallback((id: string | undefined) => {
    if (base.current) void interpret(base.current, id).then(setData)
  }, [])
  if (error)
    return (
      <div className="splash">
        <p>Couldn't load the Unicode data.</p>
        <p className="muted">
          Run <code>pnpm data</code> inside <code>nix develop</code> first.
        </p>
        <pre>{error}</pre>
      </div>
    )
  if (!data)
    return (
      <div className="splash">
        <div className="spinner" />
        <p className="muted">Loading the Unicode Character Database…</p>
      </div>
    )
  // A new interpretation starts the explorer afresh, from the state in the URL.
  return (
    <>
      <Explorer key={data.interpretation?.id ?? ""} data={data} onInterpretation={changeInterpretation} />
      <FontLoading data={data} />
    </>
  )
}
