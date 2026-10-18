import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { Item, Status } from '../lib/types'
import { Button } from './ui'

type Props = {
  items: Item[]
  selectedId: number | null
  onSelect: (id: number) => void
  onFallback: () => void
}
type InstanceRef = { mesh: THREE.InstancedMesh; index: number; color: THREE.Color; position: THREE.Vector3; scale: number }
type PointerDrag = { id: number; x: number; y: number; moved: boolean; pan: boolean }

const STATUSES: Status[] = ['open', 'in_progress', 'awaiting_approval', 'blocked', 'resolved', 'closed']
const STATUS_COLOR: Record<Status, number> = {
  open: 0x8293b5,
  in_progress: 0x65a8ff,
  awaiting_approval: 0xf4c46d,
  blocked: 0xff718f,
  resolved: 0x52ddb0,
  closed: 0x64728c,
}
const STATUS_SHAPE: Record<Status, (size: number) => THREE.BufferGeometry> = {
  open: size => new THREE.SphereGeometry(size, 16, 12),
  in_progress: size => new THREE.IcosahedronGeometry(size, 1),
  awaiting_approval: size => new THREE.TorusGeometry(size * 0.72, size * 0.26, 8, 18),
  blocked: size => new THREE.OctahedronGeometry(size * 1.12, 0),
  resolved: size => new THREE.DodecahedronGeometry(size, 0),
  closed: size => new THREE.BoxGeometry(size * 1.45, size * 1.45, size * 1.45),
}
const PRIORITY_SIZE: Record<string, number> = { critical: 1.45, high: 1.24, medium: 1, low: 0.82 }

