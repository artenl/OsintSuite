'use client'

import 'leaflet/dist/leaflet.css'
import { useState, useEffect, useCallback, useRef } from 'react'
import type * as L from 'leaflet'
import { Map as MapIcon, Plane, Ship, Crosshair, Loader2, RefreshCw, Search } from 'lucide-react'

type Aircraft = { hex: string; flight: string | null; type: string | null; lat: number; lon: number; alt: number | null; gs: number | null; track: number | null }
type Vessel = {
  mmsi: string; name: string | null; lat: number; lon: number; sog: number | null; cog: number | null
  heading?: number | null; flag?: string | null; typeLabel?: string | null; destination?: string | null
  imo?: string | null; callsign?: string | null; draught?: number | null; length?: number | null; width?: number | null
}
type RadarData = { aircraft: Aircraft[]; vessels: Vessel[]; aisConfigured: boolean; aisConnected: boolean }
type Fire = { lat: number; lon: number; confidence: string; frp: number | null; date: string }
type ConflictEvt = { lat: number; lon: number; type: string; date: string; fatalities?: number; notes?: string; mentions?: number; place?: string; url?: string; actor1?: string; actor2?: string; articles?: number; tone?: number }
type Layers = { iss: { lat: number; lon: number } | null; fires: Fire[]; conflict: ConflictEvt[]; firmsConfigured: boolean; acledConfigured: boolean }
type Selected = { kind: 'aircraft'; a: Aircraft } | { kind: 'vessel'; v: Vessel } | { kind: 'conflict'; e: ConflictEvt } | null
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

const DEFAULT_ZOOM = 8

function havNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

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
function fireIcon(LL: typeof L) {
  return LL.divIcon({ className: '', html: `<div style="width:7px;height:7px;border-radius:50%;background:#ff6a00;box-shadow:0 0 5px 1px rgba(255,106,0,0.9)"></div>`, iconSize: [7, 7], iconAnchor: [3.5, 3.5] })
}
function conflictIcon(LL: typeof L) {
  return LL.divIcon({ className: '', html: `<div style="color:#ff5555;font-size:13px;line-height:1;text-shadow:0 0 3px rgba(255,85,85,0.9)">✷</div>`, iconSize: [13, 13], iconAnchor: [6, 7] })
}
function issIcon(LL: typeof L) {
  return LL.divIcon({ className: '', html: `<div style="font-size:16px;filter:drop-shadow(0 0 3px rgba(51,255,153,0.9))">🛰️</div>`, iconSize: [18, 18], iconAnchor: [9, 9] })
}

