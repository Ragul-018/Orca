import { BarChart3, CalendarDays, Clock3, Timer, Trophy } from 'lucide-react'
import { formatDate, formatDuration, formatPlaytime } from '@shared/format'
import { useOrcaStore } from '../store'
import { WeekChart } from '../components/WeekChart'
import { CoverArtwork } from '../components/GameArtwork'
import { computeWeek } from '../lib/visual'

export function StatsPage(): React.JSX.Element {
  const snapshot = useOrcaStore((state) => state.snapshot)
  if (!snapshot) return <></>

  const sessions = snapshot.sessions
  const games = snapshot.games.filter((game) => !game.hidden)
  const totalMs = games.reduce((total, game) => total + game.playtimeMs, 0)
  const weekly = computeWeek(sessions, 7)
  const weekMs = weekly.reduce((total, day) => total + day.ms, 0)
  const playedGames = games.filter((game) => game.playtimeMs > 0)
  const topGames = [...playedGames].sort((a, b) => b.playtimeMs - a.playtimeMs).slice(0, 5)
  const longest = [...sessions].sort((a, b) => b.durationMs - a.durationMs)[0]
  const avgSession = sessions.length > 0 ? totalMs / sessions.length : 0
  const mostActiveDay = [...weekly].sort((a, b) => b.ms - a.ms)[0]
  const totalHours = totalMs / 3_600_000
  const heroValue =
    totalHours >= 1
      ? totalHours >= 10
        ? Math.round(totalHours)
        : totalHours.toFixed(1)
      : totalMs > 0 && totalMs < 60_000
        ? '<1'
        : Math.round(totalMs / 60_000)
  const heroUnit = totalHours >= 1 ? 'hours' : 'minutes'
  const recentSessions = sessions.slice(0, 8)
  const gameById = new Map(games.map((game) => [game.id, game]))

  return (
    <div className="page stats-page page-enter">
      <header className="page-header stats-header">
        <div>
          <span className="eyebrow">
            <span className="eyebrow__line" />
            The record
          </span>
          <h1>Playtime</h1>
          <p className="page-header__subtitle">The hours you have spent beneath the surface.</p>
        </div>
        <div className="stats-header__mark">
          <BarChart3 size={18} />
          <span>
            {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'} logged
          </span>
        </div>
      </header>

      {sessions.length === 0 ? (
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
                  {playedGames.length} {playedGames.length === 1 ? 'game' : 'games'} played
                </span>
                <span>{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</span>
              </div>
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
                <span className="stats-week__amount">{formatPlaytime(weekMs)}</span>
              </div>
              <WeekChart days={weekly} />
            </div>
          </section>

          <section className="stats-metrics">
            <div className="metric-card">
              <span className="metric-card__icon">
                <Timer size={17} />
              </span>
              <div>
                <span>Average session</span>
                <strong>{formatDuration(avgSession, { compact: true })}</strong>
              </div>
            </div>
            <div className="metric-card">
              <span className="metric-card__icon">
                <Trophy size={17} />
              </span>
              <div>
                <span>Longest session</span>
                <strong>{longest ? formatDuration(longest.durationMs, { compact: true }) : '—'}</strong>
              </div>
            </div>
            <div className="metric-card">
              <span className="metric-card__icon">
                <CalendarDays size={17} />
              </span>
              <div>
                <span>Most active day</span>
                <strong>{mostActiveDay && mostActiveDay.ms > 0 ? mostActiveDay.label : '—'}</strong>
              </div>
            </div>
          </section>

          <div className="stats-columns">
            <section className="panel top-games">
              <div className="panel__heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow__line" />
                    Most time
                  </span>
                  <h2>Games with gravity</h2>
                </div>
              </div>
              <div className="top-games__list">
                {topGames.map((game, index) => {
                  const max = topGames[0]?.playtimeMs || 1
                  return (
                    <div className="top-game" key={game.id}>
                      <span className="top-game__rank">{String(index + 1).padStart(2, '0')}</span>
                      <span className="top-game__cover">
                        <CoverArtwork game={game} />
                      </span>
                      <div className="top-game__info">
                        <div>
                          <strong>{game.title}</strong>
                          <span>{formatPlaytime(game.playtimeMs)}</span>
                        </div>
                        <span className="top-game__bar">
                          <span style={{ width: `${Math.max(4, (game.playtimeMs / max) * 100)}%` }} />
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="panel recent-sessions">
              <div className="panel__heading">
                <div>
                  <span className="eyebrow">
                    <span className="eyebrow__line" />
                    Logbook
                  </span>
                  <h2>Recent sessions</h2>
                </div>
                <Clock3 size={18} className="panel__icon" />
              </div>
              <div className="recent-sessions__list">
                {recentSessions.map((session) => {
                  const game = gameById.get(session.gameId)
                  if (!game) return null
                  return (
                    <div className="recent-session" key={session.id}>
                      <span className="recent-session__cover">
                        <CoverArtwork game={game} />
                      </span>
                      <div className="recent-session__info">
                        <strong>{game.title}</strong>
                        <span>{formatDate(session.startedAt)}</span>
                      </div>
                      <span className="recent-session__time">{formatDuration(session.durationMs, { compact: true })}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
