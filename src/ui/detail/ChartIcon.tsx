/** A small grid: open as a code chart. */
export const ChartIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
    {[0, 4, 8].flatMap((x) =>
      [0, 4, 8].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="3" height="3" rx="0.6" fill="currentColor" />)
    )}
  </svg>
)
