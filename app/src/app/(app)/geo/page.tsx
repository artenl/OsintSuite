'use client'

import { useState } from 'react'
import { MapPin, Search, Loader2, Sparkles, Play, ExternalLink, Crosshair, Image as ImageIcon } from 'lucide-react'

type Center = { lat: number; lon: number; label?: string }
type PlaceResult = { displayName: string; lat: number; lon: number; type?: string }
type Feature = { type: string; id: number; lat: number; lon: number; name: string | null; label: string; tags: Record<string, string> }

const EXAMPLES = [
  'surveillance cameras within 300m',
  'ATMs within 500m',
  'places of worship within 1km',
  'fuel stations within 2km',
  'hospitals and clinics within 1km',
  'cafes and restaurants within 200m',
]

export default function GeoPage() {
  // Location reference
  const [placeQuery, setPlaceQuery] = useState('')
  const [coordsInput, setCoordsInput] = useState('')
  const [places, setPlaces] = useState<PlaceResult[]>([])
  const [placeLoading, setPlaceLoading] = useState(false)
  const [placeError, setPlaceError] = useState('')
  const [center, setCenter] = useState<Center | null>(null)

  // EXIF photo → GPS
  const [exif, setExif] = useState<Record<string, string> | null>(null)
  const [exifLoading, setExifLoading] = useState(false)
  const [exifError, setExifError] = useState('')

  // AI query builder
  const [prompt, setPrompt] = useState('')
  const [ql, setQl] = useState('')
  const [note, setNote] = useState('')
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState('')

  // Runner
  const [features, setFeatures] = useState<Feature[] | null>(null)
  const [runLoading, setRunLoading] = useState(false)
  const [runError, setRunError] = useState('')
  const [truncated, setTruncated] = useState(false)

  async function findPlace() {
    if (!placeQuery.trim()) return
    setPlaceLoading(true); setPlaceError(''); setPlaces([])
    try {
      const res = await fetch('/api/geo/geocode', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: placeQuery.trim() }),
      })
      const d = await res.json()
      if (!res.ok) setPlaceError(d.error || 'Lookup failed')
      else setPlaces(d.results || [])
    } catch (err) { setPlaceError(String(err)) } finally { setPlaceLoading(false) }
  }

  function onExifFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExifLoading(true); setExifError(''); setExif(null)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await fetch('/api/tools/exif', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl: reader.result }),
        })
        const d = await res.json()
        if (!res.ok) setExifError(d.error || 'EXIF extraction failed')
        else setExif(d)
      } catch (err) { setExifError(String(err)) } finally { setExifLoading(false) }
    }
    reader.onerror = () => { setExifError('Could not read file'); setExifLoading(false) }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function useCoordsInput() {
    const m = coordsInput.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
    if (!m) { setPlaceError('Enter coordinates like  48.8584, 2.2945'); return }
    setPlaceError('')
    setCenter({ lat: Number(m[1]), lon: Number(m[2]), label: 'manual coordinates' })
    setPlaces([])
  }

  async function generate() {
    if (!prompt.trim()) return
    setGenLoading(true); setGenError(''); setNote('')
    try {
      const res = await fetch('/api/geo/overpass-query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), center: center ? { lat: center.lat, lon: center.lon } : undefined }),
      })
      const d = await res.json()
      if (!res.ok) setGenError(d.error || 'Generation failed')
      else { setQl(d.query || ''); setNote(d.note || ''); setFeatures(null) }
    } catch (err) { setGenError(String(err)) } finally { setGenLoading(false) }
  }

  async function run() {
    if (!ql.trim()) return
    setRunLoading(true); setRunError(''); setFeatures(null)
    try {
      const res = await fetch('/api/geo/overpass', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: ql }),
      })
      const d = await res.json()
      if (!res.ok) setRunError(d.error || 'Query failed')
      else { setFeatures(d.features || []); setTruncated(!!d.truncated) }
    } catch (err) { setRunError(String(err)) } finally { setRunLoading(false) }
  }

  const turboUrl = ql.trim() ? `https://overpass-turbo.eu/?Q=${encodeURIComponent(ql)}` : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <MapPin size={22} style={{ color: 'var(--color-cyan)' }} /> Geospatial / OSM
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
          OpenStreetMap intelligence · place lookup · AI Overpass query builder · map features
        </p>
      </div>

      {/* 1. Location reference */}
      <Section step="1" title="Location reference">
        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }} />
            <input value={placeQuery} onChange={(e) => setPlaceQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && findPlace()}
              placeholder="Place name — e.g. Gare de Lyon, Paris"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </div>
          <button onClick={findPlace} disabled={placeLoading || !placeQuery.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'rgba(51,255,153,0.15)', border: '1px solid rgba(51,255,153,0.4)', color: 'var(--color-cyan)', cursor: placeLoading || !placeQuery.trim() ? 'not-allowed' : 'pointer', opacity: placeLoading || !placeQuery.trim() ? 0.6 : 1 }}>
            {placeLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Find
          </button>
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Crosshair size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }} />
            <input value={coordsInput} onChange={(e) => setCoordsInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && useCoordsInput()}
              placeholder="…or paste coordinates — 48.8584, 2.2945"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none font-mono"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
          </div>
          <button onClick={useCoordsInput} disabled={!coordsInput.trim()}
            className="px-4 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: coordsInput.trim() ? 'pointer' : 'not-allowed', opacity: coordsInput.trim() ? 1 : 0.6 }}>
            Use
          </button>
        </div>

        {placeError && <p className="text-xs mt-2" style={{ color: 'var(--color-red)' }}>{placeError}</p>}

        {places.length > 0 && (
          <div className="mt-3 space-y-1">
            {places.map((p, i) => (
              <button key={i} onClick={() => { setCenter({ lat: p.lat, lon: p.lon, label: p.displayName }); setPlaces([]) }}
                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', cursor: 'pointer' }}>
                <MapPin size={12} style={{ color: 'var(--color-cyan)', flexShrink: 0 }} />
                <span className="flex-1 truncate">{p.displayName}</span>
                <span className="font-mono" style={{ color: 'var(--color-muted)' }}>{p.lat.toFixed(4)}, {p.lon.toFixed(4)}</span>
              </button>
            ))}
          </div>
        )}

        {center && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(51,255,153,0.08)', border: '1px solid rgba(51,255,153,0.25)' }}>
            <Crosshair size={13} style={{ color: 'var(--color-cyan)' }} />
            <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text)' }}>{center.label}</span>
            <span className="text-xs font-mono" style={{ color: 'var(--color-cyan)' }}>{center.lat.toFixed(5)}, {center.lon.toFixed(5)}</span>
            <button onClick={() => setCenter(null)} className="text-xs" style={{ color: 'var(--color-muted)', cursor: 'pointer' }}>clear</button>
          </div>
        )}

        {/* Photo GPS extraction */}
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium cursor-pointer"
            style={{ background: 'rgba(255,180,84,0.1)', border: '1px solid rgba(255,180,84,0.25)', color: 'var(--color-purple)' }}>
            {exifLoading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
            Extract GPS from a photo
            <input type="file" accept="image/*" onChange={onExifFile} style={{ display: 'none' }} />
          </label>
          <span className="text-xs ml-2" style={{ color: 'var(--color-muted)' }}>parsed locally — never leaves your server</span>

          {exifError && <p className="text-xs mt-2" style={{ color: 'var(--color-red)' }}>{exifError}</p>}

          {exif && (
            <div className="mt-2 rounded-lg p-3 space-y-1" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>
              {Object.entries(exif).filter(([k]) => !k.startsWith('_')).map(([k, v]) => (
                <div key={k} className="flex gap-3 text-xs">
                  <span className="font-mono w-28 flex-shrink-0" style={{ color: 'var(--color-muted)' }}>{k}</span>
                  {/^https?:\/\//.test(v)
                    ? <a href={v} target="_blank" rel="noopener noreferrer" className="font-mono flex-1 break-all" style={{ color: 'var(--color-cyan)' }}>{v}</a>
                    : <span className="font-mono flex-1 break-all" style={{ color: 'var(--color-text)' }}>{v}</span>}
                </div>
              ))}
              {exif._lat && exif._lon && (
                <button onClick={() => setCenter({ lat: Number(exif._lat), lon: Number(exif._lon), label: 'photo GPS' })}
                  className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(51,255,153,0.15)', border: '1px solid rgba(51,255,153,0.4)', color: 'var(--color-cyan)', cursor: 'pointer' }}>
                  <Crosshair size={12} /> Use these coordinates as reference
                </button>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* 2. AI query builder */}
      <Section step="2" title="Build query (AI)">
        <div className="flex flex-wrap gap-2 mb-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setPrompt(ex)}
              className="px-2.5 py-1 rounded-lg text-xs"
              style={{ background: 'rgba(255,180,84,0.1)', border: '1px solid rgba(255,180,84,0.25)', color: 'var(--color-purple)', cursor: 'pointer' }}>
              {ex}
            </button>
          ))}
        </div>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder={center ? 'Describe what to find near your reference point…' : 'Describe what to find (include a place or coords, or set a reference point above)…'}
          rows={2}
          className="w-full px-3 py-2.5 rounded-lg text-sm outline-none resize-y"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        <button onClick={generate} disabled={genLoading || !prompt.trim()}
          className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'rgba(51,255,153,0.15)', border: '1px solid rgba(51,255,153,0.4)', color: 'var(--color-cyan)', cursor: genLoading || !prompt.trim() ? 'not-allowed' : 'pointer', opacity: genLoading || !prompt.trim() ? 0.6 : 1 }}>
          {genLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Generate Overpass query
        </button>
        {genError && <p className="text-xs mt-2" style={{ color: 'var(--color-red)' }}>{genError}</p>}

        {(ql || note) && (
          <div className="mt-3">
            {note && <p className="text-xs mb-1" style={{ color: 'var(--color-muted)' }}>{note}</p>}
            <textarea value={ql} onChange={(e) => setQl(e.target.value)} rows={6} spellCheck={false}
              className="w-full px-3 py-2.5 rounded-lg text-xs outline-none font-mono resize-y"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-cyan)' }} />
          </div>
        )}
      </Section>

      {/* 3. Run */}
      {ql.trim() && (
        <Section step="3" title="Run">
          <div className="flex gap-2 flex-wrap">
            <button onClick={run} disabled={runLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'rgba(51,255,153,0.15)', border: '1px solid rgba(51,255,153,0.4)', color: 'var(--color-cyan)', cursor: runLoading ? 'not-allowed' : 'pointer', opacity: runLoading ? 0.6 : 1 }}>
              {runLoading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run query
            </button>
            {turboUrl && (
              <a href={turboUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)', textDecoration: 'none' }}>
                <ExternalLink size={14} /> Open map in overpass-turbo
              </a>
            )}
          </div>
          {runError && <p className="text-sm mt-2" style={{ color: 'var(--color-red)' }}>{runError}</p>}

          {features && (
            <div className="mt-3">
              <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>
                {features.length} feature{features.length !== 1 ? 's' : ''}{truncated ? ' (showing first 300)' : ''}
              </p>
              <div className="space-y-1.5">
                {features.map((f) => (
                  <div key={`${f.type}/${f.id}`} className="flex items-center gap-3 px-3 py-2 rounded-lg flex-wrap" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{f.name || <span style={{ color: 'var(--color-muted)' }}>unnamed</span>}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(51,255,153,0.08)', color: 'var(--color-cyan)' }}>{f.label}</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>{f.lat.toFixed(5)}, {f.lon.toFixed(5)}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <a href={`https://www.openstreetmap.org/?mlat=${f.lat}&mlon=${f.lon}#map=19/${f.lat}/${f.lon}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs" style={{ color: 'var(--color-cyan)' }}>OSM</a>
                      <a href={`https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lon}`} target="_blank" rel="noopener noreferrer"
                        className="text-xs" style={{ color: 'var(--color-cyan)' }}>Maps</a>
                    </div>
                  </div>
                ))}
                {features.length === 0 && <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No features found for this query.</p>}
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

function Section({ step, title, children }: { step: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: 'rgba(51,255,153,0.15)', color: 'var(--color-cyan)' }}>{step}</span>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}
