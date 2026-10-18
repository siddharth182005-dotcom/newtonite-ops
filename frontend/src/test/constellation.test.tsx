import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { Item, Page } from '../lib/types'
import Constellation from '../pages/Constellation'

vi.mock('../components/ConstellationScene', () => ({
  default: ({ items, onSelect }: { items: Item[]; onSelect: (id: number) => void }) => (
    <div aria-label="3D scene test double">
      {items.map(item => <button key={item.id} onClick={() => onSelect(item.id)}>Select {item.key}</button>)}
    </div>
  ),
}))

const item: Item = {
  id: 1001,
  key: 'OPS-2001',
  title: 'Payment reconciliation stalled',
  description: 'Investigate the delayed reconciliation.',
  type: 'incident',
  status: 'blocked',
  priority: 'high',
  team: { id: 7, name: 'Payments' },
  creator: { id: 1, name: 'Ada Admin' },
  assignee: { id: 2, name: 'Lena Lead' },
  due_date: null,
  version: 1,
  created_at: '2026-10-18T10:00:00Z',
  updated_at: '2026-10-18T11:00:00Z',
  resolved_at: null,
}
const page: Page<Item> = { items: [item], total: 1, page: 1, page_size: 100 }

function setup(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/constellation']}>
        <Routes><Route path="/constellation" element={<Constellation />} /><Route path="/work/:id" element={<p>Work record route</p>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function apiResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

afterEach(() => vi.unstubAllGlobals())

describe('work constellation', () => {
  it('loads team-scoped work from the existing API and opens the selected record', async () => {
    const fetcher = vi.fn((_input: string | URL | Request) => apiResponse(page))
    setup(fetcher as unknown as typeof fetch)

    await userEvent.click(await screen.findByRole('button', { name: 'Select OPS-2001' }))
    expect(screen.getByRole('heading', { name: item.title })).toBeInTheDocument()
    expect(screen.getByText('AI operations copilot')).toBeInTheDocument()
    expect(screen.getByText(/no AI provider is configured/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Open work item' }))
    expect(await screen.findByText('Work record route')).toBeInTheDocument()

    const requestedUrl = new URL(String(fetcher.mock.calls[0][0]), 'http://localhost')
    expect(requestedUrl.pathname).toBe('/api/v1/work-items')
    expect(requestedUrl.searchParams.get('page_size')).toBe('100')
  })

  it('sends status and text filters to the server-side work-item endpoint', async () => {
    const fetcher = vi.fn((_input: string | URL | Request) => apiResponse(page))
    setup(fetcher as unknown as typeof fetch)
    const user = userEvent.setup()

    await screen.findByRole('button', { name: 'Select OPS-2001' })
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'blocked')
    await user.type(screen.getByRole('textbox', { name: 'Search work constellation' }), 'OPS-2001')

    await waitFor(() => {
      const requests = fetcher.mock.calls.map(([input]) => new URL(String(input), 'http://localhost'))
      expect(requests.some(url => url.searchParams.get('status') === 'blocked' && url.searchParams.get('q') === 'OPS-2001')).toBe(true)
    })
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('button', { name: /Payment reconciliation stalled/ })).toBeInTheDocument()
  })
})
