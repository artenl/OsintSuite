# OSINT Suite

A self-hosted OSINT investigation platform with a terminal-style UI. Run a domain,
IP, person, or location through dozens of intelligence sources in one click, then
let an LLM summarise the findings and suggest next steps.

> Built to be extended with [Claude Code](https://claude.com/claude-code) — see
> [Working with Claude](#working-with-claude). The repo ships a `CLAUDE.md` so the
> assistant has full project context out of the box.

- **Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 · SQLite + Drizzle ·
  JWT auth (jose) · Docker Compose + Traefik
- **AI:** Google Gemini 2.5 Pro (with Flash fallback) for analysis & query generation
- **Auth:** single-tenant, admin-seeded from env on first run; multi-user via Settings

---

## Contents
- [Features](#features)
- [Quickstart](#quickstart)
- [API keys](#api-keys)
- [Working with Claude](#working-with-claude)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Security notes](#security-notes)

---

## Features

Each investigation page fans out to many tools at once, then offers a one-click
**AI Insights** panel (risk level + summary + key findings + next steps).

### 🌐 Domain / IP
Runs everything below in parallel against a domain or IP:

| Tool | What it returns | Key |
|------|-----------------|-----|
| WHOIS | Registrar, dates, name servers, status (RDAP/socket) | – |
| DNS | A/AAAA/MX/NS/TXT records, SPF/DMARC/DKIM, SOA, reverse PTR | – |
| SSL | Certificate CN/issuer/SANs, expiry, fingerprints, TLS version | – |
| GeoIP / ASN | Country, city, ISP, org, ASN, BGP prefix | – |
| HTTP Headers | Headers, tech-stack detection, security-header score | – |
| Wayback | First & last archive capture, snapshot links, timeline | – |
| Subdomains (crt.sh) | Subdomains from Certificate Transparency logs | – |
| Shodan DNS | Passive-DNS subdomains + observed records (reverse PTR for IPs) | Shodan |
| Shodan | Open ports, CVEs, services, banners | Shodan |
| InternetDB | Open ports, CVEs, tags (free, no key) | – |
| VirusTotal | Domain/IP reputation, detections, categories | VirusTotal |
| URLScan | Recent public scans, malicious flags | (optional) |
| Threat Intel | abuse.ch URLhaus host reputation | (optional) |

### 👤 Person
Mode-based (Username · Email · Name · Phone):

| Mode | Tools |
|------|-------|
| Username | 50+ platform presence check · **GitHub** profile (name, company, location, repos) |
| Email | MX records · **HIBP** breaches · **Gravatar** profile + linked accounts |
| Phone | `libphonenumber` validity/type/format · **carrier · region · timezone** |
| Name | Targeted Google dorks + people-search links |

Plus reverse-image-search links, paste-site search, and AI Insights tuned for
digital-footprint / exposure analysis.

### 📡 Shodan
A dedicated console for device-exposure intelligence (security research / your own
or authorised devices — it reports metadata only, never opens feeds):

- **Device Search** — host search with `product:` / `org:` / `country:` / port
  filters and result facets; clickable suggestions per camera brand + a
  country/port/org refinement bar.
- **Top Cameras** — the 50 most-exposed device/camera products, pulled & stored
  from Shodan facet counts.
- **Exposure Check** — confirms whether a host is genuinely reachable and whether
  it demands authentication (`open` / `protected` / `offline`), via headers-only
  probes. Auto-verifies every search result with a "show only open" filter.
- **DNS Pivot** — Shodan passive DNS for a domain/IP.

### 🗺️ Geo / OSM
Geospatial intelligence:

- **Location reference** — place-name search (Nominatim) or paste coordinates.
- **Photo GPS** — extract EXIF (GPS, camera, timestamp) from an image, locally, and
  use the coordinates as a reference point.
- **AI query builder** — describe what to find in plain English → Gemini writes
  valid **Overpass QL**.
- **Runner** — executes against the Overpass API, lists features with map links and
  an "open in overpass-turbo" button, plus an **AI summary** (observations + leads).

### 🛰️ Dashboard — Live Map
A real-time dark map on the dashboard (Leaflet):
- **Aircraft (ADS-B)** — live planes around a chosen point at their real positions
  (heading-oriented icons; callsign, type, altitude, speed on hover). Free, no key
  (adsb.lol).
- **Ships (AIS)** — live vessels on the same map, via a persistent stream
  (requires a free [aisstream.io](https://aisstream.io) key).
- **Situational layers** — active **fires/thermal** (NASA FIRMS, free key),
  **conflict events** (ACLED, free key), and the **ISS** position (CelesTrak,
  no key) as toggleable overlays.
- **Location search**, city presets, "use my location"; the map refetches for
  whatever area you pan/zoom to. Click any plane/ship for route, type, owner,
  destination, and flag.

### 🗂️ Investigations
Every page can **save** its results; saved investigations are listed and openable
in a detail view. Stored per-user in SQLite.

---

## Quickstart

### Local (dev)
```bash
cd app
cp .env.example .env        # set JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
npm install
npm run dev                 # http://localhost:3000
```
The database and admin user are created automatically on first run.

### Docker
```bash
cp app/.env.example app/.env   # fill in values; set DOMAIN for the Traefik rule
docker compose up -d --build
```
Traefik handles TLS via Let's Encrypt. See [Deployment](#deployment).

First login uses `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Add API keys and more users
under **Settings**.

---

## API keys

All keys are optional — tools degrade gracefully without them. Add them in-app under
**Settings → API Keys** (stored in the local DB, never in files).

| Service | Unlocks | Cost |
|---------|---------|------|
| **Gemini** | All AI features (insights, Overpass query builder, geo summary) | Free tier — get one at [aistudio.google.com](https://aistudio.google.com) |
| **Shodan** | Host lookup, device search, top-cameras, passive DNS | Search/facets need a paid plan; InternetDB is free |
| **VirusTotal** | Domain/IP reputation | Free tier (500/day) |
| **HIBP** | Email breach lookups | Paid |
| **URLScan** | Higher rate limits (search works without a key) | Free tier |
| **abuse.ch** | URLhaus threat intel | Free auth key at [auth.abuse.ch](https://auth.abuse.ch) |

---

## Working with Claude

This repo is designed to be driven by **Claude Code**. The included `CLAUDE.md`
gives the assistant the stack, architecture, and deploy flow, so you can ask things
like:

- *"Add a new tool to the Domain page that checks `<source>` and wire it into the
  auto-run + AI insights."*
- *"Deploy the latest changes to the VPS."*
- *"Add a new investigation page for `<entity type>`."*

**Conventions Claude already knows (from `CLAUDE.md`):**
- Tool endpoints live in `app/src/app/api/tools/<id>/route.ts` and accept
  `POST { target }`, returning a flat `Record<string,string>` that the UI renders
  automatically. Add the `id` to the page's `TOOLS` array and it auto-runs.
- API keys are read from the `api_keys` table via `db.query.apiKeys`.
- AI features call Gemini through the model-fallback pattern in
  `app/src/app/api/insights/route.ts`.

---

## Architecture
```
app/src/app/(auth)/        login page
app/src/app/(app)/         authenticated shell (sidebar + mobile nav)
  dashboard | domain | person | shodan | geo | investigations | settings
app/src/app/api/
  tools/<id>/              one endpoint per OSINT tool
  shodan/ geo/             multi-step tool groups (search, cameras, overpass, …)
  insights/                Gemini analysis
  admin/ auth/ investigations/
app/src/lib/db/            SQLite schema + lazy bootstrap (tables + admin user)
app/src/middleware.ts      JWT validation → x-user-id / x-user-role headers
app/src/components/         sidebar, mobile-nav, shared InsightsPanel
```
- **DB:** SQLite via better-sqlite3 + Drizzle, initialised lazily on first query.
  Tables: `users`, `investigations`, `api_keys`, `camera_catalog`.
- **Auth:** bcrypt passwords, JWT in an HTTP-only cookie, validated in middleware.

---

## Deployment

The live deploy (Docker + Traefik on a VPS) syncs the `app/` directory and rebuilds:
```bash
rsync app/ → /opt/osint-suite/app/
docker compose build app && docker compose up -d --force-recreate app
```
Set `DOMAIN` in the server `.env` for the Traefik `Host()` rule. Full first-time
setup (Docker install, SSL certificate) is in [`DEPLOY.md`](./DEPLOY.md).

---

## Security notes

- **Use responsibly.** The Shodan/camera tooling is for security research and for
  devices you own or are authorised to test. It reports exposure *metadata* and does
  not open device feeds or use credentials. Accessing systems you don't own is
  illegal in most jurisdictions.
- Keep real credentials and API keys in `.env` (gitignored) — never commit them.
- Change the seeded admin password after first login.

---

*Self-hosted. No telemetry. Your investigations stay in your database.*
