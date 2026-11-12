import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("PuneVerse ErrorBoundary", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-slate-950 p-6 text-slate-100">
          <div className="max-w-lg space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-6">
            <h1 className="text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-slate-300">
              PuneVerse hit an unexpected error. Refresh the page. If WebGL is
              blocked, enable hardware acceleration in your browser.
            </p>
            <pre className="overflow-auto rounded bg-slate-950 p-3 text-xs text-rose-300">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