export default function ConstellationScene({ items, selectedId, onSelect, onFallback }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const selectedRef = useRef(selectedId)
  const onSelectRef = useRef(onSelect)
  const drawRef = useRef<() => void>(() => {})
  const zoomRef = useRef<(amount: number) => void>(() => {})
  const resetRef = useRef<() => void>(() => {})
  const [supported, setSupported] = useState(true)
  useEffect(() => { selectedRef.current = selectedId; drawRef.current() }, [selectedId])
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])

  useEffect(() => {
    const container = host.current
    const canvas = container?.querySelector('canvas')
    if (!container || !canvas) return
    const webgl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
    if (!webgl) { setSupported(false); return }

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        context: webgl as WebGLRenderingContext,
        alpha: true,
        antialias: window.innerWidth > 700 && (navigator.hardwareConcurrency || 4) > 4,
        powerPreference: window.innerWidth <= 700 ? 'low-power' : 'default',
      })
    } catch {
      setSupported(false)
      return
    }
    setSupported(true)
    const lowPower = window.innerWidth <= 700 || (navigator.hardwareConcurrency || 4) <= 4
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.5))
    renderer.setClearColor(0x050815, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80)
    camera.position.set(0, 0, 10.5)
    const root = new THREE.Group()
    scene.add(root)
    scene.add(new THREE.HemisphereLight(0xaac5ff, 0x151020, 1.4))
    const keyLight = new THREE.PointLight(0x8977ff, 38, 22, 2)
    keyLight.position.set(-2, 4, 5)
    scene.add(keyLight)
    const blueLight = new THREE.PointLight(0x36baff, 22, 18, 2)
    blueLight.position.set(4, -3, -1)
    scene.add(blueLight)

    const instances = new Map<number, InstanceRef>()
    const byStatus = new Map<Status, Item[]>()
    for (const item of items) byStatus.set(item.status, [...(byStatus.get(item.status) ?? []), item])

    const goldenAngle = Math.PI * (3 - Math.sqrt(5))
    for (const status of STATUSES) {
      const group = byStatus.get(status) ?? []
      if (!group.length) continue
      const angle = STATUSES.indexOf(status) / STATUSES.length * Math.PI * 2 - Math.PI / 2
      const center = new THREE.Vector3(Math.cos(angle) * 2.25, Math.sin(angle) * 1.38, Math.sin(angle * 2) * 0.62)
      const geometry = STATUS_SHAPE[status](0.105)
      const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: STATUS_COLOR[status],
        emissiveIntensity: 0.28,
        metalness: 0.46,
        roughness: 0.25,
        flatShading: status !== 'open',
      })
      const mesh = new THREE.InstancedMesh(geometry, material, group.length)
      mesh.name = `work-items-${status}`
      mesh.userData.itemIds = group.map(item => item.id)
      mesh.frustumCulled = false
      const transform = new THREE.Object3D()
      const baseColor = new THREE.Color(STATUS_COLOR[status])
      const selectedColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.72)
      group.forEach((item, index) => {
        const seed = item.id * 12.9898
        const radius = 0.28 + Math.sqrt(index + 1) * (group.length > 80 ? 0.12 : 0.19)
        const spread = index * goldenAngle + Math.sin(seed) * 0.15
        const point = new THREE.Vector3(
          center.x + Math.cos(spread) * radius,
          center.y + Math.sin(spread) * radius * 0.72,
          center.z + Math.sin(seed * 0.37) * (lowPower ? 0.62 : 1.05),
        )
        const size = 0.105 * (PRIORITY_SIZE[item.priority] ?? 1)
        transform.position.copy(point)
        transform.rotation.set(Math.sin(seed) * 0.7, Math.cos(seed) * 0.8, Math.sin(seed * 0.3) * 0.5)
        transform.scale.setScalar(size / 0.105)
        transform.updateMatrix()
        mesh.setMatrixAt(index, transform.matrix)
        const tint = baseColor.clone().lerp(new THREE.Color(0xffffff), item.priority === 'critical' ? 0.44 : item.priority === 'high' ? 0.2 : 0)
        mesh.setColorAt(index, tint)
        instances.set(item.id, { mesh, index, color: tint, position: point, scale: size / 0.105 })
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      root.add(mesh)
    }

    const orbitGroup = new THREE.Group()
    root.add(orbitGroup)
    for (let index = 0; index < 3; index += 1) {
      const orbit = new THREE.Mesh(
        new THREE.TorusGeometry(3.65 + index * 0.3, index === 1 ? 0.009 : 0.006, 5, 120),
        new THREE.MeshBasicMaterial({
          color: index === 1 ? 0x3caeff : 0x8977ff,
          transparent: true,
          opacity: index === 1 ? 0.25 : 0.17,
          depthWrite: false,
        }),
      )
      orbit.rotation.set(0.8 + index * 0.49, index * 0.6, index * 0.73)
      orbitGroup.add(orbit)
    }

    const starPositions = new Float32Array((lowPower ? 100 : 180) * 3)
    for (let i = 0; i < starPositions.length; i += 3) {
      const angle = Math.random() * Math.PI * 2
      const radius = 4.1 + Math.random() * 3.1
      starPositions[i] = Math.cos(angle) * radius
      starPositions[i + 1] = (Math.random() - 0.5) * 6.8
      starPositions[i + 2] = (Math.random() - 0.5) * 5.5
    }
    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      color: 0xa9bcff,
      size: lowPower ? 0.018 : 0.023,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }))
    scene.add(stars)

    const selection = new THREE.Mesh(
      new THREE.TorusGeometry(0.19, 0.012, 6, 32),
      new THREE.MeshBasicMaterial({ color: 0x71d9ff, transparent: true, opacity: 0.92, depthWrite: false }),
    )
    selection.visible = false
    root.add(selection)

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let disposed = false
    let active = !document.hidden
    let zoom = camera.position.z
    let drag: PointerDrag | null = null
    let lastRendered = 0

    const updateSelection = () => {
      const current = selectedRef.current === null ? undefined : instances.get(selectedRef.current)
      selection.visible = !!current
      if (current) {
        selection.position.copy(current.position)
        selection.scale.setScalar(current.scale * 1.8)
      }
    }
    const render = (timestamp = 0) => {
      if (disposed) return
      updateSelection()
      renderer.render(scene, camera)
      lastRendered = timestamp
    }
    const start = () => {
      if (disposed || !active || reducedMotion.matches || frame) return
      const animate = (timestamp: number) => {
        frame = 0
        if (disposed || !active || reducedMotion.matches) return
        if (timestamp - lastRendered >= 32) {
          root.rotation.y += 0.00055 * (lowPower ? 0.8 : 1)
          orbitGroup.rotation.y -= 0.00023
          orbitGroup.rotation.z = Math.sin(timestamp * 0.00013) * 0.025
          render(timestamp)
        }
        frame = window.requestAnimationFrame(animate)
      }
      frame = window.requestAnimationFrame(animate)
    }
    const stop = () => {
      window.cancelAnimationFrame(frame)
      frame = 0
    }
    const resize = () => {
      const width = container.clientWidth || 800
      const height = container.clientHeight || 480
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.position.z = zoom
      camera.updateProjectionMatrix()
      render()
    }
    const pointFromEvent = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      return raycaster.intersectObjects(root.children.filter(child => child instanceof THREE.InstancedMesh), false)[0]
    }
    const selectAt = (event: PointerEvent) => {
      const hit = pointFromEvent(event)
      if (!hit || hit.instanceId === undefined) return
      const mesh = hit.object as THREE.InstancedMesh
      const ids = mesh.userData.itemIds as number[] | undefined
      const itemId = ids?.[hit.instanceId]
      if (itemId !== undefined) onSelectRef.current(itemId)
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, pan: event.button === 2 }
      canvas.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (drag?.id === event.pointerId) {
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        if (drag.moved) {
          if (drag.pan) {
            root.position.x += dx * 0.004
            root.position.y -= dy * 0.004
          } else {
            root.rotation.y += dx * 0.004
            root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + dy * 0.003, -0.8, 0.8)
          }
          drag.x = event.clientX
          drag.y = event.clientY
          render()
          return
        }
      }
      const hit = pointFromEvent(event)
      canvas.style.cursor = hit ? 'pointer' : drag ? 'grabbing' : 'grab'
    }
    const onPointerUp = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return
      const wasDrag = drag.moved
      const pan = drag.pan
      drag = null
      if (!wasDrag && !pan) selectAt(event)
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      zoom = THREE.MathUtils.clamp(zoom + Math.sign(event.deltaY) * 0.65, 6, 17)
      camera.position.z = zoom
      render()
    }
    const onContextMenu = (event: Event) => event.preventDefault()
    const onVisibility = () => {
      active = !document.hidden
      if (active) { render(); start() } else stop()
    }
    const onMotionChange = () => {
      stop()
      if (reducedMotion.matches) render()
      else start()
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      stop()
      setSupported(false)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(container)
    if (!observer) window.addEventListener('resize', resize)
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('webglcontextlost', onContextLost)
    document.addEventListener('visibilitychange', onVisibility)
    reducedMotion.addEventListener('change', onMotionChange)
    drawRef.current = () => render()
    zoomRef.current = amount => {
      zoom = THREE.MathUtils.clamp(zoom + amount, 6, 17)
      camera.position.z = zoom
      render()
    }
    resetRef.current = () => {
      zoom = 10.5
      camera.position.z = zoom
      root.rotation.set(0, 0, 0)
      root.position.set(0, 0, 0)
      render()
    }
    resize()
    if (reducedMotion.matches) render()
    else start()

    return () => {
      disposed = true
      stop()
      observer?.disconnect()
      if (!observer) window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      document.removeEventListener('visibilitychange', onVisibility)
      reducedMotion.removeEventListener('change', onMotionChange)
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.InstancedMesh || object instanceof THREE.Points) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => material.dispose())
        }
      })
      renderer.renderLists.dispose()
      renderer.dispose()
      drawRef.current = () => {}
      zoomRef.current = () => {}
      resetRef.current = () => {}
    }
  }, [items])

  return (
    <div className="constellation-stage">
      <div className="constellation-canvas-shell" ref={host}>
        <canvas className="constellation-canvas" aria-label="3D visualization of work items" aria-describedby={supported ? 'constellation-controls-hint' : undefined} />
        {supported && <div className="constellation-controls" aria-label="3D view controls">
          <button type="button" aria-label="Zoom in" onClick={() => zoomRef.current(-1)}><ZoomIn className="size-4" /></button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomRef.current(1)}><ZoomOut className="size-4" /></button>
          <button type="button" aria-label="Reset 3D view" onClick={() => resetRef.current()}><RotateCcw className="size-4" /></button>
        </div>}
        {!supported && <div className="constellation-fallback">
          <p className="text-sm font-medium text-fg">3D rendering is unavailable in this browser.</p>
          <p className="mt-1 text-xs text-muted">The same records remain available in the accessible list view.</p>
          <Button className="mt-3" onClick={onFallback}>Switch to list view</Button>
        </div>}
      </div>
      {supported && <p className="constellation-hint" id="constellation-controls-hint">Drag to orbit · Right-drag to pan · Scroll to zoom · Select a node to inspect. Choose List for keyboard access.</p>}
    </div>
  )
}
