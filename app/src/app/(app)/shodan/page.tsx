'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Radar, Search, Loader2, RefreshCw, ShieldCheck, AlertTriangle, Lock,
  Wifi, WifiOff, Camera, ExternalLink,
} from 'lucide-react'

type Tab = 'cameras' | 'search' | 'verify'

type CameraEntry = { rank: number; product: string; count: number }
type SearchMatch = {
  ip: string; port: number; transport?: string; product?: string | null; org?: string | null
  country?: string | null; city?: string | null; title?: string | null; banner?: string | null
}
type Facet = { value: string; count: number }
type VerifyResult = {
  Target: string; Verdict: string; Probes: string; Fingerprints?: string
  _verdict: 'open' | 'protected' | 'reachable' | 'unreachable'
}

// Curated camera search presets (product strings verified against Shodan facets).
const CAMERA_PRESETS: { label: string; query: string }[] = [
  { label: 'All IP cameras', query: 'device:webcam' },
  { label: 'TRENDnet', query: 'product:"TRENDnet TV-IP110W webcam display httpd"' },
  { label: 'GeoVision', query: 'product:"GeoVision GeoHttpServer for webcams"' },
  { label: 'Avtech', query: 'product:"Avtech AVN801 network camera"' },
  { label: 'Netwave', query: 'product:"Netwave IP camera http config"' },
  { label: 'Hikvision', query: 'product:"Hikvision IP Camera"' },
  { label: 'Dahua', query: 'product:"Dahua"' },
  { label: 'Axis', query: 'product:"Axis"' },
  { label: 'D-Link', query: 'product:"D-Link/Airlink IP webcam http config"' },
  { label: 'Yawcam', query: 'product:"Yawcam webcam viewer httpd"' },
  { label: 'Webcam 7', query: 'product:"webcam 7 httpd"' },
  { label: 'MJPG streamers', query: 'product:"MJPG-streamer"' },
]

export default function ShodanPage() {
  const [tab, setTab] = useState<Tab>('cameras')
  const [role, setRole] = useState<string>('user')
  const [searchQuery, setSearchQuery] = useState('')
  const [runSignal, setRunSignal] = useState(0)

  // Called by suggestions / catalog rows: load a query into the Search tab and run it.
  const runSearch = useCallback((q: string) => {
    setSearchQuery(q)
    setRunSignal((s) => s + 1)
    setTab('search')
  }, [])

  useEffect(() => {
    fetch('/api/auth/me').then((r) => r.ok && r.json()).then((d) => d && setRole(d.role)).catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <Radar size={22} style={{ color: 'var(--color-cyan)' }} /> Shodan
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
          Device exposure intelligence · search · top devices · exposure verification
        </p>
      </div>

      {/* Scope / legal banner */}
      <div className="rounded-xl p-4 flex gap-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
        <AlertTriangle size={18} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text)' }}>
          For security research and checking <strong>your own</strong> or <strong>authorized</strong> devices.
          This page reports exposure metadata only — it does <strong>not</strong> open camera feeds or send credentials.
          Accessing devices you don&apos;t own or aren&apos;t authorized to test is illegal in most jurisdictions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {[
          { id: 'cameras', label: 'Top Cameras', icon: Camera },
          { id: 'search', label: 'Device Search', icon: Search },
          { id: 'verify', label: 'Exposure Check', icon: ShieldCheck },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as Tab)}
            className="px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all"
            style={{
              background: tab === t.id ? 'rgba(0,212,255,0.1)' : 'transparent',
              color: tab === t.id ? 'var(--color-cyan)' : 'var(--color-muted)',
              border: tab === t.id ? '1px solid rgba(0,212,255,0.2)' : '1px solid transparent',
            }}>
            <t.icon size={14} />{t.label}
          </button>
        ))}
      </div>

      {tab === 'cameras' && <CamerasTab role={role} onSearch={runSearch} />}
      {tab === 'search' && <SearchTab query={searchQuery} setQuery={setSearchQuery} runSignal={runSignal} />}
      {tab === 'verify' && <VerifyTab />}
    </div>
  )
}

