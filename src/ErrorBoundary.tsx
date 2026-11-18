import { Component, type ErrorInfo, type ReactNode } from "react"

/**
 * Catches an error thrown while drawing the interface, which would otherwise make React remove
 * all of it and leave a blank page, and says what went wrong instead.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="splash">
        <p>Something went wrong.</p>
        <p className="muted">Reloading the page usually gets you back to where you were.</p>
        <button type="button" className="splash-reload" onClick={() => location.reload()}>
          Reload
        </button>
        <pre>{error.message}</pre>
      </div>
    )
  }
}
