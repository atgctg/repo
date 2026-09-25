import type { ReactNode, SVGProps } from 'react'
import {
  ArrowLeft,
  Braces,
  GalleryHorizontalEnd,
  Image,
  Mic,
  MousePointer2,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash,
  User,
  X,
  type LucideIcon,
} from 'lucide-react'
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
  | 'raw'
  | 'stop'

const styles = stylex.create({
  icon: {
    width: '1rem',
    height: '1rem',
    minWidth: '1rem',
    minHeight: '1rem',
    display: 'block',
    flexShrink: 0,
    aspectRatio: '1',
  },
  md: {
    width: '1.25rem',
    height: '1.25rem',
    minWidth: '1.25rem',
    minHeight: '1.25rem',
  },
  lg: {
    width: '1.5rem',
    height: '1.5rem',
    minWidth: '1.5rem',
    minHeight: '1.5rem',
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

const ICONS: Record<IconName, LucideIcon> = {
  back: ArrowLeft,
  close: X,
  play: Play,
  pause: Pause,
  refresh: RefreshCw,
  albums: GalleryHorizontalEnd,
  image: Image,
  trash: Trash,
  person: User,
  mic: Mic,
  pointer: MousePointer2,
  raw: Braces,
  stop: Square,
}

const PX = { sm: 16, md: 20, lg: 24 } as const

const FILLED = new Set<IconName>(['play', 'pause', 'pointer', 'stop'])

export function Icon({
  name,
  size = 'sm',
  spin = false,
}: {
  name: IconName
  size?: 'sm' | 'md' | 'lg'
  spin?: boolean
}): ReactNode {
  const Glyph = ICONS[name]
  const filled = FILLED.has(name)
  const svg = stylex.props(
    styles.icon,
    size === 'md' && styles.md,
    size === 'lg' && styles.lg,
    spin && styles.spin,
  )
  return (
    <Glyph
      size={PX[size]}
      strokeWidth={filled ? 0 : 1.75}
      fill={filled ? 'currentColor' : 'none'}
      aria-hidden
      {...(svg as SVGProps<SVGSVGElement>)}
    />
  )
}
