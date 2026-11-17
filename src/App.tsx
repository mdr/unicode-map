import { useEffect, useState } from "react"
import { UnicodeData } from "./data/unicode"
import { Explorer } from "./explorer/Explorer"

export const App = () => {
  const [data, setData] = useState<UnicodeData>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    UnicodeData.load().then(setData, (e: unknown) => setError(String(e)))
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
  return <Explorer data={data} />
}
