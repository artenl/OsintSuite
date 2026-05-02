# OSINT Suite

Self-hosted OSINT investigation platform running on a Hostinger VPS.

## Stack
- Next.js 15 (App Router) + TypeScript + Tailwind v4
- SQLite + Drizzle ORM (better-sqlite3)
- JWT auth (jose), bcrypt passwords, HTTP-only cookies
- Docker Compose + Traefik (pre-installed on Hostinger VPS)

## Deployment
- VPS: ***REMOVED-IP*** (Debian 13, Frankfurt)
- URL: https://your-domain.example.com
- SSH key: ***REMOVED-KEY-PATH*** (ed25519)
- Deploy: `rsync` app/ → /opt/osint-suite/app/ then `docker compose build app && docker compose up -d --force-recreate app`

## Dev
```
cd app && npm run dev   # port 3000
```

## Architecture
- `app/src/app/(auth)/` — login page
- `app/src/app/(app)/` — authenticated shell (sidebar + mobile bottom nav)
- `app/src/app/api/tools/` — OSINT tool endpoints (dns, geoip, ssl, headers, whois, shodan, username, email)
- `app/src/app/api/admin/` — user management, API keys, credits
- `app/src/lib/db/` — SQLite schema + bootstrap (creates tables + admin user on first run)
- `app/src/middleware.ts` — JWT validation, injects x-user-id/x-user-role headers

## Admin credentials
- Username: admin / Password: ***REMOVED***
- DB seeded from env vars (ADMIN_USERNAME, ADMIN_PASSWORD) on first run

## API Keys stored in DB
- virustotal, shodan, hibp, urlscan
