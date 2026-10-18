import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ToastProvider } from '../lib/toast'
import { AuthProvider } from '../lib/auth'
import App from '../App'

const me = { id: 1, name: 'Ada Admin', email: 'admin@newtonite.dev', is_admin: true, csrf_token: 'csrf', memberships: [] }
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

function setup() {
  vi.stubGlobal('fetch', vi.fn((input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith('/auth/me')) return Promise.resolve(response(200, me))
    return Promise.resolve(response(500, { error: { code: 'unavailable', message: 'Unavailable' } }))
  }))

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

describe('command navigation', () => {
  it('collapses and expands the desktop navigation while retaining accessible destinations', async () => {
    setup()
    const user = userEvent.setup()
    const collapse = await screen.findByRole('button', { name: 'Collapse navigation' })
    const shell = document.querySelector<HTMLDivElement>('.command-app')!

    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    expect(shell.style.gridTemplateColumns).toMatch(/^264px minmax/)
    await user.click(collapse)

    const expand = screen.getByRole('button', { name: 'Expand navigation' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(shell.style.gridTemplateColumns).toMatch(/^78px minmax/)
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All Work' })).toHaveAttribute('title', 'All Work')
    await user.click(expand)
    expect(screen.getByRole('button', { name: 'Collapse navigation' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes the mobile navigation drawer on Escape', async () => {
    setup()
    const user = userEvent.setup()
    const open = await screen.findByRole('button', { name: 'Open navigation' })

    expect(open).toHaveAttribute('aria-expanded', 'false')
    await user.click(open)
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false')
  })
})
