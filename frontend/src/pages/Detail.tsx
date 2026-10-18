import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Activity as ActivityIcon, AlertTriangle, ArrowLeft, Pencil, UserCheck } from 'lucide-react'
import { ApiError, api, errMsg } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { PRIORITIES, TRANSITIONS, type Activity, type Comment, type Item, type Page, type Status, type UserBrief } from '../lib/types'
import { actionLabel } from '../lib/format'
import { ago, fmtDate, fmtDateTime, isOverdue, label } from '../lib/format'
import { Avatar, Button, Card, CardHeader, Confirm, Empty, ErrorState, Field, Modal, PriorityBadge, Skeleton, StatusBadge, inputCls } from '../components/ui'
import { Feed } from '../components/Feed'

const dateInput = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-CA') : '')
const FIELDS: [keyof Item, string][] = [['title', 'Title'], ['status', 'Status'], ['priority', 'Priority'], ['assignee', 'Assignee'], ['due_date', 'Due date'], ['description', 'Description']]
const show = (i: Item, k: keyof Item) => k === 'assignee' ? (i.assignee?.name ?? 'Unassigned') : k === 'due_date' ? fmtDate(i.due_date) : k === 'description' ? (i.description ? `${i.description.slice(0, 80)}…` : '—') : String(i[k])
const diff = (a: Item, b: Item) => FIELDS.filter(([k]) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))

type Conflict = { code: string; msg: string; before: Item; latest: Item; retry?: () => void; desc: string }
type Confirming = { title: string; body: string; label: string; danger?: boolean; fn: () => void }

