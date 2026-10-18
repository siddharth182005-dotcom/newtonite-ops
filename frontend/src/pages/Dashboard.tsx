import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, Ban, Briefcase, CircleAlert, Clock3, RefreshCw, ShieldCheck } from 'lucide-react'
import { api, errMsg } from '../lib/api'
import { ACTIVE, PRIORITIES, STATUSES, type Summary } from '../lib/types'
import { ago, firstName, label } from '../lib/format'
import { Avatar, Card, CardHeader, Empty, ErrorState, IconButton, PriorityBars, Skeleton, STATUS_STYLE, StatusBadge, cx } from '../components/ui'
import { AttentionQueue } from '../components/AttentionQueue'
import { Feed } from '../components/Feed'
import { useAuth } from '../lib/auth'

const activeQs = ACTIVE.map(s => `status=${s}`).join('&')
type Tone = 'crit' | 'warn' | 'accent' | undefined
const KPIS: { key: keyof Summary; label: string; def: string; to: string; icon: typeof Activity; tone?: Tone }[] = [
  { key: 'critical_high', label: 'Critical + high', def: 'Active items at the highest priorities', to: `/work?${activeQs}&priority=critical&priority=high`, icon: CircleAlert, tone: 'crit' },
  { key: 'my_assigned', label: 'Assigned to me', def: 'Active items you currently own', to: '/my', icon: Briefcase },
  { key: 'unassigned_urgent', label: 'Unassigned urgent', def: 'Critical or high priority, no owner yet', to: '/urgent', icon: CircleAlert, tone: 'crit' },
  { key: 'awaiting_my_approval', label: 'Awaiting my approval', def: 'Submitted in teams where you are a lead', to: '/approvals', icon: ShieldCheck, tone: 'accent' },
  { key: 'blocked', label: 'Blocked', def: 'Status is blocked, in your teams', to: '/work?status=blocked', icon: Ban, tone: 'warn' },
  { key: 'overdue', label: 'Overdue', def: 'Active and past the due date', to: '/work?overdue=true', icon: Clock3, tone: 'crit' },
]
const DOT: Record<string, string> = { crit: 'bg-crit', warn: 'bg-warn', accent: 'bg-accent-hi' }
const KPI_TONE: Record<string, string> = { crit: 'text-crit bg-crit/10', warn: 'text-warn bg-warn/10', accent: 'text-accent-hi bg-accent/10' }

function Kpis({ d }: { d?: Summary }) {
  return (
    <ul aria-label="Key metrics" className="metrics-strip grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface sm:grid-cols-3 2xl:grid-cols-6">
      {KPIS.map(k => {
        const v = d ? (d[k.key] as number) : null
        return (
          <li key={k.key} className="metric-cell"><Link to={k.to} className="group flex h-full min-h-[145px] flex-col justify-between gap-3 p-4 transition-colors duration-150 hover:bg-raised/60 focus-visible:relative focus-visible:z-10 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <span className={cx('grid size-9 place-items-center rounded-lg', k.tone ? KPI_TONE[k.tone] : 'bg-raised text-accent-hi')}><k.icon className="size-4" aria-hidden /></span>
              {v !== null && v > 0 && k.tone && <><span aria-hidden className={cx('mt-1.5 size-1.5 rounded-full', DOT[k.tone])} /><span className="sr-only">needs review</span></>}
            </div>
            {v === null ? <Skeleton className="h-8 w-16" /> : <p className="font-mono text-[28px] font-medium leading-none tracking-[-0.045em] tabular-nums">{v.toLocaleString()}</p>}
            <div><p className="text-[12px] font-semibold text-fg group-hover:text-accent-hi">{k.label}</p><p className="mt-1 text-[10px] leading-[1.45] text-muted">{k.def}</p></div>
          </Link></li>)
      })}
    </ul>
  )
}

const STATUS_COLOR: Record<string, string> = {
  open: 'var(--line-strong)',
  in_progress: 'var(--accent)',
  awaiting_approval: 'var(--warn)',
  blocked: 'var(--crit)',
  resolved: 'var(--ok)',
  closed: 'var(--line)',
}

