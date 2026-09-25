import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import * as stylex from '@stylexjs/stylex'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { tokens } from '~/styles/tokens.stylex'

const styles = stylex.create({
  edge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    boxSizing: 'content-box',
    width: '2px',
    paddingLeft: '5px',
    paddingRight: '5px',
    zIndex: 5,
    touchAction: 'none',
    backgroundClip: 'content-box',
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
    '@media (prefers-color-scheme: dark)': {
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
    },
    ':hover': {
      cursor: 'col-resize',
      backgroundColor: tokens.ring,
    },
  },
  hot: {
    cursor: 'col-resize',
    backgroundColor: tokens.ring,
  },
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function usePaneWidth(
  key: string,
  fallback: number,
  min: number,
  max: number,
): {
  width: number
  setWidth: (width: number) => void
  commit: () => void
} {
  const [width, setWidthState] = useState(fallback)
  const widthRef = useRef(fallback)
  useMountEffect(() => {
    const raw = localStorage.getItem(key)
    if (raw === null || raw === '') return
    const saved = Number(raw)
    if (!Number.isFinite(saved)) return
    const next = clamp(saved, min, max)
    widthRef.current = next
    setWidthState(next)
  })
  return {
    width,
    setWidth(next: number) {
      const clamped = clamp(next, min, max)
      widthRef.current = clamped
      setWidthState(clamped)
    },
    commit() {
      localStorage.setItem(key, String(widthRef.current))
    },
  }
}

export function ResizeEdge({
  side,
  width,
  sign,
  min,
  max,
  onWidth,
  onCommit,
}: {
  side: 'left' | 'right'
  width: number
  sign: 1 | -1
  min: number
  max: number
  onWidth: (width: number) => void
  onCommit: () => void
}): ReactNode {
  const [hot, setHot] = useState(false)
  const drag = useRef<{ x: number; width: number } | null>(null)
  function down(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, width }
    document.body.style.cursor = 'col-resize'
    setHot(true)
  }
  function move(event: ReactPointerEvent<HTMLDivElement>): void {
    const start = drag.current
    if (!start) return
    onWidth(clamp(start.width + sign * (event.clientX - start.x), min, max))
  }
  function up(): void {
    if (!drag.current) return
    drag.current = null
    document.body.style.cursor = ''
    setHot(false)
    onCommit()
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      {...stylex.props(styles.edge, hot && styles.hot)}
      style={side === 'left' ? { left: width - 6 } : { right: width - 6 }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    />
  )
}
