import { Link, useNavigate } from 'react-router-dom'
import type { Item } from '../lib/types'
import { ago, daysOverdue, firstName, fmtDateTime, isOverdue, shortDate } from '../lib/format'
import { Avatar, PriorityBadge, StatusBadge, cx } from './ui'

/** Why an item is in the attention queue — derived with the SAME rule as the backend's needs_attention view. */
export function Signals({ i }: { i: Item }) {
  const tags: { t: string; c: string }[] = []
  if (i.status === 'blocked') tags.push({ t: 'Blocked', c: 'bg-crit/15 text-crit' })
  if (isOverdue(i.due_date, i.status)) tags.push({ t: `Overdue ${daysOverdue(i.due_date!)}d`, c: 'bg-warn/15 text-warn' })
  if (!i.assignee && (i.priority === 'critical' || i.priority === 'high')) tags.push({ t: 'No owner', c: 'bg-accent/15 text-accent-hi' })
  return <>{tags.map(x => <span key={x.t} className={cx('rounded px-1.5 py-px text-[11px] font-medium', x.c)}>{x.t}</span>)}</>
}

const th = 'px-3 py-2 text-left text-xs font-medium text-muted'
export function WorkTable({ items, compact, signals }: { items: Item[]; compact?: boolean; signals?: boolean }) {
  const nav = useNavigate()
  return (
    <div className="@container overflow-x-auto">
      <table className="work-table w-full text-[13px]">
        <thead><tr className="border-b border-line">
          <th className={cx(th, 'hidden w-24 pl-4 @xl:table-cell')}>Key</th><th className={cx(th, 'pl-4 @xl:pl-3')}>Title</th>
          <th className={cx(th, 'hidden @xl:table-cell')}>Status</th><th className={cx(th, 'hidden @xl:table-cell')}>Priority</th>
          <th className={cx(th, 'hidden @3xl:table-cell')}>Assignee</th>{!compact && <th className={cx(th, 'hidden @4xl:table-cell')}>Team</th>}
          <th className={cx(th, 'hidden text-right @3xl:table-cell')}>Due</th><th className={cx(th, 'hidden pr-4 text-right @4xl:table-cell')}>Updated</th></tr></thead>
        <tbody>{items.map(i => {
          const over = isOverdue(i.due_date, i.status)
          return (
            <tr key={i.id} tabIndex={0} onClick={() => nav(`/work/${i.id}`)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nav(`/work/${i.id}`) } }} className="work-row group cursor-pointer border-b border-line transition-colors duration-150 last:border-0 hover:bg-raised/70 focus-within:bg-raised/70 focus-visible:outline-2 focus-visible:outline-accent-hi">
              <td className={cx('hidden whitespace-nowrap py-3.5 pl-4 pr-3 font-mono text-xs text-muted @xl:table-cell', i.priority === 'critical' && 'shadow-[inset_2px_0_0_var(--crit)]')}>{i.key}</td>
              <td className={cx('w-full max-w-0 py-3.5 pl-4 pr-3 @xl:pl-3', i.priority === 'critical' && '@max-xl:shadow-[inset_2px_0_0_var(--crit)]')}>
                <p className="font-mono text-[11px] text-muted @xl:hidden">{i.key}</p>
                <Link to={`/work/${i.id}`} title={i.title} onClick={e => e.stopPropagation()} className="block truncate font-medium text-fg group-hover:text-accent-hi">{i.title}</Link>
                {signals
                  ? <div className="mt-1 flex flex-wrap gap-1"><Signals i={i} /></div>
                  : i.description && <p className="mt-0.5 hidden truncate text-xs text-muted @xl:block">{i.description}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 @xl:hidden"><StatusBadge s={i.status} /><PriorityBadge p={i.priority} />
                  <span className="text-xs text-muted">{i.assignee ? firstName(i.assignee.name) : 'Unassigned'}{i.due_date && ` · due ${shortDate(i.due_date)}`}</span></div>
              </td>
              <td className="hidden px-3 py-3.5 @xl:table-cell"><StatusBadge s={i.status} /></td>
              <td className="hidden px-3 py-3.5 @xl:table-cell"><PriorityBadge p={i.priority} /></td>
              <td className="hidden max-w-[10rem] px-3 py-3.5 @3xl:table-cell">{i.assignee
                ? <span className="flex items-center gap-2"><Avatar name={i.assignee.name} /><span className="truncate">{firstName(i.assignee.name)}</span></span>
                : <span className="text-muted">Unassigned</span>}</td>
              {!compact && <td className="hidden whitespace-nowrap px-3 py-3.5 text-muted @4xl:table-cell">{i.team.name}</td>}
              <td className={cx('hidden whitespace-nowrap px-3 py-3.5 text-right tabular-nums @3xl:table-cell', over ? 'font-medium text-warn' : 'text-muted')} title={i.due_date ? fmtDateTime(i.due_date) : undefined}>{shortDate(i.due_date)}</td>
              <td className="hidden whitespace-nowrap py-3.5 pl-3 pr-4 text-right tabular-nums text-muted @4xl:table-cell" title={fmtDateTime(i.updated_at)}>{ago(i.updated_at)}</td>
            </tr>)
        })}</tbody>
      </table>
    </div>
  )
}
