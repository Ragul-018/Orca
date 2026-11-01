export function WindowControls(): React.JSX.Element {
  return (
    <div className="window-controls">
      <button
        className="window-control"
        type="button"
        aria-label="Minimize"
        onClick={() => void window.orca.windowAction('minimize')}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 6.5h7" />
        </svg>
      </button>
      <button
        className="window-control"
        type="button"
        aria-label="Maximize"
        onClick={() => void window.orca.windowAction('maximize')}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <rect x="2.5" y="2.5" width="7" height="7" rx="0.7" />
        </svg>
      </button>
      <button
        className="window-control window-control--close"
        type="button"
        aria-label="Close"
        onClick={() => void window.orca.windowAction('close')}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="m3 3 6 6M9 3 3 9" />
        </svg>
      </button>
    </div>
  )
}
