# Metis Architecture Guide

## Overview

Metis je authorization-first recon, attack-surface mapping i reporting sloj unutar `Blackstorm Command Center` monorepa.

Osnovne komponente:
- `apps/api`: Laravel 11 REST API, queue orchestration, workflow engine, report engine, audit trail
- `apps/web`: React 18 + Vite UI za projekte, wizard, workflow runove, findings, reporte i settings
- `infra/docker`: lokalni i server-safe Docker setup, uključujući internal `go-tools` sidecar
- `scripts`: bootstrap i operativne skripte

## Workflow Engine

Novi workflow engine uvodi ove modele i tablice:
- `MetisWorkflow`
- `MetisWorkflowNode`
- `MetisWorkflowRun`
- `MetisWorkflowRunStep`
- `MetisWorkflowVariable`
- `MetisScriptTemplate`
- `MetisScriptRun`
- `MetisEmergencyOverride`
- `MetisReportTemplate`
- `MetisInfraGroup`
- `MetisInfraGroupAsset`

Workflow run context sprema named variables, npr.:
- `project.root_domains`
- `scope.verified_domains`
- `dns.records`
- `dns.reverse_map`
- `discovery.ct_subdomains`
- `discovery.search_urls`
- `resolved.host_ips`
- `host_services.http`
- `host_services.ports`
- `host_services.banners`
- `tls.certificates`
- `attack_surface.grouped_assets`
- `findings.items`
- `report.sections`
- `ai.executive_brief`

Podržani node tipovi u standardnom buildu:
- `input_scope`
- `passive_dns`
- `ct_lookup`
- `rdap_whois`
- `github_hints`
- `search_engine_recon`
- `dns_enrichment`
- `resolve_hosts`
- `live_http_probe`
- `tls_fingerprint`
- `ping_check`
- `port_scan`
- `service_fingerprint`
- `banner_grab`
- `directory_discovery`
- `wayback`
- `cti_exposure`
- `hibp_scan`
- `vuln_assessment`
- `remediation_validation`
- `iam_audit`
- `recommendation_engine`
- `report_generate`
- `export_json`
- `export_pdf`

Wizard koristi isti workflow engine. Optional nodeovi se mogu uključiti ili isključiti po runu, a novi run može `resume`-ati već dovršene nodeove iz prethodnog workflow runa.

## Guardrails

Nezaobilazna pravila:
- aktivni koraci rade samo nad verified domenama/hostovima ili eksplicitno odobrenim IP rangeovima
- emergency override je moguć samo za `SuperAdmin`, samo po-runu, s razlogom, potvrdom i audit trailom
- nema people-trackinga, dark-web crawlanja, scrapinga zatvorenih servisa ili credential harvestinga
- nema pravih exploita; validation i assessment ostaju safe i non-destructive
- secrets se spremaju enkriptirano ili maskirano, ne u plaintextu
- AI narrative i summary moraju biti grounded u evidence podacima i razlikovati `observed`, `inferred` i `recommended`

## Passive Recon and Enrichment

Standardni passive sloj pokriva:
- DNS discovery: `A`, `AAAA`, `CNAME`, `MX`, `NS`, `TXT`, `SOA`
- SPF i DMARC parsing
- CT lookup sa source taggingom
- RDAP/WHOIS ownership context
- GitHub public code hints za konfigurirane orgove i keyworde
- safe search recon s query templates fallbackom
- optional Wayback ingest koji ne blokira workflow ako padne

## Active Validation and Attack Surface Mapping

Standardni active i mapping sloj pokriva:
- host/IP resolution i reverse IP map
- HTTP/S probing s klasifikacijom web surfacea
- TLS fingerprinting i cert reuse grouping
- optional ping/reachability check
- safe-mode port scan
- banner grabbing i service fingerprinting
- directory discovery za obvious backup/default exposure slučajeve
- infrastructure grouping po shared IP-u, shared certu i provider/server hintovima

## Custom Script Engine

Script engine podržava:
- `shell`
- `python`

Svaki template definira:
- naziv i opis
- runtime
- input/output schema
- allowed target types
- execution policy
- timeout
- environment policy
- network policy
- AI interpretation prompt

UI podržava:
- library pregled
- create
- edit non-system templateova
- duplicate system templateova
- test run
- raw stdout/stderr pregled
- parsed JSON output
- AI interpretation rezultata

## Report Engine

Podržani exporti:
- `JSON`
- `HTML`
- `PDF`

Template packovi:
- `NIST-style Technical Assessment`
- `PTES-style Security Assessment Report`
- `OWASP-style Web/Exposure Findings Report`
- `Metis Executive Brief`
- `Metis Technical Recon Report`

