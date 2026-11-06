import type { ClaudeErrorCode } from "@/lib/apiErrorCodes";

/**
 * ### ConnectorRelayError
 *
 * The relay could not get a tool result from a claude.ai connector. The
 * message is shown to the user as-is.
 */
export class ConnectorRelayError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConnectorRelayError";
  }
}

/**
 * ### ConnectorToolError
 *
 * The connector's tool itself answered with an error, as opposed to the
 * relay or Claude failing around it, so a rate limit in its text is the
 * tool's.
 */
export class ConnectorToolError extends ConnectorRelayError {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorToolError";
  }
}

/**
 * ### ConnectorNotConnectedError
 *
 * The relay session ended on its own without calling the tool or an error,
 * which happens when the claude.ai connector is not connected to the user's
 * Claude account (see `relayEnding`). `connector` names
 * it (e.g. `Google Calendar`) so the browser can say what to connect.
 */
export class ConnectorNotConnectedError extends ConnectorRelayError {
  readonly connector: string;

  constructor(connector: string) {
    super(`Could not use the claude.ai ${connector} connector. Check that the ${connector} connector is connected in your claude.ai settings.`);
    this.name = "ConnectorNotConnectedError";
    this.connector = connector;
  }
}

/**
 * ### RelayTimeoutError
 *
 * The relay's clock ran out before the model called the tool (a slow CLI
 * start or connector load), so nothing was sent and the call can be retried.
 * Unlike a {@link ToolTimeoutError}, it never means a send may have happened.
 */
export class RelayTimeoutError extends ConnectorRelayError {
  constructor(connector: string, seconds: number) {
    super(`The claude.ai ${connector} connector did not get to the call within ${seconds} seconds. Nothing was sent, so you can try again.`);
    this.name = "RelayTimeoutError";
  }
}

/**
 * ### ConnectorClaudeError
 *
 * Claude itself refused the relay session: `claude-login` when it refused the
 * login, `claude-limit` when a usage or spend limit is used up. The message
 * is Claude's own text.
 */
export class ConnectorClaudeError extends ConnectorRelayError {
  readonly code: Extract<ClaudeErrorCode, "claude-login" | "claude-limit">;

  constructor(code: Extract<ClaudeErrorCode, "claude-login" | "claude-limit">, message: string) {
    super(message);
    this.name = "ConnectorClaudeError";
    this.code = code;
  }
}
