import { useState } from "react"

export const CopyButton = ({
  text,
  label,
  small,
  disabled
}: {
  text: string
  label: string
  small?: boolean
  disabled?: boolean
}) => {
  const [done, setDone] = useState(false)
  return (
    <button
      className={`copy ${small ? "small" : ""}`}
      title={label}
      disabled={disabled}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1000)
        })
      }}
    >
      {done ? "✓" : "⧉"}
    </button>
  )
}