export default function Detail() {
  const id = Number(useParams().id)
  const qc = useQueryClient(), toast = useToast(), { me, roleIn } = useAuth()
  const [conflict, setConflict] = useState<Conflict | null>(null), [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState(false), [confirm, setConfirm] = useState<Confirming | null>(null), [pick, setPick] = useState('')
  const item = useQuery({ queryKey: ['item', id], queryFn: () => api<Item>(`/work-items/${id}`), retry: (n, e) => !(e instanceof ApiError) && n < 2 })
  const users = useQuery({ queryKey: ['users', item.data?.team.id], queryFn: () => api<UserBrief[]>('/users', { params: { team_id: item.data!.team.id } }), enabled: !!item.data })
  const comments = useQuery({ queryKey: ['comments', id], queryFn: () => api<Page<Comment>>(`/work-items/${id}/comments`, { params: { page_size: 100 } }), enabled: !!item.data })
  const acts = useInfiniteQuery({ queryKey: ['activity', id], initialPageParam: 1, enabled: !!item.data,
    queryFn: ({ pageParam }) => api<Page<Activity>>(`/work-items/${id}/activity`, { params: { page: pageParam, page_size: 20 } }),
    getNextPageParam: p => (p.page * p.page_size < p.total ? p.page + 1 : undefined) })

  const refreshRelated = () => { qc.invalidateQueries({ queryKey: ['activity', id] }); qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }) }

  /** Runs a version-guarded action against the LATEST cached record. Success is only announced after the server confirms. */
  async function run(desc: string, fn: (i: Item) => Promise<Item>) {
    const cur = qc.getQueryData<Item>(['item', id])
    if (!cur) return
    setBusy(desc)
    try {
      const next = await fn(cur)
      qc.setQueryData(['item', id], next); setConflict(null); refreshRelated(); toast('success', desc)
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.details?.current) {
        const latest = e.details.current as Item
        qc.setQueryData(['item', id], latest); refreshRelated()      // refresh to the server's truth; do NOT overwrite it
        setConflict({ code: e.code, msg: e.message, before: cur, latest, desc, retry: e.code === 'version_conflict' ? () => run(desc, fn) : undefined })
      } else {
        toast('error', errMsg(e))
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) qc.invalidateQueries({ queryKey: ['item', id] })
      }
    } finally { setBusy(null) }
  }

  if (item.isLoading) return <div className="space-y-3"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64" /></div>
  if (item.error instanceof ApiError && item.error.status === 404) return <Empty title="Work item not found" hint="It doesn’t exist, or you don’t have access to its team." action={<Link to="/work" className="text-accent underline">Back to All Work</Link>} />
  if (item.isError) return <ErrorState message={errMsg(item.error)} onRetry={() => item.refetch()} />
  const it = item.data!
  const role = roleIn(it.team.id), isMgr = role === 'admin' || role === 'lead', isMember = role === 'member'
  const mineItem = it.assignee?.id === me!.id
  const canEdit = (isMgr || (isMember && (mineItem || it.creator.id === me!.id))) && it.status !== 'closed'
  const canMove = isMgr || (isMember && mineItem)
  const patch = (body: object) => (i: Item) => api<Item>(`/work-items/${id}`, { method: 'PATCH', body: { expected_version: i.version, ...body } })
  const assign = (assignee_id: number | null, reassign: boolean) => (i: Item) => api<Item>(`/work-items/${id}/assign`, { method: 'POST', body: reassign ? { assignee_id, expected_version: i.version } : { assignee_id } })
  const move = (to: Status) => (i: Item) => api<Item>(`/work-items/${id}/transition`, { method: 'POST', body: { to_status: to, expected_version: i.version } })

  const startMove = (s: Status) => {
    const leadOnly = s === 'resolved' || s === 'closed' || it.status === 'awaiting_approval' || it.status === 'resolved' || it.status === 'closed'
    const lab = actionLabel(it.status, s), go = () => run(`${lab} — ${it.key} is now ${label(s)}`, move(s))
    if (leadOnly) setConfirm({ title: `${lab}?`, body: `${it.key} will move from “${label(it.status)}” to “${label(s)}”.`, label: lab, danger: s === 'closed', fn: go })
    else go()
  }
  const next: { label: string; fn: () => void } | null = it.status === 'closed' ? (isMgr ? { label: 'Reopen', fn: () => startMove('open') } : null)
    : !it.assignee && role !== 'viewer' ? { label: 'Claim this item', fn: () => run('Item claimed', assign(me!.id, false)) }
    : it.status === 'awaiting_approval' ? (isMgr ? { label: 'Approve', fn: () => startMove('resolved') } : null)
    : it.status === 'resolved' ? (isMgr ? { label: 'Close', fn: () => startMove('closed') } : null)
    : canMove && it.status === 'open' ? { label: 'Start work', fn: () => startMove('in_progress') }
    : canMove && it.status === 'in_progress' ? { label: 'Submit for approval', fn: () => startMove('awaiting_approval') }
    : canMove && it.status === 'blocked' ? { label: 'Unblock', fn: () => startMove('in_progress') } : null
  return (
    <div className="space-y-4">
      <Link to="/work" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4" />All work</Link>
      {conflict && (
        <div role="alert" className="space-y-2 rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4 text-warn" />{conflict.code === 'already_assigned' ? 'Someone else claimed this item first.' : 'This item changed while you were working.'}</p>
          <p>“{conflict.desc}” was <strong>not</strong> applied. {conflict.msg} The page now shows the latest version (v{conflict.latest.version}, updated {ago(conflict.latest.updated_at)}).</p>
          {diff(conflict.before, conflict.latest).length > 0 && <ul className="list-disc pl-5 text-muted">{diff(conflict.before, conflict.latest).map(([k, l]) => <li key={k}>{l}: {show(conflict.before, k)} → <strong className="text-fg">{show(conflict.latest, k)}</strong></li>)}</ul>}
          <div className="flex gap-2">{conflict.retry && <Button variant="primary" loading={!!busy} onClick={conflict.retry}>Review done — retry on latest</Button>}<Button onClick={() => setConflict(null)}>Dismiss</Button></div>
        </div>)}
      <div className="detail-heading flex flex-wrap items-start justify-between gap-4 rounded-xl border border-line bg-surface px-5 py-6 sm:px-7">
        <div className="min-w-0 flex-1">
          <p className="eyebrow mb-3"><ActivityIcon className="size-3.5" /> WORK ITEM / {it.key}</p>
          <div className="flex flex-wrap items-center gap-2.5"><span className="font-mono text-xs text-muted">{it.key}</span><span className="text-xs text-muted">{label(it.type)}</span>
            <StatusBadge s={it.status} /><PriorityBadge p={it.priority} /><span className="text-xs tabular-nums text-muted" title="Record version used to detect conflicting edits">v{it.version}</span></div>
          <h2 className="mt-4 text-[24px] font-semibold leading-snug tracking-[-0.035em] sm:text-[30px]">{it.title}</h2>
          <p className="mt-2 text-[13px] text-muted">Opened by <span className="text-fg/85">{it.creator.name}</span> · updated {ago(it.updated_at)}</p></div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {next && <Button variant="primary" loading={!!busy} onClick={next.fn}>{next.label}</Button>}
          <Button onClick={() => setEditing(true)} disabled={!canEdit} title={canEdit ? undefined : it.status === 'closed' ? 'Closed items can’t be edited; reopen first' : 'Only leads, or the creator/assignee, can edit'}><Pencil className="size-3.5" />Edit</Button></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardHeader title="Description" /><p className="whitespace-pre-wrap p-4 text-sm">{it.description || <span className="text-muted">No description.</span>}</p></Card>
          <Card><CardHeader title={`Comments (${comments.data?.total ?? 0})`} />
            <div className="space-y-4 p-4">
              {comments.isLoading ? <Skeleton className="h-16" /> : comments.isError ? <ErrorState message={errMsg(comments.error)} onRetry={() => comments.refetch()} />
                : comments.data!.items.length === 0 ? <p className="text-sm text-muted">No comments yet.</p>
                : comments.data!.items.map(c => <div key={c.id} className="flex gap-3"><Avatar name={c.author.name} /><div><p className="text-sm"><span className="font-medium">{c.author.name}</span> <span className="text-xs text-muted">{ago(c.created_at)}</span></p><p className="whitespace-pre-wrap text-sm">{c.body}</p></div></div>)}
              {role === 'viewer' ? <p className="text-xs text-muted">Viewers can’t comment.</p> : <CommentForm id={id} onDone={() => { qc.invalidateQueries({ queryKey: ['comments', id] }); refreshRelated() }} />}
            </div></Card>
          <Card><CardHeader title="Activity" /><div className="p-4 pl-6">
            {acts.isLoading ? <Skeleton className="h-24" /> : acts.isError ? <ErrorState message={errMsg(acts.error)} onRetry={() => acts.refetch()} />
              : <><Feed items={acts.data!.pages.flatMap(p => p.items)} />{acts.hasNextPage && <Button className="mt-4" loading={acts.isFetchingNextPage} onClick={() => acts.fetchNextPage()}>Load older activity</Button>}</>}</div></Card>
        </div>
        <div className="space-y-4">
          <Card><CardHeader title="Details" />
            <dl className="grid grid-cols-[6rem_1fr] gap-y-3 p-4 text-sm">
              <dt className="text-muted">Status</dt><dd><StatusBadge s={it.status} /></dd>
              <dt className="text-muted">Priority</dt><dd>{canEdit
                ? <select aria-label="Change priority" className="h-7 rounded-md border border-line-strong bg-bg px-2 text-xs transition-colors duration-150 hover:border-accent-hi/70" value={it.priority} disabled={!!busy} onChange={e => run(`Priority set to ${label(e.target.value)}`, patch({ priority: e.target.value }))}>{PRIORITIES.map(p => <option key={p} value={p}>{label(p)}</option>)}</select>
                : <PriorityBadge p={it.priority} />}</dd>
              <dt className="text-muted">Team</dt><dd>{it.team.name}</dd>
              <dt className="text-muted">Assignee</dt><dd>{it.assignee ? <span className="flex items-center gap-2"><Avatar name={it.assignee.name} />{it.assignee.name}</span> : 'Unassigned'}</dd>
              <dt className="text-muted">Creator</dt><dd>{it.creator.name}</dd>
              <dt className="text-muted">Due</dt><dd className={isOverdue(it.due_date, it.status) ? 'text-crit' : ''}>{fmtDate(it.due_date)}{isOverdue(it.due_date, it.status) && ' (overdue)'}</dd>
              <dt className="text-muted">Created</dt><dd>{fmtDateTime(it.created_at)}</dd><dt className="text-muted">Updated</dt><dd>{fmtDateTime(it.updated_at)}</dd>
              {it.resolved_at && <><dt className="text-muted">Resolved</dt><dd>{fmtDateTime(it.resolved_at)}</dd></>}
            </dl></Card>
          <Card><CardHeader title="Assignment" /><div className="space-y-3 p-4">
            {!it.assignee && role !== 'viewer' && it.status !== 'closed' && <Button variant="primary" className="w-full" loading={busy === 'Item claimed'} disabled={!!busy} onClick={() => run('Item claimed', assign(me!.id, false))}><UserCheck className="size-4" />Claim this item</Button>}
            {isMgr && it.status !== 'closed' && <div className="flex gap-2"><select aria-label="Choose assignee" className={inputCls} value={pick} onChange={e => setPick(e.target.value)}><option value="">Choose person…</option>{users.data?.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              <Button disabled={!pick || !!busy} onClick={() => run(`Assigned to ${users.data?.find(u => u.id === +pick)?.name}`, assign(+pick, !!it.assignee))}>{it.assignee ? 'Reassign' : 'Assign'}</Button></div>}
            {isMgr && it.assignee && it.status !== 'closed' && <Button disabled={!!busy} onClick={() => setConfirm({ title: 'Remove assignee?', body: `${it.key} will become unassigned and can be claimed by any team member.`, label: 'Unassign', danger: true, fn: () => run('Assignee removed', assign(null, true)) })}>Unassign</Button>}
            {!isMgr && it.assignee && <p className="text-xs text-muted">Only leads can reassign or unassign.</p>}
            {role === 'viewer' && <p className="text-xs text-muted">Viewers have read-only access.</p>}
          </div></Card>
          <Card><CardHeader title="Move to" sub="Only valid next steps are listed" /><div className="flex flex-wrap gap-2 p-4">
            {TRANSITIONS[it.status].map(s => {
              const leadOnly = s === 'resolved' || s === 'closed' || it.status === 'awaiting_approval' || it.status === 'resolved' || it.status === 'closed'
              const allowed = isMgr || (canMove && !leadOnly)
              return <Button key={s} disabled={!allowed || !!busy} title={allowed ? undefined : leadOnly ? 'Only a team lead can approve, send back, close or reopen' : 'Only leads or the assignee can change status'}
                onClick={() => startMove(s)}>{actionLabel(it.status, s)}</Button>
            })}</div></Card>
        </div>
      </div>
      <Modal open={editing} onClose={() => setEditing(false)} title={`Edit ${it.key}`} wide>{editing && <EditForm item={it} onClose={() => setEditing(false)} onSaved={n => { qc.setQueryData(['item', id], n); refreshRelated(); toast('success', 'Changes saved'); setEditing(false) }} />}</Modal>
      <Confirm open={!!confirm} title={confirm?.title ?? ''} body={confirm?.body} confirmLabel={confirm?.label ?? ''} danger={confirm?.danger} onCancel={() => setConfirm(null)} onConfirm={() => { const f = confirm!.fn; setConfirm(null); f() }} />
    </div>
  )
}

