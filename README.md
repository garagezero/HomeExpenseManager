# Home Expense Manager

A small self-hosted app to track **monthly** home expenses across multiple houses.
Frontend + backend + database run together in Docker — **nothing is installed on your
machine or NAS**; everything is built and run inside containers.

## Features

- **Houses** — add / edit / delete, each with an optional location.
- **Payment types** — per house, create recurring bills (e.g. Electricity, Water, Rent),
  each with a **frequency** (daily / weekly / monthly / yearly) and an optional **default
  amount**.
- **Period grid** — each type shows a grid of periods that adapts to its frequency. **One
  click ticks a period paid** (using the default amount); open a period for a custom amount,
  a **partially-paid** flag, a note, or attachments.
- **Attachments** — upload receipts / checks (images, PDFs, …) on any period.
- **Statistics** — monthly and yearly totals, per-house and combined, with charts.
- **Users** — one admin (created on first run) who can add / edit / delete users and reset
  passwords. Two levels only: admin vs normal user.
- **Backup & restore** — export everything (data + attachments + settings) to a single
  `.zip`, and import it on another machine to move your whole setup.

## Tech

- Frontend: React + Vite + Mantine
- Backend: Node + Express + Prisma
- Database: PostgreSQL 16
- Packaging: one app container (serves the UI **and** the API) + one Postgres container

---

## Quick start (any Docker host)

1. Copy the env template and edit the values:

   ```sh
   cp .env.example .env
   # then edit .env — at minimum set POSTGRES_PASSWORD, JWT_SECRET, ADMIN_PASSWORD
   ```

2. Build and start:

   ```sh
   docker compose up -d --build
   ```

3. Open `http://<host-ip>:8095` and log in with the `ADMIN_USERNAME` / `ADMIN_PASSWORD`
   you set in `.env`.

That's it. The schema is created automatically on first boot and the admin user is seeded
from `.env`.

To update after code changes: `docker compose up -d --build`.
To stop: `docker compose down` (your data stays in the volumes).

---

## TrueNAS SCALE

TrueNAS SCALE can run Compose stacks. Two common ways:

TrueNAS SCALE (Electric Eel / 24.10+) runs apps on Docker. Use the dedicated
**`truenas-app.yaml`** file in this repo with **Install via YAML**.

> Important: TrueNAS's "Install via YAML" **runs a prebuilt image — it does not build
> from source**. So the regular `docker-compose.yml` (which has `build: .`) is **not** what
> you paste into TrueNAS. Use `truenas-app.yaml`, which references a prebuilt image. First
> get that image one of these two ways:

### Get the image

**Option A — GitHub builds it for you (GUI-only, recommended).**
1. Push this repo to GitHub. The included workflow (`.github/workflows/build-image.yml`)
   builds the image **in the cloud** and publishes it to GHCR — nothing builds on your Mac
   or NAS.
2. After the Action finishes: GitHub → your repo → **Packages** → open the
   `home-expense-manager` package → **Package settings** → set visibility to **Public**
   (so TrueNAS can pull it without a login).
3. Your image is `ghcr.io/<your-github-username>/home-expense-manager:latest`.

**Option B — build it once on the TrueNAS shell (no GitHub needed).**
1. Copy this folder to a dataset, e.g. `/mnt/pool/apps/home-expense-manager`.
2. In the TrueNAS shell: `cd /mnt/pool/apps/home-expense-manager && docker build -t home-expense-manager:latest .`
3. In `truenas-app.yaml` set `image: home-expense-manager:latest` and `pull_policy: never`.

### Install

1. Open **`truenas-app.yaml`**, edit the lines marked `# <-- CHANGE` (image name,
   passwords, JWT secret).
2. TrueNAS UI → **Apps → Discover Apps → ⋮ (top-right) → Install via YAML**.
3. Name it `home-expense-manager`, paste the edited YAML, **Save**.
4. Open `http://<truenas-ip>:8095` and log in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
   (8095 is used because TrueNAS's own web UI commonly holds 8080 — change the left
   side of the `ports:` line in `truenas-app.yaml` if 8095 is also taken on your box.)

### Editing core settings later

Custom YAML apps don't get a settings form — their settings **are** the environment
variables in the YAML. To change currency default, passwords, port, secret, etc:

