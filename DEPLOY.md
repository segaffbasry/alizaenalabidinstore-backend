# Deployment — Oracle Cloud A1 + Coolify

Production deployment of this Medusa v2 (2.15.x) backend. The Next.js
storefront (`alizaenalabidin-web`) lives on Vercel and only consumes the API.

## Architecture

```
Cloudflare DNS (api.alizaenalabidin.com)
        │
Oracle A1 instance — Ubuntu 24.04 aarch64, 4 OCPU / 24GB, Singapore
        │
Coolify (reverse proxy + Let's Encrypt SSL, dashboard on :8000)
        │
docker-compose stack (one bridge network "medusa"):
  medusa-server   MEDUSA_WORKER_MODE=server  → HTTP API + /app admin, port 9000
  medusa-worker   MEDUSA_WORKER_MODE=worker  → jobs, subscribers, scheduled workflows
  postgres:16     volume postgres_data
  redis:7         volume redis_data (AOF persistence, noeviction — required by BullMQ)
  shared volume medusa_uploads → /app/static (file-local upload provider)
```

server and worker run the **same image**. The server runs
`medusa db:migrate && medusa start`; the worker runs only `medusa start`
(no migration race). The admin SPA is disabled in worker mode.

## Why the build works here (and didn't on Railway)

`medusa build` installs all devDeps and runs a Vite admin build — that memory
spike exceeded Railway's free-tier build budget. The old workaround committed
`.medusa/server` artifacts to git with the Railway URL baked into the admin
bundle. This branch builds inside Docker on the 24GB box instead; build
artifacts are no longer committed.

**Gotcha:** `admin.backendUrl` is baked into the admin SPA **at build time**
from `MEDUSA_BACKEND_URL`. It must be set as a **build variable** in Coolify,
not just a runtime variable. If the admin login loops or calls the wrong host,
this is why — rebuild with the correct value.

## Environment variables

Set in Coolify → the application → Environment Variables. See `.env.example`.

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | compose assembles `DATABASE_URL` from these; password is a secret |
| `REDIS_URL` | `redis://redis:6379` (service name on the compose network) |
| `MEDUSA_BACKEND_URL` | `https://api.alizaenalabidin.com` — **mark as Build Variable too** |
| `JWT_SECRET` / `COOKIE_SECRET` | secrets, `openssl rand -base64 48` |
| `STORE_CORS` | storefront origins, e.g. `https://alizaenalabidin.com,https://www.alizaenalabidin.com` |
| `ADMIN_CORS` | `https://api.alizaenalabidin.com` (admin is served from the backend domain) |
| `AUTH_CORS` | union of admin + store origins |
| `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` | secrets |
| `MIDTRANS_IS_PRODUCTION` | `true` once live |
| `MEDUSA_WORKER_MODE` / `DISABLE_MEDUSA_ADMIN` | set per-service inside docker-compose.yml — do not set globally |

Storefront (Vercel): `NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.alizaenalabidin.com`
(and `MEDUSA_BACKEND_HOSTNAME=api.alizaenalabidin.com` for Next image config).

## The Oracle iptables fix (do this FIRST on any new instance)

Ubuntu images on OCI ship iptables rules that **REJECT all inbound traffic
except SSH** — even when the VCN security list allows it. Coolify/HTTP will be
unreachable until:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80   -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443  -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 8000 -j ACCEPT
sudo apt-get install -y iptables-persistent   # answer Yes to save current rules
sudo netfilter-persistent save
```

VCN security list must also allow TCP 22/80/443/8000 from 0.0.0.0/0
(Networking → VCN → Security Lists in the Oracle console).

## How to redeploy

Push to the deployment branch → Coolify auto-deploys (if the webhook is on),
or open Coolify → application → **Deploy**. Coolify rebuilds the image and
recreates containers; postgres/redis/uploads volumes persist.

## Migrations

The server container runs `medusa db:migrate` on every start, so a normal
redeploy applies new migrations. To run manually:

```bash
# via Coolify UI: application → medusa-server → Terminal, or over SSH:
docker exec -it $(docker ps -qf name=medusa-server) npx medusa db:migrate
```

Create an admin user:

```bash
docker exec -it $(docker ps -qf name=medusa-server) \
  npx medusa user -e admin@example.com -p <password>
```

## Postgres backups

```bash
# Manual backup (run over SSH on the host)
docker exec $(docker ps -qf name=postgres) \
  pg_dump -U medusa -d medusa -F c -f /tmp/medusa.dump
docker cp $(docker ps -qf name=postgres):/tmp/medusa.dump ./medusa-$(date +%F).dump

# Restore
docker cp medusa-YYYY-MM-DD.dump $(docker ps -qf name=postgres):/tmp/restore.dump
docker exec $(docker ps -qf name=postgres) \
  pg_restore -U medusa -d medusa --clean --if-exists /tmp/restore.dump
```

Coolify also has built-in scheduled database backups (application → Backups)
— configure a daily dump there, and download a copy off-box periodically.
Don't forget the `medusa_uploads` volume (product images):
`docker run --rm -v medusa_uploads:/data -v $PWD:/out alpine tar czf /out/uploads-$(date +%F).tgz -C /data .`

## DNS / SSL

`api.alizaenalabidin.com` → A record → instance public IP, **DNS-only (grey
cloud)** while Coolify issues the Let's Encrypt cert. After issuance the
Cloudflare proxy (orange cloud) may be enabled with SSL mode **Full (strict)**
— never "Flexible" (redirect loops).

## Local development

Unchanged: `npm run dev`. Without `REDIS_URL` set, the config falls back to
in-memory cache/event-bus/workflow modules, so no local Redis is needed.
