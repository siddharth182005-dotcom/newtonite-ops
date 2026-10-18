import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowRight, Briefcase, ChevronRight, Command, LayoutDashboard, ListChecks, LogOut, Menu, Moon, Orbit, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings, ShieldCheck, Siren, Sun, Users, X } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { label } from '../lib/format'
import type { Item, Summary } from '../lib/types'
import { Avatar, Button, IconButton, Kbd, Logo, Modal, cx, inputCls } from './ui'
import { CreateDialog } from './CreateDialog'
import CommandSceneLayer from './CommandSceneLayer'

type NavItem = { to: string; label: string; icon: typeof Activity; end?: boolean; count?: keyof Summary }
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: 'Workspace', items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/work', label: 'All Work', icon: ListChecks }, { to: '/constellation', label: 'Constellation', icon: Orbit }] },
  { title: 'My queues', items: [
    { to: '/my', label: 'Assigned to Me', icon: Briefcase, count: 'my_assigned' },
    { to: '/urgent', label: 'Unassigned Urgent', icon: Siren, count: 'unassigned_urgent' },
    { to: '/approvals', label: 'Awaiting My Approval', icon: ShieldCheck, count: 'awaiting_my_approval' }] },
  { title: 'Organisation', items: [{ to: '/teams', label: 'Teams', icon: Users }, { to: '/activity', label: 'Activity', icon: Activity }] },
]

export function useTheme() {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') !== 'light')  // non-sensitive UI preference
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('theme', dark ? 'dark' : 'light') }, [dark])
  return { dark, toggle: () => setDark(d => !d) }
}

const CRUMBS: Record<string, string[]> = { '/': ['Overview'], '/work': ['Work', 'All Work'], '/constellation': ['Workspace', 'Work constellation'], '/my': ['Work', 'Assigned to Me'], '/urgent': ['Work', 'Unassigned Urgent'],
  '/approvals': ['Work', 'Awaiting My Approval'], '/attention': ['Work', 'Needs Attention'], '/teams': ['Organisation', 'Teams'], '/activity': ['Organisation', 'Activity'], '/settings': ['Account', 'Settings'] }

