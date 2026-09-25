import { useRef } from 'react'
import { useParams } from 'react-router'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { closeDrawer } from '~/lib/store'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function Hotkeys(): null {
  const params = useParams()
  const idRef = useRef(params.id)
  idRef.current = params.id
  useMountEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !isTyping(event.target)
      ) {
        event.preventDefault()
        document.querySelector<HTMLTextAreaElement>('[data-composer]')?.focus()
        return
      }
      if (event.key === 'Escape') {
        if (isTyping(event.target)) return
        const id = idRef.current
        if (id) closeDrawer(id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  return null
}
