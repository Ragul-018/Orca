import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import { useOrcaStore } from '../store'

export function ConfirmDialog(): React.JSX.Element {
  const confirm = useOrcaStore((state) => state.confirm)
  const closeConfirm = useOrcaStore((state) => state.closeConfirm)
  const runConfirm = useOrcaStore((state) => state.runConfirm)
  const [running, setRunning] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!confirm) return
    setRunning(false)
    const frame = window.requestAnimationFrame(() => confirmRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [confirm])

  useEffect(() => {
    if (!confirm) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !running) {
        event.preventDefault()
        closeConfirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeConfirm, confirm, running])

  const handleConfirm = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    await runConfirm()
    setRunning(false)
  }

  return (
    <AnimatePresence>
      {confirm && (
        <motion.div
          className="confirm-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !running) closeConfirm()
          }}
        >
          <motion.section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            initial={{ opacity: 0, y: 12, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="confirm-dialog__header">
              <span className={`confirm-dialog__icon ${confirm.danger ? 'is-danger' : ''}`}>
                <AlertTriangle size={19} />
              </span>
              <button
                className="modal-close modal-close--small"
                type="button"
                onClick={closeConfirm}
                aria-label="Close"
                disabled={running}
              >
                <X size={16} />
              </button>
            </header>
            <h2 id="confirm-title">{confirm.title}</h2>
            <p id="confirm-message">{confirm.message}</p>
            <footer className="confirm-dialog__actions">
              <button className="button button--ghost" type="button" onClick={closeConfirm} disabled={running}>
                Cancel
              </button>
              <button
                ref={confirmRef}
                className={`button ${confirm.danger ? 'button--danger' : 'button--primary'}`}
                type="button"
                onClick={() => void handleConfirm()}
                disabled={running}
              >
                {running && <LoaderCircle size={15} className="spin" />}
                {confirm.confirmLabel}
              </button>
            </footer>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
