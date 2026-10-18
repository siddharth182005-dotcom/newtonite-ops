const BASE: string = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const PREFIX = '/api/v1'

// CSRF token lives in memory only (never localStorage). It is returned by /auth/login and /auth/me.
let csrf = ''
export const setCsrf = (t: string) => { csrf = t }
let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details: any = null) { super(message) }
}
/** fetch() itself failed: the outcome of the request is UNKNOWN (it may have reached the server). */
export class NetworkError extends Error {}

type Params = Record<string, string | number | boolean | undefined | null | (string | number)[]>
function qs(params?: Params) {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === '') continue
    for (const x of Array.isArray(v) ? v : [v]) u.append(k, String(x))
  }
  const s = u.toString()
  return s ? `?${s}` : ''
}

export async function api<T = unknown>(path: string, o: { method?: string; body?: unknown; params?: Params; headers?: Record<string, string> } = {}): Promise<T> {
  const method = o.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json', ...o.headers }
  if (o.body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET') headers['X-CSRF-Token'] = csrf
  let res: Response
  try {
    res = await fetch(`${BASE}${PREFIX}${path}${qs(o.params)}`, {
      method, headers, credentials: 'include', body: o.body === undefined ? undefined : JSON.stringify(o.body),
    })
  } catch {
    throw new NetworkError('Cannot reach the server. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T
  let data: any = null
  try { data = await res.json() } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const e = data?.error
    const err = new ApiError(res.status, e?.code ?? 'http_error', e?.message ?? `Request failed (${res.status})`, e?.details ?? null)
    if (res.status === 401 && path !== '/auth/login') onUnauthorized()
    throw err
  }
  return data as T
}

/** Human-friendly message for any thrown error (includes field-level validation messages). */
export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const errs = e.details?.errors as { loc: (string | number)[]; msg: string }[] | undefined
    if (e.code === 'validation_error' && errs?.length) return errs.map(x => `${x.loc.slice(1).join('.') || 'request'}: ${x.msg}`).join('; ')
    return e.message
  }
  return e instanceof Error ? e.message : 'Something went wrong'
}
