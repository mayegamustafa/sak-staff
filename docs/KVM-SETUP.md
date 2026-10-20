# Hosting SAK Staffing on a Hostinger KVM VPS

From a brand-new VPS to a live system that updates itself whenever you push to
GitHub. Once you finish, **your own computer is no longer part of the system** –
it can be off. Budget about two hours the first time.

```
 staff (browser / desktop app)
        │ HTTPS
        ▼
 ┌──────────── VPS (Ubuntu 24.04) ───────────────┐
 │  caddy  ── HTTPS certificates, ports 80/443   │
 │    │                                          │
 │  app    ── API + web app (not reachable       │
 │    │       from the internet directly)        │
 │  db     ── PostgreSQL (internal only)         │
 │                                               │
 │  /var/backups/sak-staffing  ← nightly backups │
 └───────────────────────────────────────────────┘
        ▲
        │ "update now" (SSH, can only run deploy.sh)
 GitHub Actions ← you: git push
```

Commands are marked with where to run them:
- 💻 **your computer**
- 🖥 **server**, logged in as `sakadmin`
- 🚀 **server, as the deploy user**: first run `sudo -iu deploy`, then `cd /opt/sak-staffing`

---

## Step 0 – Before buying: make an SSH key

An SSH key lets you log in without a password, and password logins will be
switched off. 💻

```bash
ls ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -C "mustafa-laptop"
cat ~/.ssh/id_ed25519.pub        # copy this whole line
```

**Back up `~/.ssh/id_ed25519`** (for example on an encrypted USB stick). If you
lose it you can only get back in through Hostinger's browser console.

## Step 1 – Create the VPS (Hostinger panel)

- **Plan:** KVM 1 is enough (you can upgrade later without reinstalling).
- **Location:** a European data centre (closest to Uganda).
- **Operating system:** plain **Ubuntu 24.04** – *not* a panel or app template.
- **SSH key:** paste the line from Step 0.
- **Root password:** set a long random one and store it in a password manager.

Write down the server's **IP address**.

## Step 2 – Prepare the server (one script)

The setup script comes from your GitHub repository, so first push the latest
code (it contains the `deploy/` folder). Then 💻:

```bash
ssh root@<IP>
```

On the server, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/mayegamustafa/sak-staff/main/deploy/server-setup.sh -o setup.sh
less setup.sh          # read what it does (q to quit)
bash setup.sh
```

The script:
- updates Ubuntu and turns on automatic security updates
- installs Docker
- opens only ports 22, 80 and 443
- enables fail2ban
- creates your login `sakadmin` and a restricted `deploy` user
- turns off root and password logins
- downloads the app to `/opt/sak-staffing`

**Keep that root window open** and check in a **new** terminal 💻:

```bash
ssh sakadmin@<IP>
```

If that works, close the root session. From now on you always log in as `sakadmin`.

## Step 3 – Secrets

🚀 (`sudo -iu deploy`, then `cd /opt/sak-staffing`):

```bash
cp .env.docker.example .env.docker
chmod 600 .env.docker
for v in DB_PASSWORD JWT_SECRET JWT_REFRESH_SECRET; do
  sed -i "s/^$v=.*/$v=$(openssl rand -hex 32)/" .env.docker
done
nano .env.docker       # check DOMAIN=staff.saktech.org, save with Ctrl+O, Ctrl+X
```

These secrets exist only in this file on the server. Don't paste them into
chat, email or GitHub.

## Step 4 – Move your existing data

The system is briefly offline while you do this (about 15–30 minutes), so pick a
quiet time.

**4a. Stop the live system on your computer and export everything.** 💻

```bash
pm2 stop sak-backend                     # stop changes while you copy
cd ~
PGPASSWORD='<current DB password>' pg_dump -h localhost -U sak_admin -d sak_staff -Fc -f sak_staff.dump
tar czf sak_uploads.tar.gz \
  -C /home/mustafa/sak-staff/uploads . \
  -C /home/mustafa/sak-staff/packages/backend/uploads .
scp sak_staff.dump sak_uploads.tar.gz sakadmin@<IP>:/tmp/
```

(Both upload folders are included on purpose. It isn't yet confirmed which one
the database's documents point to, and the filenames don't clash.)

**4b. Import on the server.** First 🖥 (as `sakadmin`):

```bash
sudo install -o deploy -g deploy -m 600 /tmp/sak_staff.dump /tmp/sak_uploads.tar.gz /home/deploy/
sudo rm /tmp/sak_staff.dump /tmp/sak_uploads.tar.gz
```

Then 🚀:

```bash
docker compose --env-file .env.docker up -d db
sleep 10
docker compose --env-file .env.docker exec -T db \
  pg_restore -U sak_admin -d sak_staff --no-owner --no-privileges < ~/sak_staff.dump

docker compose --env-file .env.docker build app
docker compose --env-file .env.docker run --rm --no-deps -T --entrypoint tar app \
  xzf - -C /data/uploads < ~/sak_uploads.tar.gz
```

**Do not run `npm run seed`.** That is only for an empty database, and it
would reset roles and permissions.

## Step 5 – Start it

🚀

```bash
./deploy/deploy.sh --force
```

This builds the app, starts all three containers, applies the new database
migrations and waits until the app reports healthy. Then check it:

```bash
docker compose --env-file .env.docker ps          # all "running" / app "healthy"
docker compose --env-file .env.docker exec -T app \
  node -e "fetch('http://localhost:4000/health/ready').then(r=>r.text()).then(console.log)"
