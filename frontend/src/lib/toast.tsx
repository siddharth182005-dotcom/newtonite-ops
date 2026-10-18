import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

type T = { id: number; kind: 'success' | 'error'; text: string }
const Ctx = createContext<(kind: T['kind'], text: string) => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<T[]>([])
  const dismiss = (id: number) => setList(l => l.filter(t => t.id !== id))
  const push = useCallback((kind: T['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setList(l => [...l.slice(-3), { id, kind, text }])
    setTimeout(() => dismiss(id), 6000)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {list.map(t => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="flex items-start gap-2 rounded-lg border border-line bg-surface p-3 text-sm shadow-lg">
            {t.kind === 'success' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-crit" />}
            <span className="flex-1">{t.text}</span>
            <button aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg"><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
