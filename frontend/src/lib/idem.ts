/**
 * Idempotency-key lifecycle for ONE logical submission.
 * - same payload retried after an uncertain outcome (network error / 5xx)  -> SAME key
 * - payload edited since the last attempt                                  -> NEW key (backend would 422 a reused key)
 * - success or definitive 4xx rejection                                     -> key discarded
 */
export class IdempotencySession {
  private cur: { key: string; payload: string } | null = null
  keyFor(payload: unknown): string {
    const p = JSON.stringify(payload)
    if (!this.cur || this.cur.payload !== p) this.cur = { key: crypto.randomUUID(), payload: p }
    return this.cur.key
  }
  settle() { this.cur = null }
  get pending() { return this.cur !== null }
}
