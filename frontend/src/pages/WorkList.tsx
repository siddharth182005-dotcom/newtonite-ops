import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Activity, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, FilterX, SlidersHorizontal, X } from 'lucide-react'
import { api, errMsg } from '../lib/api'
import { PRIORITIES, STATUSES, TYPES, type Item, type Page, type TeamInfo, type UserBrief } from '../lib/types'
import { label } from '../lib/format'
import { Button, Card, Empty, ErrorState, Skeleton, cx, inputCls } from '../components/ui'
import { WorkTable } from '../components/WorkTable'

const PAGE_SIZE = 15
const SORTS = ['updated_at', 'created_at', 'priority', 'status', 'due_date', 'key']

function Chips({ options, value, onChange, name }: { options: string[]; value: string[]; onChange: (v: string[]) => void; name: string }) {
  return (
    <div role="group" aria-label={name} className="flex flex-wrap gap-1">{options.map(o => {
      const on = value.includes(o)
      return <button key={o} type="button" aria-pressed={on} onClick={() => onChange(on ? value.filter(x => x !== o) : [...value, o])}
        className={cx('rounded-md border px-2 py-1 text-xs transition-colors duration-150', on ? 'border-accent/60 bg-accent/15 font-medium text-accent-hi' : 'border-line text-muted hover:border-line-strong hover:bg-raised hover:text-fg')}>{label(o)}</button>
    })}</div>
  )
}

