# Deploying the SAK Staffing

This covers hosting on **Railway**, moving your existing data there, and moving
off Railway again later. The app is packaged as a single Docker container, so
"another server" is the same procedure with a different host.

---

## 1. How the deployment is put together

One container runs everything:

| Piece | Where it lives |
|---|---|
| REST API | `packages/backend` → compiled to `dist/`, started with `node dist/server.js` |
| Web frontend | `packages/desktop` built with Vite, served by the API at `/` |
| Public onboarding forms | served by the API at `/onboarding/:token` |
| Database | external Postgres (Railway plugin, or your own) |
| Uploaded documents | a **mounted volume** — see the warning below |

Everything host-specific comes from environment variables. There is nothing in
the image that ties it to Railway.

> ### ⚠️ Uploads must live on a volume
> Container filesystems are wiped on every deploy. If `UPLOAD_DIR` points at
> ordinary container storage, **every passport photo, national ID scan and
> contract is destroyed on the next deploy.** Mount a volume and point
> `UPLOAD_DIR` at it. This is the single most important step on this page.

---

## 2. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ | Full Postgres URL. Railway supplies this — reference the Postgres service rather than pasting it. |
| `JWT_SECRET` | ✅ | ≥32 random chars. **The server refuses to start in production without it.** |
| `JWT_REFRESH_SECRET` | ✅ | ≥32 random chars, different from the above. |
| `UPLOAD_DIR` | ✅ | Must be the volume mount path, e.g. `/data/uploads`. |
| `CORS_ORIGINS` | — | Extra browser origins. The app's own origin and `PUBLIC_URL` are always allowed; wildcards like `https://*.example.org` work. Nothing else (no `trycloudflare.com` etc.) is trusted. |
| `PUBLIC_URL` | ✅ | Public base URL. Onboarding links are generated from this. |
| `NODE_ENV` | ✅ | `production`. |
| `PORT` | — | Railway sets this automatically. |
| `DB_SSL` | — | `auto` (default): TLS for remote hosts, off for `localhost`/`*.internal`. Railway's private network needs it **off**, which `auto` handles. |
| `TRUST_PROXY` | — | Proxy hops in front of the app. Default `1` in production — correct for Railway and for nginx/cloudflared. |
| `RATE_LIMIT_MAX` | — | Requests per IP per 15 min. Default `600`. |
| `LOGIN_RATE_LIMIT_MAX` | — | Consecutive failed logins before an **account** locks (DB-backed). Default `10`. |
| `LOGIN_LOCK_MINUTES` | — | Lock duration. Default `15`. An admin password reset unlocks early. |
| `LOGIN_IP_RATE_LIMIT_MAX` | — | Failed logins per **IP** per 15 min, all usernames. Default `50`. |
| `ONBOARDING_RATE_LIMIT_MAX` | — | Public onboarding submissions per IP per hour. Default `30`. |
| `SEED_ADMIN_PASSWORD` | — | First-run `superadmin` password. If unset the seed generates and prints one. Must be changed at first sign-in. |
| `LOG_TO_FILE` | — | Defaults to off when `DATABASE_URL` is set; Railway captures stdout. |
| `ENABLE_CSP` | — | Opt-in Content-Security-Policy. See §7. |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**Do not reuse the secrets currently in `ecosystem.config.js`.** They have been
sitting in a plaintext file on the server; treat them as compromised and issue
new ones for the hosted deployment. Rotating `JWT_SECRET` logs everyone out
once, which is the intended effect.

---

## 3. First deploy to Railway

```bash
railway login
railway init                 # or: railway link   (existing project)
railway add --database postgres
```

Then, in the Railway dashboard for the **app service**:

