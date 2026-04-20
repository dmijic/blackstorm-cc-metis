# Metis · Command Center

Autorizirana platforma za Recon & Attack Surface Management (ASM).

## Stack

| Sloj | Tehnologija |
|------|-------------|
| Backend | Laravel 11 · PHP 8.4 · Sanctum Bearer auth |
| Frontend | React 18 · Vite · Dark theme |
| Queue | Redis · Laravel queue worker |
| DB | PostgreSQL 16 |
| Tools sidecar | Go (subfinder · httpx · naabu) |
| Proxy | nginx |

Detaljna Metis dokumentacija:
- [`README-METIS.md`](./README-METIS.md) — arhitektura, workflow engine, module catalog, external services, guardrails, reports, script engine i production deploy napomene

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
3. Čeka da `api` container postane `healthy`
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

---

## ⚡ God Mode (SuperAdmin)

God Mode je posebna administrativna razina pristupa unutar Command Centera.

### Što je God Mode?

- **SuperAdmin** je najviša razina pristupa — iznad normalnog Admin korisnika
- SuperAdmin korisnik vidi oznaku `GOD MODE` na dashboardu
- SuperAdmin može dodijeliti SuperAdmin rolu drugim korisnicima
- SuperAdmin može editirati sve korisnike, uključujući druge SuperAdmin korisnike
- Svi adminovi endpointi dostupni su SuperAdminu (`isAdmin()` vraća `true` za oba)
- SuperAdmin može konfigurirati sve podržane konektore, AI providere, korisnike i module u standardnom buildu

> Napomena: u standardnom buildu SuperAdmin **ne zaobilazi** verified-scope zaštite za aktivne probe i ne otključava research placeholder module poput phishing ili post-exploitation funkcionalnosti. Passive recon i administracija su dostupni odmah, ali aktivni koraci i dalje poštuju sigurnosne guardraile.

### Automatski kreiran SuperAdmin

God Mode je **automatski uključen** putem seed korisnika koji se kreira pri prvom pokretanju:

| Polje | Vrijednost |
|-------|-----------|
| Email | `root@commandcenter.local` |
| Password | `toor` |
| Naziv | `root` |
| Role | `SuperAdmin` |

> ⚠️ **Sigurnosna napomena**: U produkcijskom okruženju odmah promijeni lozinku SuperAdmin korisnika
> ili ga deaktiviraj ako nije potreban.

### Prijava kao SuperAdmin

```bash
# API login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"root@commandcenter.local","password":"toor","device_name":"cli"}'
```

Ili putem UI-a na http://localhost:5173:
- Email: `root@commandcenter.local`
- Password: `toor`

### Kreiranje novog SuperAdmin korisnika

Samo postojeći SuperAdmin može dodijeliti SuperAdmin rolu drugom korisniku.

**Putem UI-a** (Settings → Users):
1. Prijavi se kao SuperAdmin
2. Otvori Settings → Users
3. Klikni "Add User" ili "Edit" na postojećem korisniku
4. Odaberi rolu "SuperAdmin (God Mode)"

**Putem API-a** (kao SuperAdmin korisnik):
```bash
curl -X POST http://localhost:8000/api/metis/users \
  -H "Authorization: Bearer <SUPERADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"novi_admin","email":"novi@example.local","password":"StrongPass123!","role":"SuperAdmin"}'
```

### Uloga implementacija

| Role | isAdmin() | isSuperAdmin() | Može dodijeliti SuperAdmin |
|------|-----------|----------------|---------------------------|
| SuperAdmin | ✓ | ✓ | ✓ |
| Admin | ✓ | ✗ | ✗ |
| Operator | ✗ | ✗ | ✗ |
| Analyst | ✗ | ✗ | ✗ |
| Viewer | ✗ | ✗ | ✗ |

### Resetiranje SuperAdmin lozinke

```bash
# Direktno u bazu (Docker)
docker compose -f infra/docker/docker-compose.yml exec api \
  php artisan tinker --execute="App\Models\User::where('email','root@commandcenter.local')->update(['password'=>bcrypt('nova_lozinka')])"
```

---

## Demo računi (seed)

| Korisnik | Email | Lozinka | Role |
|----------|-------|---------|------|
| root | root@commandcenter.local | toor | **SuperAdmin** |
| Admin | admin@blackstorm.local | Blackstorm123! | Admin |
| Operator | operator@blackstorm.local | Blackstorm123! | Operator |
| Analyst | analyst@blackstorm.local | Blackstorm123! | Analyst |
| Viewer | viewer@blackstorm.local | Blackstorm123! | Viewer |

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
  -d '{"email":"root@commandcenter.local","password":"toor","device_name":"cli"}'

# Korisnik (autentificiran)
curl http://localhost:8000/api/me \
  -H "Authorization: Bearer <TOKEN>"
