import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './lib/auth'
import { Skeleton, ErrorState } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import WorkList from './pages/WorkList'
import Detail from './pages/Detail'
import { ActivityPage, SettingsPage, Teams } from './pages/Misc'
import Constellation from './pages/Constellation'
import { errMsg } from './lib/api'

function RequireAuth({ children }: { children: ReactNode }) {
  const { me, loading, error, retry } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="p-8"><Skeleton className="h-8 w-48" /></div>
  if (error) return <div className="p-8"><ErrorState message={errMsg(error)} onRetry={retry} /></div>
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} /><Route path="work" element={<WorkList />} /><Route path="constellation" element={<Constellation />} /><Route path="my" element={<WorkList view="assigned_to_me" />} /><Route path="urgent" element={<WorkList view="unassigned_urgent" />} /><Route path="approvals" element={<WorkList view="awaiting_my_approval" />} />
        <Route path="attention" element={<WorkList view="needs_attention" />} /><Route path="work/:id" element={<Detail />} /><Route path="teams" element={<Teams />} />
        <Route path="activity" element={<ActivityPage />} /><Route path="settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
