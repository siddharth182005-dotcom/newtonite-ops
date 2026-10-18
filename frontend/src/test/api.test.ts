import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, NetworkError, api, errMsg, setCsrf, setUnauthorizedHandler } from '../lib/api'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); setCsrf('tok-123') })
afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('sends cookies, CSRF header on writes, and no CSRF on reads', async () => {
    fetchMock.mockResolvedValue(json(200, {}))
    await api('/work-items', { params: { status: ['open', 'blocked'], q: '' } })
    await api('/work-items/1/assign', { method: 'POST', body: { assignee_id: 2 } })
    const [getUrl, getInit] = fetchMock.mock.calls[0], [, postInit] = fetchMock.mock.calls[1]
    expect(getUrl).toBe('/api/v1/work-items?status=open&status=blocked')
    expect(getInit.credentials).toBe('include'); expect(getInit.headers['X-CSRF-Token']).toBeUndefined()
    expect(postInit.headers['X-CSRF-Token']).toBe('tok-123'); expect(postInit.credentials).toBe('include')
  })
  it('exposes 409 conflict details so the UI can refresh to the latest record', async () => {
    const current = { id: 1, version: 5 }
    fetchMock.mockResolvedValue(json(409, { error: { code: 'version_conflict', message: 'changed', details: { current } } }))
    const e: any = await api('/work-items/1', { method: 'PATCH', body: {} }).catch(x => x)
    expect(e).toBeInstanceOf(ApiError); expect(e.status).toBe(409); expect(e.details.current).toEqual(current)
  })
  it('formats validation errors', async () => {
    fetchMock.mockResolvedValue(json(422, { error: { code: 'validation_error', message: 'x', details: { errors: [{ loc: ['body', 'title'], msg: 'too short' }] } } }))
    expect(errMsg(await api('/work-items', { method: 'POST', body: {} }).catch(x => x))).toBe('title: too short')
  })
  it('triggers the unauthorized handler on 401 except for login', async () => {
    const h = vi.fn(); setUnauthorizedHandler(h)
    fetchMock.mockResolvedValue(json(401, { error: { code: 'not_authenticated', message: 'no' } }))
    await api('/auth/me').catch(() => {}); expect(h).toHaveBeenCalledTimes(1)
    await api('/auth/login', { method: 'POST', body: {} }).catch(() => {}); expect(h).toHaveBeenCalledTimes(1)
  })
  it('maps fetch failures to NetworkError (unknown outcome)', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(api('/work-items', { method: 'POST', body: {} })).rejects.toBeInstanceOf(NetworkError)
  })
})