```

## Step 6 – Point staff.saktech.org at the VPS (Cloudflare)

1. **Zero Trust → Networks → Tunnels →** your tunnel **→ Public hostnames:**
   delete `staff.saktech.org`.
2. **DNS → Records:** add `A` · name `staff` · IPv4 `<IP>` ·
   proxy status **DNS only** (grey cloud).

Within a few minutes Caddy obtains the HTTPS certificate on its own. To watch it 🚀:
`docker compose --env-file .env.docker logs -f caddy` (Ctrl+C to stop).

Open **https://staff.saktech.org** and check that:
- you can sign in (`superadmin` is asked to choose a new password if it still
  had the old default),
- a staff member's photo and documents open,
- a report exports.

Then retire the old setup on your computer 💻:

```bash
pm2 stop sak-tunnel && pm2 save
```

Keep the old database on your computer for a couple of weeks as a fallback,
then delete it and the dump files.

## Step 7 – Automatic updates from GitHub

From now on, a `git push` to `main` updates the live system automatically.

**7a. A key that can only trigger deploys.** 💻

```bash
ssh-keygen -t ed25519 -f ~/.ssh/sak_deploy -N "" -C "github-deploy"
echo "command=\"/opt/sak-staffing/deploy/deploy.sh\",restrict $(cat ~/.ssh/sak_deploy.pub)" \
  | ssh sakadmin@<IP> "sudo tee -a /home/deploy/.ssh/authorized_keys"
ssh-keyscan -t ed25519 <IP> > ~/sak_known_hosts
```

`command=…,restrict` means this key can do exactly one thing: run the deploy
script. Even if it ever leaked, nobody could use it to get a shell, read data or
change anything else.

**7b. Give GitHub the key.** On GitHub, open the repo → **Settings → Secrets and
variables → Actions**.

*Secrets* tab → **New repository secret**, three times:

| Name | Value |
|---|---|
| `DEPLOY_HOST` | the server IP |
| `DEPLOY_SSH_KEY` | everything in `~/.ssh/sak_deploy` (the file **without** `.pub`) |
| `DEPLOY_KNOWN_HOSTS` | everything in `~/sak_known_hosts` |

*Variables* tab → **New repository variable**: `DEPLOY_ENABLED` = `true`.

Then delete the private key from your computer – GitHub has it now:
`rm ~/.ssh/sak_deploy ~/sak_known_hosts`

**7c. Test it.** Go to the **Actions** tab, open **Check & deploy**, click
**Run workflow**, and watch it finish green.

### What happens on every push

1. GitHub checks that everything compiles. If it doesn't, nothing is deployed.
2. The server backs up the database.
3. It builds the new version while the old one keeps serving.
4. It swaps containers (a few seconds of downtime) and runs migrations.
5. It waits for the health check. **If the new version fails, it automatically
   goes back to the previous code** and the Action shows red.

For an extra safety step, go to **Settings → Environments → production** and
add yourself as a *required reviewer*. Each deploy then waits for you to
click **Approve**.

## Step 8 – Backups

**Nightly on the server.** 🚀 Run `crontab -e`, add this line and save:

```
30 2 * * * /opt/sak-staffing/deploy/backup.sh >> /var/backups/sak-staffing/backup.log 2>&1
```

This keeps 14 days of database and document backups, plus a backup before
every deploy.

**Off the server, weekly.** If the VPS itself is lost, you need a copy
somewhere else. 💻

```bash
rsync -a --rsync-path="sudo rsync" sakadmin@<IP>:/var/backups/sak-staffing/ ~/sak-backups/
```

Keep that folder encrypted (for example an encrypted disk or VeraCrypt volume);
it contains everyone's personal data. In the Hostinger panel, also turn on
**VPS backups/snapshots** if your plan includes them.

**Test a restore once**, now, rather than during an emergency. Restore into a
scratch database, or onto a second cheap VPS, using the command at the top of
`deploy/backup.sh`.

## Step 9 – Monitoring (free, 5 minutes)

Create a free account at uptimerobot.com (or similar) and add an HTTPS monitor
for `https://staff.saktech.org/health/ready`. You get an email or SMS if the
site or its database goes down.

---

## Everyday commands

🚀 (`sudo -iu deploy`, then `cd /opt/sak-staffing`). To save typing, run
`alias dc='docker compose --env-file .env.docker'` first.

| Task | Command |
|---|---|
| Status | `dc ps` |
| Live logs | `dc logs -f app` |
| Restart the app | `dc restart app` |
| Deploy by hand | `./deploy/deploy.sh` (add `--force` to rebuild anyway) |
| Backup now | `./deploy/backup.sh manual` |
| Undo a bad release | on your computer: `git revert <commit>` then `git push` (deploys the fix) |
| Disk space | `df -h` and `docker system df` |
| Database shell | `dc exec db psql -U sak_admin sak_staff` |

**Server security updates** install automatically. Reboot about once a month
(🖥 `sudo reboot`); everything restarts on its own.

**Desktop installers:** copy `.deb`, `.exe` or `.AppImage` files into
`/opt/sak-staffing/downloads/` and they appear on the login page. Rebuild them
with `SAK_SERVER_URL=https://staff.saktech.org` first (see DEPLOYMENT.md §5).

## If something goes wrong

- **Action red at "check":** the code doesn't compile. Nothing was deployed;
  fix it and push again.
- **Action red at "deploy":** open the log. It either failed to build (live
  system untouched) or failed its health check and rolled back. Look at
  `dc logs --tail=100 app`.
- **Site down, server reachable:** `dc ps`, then `dc logs app`, then
  `dc up -d`.
- **Can't SSH in:** use Hostinger panel → VPS → **Browser terminal**.
- **Need the data from before a deploy:** `ls /var/backups/sak-staffing`, then
  run the restore command at the top of `deploy/backup.sh`.
