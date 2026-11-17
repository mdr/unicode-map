/** The buttons over the map's corner. */
export const MapControls = ({
  timelineOpen,
  onZoom,
  onOverview,
  onTimeline,
  onPure,
  onHelp
}: {
  timelineOpen: boolean
  onZoom: (factor: number) => void
  onOverview: () => void
  onTimeline: () => void
  onPure: () => void
  onHelp: () => void
}) => (
  <div className="map-controls">
    <button title="Zoom in (+)" onClick={() => onZoom(2)}>
      +
    </button>
    <button title="Zoom out (−)" onClick={() => onZoom(0.5)}>
      −
    </button>
    <button title="Show everything (0)" onClick={onOverview}>
      ⤢
    </button>
    <button
      title="Timeline: Unicode through the versions (t)"
      aria-label="Timeline"
      className={timelineOpen ? "on" : ""}
      onClick={onTimeline}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
    <button title="Pure view: just the characters (z)" aria-label="Pure view" onClick={onPure}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
        <path
          d="M1.5 8C3 5 5.3 3.5 8 3.5S13 5 14.5 8C13 11 10.7 12.5 8 12.5S3 11 1.5 8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="8" cy="8" r="2.1" fill="currentColor" />
      </svg>
    </button>
    <button title="Keyboard shortcuts (?)" onClick={onHelp}>
      ?
    </button>
  </div>
)
