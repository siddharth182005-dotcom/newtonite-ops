import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, ApiError, errMsg, NetworkError } from '../lib/api'
import { IdempotencySession } from '../lib/idem'
import { useAuth } from '../lib/auth'
import { useToast } from '../lib/toast'
import { label } from '../lib/format'
import { PRIORITIES, TYPES, type Item, type TeamInfo } from '../lib/types'
import { Button, Field, inputCls, Modal } from './ui'

const schema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Max 200 characters'),
  description: z.string().max(10000),
  type: z.enum(TYPES), priority: z.enum(PRIORITIES), team_id: z.coerce.number().int().positive('Choose a team'),
  due_date: z.string().optional(),
})
type Form = z.input<typeof schema>

export function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return <Modal open={open} onClose={onClose} title="Create work item" wide>{open && <Inner onClose={onClose} />}</Modal>
}

function Inner({ onClose }: { onClose: () => void }) {
  const { me, roleIn } = useAuth()
  const qc = useQueryClient(), nav = useNavigate(), toast = useToast()
  const teams = useQuery({ queryKey: ['teams'], queryFn: () => api<TeamInfo[]>('/teams') })
  const writable = (teams.data ?? []).filter(t => { const r = roleIn(t.id); return r && r !== 'viewer' })
  const session = useRef(new IdempotencySession())   // one key per logical submission
  const [uncertain, setUncertain] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema), defaultValues: { type: 'task', priority: 'medium', description: '', team_id: me?.memberships.find(m => m.role !== 'viewer')?.team_id as any },
  })
  const m = useMutation({
    mutationFn: (v: z.output<typeof schema>) => {
      const body = { ...v, due_date: v.due_date ? new Date(`${v.due_date}T17:00:00`).toISOString() : null }
      return api<Item>('/work-items', { method: 'POST', body, headers: { 'Idempotency-Key': session.current.keyFor(body) } })
    },
    onSuccess: item => {
      session.current.settle(); setUncertain(false)
      qc.invalidateQueries({ queryKey: ['items'] }); qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast('success', `${item.key} created`); onClose(); nav(`/work/${item.id}`)
    },
    onError: e => {
      const unknown = e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)
      if (unknown) setUncertain(true)               // keep key: retrying the same payload is safe
      else { session.current.settle(); setUncertain(false) }
      toast('error', errMsg(e))
    },
  })
  return (
    <form onSubmit={handleSubmit(v => m.mutate(v as any))} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="c-title" required hint="A short, specific summary — it is what people scan in lists." error={errors.title?.message}><input id="c-title" autoFocus aria-required maxLength={200} className={inputCls} {...register('title')} /></Field>
      <Field label="Description" htmlFor="c-desc" hint="What happened, why it matters, and what has been tried." error={errors.description?.message}><textarea id="c-desc" rows={4} className={inputCls} {...register('description')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Team" htmlFor="c-team" required hint="Who can see and work on it." error={errors.team_id?.message}>
          <select id="c-team" aria-required className={inputCls} {...register('team_id')}>{writable.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        <Field label="Type" htmlFor="c-type" required><select id="c-type" className={inputCls} {...register('type')}>{TYPES.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
        <Field label="Priority" htmlFor="c-prio" required hint="Critical and high surface in Unassigned Urgent."><select id="c-prio" className={inputCls} {...register('priority')}>{PRIORITIES.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
        <Field label="Due date" htmlFor="c-due" hint="Overdue items appear in Needs Attention."><input id="c-due" type="date" className={inputCls} {...register('due_date')} /></Field>
      </div>
      {!teams.isLoading && writable.length === 0 && <p role="alert" className="text-sm text-crit">You don’t have member access to any team, so you can’t create work items.</p>}
      {uncertain && <p role="status" className="rounded-lg bg-warn/15 p-3 text-sm">We couldn’t confirm whether the item was created. Submitting again is safe — the same request key is reused, so no duplicate will be made.</p>}
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={m.isPending} disabled={writable.length === 0}>{m.isPending ? 'Creating…' : uncertain ? 'Retry safely' : 'Create'}</Button></div>
    </form>
  )
}
