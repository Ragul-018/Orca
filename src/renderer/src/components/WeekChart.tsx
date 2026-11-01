import { formatDuration, formatPlaytime } from '@shared/format'
import type { computeWeek } from '../lib/visual'

type WeekDays = ReturnType<typeof computeWeek>

export function WeekChart({ days, variant = 'default' }: { days: WeekDays; variant?: 'default' | 'compact' }): React.JSX.Element {
  const max = Math.max(1, ...days.map((day) => day.ms))
  return (
    <div className={`week-chart week-chart--${variant}`}>
      {days.map((day) => {
        const height = day.ms > 0 ? Math.max(8, (day.ms / max) * 100) : 2
        return (
          <div className="week-chart__day" key={day.date.toISOString()} title={`${day.label}: ${formatDuration(day.ms)}`}>
            <div className="week-chart__track">
              <div
                className={`week-chart__bar ${day.ms > 0 ? 'has-time' : ''}`}
                style={{ height: `${height}%` }}
              />
            </div>
            <span className="week-chart__label">{day.label.slice(0, 1)}</span>
          </div>
        )
      })}
      {variant === 'default' && (
        <div className="week-chart__total">
          <span>This week</span>
          <strong>{formatPlaytime(days.reduce((total, day) => total + day.ms, 0))}</strong>
        </div>
      )}
    </div>
  )
}
