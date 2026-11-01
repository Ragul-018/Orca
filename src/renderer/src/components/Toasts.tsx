import { AnimatePresence, motion } from 'motion/react'
import { Check, Info, X } from 'lucide-react'
import { useOrcaStore } from '../store'

export function Toasts(): React.JSX.Element {
  const toasts = useOrcaStore((state) => state.toasts)
  const dismiss = useOrcaStore((state) => state.dismissToast)

  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`toast toast--${toast.tone}`}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="toast__icon">
              {toast.tone === 'success' ? <Check size={14} /> : <Info size={14} />}
            </span>
            <span className="toast__message">{toast.message}</span>
            <button className="toast__close" type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
