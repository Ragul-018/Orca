import { Clock3, FolderSearch, HardDrive, ImagePlus, Plus } from 'lucide-react'
import { useOrcaStore } from '../store'
import { OrcaMark } from './Logo'

export function EmptyLibrary({ variant = 'home' }: { variant?: 'home' | 'library' }): React.JSX.Element {
  const openAddGame = useOrcaStore((state) => state.openAddGame)

  return (
    <section className={`empty-library empty-library--${variant}`}>
      <div className="empty-library__ambient">
        <span className="empty-library__ring empty-library__ring--one" />
        <span className="empty-library__ring empty-library__ring--two" />
        <span className="empty-library__ring empty-library__ring--three" />
        <span className="empty-library__mark">
          <OrcaMark size={variant === 'home' ? 280 : 180} />
        </span>
      </div>
      <div className="empty-library__content">
        <span className="eyebrow">
          <span className="eyebrow__line" />
          Your collection
        </span>
        <h1>
          Bring your games
          <br />
          into the deep.
        </h1>
        <p>
          One quiet place for every game you own. Add an executable, bring your own artwork, and Orca
          will keep the hours.
        </p>
        <div className="empty-library__actions">
          <button className="button button--primary button--large" type="button" onClick={() => openAddGame()}>
            <Plus size={17} />
            Add your first game
          </button>
          <button
            className="button button--glass button--large"
            type="button"
            onClick={() => openAddGame(undefined, true)}
          >
            <FolderSearch size={17} />
            Scan a folder
          </button>
        </div>
        <div className="empty-library__features">
          <span>
            <Clock3 size={14} /> Playtime, automatically
          </span>
          <span>
            <ImagePlus size={14} /> Your own artwork
          </span>
          <span>
            <HardDrive size={14} /> Local and private
          </span>
        </div>
      </div>
    </section>
  )
}
