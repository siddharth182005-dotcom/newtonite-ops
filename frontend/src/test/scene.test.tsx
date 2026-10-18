import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import CommandScene from '../components/CommandScene'

describe('command scene fallback', () => {
  it('keeps a decorative static scene available when WebGL is unsupported', () => {
    render(<CommandScene />)

    expect(document.querySelector('.command-scene[aria-hidden="true"]')).toBeInTheDocument()
    expect(document.querySelector('.command-scene-canvas')).toBeInTheDocument()
    expect(document.querySelector('.command-scene-fallback')).toBeInTheDocument()
    expect(document.querySelector('.fallback-orb')).toBeInTheDocument()
  })
})
