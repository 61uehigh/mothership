import type { ErrorCode } from "@/lib/apiErrorCodes";

/**
 * ### HttpErrorParams
 *
 * The facts the browser words an error's `code` with (e.g. which widget is
 * turned off), sent as `params` beside it.
 */
export type HttpErrorParams = Readonly<Record<string, string>>;

/**
 * ### HttpError
 *
 * An error that already knows how a route should answer it: its `status`,
 * and an optional machine-readable `code` from `lib/apiErrorCodes` (e.g. Docker's `daemon`). Domain
 * errors (files, GitHub, Docker, Linear) extend it so every route maps them
 * the same way through `errorResponse`.
 */
export class HttpError extends Error {
  /** Facts to word `code` with; see {@link HttpErrorParams}. */
  readonly params: HttpErrorParams | undefined;

  /**
   * @param status - HTTP status to answer with.
   * @param code - Optional machine-readable reason, sent as `code` in the body.
   * @param options - `params`: facts to word `code` with, sent as `params` in the body.
   */
  constructor(
    message: string,
    readonly status: number,
    readonly code?: ErrorCode,
    options?: ErrorOptions & { params?: HttpErrorParams },
  ) {
    super(message, options);
    this.name = "HttpError";
    this.params = options?.params;
  }
}
