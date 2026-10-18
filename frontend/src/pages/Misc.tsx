import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, ChevronRight, Users } from 'lucide-react'
import { api, errMsg } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Summary, TeamInfo } from '../lib/types'
import { label } from '../lib/format'
import { Card, CardHeader, Empty, ErrorState, Skeleton } from '../components/ui'
import { Feed } from '../components/Feed'
import { useTheme } from '../components/Layout'

const Head = ({ t, s, section }: { t: string; s: string; section: string }) => <div className="page-heading mb-5"><p className="eyebrow">{section.startsWith('ORGANISATION') ? <Users className="size-3.5" /> : <Activity className="size-3.5" />} {section}</p><h2>{t}</h2><p>{s}</p></div>

export function Teams() {
  const q = useQuery({ queryKey: ['teams'], queryFn: () => api<TeamInfo[]>('/teams') })
  return (
    <div><Head t="Teams" section="ORGANISATION / TEAMS" s="Teams you belong to and your role in each. Open one to see its work." />
      {q.isLoading ? <Skeleton className="h-40" /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : !q.data!.length ? <Card><Empty title="You aren’t a member of any team" hint="Ask an administrator to add you to a team." /></Card>
        : <Card><ul>{q.data!.map(t => (
          <li key={t.id} className="border-b border-line last:border-0"><Link to={`/work?team_id=${t.id}`} className="group flex items-center gap-4 px-4 py-3.5 transition-colors duration-150 hover:bg-raised/70">
            <div className="min-w-0 flex-1"><p className="text-sm font-medium group-hover:text-accent-hi">{t.name}</p><p className="truncate text-[13px] text-muted">{t.description || 'No description'}</p></div>
            <span className="hidden text-xs tabular-nums text-muted sm:block">{t.member_count} members</span>
            <span className="rounded-md bg-raised px-2 py-0.5 text-xs font-medium">{t.my_role ? label(t.my_role) : '—'}</span><ChevronRight className="size-4 text-muted" aria-hidden /></Link></li>))}</ul></Card>}
    </div>
  )
}

export function ActivityPage() {
  const q = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => api<Summary>('/dashboard/summary') })
  return (
    <div><Head t="Activity" section="ORGANISATION / ACTIVITY" s="The 12 most recent changes in your teams. Open an item for its complete, paginated history." />
      <Card><div className="p-4">{q.isLoading ? <Skeleton className="h-48" /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />
        : q.data!.recent_activity.length ? <Feed items={q.data!.recent_activity} linkItems /> : <Empty title="No activity yet" />}</div></Card></div>
  )
}

export function SettingsPage() {
  const { me } = useAuth(), { dark, toggle } = useTheme()
  return (
    <div className="max-w-xl space-y-4"><Head t="Settings" section="ACCOUNT / PREFERENCES" s="Your profile and appearance." />
      <Card><CardHeader title="Profile" /><dl className="grid grid-cols-[7rem_1fr] gap-y-2.5 p-4 text-[13px]">
        <dt className="text-muted">Name</dt><dd>{me!.name}</dd><dt className="text-muted">Email</dt><dd className="break-all">{me!.email}</dd><dt className="text-muted">Administrator</dt><dd>{me!.is_admin ? 'Yes' : 'No'}</dd>
        <dt className="text-muted">Teams</dt><dd>{me!.memberships.length ? me!.memberships.map(m => `${m.team_name} (${label(m.role)})`).join(', ') : '—'}</dd></dl>
        <p className="border-t border-line px-4 py-3 text-xs text-muted">Profile editing and password changes aren’t supported by the API yet.</p></Card>
      <Card><CardHeader title="Appearance" /><div className="p-4"><label className="flex items-center gap-2.5 text-[13px]"><input type="checkbox" className="size-4 accent-[var(--accent)]" checked={dark} onChange={toggle} />Dark theme <span className="text-muted">(remembered on this device)</span></label></div></Card></div>
  )
}
