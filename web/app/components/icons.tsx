import type { ReactNode, SVGProps } from 'react'
import * as stylex from '@stylexjs/stylex'

export type IconName =
  | 'back'
  | 'close'
  | 'play'
  | 'pause'
  | 'refresh'
  | 'albums'
  | 'image'
  | 'trash'
  | 'person'
  | 'mic'
  | 'pointer'

const styles = stylex.create({
  icon: {
    width: '1rem',
    height: '1rem',
    display: 'block',
    flexShrink: 0,
  },
  md: {
    width: '1.25rem',
    height: '1.25rem',
  },
  lg: {
    width: '1.5rem',
    height: '1.5rem',
  },
  spin: {
    animationName: stylex.keyframes({
      to: { transform: 'rotate(360deg)' },
    }),
    animationDuration: '0.8s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
})

const PATHS: Record<IconName, ReactNode> = {
  back: <path d="M14.5 6.5 8.5 12l6 5.5" />,
  close: <path d="M7 7l10 10M17 7 7 17" />,
  play: <path d="M9 7.2v9.6l8.2-4.8L9 7.2Z" fill="currentColor" stroke="none" />,
  pause: (
    <path d="M8.5 7h2.2v10H8.5zm4.8 0H15.5v10h-2.2z" fill="currentColor" stroke="none" />
  ),
  refresh: <path d="M19.2 12a7.2 7.2 0 1 1-2.1-5.1M19.2 4.8v4.2h-4.2" />,
  albums: <path d="M8 7.5h11v9H8zM6 9.2v7.2M4 10.8v5.2" />,
  image: <path d="M5 6.5h14v11H5zM5 14.5l3.2-3.2L12 15l2-2 5 4.5" />,
  trash: <path d="M5.5 8h13M9.2 8V6.2h5.6V8M8.2 8l.8 10.2h6l.8-10.2" />,
  person: (
    <path d="M12 12.2a3.1 3.1 0 1 0-3.1-3.1A3.1 3.1 0 0 0 12 12.2Zm-5.6 5.6a5.6 5.6 0 0 1 11.2 0" />
  ),
  mic: (
    <path d="M12 4.2a2.4 2.4 0 0 0-2.4 2.4v4.8a2.4 2.4 0 0 0 4.8 0V6.6A2.4 2.4 0 0 0 12 4.2ZM8 11.2a4 4 0 0 0 8 0M12 15.2v3.6" />
  ),
  pointer: <path d="M7.5 4.2 16.2 12l-3.4.7 3.2 5.2-1.7 1.1-3.2-5.1-3.6 3.2Z" />,
}

export function Icon({
  name,
  size = 'sm',
  spin = false,
}: {
  name: IconName
  size?: 'sm' | 'md' | 'lg'
  spin?: boolean
}): ReactNode {
  const filled = name === 'play' || name === 'pause' || name === 'pointer'
  const svg = stylex.props(
    styles.icon,
    size === 'md' && styles.md,
    size === 'lg' && styles.lg,
    spin && styles.spin,
  )
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(svg as SVGProps<SVGSVGElement>)}
    >
      {PATHS[name]}
    </svg>
  )
}
