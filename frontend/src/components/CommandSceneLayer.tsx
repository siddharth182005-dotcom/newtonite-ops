import { lazy, Suspense } from 'react'

const CommandScene = lazy(() => import('./CommandScene'))

function SceneFallback() {
  return (
    <div className="command-scene" aria-hidden="true">
      <div className="command-scene-fallback">
        <div className="fallback-orbit fallback-orbit-a" />
        <div className="fallback-orbit fallback-orbit-b" />
        <div className="fallback-orb" />
        <div className="fallback-platform" />
      </div>
      <div className="command-scene-vignette" />
    </div>
  )
}

export default function CommandSceneLayer() {
  return <Suspense fallback={<SceneFallback />}><CommandScene /></Suspense>
}