function CommentForm({ id, onDone }: { id: number; onDone: () => void }) {
  const toast = useToast()
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<{ body: string }>({ resolver: zodResolver(z.object({ body: z.string().trim().min(1, 'Write something first').max(5000) })) })
  return (
    <form noValidate onSubmit={handleSubmit(async v => { try { await api(`/work-items/${id}/comments`, { method: 'POST', body: v }); reset(); onDone(); toast('success', 'Comment posted') } catch (e) { toast('error', errMsg(e)) } })} className="space-y-2">
      <Field label="Add a comment" optionalTag={false} htmlFor="comment" error={errors.body?.message}><textarea id="comment" rows={3} className={inputCls} {...register('body')} /></Field>
      <Button type="submit" variant="primary" loading={isSubmitting}>Comment</Button></form>
  )
}

const editSchema = z.object({ title: z.string().trim().min(1, 'Title is required').max(200), description: z.string().max(10000), priority: z.enum(PRIORITIES), due_date: z.string() })
function EditForm({ item, onClose, onSaved }: { item: Item; onClose: () => void; onSaved: (i: Item) => void }) {
  const qc = useQueryClient(), toast = useToast()
  const base = useRef(item)                               // the version this edit session is based on
  const [latest, setLatest] = useState<Item | null>(null)
  const vals = (i: Item) => ({ title: i.title, description: i.description, priority: i.priority, due_date: dateInput(i.due_date) })
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<z.infer<typeof editSchema>>({ resolver: zodResolver(editSchema), defaultValues: vals(item) })
  const submit = handleSubmit(async v => {
    const b = vals(base.current), body: Record<string, unknown> = { expected_version: base.current.version }
    if (v.title !== b.title) body.title = v.title
    if (v.description !== b.description) body.description = v.description
    if (v.priority !== b.priority) body.priority = v.priority
    if (v.due_date !== b.due_date) body.due_date = v.due_date ? new Date(`${v.due_date}T17:00:00`).toISOString() : null
    if (Object.keys(body).length === 1) { onClose(); return }
    try { onSaved(await api<Item>(`/work-items/${item.id}`, { method: 'PATCH', body })) }
    catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.details?.current) { setLatest(e.details.current); qc.setQueryData(['item', item.id], e.details.current) }
      else toast('error', errMsg(e))
    }
  })
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {latest && (
        <div role="alert" className="space-y-2 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
          <p className="font-medium">Someone updated this item (now v{latest.version}). Your changes were not saved.</p>
          <ul className="list-disc pl-5">{diff(base.current, latest).map(([k, l]) => <li key={k}>{l}: {show(base.current, k)} → <strong>{show(latest, k)}</strong></li>)}</ul>
          <Button type="button" onClick={() => { reset(vals(latest)); base.current = latest; setLatest(null) }}>Load latest values into the form</Button></div>)}
      <Field label="Title" htmlFor="e-title" error={errors.title?.message}><input id="e-title" className={inputCls} {...register('title')} /></Field>
      <Field label="Description" htmlFor="e-desc" error={errors.description?.message}><textarea id="e-desc" rows={5} className={inputCls} {...register('description')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" htmlFor="e-prio"><select id="e-prio" className={inputCls} {...register('priority')}>{PRIORITIES.map(p => <option key={p} value={p}>{label(p)}</option>)}</select></Field>
        <Field label="Due date" htmlFor="e-due"><input id="e-due" type="date" className={inputCls} {...register('due_date')} /></Field></div>
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={isSubmitting} disabled={!!latest}>Save changes</Button></div>
    </form>
  )
}
