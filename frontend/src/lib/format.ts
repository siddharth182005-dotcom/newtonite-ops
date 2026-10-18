import type { Activity } from './types'
export const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
export const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
export const fmtDateTime = (s: string) => new Date(s).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export function ago(s: string) {
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (m < 1440) return `${Math.round(m / 60)}h ago`
  return `${Math.round(m / 1440)}d ago`
}
export const isOverdue = (due: string | null, status: string) => !!due && new Date(due) < new Date() && status !== 'resolved' && status !== 'closed'
export function describe(a: Activity): string {
  const n = a.new_value && label(a.new_value), o = a.old_value && label(a.old_value)
  switch (a.action) {
    case 'created': return 'created this item'
    case 'claimed': return 'claimed this item'
    case 'assigned': case 'reassigned': return `assigned this to ${a.meta?.new_assignee ?? 'someone'}`
    case 'unassigned': return 'removed the assignee'
    case 'status_changed': return `moved status from ${o} to ${n}`
    case 'approved': return 'approved this item (resolved)'
    case 'changes_requested': return 'sent this back for changes'
    case 'closed': return 'closed this item'
    case 'reopened': return `reopened this item (${o} → ${n})`
    case 'commented': return 'added a comment'
    case 'updated':
      if (a.field === 'description') return 'edited the description'
      return `changed ${a.field?.replace('_', ' ')}${a.old_value || a.new_value ? `: ${o ?? '—'} → ${n ?? '—'}` : ''}`
    default: return a.action
  }
}

/** Button wording for a transition; mirrors the backend's approve / reject / close / reopen actions. */
export function actionLabel(from: string, to: string): string {
  if (to === 'resolved') return 'Approve'
  if (from === 'awaiting_approval') return 'Request changes'
  if (to === 'closed') return 'Close'
  if (from === 'resolved' || from === 'closed') return 'Reopen'
  if (to === 'awaiting_approval') return 'Submit for approval'
  return label(to)
}

export const shortDate = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}
export const daysOverdue = (due: string) => Math.max(1, Math.ceil((Date.now() - new Date(due).getTime()) / 86_400_000))
export const firstName = (n: string) => n.split(' ')[0]