1. **Volume** → add one, mount path `/data`.
2. **Variables** → set the values from §2. For the database, use a reference
   rather than a literal so it survives a database rebuild:

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   UPLOAD_DIR=/data/uploads
   NODE_ENV=production
   JWT_SECRET=<generated>
   JWT_REFRESH_SECRET=<generated>
   PUBLIC_URL=https://<your-domain>
   CORS_ORIGINS=https://<your-domain>
   ```

3. **Settings → Networking** → generate a domain (or attach `staff.saktech.org`).
4. Deploy:

   ```bash
   railway up
   ```

`railway.json` already points Railway at the `Dockerfile` and sets the health
check to `/health`. Migrations run automatically on every boot
(`npm run start:migrate`), so a deploy applies any new ones before serving.

---

## 4. Moving your existing data across

Two separate things move: the **database** and the **uploaded files**. Both
matter — the database rows reference filenames on disk, so restoring one
without the other leaves broken documents.

### 4a. Database

```bash
# 1. Dump the live database (run on the current server)
PGPASSWORD='<current-db-password>' pg_dump \
  -h localhost -U sak_admin -d sak_staff \
  --no-owner --no-acl --format=plain \
  > sak_staff_$(date +%F).sql

# 2. Restore into Railway Postgres
psql "$(railway variables get DATABASE_URL --service Postgres)" < sak_staff_$(date +%F).sql
```

`--no-owner --no-acl` matters: Railway's database user is not `sak_admin`, and
without those flags the restore fails on ownership statements.

**Restore into the empty database *before* the app's first boot.** The dump
already contains the `knex_migrations` table listing the applied migrations,
so the app will start up, see them, and report `Already up to date` rather than
trying to re-create tables. (This has been tested end-to-end against a copy of
your live database.)

### 4b. Uploaded files

```bash
# From the current server, with the app service running on Railway:
cd /home/mustafa/sak-staff/uploads
tar czf - . | railway ssh --service <app-service> -- "mkdir -p /data/uploads && tar xzf - -C /data/uploads"
```

If `railway ssh` is unavailable on your plan, the reliable alternative is to
move file storage to S3-compatible object storage (Cloudflare R2, Backblaze B2)
— see §8.

### 4c. Verify before switching DNS

```bash
curl https://<railway-domain>/health
```

Then log in and confirm, specifically:
- an employee's passport photo renders (proves DB rows + volume files agree),
- opening a document from **Pending Approvals** works,
- a report exports.

Only then repoint `staff.saktech.org`.

---

## 5. After the move

- **Point the desktop app at the new server.** `SAK_SERVER_URL` in
  `packages/desktop/.env.production`, then rebuild installers with
  `npm run build:app`. Existing installs keep talking to the old address until
  they are updated.
- **Fix auto-update.** `packages/desktop/package.json` has
  `build.publish.url = "http://localhost/downloads/"`, so installed clients have
  never been able to find updates. Change it to
  `https://<your-domain>/downloads/`.
- **Keep the old server running read-only** for a week or two as a fallback.

---

## 6. Backups

Railway's Postgres backups cover the database but **not the volume**. Uploaded
documents need their own backup. A weekly job from any machine:

```bash
pg_dump "$DATABASE_URL" --no-owner --no-acl | gzip > "sak-db-$(date +%F).sql.gz"
```

Test a restore into a scratch database once, now, rather than discovering a
problem during an incident.

---

## 7. Enabling CSP

`ENABLE_CSP=true` turns on a Content-Security-Policy for the app (the public
onboarding pages are exempt because they render inline scripts). It is off by
default so it can be switched on deliberately and tested. Turn it on in a
staging deploy, click through the app, and check the browser console for
`Refused to …` messages before enabling it in production.

---

## 8. Hosting on any other server

Nothing here is Railway-specific. Pick whichever fits the machine.

### 8a. Any Linux server with Docker (recommended)

**Follow [KVM-SETUP.md](KVM-SETUP.md)** – a complete walkthrough for a fresh
Ubuntu VPS (Hostinger KVM or any other), including moving your data and
automatic deploys on every `git push`.

In short, `docker-compose.yml` runs three containers: **Caddy** (HTTPS with
automatic certificates on ports 80/443), the **app**, and **PostgreSQL**. Only
Caddy is reachable from outside.

```bash
cp .env.docker.example .env.docker      # fill in; chmod 600
./deploy/deploy.sh --force              # build, start, migrate, health-check
```

On a brand-new, *empty* database only, create the first admin with
`docker compose --env-file .env.docker exec app npm run seed`. **Never run the
seed against a database that already has data** – it resets roles and
permissions.

Behind a different proxy (nginx, a Cloudflare Tunnel), remove the `caddy`
service and point the proxy at the app container on port 4000. Keep
`TRUST_PROXY=1` for a single proxy hop.

