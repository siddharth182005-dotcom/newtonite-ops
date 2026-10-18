import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from './lib/api'
import { ToastProvider } from './lib/toast'
import { AuthProvider } from './lib/auth'
import App from './App'
import '@fontsource-variable/inter'
import './index.css'

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: true,
  retry: (n, e) => !(e instanceof ApiError) && n < 2 } } })
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={client}><ToastProvider><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></ToastProvider></QueryClientProvider></StrictMode>)
