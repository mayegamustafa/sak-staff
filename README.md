# SAK Staff Profiling System

> **Sir Apollo Kaggwa Schools** — Digital staff management platform  
> Web app (PWA) · Electron desktop · Node.js backend

---

## Platform Support

| OS | Web Browser | Desktop App | Backend |
|---|---|---|---|
| **Linux (Ubuntu 20.04+)** | ✅ | ✅ AppImage / .deb | ✅ |
| **Windows 10/11** | ✅ | ✅ .exe (NSIS installer / portable) | ✅ |
| **macOS 12+** | ✅ | ✅ .dmg (Intel & Apple Silicon) | ✅ |

---

## Prerequisites

| Tool | Version | Download |
|---|---|---|
| Node.js | ≥ 18 LTS | https://nodejs.org |
| npm | ≥ 9 | Bundled with Node.js |
| PostgreSQL | ≥ 14 | https://www.postgresql.org/download/ |
| Git | any | https://git-scm.com |

### Windows extras
- **Git Bash** — use it for all commands below (included with Git for Windows)
- **Visual C++ Build Tools** (needed to compile `better-sqlite3`):
  ```
  winget install Microsoft.VisualStudio.2022.BuildTools
  ```
  or https://visualstudio.microsoft.com/visual-cpp-build-tools/ → tick **"Desktop development with C++"**

### Linux extras (Ubuntu/Debian)
```bash
sudo apt update && sudo apt install -y build-essential python3 postgresql postgresql-contrib
```

### macOS extras
```bash
xcode-select --install
brew install postgresql@14
brew services start postgresql@14
```

---

## Quick Start

### 1. Clone
```bash
git clone https://github.com/mayegamustafa/sak-staff.git
cd sak-staff
```

### 2. Install dependencies
```bash
npm install
```
> The `postinstall` hook rebuilds `better-sqlite3` for the correct Electron ABI automatically.

### 3. Configure environment

```bash
# Backend
cp packages/backend/.env.example packages/backend/.env

# Desktop / Web
cp packages/desktop/.env.example packages/desktop/.env
```

Edit `packages/backend/.env`: set `DB_PASSWORD`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.  
`VITE_SERVER_URL=http://localhost:4000` in `packages/desktop/.env` is correct for local dev.

### 4. Create PostgreSQL database

**Linux / macOS**
```bash
sudo -u postgres psql << 'SQL'
CREATE USER sak_admin WITH PASSWORD 'your_secure_password';
CREATE DATABASE sak_staff OWNER sak_admin;
GRANT ALL PRIVILEGES ON DATABASE sak_staff TO sak_admin;
\q
SQL
```

**Windows** — open **psql** from the Start menu (PostgreSQL → SQL Shell):
```sql
CREATE USER sak_admin WITH PASSWORD 'your_secure_password';
CREATE DATABASE sak_staff OWNER sak_admin;
GRANT ALL PRIVILEGES ON DATABASE sak_staff TO sak_admin;
\q
```

Ensure the password matches `DB_PASSWORD` in `.env`.

### 5. Migrate & seed
```bash
npm run db:migrate
npm run db:seed
```

Default superadmin login: **username** `superadmin` / **password** `Admin@SAK2026`

### 6. Run dev servers

Terminal 1 — backend:
```bash
npm run backend          # http://localhost:4000
```

Terminal 2 — web / desktop:
```bash
npm run desktop          # http://localhost:5173
```

Open **http://localhost:5173** in any browser.  
The app shows an "Install Desktop App" banner when opened in a browser.

---

## Building Distributables

Generate app icons (run once):
```bash
npm run icons:generate --workspace=packages/desktop
```

Build for your current platform:
```bash
npm run build:app          # shortcut from project root
# or
npm run build --workspace=packages/desktop
```

> **Before building** make sure `VITE_SERVER_URL` in `packages/desktop/.env` points to your
> production backend (e.g. `http://192.168.1.50:4000`).  
> The packaged app bakes this URL in at build time.

