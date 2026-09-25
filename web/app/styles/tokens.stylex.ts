import * as stylex from '@stylexjs/stylex'

const DARK = '@media (prefers-color-scheme: dark)'

export const tokens = stylex.defineVars({
  bg: { default: '#ffffff', [DARK]: '#000000' },
  text: { default: '#000000', [DARK]: '#ffffff' },
  muted: { default: '#737373', [DARK]: '#8e8e8e' },
  chip: { default: '#ececec', [DARK]: '#181818' },
  textSoft: {
    default: 'color-mix(in srgb, #000000 64%, transparent)',
    [DARK]: 'color-mix(in srgb, #ffffff 64%, transparent)',
  },
  textMid: {
    default: 'color-mix(in srgb, #000000 84%, transparent)',
    [DARK]: 'color-mix(in srgb, #ffffff 84%, transparent)',
  },
  tint: { default: 'rgba(0, 0, 0, 0.05)', [DARK]: 'rgba(255, 255, 255, 0.16)' },
  accent: { default: '#3b82f6', [DARK]: '#60a5fa' },
  danger: { default: '#ef4444', [DARK]: '#f87171' },
  onMedia: '#ffffff',
  onMediaSoft: 'rgba(255, 255, 255, 0.72)',
  scrim: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.45), transparent 42%)',
  scrimBottom: 'linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent 70%)',
  font: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  radiusCard: '0.75rem',
  radiusScene: '0.25rem',
  radiusPill: '999px',
  radiusPillow: '1.75rem',
  shadow: '0 0 1rem rgba(0, 0, 0, 0.4)',
  textXs: '0.75rem',
  textSm: '0.875rem',
  textMd: '1rem',
  captionSm: '0.875rem',
  captionMd: '1.25rem',
  captionLg: '1.5rem',
  captionStage: 'clamp(1.75rem, 4vw, 2.75rem)',
})
