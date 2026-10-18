import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '../lib/toast'
import { AuthProvider } from '../lib/auth'
import Login from '../pages/Login'

function setup(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl))
  return render(<QueryClientProvider client={new QueryClient()}><ToastProvider><MemoryRouter><AuthProvider><Login /></AuthProvider></MemoryRouter></ToastProvider></QueryClientProvider>)
}
const res = (s: number, b: unknown) => Promise.resolve(new Response(JSON.stringify(b), { status: s }))

describe('Login', () => {
  it('validates before calling the API', async () => {
    setup((url) => (url.endsWith('/auth/me') ? res(401, { error: { code: 'not_authenticated', message: 'x' } }) : res(500, {})))
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(await screen.findByText('Password is required')).toBeInTheDocument()
  })
  it('shows the server error for bad credentials', async () => {
    setup((url) => (url.endsWith('/auth/login') ? res(401, { error: { code: 'invalid_credentials', message: 'Invalid email or password' } }) : res(401, { error: { code: 'x', message: 'x' } })))
    await userEvent.type(await screen.findByLabelText(/^Email/), 'a@b.co'); await userEvent.type(screen.getByLabelText(/^Password/), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })
  it('submits reserved test-domain addresses for server-side authentication', async () => {
    const fetchImpl = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/login')) return res(401, { error: { code: 'invalid_credentials', message: 'Invalid email or password' } })
      return res(401, { error: { code: 'not_authenticated', message: 'Authentication required' } })
    })
    setup(fetchImpl)
    await userEvent.type(await screen.findByLabelText(/^Email/), 'admin@demo.test')
    await userEvent.type(screen.getByLabelText(/^Password/), 'not-a-real-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
    const request = fetchImpl.mock.calls.find(([url]) => url.endsWith('/auth/login'))
    expect(request).toBeDefined()
    expect(JSON.parse(String(request?.[1]?.body)).email).toBe('admin@demo.test')
  })
  it('allows the password to be revealed and hidden accessibly', async () => {
    setup((url) => url.endsWith('/auth/me') ? res(401, { error: { code: 'not_authenticated', message: 'x' } }) : res(500, {}))
    const password = await screen.findByLabelText(/^Password/)
    expect(password).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })
  it('explains that a server failure can be retried', async () => {
    setup((url) => url.endsWith('/auth/login')
      ? res(503, { error: { code: 'server_error', message: 'Unavailable' } })
      : res(401, { error: { code: 'not_authenticated', message: 'x' } }))
    await userEvent.type(await screen.findByLabelText(/^Email/), 'a@b.co')
    await userEvent.type(screen.getByLabelText(/^Password/), 'valid-format')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is temporarily unavailable. Please try again.')
  })
})
