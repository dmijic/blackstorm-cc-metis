# Metis · Blackstorm Command Center

Autorizirana platforma za Recon & Attack Surface Management (ASM) s Command Center UX-om.

## Stack

| Sloj | Tehnologija |
|------|-------------|
| Backend | Laravel 11 · PHP 8.4 · Sanctum Bearer auth |
| Frontend | React 18 · Vite · Black Dashboard (dark theme) |
| Queue | Redis · Laravel queue worker |
| DB | PostgreSQL 16 |
| Tools sidecar | Go (subfinder · httpx · naabu) |
| Proxy | nginx |

## Preduvjeti

- Docker + Docker Compose v2
- Make (opcionalno)

## Struktura repozitorija

```
blackstorm-command-center/
├── apps/
│   ├── api/                      Laravel 11 API
│   └── web/                      React + Vite frontend
├── infra/
│   └── docker/
│       ├── docker-compose.yml
│       ├── go-tools/             Subfinder/httpx/naabu HTTP wrapper
│       ├── php/Dockerfile
│       └── proxy/default.conf
├── scripts/
│   └── first_run.sh              Inicijalno postavljanje
└── Makefile
```

## Pokretanje (first run)

```bash
cd blackstorm-command-center
./scripts/first_run.sh
```

Ili:

```bash
make first-run
```

Skripta automatski:
1. Kreira `.env` iz `.env.example` (ako postoji)
2. Builda i podiže cijeli Docker stack
3. Čeka da `api` container postane `healthy` (composer install + php-fpm)
4. Popravlja storage/cache permissione
5. Generira Laravel app key (samo ako nije postavljen)
6. Čisti config i cache
7. Pokreće sve migracije
8. Seeda bazu

## URL-ovi (dev)

| Servis | URL |
|--------|-----|
| Frontend (Vite) | http://localhost:5173 |
| API (nginx) | http://localhost:8000 |
| MailHog | http://localhost:8025 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

## Demo računi

Lozinka za sve: `Blackstorm123!`

| Korisnik | Email |
|----------|-------|
| Admin | admin@blackstorm.local |
| Operator | operator@blackstorm.local |
| Analyst | analyst@blackstorm.local |
| Viewer | viewer@blackstorm.local |

## Make targeti

```bash
make first-run   # inicijalno postavljanje
make up          # docker compose up -d
make down        # docker compose down
make logs        # praćenje logova
make migrate     # php artisan migrate
make seed        # php artisan db:seed
make test        # phpunit
```

## Ručne artisan komande

```bash
# Migracije
docker compose -f infra/docker/docker-compose.yml exec api php artisan migrate

# Seed
docker compose -f infra/docker/docker-compose.yml exec api php artisan db:seed

# Čišćenje cachea
docker compose -f infra/docker/docker-compose.yml exec api php artisan config:clear
docker compose -f infra/docker/docker-compose.yml exec api php artisan cache:clear

# Queue worker (manualno, obično ga pokreće worker container)
docker compose -f infra/docker/docker-compose.yml exec api php artisan queue:work redis
```

## Auth API

```bash
# Login — vraća Bearer token
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@blackstorm.local","password":"Blackstorm123!","device_name":"cli"}'

# Korisnik (autentificiran)
curl http://localhost:8000/api/me \
  -H "Authorization: Bearer <TOKEN>"
```

> **Napomena o autentifikaciji:** Aplikacija koristi isključivo Sanctum Bearer token auth.
> Cookie-based SPA auth (`statefulApi`) je namjerno isključen jer uzrokuje CSRF token mismatch
> greške kad browser akumulira session cookie, a React klient ne šalje XSRF-TOKEN header.

## Metis workflow

```
Projects → Scope → Domain Verification → Wizard Pipeline → Entities → Findings → Report
```

### Korak po korak

1. **Kreiraj projekt** — `/metis/projects` → New Project
2. **Definiraj scope** — root domene, IP rangevi, GitHub orgs, email domene
3. **Verificiraj domene** — DNS TXT record ili `/.well-known/metis-verification/<token>`
4. **Pokreni wizard** — DNS · CT · Subfinder · GitHub hints · HTTP probe · Port scan · Wayback
5. **Pretraži entitete** — Domene, hostovi, URL-ovi s layer toggleovima
6. **Logiraj findinge** — severity, type, confidence, evidence
7. **Generiraj report** — JSON/HTML s opcijalnim AI executive briefinigom

## Sigurnosne mjere

- **Samo verificirani scope**: Aktivni scanovi (HTTP probe, port scan) zahtijevaju verificirane domene
- **Bez surveillance**: Samo javno dostupni podaci — DNS, crt.sh, Wayback, RDAP, Shodan, HIBP
- **Enkriptirani API ključevi**: AES-256 via Laravel `Crypt::encryptString()`, nikad plaintext
- **Audit log**: Sve akcije se bilježe u `metis_audit_logs`
- **God Mode**: Samo super-admin može postaviti `METIS_GOD_MODE=true`

## Threat Intel integracije

Konfiguriraju se kroz Settings → Intel Providers:

| Provider | Tip | Opis |
|----------|-----|------|
| Shodan | OSINT | IP exposures, open ports, geo |
| Censys | OSINT | Certificate & host search |
| LeakIX | OSINT | Exposed services & leaks |
| HIBP | Breach | Email domain breach lookup |
| Flare / SpyCloud / DarkOwl | Dark web | Komercijalni dark web monitoring |
| GitHub | Paste | Code search po ključnim riječima |
| Telegram Bot | Channel | Monitoring threat intel kanala |

## Docker kontejneri

| Kontejner | Uloga |
|-----------|-------|
| `postgres` | Baza podataka |
| `redis` | Queue i cache |
| `api` | PHP-FPM + composer install |
| `worker` | Queue worker (čeka `api: healthy`) |
| `scheduler` | Cron scheduler (čeka `api: healthy`) |
| `web` | Vite dev server |
| `proxy` | nginx reverse proxy |
| `go-tools` | Subfinder / httpx / naabu HTTP API |
| `mailhog` | SMTP catch-all za razvoj |

> `worker` i `scheduler` NE pokreću `composer install` — dijele `/var/www` volumen s `api`
> containerom koji jedini instalira dependencije. Ovo sprječava race condition koji je uzrokovao
> restart loop.
