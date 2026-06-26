'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Radar as RadarIcon, Plane, Ship, Crosshair, Loader2, RefreshCw } from 'lucide-react'

type Aircraft = { hex: string; flight: string | null; type: string | null; lat: number; lon: number; alt: number | null; gs: number | null; track: number | null }
type Vessel = { mmsi: string; name: string | null; lat: number; lon: number; sog: number | null; cog: number | null }
type RadarData = { aircraft: Aircraft[]; vessels: Vessel[]; aisConfigured: boolean; aisConnected: boolean }

const SIZE = 400
const C = SIZE / 2
const R = 185

const PRESETS = [
  { label: 'Paris', lat: 48.8566, lon: 2.3522 },
  { label: 'London', lat: 51.5074, lon: -0.1278 },
  { label: 'New York', lat: 40.7128, lon: -74.006 },
  { label: 'Singapore', lat: 1.3521, lon: 103.8198 },
]

function toRad(d: number) { return (d * Math.PI) / 180 }
function distNm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const Rn = 3440.065
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * Rn * Math.asin(Math.sqrt(a))
}
function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return (Math.atan2(y, x) * 180) / Math.PI
}
// project a lat/lon to scope xy given center + range
function project(clat: number, clon: number, lat: number, lon: number, rangeNm: number) {
  const d = distNm(clat, clon, lat, lon)
  const b = bearing(clat, clon, lat, lon)
  const r = Math.min(d / rangeNm, 1) * R
  return { x: C + r * Math.sin(toRad(b)), y: C - r * Math.cos(toRad(b)), d }
}