> Apps → select **home-expense-manager** → **Edit** → change the values under
> `environment:` (all grouped at the top of each service) → **Save**. The app redeploys.

(Day-to-day settings like currency and app name are also editable inside the app itself,
under **Settings**, without touching the YAML.)

### Updating the app (new code, no data loss)

TrueNAS's Docker-backed apps don't show an "update available" badge for custom YAML apps
the way catalog apps do — there's no chart version to compare against. Instead, this app is
built so a normal **Edit → Save** (or **Stop** then **Start**) *is* the update, because
`pull_policy: always` forces a fresh pull of `:latest` every time the app (re)starts:

1. Code changes are pushed → the GitHub Action rebuilds and publishes a new `:latest` image
   automatically (no action needed on your end).
2. On TrueNAS: **Apps → home-expense-manager → Edit → Save** (even with no YAML changes).
   This redeploys the app container with the newest image.
3. On startup the app runs a schema sync automatically. **Additive changes (new tables/
   columns) are always safe — houses, users, settings, and payment data are preserved.**
   Only a change that *removes or restructures* existing data (rare, and always called out
   explicitly when it happens) would need special handling — in that case, export a backup
   first from **Settings → Backup & restore**.

You do **not** need to delete and reinstall the app to get updates — that's only ever
needed to fully reset the database, which also erases your data.

## Unraid

1. Install the **Compose Manager** plugin (Community Apps) — or use Portainer.
2. Compose Manager → **Add New Stack** → name it `home-expense-manager`.
3. Paste `docker-compose.yml`, and put the variables from `.env.example` into the stack's
   env / `.env`.
4. **Compose Up**. Open `http://<unraid-ip>:8095`.

(Alternatively, drop this folder onto the array and run `docker compose up -d --build`
from a terminal.)

---

## Where is my data? (backups & moving machines)

Two named Docker volumes hold everything:

- `db_data` — the PostgreSQL database
- `attachments` — uploaded files

**Easiest portable backup (recommended):** in the app go to **Settings → Backup & restore →
Export backup**. You get one `.zip` containing all data, settings, and attachment files.
On a fresh install elsewhere, go to **Settings → Import** and upload that `.zip` — done.

**Infra-level backup:** snapshot/copy the `db_data` and `attachments` volumes (or switch
them to bind-mounts under a dataset you already back up).

---

## Configuration (`.env`)

| Variable           | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `POSTGRES_USER`    | Database user                                        |
| `POSTGRES_PASSWORD`| Database password                                    |
| `POSTGRES_DB`      | Database name                                        |
| `APP_PORT`         | Port exposed on the host (default 8095)              |
| `JWT_SECRET`       | Secret used to sign login sessions — make it long    |
| `ADMIN_USERNAME`   | First admin username (created on first run)          |
| `ADMIN_PASSWORD`   | First admin password (change it after first login)   |
| `DEFAULT_CURRENCY` | Initial currency code; changeable later in Settings  |

---

## Development (optional, also in Docker)

A hot-reload dev stack is provided — it still runs entirely in Docker and keeps
`node_modules` inside Docker volumes (nothing is installed on your host):

```sh
docker compose -f docker-compose.dev.yml up
```

- UI with hot reload: `http://localhost:5173`
- API (auto-restarts on change): `http://localhost:8080`

The Vite dev server proxies `/api` to the backend container (`BACKEND_PROXY` in
`docker-compose.dev.yml`). Stop with `Ctrl+C`; `docker compose -f docker-compose.dev.yml down`
to remove the containers (dev data persists in the `dev_*` volumes).

## Files at a glance

| File                      | Purpose                                                        |
| ------------------------- | -------------------------------------------------------------- |
| `docker-compose.yml`      | Production stack (builds image locally) for any Docker host     |
| `docker-compose.dev.yml`  | Hot-reload development stack                                    |
| `truenas-app.yaml`        | Paste-into-TrueNAS "Install via YAML" file (prebuilt image)     |
| `Dockerfile`              | Multi-stage build of the single app image                      |
| `.github/workflows/`      | Cloud build + publish of the image to GHCR                      |
| `.env.example`            | Config template for the production compose                     |
