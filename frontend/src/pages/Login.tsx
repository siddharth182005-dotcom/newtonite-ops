import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Fingerprint, LockKeyhole, Radio } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { ApiError, errMsg, NetworkError } from '../lib/api'
import { Button, Field, Logo, cx, inputCls } from '../components/ui'
import CommandSceneLayer from '../components/CommandSceneLayer'

const schema = z.object({ email: z.string().trim().min(1, 'Email is required').email('Enter a valid email'), password: z.string().min(1, 'Password is required') })

export default function Login() {
  const { me, login } = useAuth()
  const nav = useNavigate(), loc = useLocation()
  const [err, setErr] = useState(''), [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })
  const to = (loc.state as any)?.from ?? '/'
  if (me) return <Navigate to={to} replace />
  return (
    <main className="login-scene min-h-screen overflow-x-hidden bg-bg px-5 py-5 text-fg sm:px-8 sm:py-6 xl:px-12 xl:py-7">
      <CommandSceneLayer />
      <div className="login-shell relative z-[2] mx-auto flex min-h-[calc(100svh-2.5rem)] max-w-[1680px] flex-col sm:min-h-[calc(100svh-3rem)] xl:min-h-[calc(100svh-3.5rem)]">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Newtonite Command">
            <Logo size={42} />
            <span className="leading-none"><span className="block text-[18px] font-semibold tracking-tight">Newtonite</span><span className="mt-1.5 block text-[10px] font-semibold tracking-[0.22em] text-muted">COMMAND</span></span>
          </Link>
          <div className="hidden items-center gap-2.5 text-[11px] font-medium tracking-[0.16em] text-muted sm:flex"><LockKeyhole className="size-4 text-accent-hi" /> PRIVATE WORKSPACE ACCESS</div>
        </header>

        <div className="grid flex-1 items-center gap-10 py-10 xl:grid-cols-[minmax(0,1fr)_minmax(480px,560px)] xl:gap-16 xl:py-12 2xl:gap-24">
          <section className="login-story relative hidden min-h-[620px] flex-col justify-center xl:flex" aria-labelledby="login-story-title">
            <div className="relative z-10 max-w-[720px]">
              <p className="mb-8 flex items-center gap-2.5 text-xs font-semibold tracking-[0.22em] text-accent-hi"><span className="size-2 rounded-full bg-accent-hi shadow-[0_0_14px_var(--accent)]" /> OPERATIONS, IN FOCUS</p>
              <h1 id="login-story-title" className="max-w-[700px] text-[clamp(3.5rem,5.1vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.06em]">Bring the important work <span className="login-headline-accent">into focus.</span></h1>
              <p className="mt-8 max-w-lg text-lg leading-8 text-muted">A calmer command surface for the decisions, ownership, and follow-through that keep operations moving.</p>
              <p className="mt-10 text-base font-medium tracking-wide text-fg/85">Operational intelligence. <span className="text-muted">Without the noise.</span></p>
            </div>
            <div className="login-orbit" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" />
              <div className="orbit-core"><Logo size={58} /></div>
              <span className="orbit-node orbit-node-a" /><span className="orbit-node orbit-node-b" /><span className="orbit-node orbit-node-c" />
            </div>
            <div className="absolute bottom-5 left-0 z-10 flex items-center gap-2.5 font-mono text-[11px] tracking-[0.14em] text-muted/80"><Radio className="size-4 text-cyan-300" /> WORKFLOW SIGNAL / 01</div>
          </section>

          <section className="login-panel-wrap mx-auto w-full max-w-[560px]" aria-labelledby="login-title">
            <div className="login-panel">
              <div className="mb-9">
                <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-accent/25 bg-accent/10 text-accent-hi"><Fingerprint className="size-6" /></div>
                <p className="mb-2.5 text-[11px] font-semibold tracking-[0.22em] text-accent-hi">WORKSPACE SIGN IN</p>
                <h2 id="login-title" className="text-3xl font-semibold tracking-[-0.04em]">Welcome back.</h2>
                <p className="mt-3 text-base leading-7 text-muted">Sign in to see what needs a decision right now.</p>
              </div>
              <form onSubmit={handleSubmit(async v => {
                setErr('')
                try { await login(v.email, v.password); nav(to, { replace: true }) }
                catch (e) {
                  if (e instanceof ApiError && e.code === 'invalid_credentials') setErr('Invalid email or password')
                  else if (e instanceof ApiError && e.status >= 500) setErr('Sign-in is temporarily unavailable. Please try again.')
                  else if (e instanceof NetworkError) setErr(errMsg(e))
                  else setErr(errMsg(e))
                }
              })} className="space-y-6" noValidate>
                <Field label="Email address" htmlFor="email" error={errors.email?.message} required>
                  <input id="email" type="email" autoComplete="username" autoFocus aria-required aria-invalid={!!errors.email} className={inputCls} {...register('email')} />
                </Field>
                <Field label="Password" htmlFor="password" error={errors.password?.message} required>
                  <div className="relative">
                    <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" aria-required aria-invalid={!!errors.password} className={cx(inputCls, 'pr-11')} {...register('password')} />
                    <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(v => !v)}
                      className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-md text-muted transition-colors hover:bg-white/5 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent-hi">
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </Field>
                {err && <p role="alert" aria-live="assertive" className="rounded-lg border border-crit/30 bg-crit/10 p-3 text-[13px] leading-5 text-crit">{err}</p>}
                <Button type="submit" aria-label="Sign in" variant="primary" className="login-submit h-14 w-full justify-between px-5 text-[15px]" loading={isSubmitting}>
                  <span>{isSubmitting ? 'Signing in…' : 'Continue to workspace'}</span>{!isSubmitting && <ArrowRight className="size-5" />}
                </Button>
                <p className="text-center text-xs leading-5 text-muted">Access is protected by your Newtonite workspace session.</p>
              </form>
              <div className="login-divider mt-8 flex items-center justify-between border-t border-line pt-5 font-mono text-[10px] tracking-[0.13em] text-muted/80"><span>NEWTONITE COMMAND</span><span>SECURE ACCESS</span></div>
            </div>
          </section>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-4 text-[10px] tracking-wide text-muted/75"><span>Clarity for the work that moves everything.</span><span>© Newtonite Ops</span></footer>
      </div>
    </main>
  )
}
