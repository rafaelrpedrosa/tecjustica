import { useState, useEffect, useRef, useCallback } from 'react'

export interface ToastEntry {
  id: string
  message: string
  type?: 'success' | 'error'
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    return () => { timers.current.forEach(clearTimeout) }
  }, [])

  const showToast = useCallback((message: string, type?: 'success' | 'error') => {
    const id = crypto.randomUUID()
    setToasts(prev => [...prev, { id, message, type }])
    const timer = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      timers.current.delete(id)
    }, 4000)
    timers.current.set(id, timer)
  }, [])

  return { toasts, showToast }
}
