import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { api, errMsg } from '../lib/api'
import type { Item, Page } from '../lib/types'
import { Button, Card, CardHeader, Empty, ErrorState, IconButton, Skeleton, cx, inputCls } from './ui'
import { WorkTable } from './WorkTable'

const SIZE = 8
const SORTS: [string, string][] = [['priority', 'Priority'], ['due_date', 'Due date'], ['updated_at', 'Last updated']]

/** The dashboard centrepiece. All search / sort / paging is server-side via GET /work-items?view=needs_attention. */
export function AttentionQueue() {
  const [text, setText] = useState(''), [q, setQ] = useState(''), [sort, setSort] = useState('priority'), [order, setOrder] = useState<'asc' | 'desc'>('asc'), [page, setPage] = useState(1)
  useEffect(() => { const t = setTimeout(() => { setQ(text.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [text])
  const params = { view: 'needs_attention', q, sort, order, page, page_size: SIZE }
  const r = useQuery({ queryKey: ['items', 'attention', params], queryFn: () => api<Page<Item>>('/work-items', { params }), placeholderData: keepPreviousData })
  const d = r.data, pages = d ? Math.max(1, Math.ceil(d.total / SIZE)) : 1
  return (
    <Card>
      <CardHeader title="Needs attention" sub="Active work that is blocked, overdue, or urgent with no owner"
        action={<Link to="/attention" className="whitespace-nowrap text-xs font-medium text-accent-hi hover:underline">Open queue</Link>} />
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <div className="relative min-w-40 flex-1"><Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted" />
          <input aria-label="Search the attention queue" placeholder="Search this queue" value={text} onChange={e => setText(e.target.value)} className={cx(inputCls, 'min-h-8 py-1 pl-8 text-[13px]')} /></div>
        <div className="flex items-center gap-2"><select aria-label="Sort attention queue" value={sort} onChange={e => { setSort(e.target.value); setPage(1) }} className={cx(inputCls, 'min-h-8 w-auto! py-1 text-[13px]')}>{SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}</select>
        <IconButton label={order === 'asc' ? 'Ascending — switch to descending' : 'Descending — switch to ascending'} onClick={() => { setOrder(o => (o === 'asc' ? 'desc' : 'asc')); setPage(1) }} className="border border-line-strong/60">
          {order === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}</IconButton></div>
      </div>
      {r.isLoading ? <div className="space-y-px p-2">{Array.from({ length: SIZE }, (_, i) => <Skeleton key={i} className="h-[58px]" />)}</div>
        : r.isError ? <div className="p-4"><ErrorState message={errMsg(r.error)} onRetry={() => r.refetch()} /></div>
        : d!.items.length === 0 ? <Empty title={q ? 'Nothing in the queue matches your search' : 'All clear'} hint={q ? 'Try a different title or key.' : 'No blocked, overdue or unowned urgent work right now.'} />
        : <div className={cx('transition-opacity duration-150', r.isPlaceholderData && 'opacity-60')}><WorkTable items={d!.items} compact signals /></div>}
      {d && d.total > 0 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
          <span className="tabular-nums">{(page - 1) * SIZE + 1}–{Math.min(page * SIZE, d.total)} of {d.total}</span>
          <div className="flex items-center gap-1"><Button variant="ghost" className="size-8 px-0" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4" /></Button>
            <span className="tabular-nums">{page} / {pages}</span>
            <Button variant="ghost" className="size-8 px-0" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4" /></Button></div>
        </div>)}
    </Card>
  )
}
