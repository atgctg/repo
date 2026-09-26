import type { ReactNode, SVGProps } from 'react'
import {
  ArrowLeft,
  Image,
  Mic,
  LayoutGrid,
  Pause,
  Play,
  PlayingCard,
  PlayingCardsFan,
  RefreshCw,
  Square,
  SquareDashedMousePointer,
  SquareDashedText,
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
  | 'card'
  | 'pointer'
  | 'raw'
  | 'grid'
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
})

const ICONS: Record<IconName, LucideIcon> = {
  back: ArrowLeft,
  close: X,
  play: Play,
  pause: Pause,
  refresh: RefreshCw,
  albums: PlayingCardsFan,
  card: PlayingCard,
  image: Image,
  trash: Trash,
  person: User,
  mic: Mic,
  pointer: SquareDashedMousePointer,
  raw: SquareDashedText,
  grid: LayoutGrid,
  stop: Square,
}

const PX = { sm: 16, md: 20, lg: 24 } as const

const FILLED = new Set<IconName>(['play', 'pause', 'stop'])

export function Icon({
  name,
  size = 'sm',
}: {
  name: IconName
  size?: 'sm' | 'md' | 'lg'
}): ReactNode {
  const Glyph = ICONS[name]
  const filled = FILLED.has(name)
  const svg = stylex.props(
    styles.icon,
    size === 'md' && styles.md,
    size === 'lg' && styles.lg,
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
