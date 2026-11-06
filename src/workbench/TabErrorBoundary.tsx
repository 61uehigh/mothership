"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { errorMessage } from "@/lib/errors";
import { SECONDARY_BUTTON } from "@/ui/button";
import { useT } from "@/ui/i18n/useT";
import { recordPageError } from "@/ui/pageErrors";

type Props = {
  /** The tab shown; another tab gets a fresh try. */
  resetKey: string;
  onClose: () => void;
  children: ReactNode;
};

type State = { resetKey: string; failure: { error: unknown } | undefined };

function TabFailed({ error, onRetry, onClose }: { error: unknown; onRetry: () => void; onClose: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm">
      <p className="font-medium">{t("workbench.tabError.title")}</p>
      <p className="max-w-md text-center text-xs text-zinc-500">{t("workbench.tabError.body")}</p>
      <pre className="max-w-md whitespace-pre-wrap text-[11px] text-red-600 dark:text-red-400">{errorMessage(error)}</pre>
      <div className="flex gap-2">
        <button type="button" className={SECONDARY_BUTTON} onClick={onRetry}>
          {t("ui.retry")}
        </button>
        <button type="button" className={SECONDARY_BUTTON} onClick={onClose}>
          {t("workbench.tabError.close")}
        </button>
      </div>
    </div>
  );
}

/**
 * ### TabErrorBoundary
 *
 * Catches a render failure inside one tab (or its details column) and shows
 * it there with Retry and Close, so the frame, the sidebars, and the other
 * tabs keep working. Without it the nearest boundary is the app's global
 * error page, and a restored tab that fails would take the window down on
 * every load.
 */
export class TabErrorBoundary extends Component<Props, State> {
  state: State = { resetKey: this.props.resetKey, failure: undefined };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { failure: { error } };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { resetKey: props.resetKey, failure: undefined };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[mothership] a tab failed to render", error, info.componentStack);
    recordPageError(`Tab ${this.props.resetKey} failed to render: ${errorMessage(error)}`);
  }

  render() {
    const { failure } = this.state;
    if (failure === undefined) return this.props.children;
    return <TabFailed error={failure.error} onRetry={() => this.setState({ failure: undefined })} onClose={this.props.onClose} />;
  }
}
