import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../lib/toast'
import { AuthProvider, useAuth } from '../lib/auth'
import App from '../App'

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status })

function setup() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/']}>
          <AuthProvider><App /></AuthProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

function setupAuthProbe() {
  function AuthProbe() {
    const { me, logout } = useAuth()
    return <><p>{me ? 'Signed in' : 'Signed out'}</p><button onClick={() => void logout()}>Sign out</button></>
  }

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider><MemoryRouter><AuthProvider><AuthProbe /></AuthProvider></MemoryRouter></ToastProvider>
    </QueryClientProvider>,
  )
}

describe('auth routing', () => {
  it('routes to login when the initial session check returns unauthenticated', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(response(401, { error: { code: 'not_authenticated', message: 'Authentication required' } })),
    ))

    setup()

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows a retryable error and then routes to login when the auth request recovers unauthenticated', async () => {
    let requests = 0
    vi.stubGlobal('fetch', vi.fn(() => {
      requests += 1
      if (requests === 1) return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(response(401, { error: { code: 'not_authenticated', message: 'Authentication required' } }))
    }))

    setup()

    expect(await screen.findByText('Cannot reach the server. Check your connection and try again.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(requests).toBe(2)
  })

  it('updates the mounted auth query when the session is explicitly ended', async () => {
    const me = { id: 1, name: 'Ada Admin', email: 'admin@newtonite.dev', is_admin: true, csrf_token: 'csrf', memberships: [] }
    vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/auth/logout')) return Promise.resolve(new Response(null, { status: 204 }))
      return Promise.resolve(response(200, me))
    }))

    setupAuthProbe()

    expect(await screen.findByText('Signed in')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByText('Signed out')).toBeInTheDocument()
  })
})