function OperationalPulse({ d }: { d?: Summary }) {
  if (!d) return <Card className="pulse-panel grid min-h-64 gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.85fr)] lg:items-center"><Skeleton className="h-36" /><Skeleton className="mx-auto size-48 rounded-full" /></Card>
  const total = STATUSES.reduce((n, s) => n + (d.by_status[s] ?? 0), 0)
  const stops: string[] = []
  let offset = 0
  for (const status of STATUSES) {
    const count = d.by_status[status] ?? 0
    if (!count || !total) continue
    const end = offset + count / total * 100
    stops.push(`${STATUS_COLOR[status]} ${offset}% ${end}%`)
    offset = end
  }
  const chartStyle = { background: total ? `conic-gradient(${stops.join(', ')})` : 'var(--raised)' }
  return (
    <Card className="pulse-panel relative grid min-h-[300px] gap-7 overflow-hidden p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.86fr)] lg:items-center">
      <div className="pulse-copy relative z-10 flex h-full flex-col justify-between">
        <div>
          <p className="eyebrow"><Activity className="size-3.5" /> WORKSPACE SIGNAL / TEAM SCOPE</p>
          <h3 className="text-sm font-semibold text-fg">Operational pulse</h3>
          <p className="mt-1 text-xs leading-5 text-muted">Current work across the teams you can access.</p>
        </div>
        <div className="mt-6">
          <Link to={`/work?${activeQs}`} className="group inline-flex items-baseline gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-accent-hi">
            <span className="font-mono text-6xl font-medium leading-none tracking-[-0.07em] tabular-nums sm:text-7xl">{d.total_active.toLocaleString()}</span>
            <span className="text-xs font-medium text-muted transition-colors group-hover:text-accent-hi">active items <span aria-hidden>↗</span></span>
          </Link>
          <p className="mt-2 max-w-md text-xs leading-5 text-muted">Open, in progress, awaiting approval, or blocked. Counts are scoped to your workspace permissions.</p>
        </div>
        <div className="mt-6 grid max-w-xl grid-cols-3 divide-x divide-line border-t border-line pt-4">
          {(['open', 'in_progress', 'awaiting_approval'] as const).map(status => {
            const { Icon, text } = STATUS_STYLE[status]
            return <Link key={status} to={`/work?status=${status}`} className="group flex min-w-0 flex-col gap-1 px-3 first:pl-0 last:pr-0">
              <span className="flex items-center gap-1.5 text-[11px] text-muted group-hover:text-fg"><Icon className={cx('size-3.5 shrink-0', text)} />{label(status)}</span>
              <span className="font-mono text-lg font-medium tabular-nums">{(d.by_status[status] ?? 0).toLocaleString()}</span>
            </Link>
          })}
        </div>
      </div>
      <div className="grid grid-cols-[minmax(130px,172px)_minmax(0,1fr)] items-center gap-4 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
        <div className="pulse-donut mx-auto grid size-[min(38vw,172px)] min-h-[132px] min-w-[132px] place-items-center rounded-full p-[10px]" style={chartStyle} role="img"
          aria-label={`Distribution of ${total} work items by status: ${STATUSES.map(s => `${label(s)} ${d.by_status[s] ?? 0}`).join(', ')}`}>
          <div className="grid size-full place-content-center rounded-full bg-surface text-center shadow-[inset_0_0_24px_rgb(0_0_0_/_0.12)]">
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight">{total.toLocaleString()}</span>
            <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted">all work</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">By status</p>
          <ul className="space-y-1">
            {STATUSES.map(status => {
              const n = d.by_status[status] ?? 0, { Icon, text } = STATUS_STYLE[status]
              return <li key={status}><Link to={`/work?status=${status}`} className="group flex items-center gap-2 rounded-md py-1 text-xs hover:text-fg focus-visible:outline-2 focus-visible:outline-accent-hi">
                <Icon className={cx('size-3.5 shrink-0', text)} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-muted group-hover:text-fg">{label(status)}</span>
                <span className="font-mono tabular-nums">{n.toLocaleString()}</span>
              </Link></li>
            })}
          </ul>
        </div>
      </div>
    </Card>
  )
}

