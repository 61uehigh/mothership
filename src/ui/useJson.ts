"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/ui/format";

/**
 * ### ApiFailure
 *
 * A failed call to one of our own `/api/*` routes. Error responses carry
 * `{ error, code? }`; `code` names the kind of failure where a route has
 * them (e.g. Docker's daemon being down).
 */
export type ApiFailure<C extends string = string> = {
  ok: false;
  /** HTTP status, or 0 when the request itself failed (network, server down). */
  status: number;
  /** Message to show. */
  error: string;
  code: C | undefined;
};

/**
 * ### ApiResult
 *
 * Outcome of a call to one of our own `/api/*` routes.
 */
export type ApiResult<T, C extends string = string> = { ok: true; data: T } | ApiFailure<C>;

async function request<T, C extends string>(url: string, init: RequestInit | undefined, read: (response: Response) => Promise<T>): Promise<ApiResult<T, C>> {
  try {
    const response = await fetch(url, init);
    if (!response.ok) {
      // Trusted: our own routes answer errors with `{ error, code? }`; anything else falls back to the status.
      const body = (await response.json().catch(() => undefined)) as { error?: string; code?: C } | undefined;
      return { ok: false, status: response.status, error: body?.error ?? `Request failed (${response.status})`, code: body?.code };
    }
    return { ok: true, data: await read(response) };
  } catch (error) {
    return { ok: false, status: 0, error: errorMessage(error), code: undefined };
  }
}

// Trusted: the JSON comes from our own route for this URL, which produces `T`.
const readJson = <T>(response: Response): Promise<T> => response.json() as Promise<T>;
const readText = (response: Response): Promise<string> => response.text();

/**
 * ### fetchJson
 *
 * Fetches one of our own JSON routes. Failures (an error status or the
 * network) become an {@link ApiFailure} instead of a rejection.
 *
 * @typeParam T - The route's success body.
 * @typeParam C - The route's error codes.
 */
export function fetchJson<T, C extends string = string>(url: string, init?: RequestInit): Promise<ApiResult<T, C>> {
  return request<T, C>(url, init, readJson<T>);
}

/**
 * ### fetchText
 *
 * Like {@link fetchJson}, for routes that answer `text/plain` on success.
 */
export function fetchText<C extends string = string>(url: string, init?: RequestInit): Promise<ApiResult<string, C>> {
  return request<string, C>(url, init, readText);
}

/**
 * ### FetchOptions
 *
 * Options of {@link useJson} and {@link useText}.
 */
export type FetchOptions = {
  /** Refetch this often while mounted; `undefined` (the default) loads once per URL and on reload. */
  pollMs?: number;
  /** While a new URL loads, keep showing the previous URL's data instead of nothing. */
  keepPrevious?: boolean;
  /** A reload asks routes with a server cache to skip it by adding `refresh=1`. */
  refreshOnReload?: boolean;
};

/**
 * ### Fetched
 *
 * State of a fetch made with {@link useJson} or {@link useText}.
 */
export type Fetched<T, C extends string = string> = {
  /** Last value loaded for the current URL; kept while it reloads and when a reload fails. */
  data: T | undefined;
  /** Message of the last failed load of the current URL; cleared by the next success. */
  error: string | undefined;
  /** The last failure in full, for callers that tell failures apart by `status` or `code`. */
  failure: ApiFailure<C> | undefined;
  /** A request for the current URL is in flight, or nothing has loaded for it yet. */
  loading: boolean;
  /** Fetches the current URL again, replacing a request in flight. */
  reload: () => void;
};

type Settled<T, C extends string> = { url: string; data: T | undefined; failure: ApiFailure<C> | undefined };

function useFetch<T, C extends string>(
  url: string | undefined,
  read: (response: Response) => Promise<T>,
  { pollMs, keepPrevious = false, refreshOnReload = false }: FetchOptions,
): Fetched<T, C> {
  // Results are tagged with the URL they answer, so a late answer for an older URL is never shown for a newer one.
  const [settled, setSettled] = useState<Settled<T, C> | undefined>(undefined);
  const [inflight, setInflight] = useState<string | undefined>(undefined);
  // A reload asks for fresh data for the URL it was clicked on; moving to another URL loads normally.
  const [reloadRequest, setReloadRequest] = useState<{ url: string | undefined; count: number }>({ url: undefined, count: 0 });
  const running = useRef<{ url: string; controller: AbortController } | undefined>(undefined);
  const lastStart = useRef(0);

  /** Starts a request for `target`. A poll (`replace` false) leaves one already in flight alone. */
  const load = useCallback(
    (target: string, fresh: boolean, replace: boolean) => {
      if (running.current !== undefined) {
        if (!replace) return;
        running.current.controller.abort();
      }
      const controller = new AbortController();
      running.current = { url: target, controller };
      lastStart.current = Date.now();
      setInflight(target);
      const requested = fresh ? `${target}${target.includes("?") ? "&" : "?"}refresh=1` : target;
      void request<T, C>(requested, { signal: controller.signal, cache: "no-store" }, read).then((result) => {
        if (controller.signal.aborted) return;
        running.current = undefined;
        setInflight(undefined);
        setSettled((last) =>
          result.ok
            ? { url: target, data: result.data, failure: undefined }
            : // Keep the last data for the same URL; the error shows beside it.
              { url: target, data: last?.url === target ? last.data : undefined, failure: result },
        );
      });
    },
    [read],
  );

  useEffect(() => {
    if (url === undefined) return;
    const fresh = refreshOnReload && reloadRequest.url === url;
    // Deferred a tick: setting state synchronously in an effect is not allowed.
    const timer = setTimeout(() => load(url, fresh, true), 0);
    return () => {
      clearTimeout(timer);
      running.current?.controller.abort();
      running.current = undefined;
    };
  }, [url, reloadRequest, refreshOnReload, load]);

  useEffect(() => {
    if (url === undefined || pollMs === undefined) return;
    // Resuming after a pause (polling switched off a while) loads right away when the data is due.
    const resume = setTimeout(() => Date.now() - lastStart.current >= pollMs && load(url, false, false), 0);
    const timer = setInterval(() => load(url, false, false), pollMs);
    return () => {
      clearTimeout(resume);
      clearInterval(timer);
    };
  }, [url, pollMs, load]);

  const reload = useCallback(() => setReloadRequest((r) => ({ url, count: r.count + 1 })), [url]);

  const current = settled?.url === url ? settled : undefined;
  return {
    data: current !== undefined ? current.data : keepPrevious ? settled?.data : undefined,
    error: current?.failure?.error,
    failure: current?.failure,
    loading: url !== undefined && (current === undefined || inflight === url),
    reload,
  };
}

/**
 * ### useJson
 *
 * Loads one of our own JSON routes and keeps it current: aborts the request
 * when the URL changes or the caller unmounts, never shows an answer for an
 * older URL, and with `pollMs` refetches on an interval, skipping a tick
 * while the previous request is still in flight.
 *
 * @param url - Same-origin API URL; changing it loads the new one. `undefined` waits without loading.
 */
export function useJson<T, C extends string = string>(url: string | undefined, options: FetchOptions = {}): Fetched<T, C> {
  return useFetch<T, C>(url, readJson<T>, options);
}

/**
 * ### useText
 *
 * Like {@link useJson}, for routes that answer `text/plain` on success.
 */
export function useText<C extends string = string>(url: string | undefined, options: FetchOptions = {}): Fetched<string, C> {
  return useFetch<string, C>(url, readText, options);
}
