import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Archive, Ban, CheckCircle2, CircleDashed, CircleDot, Hourglass, Inbox, Loader2, X, type LucideIcon } from 'lucide-react'
import { label } from '../lib/format'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

/* ------------------------------------------------------------------ brand */
/** Original Newtonite mark: an "N" whose diagonal is the one heavy stroke (the pressure line); verticals are held back. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Newtonite">
      <rect width="24" height="24" rx="6" fill="var(--accent)" />
      <path d="M7.5 17V7M16.5 17V7" stroke="var(--accent-fg)" strokeOpacity=".55" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M7.5 7L16.5 17" stroke="var(--accent-fg)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/* ------------------------------------------------------------------ controls */
const V = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hi',
  secondary: 'border border-line-strong/60 bg-surface text-fg hover:bg-raised hover:border-line-strong',
  ghost: 'text-muted hover:bg-raised hover:text-fg',
  danger: 'bg-crit text-accent-fg hover:opacity-90',
}
export function Button({ variant = 'secondary', loading, className, children, disabled, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof V; loading?: boolean }) {
  return (
    <button {...p} disabled={disabled || loading} aria-busy={loading || undefined}
      className={cx('inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-[background-color,border-color,color,transform,box-shadow] duration-150 active:translate-y-px active:scale-[.985] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100', V[variant], variant === 'primary' && 'shadow-[0_5px_18px_-12px_var(--accent)]', className)}>
      {loading && <Loader2 className="size-3.5 animate-spin" />}{children}
    </button>
  )
}
export function IconButton({ label: l, children, className, noTip, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; noTip?: boolean }) {
  const btn = <button {...p} aria-label={l} className={cx('inline-flex size-8 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-raised hover:text-fg active:scale-95', className)}>{children}</button>
  return noTip ? btn : <Tip text={l}>{btn}</Tip>
}
/** CSS-only tooltip: shows on hover and keyboard focus; the wrapped control keeps its own accessible name. */
export function Tip({ text, children, side = 'bottom' }: { text: string; children: ReactNode; side?: 'bottom' | 'top' }) {
  return (
    <span className="group/tip relative inline-flex">{children}
      <span role="tooltip" className={cx('pointer-events-none absolute left-1/2 z-50 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-line bg-raised px-2 py-1 text-xs text-fg shadow-lg animate-[tip_150ms_250ms_both] group-hover/tip:block group-focus-within/tip:block', side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5')}>{text}</span>
    </span>
  )
}
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="rounded border border-line bg-raised px-1.5 font-mono text-[11px] text-muted">{children}</kbd>

/* ------------------------------------------------------------------ surfaces */
export const Card = ({ className, children }: { className?: string; children: ReactNode }) =>
  <section className={cx('ui-card rounded-xl border border-line bg-surface', className)}>{children}</section>
export const CardHeader = ({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) => (
  <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-5 py-3">
    <div className="min-w-0"><h2 className="text-sm font-semibold tracking-[-0.01em]">{title}</h2>{sub && <p className="mt-0.5 text-xs leading-5 text-muted">{sub}</p>}</div>{action}
  </div>
)
export const Skeleton = ({ className }: { className?: string }) => <div aria-hidden className={cx('animate-pulse rounded-md bg-raised', className)} />

/* ------------------------------------------------------------------ status & priority (colour is never the only signal) */
export const STATUS_STYLE: Record<string, { text: string; bg: string; bar: string; Icon: LucideIcon }> = {
  open: { text: 'text-muted', bg: 'bg-raised', bar: 'bg-line-strong', Icon: CircleDashed },
  in_progress: { text: 'text-accent-hi', bg: 'bg-accent/15', bar: 'bg-accent', Icon: CircleDot },
  awaiting_approval: { text: 'text-warn', bg: 'bg-warn/15', bar: 'bg-warn', Icon: Hourglass },
  blocked: { text: 'text-crit', bg: 'bg-crit/15', bar: 'bg-crit', Icon: Ban },
  resolved: { text: 'text-ok', bg: 'bg-ok/15', bar: 'bg-ok', Icon: CheckCircle2 },
  closed: { text: 'text-muted', bg: 'bg-transparent ring-1 ring-inset ring-line', bar: 'bg-line', Icon: Archive },
}
const pill = 'inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-xs font-medium'
export function StatusBadge({ s }: { s: string }) {
  const { text, bg, Icon } = STATUS_STYLE[s] ?? STATUS_STYLE.open
  return <span className={cx(pill, text, bg)}><Icon className="size-3.5" aria-hidden />{label(s)}</span>
}
const LEVEL: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 }
const PRIO: Record<string, { text: string; fill: string }> = {
  critical: { text: 'text-crit', fill: 'fill-crit' }, high: { text: 'text-warn', fill: 'fill-warn' },
  medium: { text: 'text-muted', fill: 'fill-muted' }, low: { text: 'text-muted', fill: 'fill-muted' },
}
export function PriorityBars({ p }: { p: string }) {
  const n = LEVEL[p] ?? 2
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden className="shrink-0">
      {[0, 1, 2, 3].map(k => <rect key={k} x={k * 4} y={12 - (k + 1) * 3} width="3" height={(k + 1) * 3} rx=".6" className={k < n ? PRIO[p]?.fill : 'fill-line-strong/50'} />)}
    </svg>
  )
}
export const PriorityBadge = ({ p }: { p: string }) =>
  <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium', PRIO[p]?.text)}><PriorityBars p={p} />{label(p)}</span>

/* ------------------------------------------------------------------ dialogs & states */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} onMouseDown={e => { if (e.target === ref.current) onClose() }} aria-labelledby="modal-title"
      className={cx('m-auto max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-lg border border-line bg-surface p-0 shadow-2xl', wide ? 'max-w-xl' : 'max-w-md')}>
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id="modal-title" className="text-base font-semibold">{title}</h2>
            <IconButton label="Close dialog" noTip onClick={onClose} className="-mr-2 -mt-1"><X className="size-4" /></IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}