export function Radar() {
  const [lat, setLat] = useState(48.8566)
  const [lon, setLon] = useState(2.3522)
  const [label, setLabel] = useState('Paris')
  const [dist, setDist] = useState(100)
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAir, setShowAir] = useState(true)
  const [showSea, setShowSea] = useState(true)
  const reqRef = useRef(0)

  const load = useCallback(async () => {
    const id = ++reqRef.current
    setLoading(true)
    try {
      const res = await fetch('/api/radar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lon, dist }),
      })
      const d = await res.json()
      if (id !== reqRef.current) return
      if (!res.ok) setError(d.error || 'Radar failed')
      else { setError(''); setData(d) }
    } catch (err) { if (id === reqRef.current) setError(String(err)) } finally { if (id === reqRef.current) setLoading(false) }
  }, [lat, lon, dist])

  useEffect(() => {
    load()
    const t = setInterval(load, 12000)
    return () => clearInterval(t)
  }, [load])

  function useMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(+p.coords.latitude.toFixed(4)); setLon(+p.coords.longitude.toFixed(4)); setLabel('my location') },
      () => setError('Location permission denied')
    )
  }

  const aircraft = (data?.aircraft ?? []).map((a) => ({ ...a, ...project(lat, lon, a.lat, a.lon, dist) })).filter((a) => a.d <= dist)
  const vessels = (data?.vessels ?? []).map((v) => ({ ...v, ...project(lat, lon, v.lat, v.lon, dist) })).filter((v) => v.d <= dist)
  const aircraftSorted = [...aircraft].sort((a, b) => a.d - b.d)
  const vesselsSorted = [...vessels].sort((a, b) => a.d - b.d)

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <RadarIcon size={15} style={{ color: 'var(--color-cyan)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Live Radar</span>
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{label} · {dist} nm</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1" style={{ color: showAir ? 'var(--color-cyan)' : 'var(--color-muted)', cursor: 'pointer' }} onClick={() => setShowAir((s) => !s)}>
            <Plane size={12} /> {aircraft.length}
          </span>
          <span className="flex items-center gap-1" style={{ color: showSea ? 'var(--color-purple)' : 'var(--color-muted)', cursor: 'pointer' }} onClick={() => setShowSea((s) => !s)}>
            <Ship size={12} /> {vessels.length}
          </span>
          {loading ? <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-muted)' }} /> : <RefreshCw size={12} style={{ color: 'var(--color-muted)', cursor: 'pointer' }} onClick={load} />}
        </div>
      </div>

      <div className="p-4 flex flex-col lg:flex-row gap-4">
        {/* scope */}
        <div className="flex-shrink-0 mx-auto">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width="100%" style={{ maxWidth: 380, display: 'block' }}>
            <defs>
              <radialGradient id="scopeGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgba(51,255,153,0.06)" />
                <stop offset="100%" stopColor="rgba(51,255,153,0)" />
              </radialGradient>
              <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(51,255,153,0.35)" />
                <stop offset="100%" stopColor="rgba(51,255,153,0)" />
              </linearGradient>
            </defs>

            <circle cx={C} cy={C} r={R} fill="url(#scopeGlow)" />
            {/* range rings */}
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <circle key={f} cx={C} cy={C} r={R * f} fill="none" stroke="rgba(51,255,153,0.18)" strokeWidth="1" />
            ))}
            {/* crosshairs */}
            <line x1={C} y1={C - R} x2={C} y2={C + R} stroke="rgba(51,255,153,0.14)" strokeWidth="1" />
            <line x1={C - R} y1={C} x2={C + R} y2={C} stroke="rgba(51,255,153,0.14)" strokeWidth="1" />
            {/* cardinal labels */}
            <text x={C} y={C - R - 4} fill="var(--color-muted)" fontSize="10" textAnchor="middle">N</text>
            <text x={C + R + 8} y={C + 3} fill="var(--color-muted)" fontSize="10" textAnchor="middle">E</text>
            <text x={C} y={C + R + 12} fill="var(--color-muted)" fontSize="10" textAnchor="middle">S</text>
            <text x={C - R - 8} y={C + 3} fill="var(--color-muted)" fontSize="10" textAnchor="middle">W</text>
            {/* range labels */}
            {[0.5, 1].map((f) => (
              <text key={f} x={C + 3} y={C - R * f + 11} fill="rgba(92,136,112,0.8)" fontSize="8">{Math.round(dist * f)}nm</text>
            ))}

            {/* rotating sweep */}
            <g>
              <path d={`M ${C} ${C} L ${C} ${C - R} A ${R} ${R} 0 0 1 ${C + R * Math.sin(toRad(40))} ${C - R * Math.cos(toRad(40))} Z`} fill="url(#sweepGrad)" />
              <line x1={C} y1={C} x2={C} y2={C - R} stroke="rgba(51,255,153,0.7)" strokeWidth="1.5" />
              <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="4s" repeatCount="indefinite" />
            </g>

            {/* vessels */}
            {showSea && vessels.map((v) => (
              <g key={`v-${v.mmsi}`} className="radar-blip">
                <title>{`${v.name || v.mmsi} · ${v.sog ?? '?'} kt · ${v.d.toFixed(0)} nm`}</title>
                <rect x={v.x - 2.5} y={v.y - 2.5} width="5" height="5" transform={`rotate(45 ${v.x} ${v.y})`} fill="var(--color-purple)" />
              </g>
            ))}
            {/* aircraft (triangle pointing along track) */}
            {showAir && aircraft.map((a) => (
              <g key={`a-${a.hex}`} className="radar-blip" transform={`rotate(${a.track ?? 0} ${a.x} ${a.y})`}>
                <title>{`${a.flight || a.hex}${a.type ? ` · ${a.type}` : ''} · ${a.alt ?? '?'} ft · ${a.gs ?? '?'} kt · ${a.d.toFixed(0)} nm`}</title>
                <polygon points={`${a.x},${a.y - 4} ${a.x - 3},${a.y + 3} ${a.x + 3},${a.y + 3}`} fill="var(--color-cyan)" />
              </g>
            ))}

            {/* center */}
            <circle cx={C} cy={C} r="2.5" fill="var(--color-cyan)" />
          </svg>
        </div>

        {/* side panel */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* controls */}
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => { setLat(p.lat); setLon(p.lon); setLabel(p.label) }}
                className="px-2 py-1 rounded-md text-xs" style={{ background: label === p.label ? 'rgba(51,255,153,0.12)' : 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: label === p.label ? 'var(--color-cyan)' : 'var(--color-muted)', cursor: 'pointer' }}>
                {p.label}
              </button>
            ))}
            <button onClick={useMyLocation} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer' }}>
              <Crosshair size={11} /> My location
            </button>
            <select value={dist} onChange={(e) => setDist(Number(e.target.value))}
              className="px-2 py-1 rounded-md text-xs outline-none" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              {[50, 100, 150, 250].map((d) => <option key={d} value={d}>{d} nm</option>)}
            </select>
          </div>

          {error && <p className="text-xs" style={{ color: 'var(--color-red)' }}>{error}</p>}

          {/* aircraft list */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--color-muted)' }}><Plane size={11} /> Aircraft ({aircraft.length})</p>
            <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 130 }}>
              {aircraftSorted.slice(0, 30).map((a) => (
                <div key={a.hex} className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--color-text)' }}>
                  <span className="w-16 flex-shrink-0" style={{ color: 'var(--color-cyan)' }}>{a.flight || a.hex}</span>
                  <span className="w-10 flex-shrink-0" style={{ color: 'var(--color-muted)' }}>{a.type || '—'}</span>
                  <span className="w-14 flex-shrink-0">{a.alt ?? '?'}ft</span>
                  <span className="w-12 flex-shrink-0">{a.gs ?? '?'}kt</span>
                  <span style={{ color: 'var(--color-muted)' }}>{a.d.toFixed(0)}nm</span>
                </div>
              ))}
              {aircraft.length === 0 && <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No aircraft in range.</p>}
            </div>
          </div>

          {/* vessel list / AIS status */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-1" style={{ color: 'var(--color-muted)' }}><Ship size={11} /> Vessels ({vessels.length})</p>
            {!data?.aisConfigured ? (
              <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Add a free <a href="https://aisstream.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-purple)' }}>aisstream.io</a> key in Settings to see ships.</p>
            ) : (
              <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: 110 }}>
                {vesselsSorted.slice(0, 30).map((v) => (
                  <div key={v.mmsi} className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--color-text)' }}>
                    <span className="w-28 flex-shrink-0 truncate" style={{ color: 'var(--color-purple)' }}>{v.name || v.mmsi}</span>
                    <span className="w-12 flex-shrink-0">{v.sog ?? '?'}kt</span>
                    <span style={{ color: 'var(--color-muted)' }}>{v.d.toFixed(0)}nm</span>
                  </div>
                ))}
                {vessels.length === 0 && <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{data?.aisConnected ? 'No vessels in range yet (stream warming up).' : 'Connecting to AIS stream…'}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