export default function Layout() {
  const { me, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const [nav, setNav] = useState(false), [collapsed, setCollapsed] = useState(false), [create, setCreate] = useState(false), [menu, setMenu] = useState(false), [q, setQ] = useState(''), [mSearch, setMSearch] = useState(false)
  const [palette, setPalette] = useState(false), [paletteQuery, setPaletteQuery] = useState('')
  const loc = useLocation(), go = useNavigate(), searchRef = useRef<HTMLInputElement>(null), menuRef = useRef<HTMLDivElement>(null)
  const counts = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: () => api<Summary>('/dashboard/summary') })
  const itemId = loc.pathname.match(/^\/work\/(\d+)$/)?.[1]
  const item = useQuery<Item | undefined>({ queryKey: ['item', itemId ? Number(itemId) : 'none'], queryFn: async () => undefined, enabled: false })
  const crumbs = itemId ? ['Work', 'All Work', item.data?.key ?? `#${itemId}`] : (CRUMBS[loc.pathname] ?? ['Newtonite'])
  useEffect(() => { setNav(false); setMenu(false); setMSearch(false) }, [loc.pathname])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(t.tagName) && !t.isContentEditable) { e.preventDefault(); searchRef.current?.focus() }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setMenu(false); setPalette(true); setPaletteQuery('') }
      if (e.key === 'Escape') { setMenu(false); setPalette(false); setNav(false) }
    }
    const click = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false) }
    window.addEventListener('keydown', key); window.addEventListener('mousedown', click)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', click) }
  }, [])
  const search = (e: FormEvent) => { e.preventDefault(); go(`/work?q=${encodeURIComponent(q.trim())}`); searchRef.current?.blur() }
  const roles = me!.is_admin ? 'Administrator' : [...new Set(me!.memberships.map(m => label(m.role)))].join(' · ') || 'No team'
  const link = 'group relative flex h-10 items-center gap-3 rounded-lg px-2.5 text-[13px] transition-colors duration-150'
  const commands = [
    { label: 'Open overview', detail: 'Workspace', to: '/' },
    { label: 'Browse all work', detail: 'Workspace', to: '/work' },
    { label: 'Open work constellation', detail: 'Workspace', to: '/constellation' },
    { label: 'Assigned to me', detail: 'My queues', to: '/my' },
    { label: 'Unassigned urgent', detail: 'My queues', to: '/urgent' },
    { label: 'Awaiting my approval', detail: 'My queues', to: '/approvals' },
    { label: 'Needs attention', detail: 'My queues', to: '/attention' },
    { label: 'Teams', detail: 'Organisation', to: '/teams' },
    { label: 'Activity', detail: 'Organisation', to: '/activity' },
    { label: 'Settings', detail: 'Account', to: '/settings' },
  ].filter(c => `${c.label} ${c.detail}`.toLowerCase().includes(paletteQuery.toLowerCase()))
  return (
    <div className="command-app min-h-screen" style={{ gridTemplateColumns: collapsed ? '78px minmax(0, 1fr)' : '264px minmax(0, 1fr)' }}>
      <CommandSceneLayer />
      {nav && <button type="button" className="fixed inset-0 z-30 bg-black/65 lg:hidden" aria-label="Close navigation overlay" onClick={() => setNav(false)} />}
      <aside id="command-sidebar" aria-label="Primary" className={cx('command-sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-nav transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0', nav ? 'translate-x-0' : '-translate-x-full')}>
        <div className={cx('flex h-[76px] items-center justify-between border-b border-line/70 px-5', collapsed && 'lg:justify-center lg:px-2')}>
          <Link to="/" className="flex items-center gap-3" aria-label="Newtonite Command home"><Logo size={32} />
            <span className={cx('leading-none', collapsed && 'lg:hidden')}><span className="block text-base font-semibold tracking-tight">Newtonite</span><span className="mt-1 block text-[10px] font-semibold tracking-[0.21em] text-muted">COMMAND</span></span></Link>
          <button className="rounded p-1 text-muted lg:hidden" aria-label="Close navigation" onClick={() => setNav(false)}><X className="size-5" /></button>
        </div>
        <nav className={cx('flex-1 space-y-7 overflow-y-auto pb-4 pt-6', collapsed ? 'px-2' : 'px-3.5')} aria-label="Main">
          {GROUPS.map(g => (
            <div key={g.title}><p className={cx('mb-2.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.17em] text-muted/80', collapsed && 'lg:sr-only')}>{g.title}</p>
              <div className="space-y-1">{g.items.map(n => {
                const c = n.count && counts.data ? (counts.data[n.count] as number) : null
                return (
                  <NavLink key={n.to} to={n.to} end={n.end} aria-label={collapsed ? n.label : undefined} title={collapsed ? n.label : undefined} className={({ isActive }) => cx(link, collapsed && 'lg:justify-center lg:px-0', isActive ? 'nav-active font-medium text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg')}>
                    {({ isActive }) => <>
                      {isActive && <span aria-hidden className="absolute -left-3 top-2 h-5 w-[3px] rounded-r bg-accent" />}
                      <n.icon className={cx('size-4 shrink-0', isActive ? 'text-accent-hi' : 'text-muted group-hover:text-fg')} />
                      <span className={cx('flex-1 truncate', collapsed && 'lg:hidden')}>{n.label}</span>
                      {!collapsed && c !== null && <span className={cx('min-w-5 rounded px-1 text-center text-xs tabular-nums', c > 0 && n.count !== 'my_assigned' ? 'bg-accent/15 font-medium text-accent-hi' : 'text-muted')} aria-label={`${c} items`}>{c}</span>}
                    </>}
                  </NavLink>)})}</div></div>))}
        </nav>
        <div className={cx('border-t border-line p-3', collapsed && 'lg:px-2')}>
          <NavLink to="/settings" aria-label={collapsed ? 'Settings' : undefined} title={collapsed ? 'Settings' : undefined} className={({ isActive }) => cx(link, 'mb-3', collapsed && 'lg:justify-center lg:px-0', isActive ? 'nav-active font-medium text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg')}><Settings className="size-4 shrink-0" /><span className={cx(collapsed && 'lg:hidden')}>Settings</span></NavLink>
          <div title={collapsed ? `${me!.name} · ${roles}` : undefined} className={cx('flex items-center gap-2.5 rounded-lg border border-line/70 bg-surface/60 px-2.5 py-2', collapsed && 'lg:justify-center lg:px-0')}><Avatar name={me!.name} size={30} /><div className={cx('min-w-0 leading-tight', collapsed && 'lg:hidden')}><p className="truncate text-[13px] font-medium">{me!.name}</p><p className="truncate text-[11px] text-muted">{roles}</p></div></div>
        </div>
      </aside>
      <div className="command-content relative z-10 min-w-0 flex-1">
        <header className="command-topbar sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur md:px-6">
          {!mSearch && <IconButton label="Open navigation" aria-controls="command-sidebar" aria-expanded={nav} className="lg:hidden" onClick={() => setNav(true)}><Menu className="size-5" /></IconButton>}
          {!mSearch && <IconButton label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-controls="command-sidebar" aria-expanded={!collapsed} aria-pressed={collapsed} className="hidden lg:inline-flex" onClick={() => setCollapsed(c => !c)}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </IconButton>}
          <nav aria-label="Breadcrumb" className="hidden shrink-0 sm:block"><ol className="flex items-center gap-1.5 text-[13px]">
            {crumbs.map((c, i) => <li key={c + i} className="flex items-center gap-1.5">{i > 0 && <ChevronRight className="size-3.5 text-muted" aria-hidden />}
              {i === crumbs.length - 1 ? <h1 className="truncate text-[15px] font-semibold" aria-current="page">{c}</h1> : <span className="text-muted">{c}</span>}</li>)}</ol></nav>
          {!mSearch && <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold sm:hidden">{crumbs[crumbs.length - 1]}</h1>}
          <form onSubmit={search} role="search" className={cx('relative ml-auto w-full min-w-0 max-w-sm', !mSearch && 'max-sm:hidden')}>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted" />
            <input ref={searchRef} aria-label="Search work items" value={q} onChange={e => setQ(e.target.value)} placeholder="Search work items…"
              className="h-9 w-full rounded-md border border-line-strong/60 bg-surface pl-9 pr-9 text-[13px] transition-colors duration-150 placeholder:text-muted hover:border-line-strong focus:border-accent-hi" />
            <span className="absolute right-2.5 top-2 hidden sm:block" aria-hidden><Kbd>/</Kbd></span></form>
          {mSearch ? <IconButton label="Close search" className="sm:hidden" onClick={() => setMSearch(false)}><X className="size-5" /></IconButton>
            : <IconButton label="Search work items" className="sm:hidden" onClick={() => { setMSearch(true); setTimeout(() => searchRef.current?.focus(), 0) }}><Search className="size-[18px]" /></IconButton>}
          <Button variant="ghost" aria-label="Open command palette" onClick={() => setPalette(true)} className={cx('hidden gap-2 border border-line sm:inline-flex', mSearch && 'max-sm:hidden')}><Command className="size-4" /><span className="hidden lg:inline">Commands</span><Kbd>Ctrl K</Kbd></Button>
          <Button variant="primary" onClick={() => setCreate(true)} className={cx('px-2.5 sm:px-3', mSearch && 'max-sm:hidden')}><Plus className="size-4" /><span className="hidden sm:inline">Create work item</span><span className="sr-only sm:hidden">Create work item</span></Button>
          <IconButton label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle}>{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</IconButton>
          <div className="relative" ref={menuRef}>
            <button aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu(m => !m)} className="rounded-full transition-transform duration-150 active:scale-95"><Avatar name={me!.name} size={30} /></button>
            {menu && <div role="menu" className="absolute right-0 mt-2 w-60 rounded-lg border border-line bg-surface p-1 shadow-2xl">
              <div className="border-b border-line px-3 py-2"><p className="text-[13px] font-medium">{me!.name}</p><p className="text-xs text-muted">{me!.email}</p></div>
              <button role="menuitem" onClick={() => go('/settings')} className="mt-1 flex w-full items-center gap-2 rounded px-3 py-2 text-[13px] hover:bg-raised"><Settings className="size-4 text-muted" />Profile & settings</button>
              <button role="menuitem" onClick={async () => { await logout(); go('/login') }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-[13px] hover:bg-raised"><LogOut className="size-4 text-muted" />Sign out</button></div>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] p-4 md:p-6 xl:p-7"><Outlet /></main>
      </div>
      <CreateDialog open={create} onClose={() => setCreate(false)} />
      <Modal open={palette} onClose={() => setPalette(false)} title="Command palette">
        <div className="space-y-3">
          <input aria-label="Filter commands" autoFocus value={paletteQuery} onChange={e => setPaletteQuery(e.target.value)} placeholder="Search destinations and actions…" className={inputCls} />
          <div className="max-h-[min(55vh,420px)] space-y-1 overflow-y-auto" role="listbox" aria-label="Available commands">
            {commands.map(c => <button key={c.to} role="option" aria-selected="false" onClick={() => { setPalette(false); go(c.to) }}
              className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-line hover:bg-raised focus-visible:bg-raised">
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{c.label}</span><span className="text-xs text-muted">{c.detail}</span></span><ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-hi" />
            </button>)}
            <button role="option" aria-selected="false" onClick={() => { setPalette(false); setCreate(true) }}
              className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-line hover:bg-raised focus-visible:bg-raised">
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Create work item</span><span className="text-xs text-muted">New work</span></span><Plus className="size-4 text-muted group-hover:text-accent-hi" />
            </button>
            {commands.length === 0 && <p className="p-4 text-center text-sm text-muted">No matching commands.</p>}
          </div>
          <p className="border-t border-line pt-3 text-xs text-muted"><Kbd>Esc</Kbd> <span className="ml-1">to close</span></p>
        </div>
      </Modal>
    </div>
  )
}
