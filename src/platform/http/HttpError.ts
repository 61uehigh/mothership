/**
 * ### HttpError
 *
 * An error that already knows how a route should answer it: its `status`,
 * and an optional machine-readable `code` (e.g. Docker's `daemon`). Domain
 * errors (files, GitHub, Docker, Linear) extend it so every route maps them
 * the same way through `errorResponse`.
 */
export class HttpError extends Error {
  /**
   * @param status - HTTP status to answer with.
   * @param code - Optional machine-readable reason, sent as `code` in the body.
   */
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "HttpError";
  }
}
