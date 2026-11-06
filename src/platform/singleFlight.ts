/**
 * ### SingleFlight
 *
 * Shares one running task per key: a second request for the same key (another
 * window, a double click) waits for the first instead of starting its own.
 * The key is free again once the task settles.
 */
export class SingleFlight<K, V> {
  readonly #running = new Map<K, Promise<V>>();

  run(key: K, task: () => Promise<V>): Promise<V> {
    const running = this.#running.get(key);
    if (running !== undefined) return running;
    const started = task().finally(() => this.#running.delete(key));
    this.#running.set(key, started);
    return started;
  }
}