```

> **Napomena o autentifikaciji:** Aplikacija koristi isključivo Sanctum Bearer token auth.
> Cookie-based SPA auth je namjerno isključen.

## Metis workflow

```
Projects → Scope → Verification → Smart Wizard / Workflow Engine → Entities → Findings → Report
```

### Korak po korak

1. **Kreiraj projekt** — `/metis/projects` → New Project
2. **Definiraj scope** — root domene, IP rangevi, GitHub orgs, email domene
3. **Verificiraj domene** — DNS TXT record ili `/.well-known/metis-verification/<token>`
4. **Konfiguriraj konektore po potrebi** — Settings → External Services za GitHub, HIBP, Shodan, Slack, Teams, Jira, n8n i ostale integracije; Settings → AI Providers za LLM providere
5. **Pokreni Smart Wizard** — workflow-driven lanac: passive DNS · CT · RDAP/WHOIS · GitHub hints · search recon · DNS/IP enrichment · HTTP probe · TLS · port scan · banner/service fingerprint · optional Wayback · CTI/HIBP · attack surface map · report export
6. **Pregledaj lanac rezultata** — workflow run context prenosi varijable i evidence iz jednog koraka u idući; optional nodeovi se mogu uključiti/isključiti, a isti workflow run može se ponovno iskoristiti kao resume source
7. **Pretraži entitete** — domene, hostovi i URL-ovi s DNS zapisima, IP adresama i evidence prikazom
8. **Pokreni module** — HIBP, CTI, IAM audit, remediation validation i ostale sigurne module po potrebi
9. **Logiraj findinge** — severity, type, confidence, evidence
10. **Generiraj report** — JSON/HTML/PDF s opcionalnim AI executive briefingom

### External Services konfiguracija

`Settings → External Services` je globalni katalog konektora. Svaka kartica prikazuje:

- kratke korake za konfiguraciju
- polja koja trebaš unijeti
- guardrail za taj servis
- link na službenu dokumentaciju providera

Praktični flow:

1. Otvori `Settings → External Services`
2. Nađi željeni servis, npr. `GitHub Public Code Hints`, `HIBP` ili `Shodan`
3. Unesi tražene API ključeve ili webhook URL-ove
4. Klikni `Save` i uključi `Enable`
5. Vrati se u `Project → Modules` ili `Project → Wizard`
6. Pokreni odgovarajući module ili wizard korak

Napomena:

- `External Services` služi za OSINT, CTI i webhook/integration konektore
- `AI Providers` služi samo za LLM pristup
- `Scope` mora sadržavati root domene, GitHub orgove ili email domene da bi neki konektori imali nad čime raditi

## Sigurnosne mjere

- **Samo verificirani scope**: Aktivni scanovi zahtijevaju verificirane domene
- **Bez surveillance**: Samo javno dostupni podaci — DNS, crt.sh, Wayback, RDAP, Shodan, HIBP
- **Enkriptirani API ključevi**: AES-256 via Laravel `Crypt::encryptString()`, nikad plaintext
- **Audit log**: Sve akcije se bilježe u `metis_audit_logs`
- **God Mode**: Automatski aktivan za korisnika `root` (role: SuperAdmin)

## Threat Intel integracije

Konfiguriraju se kroz Settings → External Services:

| Provider | Tip | Opis |
|----------|-----|------|
| Shodan | OSINT | IP exposures, open ports, geo |
| Censys | OSINT | Certificate & host search |
| LeakIX | OSINT | Exposed services & leaks |
| HIBP | Breach | Email domain breach lookup |
| GitHub | Paste | Code search po ključnim riječima |

## Arhitektura i deploy

- Frontend koristi relativni `/api` pristup; u lokalnom developmentu Vite proxy prosljeđuje `/api` i `/sanctum` prema backendu.
- Docker portovi su loopback-bound (`127.0.0.1`) tako da ostaju kompatibilni s host-level nginx reverse proxy modelom.
- Production ingress ostaje na host nginxu:
  - `https://blackstorm.dariomijic.com/` → `127.0.0.1:5173`
  - `https://blackstorm.dariomijic.com/api` → `127.0.0.1:8000`
  - `https://blackstorm.dariomijic.com/sanctum` → `127.0.0.1:8000`
- DB i Redis nisu javno izloženi izvan loopbacka.

## Docker kontejneri

| Kontejner | Uloga |
|-----------|-------|
| `postgres` | Baza podataka |
| `redis` | Queue i cache |
| `api` | PHP-FPM + composer install |
| `worker` | Queue worker |
| `scheduler` | Cron scheduler |
| `web` | Vite dev server |
| `proxy` | nginx reverse proxy |
| `go-tools` | Subfinder / httpx / naabu HTTP API |
| `mailhog` | SMTP catch-all za razvoj |

## Obavezne migracije i env promjene

Nakon pulla novog koda pokreni:

```bash
docker compose -f infra/docker/docker-compose.yml exec -T api php artisan migrate --force
docker compose -f infra/docker/docker-compose.yml exec -T api php artisan db:seed --force
```

Frontend env:
- `apps/web/.env.example` sada koristi `VITE_API_URL=/api`
- lokalni Vite proxy koristi `VITE_PROXY_TARGET=http://127.0.0.1:8000`
- Docker web servis postavlja `VITE_PROXY_TARGET=http://proxy`

Docker host port override:
- ako host već koristi `5432`, pokreni compose s `POSTGRES_HOST_PORT=5433`
- isto vrijedi i za ostale loopback portove: `REDIS_HOST_PORT`, `MAILHOG_SMTP_HOST_PORT`, `MAILHOG_UI_HOST_PORT`, `WEB_HOST_PORT`, `API_HOST_PORT`

Backend migracije uključuju:
- workflow engine tablice
- script engine tablice
- emergency override tablicu
- report templates
- infrastructure grouping tablice

Za detaljan opis novih workflow, script i report capabilityja pogledaj [`README-METIS.md`](./README-METIS.md).
