import { clsx } from 'clsx'

export function OrcaMark({ className, size = 30 }: { className?: string; size?: number }): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
    >
      <defs>
        <linearGradient id="orca-mark-gradient" x1="8" y1="10" x2="35" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path
        d="M4.7 22.7c8.2.7 14.2-2.6 18.3-10.1l2.2-4.2c.8-1.5 3.1-1.2 3.4.5l.9 5.2c.2 1.4 1.2 2.5 2.5 3l4.4 1.5c-3.4 8.4-10.8 12.8-22.2 13.2l-9.5-.2 1.7-5.7c.4-1.3-1.1-2.4-2.1-1.5l-2.5 2.2 2.9-3.9Z"
        fill="url(#orca-mark-gradient)"
      />
      <circle cx="27.3" cy="14.1" r="1.15" fill="#05070a" />
      <path
        d="M10 31.8c4.8.6 8.8-.2 12-2.5"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        opacity="0.48"
      />
    </svg>
  )
}

export function Logo({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <div className={clsx('logo', compact && 'logo--compact')} aria-label="Orca">
      <span className="logo__mark">
        <OrcaMark size={26} />
      </span>
      {!compact && <span className="logo__word">ORCA</span>}
    </div>
  )
}
