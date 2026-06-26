'use client'

import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import type * as L from 'leaflet'
import { Map as MapIcon, Plane, Ship, Crosshair, Loader2, RefreshCw } from 'lucide-react'

type Aircraft = { hex: string; flight: string | null; type: string | null; lat: number; lon: number; alt: number | null; gs: number | null; track: number | null }
type Vessel = {
  mmsi: string; name: string | null; lat: number; lon: number; sog: number | null; cog: number | null
  heading?: number | null; flag?: string | null; typeLabel?: string | null; destination?: string | null
  imo?: string | null; callsign?: string | null; draught?: number | null; length?: number | null; width?: number | null
}
type RadarData = { aircraft: Aircraft[]; vessels: Vessel[]; aisConfigured: boolean; aisConnected: boolean }
type Selected = { kind: 'aircraft'; a: Aircraft } | { kind: 'vessel'; v: Vessel } | null
type AcInfo = {
  route?: { airline: string | null; airlineCountry: string | null; origin: AP; destination: AP }
  aircraft?: { type: string | null; manufacturer: string | null; registration: string | null; owner: string | null; ownerCountry: string | null }
}
type AP = { name?: string; iata?: string; icao?: string; city?: string; country?: string } | null

const PRESETS = [
  { label: 'London', lat: 51.5074, lon: -0.1278 },
  { label: 'Rotterdam', lat: 51.95, lon: 4.13 },
  { label: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { label: 'New York', lat: 40.7128, lon: -74.006 },
  { label: 'Paris', lat: 48.8566, lon: 2.3522 },
]

const ZOOM_FOR: Record<number, number> = { 50: 9, 100: 8, 150: 7, 250: 6 }

function planeIcon(LL: typeof L, track: number, found = false) {
  return LL.divIcon({
    className: '',
    html: `<div style="transform:rotate(${track}deg);width:16px;height:16px;display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="${found ? '#33ff99' : '#33ff99'}" style="filter:drop-shadow(0 0 2px rgba(51,255,153,0.7))">
        <path d="M12 2l-1.5 7L3 13v2l7.5-2 .5 5-2 1.5V21l3-1 3 1v-1.5L13 18l.5-5L21 15v-2l-7.5-4L12 2z"/></svg>
    </div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
  })
}
function shipIcon(LL: typeof L) {
  return LL.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;background:#ffb454;transform:rotate(45deg);border:1px solid #0a120c;box-shadow:0 0 3px rgba(255,180,84,0.8)"></div>`,
    iconSize: [10, 10], iconAnchor: [5, 5],
  })
}

export function LiveMap() {
  const [lat, setLat] = useState(51.5074)
  const [lon, setLon] = useState(-0.1278)
  const [label, setLabel] = useState('London')
  const [dist, setDist] = useState(100)
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAir, setShowAir] = useState(true)
  const [showSea, setShowSea] = useState(true)
  const [ready, setReady] = useState(false)
  const [selected, setSelected] = useState<Selected>(null)
  const [acInfo, setAcInfo] = useState<AcInfo | null>(null)
  const [acInfoLoading, setAcInfoLoading] = useState(false)

  const reqRef = useRef(0)
  const elRef = useRef<HTMLDivElement>(null)
  const LRef = useRef<typeof L | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)

  // init map (client-only)
  useEffect(() => {
    let killed = false
    ;(async () => {
      const LL = (await import('leaflet')) as unknown as typeof L
      if (killed || !elRef.current || mapRef.current) return
      LRef.current = LL
      const map = LL.map(elRef.current, { center: [lat, lon], zoom: ZOOM_FOR[dist] ?? 8, zoomControl: true, attributionControl: false })
      LL.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map)
      layerRef.current = LL.layerGroup().addTo(map)
      mapRef.current = map
      setReady(true)
    })()
    return () => { killed = true; mapRef.current?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // recenter when target changes
  useEffect(() => {
    if (ready && mapRef.current) mapRef.current.setView([lat, lon], ZOOM_FOR[dist] ?? 8)
  }, [lat, lon, dist, ready])

  const load = useCallback(async () => {
    const id = ++reqRef.current
    setLoading(true)
    try {
      const res = await fetch('/api/radar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lon, dist }) })
      const d = await res.json()
      if (id !== reqRef.current) return
      if (!res.ok) setError(d.error || 'Radar failed')
      else { setError(''); setData(d) }
    } catch (err) { if (id === reqRef.current) setError(String(err)) } finally { if (id === reqRef.current) setLoading(false) }
  }, [lat, lon, dist])

  useEffect(() => { load(); const t = setInterval(load, 12000); return () => clearInterval(t) }, [load])

  // draw markers
  useEffect(() => {
    const LL = LRef.current, layer = layerRef.current
    if (!ready || !LL || !layer) return
    layer.clearLayers()
    if (showAir) for (const a of data?.aircraft ?? []) {
      LL.marker([a.lat, a.lon], { icon: planeIcon(LL, a.track ?? 0) })
        .bindTooltip(`${a.flight || a.hex}${a.type ? ` · ${a.type}` : ''}<br>${a.alt ?? '?'} ft · ${a.gs ?? '?'} kt`, { direction: 'top' })
        .on('click', () => setSelected({ kind: 'aircraft', a }))
        .addTo(layer)
    }
    if (showSea) for (const v of data?.vessels ?? []) {
      LL.marker([v.lat, v.lon], { icon: shipIcon(LL) })
        .bindTooltip(`${v.name || v.mmsi}<br>${v.sog ?? '?'} kt`, { direction: 'top' })
        .on('click', () => setSelected({ kind: 'vessel', v }))
        .addTo(layer)
    }
  }, [data, showAir, showSea, ready])

  // enrich a selected aircraft via adsbdb
  useEffect(() => {
    if (selected?.kind !== 'aircraft') { setAcInfo(null); return }
    const { a } = selected
    setAcInfo(null); setAcInfoLoading(true)
    let cancelled = false
    fetch('/api/radar/aircraft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hex: a.hex, callsign: a.flight }) })
      .then((r) => r.json()).then((d) => { if (!cancelled) setAcInfo(d) })
      .catch(() => { if (!cancelled) setAcInfo({}) })
      .finally(() => { if (!cancelled) setAcInfoLoading(false) })
    return () => { cancelled = true }
  }, [selected])

  function airport(a: AP): string {
    if (!a) return '—'
    const code = a.iata || a.icao
    const place = [a.city, a.country].filter(Boolean).join(', ')
    return `${code ? `${code} · ` : ''}${a.name || ''}${place ? ` — ${place}` : ''}`.trim()
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => { setLat(+p.coords.latitude.toFixed(4)); setLon(+p.coords.longitude.toFixed(4)); setLabel('my location') },
      () => setError('Location permission denied')
    )
  }

  const aircraft = data?.aircraft ?? []
  const vessels = data?.vessels ?? []

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <MapIcon size={15} style={{ color: 'var(--color-cyan)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Live Map</span>
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

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
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
        {error && <span className="text-xs" style={{ color: 'var(--color-red)' }}>{error}</span>}
      </div>

      {/* map */}
      <div ref={elRef} style={{ height: 420, width: '100%', background: '#0a120c' }} />

      {/* detail panel */}
      {selected && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
          {selected.kind === 'aircraft' ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Plane size={14} style={{ color: 'var(--color-cyan)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{selected.a.flight || selected.a.hex}</span>
                <span className="text-xs font-mono" style={{ color: 'var(--color-muted)' }}>{selected.a.hex}{selected.a.type ? ` · ${selected.a.type}` : ''}</span>
                {acInfoLoading && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-muted)' }} />}
                <button onClick={() => setSelected(null)} className="ml-auto text-xs" style={{ color: 'var(--color-muted)', cursor: 'pointer' }}>close ✕</button>
              </div>
              <Row k="Live" v={`${selected.a.alt ?? '?'} ft · ${selected.a.gs ?? '?'} kt · hdg ${selected.a.track ?? '?'}°`} />
              {acInfo?.route?.airline && <Row k="Airline" v={`${acInfo.route.airline}${acInfo.route.airlineCountry ? ` (${acInfo.route.airlineCountry})` : ''}`} />}
              {acInfo?.route?.origin && <Row k="From" v={airport(acInfo.route.origin)} hl="var(--color-cyan)" />}
              {acInfo?.route?.destination && <Row k="To" v={airport(acInfo.route.destination)} hl="var(--color-cyan)" />}
              {acInfo?.aircraft?.type && <Row k="Aircraft" v={`${acInfo.aircraft.type}${acInfo.aircraft.manufacturer ? ` · ${acInfo.aircraft.manufacturer}` : ''}`} />}
              {acInfo?.aircraft?.registration && <Row k="Reg" v={acInfo.aircraft.registration} />}
              {acInfo?.aircraft?.owner && <Row k="Owner" v={`${acInfo.aircraft.owner}${acInfo.aircraft.ownerCountry ? ` (${acInfo.aircraft.ownerCountry})` : ''}`} />}
              {!acInfoLoading && acInfo && !acInfo.route && !acInfo.aircraft && <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No route/registry record found for this aircraft.</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Ship size={14} style={{ color: 'var(--color-purple)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{selected.v.name || selected.v.mmsi}</span>
                {selected.v.flag && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{selected.v.flag}</span>}
                <button onClick={() => setSelected(null)} className="ml-auto text-xs" style={{ color: 'var(--color-muted)', cursor: 'pointer' }}>close ✕</button>
              </div>
              <Row k="MMSI" v={selected.v.mmsi} />
              {selected.v.typeLabel && <Row k="Type" v={selected.v.typeLabel} />}
              {selected.v.destination && <Row k="Destination" v={selected.v.destination} hl="var(--color-purple)" />}
              <Row k="Speed / course" v={`${selected.v.sog ?? '?'} kt · ${selected.v.cog ?? selected.v.heading ?? '?'}°`} />
              {(selected.v.length || selected.v.width) && <Row k="Size" v={`${selected.v.length ?? '?'} × ${selected.v.width ?? '?'} m${selected.v.draught ? ` · draught ${selected.v.draught} m` : ''}`} />}
              {selected.v.imo && <Row k="IMO" v={selected.v.imo} />}
              {selected.v.callsign && <Row k="Callsign" v={selected.v.callsign} />}
              {!selected.v.typeLabel && !selected.v.destination && <p className="text-xs" style={{ color: 'var(--color-muted)' }}>Static data (type/destination) not received yet — broadcast every few minutes.</p>}
            </div>
          )}
        </div>
      )}

      {/* legend / status */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs flex-wrap" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
        <span className="flex items-center gap-1.5"><span style={{ color: 'var(--color-cyan)' }}>▲</span> aircraft</span>
        <span className="flex items-center gap-1.5"><span style={{ color: 'var(--color-purple)' }}>◆</span> ships</span>
        {!data?.aisConfigured
          ? <span>Add a free <a href="https://aisstream.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-purple)' }}>aisstream.io</a> key in Settings to see ships</span>
          : vessels.length === 0 && <span style={{ color: 'var(--color-muted)' }}>{data?.aisConnected ? 'AIS connected — ships fill in over ~30s (coastal areas)' : 'connecting to AIS…'}</span>}
      </div>
    </div>
  )
}

function Row({ k, v, hl }: { k: string; v: string; hl?: string }) {
  return (
    <div className="flex gap-3 text-xs">
      <span className="font-mono w-24 flex-shrink-0" style={{ color: 'var(--color-muted)' }}>{k}</span>
      <span className="font-mono flex-1 break-words" style={{ color: hl || 'var(--color-text)' }}>{v}</span>
    </div>
  )
}
