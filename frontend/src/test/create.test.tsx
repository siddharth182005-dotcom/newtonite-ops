import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../lib/toast'
import { AuthProvider, useAuth } from '../lib/auth'
import { CreateDialog } from '../components/CreateDialog'

const me = { id: 2, name: 'Sam', email: 's@x.dev', is_admin: false, csrf_token: 't', memberships: [{ team_id: 1, team_name: 'A', role: 'member' }] }
const created = { id: 7, key: 'OPS-1007', title: 'Disk full', version: 1 }
const json = (s: number, b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: s }))
const Gate = () => (useAuth().me ? <CreateDialog open onClose={() => {}} /> : null)

describe('create form idempotency', () => {
  it('reuses the key after an uncertain outcome, issues a new key when the payload changes, and blocks double submit', async () => {
    const keys: string[] = []
    let posts = 0
    window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/work-items')) {
        posts++; keys.push((init.headers as Record<string, string>)['Idempotency-Key'])
        return posts < 3 ? Promise.reject(new TypeError('Failed to fetch')) : json(201, created)
      }
      if (url.includes('/auth/me')) return json(200, me)
      if (url.includes('/teams')) return json(200, [{ id: 1, name: 'A', description: '', member_count: 1, my_role: 'member' }])
      return json(200, {})
    }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ToastProvider>
      <MemoryRouter><AuthProvider><Gate /></AuthProvider></MemoryRouter></ToastProvider></QueryClientProvider>)
    const title = await screen.findByLabelText(/^Title/)
    await userEvent.type(title, 'Disk full')
    await userEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/couldn’t confirm/i)       // uncertain outcome is explained
    await userEvent.click(screen.getByRole('button', { name: 'Retry safely' }))              // same payload -> same key
    await waitFor(() => expect(posts).toBe(2))
    expect(keys[1]).toBe(keys[0])
    await userEvent.type(title, ' again')                                                    // edited payload -> a different logical submission
    await userEvent.click(await screen.findByRole('button', { name: 'Retry safely' }))
    await waitFor(() => expect(posts).toBe(3))
    expect(keys[2]).not.toBe(keys[0])
    expect(new Set(keys).size).toBe(2)
  })
})