Report builder UI podržava:
- izbor templatea
- izbor workflow snapshota
- strict evidence mode
- AI-assisted drafting
- evidence depth preview

## External Services

`Settings → External Services` je centralno mjesto za OSINT, CTI i integration konektore.

Podržani provideri u standardnom buildu:
- OpenAI
- Anthropic
- Gemini
- OpenAI-compatible
- HIBP
- Shodan
- Censys
- LeakIX
- GitHub
- Search provider / programmable search
- VirusTotal
- urlscan
- SecurityTrails
- WhoisXML API
- Slack
- Teams
- Jira
- n8n
- EDR
- IdP

Svaka kartica prikazuje:
- required/config polja
- quick setup
- usage opis
- guardrail
- official docs link
- status badge
- save/test akciju gdje je supported

## Emergency Override

Emergency override nije globalni bypass. Flow:
1. SuperAdmin kreira override na `Project → Overrides`
2. mora unijeti `reason`, `target_summary`, `targets` i potvrdu `OVERRIDE`
3. override može biti one-time i/ili s istekom
4. override se bira pri dispatchu workflowa ili active joba
5. audit log bilježi `override.created` i `override.used`
6. runovi i reportovi nose `OVERRIDE` metadata/badge

## Local Development

Preporučeni lokalni start:

```bash
cd blackstorm-command-center
./scripts/first_run.sh
```

Ručni start:

```bash
docker compose --project-directory . --env-file infra/docker/.env \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.dev.yml \
  up -d --build
docker compose --project-directory . --env-file infra/docker/.env \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.dev.yml \
  exec -T api php artisan migrate --force
docker compose --project-directory . --env-file infra/docker/.env \
  -f infra/docker/docker-compose.yml \
  -f infra/docker/docker-compose.dev.yml \
  exec -T api php artisan db:seed --force
```

Lokalni endpointi:
- defaultno `http://127.0.0.1:5173`
- defaultno `http://127.0.0.1:8000/api`
- defaultno `http://127.0.0.1:8025`
- ako je host port zauzet, `./scripts/first_run.sh` ga automatski pomakne i ispiše stvarne URL-ove na kraju

## Production Notes

Server setup ostaje kompatibilan s host-level nginx TLS terminacijom.

Bitno:
- Docker servisi ostaju loopback-bound
- frontend koristi relativni `/api`, bez production `localhost` hardcodea
- host nginx ostaje jedini javni ingress
- `db`, `redis` i `mailhog` ostaju privatni ili loopback-bound
- production-safe compose base je u repou, bez potrebe za ručnim compose patchanjem na serveru
- `/opt/metis-config` može postojati kao opcionalni override, ali nije preduvjet za deploy

Preporučeni deploy koraci:

```bash
cd /srv/blackstorm-command-center
./scripts/deploy-prod.sh
```

Opcionalni helper:

```bash
sudo ln -sf /srv/blackstorm-command-center/scripts/metis-deploy /usr/local/bin/metis-deploy
metis-deploy
```

## Adding New Tool Wrappers Safely

Ako dodaješ novi active alat:
1. dodaj wrapper u `go-tools` ili backend service sloj, ne direktno iz frontenda
2. provedi verified-scope check u API sloju prije dispatcha
3. uvedi audit log za queue, start i completion
4. output spremaj kao raw artifact + parsed JSON
5. u AI/Report sloju koristi samo minimizirani evidence context
6. ne uvodi destructive ili exploit behavior

## Migration and Env Checklist

Obavezno nakon pulla:
- `php artisan migrate --force`
- `php artisan db:seed --force`

Repo runtime env fileovi:
- `apps/api/.env`
- `apps/web/.env`
- `infra/docker/.env`

Opcionalni server-only override fileovi:
- `/opt/metis-config/apps-api.env`
- `/opt/metis-config/apps-web.env`
- `/opt/metis-config/compose.env`

Frontend env:
- `VITE_API_URL=/api`
- `VITE_PROXY_TARGET=http://127.0.0.1:8000` za lokalni non-Docker dev

Produkcijski API env minimum:
- `APP_ENV=production`
- `APP_DEBUG=false`
- `APP_URL=https://blackstorm.dariomijic.com`
- `APP_FRONTEND_URL=https://blackstorm.dariomijic.com`
- `APP_KEY=<server-only>`
- `APP_PREVIOUS_KEYS=` samo privremeno pri rotaciji
- `SANCTUM_STATEFUL_DOMAINS=blackstorm.dariomijic.com`
- `CORS_ALLOWED_ORIGINS=https://blackstorm.dariomijic.com`

Security operations i secret rotation:
- pogledaj [`SECURITY.md`](./SECURITY.md)
