import type { CSSProperties } from 'react'

type Sx = {
  className?: string
  style?: CSSProperties
}

export function withClass(props: Sx, className?: string): Sx {
  if (!className) return props
  return {
    ...props,
    className: props.className ? `${props.className} ${className}` : className,
  }
}
