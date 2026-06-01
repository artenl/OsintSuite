import { NextRequest, NextResponse } from 'next/server'
import exifr from 'exifr'
import { z } from 'zod'

const schema = z.object({
  url: z.string().url().optional(),
  dataUrl: z.string().optional(),
})

const MAX_BYTES = 25 * 1024 * 1024

// Extract EXIF metadata (incl. GPS) from an image. Free, fully local parsing.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success || (!parsed.data.url && !parsed.data.dataUrl)) {
    return NextResponse.json({ error: 'Provide an image url or dataUrl' }, { status: 400 })
  }

  let buf: Buffer
  try {
    if (parsed.data.dataUrl) {
      const m = parsed.data.dataUrl.match(/^data:[^;]+;base64,(.+)$/)
      if (!m) return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 })
      buf = Buffer.from(m[1], 'base64')
    } else {
      const res = await fetch(parsed.data.url!, { signal: AbortSignal.timeout(12000) })
      if (!res.ok) return NextResponse.json({ error: `Could not fetch image (${res.status})` }, { status: 502 })
      const ab = await res.arrayBuffer()
      buf = Buffer.from(ab)
    }
  } catch (err) {
    return NextResponse.json({ error: `Image fetch failed: ${String(err)}` }, { status: 502 })
  }

  if (buf.length > MAX_BYTES) return NextResponse.json({ error: 'Image too large (max 25MB)' }, { status: 413 })

  try {
    const exif = await exifr.parse(buf).catch(() => null)
    if (!exif) {
      return NextResponse.json({ Result: 'No EXIF metadata found (it may have been stripped — common on social media)' })
    }

    const result: Record<string, string> = {}

    if (typeof exif.latitude === 'number' && typeof exif.longitude === 'number') {
      const lat = exif.latitude
      const lon = exif.longitude
      result['GPS Coordinates'] = `${lat.toFixed(6)}, ${lon.toFixed(6)}`
      result['_lat'] = String(lat)
      result['_lon'] = String(lon)
      result['Map'] = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`
      if (typeof exif.GPSAltitude === 'number') result['Altitude'] = `${Math.round(exif.GPSAltitude)} m`
    }

    const make = exif.Make?.toString().trim()
    const model = exif.Model?.toString().trim()
    if (make || model) result['Camera'] = [make, model].filter(Boolean).join(' ')
    if (exif.LensModel) result['Lens'] = String(exif.LensModel).trim()
    const when = exif.DateTimeOriginal || exif.CreateDate || exif.ModifyDate
    if (when) result['Taken'] = (when instanceof Date ? when.toISOString().replace('T', ' ').slice(0, 19) : String(when))
    if (exif.Software) result['Software'] = String(exif.Software).trim()
    if (exif.ImageWidth && exif.ImageHeight) result['Dimensions'] = `${exif.ImageWidth} × ${exif.ImageHeight}`
    if (exif.ISO) result['ISO'] = String(exif.ISO)
    if (exif.FNumber) result['Aperture'] = `f/${exif.FNumber}`

    if (Object.keys(result).length === 0) {
      return NextResponse.json({ Result: 'EXIF present but no notable fields (no GPS, camera, or timestamps)' })
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: `EXIF parse failed: ${String(err)}` }, { status: 500 })
  }
}
