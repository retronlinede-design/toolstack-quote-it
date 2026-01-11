import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ error, info });
    // You could also log this to a remote service
    console.error("ErrorBoundary caught:", error, info);
  }

  reset = () => this.setState({ error: null, info: null });

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen p-6 flex items-center justify-center bg-neutral-50 text-neutral-800">
          <div className="max-w-3xl p-6 rounded-2xl bg-white border border-red-200 shadow-sm">
            <div className="text-lg font-semibold text-red-700">An error occurred</div>
            <div className="mt-2 text-sm text-neutral-700">{String(this.state.error?.message || this.state.error)}</div>
            <details className="mt-3 text-xs text-neutral-600 whitespace-pre-wrap">
              {(this.state.info?.componentStack || "").toString()}
            </details>
            <div className="mt-4 flex gap-2">
              <button className="px-3 py-2 rounded-xl bg-neutral-700 text-white" onClick={this.reset}>Retry</button>
              <button className="px-3 py-2 rounded-xl border" onClick={() => window.location.reload()}>Reload Page</button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
