import { clsx } from 'clsx'
import markUrl from '../assets/orca-mark.png'

/** Height/width of the artwork's whale mark, measured from logo-source.png. */
const MARK_ASPECT = 548 / 590

export function OrcaMark({ className, size = 30 }: { className?: string; size?: number }): React.JSX.Element {
  return (
    <img
      aria-hidden="true"
      alt=""
      className={clsx('orca-mark', className)}
      src={markUrl}
      width={size}
      height={Math.round(size * MARK_ASPECT)}
      draggable={false}
    />
  )
}

export function Logo({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <div className={clsx('logo', compact && 'logo--compact')} aria-label="Orca">
      <span className="logo__mark">
        <OrcaMark size={30} />
      </span>
      {!compact && <span className="logo__word">ORCA</span>}
    </div>
  )
}
