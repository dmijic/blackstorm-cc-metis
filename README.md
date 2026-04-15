# blackstorm-command-center

Monorepo za Command Center platformu:
- `apps/api` Laravel 11 API
- `apps/web` React + Vite frontend (temeljeno na `black-dashboard-react-master.zip`)
- `packages` mjesto za buduće shared module
- `infra/docker` Docker Compose i proxy konfiguracija

## Preduvjeti
- Docker + Docker Compose v2
- Make (opcionalno, za kraće komande)

## Repo struktura
```text
blackstorm-command-center/
├── apps/
│   ├── api/
│   └── web/
├── infra/
│   └── docker/
│       ├── docker-compose.yml
│       ├── php/Dockerfile
│       └── proxy/default.conf
├── packages/
├── scripts/first_run.sh
└── Makefile
```

## First Run
```bash
cd blackstorm-command-center
./scripts/first_run.sh
```

Alternativa:
```bash
make first-run
```

`first_run.sh` radi:
- kreira `apps/api/.env` i `apps/web/.env` iz `.env.example` ako ne postoje
- podiže docker stack
- generira Laravel app key
- radi migracije i seed

## Pokretanje stacka (ručno)
```bash
docker compose -f infra/docker/docker-compose.yml up -d --build
```

Ili:
```bash
make up
```

## Korisni Make targeti
- `make up`
- `make down`
- `make logs`
- `make migrate`
- `make seed`
- `make test`

## URL-ovi (dev)
- API (nginx proxy): `http://localhost:8000`
- Web (Vite): `http://localhost:5173`
- MailHog UI: `http://localhost:8025`

## Demo credovi
Svi korisnici imaju lozinku: `Blackstorm123!`

- Admin: `admin@blackstorm.local`
- Operator: `operator@blackstorm.local`
- Analyst: `analyst@blackstorm.local`
- Viewer: `viewer@blackstorm.local`

## Minimalni endpointi
- `GET /api/health`
- `GET /api/me` (zahtijeva Sanctum Bearer token)

Auth helper endpointi:
- `POST /api/auth/login` (rate limited)
- `POST /api/auth/logout` (auth:sanctum)

Primjer login:
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@blackstorm.local","password":"Blackstorm123!","device_name":"cli"}'
```

Primjer `/api/me`:
```bash
curl http://localhost:8000/api/me \
  -H "Authorization: Bearer <TOKEN>"
```

## Security baseline
- Laravel Sanctum token auth
- role field na useru: `Admin`, `Operator`, `Analyst`, `Viewer`
- hashiranje lozinki (`bcrypt` / Laravel hashing)
- server-side validacija login payloada
- auth rate limiting (`5/min` po email+IP)
- CORS konfiguracija za web dev origin
- secure response headers kroz middleware
