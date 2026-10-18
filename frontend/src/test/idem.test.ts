import { describe, expect, it } from 'vitest'
import { IdempotencySession } from '../lib/idem'

describe('IdempotencySession', () => {
  const p = { title: 'A', team_id: 1 }
  it('reuses the key when the same payload is retried', () => { const s = new IdempotencySession(); expect(s.keyFor(p)).toBe(s.keyFor({ ...p })) })
  it('issues a new key when the payload changes', () => { const s = new IdempotencySession(); const k = s.keyFor(p); expect(s.keyFor({ ...p, title: 'B' })).not.toBe(k) })
  it('issues a new key after settle (a different logical submission)', () => { const s = new IdempotencySession(); const k = s.keyFor(p); s.settle(); expect(s.pending).toBe(false); expect(s.keyFor(p)).not.toBe(k) })
})