### 8b. Single container against an existing Postgres

```bash
docker build -t sak-staff .
docker run -d --restart=unless-stopped -p 4000:4000 \
  -e NODE_ENV=production \
  -e DATABASE_URL='postgres://user:pass@host:5432/sak_staff' \
  -e JWT_SECRET='...' -e JWT_REFRESH_SECRET='...' \
  -e PUBLIC_URL='https://staff.example.org' \
  -e CORS_ORIGINS='https://staff.example.org' \
  -e UPLOAD_DIR=/data/uploads \
  -v sak_uploads:/data/uploads \
  sak-staff
```

Then repeat §4 to bring the data over. The image ships `pg_dump`/`psql`, so a
dump can be taken from inside the running container.

### 8c. Without Docker (Node 20 + PM2/systemd)

```bash
npm ci
npm run build --workspace=packages/shared
npm run build --workspace=packages/backend
npm run build:renderer --workspace=packages/desktop
cd packages/backend && cp .env.example .env    # fill in; NODE_ENV=production
npm run start:migrate                          # or under pm2 / systemd
```

Keep secrets in `.env` (mode `600`) or the process manager's environment –
not in a committed file. `ecosystem.config.js` is git-ignored for this reason.

**The one thing that limits portability today** is that uploads are stored on a
local disk, which forces a volume, pins you to a single replica, and makes each
migration a manual file copy. If this system outgrows one server, switching
document storage to S3-compatible object storage removes that constraint —
it is contained work, touching only `packages/backend/src/modules/documents`
and the onboarding upload handler.

---

## 9. Migrations: important detail

Migrations run from the **TypeScript sources** via `ts-node`, in production too.
This is deliberate and load-bearing:

knex records applied migrations by filename, and this database has them all
recorded with `.ts` extensions. Running the compiled `.js` copies instead would
make knex treat every one as brand new and re-run them against populated tables.

That is why `ts-node`, `typescript` and `cross-env` are runtime dependencies of
`packages/backend` rather than dev dependencies. Do not "optimise" them away
without first renaming the rows in `knex_migrations`.

---

## 10. Security model (read before going live)

This system holds national IDs, salaries, medical notes and appraisals. These
controls are built in; the checklist below is what *you* must do.

**Authentication & sessions**
- Passwords: ≥10 characters with a letter and a number, not containing the
  username, bcrypt-hashed (cost 12).
- Accounts lock after `LOGIN_RATE_LIMIT_MAX` consecutive failures; IP-level
  limiting stops password spraying. Unknown usernames take the same time to
  reject as wrong passwords.
- Every request is checked against the database (≤15 s cache): deactivating a
  user, changing their role, or resetting/changing a password takes effect
  **immediately** – old tokens stop working. "Sign out everywhere" exists via
  `POST /api/auth/logout {"everywhere":true}`.
- New users and admin-reset passwords are temporary: the API refuses everything
  except changing the password until the user picks their own.
- Only a Super Admin can create, reset or deactivate a Super Admin; nobody can
  deactivate themselves.

**Authorisation** – every data route requires a role permission, including
`/api/sync` (which used to return every table, salaries included, to any
logged-in user) and `/api/analytics`.

**Data exposure** – uploaded documents are never served statically; API
responses are `Cache-Control: no-store`; public onboarding pages escape all
data (stored XSS fixed) and are rate limited; print/report pop-ups run under a
script-blocking CSP; Electron only opens `http(s)` links externally.

**Your go-live checklist**
1. Change the `superadmin` password now if it is still `Admin@SAK2026` – that
   password is in this public repository's history. Migration 037 forces a
   change at next login if it detects it.
2. Generate fresh `JWT_SECRET` / `JWT_REFRESH_SECRET` and DB password; never
   reuse values that have been in `ecosystem.config.js` or chat/email.
3. Serve only over HTTPS (§8a). Never expose Postgres (port 5432) publicly.
4. Consider making the GitHub repository **private**.
5. Back up the database *and* the uploads volume, encrypted, off-site (§6),
   and test a restore.
6. Give each person their own account with the least-privileged role; disable
   accounts the day someone leaves.
7. Review `logs`/stdout for repeated `Failed login` and `account locked` lines.
8. Optionally enable `ENABLE_CSP=true` after testing (§7).