function PriorityLoad({ d }: { d?: Summary }) {
  if (!d) return <Skeleton className="m-4 h-28" />
  const max = Math.max(1, ...PRIORITIES.map(p => d.by_priority[p] ?? 0))
  return (
    <ul className="space-y-1 p-4">{PRIORITIES.map(p => {
      const n = d.by_priority[p] ?? 0
      return (
        <li key={p}><Link to={`/work?priority=${p}&${activeQs}`} className="group -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150 hover:bg-raised">
          <PriorityBars p={p} /><span className="w-16 group-hover:text-accent-hi">{label(p)}</span>
          <span className="h-1 flex-1 overflow-hidden rounded-full bg-raised"><span className={cx('block h-full rounded-full', p === 'critical' ? 'bg-crit' : p === 'high' ? 'bg-warn' : 'bg-line-strong')} style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="w-10 text-right font-medium tabular-nums">{n.toLocaleString()}</span></Link></li>)
    })}</ul>
  )
}

export default function Dashboard() {
  const { me } = useAuth()
  const s = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => api<Summary>('/dashboard/summary') })
  const d = s.data
  if (s.isError && !d) return (
    <div className="dashboard-page space-y-5">
      <div className="page-heading"><p className="eyebrow"><Activity className="size-3.5" /> NEWTONITE COMMAND / OVERVIEW</p><h2>Operations overview</h2><p>Your workspace, in focus. {me?.name ? `Welcome, ${firstName(me.name)}.` : ''}</p></div>
      <ErrorState message={errMsg(s.error)} onRetry={() => s.refetch()} />
    </div>
  )
  return (
    <div className="dashboard-page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="page-heading"><p className="eyebrow"><Activity className="size-3.5" /> NEWTONITE COMMAND / OVERVIEW</p><h2>Operations overview</h2><p>Your workspace, in focus. {me?.name ? `Welcome, ${firstName(me.name)}.` : ''}</p></div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="tabular-nums" aria-live="polite">{s.isFetching ? 'Refreshing…' : d ? `Updated ${new Date(s.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
          <IconButton label="Refresh dashboard" onClick={() => s.refetch()} disabled={s.isFetching}><RefreshCw className={cx('size-4', s.isFetching && 'animate-spin')} /></IconButton></div>
      </div>
      {s.isError ? <ErrorState message={errMsg(s.error)} onRetry={() => s.refetch()} /> : <Kpis d={d} />}
      {!s.isError && <OperationalPulse d={d} />}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          <AttentionQueue />
          <Card><CardHeader title="Recently updated" sub="Latest changes in your teams" />
            {s.isError ? <p className="p-4 text-sm text-muted">Unavailable.</p> : !d ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-9" />)}</div>
              : d.recently_updated.length === 0 ? <Empty title="No work items yet" hint="Create the first one with the button in the header." />
              : <ul>{d.recently_updated.map(i => (
                <li key={i.id} className="border-b border-line last:border-0"><Link to={`/work/${i.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-raised/70">
                  <span className="hidden w-[72px] shrink-0 font-mono text-xs text-muted sm:block">{i.key}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{i.title}</span>
                  <span className="hidden sm:block"><StatusBadge s={i.status} /></span>
                  <span className="hidden items-center gap-1.5 md:flex md:w-28">{i.assignee ? <><Avatar name={i.assignee.name} size={20} /><span className="truncate text-xs text-muted">{firstName(i.assignee.name)}</span></> : <span className="text-xs text-muted">Unassigned</span>}</span>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted">{ago(i.updated_at)}</span></Link></li>))}</ul>}</Card>
        </div>
        <div className="min-w-0 space-y-5">
          <Card><CardHeader title="Active load by priority" /><PriorityLoad d={d} /></Card>
          <Card><CardHeader title="Recent activity" action={<Link to="/activity" className="text-xs font-medium text-accent-hi hover:underline">View all</Link>} />
            <div className="p-4">{!d ? <Skeleton className="h-40" /> : d.recent_activity.length ? <Feed items={d.recent_activity.slice(0, 6)} linkItems /> : <Empty title="No activity yet" />}</div></Card>
        </div>
      </div>
    </div>
  )
}
