# Security Operations Guide

Ovaj dokument pokriva incident response, secret rotaciju, provjeru mrežne ekspozicije i održavanje production-safe deploy modela za `Blackstorm / Metis Command Center`.

## Server-only config source of truth

Tracked repozitorij ne smije sadržavati runtime tajne. Produkcijski source of truth je izvan repoa:

- `/opt/metis-config/apps-api.env`
- `/opt/metis-config/apps-web.env`
- `/opt/metis-config/compose.env` (opcionalno, za host portove i compose override varijable)

Deploy skripta kopira te fileove u repo neposredno prije `docker compose up`.

## Incident response: leaked APP_KEY

Ako je `APP_KEY` procurio:

1. Tretiraj ga kao kompromitiran.
2. Generiraj novi ključ:

```bash
php -r 'echo "base64:".base64_encode(random_bytes(32)).PHP_EOL;'
```

3. U `/opt/metis-config/apps-api.env` postavi:
   - `APP_KEY=<novi_kljuc>`
   - `APP_PREVIOUS_KEYS=<stari_kljuc>`
4. Pokreni production deploy:

```bash
/usr/local/bin/metis-deploy
```

5. Dok je `APP_PREVIOUS_KEYS` još postavljen, ponovno spremi ili rotiraj sve integracije i kredencijale koji su ranije bili enkriptirani starim ključem.
   Primjeri:
   - AI provider API ključevi
   - External service API ključevi
   - ostali Laravel `Crypt` payloadi u bazi
6. Nakon što su svi aktivni secret payloadi ponovno spremljeni pod novim ključem, ukloni stari ključ iz `APP_PREVIOUS_KEYS`.
7. Ponovno deployaj aplikaciju.

Napomena:
- `APP_PREVIOUS_KEYS` služi kao prijelazni mehanizam kompatibilnosti.
- Nemoj dugoročno ostaviti kompromitirani ključ u `APP_PREVIOUS_KEYS`.

## Što treba rotirati osim APP_KEY

APP_KEY leak ne znači automatski da su vanjski API ključevi javno procurili, ali znači da se Laravel-enkriptirani payloadi više ne smiju smatrati sigurnima dok ne odradiš rotaciju ili ponovno spremanje.

Preporučeni redoslijed:

1. novi `APP_KEY`
2. privremeni `APP_PREVIOUS_KEYS`
3. redeploy
4. ponovno spremanje svih enkriptiranih konektora
5. uklanjanje `APP_PREVIOUS_KEYS`
6. redeploy

## Manual history cleanup za kompromitirani key

Ovo nije automatizirano u repou. Maintainer mora ručno očistiti povijest ako je secret završio na GitHubu.

Opcija A: `git filter-repo`

```bash
pip install git-filter-repo
git clone --mirror git@github.com:dmijic/blackstorm-cc-metis.git
cd blackstorm-cc-metis.git
git filter-repo --path infra/docker/docker-compose.yml --replace-text <(printf 'base64:OLDKEY==>APP_KEY_REMOVED')
git push --force --mirror
```

Opcija B: BFG Repo-Cleaner

Nakon force-pusha:

1. invalidate-aj stare klonove
2. potvrdi remediation u GitGuardian/GitHub alertu
3. rotiraj key bez obzira na cleanup

## Kako provjeriti da Redis nije javno exposed

Na serveru:

```bash
ss -ltnp | grep ':6379'
```

Sigurno stanje izgleda ovako:

- `127.0.0.1:6379`
- ili ništa, ako Redis nije host-bindan

Nesigurno stanje:

- `0.0.0.0:6379`
- `[::]:6379`

Vanjska provjera sa servera ili drugog hosta:

```bash
nc -vz <server-ip> 6379
```

To bi trebalo failati izvana.

## Kako provjeriti public listening ports

Na serveru:

```bash
ss -ltnp
```

Očekivani public surface:

- `22`
- `80`
- `443`

Očekivani loopback/internal surface:

- `127.0.0.1:5173`
- `127.0.0.1:8000`
- `127.0.0.1:5432`
- `127.0.0.1:6379`
- `127.0.0.1:1025`
- `127.0.0.1:8025`

## Kako odgovoriti na hosting abuse notification

Ako dobiješ abuse prijavu za otvoreni servis:

1. potvrdi što stvarno sluša:

```bash
ss -ltnp | grep -E ':(6379|5432|1025|8025)\s'
```

2. provjeri aktivni compose config:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.prod.yml config
```

3. redeployaj produkcijski stack:

```bash
/usr/local/bin/metis-deploy
```

4. ponovno potvrdi da servis sluša samo na `127.0.0.1`
5. odgovori provideru s:
   - što je bio uzrok
   - kada je mitigirano
   - izlazom iz `ss -ltnp` ili internim zapisom provjere

## Održavanje server-only override fileova

Nemoj ručno uređivati tracked compose fileove na serveru.

Umjesto toga održavaj samo:

- `/opt/metis-config/apps-api.env`
- `/opt/metis-config/apps-web.env`
- `/opt/metis-config/compose.env`

Taj model preživljava `git pull` jer deploy skripta te fileove svaki put ponovno kopira u repo prije `docker compose up`.

## Quick verification after deploy

```bash
cd /srv/blackstorm-command-center
./scripts/verify-hardening.sh
curl -fsS http://127.0.0.1:8000/api/health
curl -fsSI http://127.0.0.1:5173
```
