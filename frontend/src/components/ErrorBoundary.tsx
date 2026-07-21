import { Component } from "react";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Without this, an unexpected render error anywhere in the tree (a null
// field from an API response we didn't quite expect, etc.) unmounts the
// whole app to a blank white screen with no way back except a manual
// reload - not acceptable for a page that might be mid-settlement.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell" style={{ marginTop: 60 }}>
          <div className="card">
            <h2>Something went wrong</h2>
            <p className="hint">
              An unexpected error occurred. Try reloading the page - if it keeps happening, please let us know.
            </p>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
