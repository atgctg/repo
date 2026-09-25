import { useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useMountEffect } from '~/hooks/use-mount-effect'
import { clearSelection, closeDrawer } from '~/lib/store'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export function Hotkeys(): null {
  const params = useParams()
  const navigate = useNavigate()
  const idRef = useRef(params.id)
  idRef.current = params.id
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  useMountEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.metaKey &&
        event.code === 'Backquote' &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const id = idRef.current
        if (!id) return
        event.preventDefault()
        const raw = window.location.pathname.endsWith('/raw')
        if (!raw) closeDrawer(id)
        void navigateRef.current(raw ? `/${id}` : `/${id}/raw`)
        return
      }
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
        if (id) clearSelection(id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
  return null
}
