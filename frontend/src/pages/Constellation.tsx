import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Activity, ArrowUpRight, Box, CircleHelp, List, LoaderCircle, Search, Sparkles } from 'lucide-react'
import { api, errMsg } from '../lib/api'
import { ago, firstName, label } from '../lib/format'
import type { Item, Page, Status } from '../lib/types'
import { STATUSES } from '../lib/types'
import { Button, Card, Empty, ErrorState, PriorityBadge, StatusBadge, cx, inputCls } from '../components/ui'

const ConstellationScene = lazy(() => import('../components/ConstellationScene'))
type ViewMode = '3d' | 'list'
const STATUS_OPTIONS: (Status | '')[] = ['', ...STATUSES]

function SceneLoading() {
  return <div className="grid min-h-[420px] place-items-center text-sm text-muted" role="status"><LoaderCircle className="mr-2 size-4 animate-spin" />Preparing the spatial view…</div>
}

export default function Constellation() {
  const [status, setStatus] = useState<Status | ''>('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<ViewMode>('3d')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(search.trim()), 250)
    return () => window.clearTimeout(timeout)
  }, [search])
  useEffect(() => setSelectedId(null), [status, query])

  const params = useMemo(() => ({
    page_size: 100,
    sort: 'updated_at',
    order: 'desc',
    status: status || undefined,
    q: query || undefined,
  }), [query, status])
  const work = useInfiniteQuery({
    queryKey: ['constellation', params],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<Page<Item>>('/work-items', { params: { ...params, page: pageParam } }),
    getNextPageParam: last => last.page * last.page_size < last.total ? last.page + 1 : undefined,
    placeholderData: keepPreviousData,
  })
  const items = useMemo(() => work.data?.pages.flatMap(page => page.items) ?? [], [work.data])
  const total = work.data?.pages[0]?.total ?? 0
  const selected = items.find(item => item.id === selectedId)

  return (
    <div className="constellation-page space-y-5">
      <div className="page-heading">
        <p className="eyebrow"><Sparkles className="size-3.5" /> NEWTONITE COMMAND / SPATIAL WORKSPACE</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h2>Work constellation</h2><p>Explore the latest work across the teams you can access. Every node is a real work item.</p></div>
          {work.data && <p className="shrink-0 rounded-full border border-line bg-surface/80 px-3 py-1.5 font-mono text-xs tabular-nums text-muted">{items.length.toLocaleString()} of {total.toLocaleString()} loaded</p>}
        </div>
      </div>

      <Card className="constellation-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
            <input aria-label="Search work constellation" className={cx(inputCls, 'pl-9')} placeholder="Find by title or key…" value={search} onChange={event => setSearch(event.target.value)} />
          </div>
          <label className="sr-only" htmlFor="constellation-status">Filter by status</label>
          <select id="constellation-status" aria-label="Filter by status" className={cx(inputCls, 'sm:w-52')} value={status} onChange={event => setStatus(event.target.value as Status | '')}>
            {STATUS_OPTIONS.map(option => <option key={option || 'all'} value={option}>{option ? label(option) : 'All statuses'}</option>)}
          </select>
          <div className="flex shrink-0 gap-1 rounded-lg border border-line bg-bg/65 p-1" role="group" aria-label="Constellation presentation">
            <button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')} className={cx('inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors', view === '3d' ? 'bg-raised text-fg shadow-sm' : 'text-muted hover:text-fg')}><Box className="size-3.5" />3D view</button>
            <button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')} className={cx('inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors', view === 'list' ? 'bg-raised text-fg shadow-sm' : 'text-muted hover:text-fg')}><List className="size-3.5" />List</button>
          </div>
        </div>

        <div className="grid min-h-[480px] lg:grid-cols-[minmax(0,1fr)_290px]">
          <div className="min-w-0 border-b border-line lg:border-b-0 lg:border-r">
            {work.isLoading ? <SceneLoading />
              : work.isError ? <div className="p-5"><ErrorState message={errMsg(work.error)} onRetry={() => void work.refetch()} /></div>
                : items.length === 0 ? <Empty title={query || status ? 'No work matches these filters' : 'No work items are available'} hint="Try a different search or status filter." />
                  : view === '3d'
                    ? <Suspense fallback={<SceneLoading />}>
                      <ConstellationScene items={items} selectedId={selectedId} onSelect={setSelectedId} onFallback={() => setView('list')} />
                    </Suspense>
                    : <div className="constellation-list max-h-[560px] overflow-y-auto p-3" aria-label="Work item list">
                      <ul className="space-y-1">
                        {items.map(item => <li key={item.id}>
                          <button type="button" aria-pressed={selectedId === item.id} onClick={() => setSelectedId(item.id)} className={cx('flex w-full items-start gap-3 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-line hover:bg-raised/65 focus-visible:border-accent-hi', selectedId === item.id && 'border-accent/40 bg-accent/10')}>
                            <span aria-hidden className={cx('constellation-marker mt-1.5 size-2.5 shrink-0', `constellation-marker-${item.status}`)} />
                            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="font-mono text-[11px] text-muted">{item.key}</span><StatusBadge s={item.status} /></span>
                              <span className="mt-1 block truncate text-sm font-medium">{item.title}</span><span className="mt-1 block text-xs text-muted">{item.team.name} · Updated {ago(item.updated_at)}</span></span>
                          </button>
                        </li>)}
                      </ul>
                    </div>}
            {work.hasNextPage && !work.isError && (
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
                <span>Showing newest work first. Load another page to explore older records.</span>
                <Button loading={work.isFetchingNextPage} disabled={work.isFetchingNextPage} onClick={() => void work.fetchNextPage()}>Load more</Button>
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-4 p-4 sm:p-5" aria-label="Selected work details">
            {selected ? <section aria-live="polite">
              <p className="eyebrow"><Activity className="size-3.5" /> SELECTED RECORD</p>
              <p className="font-mono text-xs text-muted">{selected.key}</p>
              <h3 className="mt-2 text-lg font-semibold leading-snug tracking-tight">{selected.title}</h3>
              <div className="mt-3 flex flex-wrap gap-2"><StatusBadge s={selected.status} /><PriorityBadge p={selected.priority} /></div>
              <dl className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
                <div><dt className="text-xs text-muted">Team</dt><dd className="mt-0.5 font-medium">{selected.team.name}</dd></div>
                <div><dt className="text-xs text-muted">Assignee</dt><dd className="mt-0.5 font-medium">{selected.assignee ? firstName(selected.assignee.name) : 'Unassigned'}</dd></div>
                <div><dt className="text-xs text-muted">Priority</dt><dd className="mt-0.5 font-medium">{label(selected.priority)}</dd></div>
                <div><dt className="text-xs text-muted">Last updated</dt><dd className="mt-0.5 font-medium">{ago(selected.updated_at)}</dd></div>
              </dl>
              <Link className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-accent/35 bg-accent/10 px-3 text-sm font-medium text-accent-hi transition-colors hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-accent-hi" to={`/work/${selected.id}`}>
                Open work item <ArrowUpRight className="size-4" />
              </Link>
            </section> : <div className="flex min-h-40 flex-col justify-center">
              <CircleHelp className="size-5 text-accent-hi" />
              <h3 className="mt-3 text-sm font-semibold">Select a work item</h3>
              <p className="mt-1 text-xs leading-5 text-muted">Choose a node in the 3D field or a record in the list to inspect it and open its full workspace record.</p>
            </div>}

            <section className="mt-auto rounded-lg border border-line bg-bg/55 p-3.5">
              <p className="flex items-center gap-2 text-xs font-semibold"><Sparkles className="size-3.5 text-muted" /> AI operations copilot</p>
              <p className="mt-2 text-xs leading-5 text-muted">Unavailable: no AI provider is configured for this workspace. This view is data navigation, not generated analysis.</p>
            </section>
          </aside>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 text-[11px] text-muted sm:px-5">
          {STATUSES.map(value => <span key={value} className="inline-flex items-center gap-1.5"><span aria-hidden className={cx('constellation-marker size-2.5', `constellation-marker-${value}`)} />{label(value)}</span>)}
          <span className="ml-auto basis-full text-xs leading-5 text-muted lg:basis-auto lg:text-right">No dependency links are shown: the current API does not expose workflow dependencies.</span>
        </div>
      </Card>
    </div>
  )
}
