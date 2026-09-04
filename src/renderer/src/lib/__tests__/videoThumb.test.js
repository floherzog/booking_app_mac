import { describe, it, expect } from 'vitest'
import { playBadgeGeometry } from '../videoThumb'

// drawPlayBadge itself needs a canvas, so only the arithmetic is covered here;
// the drawing is on the manual checklist.
describe('playBadgeGeometry', () => {
  it('centres the badge (to within the pixel rounding)', () => {
    const { badge } = playBadgeGeometry(1280, 720)
    expect(Math.abs(badge.x + badge.width / 2 - 640)).toBeLessThanOrEqual(1)
    expect(Math.abs(badge.y + badge.height / 2 - 360)).toBeLessThanOrEqual(1)
  })

  it('scales with the image, so every thumbnail size looks alike', () => {
    const big = playBadgeGeometry(1280, 720)
    const small = playBadgeGeometry(480, 360)
    expect(big.badge.width / 1280).toBeCloseTo(small.badge.width / 480, 2)
  })

  it('keeps the badge well inside the frame', () => {
    for (const [w, h] of [[1280, 720], [480, 360], [320, 180], [64, 64]]) {
      const { badge, triangle } = playBadgeGeometry(w, h)
      expect(badge.x).toBeGreaterThan(0)
      expect(badge.y).toBeGreaterThan(0)
      expect(badge.x + badge.width).toBeLessThan(w)
      expect(badge.y + badge.height).toBeLessThan(h)
      // The glyph has to sit inside its badge.
      expect(triangle.x).toBeGreaterThanOrEqual(badge.x)
      expect(triangle.x + triangle.width).toBeLessThanOrEqual(badge.x + badge.width)
      expect(triangle.y).toBeGreaterThanOrEqual(badge.y)
      expect(triangle.y + triangle.height).toBeLessThanOrEqual(badge.y + badge.height)
    }
  })

  it('nudges the glyph right of centre, where it looks centred', () => {
    const { triangle } = playBadgeGeometry(1280, 720)
    expect(triangle.x).toBeGreaterThan((1280 - triangle.width) / 2)
  })

  it('survives a degenerate size rather than producing NaN', () => {
    const { badge } = playBadgeGeometry(0, 0)
    expect(Number.isFinite(badge.width)).toBe(true)
    expect(Number.isFinite(badge.x)).toBe(true)
  })
})