type View = 'assigned_to_me' | 'unassigned_urgent' | 'awaiting_my_approval' | 'needs_attention'
const HEAD: Record<string, [string, string]> = { assigned_to_me: ['Assigned to me', 'Active items you currently own.'], unassigned_urgent: ['Unassigned urgent', 'Critical or high-priority items nobody owns yet. Claim one to take it.'], awaiting_my_approval: ['Awaiting my approval', 'Submitted work in teams where you are a lead.'], needs_attention: ['Needs attention', 'Active work that is blocked, overdue, or urgent with no owner.'] }
const EMPTY: Record<string, string> = { needs_attention: 'Nothing needs attention right now', assigned_to_me: 'Nothing is assigned to you', unassigned_urgent: 'No unassigned critical or high-priority work', awaiting_my_approval: 'Nothing is waiting for your approval' }
export default function WorkList({ view }: { view?: View }) {
  const mine = view === 'assigned_to_me'
  const [sp, setSp] = useSearchParams()
  const get = (k: string) => sp.get(k) ?? ''
  const set = (patch: Record<string, string | string[] | null>) => {
    const n = new URLSearchParams(sp)
    for (const [k, v] of Object.entries(patch)) { n.delete(k); for (const x of Array.isArray(v) ? v : v ? [v] : []) n.append(k, x) }
    if (!('page' in patch)) n.delete('page')
    setSp(n, { replace: true })
  }
  const [text, setText] = useState(get('q'))
  useEffect(() => { setText(get('q')) }, [sp.get('q')])             // header search / back button
  useEffect(() => { const t = setTimeout(() => { if (text !== get('q')) set({ q: text.trim() || null }) }, 300); return () => clearTimeout(t) }, [text])
  const page = Math.max(1, Number(get('page')) || 1), sort = SORTS.includes(get('sort')) ? get('sort') : 'updated_at', order = get('order') === 'asc' ? 'asc' : 'desc'
  const params = { q: get('q'), status: sp.getAll('status'), priority: sp.getAll('priority'), type: sp.getAll('type'), team_id: get('team_id'),
    assignee: get('assignee'), view, overdue: get('overdue') === 'true' ? true : undefined, sort, order, page, page_size: PAGE_SIZE }
  const q = useQuery({ queryKey: ['items', params], queryFn: () => api<Page<Item>>('/work-items', { params }), placeholderData: keepPreviousData })
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api<TeamInfo[]>('/teams') })
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<UserBrief[]>('/users'), enabled: view !== 'assigned_to_me' && view !== 'unassigned_urgent' })
  const chips: { k: string; v?: string; text: string }[] = [
    ...(get('q') ? [{ k: 'q', text: `Search: “${get('q')}”` }] : []),
    ...sp.getAll('status').map(v => ({ k: 'status', v, text: `Status: ${label(v)}` })), ...sp.getAll('priority').map(v => ({ k: 'priority', v, text: `Priority: ${label(v)}` })),
    ...sp.getAll('type').map(v => ({ k: 'type', v, text: `Type: ${label(v)}` })),
    ...(get('team_id') ? [{ k: 'team_id', text: `Team: ${teams.data?.find(t => String(t.id) === get('team_id'))?.name ?? get('team_id')}` }] : []),
    ...(get('assignee') ? [{ k: 'assignee', text: `Assignee: ${get('assignee') === 'me' ? 'Me' : get('assignee') === 'unassigned' ? 'Unassigned' : users.data?.find(u => String(u.id) === get('assignee'))?.name ?? get('assignee')}` }] : []),
    ...(get('overdue') === 'true' ? [{ k: 'overdue', text: 'Overdue only' }] : []),
  ]
  const dropChip = (c: { k: string; v?: string }) => set({ [c.k]: c.v ? sp.getAll(c.k).filter(x => x !== c.v) : null })
  const filtered = ['q', 'status', 'priority', 'type', 'team_id', 'assignee', 'overdue'].some(k => sp.has(k))
  const d = q.data, pages = d ? Math.max(1, Math.ceil(d.total / PAGE_SIZE)) : 1
  return (
    <div className="space-y-4">
      <div className="page-heading"><p className="eyebrow"><Activity className="size-3.5" /> WORKSPACE / WORK QUEUE</p><div className="flex flex-wrap items-end justify-between gap-3"><div><h2>{view ? HEAD[view][0] : 'All work'}</h2><p>{view ? HEAD[view][1] : 'Every item in the teams you can access. Search, filters, sorting, and paging run on the server.'}</p></div>{d && <span className="rounded-full border border-line bg-surface px-3 py-1 text-xs tabular-nums text-muted">{d.total.toLocaleString()} {d.total === 1 ? 'item' : 'items'}</span>}</div></div>
      <Card className="work-filter-panel space-y-3 p-4 md:p-5">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <div className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-accent-hi" /><h3 className="text-[13px] font-semibold">Refine the queue</h3></div>
          <span className="text-[11px] tabular-nums text-muted">{chips.length ? `${chips.length} active ${chips.length === 1 ? 'filter' : 'filters'}` : 'All available work'}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <input aria-label="Filter by text" className={cx(inputCls, 'md:col-span-2')} placeholder="Filter by title or key…" value={text} onChange={e => setText(e.target.value)} />
          <select aria-label="Team" className={inputCls} value={get('team_id')} onChange={e => set({ team_id: e.target.value || null })}><option value="">All teams</option>{teams.data?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          {view !== 'assigned_to_me' && view !== 'unassigned_urgent' && <select aria-label="Assignee" className={inputCls} value={get('assignee')} onChange={e => set({ assignee: e.target.value || null })}>
            <option value="">Anyone</option><option value="me">Me</option><option value="unassigned">Unassigned</option>{users.data?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>}
        </div>
        <Chips name="Status" options={STATUSES} value={sp.getAll('status')} onChange={v => set({ status: v })} />
        <Chips name="Priority" options={PRIORITIES} value={sp.getAll('priority')} onChange={v => set({ priority: v })} />
        <div className="flex flex-wrap items-center gap-3">
          <Chips name="Type" options={TYPES} value={sp.getAll('type')} onChange={v => set({ type: v })} />
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={get('overdue') === 'true'} onChange={e => set({ overdue: e.target.checked ? 'true' : null })} />Overdue only</label>
          <div className="ml-auto flex items-center gap-1">
            <select aria-label="Sort by" className={cx(inputCls, 'w-auto!')} value={sort} onChange={e => set({ sort: e.target.value, order, page: null })}>{SORTS.map(s => <option key={s} value={s}>Sort: {label(s)}</option>)}</select>
            <Button aria-label={order === 'asc' ? 'Ascending order' : 'Descending order'} onClick={() => set({ sort, order: order === 'asc' ? 'desc' : 'asc', page: null })}>{order === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}</Button>
            {filtered && <Button onClick={() => { setText(''); setSp(new URLSearchParams(), { replace: true }) }}><FilterX className="size-4" />Clear</Button>}</div>
        </div>
      </Card>
      {chips.length > 0 && <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">{chips.map(c => (
        <button key={c.k + (c.v ?? '')} onClick={() => dropChip(c)} aria-label={`Remove filter ${c.text}`} className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface pl-2 pr-1.5 text-xs transition-colors duration-150 hover:border-line-strong hover:bg-raised">{c.text}<X className="size-3 text-muted" /></button>))}</div>}
      <Card>
        {q.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
          : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />
          : d!.items.length === 0 ? <Empty title={filtered ? 'No work items match these filters' : view ? EMPTY[view] : 'No work items yet'} hint={filtered ? 'Try removing a filter.' : view ? 'You’re all caught up.' : 'Create one with the button in the header.'} />
          : <div className={cx(q.isPlaceholderData && 'opacity-60')}><WorkTable items={d!.items} signals={view === 'needs_attention'} /></div>}
        {d && d.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm">
            <span className="text-muted">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, d.total)} of {d.total}</span>
            <div className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => set({ page: String(page - 1) })} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
              <span className="text-xs text-muted">Page {page} / {pages}</span>
              <Button disabled={page >= pages} onClick={() => set({ page: String(page + 1) })} aria-label="Next page"><ChevronRight className="size-4" /></Button></div></div>)}
      </Card>
    </div>
  )
}
