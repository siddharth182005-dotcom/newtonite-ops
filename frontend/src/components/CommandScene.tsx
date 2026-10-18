import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

const orbVertexShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 p = position;
    float swell = sin(position.y * 4.2 + uTime * 0.24) * 0.018
      + sin(position.x * 5.1 - uTime * 0.18) * 0.012
      + cos(position.z * 4.7 + uTime * 0.16) * 0.014;
    p += normal * swell;
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vViewPosition = -viewPosition.xyz;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * viewPosition;
  }
`

const orbFragmentShader = `
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vPosition;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
          mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 p = normalize(vPosition);
    float flow = p.x * 3.8 + p.y * 2.4 + sin(p.z * 4.0 + uTime * 0.22) * 0.78;
    float turbulence = noise3(p * 5.0 + vec3(0.0, uTime * 0.045, uTime * 0.025));
    float current = sin(flow * 2.2 + turbulence * 4.5);
    float ribbon = smoothstep(0.45, 0.94, current * 0.5 + turbulence * 0.5);
    float nebula = smoothstep(0.35, 0.83, noise3(p * 3.4 + vec3(uTime * 0.035, 0.0, 0.0)));
    vec3 deep = vec3(0.015, 0.022, 0.075);
    vec3 violet = vec3(0.30, 0.075, 0.88);
    vec3 blue = vec3(0.025, 0.34, 0.95);
    vec3 cyan = vec3(0.11, 0.78, 1.0);
    vec3 color = mix(deep, violet, nebula * 0.75);
    color = mix(color, blue, ribbon * 0.82);
    color = mix(color, cyan, smoothstep(0.79, 0.97, current + turbulence * 0.18) * 0.8);

    vec3 normal = normalize(vNormal);
    vec3 viewDirection = normalize(vViewPosition);
    float fresnel = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.2);
    float glint = pow(max(dot(reflect(-viewDirection, normal), normalize(vec3(-0.55, 0.82, 0.9))), 0.0), 36.0);
    float speckle = smoothstep(0.965, 1.0, noise3(p * 50.0 + vec3(0.0, uTime * 0.02, 0.0)));
    color += vec3(0.24, 0.37, 1.0) * fresnel * 0.78;
    color += vec3(0.68, 0.88, 1.0) * glint * 0.8;
    color += vec3(0.48, 0.34, 1.0) * speckle * 0.7;

    float alpha = clamp(0.48 + nebula * 0.3 + ribbon * 0.25 + fresnel * 0.34, 0.42, 0.96);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

type Crystal = {
  mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>
  phase: number
  radius: number
  speed: number
  height: number
}