export function Confirm({ open, title, body, confirmLabel, danger, busy, onConfirm, onCancel }:
  { open: boolean; title: string; body: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="mb-5 text-sm text-muted">{body}</p>
      <div className="flex justify-end gap-2"><Button onClick={onCancel}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button></div>
    </Modal>
  )
}
export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface p-10 text-center">
    <span className="grid size-10 place-items-center rounded-full bg-crit/15"><AlertTriangle className="size-5 text-crit" /></span>
    <div><p className="text-sm font-medium">Something went wrong</p><p className="mt-1 max-w-md text-sm text-muted">{message}</p></div>
    {onRetry && <Button onClick={onRetry}>Try again</Button>}
  </div>
)
export const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
    <span className="grid size-10 place-items-center rounded-full bg-raised"><Inbox className="size-5 text-muted" /></span>
    <p className="text-sm font-medium">{title}</p>{hint && <p className="max-w-sm text-[13px] text-muted">{hint}</p>}{action}
  </div>
)

/* ------------------------------------------------------------------ forms */
export const inputCls = 'min-h-9 w-full rounded-md border border-line-strong bg-bg px-3 py-1.5 text-sm text-fg placeholder:text-muted transition-colors duration-150 hover:border-accent-hi/70 focus:border-accent-hi focus-visible:outline-2'
export function Field({ label: l, error, hint, required, optionalTag = true, children, htmlFor }: { label: string; error?: string; hint?: string; required?: boolean; optionalTag?: boolean; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium">{l}{required ? <><span aria-hidden className="ml-0.5 text-accent-hi">*</span><span className="sr-only"> (required)</span></> : optionalTag && <span className="ml-1 text-xs font-normal text-muted">optional</span>}</label>
      {children}
      {error ? <p role="alert" className="text-xs text-crit">{error}</p> : hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
export const Avatar = ({ name, size = 22 }: { name: string; size?: number }) => (
  <span aria-hidden style={{ width: size, height: size, fontSize: size * 0.42 }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent/20 font-semibold text-accent-hi ring-1 ring-inset ring-accent/25">
    {name.split(' ').map(x => x[0]).join('').slice(0, 2)}
  </span>
)
