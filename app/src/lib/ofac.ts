// OFAC SDN (Specially Designated Nationals) screening. Downloads the official
// US Treasury list + aliases, indexes them in memory (lazy, refreshed daily),
// and fuzzy-matches a query name. Free, no key.

const SDN_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.CSV'
const ALT_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ALT.CSV'
const ADD_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/ADD.CSV'
const TTL_MS = 24 * 60 * 60 * 1000

type Entity = { entNum: string; name: string; type: string; programs: string[]; title: string; remarks: string; aliases: string[]; addresses: string[] }
type IndexEntry = { entNum: string; nameVariant: string; tokens: Set<string> }

type State = { entities: Map<string, Entity>; index: IndexEntry[]; loadedAt: number; loading: Promise<void> | null }
const g = globalThis as unknown as { __ofac?: State }
const state: State = g.__ofac ?? (g.__ofac = { entities: new Map(), index: [], loadedAt: 0, loading: null })

export type SanctionMatch = {
  name: string; type: string; programs: string[]; matchedAs: string; score: number
  title?: string; remarks?: string; aliases?: string[]; addresses?: string[]
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}
function tokenize(s: string): string[] {
  return normalize(s).split(' ').filter((t) => t.length > 1)
}

function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inq = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inq) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else inq = false }
      else cur += ch
    } else if (ch === '"') inq = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
const clean = (f: string | undefined) => { const v = (f ?? '').trim(); return v === '-0-' ? '' : v }

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'OSINTSuite/1.2', accept: 'text/csv' }, signal: AbortSignal.timeout(30000) })
  if (!res.ok) throw new Error(`OFAC ${url} -> ${res.status}`)
  return res.text()
}

async function load(): Promise<void> {
  const [sdn, alt, add] = await Promise.all([fetchCsv(SDN_URL), fetchCsv(ALT_URL), fetchCsv(ADD_URL).catch(() => '')])

  const entities = new Map<string, Entity>()
  const index: IndexEntry[] = []

  for (const line of sdn.split('\n')) {
    const f = parseCsvLine(line)
    const entNum = (f[0] ?? '').trim()
    if (!/^\d+$/.test(entNum)) continue // skip headers / quoted-field continuations
    const name = clean(f[1])
    if (!name) continue
    const programs = clean(f[3]).split('] [').map((p) => p.replace(/[[\]]/g, '').trim()).filter(Boolean)
    const ent: Entity = { entNum, name, type: clean(f[2]) || 'Entity', programs, title: clean(f[4]), remarks: clean(f[11]), aliases: [], addresses: [] }
    entities.set(entNum, ent)
    index.push({ entNum, nameVariant: name, tokens: new Set(tokenize(name)) })
  }

  for (const line of alt.split('\n')) {
    const f = parseCsvLine(line)
    const entNum = (f[0] ?? '').trim()
    const ent = entities.get(entNum)
    if (!/^\d+$/.test(entNum) || !ent) continue
    const altName = clean(f[3])
    if (altName) { index.push({ entNum, nameVariant: altName, tokens: new Set(tokenize(altName)) }); ent.aliases.push(altName) }
  }

  for (const line of add.split('\n')) {
    const f = parseCsvLine(line)
    const entNum = (f[0] ?? '').trim()
    const ent = entities.get(entNum)
    if (!/^\d+$/.test(entNum) || !ent) continue
    const addr = [clean(f[2]), clean(f[3]), clean(f[4])].filter(Boolean).join(', ')
    if (addr) ent.addresses.push(addr)
  }

  state.entities = entities
  state.index = index
  state.loadedAt = Date.now()
}

async function ensureLoaded(): Promise<void> {
  if (state.entities.size && Date.now() - state.loadedAt < TTL_MS) return
  if (!state.loading) state.loading = load().finally(() => { state.loading = null })
  await state.loading
}

export async function screen(query: string): Promise<{ count: number; total: number; matches: SanctionMatch[] }> {
  await ensureLoaded()
  const q = tokenize(query)
  if (!q.length) return { count: 0, total: state.entities.size, matches: [] }

  // best match per entity: require most query tokens present in a name variant
  const best = new Map<string, { score: number; precision: number; matchedAs: string }>()
  for (const e of state.index) {
    let inter = 0
    for (const t of q) if (e.tokens.has(t)) inter++
    const coverage = inter / q.length
    if (coverage < 0.8) continue
    const precision = inter / e.tokens.size
    const cur = best.get(e.entNum)
    if (!cur || coverage > cur.score || (coverage === cur.score && precision > cur.precision)) {
      best.set(e.entNum, { score: coverage, precision, matchedAs: e.nameVariant })
    }
  }

  const matches: SanctionMatch[] = [...best.entries()]
    .map(([entNum, m]) => ({ ent: state.entities.get(entNum)!, score: m.score, precision: m.precision, matchedAs: m.matchedAs }))
    .sort((a, b) => b.score - a.score || b.precision - a.precision)
    .slice(0, 25)
    .map(({ ent, score, matchedAs }) => ({
      name: ent.name,
      type: ent.type,
      programs: ent.programs,
      matchedAs,
      score: Math.round(score * 100) / 100,
      title: ent.title || undefined,
      remarks: ent.remarks || undefined,
      aliases: ent.aliases.length ? ent.aliases.slice(0, 20) : undefined,
      addresses: ent.addresses.length ? ent.addresses.slice(0, 10) : undefined,
    }))

  return { count: best.size, total: state.entities.size, matches }
}
