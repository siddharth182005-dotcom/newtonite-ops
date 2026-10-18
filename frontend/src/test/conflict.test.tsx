import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../lib/toast'
import { AuthProvider, useAuth } from '../lib/auth'
import Detail from '../pages/Detail'

const item = (v: number, priority: string) => ({ id: 1, key: 'OPS-1001', title: 'Disk full', description: 'd', type: 'task', status: 'open', priority,
  team: { id: 1, name: 'A' }, creator: { id: 9, name: 'Cee' }, assignee: null, due_date: null, version: v, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', resolved_at: null })
const Gate = () => (useAuth().me ? <Detail /> : null)   // mirrors RequireAuth in the real app
const page = { items: [], total: 0, page: 1, page_size: 20 }
const me = { id: 2, name: 'Lena Lead', email: 'l@x.dev', is_admin: false, csrf_token: 't', memberships: [{ team_id: 1, team_name: 'A', role: 'lead' }] }
const json = (s: number, b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: s }))

describe('stale update on the detail page', () => {
  it('shows a conflict banner, refreshes to the server record, never auto-retries, and retries only on explicit click with the new version', async () => {
    const patches: any[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patches.push(JSON.parse(String(init.body)))
        return patches.length === 1
          ? json(409, { error: { code: 'version_conflict', message: 'This item was changed by someone else.', details: { current: item(2, 'high') } } })
          : json(200, item(3, 'critical'))
      }
      if (url.includes('/auth/me')) return json(200, me)
      if (url.includes('/comments') || url.includes('/activity')) return json(200, page)
      if (url.includes('/users')) return json(200, [])
      return json(200, item(1, 'medium'))
    }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>
      <MemoryRouter initialEntries={['/work/1']}><AuthProvider><Routes><Route path="/work/:id" element={<Gate />} /></Routes></AuthProvider></MemoryRouter></ToastProvider></QueryClientProvider>)
    await userEvent.selectOptions(await screen.findByLabelText('Change priority'), 'critical')
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/was not applied/)
    expect(banner).toHaveTextContent('v2')                    // latest server version is displayed
    expect(screen.queryByRole('status')).not.toBeInTheDocument() // no false success
    expect(patches).toHaveLength(1)                                              // no silent automatic retry
    expect(patches[0].expected_version).toBe(1)
    await userEvent.click(screen.getByRole('button', { name: /retry on latest/i }))
    await waitFor(() => expect(patches).toHaveLength(2))
    expect(patches[1].expected_version).toBe(2)                                  // retried against the reviewed, newer version
    expect(await screen.findByRole('status')).toHaveTextContent(/Priority set to Critical/)   // success only after the server confirms
  })
})
