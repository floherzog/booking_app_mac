import { useEffect, useState, useCallback, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { geocodeCity, loadSeedCache } from '../lib/geocode'
import { STATUS_META } from '@core/constants'
import StatusBadge from './StatusBadge'

function loadStoredCache() {
  try { return JSON.parse(localStorage.getItem('booking_geo_cache') || '{}') } catch { return {} }
}

// SVG divIcon: solid circle for one status, pie chart for multiple
function makeIcon(statusCounts, totalCount) {
  const r = Math.min(10 + Math.sqrt(totalCount) * 2.5, 22)
  const s = r * 2 + 4
  const cx = s / 2, cy = s / 2

  const entries = Object.entries(statusCounts)
    .sort((a, b) => (STATUS_META[a[0]]?.priority ?? 9) - (STATUS_META[b[0]]?.priority ?? 9))

  let inner
  if (entries.length === 1) {
    const color = STATUS_META[entries[0][0]]?.mapColor ?? '#6B7280'
    inner = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`
  } else {
    const total = entries.reduce((s, [, n]) => s + n, 0)
    let angle = -Math.PI / 2
    inner = entries.map(([status, count]) => {
      const frac = count / total
      const end = angle + frac * 2 * Math.PI
      const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
      const x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end)
      const large = frac > 0.5 ? 1 : 0
      const color = STATUS_META[status]?.mapColor ?? '#6B7280'
      const d = `M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`
      angle = end
      return `<path d="${d}" fill="${color}"/>`
    }).join('')
  }

  const svg = `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">
    ${inner}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="white" stroke-width="2"/>
  </svg>`

  return L.divIcon({ html: svg, className: '', iconSize: [s, s], iconAnchor: [cx, cy], popupAnchor: [0, -(r + 4)] })
}

// Greedy pixel-proximity clustering (O(n²), fine for <500 points)
function cluster(locations, map, radius = 35) {
  if (!map || !locations.length) return []
  const pts = locations.map(loc => ({
    ...loc,
    px: map.latLngToContainerPoint([loc.pos.lat, loc.pos.lng]),
    used: false,
  }))
  const result = []
  pts.forEach((p, i) => {
    if (p.used) return
    const members = [p]
    pts.forEach((q, j) => {
      if (i === j || q.used) return
      const dx = p.px.x - q.px.x, dy = p.px.y - q.px.y
      if (Math.sqrt(dx * dx + dy * dy) < radius) { members.push(q); q.used = true }
    })
    p.used = true
    const lat = members.reduce((s, m) => s + m.pos.lat, 0) / members.length
    const lng = members.reduce((s, m) => s + m.pos.lng, 0) / members.length
    result.push({ pos: { lat, lng }, venues: members.flatMap(m => m.venues) })
  })
  return result
}

function FlyTo({ row, geoCache }) {
  const map = useMap()
  useEffect(() => {
    if (!row) return
    const key = `${row['City'] || ''}||${row['Country'] || ''}`
    const pos = geoCache[key]
    if (pos) map.flyTo([pos.lat, pos.lng], 14, { duration: 1.2 })
  }, [row]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function SmoothWheelZoom() {
  const map = useMap()
  useEffect(() => {
    map.scrollWheelZoom.disable()
    function onWheel(e) {
      e.preventDefault()
      // Trackpad/Magic Mouse: deltaMode=0, deltaY=1–20 per event at ~60fps
      // Mouse wheel:          deltaMode=0, deltaY=100–120 per click at ~1fps
      // Lines mode (Firefox): deltaMode=1, deltaY=3 per click
      const px = e.deltaMode === 0 ? e.deltaY : e.deltaY * 20
      const delta = -px / 150  // 150px scroll = 1 zoom level
      const z = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), map.getZoom() + delta))
      // setZoomAround keeps the point under the cursor fixed while zooming
      map.setZoomAround(map.mouseEventToContainerPoint(e), z, { animate: false })
    }
    map.getContainer().addEventListener('wheel', onWheel, { passive: false })
    return () => map.getContainer().removeEventListener('wheel', onWheel)
  }, [map])
  return null
}

function ClusteredMarkers({ locations, onVenueClick }) {
  const map = useMap()
  const [clusters, setClusters] = useState(() => cluster(locations, map))
  const timerRef = useRef(null)

  const recluster = useCallback(() => setClusters(cluster(locations, map)), [locations, map])

  // Recompute clusters whenever the locations or map change; reclustering is the
  // whole point of this effect, so opt out of the set-state-in-effect heuristic.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { recluster() }, [recluster])

  // Debounce: with animate:false, zoomend fires on every scroll tick — only recluster once it settles
  useMapEvents({
    zoomend: () => {
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(recluster, 120)
    }
  })

  return clusters.map(({ pos, venues }) => {
    const counts = {}
    venues.forEach(v => { counts[v._status] = (counts[v._status] || 0) + 1 })
    const icon = makeIcon(counts, venues.length)
    const key = `${pos.lat.toFixed(4)},${pos.lng.toFixed(4)}`

    return (
      <Marker key={key} position={[pos.lat, pos.lng]} icon={icon}>
        <Popup minWidth={190} maxHeight={300}>
          <div style={{ maxHeight: 270, overflowY: 'auto' }}>
            {venues
              .sort((a, b) => (STATUS_META[a._status]?.priority ?? 9) - (STATUS_META[b._status]?.priority ?? 9))
              .map(v => (
                <div key={v._idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
                  <StatusBadge status={v._status} />
                  <button
                    onClick={() => onVenueClick(v._idx)}
                    style={{ fontSize: 13, fontWeight: 500, color: '#1f2937', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                    onMouseEnter={e => e.target.style.color = '#4f46e5'}
                    onMouseLeave={e => e.target.style.color = '#1f2937'}
                  >
                    {v['Venue'] || '—'}
                  </button>
                </div>
              ))}
          </div>
        </Popup>
      </Marker>
    )
  })
}

export default function MapView({ filteredRows, onVenueClick, focusRow }) {
  const [geoCache, setGeoCache] = useState(loadStoredCache)

  // On first mount, merge in the app's bundled seed cache so the map starts
  // with pre-geocoded coordinates without hitting Nominatim.
  useEffect(() => {
    loadSeedCache()
      .then(server => setGeoCache(prev => {
        const merged = { ...server, ...prev } // locally geocoded entries win
        try { localStorage.setItem('booking_geo_cache', JSON.stringify(merged)) } catch { /* ignore */ }
        return merged
      }))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const unique = [...new Set(
      filteredRows
        .filter(r => r['City'] || r['Country'])
        .map(r => `${r['City'] || ''}||${r['Country'] || ''}`)
    )]
    let cancelled = false

    Promise.all(unique.map(async key => {
      const [city, country] = key.split('||')
      const result = await geocodeCity(city, country)
      if (!cancelled) setGeoCache(prev => prev[key] === result ? prev : { ...prev, [key]: result })
    }))

    return () => { cancelled = true }
    // geoCache is intentionally omitted: this effect writes to it, so depending on
    // it would re-trigger geocoding in a loop. Only re-run when the rows change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows])

  const locationMap = {}
  const unplacedVenues = []
  filteredRows.forEach(row => {
    const key = `${row['City'] || ''}||${row['Country'] || ''}`
    if (!(key in geoCache)) return
    const pos = geoCache[key]
    if (!pos) { unplacedVenues.push(row); return }
    if (!locationMap[key]) locationMap[key] = { pos, venues: [] }
    locationMap[key].venues.push(row)
  })

  const locations = Object.values(locationMap)
  const [showUnplaced, setShowUnplaced] = useState(false)

  return (
    <div className="relative rounded-lg overflow-hidden border border-gray-200" style={{ height: 'min(600px, 65vh)' }}>
      <MapContainer center={[50, 12]} zoom={4} zoomSnap={0} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <SmoothWheelZoom />
        <FlyTo row={focusRow} geoCache={geoCache} />
        <ClusteredMarkers locations={locations} onVenueClick={onVenueClick} />
        {focusRow && (() => {
          const key = `${focusRow['City'] || ''}||${focusRow['Country'] || ''}`
          const pos = geoCache[key]
          const color = STATUS_META[focusRow._status]?.mapColor ?? '#9CA3AF'
          return pos ? (
            <CircleMarker
              center={[pos.lat, pos.lng]} radius={22}
              pathOptions={{ color, fillColor: 'transparent', weight: 3, opacity: 0.7 }}
            />
          ) : null
        })()}
      </MapContainer>

      {unplacedVenues.length > 0 && (
        <div className="absolute bottom-3 left-3 z-[1000]">
          <button
            onClick={() => setShowUnplaced(v => !v)}
            className="bg-white/90 rounded px-2.5 py-1 text-xs text-gray-400 shadow-sm border border-gray-200 hover:text-gray-600 hover:border-gray-300 transition-colors"
          >
            {unplacedVenues.length} venue{unplacedVenues.length !== 1 ? 's' : ''} couldn't be placed {showUnplaced ? '▲' : '▼'}
          </button>
          {showUnplaced && (
            <div className="mt-1 bg-white rounded-lg shadow-lg border border-gray-200 text-xs w-64 max-h-48 overflow-y-auto">
              <div className="px-3 py-2 border-b border-gray-100 text-gray-500 font-medium">
                No coordinates found for:
              </div>
              {unplacedVenues.map(v => (
                <button
                  key={v._idx}
                  onClick={() => onVenueClick(v._idx)}
                  className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center justify-between gap-2"
                >
                  <span className="font-medium text-gray-700 truncate">{v['Venue'] || '—'}</span>
                  <span className="text-gray-400 shrink-0">{[v['City'], v['Country']].filter(Boolean).join(', ') || 'no location'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
