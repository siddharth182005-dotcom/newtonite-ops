import { Link } from 'react-router-dom'
import { Activity as ActivityIcon, Archive, Check, CirclePlus, GitBranch, MessageSquare, Pencil, UserRound, type LucideIcon } from 'lucide-react'
import type { Activity } from '../lib/types'
import { ago, describe, fmtDateTime } from '../lib/format'
import { Avatar } from './ui'

const EVENT_MARK: Record<string, { Icon: LucideIcon; tone: string }> = {
  created: { Icon: CirclePlus, tone: 'text-accent-hi' },
  claimed: { Icon: UserRound, tone: 'text-accent-hi' },
  assigned: { Icon: UserRound, tone: 'text-accent-hi' },
  reassigned: { Icon: UserRound, tone: 'text-accent-hi' },
  unassigned: { Icon: UserRound, tone: 'text-muted' },
  status_changed: { Icon: GitBranch, tone: 'text-accent-hi' },
  approved: { Icon: Check, tone: 'text-ok' },
  changes_requested: { Icon: GitBranch, tone: 'text-warn' },
  closed: { Icon: Archive, tone: 'text-muted' },
  reopened: { Icon: GitBranch, tone: 'text-accent-hi' },
  commented: { Icon: MessageSquare, tone: 'text-accent-hi' },
  updated: { Icon: Pencil, tone: 'text-muted' },
}

export function Feed({ items, linkItems }: { items: Activity[]; linkItems?: boolean }) {
  return (
    <ol className="activity-feed">
      {items.map((a, n) => (
        <li key={a.id} className="relative flex gap-3.5 pb-5 last:pb-0">
          {n < items.length - 1 && <span aria-hidden className="absolute bottom-0 left-3 top-7 w-px bg-line" />}
          <span className="activity-avatar relative z-[1] mt-0.5 grid size-[26px] shrink-0 place-items-center rounded-full border border-line bg-raised">
            <Avatar name={a.actor.name} size={24} />
            {(() => {
              const { Icon, tone } = EVENT_MARK[a.action] ?? { Icon: ActivityIcon, tone: 'text-muted' }
              return <span className={`activity-marker ${tone}`} aria-hidden="true"><Icon className="size-2.5" /></span>
            })()}
          </span>
          <div className="min-w-0 flex-1 text-[13px] leading-relaxed">
            <p><span className="font-medium">{a.actor.name}</span> <span className="text-muted">{describe(a)}</span>
              {linkItems && a.work_item_id && <Link className="ml-1.5 font-mono text-xs text-accent-hi hover:underline" to={`/work/${a.work_item_id}`}>{a.work_item_key ?? 'open'}</Link>}</p>
            <time dateTime={a.created_at} title={fmtDateTime(a.created_at)} className="text-xs tabular-nums text-muted">{ago(a.created_at)} · {fmtDateTime(a.created_at)}</time>
          </div>
        </li>))}
    </ol>
  )
}
