import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  Clock3,
  Download,
  Flame,
  Gamepad2,
  History,
  Search,
  Timer,
  TrendingUp,
  Trophy,
  X
} from 'lucide-react'
import type { PlaySession } from '@shared/types'
import { formatClock, formatDate, formatDuration, formatPlaytime, formatRelativeDate } from '@shared/format'
import { useOrcaStore } from '../store'
import { WeekChart } from '../components/WeekChart'
import { CoverArtwork } from '../components/GameArtwork'
import { computeWeek } from '../lib/visual'
import {
  computeDailySeries,
  computeGamePlaytime,
  computeHeatmap,
  computeMonthlySeries,
  computeStreaks,
  computeTimeOfDay,
  filterSessions,
  summarizeSessions
} from '../lib/playtime'

const END_REASON_LABELS: Record<PlaySession['endReason'], string> = {
  exited: 'Exited',
  stopped: 'Stopped',
  recovered: 'Recovered'
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function MetricCard({
  icon,
  label,
  value,
  detail
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail?: string
}): React.JSX.Element {
  return (
    <div className="metric-card stats-metric">
      <span className="metric-card__icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  )
}

export function StatsPage(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  const exportPlaytime = useOrcaStore((state) => state.exportPlaytime)

  const [query, setQuery] = useState('')
  const [gameFilter, setGameFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [endFilter, setEndFilter] = useState('all')
  const [visibleCount, setVisibleCount] = useState(20)

  const games = useMemo(() => snapshot?.games.filter((game) => !game.hidden) ?? [], [snapshot])
  const sessions = snapshot?.sessions ?? []

  const summary = useMemo(() => summarizeSessions(sessions), [sessions])
  const streaks = useMemo(() => computeStreaks(sessions), [sessions])
  const daily = useMemo(() => computeDailySeries(sessions, 30), [sessions])
  const weekly = useMemo(() => computeWeek(sessions, 7), [sessions])
  const monthly = useMemo(() => computeMonthlySeries(sessions, 12), [sessions])
  const heatmap = useMemo(() => computeHeatmap(sessions, 26), [sessions])
  const timeOfDay = useMemo(() => computeTimeOfDay(sessions), [sessions])
  const gamePlaytime = useMemo(() => computeGamePlaytime(games, sessions), [games, sessions])
  const filtered = useMemo(
    () => filterSessions(sessions, { gameId: gameFilter, source: sourceFilter, endReason: endFilter, query }, games),
    [endFilter, gameFilter, games, query, sessions, sourceFilter]
  )

  useEffect(() => {
    setVisibleCount(20)
  }, [query, gameFilter, sourceFilter, endFilter])

  if (!snapshot) return <></>

  const weekMs = weekly.reduce((total, day) => total + day.ms, 0)
  const dailyMax = Math.max(...daily.map((day) => day.ms), 1)
  const monthlyMax = Math.max(...monthly.map((month) => month.ms), 1)
  const timeOfDayMax = Math.max(...timeOfDay.map((bucket) => bucket.ms), 1)
  const mostActiveDay = [...daily].sort((a, b) => b.ms - a.ms)[0]
  const topGame = gamePlaytime[0] ?? null
  const totalHours = summary.totalMs / 3_600_000
  const heroValue =
    totalHours >= 1
      ? totalHours >= 10
        ? Math.round(totalHours)
        : totalHours.toFixed(1)
      : summary.totalMs > 0 && summary.totalMs < 60_000
        ? '<1'
        : Math.round(summary.totalMs / 60_000)
  const heroUnit = totalHours >= 1 ? 'hours' : 'minutes'
  const longestGame = summary.longest
    ? games.find((game) => game.id === summary.longest?.gameId)
    : null
  const filteredTotalMs = filtered.reduce((total, session) => total + session.durationMs, 0)
  const visibleSessions = filtered.slice(0, visibleCount)
  const gameById = new Map(games.map((game) => [game.id, game]))
  const filtersActive =
    query.trim() !== '' || gameFilter !== 'all' || sourceFilter !== 'all' || endFilter !== 'all'

  const clearFilters = (): void => {
    setQuery('')
    setGameFilter('all')
    setSourceFilter('all')
    setEndFilter('all')
  }

  return (
    <div className="page stats-page page-enter">
      <header className="page-header stats-header">
        <div>
          <span className="eyebrow">
            <span className="eyebrow__line" />
            The record
          </span>
          <h1>Playtime</h1>
          <p className="page-header__subtitle">
            Every descent, every hour, and the patterns beneath them.
          </p>
        </div>
        <div className="stats-header__actions">
          <div className="stats-header__mark">
            <BarChart3 size={18} />
            <span>
              {summary.count} {summary.count === 1 ? 'session' : 'sessions'} logged
            </span>
          </div>
          {summary.count > 0 && (
            <button className="button button--glass" type="button" onClick={() => void exportPlaytime()}>
              <Download size={15} />
              Export CSV
            </button>
          )}
        </div>
      </header>

      {summary.count === 0 ? (
        <section className="stats-empty panel">
          <span className="stats-empty__icon">
            <Clock3 size={28} />
          </span>
          <span className="eyebrow">
            <span className="eyebrow__line" />
            A blank page
          </span>
          <h2>Your story starts with the first launch.</h2>
          <p>Once you play a game through Orca, its hours will be recorded here automatically.</p>
        </section>
      ) : (
        <>
          <section className="stats-overview">
            <div className="stats-total">
              <span className="eyebrow">
                <span className="eyebrow__line" />
                All time
              </span>
              <div className="stats-total__value">
                <strong>{heroValue}</strong>
                <span>{heroUnit}</span>
              </div>
              <div className="stats-total__line">
                <span>
                  {gamePlaytime.length} {gamePlaytime.length === 1 ? 'game' : 'games'} played
                </span>
                <span>
                  {summary.activeDays} active {summary.activeDays === 1 ? 'day' : 'days'}
                </span>
                <span>{summary.count} sessions</span>
              </div>
              {summary.first && (
                <span className="stats-total__since">
                  Tracking since {formatDate(summary.first.startedAt)}
                </span>
              )}
              <div className="stats-total__accent" />
            </div>

            <div className="panel stats-week">
              <div className="panel__heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow__line" />
                    Last seven days
                  </span>
                  <h2>Weekly rhythm</h2>
                </div>
                <span className="stats-week__amount">{weekMs > 0 ? formatPlaytime(weekMs) : 'Quiet week'}</span>
              </div>
              <WeekChart days={weekly} />
            </div>
          </section>

          <section className="stats-metrics stats-metrics--wide">
            <MetricCard
              icon={<Flame size={17} />}
              label="Current streak"
              value={`${streaks.current} ${streaks.current === 1 ? 'day' : 'days'}`}
              detail={streaks.current > 0 ? 'Keep the water moving' : 'Play today to start one'}
            />
            <MetricCard
              icon={<TrendingUp size={17} />}
              label="Best streak"
              value={`${streaks.best} ${streaks.best === 1 ? 'day' : 'days'}`}
              detail={`${streaks.playedDays} total days played`}
            />
            <MetricCard
              icon={<Timer size={17} />}
              label="Average session"
              value={formatDuration(summary.averageMs, { compact: true })}
              detail={`${summary.count} sessions recorded`}
            />
            <MetricCard
              icon={<Trophy size={17} />}
              label="Longest session"
              value={summary.longest ? formatDuration(summary.longest.durationMs, { compact: true }) : '—'}
              detail={longestGame ? longestGame.title : undefined}
            />
            <MetricCard
              icon={<CalendarDays size={17} />}
              label="Most active day"
              value={mostActiveDay && mostActiveDay.ms > 0 ? mostActiveDay.label : '—'}
              detail={
                mostActiveDay && mostActiveDay.ms > 0
                  ? `${formatDate(mostActiveDay.date.toISOString())} · ${formatPlaytime(mostActiveDay.ms)}`
                  : 'No playtime yet'
              }
            />
            <MetricCard
              icon={<Gamepad2 size={17} />}
              label="Most played"
              value={topGame ? topGame.game.title : '—'}
              detail={topGame ? `${formatPlaytime(topGame.totalMs)} · ${Math.round(topGame.share * 100)}% of all time` : undefined}
            />
          </section>

          <div className="stats-chart-grid">
            <section className="panel stats-bars-panel">
              <div className="panel__heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow__line" />
                    Last 30 days
                  </span>
                  <h2>Daily rhythm</h2>
                </div>
                <span className="stats-week__amount">
                  {formatPlaytime(daily.reduce((total, day) => total + day.ms, 0))}
                </span>
              </div>
              <div className="stats-bars" role="img" aria-label="Playtime for the last 30 days">
                {daily.map((day, index) => (
                  <span
                    className={`stats-bar ${day.ms > 0 ? 'has-playtime' : ''}`}
                    key={day.key}
                    title={`${formatDate(day.date.toISOString())}: ${day.ms > 0 ? formatDuration(day.ms, { compact: true }) : 'No playtime'}`}
                  >
                    <span className="stats-bar__track">
                      <span
                        className="stats-bar__fill"
                        style={{ height: `${day.ms > 0 ? Math.max(5, (day.ms / dailyMax) * 100) : 0}%` }}
                      />
                    </span>
                    <small>{index % 5 === 0 || index === daily.length - 1 ? day.date.getDate() : ''}</small>
                  </span>
                ))}
              </div>
            </section>

            <section className="panel stats-heatmap-panel">
              <div className="panel__heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow__line" />
                    Last 26 weeks
                  </span>
                  <h2>Consistency</h2>
                </div>
                <span className="stats-week__amount">
                  {streaks.playedDays} {streaks.playedDays === 1 ? 'day' : 'days'} played
                </span>
              </div>
              <div className="stats-heatmap">
                <div className="stats-heatmap__days" aria-hidden="true">
                  {DAY_LABELS.map((label) => (
                    <span key={label}>{label.slice(0, 1)}</span>
                  ))}
                </div>
                <div className="stats-heatmap__grid" role="img" aria-label="Playtime heatmap for the last 26 weeks">
                  {heatmap.map((column) => (
                    <div className="stats-heatmap__col" key={column[0].key}>
                      {column.map((cell) => (
                        <span
                          className={`stats-heat-cell ${cell.level < 0 ? 'is-future' : `level-${cell.level}`}`}
                          key={cell.key}
                          title={
                            cell.level < 0
                              ? ''
                              : `${formatDate(cell.date.toISOString())}: ${cell.ms > 0 ? formatDuration(cell.ms, { compact: true }) : 'No playtime'}`
                          }
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              <div className="stats-heatmap__legend" aria-hidden="true">
                <span>Less</span>
                {[0, 1, 2, 3, 4].map((level) => (
                  <span className={`stats-heat-cell level-${level}`} key={level} />
                ))}
                <span>More</span>
              </div>
            </section>
          </div>

          <div className="stats-columns stats-columns--split">
            <section className="panel stats-months">
              <div className="panel__heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow__line" />
                    Last 12 months
                  </span>
                  <h2>Monthly tide</h2>
                </div>
                <span className="stats-week__amount">
                  {formatPlaytime(monthly.reduce((total, month) => total + month.ms, 0))}
                </span>
              </div>
              <div className="stats-months__list">
                {monthly.map((month) => (
                  <div className="stats-month" key={month.key}>
                    <span className="stats-month__label">{month.label}</span>
                    <span className="stats-month__track">
                      <span style={{ width: `${month.ms > 0 ? Math.max(2, (month.ms / monthlyMax) * 100) : 0}%` }} />
                    </span>
                    <span className="stats-month__value">
                      {month.ms > 0 ? formatDuration(month.ms, { compact: true }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel stats-tod">
              <div className="panel__heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow__line" />
                    When you play
                  </span>
                  <h2>Time of day</h2>
                </div>
                <Clock3 size={18} className="panel__icon" />
              </div>
              <div className="stats-tod__list">
                {timeOfDay.map((bucket) => (
                  <div className="stats-tod__row" key={bucket.label}>
                    <div className="stats-tod__heading">
                      <strong>{bucket.label}</strong>
                      <span>
                        {bucket.sessions} {bucket.sessions === 1 ? 'session' : 'sessions'}
                      </span>
                    </div>
                    <span className="stats-tod__track">
                      <span style={{ width: `${bucket.ms > 0 ? Math.max(3, (bucket.ms / timeOfDayMax) * 100) : 0}%` }} />
                    </span>
                    <span className="stats-tod__value">
                      {bucket.ms > 0 ? formatDuration(bucket.ms, { compact: true }) : '—'}
                    </span>
                  </div>
                ))}
              </div>
              <div className="stats-tod__note">
                <Clock3 size={14} />
                <span>Night is 12am–6am, morning 6am–12pm, afternoon 12pm–6pm, evening 6pm–12am.</span>
              </div>
            </section>
          </div>

          <section className="panel stats-games">
            <div className="panel__heading">
              <div>
                <span className="eyebrow">
                  <span className="eyebrow__line" />
                  By game
                </span>
                <h2>The full shelf</h2>
              </div>
              <span className="stats-week__amount">
                {gamePlaytime.length} {gamePlaytime.length === 1 ? 'game' : 'games'} played
              </span>
            </div>
            <div className="stats-games__list">
              {gamePlaytime.map((entry, index) => (
                <div className="stats-game-row" key={entry.game.id}>
                  <span className="stats-game-row__rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="stats-game-row__cover">
                    <CoverArtwork game={entry.game} />
                  </span>
                  <div className="stats-game-row__info">
                    <div className="stats-game-row__title">
                      <strong>{entry.game.title}</strong>
                      {entry.game.steamAppId && (
                        <span className="stats-game-row__steam">
                          <Gamepad2 size={10} />
                          Steam
                        </span>
                      )}
                    </div>
                    <span className="stats-game-row__bar">
                      <span style={{ width: `${Math.max(2, entry.share * 100)}%` }} />
                    </span>
                  </div>
                  <span className="stats-game-row__cell">
                    <strong>{formatPlaytime(entry.totalMs)}</strong>
                    <small>{Math.round(entry.share * 100)}% of total</small>
                  </span>
                  <span className="stats-game-row__cell">
                    <strong>{entry.sessionCount}</strong>
                    <small>{entry.sessionCount === 1 ? 'session' : 'sessions'}</small>
                  </span>
                  <span className="stats-game-row__cell">
                    <strong>{formatDuration(entry.averageMs, { compact: true })}</strong>
                    <small>average</small>
                  </span>
                  <span className="stats-game-row__cell stats-game-row__cell--last">
                    <strong>{entry.lastPlayedAt ? formatRelativeDate(entry.lastPlayedAt) : '—'}</strong>
                    <small>last played</small>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel stats-history">
            <div className="panel__heading">
              <div>
                <span className="eyebrow">
                  <span className="eyebrow__line" />
                  The logbook
                </span>
                <h2>Session history</h2>
              </div>
              <button className="button button--ghost button--small" type="button" onClick={() => void exportPlaytime()}>
                <Download size={14} />
                Export CSV
              </button>
            </div>

            <div className="stats-history__filters">
              <label className="search-field stats-history__search">
                <Search size={15} />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search game or process"
                  aria-label="Search session history"
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="Clear session search">
                    <X size={13} />
                  </button>
                )}
              </label>
              <label className="stats-filter">
                <span>Game</span>
                <select value={gameFilter} onChange={(event) => setGameFilter(event.target.value)}>
                  <option value="all">All games</option>
                  {gamePlaytime.map((entry) => (
                    <option value={entry.game.id} key={entry.game.id}>
                      {entry.game.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="stats-filter">
                <span>Source</span>
                <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                  <option value="all">All sources</option>
                  <option value="launcher">Launched by Orca</option>
                  <option value="external">Auto-tracked</option>
                </select>
              </label>
              <label className="stats-filter">
                <span>Ended</span>
                <select value={endFilter} onChange={(event) => setEndFilter(event.target.value)}>
                  <option value="all">Any ending</option>
                  <option value="exited">Exited</option>
                  <option value="stopped">Stopped from Orca</option>
                  <option value="recovered">Recovered</option>
                </select>
              </label>
            </div>

            <div className="stats-history__summary">
              <History size={14} />
              <span>
                {filtered.length} {filtered.length === 1 ? 'session' : 'sessions'}
                {filtered.length > 0 ? ` · ${formatDuration(filteredTotalMs, { compact: true })} total` : ''}
                {filtered.length > 0
                  ? ` · ${formatDuration(filteredTotalMs / filtered.length, { compact: true })} average`
                  : ''}
              </span>
              {filtersActive && (
                <button className="text-button text-button--small" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>

            {filtered.length > 0 ? (
              <>
                <div className="stats-history__head" aria-hidden="true">
                  <span>Game</span>
                  <span>Started</span>
                  <span>Duration</span>
                  <span>Source</span>
                  <span>Ended</span>
                  <span>Process</span>
                </div>
                <div className="stats-history__list">
                  {visibleSessions.map((session) => {
                    const game = gameById.get(session.gameId)
                    return (
                      <div className="stats-session-row" key={session.id}>
                        <span className="stats-session-row__game">
                          <span className="stats-session-row__cover">
                            {game ? <CoverArtwork game={game} /> : <Gamepad2 size={15} />}
                          </span>
                          <span>
                            <strong>{game?.title ?? 'Unknown game'}</strong>
                            <small>{formatRelativeDate(session.startedAt)}</small>
                          </span>
                        </span>
                        <span className="stats-session-row__cell">
                          <strong>{formatDate(session.startedAt)}</strong>
                          <small>
                            {formatClock(session.startedAt)} – {formatClock(session.endedAt)}
                          </small>
                        </span>
                        <span className="stats-session-row__cell">
                          <strong>{formatDuration(session.durationMs, { includeSeconds: true })}</strong>
                          <small>{Math.max(1, Math.round(session.durationMs / 60_000))} min</small>
                        </span>
                        <span className="stats-session-row__cell">
                          <span className={`stats-badge stats-badge--${session.source}`}>
                            {session.source === 'external' ? 'Auto-tracked' : 'Orca'}
                          </span>
                        </span>
                        <span className="stats-session-row__cell">
                          <span className={`stats-badge stats-badge--${session.endReason}`}>
                            {END_REASON_LABELS[session.endReason]}
                          </span>
                        </span>
                        <span className="stats-session-row__cell stats-session-row__cell--process">
                          <strong>{session.processName ?? '—'}</strong>
                          <small>{game?.executablePath.split(/[\\/]/).pop() ?? ''}</small>
                        </span>
                      </div>
                    )
                  })}
                </div>
                {filtered.length > visibleCount && (
                  <button
                    className="button button--glass stats-history__more"
                    type="button"
                    onClick={() => setVisibleCount((count) => count + 30)}
                  >
                    Show {Math.min(30, filtered.length - visibleCount)} more
                  </button>
                )}
              </>
            ) : (
              <div className="stats-history__empty">
                <Search size={20} />
                <p>No sessions match those filters.</p>
                <button className="button button--glass button--small" type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