function CamerasTab({ role, onSearch }: { role: string; onSearch: (q: string) => void }) {
  const [cameras, setCameras] = useState<CameraEntry[]>([])
  const [query, setQuery] = useState('device:webcam')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shodan/cameras')
      const d = await res.json()
      setCameras(d.cameras || [])
      setUpdatedAt(d.updatedAt ? new Date(d.updatedAt).toLocaleString() : null)
      if (d.query) setQuery(d.query)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function refresh() {
    setRefreshing(true); setError('')
    try {
      const res = await fetch('/api/shodan/cameras', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const d = await res.json()
      if (!res.ok) setError(d.error || 'Refresh failed')
      else { setCameras(d.cameras || []); setUpdatedAt(d.updatedAt ? new Date(d.updatedAt).toLocaleString() : null) }
    } finally { setRefreshing(false) }
  }

  const max = cameras[0]?.count || 1

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        The 50 most common internet-facing device products, ranked by how many Shodan has indexed.
        Counts are global exposure metadata — no device addresses or feeds.
      </p>

      {role === 'admin' && (
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Shodan query (e.g. device:webcam)"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: 'var(--color-cyan)', cursor: refreshing ? 'not-allowed' : 'pointer' }}>
            {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Refresh
          </button>
        </div>
      )}
      {error && <p className="text-xs" style={{ color: 'var(--color-red)' }}>{error}</p>}
      {updatedAt && <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Updated {updatedAt}</p>}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-muted)' }} /></div>
      ) : cameras.length === 0 ? (
        <div className="rounded-xl p-6 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            No catalog yet.{role === 'admin' ? ' Hit Refresh to pull it from Shodan.' : ' An admin needs to populate it.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          {cameras.map((c, i) => (
            <div key={c.rank} className="flex items-center gap-3 px-4 py-2.5" style={{ borderBottom: i < cameras.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <span className="text-xs font-mono w-6 flex-shrink-0" style={{ color: 'var(--color-muted)' }}>#{c.rank}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{c.product}</p>
                <div className="h-1 rounded-full mt-1" style={{ background: 'var(--color-surface-2)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.max(3, (c.count / max) * 100)}%`, background: 'var(--color-cyan)' }} />
                </div>
              </div>
              <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--color-muted)' }}>{c.count.toLocaleString()}</span>
              <button onClick={() => onSearch(`product:"${c.product}"`)} title="Search exposed instances"
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs flex-shrink-0"
                style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: 'var(--color-cyan)', cursor: 'pointer' }}>
                <Search size={11} /> Search
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SearchTab({ query, setQuery, runSignal }: { query: string; setQuery: (v: string) => void; runSignal: number }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [facets, setFacets] = useState<Record<string, Facet[]>>({})
  const [total, setTotal] = useState(0)
  const [country, setCountry] = useState('')
  const [port, setPort] = useState('')
  const [org, setOrg] = useState('')

  const run = useCallback(async (qOverride?: string) => {
    const q = (qOverride ?? query).trim()
    if (!q) return
    setQuery(q)
    setLoading(true); setError(''); setMatches([]); setFacets({})
    try {
      const res = await fetch('/api/shodan/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })
      const d = await res.json()
      if (!res.ok) setError(d.error || 'Search failed')
      else { setMatches(d.matches || []); setFacets(d.facets || {}); setTotal(d.total || 0) }
    } catch (err) { setError(String(err)) } finally { setLoading(false) }
  }, [query, setQuery])

  // Run automatically when a suggestion / catalog row triggers a search.
  useEffect(() => {
    if (runSignal > 0 && query.trim()) run(query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSignal])

  // Merge the active filters into a base query, replacing any existing token for
  // the same key (so re-applying a different country swaps it rather than stacking).
  const buildQuery = useCallback((base: string) => {
    let q = base
    const apply = (key: string, raw: string) => {
      q = q.replace(new RegExp(`\\s*${key}:(?:"[^"]*"|\\S+)`, 'gi'), '').trim()
      const val = raw.trim()
      if (val) { const v = /\s/.test(val) ? `"${val}"` : val; q = `${q} ${key}:${v}`.trim() }
    }
    apply('country', country.trim().toUpperCase())
    apply('port', port.trim())
    apply('org', org.trim())
    return q.trim()
  }, [country, port, org])

  const hasFilters = !!(country.trim() || port.trim() || org.trim())

  return (
    <div className="space-y-4">
      {/* Suggested camera searches */}
      <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-muted)' }}>Suggested camera searches</p>
        <div className="flex flex-wrap gap-2">
          {CAMERA_PRESETS.map((p) => (
            <button key={p.label} onClick={() => run(buildQuery(p.query))}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', color: 'var(--color-purple)', cursor: 'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Refinement filters — applied to a preset on click, or to the current query via Apply */}
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>Refine</p>
          <div className="flex flex-wrap items-center gap-2">
            <FilterInput label="Country" value={country} onChange={(v) => setCountry(v.replace(/[^a-zA-Z]/g, '').slice(0, 2))} placeholder="FR" width="w-16" mono upper onEnter={() => run(buildQuery(query))} />
            <FilterInput label="Port" value={port} onChange={(v) => setPort(v.replace(/\D/g, '').slice(0, 5))} placeholder="80" width="w-20" mono onEnter={() => run(buildQuery(query))} />
            <FilterInput label="Org" value={org} onChange={setOrg} placeholder="Orange, OVH…" width="w-40" onEnter={() => run(buildQuery(query))} />
            <button onClick={() => run(buildQuery(query))} disabled={!query.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', color: 'var(--color-cyan)', cursor: query.trim() ? 'pointer' : 'not-allowed', opacity: query.trim() ? 1 : 0.5 }}>
              Apply to current search
            </button>
            {hasFilters && (
              <button onClick={() => { setCountry(''); setPort(''); setOrg('') }}
                className="text-xs" style={{ color: 'var(--color-muted)', cursor: 'pointer' }}>clear filters</button>
            )}
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--color-muted)' }}>
            Set filters, then click a model above (applies instantly) or <strong>Apply to current search</strong>. Then use <strong>Verify exposure</strong> on each result before contacting owners.
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder='e.g.  product:"Hikvision IP Camera" country:FR'
          className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        <button onClick={() => run()} disabled={loading || !query.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.4)', color: 'var(--color-cyan)', cursor: loading || !query.trim() ? 'not-allowed' : 'pointer', opacity: loading || !query.trim() ? 0.6 : 1 }}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Search
        </button>
      </div>

      {error && <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>}

      {total > 0 && (
        <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{total.toLocaleString()} total results · showing {matches.length}</p>
      )}

      {Object.keys(facets).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(facets).map(([name, items]) => (
            <div key={name} className="rounded-lg p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>{name}</p>
              {items.slice(0, 5).map((f) => (
                <div key={f.value} className="flex justify-between text-xs py-0.5">
                  <span className="truncate mr-2" style={{ color: 'var(--color-text)' }}>{f.value}</span>
                  <span className="font-mono flex-shrink-0" style={{ color: 'var(--color-muted)' }}>{f.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {matches.map((m, i) => <MatchRow key={`${m.ip}:${m.port}:${i}`} m={m} />)}
      </div>
    </div>
  )
}

function MatchRow({ m }: { m: SearchMatch }) {
  const [verify, setVerify] = useState<VerifyResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function check() {
    setLoading(true)
    try {
      const res = await fetch('/api/tools/exposure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: m.ip, port: m.port }),
      })
      setVerify(await res.json())
    } finally { setLoading(false) }
  }

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-3 flex-wrap">
        <a href={`https://www.shodan.io/host/${m.ip}`} target="_blank" rel="noopener noreferrer"
          title="View full host details on Shodan"
          className="text-sm font-mono font-semibold inline-flex items-center gap-1" style={{ color: 'var(--color-cyan)' }}>
          {m.ip}:{m.port} <ExternalLink size={11} />
        </a>
        {m.product && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,212,255,0.08)', color: 'var(--color-cyan)' }}>{m.product}</span>}
        {m.country && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{m.city ? `${m.city}, ` : ''}{m.country}</span>}
        <button onClick={check} disabled={loading}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
          style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', color: 'var(--color-purple)', cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? <Loader2 size={11} className="animate-spin" /> : <ShieldCheck size={11} />} Verify exposure
        </button>
      </div>
      {m.title && <p className="text-xs mt-1 truncate" style={{ color: 'var(--color-muted)' }}>{m.title}</p>}
      {m.org && <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{m.org}</p>}
      {verify && <VerdictBox v={verify} />}
    </div>
  )
}

function VerifyTab() {
  const [ip, setIp] = useState('')
  const [port, setPort] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<VerifyResult | null>(null)

  async function run() {
    if (!ip.trim()) return
    setLoading(true); setError(''); setResult(null)
    try {
      const res = await fetch('/api/tools/exposure', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: ip.trim(), port: port ? Number(port) : undefined }),
      })
      const d = await res.json()
      if (!res.ok) setError(d.error || 'Check failed')
      else setResult(d)
    } catch (err) { setError(String(err)) } finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
        Confirms whether a device is actually reachable and whether it demands a password.
        Reads HTTP response headers only — no feed is opened.
      </p>
      <div className="flex gap-2">
        <input value={ip} onChange={(e) => setIp(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="IP address" className="flex-1 px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="port (optional)" className="w-32 px-3 py-2.5 rounded-lg text-sm outline-none font-mono"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        <button onClick={run} disabled={loading || !ip.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.4)', color: 'var(--color-cyan)', cursor: loading || !ip.trim() ? 'not-allowed' : 'pointer', opacity: loading || !ip.trim() ? 0.6 : 1 }}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Check
        </button>
      </div>
      {error && <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>}
      {result && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm font-mono font-semibold mb-2" style={{ color: 'var(--color-text)' }}>{result.Target}</p>
          <VerdictBox v={result} />
        </div>
      )}
    </div>
  )
}

function FilterInput({ label, value, onChange, placeholder, width, mono, upper, onEnter }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string
  width: string; mono?: boolean; upper?: boolean; onEnter?: () => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        placeholder={placeholder}
        className={`${width} px-2 py-1 rounded-md text-xs outline-none ${mono ? 'font-mono' : ''} ${upper ? 'uppercase' : ''}`}
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
    </div>
  )
}

function VerdictBox({ v }: { v: VerifyResult }) {
  const style = {
    open: { color: 'var(--color-red)', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', Icon: AlertTriangle },
    protected: { color: 'var(--color-green)', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.3)', Icon: Lock },
    reachable: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', Icon: Wifi },
    unreachable: { color: 'var(--color-muted)', bg: 'rgba(255,255,255,0.03)', border: 'var(--color-border)', Icon: WifiOff },
  }[v._verdict]
  const Icon = style.Icon
  return (
    <div className="mt-2 rounded-lg p-3" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
      <div className="flex items-start gap-2">
        <Icon size={15} style={{ color: style.color, flexShrink: 0, marginTop: 1 }} />
        <p className="text-xs" style={{ color: style.color }}>{v.Verdict}</p>
      </div>
      {v.Probes && (
        <pre className="text-xs font-mono mt-2 whitespace-pre-wrap" style={{ color: 'var(--color-muted)' }}>{v.Probes}</pre>
      )}
      {v.Fingerprints && (
        <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>Fingerprints: {v.Fingerprints}</p>
      )}
    </div>
  )
}
