import { useEffect, useState } from 'react'
import type { Envelope } from './client'
export function useResource<T>(load: (signal: AbortSignal) => Promise<Envelope<T>>) {
  const [result, setResult] = useState<{ response: Envelope<T> | null; loading: boolean; error: string; loader: typeof load }>({ response: null, loading: true, error: '', loader: load })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal).then(response => { if (!controller.signal.aborted) setResult({ response, loading: false, error: '', loader: load }) }).catch((error: Error) => { if (!controller.signal.aborted) setResult({ response: null, loading: false, error: error.message, loader: load }) })
    return () => controller.abort()
  }, [load, version])
  const visible = result.loader === load ? result : { ...result, response: null, loading: true, error: '' }
  return { ...visible, reload: () => { setResult({ response: null, loading: true, error: '', loader: load }); setVersion(v => v + 1) } }
}
