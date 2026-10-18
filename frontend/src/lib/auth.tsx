import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api, setCsrf, setUnauthorizedHandler } from './api'
import type { Me } from './types'
import { useToast } from './toast'

interface AuthCtx { me: Me | null; loading: boolean; error: unknown; retry: () => void
  login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>
  roleIn: (teamId: number) => 'admin' | 'lead' | 'member' | 'viewer' | null }
const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const toast = useToast()
  const setAuth = (user: Me | null) => {
    setCsrf(user?.csrf_token ?? '')
    qc.setQueryData(['me'], user)
    qc.removeQueries({ predicate: query => query.queryKey[0] !== 'me' })
  }
  const q = useQuery({
    queryKey: ['me'], retry: false, staleTime: Infinity,
    queryFn: async (): Promise<Me | null> => {
      try { const m = await api<Me>('/auth/me'); setCsrf(m.csrf_token); return m }
      catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e }
    },
  })
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!qc.getQueryData(['me'])) return
      toast('error', 'Your session has expired. Please sign in again.')
      setAuth(null)
    })
  }, [qc, toast])
  const login = async (email: string, password: string) => {
    const m = await api<Me>('/auth/login', { method: 'POST', body: { email, password } })
    setAuth(m)
  }
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }) } finally { setAuth(null) }
  }
  const me = q.data ?? null
  const roleIn: AuthCtx['roleIn'] = teamId => me?.is_admin ? 'admin' : (me?.memberships.find(m => m.team_id === teamId)?.role ?? null)
  return <Ctx.Provider value={{ me, loading: q.isLoading, error: q.error, retry: () => { void q.refetch() }, login, logout, roleIn }}>{children}</Ctx.Provider>
}
