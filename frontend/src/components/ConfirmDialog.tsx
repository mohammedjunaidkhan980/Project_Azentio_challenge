import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export function ConfirmDialog({ open, title, children, confirmLabel, destructive = false, onCancel, onConfirm }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; destructive?: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal()
    else if (!open && dialog.current?.open) dialog.current.close()
  }, [open])
  return <dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirmation-title" onKeyDown={e => {
    if (e.key !== 'Tab') return
    const controls = [...e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length > 0)
    const first = controls[0], last = controls.at(-1)
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }} onCancel={e => { e.preventDefault(); onCancel() }}><h2 id="confirmation-title">{title}</h2><div className="dialog-body">{children}</div><div className="dialog-actions"><button type="button" className="button button-secondary" autoFocus onClick={onCancel}>Cancel</button><button type="button" className={`button ${destructive ? 'button-danger' : 'button-primary'}`} onClick={onConfirm}>{confirmLabel}</button></div></dialog>
}
