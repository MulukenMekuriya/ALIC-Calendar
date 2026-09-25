/**
 * The app had none of these, anywhere.
 *
 * `src/main.tsx` is a bare `createRoot(...).render(<App />)`, so until now ANY
 * render-time exception in any component unmounted the entire React root and
 * left a white page. Not a broken panel — a blank browser window, with reload
 * as the only recovery.
 *
 * That is survivable in an admin screen. It is not survivable at a Sunday
 * check-in desk, where the person looking at the white page is a volunteer
 * with a queue of parents and no idea that "reload" is the answer. And it is
 * exactly what would have happened this week: deploying the database ahead of
 * the frontend would have left the live bundle calling
 * `person.background_check_status.replace(...)` on a column that no longer
 * exists, throwing a TypeError during render of the Volunteers tab.
 *
 * So: a boundary at the root, and a second one around each routed screen, so
 * that a failure in one page cannot take down the shell that lets somebody
 * navigate away from it.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/shared/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Shown to orient the person: "the check-in desk", "this page". */
  what?: string;
  /** Rendered instead of the default panel. */
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Console only. There is no error-reporting service wired up, and this is
    // not the place to invent one — but a volunteer reading a screen out over
    // the phone needs the message to exist somewhere.
    console.error("Render error in", this.props.what ?? "the app", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return <>{this.props.fallback}</>;

    return (
      <div className="flex min-h-[50vh] items-center justify-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
          <div className="space-y-1.5">
            <p className="text-lg font-semibold">
              Something went wrong{this.props.what ? ` in ${this.props.what}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              Nothing you did caused this, and nothing has been lost. Try again,
              and if it keeps happening tell whoever looks after the church app.
            </p>
          </div>
          <div className="flex justify-center gap-2">
            <Button onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
          {/* The message, small and selectable, so it can be read out or
              pasted into a message rather than described from memory. */}
          <p className="select-all break-words text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
        </div>
      </div>
    );
  }
}
