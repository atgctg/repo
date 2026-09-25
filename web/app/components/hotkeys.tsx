import { useRef } from 'react'
import { useParams } from 'react-router'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { closeDrawer, getSnapshot, stepScene, toggleLayout } from '~/lib/store'

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
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key === '/') {
        event.preventDefault()
        toggleLayout()
        return
      }
      if (
        event.key === '/' &&
        !meta &&
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
        return
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      if (isTyping(event.target) || getSnapshot().layout !== 'fullscreen') return
      const id = idRef.current
      if (!id) return
      event.preventDefault()
      stepScene(id, event.key === 'ArrowLeft' ? -1 : 1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  return null
}