| Platform | Output in `packages/desktop/release/` |
|---|---|
| Linux | `*.AppImage`, `*.deb` |
| Windows | `*Setup*.exe`, portable `.exe` |
| macOS | `*.dmg` (x64 + arm64) |

### Installing the built package

**Linux AppImage** (no install needed — just run it):
```bash
chmod +x "SAK Staff System-1.0.0.AppImage"
./"SAK Staff System-1.0.0.AppImage"
```

**Linux .deb** (installs to `/opt/`, adds launcher to application menu):
```bash
sudo dpkg -i "sak-staff-system_1.0.0_amd64.deb"
```

**Windows** — double-click the `*Setup*.exe` → follow the installer wizard.  
The app appears in the Start menu as **SAK Staff System**.

### macOS `.icns` icon (run on a Mac)
```bash
mkdir icon.iconset
for s in 16 32 64 128 256 512 1024; do
  sips -z $s $s packages/desktop/public/sak.jpg \
    --out icon.iconset/icon_${s}x${s}.png
done
iconutil -c icns icon.iconset -o packages/desktop/assets/icons/icon.icns
rm -rf icon.iconset
```

---

## Repository Structure

```
sak-staff/
├── packages/
│   ├── backend/          Express + TypeScript REST API (PostgreSQL)
│   ├── desktop/          Electron + React + Vite (also works as PWA in browser)
│   │   ├── electron/     Main process, preload, IPC, SQLite offline sync
│   │   ├── src/          React app (pages, components, stores, browser shim)
│   │   ├── public/       Static assets (sak.jpg badge, PWA manifest)
│   │   └── assets/icons/ Platform icons (run icons:generate to populate)
│   ├── shared/           Shared TypeScript types & RBAC constants
│   └── mobile/           React Native app (future)
├── .gitattributes        Cross-platform LF line endings
└── README.md
```

---

## Root npm Scripts

| Command | Description |
|---|---|
| `npm run backend` | Start backend dev server (port 4000) |
| `npm run desktop` | Start web/desktop dev server (port 5173) |
| `npm run build:app` | Build desktop installer for current platform |
| `npm run db:migrate` | Run all pending database migrations |
| `npm run db:seed` | Seed roles, permissions & superadmin |
| `npm run shared:build` | Compile shared types package |

---

## Environment Variables

### `packages/backend/.env`

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `sak_staff` | Database name |
| `DB_USER` | `sak_admin` | Database user |
| `DB_PASSWORD` | — | **Set this!** |
| `JWT_SECRET` | — | **Set this!** Long random string |
| `JWT_REFRESH_SECRET` | — | **Set this!** Different random string |

### `packages/desktop/.env`

| Variable | Default | Description |
|---|---|---|
| `VITE_SERVER_URL` | `http://localhost:4000` | Backend base URL (baked in at build time) |

> **Important for packaged builds**: set `VITE_SERVER_URL` to the server's LAN IP
> (e.g. `http://192.168.1.50:4000`) before running `npm run build:app`.
> Every workstation that installs the `.exe` / `.AppImage` / `.deb` will connect
> to that server automatically.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `better-sqlite3` ABI mismatch | `npm run rebuild --workspace=packages/desktop` |
| Port 5173 already in use | Stop conflicting process; `strictPort: true` is intentional |
| `NODE_OPTIONS` error on Windows | Use **Git Bash**; scripts use `cross-env` for compatibility |
| PostgreSQL connection refused | Linux: `sudo systemctl start postgresql` · macOS: `brew services start postgresql@14` · Windows: Start service via pgAdmin or Services panel |
| Blank page in browser | Check `VITE_SERVER_URL` in `.env`; ensure backend is running |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Tailwind CSS, Zustand, React Hook Form, Zod |
| Desktop shell | Electron 29, better-sqlite3 (offline SQLite) |
| PWA | Vite, Web App Manifest, `beforeinstallprompt` API |
| Backend | Node.js 20, Express, TypeScript, Knex, PostgreSQL 14 |
| Auth | JWT (access + refresh tokens), bcrypt |
| Build | electron-builder (AppImage, deb, NSIS, portable, DMG) |

---

© 2026 Sir Apollo Kaggwa Schools — Since 1996