export function LiveMap() {
  const [view, setView] = useState({ lat: 51.5074, lon: -0.1278, dist: 100 })
  const [label, setLabel] = useState('London')
  const { lat, lon, dist } = view
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tracking, setTracking] = useState(true)
  const [showAir, setShowAir] = useState(true)
  const [showSea, setShowSea] = useState(true)
  const [layers, setLayers] = useState<Layers | null>(null)
  const [showFire, setShowFire] = useState(true)
  const [showConf, setShowConf] = useState(true)
  const [showIss, setShowIss] = useState(true)
  const [ready, setReady] = useState(false)
  const [selected, setSelected] = useState<Selected>(null)
  const [acInfo, setAcInfo] = useState<AcInfo | null>(null)
  const [acInfoLoading, setAcInfoLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const geoTokenRef = useRef(0)

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
      const map = LL.map(elRef.current, { center: [lat, lon], zoom: DEFAULT_ZOOM, zoomControl: true, attributionControl: false })
      LL.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd', maxZoom: 19,
      }).addTo(map)
      layerRef.current = LL.layerGroup().addTo(map)
      mapRef.current = map
      // When the map settles on a new area, fetch for that area + a range derived
      // from the visible bounds (capped to the ADS-B API max of 250 nm).
      map.on('moveend', () => {
        const c = map.getCenter()
        const ne = map.getBounds().getNorthEast()
        const d = Math.min(250, Math.max(10, Math.round(havNm(c.lat, c.lng, ne.lat, ne.lng))))
        setView({ lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4), dist: d })
        setLabel(`${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}`)
        // reverse-geocode for a friendly place name (latest wins)
        const token = ++geoTokenRef.current
        fetch('/api/geo/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: c.lat, lon: c.lng }) })
          .then((r) => r.json()).then((g) => {
            if (token !== geoTokenRef.current) return
            const dn: string | undefined = g?.results?.[0]?.displayName
            if (dn) { const p = dn.split(',').map((s: string) => s.trim()); setLabel(p.length > 1 ? `${p[0]}, ${p[p.length - 1]}` : p[0]) }
          }).catch(() => {})
      })
      setReady(true)
    })()
    return () => { killed = true; mapRef.current?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    const id = ++reqRef.current
    setLoading(true)
    const radarOn = showAir || showSea
    const layersOn = showFire || showConf || showIss
    try {
      const [res, lres] = await Promise.all([
        radarOn ? fetch('/api/radar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lon, dist, aircraft: showAir, vessels: showSea }) }) : Promise.resolve(null),
        layersOn ? fetch('/api/map/layers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lon, dist, fires: showFire, conflict: showConf, iss: showIss }) }).catch(() => null) : Promise.resolve(null),
      ])
      if (id !== reqRef.current) return
      if (res) {
        const d = await res.json()
        if (id !== reqRef.current) return
        if (!res.ok) setError(d.error || 'Radar failed')
        else { setError(''); setData(d) }
      } else setData(null)
      if (lres?.ok) { const ld = await lres.json(); if (id === reqRef.current) setLayers(ld) }
      else if (!layersOn) setLayers(null)
    } catch (err) { if (id === reqRef.current) setError(String(err)) } finally { if (id === reqRef.current) setLoading(false) }
  }, [lat, lon, dist, showAir, showSea, showFire, showConf, showIss])

  useEffect(() => {
    if (!tracking) return
    load()
    const t = setInterval(load, 12000)
    return () => clearInterval(t)
  }, [load, tracking])

  // draw markers
  useEffect(() => {
    const LL = LRef.current, layer = layerRef.current
    if (!ready || !LL || !layer) return
    layer.clearLayers()
    if (!tracking) return
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
    if (showFire) for (const f of layers?.fires ?? []) {
      LL.marker([f.lat, f.lon], { icon: fireIcon(LL) })
        .bindTooltip(`🔥 Fire/thermal<br>${f.date} · conf ${f.confidence}${f.frp ? ` · ${f.frp} MW` : ''}`, { direction: 'top' })
        .addTo(layer)
    }
    if (showConf) for (const e of layers?.conflict ?? []) {
      LL.marker([e.lat, e.lon], { icon: conflictIcon(LL) })
        .bindTooltip(`⚠ ${e.type}${e.place ? ` · ${e.place}` : ''}<br>${e.date}${e.fatalities ? ` · ${e.fatalities} killed` : e.mentions ? ` · ${e.mentions} reports` : ''}`, { direction: 'top' })
        .on('click', () => setSelected({ kind: 'conflict', e }))
        .addTo(layer)
    }
    if (showIss && layers?.iss) {
      LL.marker([layers.iss.lat, layers.iss.lon], { icon: issIcon(LL) })
        .bindTooltip('🛰️ ISS (International Space Station)', { direction: 'top' })
        .addTo(layer)
    }
  }, [data, layers, showAir, showSea, showFire, showConf, showIss, ready, tracking])

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

  // Move the map; the moveend handler updates the fetch area + range.
  function goTo(la: number, lo: number) {
    if (mapRef.current) mapRef.current.setView([la, lo], DEFAULT_ZOOM)
    else setView({ lat: la, lon: lo, dist: 100 })
  }

  async function searchPlace(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setSearching(true); setError('')
    try {
      const res = await fetch('/api/geo/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query.trim() }) })
      const d = await res.json()
      if (!res.ok || !d.results?.length) { setError(d.error || 'Place not found'); return }
      const r = d.results[0]
      goTo(r.lat, r.lon)
    } catch (err) { setError(String(err)) } finally { setSearching(false) }
  }

  function useMyLocation() {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (p) => goTo(+p.coords.latitude.toFixed(4), +p.coords.longitude.toFixed(4)),
      () => setError('Location permission denied')
    )
  }

  const aircraft = tracking ? (data?.aircraft ?? []) : []
  const vessels = tracking ? (data?.vessels ?? []) : []

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      {/* header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <MapIcon size={15} style={{ color: 'var(--color-cyan)' }} />
        <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Live Map</span>
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{label} · {dist} nm</span>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <button onClick={() => setTracking((t) => !t)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium"
            style={{
              background: tracking ? 'rgba(51,255,153,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${tracking ? 'rgba(51,255,153,0.4)' : 'var(--color-border)'}`,
              color: tracking ? 'var(--color-cyan)' : 'var(--color-muted)', cursor: 'pointer',
            }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: tracking ? 'var(--color-cyan)' : 'var(--color-muted)', boxShadow: tracking ? '0 0 5px var(--color-cyan)' : 'none' }} />
            {tracking ? 'Live' : 'Paused'}
          </button>
          <span className="flex items-center gap-1" style={{ color: showAir ? 'var(--color-cyan)' : 'var(--color-muted)', cursor: 'pointer' }} onClick={() => setShowAir((s) => !s)}>
            <Plane size={12} /> {aircraft.length}
          </span>
          <span className="flex items-center gap-1" style={{ color: showSea ? 'var(--color-purple)' : 'var(--color-muted)', cursor: 'pointer' }} onClick={() => setShowSea((s) => !s)}>
            <Ship size={12} /> {vessels.length}
          </span>
          {tracking && (loading ? <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-muted)' }} /> : <RefreshCw size={12} style={{ color: 'var(--color-muted)', cursor: 'pointer' }} onClick={load} />)}
        </div>
      </div>

      {/* search */}
      <form onSubmit={searchPlace} className="flex gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Track a location — e.g. Warsaw, Strait of Hormuz, JFK Airport"
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }} />
        </div>
        <button type="submit" disabled={searching || !query.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: 'rgba(51,255,153,0.15)', border: '1px solid rgba(51,255,153,0.4)', color: 'var(--color-cyan)', cursor: searching || !query.trim() ? 'not-allowed' : 'pointer', opacity: searching || !query.trim() ? 0.6 : 1 }}>
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />} Track
        </button>
      </form>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>Jump to:</span>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => goTo(p.lat, p.lon)}
            className="px-2 py-1 rounded-md text-xs" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer' }}>
            {p.label}
          </button>
        ))}
        <button onClick={useMyLocation} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs" style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', cursor: 'pointer' }}>
          <Crosshair size={11} /> My location
        </button>
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>· pan/zoom the map to track any area</span>
        {error && <span className="text-xs" style={{ color: 'var(--color-red)' }}>{error}</span>}
      </div>

      {/* map */}
      <div ref={elRef} style={{ height: 420, width: '100%', background: '#0a120c' }} />

      {/* detail panel */}
      {selected && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}>
          {selected.kind === 'aircraft' && (
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
          )}
          {selected.kind === 'vessel' && (
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
          {selected.kind === 'conflict' && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--color-red)' }}>✷</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{selected.e.type}</span>
                {selected.e.place && <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{selected.e.place}</span>}
                <button onClick={() => setSelected(null)} className="ml-auto text-xs" style={{ color: 'var(--color-muted)', cursor: 'pointer' }}>close ✕</button>
              </div>
              {(selected.e.actor1 || selected.e.actor2) && <Row k="Parties" v={[selected.e.actor1, selected.e.actor2].filter(Boolean).join('  →  ')} hl="var(--color-red)" />}
              <Row k="Date" v={selected.e.date || '—'} />
              <Row k="Coverage" v={`${selected.e.mentions ?? 0} mentions${selected.e.articles ? ` · ${selected.e.articles} articles` : ''}${typeof selected.e.tone === 'number' ? ` · tone ${selected.e.tone}` : ''}`} />
              {selected.e.url && (
                <div className="flex gap-3 text-xs">
                  <span className="font-mono w-24 flex-shrink-0" style={{ color: 'var(--color-muted)' }}>Source</span>
                  <a href={selected.e.url} target="_blank" rel="noopener noreferrer" className="font-mono flex-1 break-all" style={{ color: 'var(--color-cyan)' }}>{selected.e.url}</a>
                </div>
              )}
              <p className="text-xs pt-1" style={{ color: 'var(--color-muted)' }}>Media-derived event (GDELT) — a reported incident, not a verified casualty count.</p>
            </div>
          )}
        </div>
      )}

      {/* legend / status */}
      <div className="flex items-center gap-3 px-4 py-2 text-xs flex-wrap" style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-muted)' }}>
        <span className="font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Track:</span>
        <span className="flex items-center gap-1 cursor-pointer" style={{ color: showAir ? 'var(--color-cyan)' : 'var(--color-muted)' }} onClick={() => setShowAir((s) => !s)}>▲ aircraft</span>
        <span className="flex items-center gap-1 cursor-pointer" style={{ color: showSea ? 'var(--color-purple)' : 'var(--color-muted)' }} onClick={() => setShowSea((s) => !s)}>◆ ships</span>
        <span className="flex items-center gap-1 cursor-pointer" style={{ color: showFire ? '#ff6a00' : 'var(--color-muted)' }} onClick={() => setShowFire((s) => !s)}>🔥 fires {layers?.fires.length ? `(${layers.fires.length})` : ''}</span>
        <span className="flex items-center gap-1 cursor-pointer" style={{ color: showConf ? 'var(--color-red)' : 'var(--color-muted)' }} onClick={() => setShowConf((s) => !s)}>✷ conflict {layers?.conflict.length ? `(${layers.conflict.length})` : ''}</span>
        <span className="flex items-center gap-1 cursor-pointer" style={{ color: showIss ? 'var(--color-cyan)' : 'var(--color-muted)' }} onClick={() => setShowIss((s) => !s)}>🛰️ ISS</span>
        {layers && !layers.firmsConfigured && <span style={{ color: 'var(--color-muted)' }}>· add a free <a href="https://firms.modaps.eosdis.nasa.gov/api/area/" target="_blank" rel="noopener noreferrer" style={{ color: '#ff6a00' }}>FIRMS</a> key for fires</span>}
        {!data?.aisConfigured && <span>· <a href="https://aisstream.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-purple)' }}>aisstream.io</a> key for ships</span>}
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
