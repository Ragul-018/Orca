/**
 * artwork-fetcher.ts — Multi-source artwork search:
 *  1. Steam Store search (Public, zero API key required, authentic vertical 600x900 & hero art).
 *  2. IGDB v4 (Twitch OAuth2 credentials for 1080p hero art, covers, genres, developer, summary).
 *  3. RAWG.io (Optional fallback if user provides API key).
 */

import { net } from 'electron'
import type { ArtworkCandidate, ArtworkSearchResult } from '@shared/types'

const STEAM_HEADER = (appId: number): string =>
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`
const STEAM_HERO = (appId: number): string =>
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_hero.jpg`
const STEAM_CAPSULE = (appId: number): string =>
  `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`

const RAWG_BASE = 'https://api.rawg.io/api'

// Cache Twitch OAuth token in memory
let igdbTokenCache: { token: string; expiresAt: number } | null = null

async function netFetchJson<T>(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = net.request({
      url,
      method: options.method || 'GET'
    })

    if (options.headers) {
      for (const [header, val] of Object.entries(options.headers)) {
        req.setHeader(header, val)
      }
    }

    const chunks: Buffer[] = []
    req.on('response', (res) => {
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8')
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`))
            return
          }
          resolve(JSON.parse(text) as T)
        } catch (e) {
          reject(new Error(`Invalid JSON response from ${url}: ${e instanceof Error ? e.message : String(e)}`))
        }
      })
      res.on('error', reject)
    })
    req.on('error', reject)

    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

async function netFetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, method: 'GET' })
    const chunks: Buffer[] = []
    req.on('response', (res) => {
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * Searches the public Steam Store API (zero API keys needed!).
 */
async function searchSteamStore(query: string): Promise<ArtworkCandidate[]> {
  try {
    const encoded = encodeURIComponent(query.trim())
    const url = `https://store.steampowered.com/api/storesearch/?term=${encoded}&l=english&cc=US`
    interface SteamSearchResponse {
      total: number
      items?: Array<{
        id: number
        name: string
        tiny_image?: string
      }>
    }
    const data = await netFetchJson<SteamSearchResponse>(url)
    const items = data.items ?? []
    const candidates: ArtworkCandidate[] = []
    const fetchDetails = async (appId: number) => {
      try {
        const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`
        interface SteamAppDetailsResponse {
          [key: string]: {
            success: boolean
            data?: {
              name?: string
              developers?: string[]
              publishers?: string[]
              short_description?: string
              release_date?: { date?: string }
              genres?: Array<{ id: string; description: string }>
              screenshots?: Array<{ path_full: string }>
            }
          }
        }
        const res = await netFetchJson<SteamAppDetailsResponse>(detailsUrl)
        return res[String(appId)]?.data
      } catch {
        return undefined
      }
    }

    const detailPromises = items.slice(0, 6).map((item) => fetchDetails(item.id))
    const detailsList = await Promise.all(detailPromises)

    for (let i = 0; i < Math.min(items.length, 6); i++) {
      const item = items[i]
      const appId = item.id
      const details = detailsList[i]
      const developer = details?.developers?.[0] ?? details?.publishers?.[0] ?? ''
      const yearMatch = details?.release_date?.date?.match(/\b(19\d\d|20\d\d)\b/)
      const releaseYear = yearMatch ? yearMatch[1] : ''
      const genres = details?.genres?.map((g) => g.description) ?? []
      const summary = details?.short_description ?? ''
      const screenshots = details?.screenshots?.map((s) => s.path_full).slice(0, 6) ?? [STEAM_HEADER(appId)]

      candidates.push({
        id: `steam-${appId}`,
        title: details?.name ?? item.name,
        developer,
        releaseYear,
        summary,
        genres,
        coverUrl: STEAM_CAPSULE(appId),
        heroUrl: STEAM_HERO(appId),
        screenshotUrls: screenshots,
        source: 'steam',
        steamAppId: appId
      })
    }
    return candidates
  } catch (err) {
    console.warn('[ArtworkFetcher] Steam search error:', err)
    return []
  }
}

/**
 * Gets or refreshes an IGDB App Access Token from Twitch OAuth2.
 */
async function getIgdbAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now()
  if (igdbTokenCache && igdbTokenCache.expiresAt > now + 60_000) {
    return igdbTokenCache.token
  }

  const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`
  interface TwitchTokenResponse {
    access_token: string
    expires_in: number
    token_type: string
  }
  const res = await netFetchJson<TwitchTokenResponse>(tokenUrl, { method: 'POST' })
  if (!res.access_token) {
    throw new Error('Failed to obtain Twitch access token for IGDB.')
  }
  igdbTokenCache = {
    token: res.access_token,
    expiresAt: now + (res.expires_in * 1000)
  }
  return res.access_token
}

/**
 * Searches IGDB v4 API.
 */
async function searchIgdb(query: string, clientId: string, clientSecret: string): Promise<ArtworkCandidate[]> {
  try {
    const token = await getIgdbAccessToken(clientId, clientSecret)
    const cleanQuery = query.replace(/["\\]/g, ' ').trim()
    const igdbUrl = 'https://api.igdb.com/v4/games'

    // Apicalypse query
    const body = `search "${cleanQuery}";
fields name, summary, storyline, first_release_date, cover.image_id, artworks.image_id, screenshots.image_id, involved_companies.company.name, involved_companies.developer, genres.name;
limit 8;`

    interface IgdbGame {
      id: number
      name: string
      summary?: string
      storyline?: string
      first_release_date?: number
      cover?: { id: number; image_id: string }
      artworks?: Array<{ id: number; image_id: string }>
      screenshots?: Array<{ id: number; image_id: string }>
      involved_companies?: Array<{
        company?: { name: string }
        developer?: boolean
      }>
      genres?: Array<{ id: number; name: string }>
    }

    const games = await netFetchJson<IgdbGame[]>(igdbUrl, {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body
    })

    const candidates: ArtworkCandidate[] = []

    for (const game of games) {
      const coverUrl = game.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${game.cover.image_id}.jpg`
        : null

      const heroImageId = game.artworks?.[0]?.image_id ?? game.screenshots?.[0]?.image_id
      const heroUrl = heroImageId
        ? `https://images.igdb.com/igdb/image/upload/t_1080p/${heroImageId}.jpg`
        : null

      const screenshotUrls = (game.screenshots ?? [])
        .map((s) => `https://images.igdb.com/igdb/image/upload/t_1080p/${s.image_id}.jpg`)
        .slice(0, 6)

      const devCompany = game.involved_companies?.find((c) => c.developer)?.company?.name
        ?? game.involved_companies?.[0]?.company?.name
        ?? ''

      const releaseYear = game.first_release_date
        ? String(new Date(game.first_release_date * 1000).getFullYear())
        : ''

      candidates.push({
        id: `igdb-${game.id}`,
        title: game.name,
        developer: devCompany,
        releaseYear,
        summary: game.summary || game.storyline || '',
        genres: game.genres?.map((g) => g.name) ?? [],
        coverUrl,
        heroUrl,
        screenshotUrls,
        source: 'igdb',
        steamAppId: null,
        igdbId: game.id
      })
    }

    return candidates
  } catch (err) {
    console.warn('[ArtworkFetcher] IGDB search error:', err)
    throw err
  }
}

/**
 * Searches RAWG.io API (fallback/legacy).
 */
async function searchRawg(query: string, rawgApiKey: string): Promise<ArtworkCandidate[]> {
  if (!rawgApiKey.trim()) return []
  try {
    const encoded = encodeURIComponent(query.trim())
    const url = `${RAWG_BASE}/games?search=${encoded}&key=${rawgApiKey.trim()}&page_size=8&search_exact=false`
    interface RawgGame {
      id: number
      slug: string
      name: string
      released: string | null
      background_image: string | null
      developers?: { name: string }[]
      stores?: { store: { name: string; slug: string }; url?: string }[]
      short_screenshots?: { id: number; image: string }[]
    }
    const data = await netFetchJson<{ results?: RawgGame[] }>(url)
    const results = data.results ?? []
    const candidates: ArtworkCandidate[] = []

    for (const game of results) {
      const storeEntry = game.stores?.find((s) => s.store.slug === 'steam' && s.url)
      const match = storeEntry?.url?.match(/\/app\/(\d+)/)
      const steamAppId = match ? Number(match[1]) : null

      const screenshots = (game.short_screenshots ?? [])
        .map((s) => s.image)
        .filter(Boolean)
        .slice(0, 6)

      candidates.push({
        id: `rawg-${game.id}`,
        title: game.name,
        developer: game.developers?.[0]?.name ?? '',
        releaseYear: game.released ? game.released.slice(0, 4) : '',
        coverUrl: steamAppId ? STEAM_CAPSULE(steamAppId) : game.background_image,
        heroUrl: steamAppId ? STEAM_HERO(steamAppId) : game.background_image,
        screenshotUrls: screenshots,
        source: 'rawg',
        steamAppId,
        rawgSlug: game.slug
      })
    }
    return candidates
  } catch (err) {
    console.warn('[ArtworkFetcher] RAWG search error:', err)
    return []
  }
}

export interface SearchArtworkOptions {
  igdbClientId?: string
  igdbClientSecret?: string
  rawgApiKey?: string
}

/**
 * Multi-provider artwork search:
 *  - Automatically queries Steam Store (zero setup, authentic covers/heroes)
 *  - If IGDB credentials are set, queries IGDB v4 (rich metadata & 1080p art)
 *  - If RAWG key is set, queries RAWG
 */
export async function searchArtwork(
  query: string,
  options?: SearchArtworkOptions | string
): Promise<ArtworkSearchResult> {
  const q = query.trim()
  if (!q) {
    return { query: q, candidates: [] }
  }

  // Handle options: could be a legacy rawgApiKey string or SearchArtworkOptions
  let igdbClientId = ''
  let igdbClientSecret = ''
  let rawgApiKey = ''

  if (typeof options === 'string') {
    rawgApiKey = options
  } else if (options) {
    igdbClientId = options.igdbClientId?.trim() ?? ''
    igdbClientSecret = options.igdbClientSecret?.trim() ?? ''
    rawgApiKey = options.rawgApiKey?.trim() ?? ''
  }

  const candidateList: ArtworkCandidate[] = []
  let errorNotice: string | undefined

  try {
    const tasks: Promise<ArtworkCandidate[]>[] = []

    // 1. If IGDB credentials provided, query IGDB
    if (igdbClientId && igdbClientSecret) {
      tasks.push(
        searchIgdb(q, igdbClientId, igdbClientSecret).catch((err) => {
          errorNotice = `IGDB: ${err instanceof Error ? err.message : String(err)}`
          return []
        })
      )
    }

    // 2. Query Steam Store search (always available, no auth required)
    tasks.push(searchSteamStore(q))

    // 3. If RAWG key provided and no IGDB, also query RAWG
    if (rawgApiKey && !igdbClientId) {
      tasks.push(searchRawg(q, rawgApiKey))
    }

    const results = await Promise.all(tasks)
    for (const group of results) {
      for (const item of group) {
        // Simple deduplication by title similarity
        const duplicate = candidateList.some(
          (c) => c.title.toLowerCase() === item.title.toLowerCase() && c.source === item.source
        )
        if (!duplicate) {
          candidateList.push(item)
        }
      }
    }

    return {
      query: q,
      candidates: candidateList,
      error: candidateList.length === 0 ? errorNotice : undefined
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { query: q, candidates: [], error: `Artwork search failed: ${message}` }
  }
}

export async function downloadImageBuffer(url: string): Promise<{ buffer: Buffer; ext: string }> {
  const buffer = await netFetchBuffer(url)
  const lower = url.toLowerCase().split('?')[0]
  let ext = 'jpg'
  if (lower.endsWith('.png')) ext = 'png'
  else if (lower.endsWith('.webp')) ext = 'webp'
  else if (lower.endsWith('.gif')) ext = 'gif'
  return { buffer, ext }
}