export default function CommandScene() {
  const host = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const container = host.current
    const canvas = container?.querySelector('canvas')
    if (!container || !canvas || typeof WebGLRenderingContext === 'undefined') return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mobile = window.matchMedia('(max-width: 700px)')
    const lowPower = mobile.matches || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
      || ('deviceMemory' in navigator && Number(navigator.deviceMemory) <= 4)
    const particleCount = lowPower ? 48 : 128
    const crystalCount = lowPower ? 8 : 15
    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !lowPower,
        powerPreference: 'low-power',
        stencil: false,
        depth: true,
      })
    } catch {
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1 : 1.35))
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80)
    camera.position.set(0, 0.1, 10.5)

    const world = new THREE.Group()
    scene.add(world)

    const ambient = new THREE.AmbientLight(0x627cff, 1.25)
    scene.add(ambient)
    const violetLight = new THREE.PointLight(0x7b36ff, 54, 12, 2)
    violetLight.position.set(-3.4, 2.5, 3)
    world.add(violetLight)
    const cyanLight = new THREE.PointLight(0x1e9cff, 42, 11, 2)
    cyanLight.position.set(3.2, 0.1, 2.2)
    world.add(cyanLight)
    const underLight = new THREE.PointLight(0x6c34ff, 30, 9, 2)
    underLight.position.set(0, -3.5, 1.5)
    world.add(underLight)

    const orbGroup = new THREE.Group()
    orbGroup.position.set(0.15, 0.14, 0)
    world.add(orbGroup)
    const orbGeometry = new THREE.SphereGeometry(1.52, lowPower ? 48 : 72, lowPower ? 36 : 56)
    const orbMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: orbVertexShader,
      fragmentShader: orbFragmentShader,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    })
    const orb = new THREE.Mesh(orbGeometry, orbMaterial)
    orbGroup.add(orb)
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(1.545, lowPower ? 40 : 64, lowPower ? 32 : 48),
      new THREE.MeshPhysicalMaterial({
        color: 0xa5b9ff,
        metalness: 0.22,
        roughness: 0.12,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
        transparent: true,
        opacity: 0.12,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    )
    orbGroup.add(shell)
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.68, 32, 24),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float edge = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 3.2);
            gl_FragColor = vec4(mix(vec3(0.20, 0.12, 0.8), vec3(0.10, 0.55, 1.0), edge), edge * 0.22);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    )
    orbGroup.add(glow)

    const orbitalGroups: THREE.Group[] = []
    const ringColors = [0x9272ff, 0x2faeff, 0x7e69f8]
    for (let index = 0; index < 3; index += 1) {
      const group = new THREE.Group()
      group.rotation.set(0.48 + index * 0.54, index * 0.78, index * 0.36)
      world.add(group)
      const radius = 2.2 + index * 0.34
      const geometry = new THREE.TorusGeometry(radius, index === 1 ? 0.012 : 0.009, 6, 180)
      const material = new THREE.MeshBasicMaterial({
        color: ringColors[index],
        transparent: true,
        opacity: index === 1 ? 0.78 : 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      const ring = new THREE.Mesh(geometry, material)
      group.add(ring)
      orbitalGroups.push(group)
    }

    const trailGroup = new THREE.Group()
    trailGroup.rotation.set(1.11, 0.18, -0.22)
    world.add(trailGroup)
    for (let trail = 0; trail < 2; trail += 1) {
      const points: THREE.Vector3[] = []
      for (let i = 0; i <= 120; i += 1) {
        const angle = (i / 120) * Math.PI * 2
        points.push(new THREE.Vector3(
          Math.cos(angle) * (2.68 + trail * 0.1),
          Math.sin(angle * 1.5 + trail * 0.8) * (0.52 + trail * 0.06),
          Math.sin(angle) * (1.48 + trail * 0.12),
        ))
      }
      const path = new THREE.CatmullRomCurve3(points, true, 'centripetal')
      const tube = new THREE.TubeGeometry(path, 180, trail === 0 ? 0.016 : 0.008, 5, true)
      const light = new THREE.MeshBasicMaterial({
        color: trail === 0 ? 0x9d72ff : 0x32b8ff,
        transparent: true,
        opacity: trail === 0 ? 0.66 : 0.44,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
      trailGroup.add(new THREE.Mesh(tube, light))
    }

    const platform = new THREE.Group()
    platform.position.set(0, -2.53, -0.1)
    world.add(platform)
    const platformDisk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.22, 1.43, 0.12, 64, 1, false),
      new THREE.MeshPhysicalMaterial({
        color: 0x11183e,
        metalness: 0.88,
        roughness: 0.22,
        clearcoat: 1,
        clearcoatRoughness: 0.12,
        transparent: true,
        opacity: 0.84,
      }),
    )
    platform.add(platformDisk)
    const platformRings: THREE.Mesh[] = []
    for (let index = 0; index < 3; index += 1) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.55 + index * 0.43, index === 0 ? 0.018 : 0.009, 6, 128),
        new THREE.MeshBasicMaterial({
          color: index === 1 ? 0x33b9ff : 0x8767ff,
          transparent: true,
          opacity: index === 0 ? 0.75 : 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      )
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.07 + index * 0.018
      platform.add(ring)
      platformRings.push(ring)
    }

    const crystals: Crystal[] = []
    for (let index = 0; index < crystalCount; index += 1) {
      const size = 0.07 + Math.random() * 0.14
      const material = new THREE.MeshStandardMaterial({
        color: index % 3 === 0 ? 0x47b7ff : index % 3 === 1 ? 0x9a72ff : 0x6c78ff,
        emissive: index % 3 === 0 ? 0x103a91 : 0x321070,
        emissiveIntensity: 0.8,
        metalness: 0.72,
        roughness: 0.19,
        transparent: true,
        opacity: 0.78,
        flatShading: true,
      })
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(size, 0), material)
      const crystal = {
        mesh,
        phase: Math.random() * Math.PI * 2,
        radius: 2.05 + Math.random() * 2.25,
        speed: 0.07 + Math.random() * 0.15,
        height: (Math.random() - 0.5) * 3.8,
      }
      crystals.push(crystal)
      world.add(mesh)
    }

    const particlePositions = new Float32Array(particleCount * 3)
    const particlePhases = new Float32Array(particleCount)
    const particleRadii = new Float32Array(particleCount)
    const particleHeights = new Float32Array(particleCount)
    for (let index = 0; index < particleCount; index += 1) {
      particlePhases[index] = Math.random() * Math.PI * 2
      particleRadii[index] = 2.1 + Math.random() * 5.2
      particleHeights[index] = (Math.random() - 0.5) * 6.7
      particlePositions[index * 3] = Math.cos(particlePhases[index]) * particleRadii[index]
      particlePositions[index * 3 + 1] = particleHeights[index]
      particlePositions[index * 3 + 2] = Math.sin(particlePhases[index]) * particleRadii[index] * 0.62
    }
    const particleGeometry = new THREE.BufferGeometry()
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
    const particleMaterial = new THREE.PointsMaterial({
      color: 0xa7b9ff,
      size: lowPower ? 0.022 : 0.028,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.66,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    const particles = new THREE.Points(particleGeometry, particleMaterial)
    world.add(particles)

    let width = 0
    let height = 0
    let frame = 0
    let active = !document.hidden
    let disposed = false
    let targetX = 0
    let targetY = 0
    const timer = new THREE.Timer()
    timer.connect(document)

    const resize = () => {
      width = container.clientWidth || window.innerWidth
      height = container.clientHeight || window.innerHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.position.z = mobile.matches ? 10 : 10.5
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }

    const renderFrame = (timestamp?: number) => {
      if (disposed || !active) return
      timer.update(timestamp)
      const delta = Math.min(timer.getDelta(), 0.05)
      const elapsed = timer.getElapsed()
      orbMaterial.uniforms.uTime.value = elapsed
      orbGroup.rotation.y = elapsed * 0.075
      orbGroup.rotation.x = Math.sin(elapsed * 0.12) * 0.035
      orbitalGroups.forEach((group, index) => {
        group.rotation.y += delta * (index === 1 ? -0.075 : 0.045 + index * 0.018)
        group.rotation.x = (0.48 + index * 0.54) + Math.sin(elapsed * 0.14 + index) * 0.035
      })
      trailGroup.rotation.z = Math.sin(elapsed * 0.11) * 0.12
      trailGroup.rotation.y = elapsed * 0.025
      platformRings.forEach((ring, index) => {
        ring.rotation.z = Math.sin(elapsed * (0.12 + index * 0.03)) * 0.08
      })
      crystals.forEach(({ mesh, phase, radius, speed, height: y }) => {
        const angle = phase + elapsed * speed
        mesh.position.set(Math.cos(angle) * radius, y + Math.sin(elapsed * 0.27 + phase) * 0.12, Math.sin(angle) * radius * 0.56)
        mesh.rotation.x += delta * (0.16 + speed)
        mesh.rotation.y += delta * (0.22 + speed * 0.7)
      })
      for (let index = 0; index < particleCount; index += 1) {
        const angle = particlePhases[index] + elapsed * (0.018 + (index % 5) * 0.003)
        particlePositions[index * 3] = Math.cos(angle) * particleRadii[index]
        particlePositions[index * 3 + 1] = particleHeights[index] + Math.sin(elapsed * 0.22 + particlePhases[index]) * 0.1
        particlePositions[index * 3 + 2] = Math.sin(angle) * particleRadii[index] * 0.62
      }
      particleGeometry.attributes.position.needsUpdate = true
      const parallax = reducedMotion.matches ? 0 : 1
      world.position.x += (targetX * 0.22 * parallax - world.position.x) * Math.min(delta * 1.8, 1)
      world.position.y += (targetY * 0.16 * parallax - world.position.y) * Math.min(delta * 1.8, 1)
      camera.position.x += (targetX * 0.16 * parallax - camera.position.x) * Math.min(delta, 1)
      camera.position.y = 0.1 + Math.sin(elapsed * 0.12) * 0.035 + targetY * 0.11 * parallax
      renderer.render(scene, camera)
      if (!reducedMotion.matches) frame = window.requestAnimationFrame(renderFrame)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches || event.pointerType === 'touch') return
      targetX = (event.clientX / Math.max(window.innerWidth, 1) - 0.5) * 2
      targetY = (0.5 - event.clientY / Math.max(window.innerHeight, 1)) * 2
    }
    const onVisibilityChange = () => {
      active = !document.hidden
      if (active) {
        renderFrame()
      } else {
        window.cancelAnimationFrame(frame)
      }
    }
    const onContextLost = (event: Event) => {
      event.preventDefault()
      disposed = true
      window.cancelAnimationFrame(frame)
      setReady(false)
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize)
    observer?.observe(container)
    if (!observer) window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    canvas.addEventListener('webglcontextlost', onContextLost)
    reducedMotion.addEventListener('change', onMotionPreferenceChange)
    resize()
    setReady(true)
    if (active) renderFrame()

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
      if (!observer) window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      reducedMotion.removeEventListener('change', onMotionPreferenceChange)
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose()
          const materials = Array.isArray(object.material) ? object.material : [object.material]
          materials.forEach(material => material.dispose())
        }
      })
      renderer.renderLists.dispose()
      renderer.dispose()
      timer.dispose()
    }

    function onMotionPreferenceChange() {
      if (reducedMotion.matches) {
        window.cancelAnimationFrame(frame)
        renderFrame()
      } else if (active) {
        timer.reset()
        renderFrame()
      }
    }
  }, [])

  return (
    <div ref={host} className="command-scene" aria-hidden="true">
      <canvas className="command-scene-canvas" />
      {!ready && (
        <div className="command-scene-fallback">
          <div className="fallback-orbit fallback-orbit-a" />
          <div className="fallback-orbit fallback-orbit-b" />
          <div className="fallback-orb" />
          <div className="fallback-platform" />
        </div>
      )}
      <div className="command-scene-vignette" />
    </div>
  )
}
