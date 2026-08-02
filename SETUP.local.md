# 🛠️ DataPilot — Local Setup (developer instructions)

> This file is **git-ignored** on purpose — it holds local/dev setup details and is not part of the public repo. Keep environment-specific and operational notes here.

Follow these steps to run DataPilot locally for the first time.

## ✅ Prerequisites

| Requirement    | Version / Notes                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| **Node.js**    | 22.x (Vite 8)                                                                   |
| **Python**     | 3.11 or 3.12 recommended (some DB driver wheels lag on newer versions)          |
| **PostgreSQL** | Running locally; the **`datapilot`** database is auto-created by `init_db` (step 3) — or create it yourself if seeding manually |
| **Docker**     | Docker Desktop (or Engine + Compose v2) — used to run Keycloak                   |
| **JDK + Maven**| JDK 17+ and Maven (only needed to build the custom Keycloak theme)              |
| **Keycloak**   | Provided via Docker (step 2). Realm `datapilot`, public client `datapilot-frontend` (PKCE `S256`); the bundled realm import handles client + token **audience** config. |

## 1. Clone & configure environment

```bash
git clone <repo-url>
cd DataPilot

# Backend env: copy the template and fill in your values
cp backend/.env.example backend/.env

# Frontend env: copy the template and fill in your values
cp frontend/.env.example frontend/.env
```

## 2. Keycloak (auth + custom EY theme)

Keycloak runs in **Docker** via the `docker-compose.yml` at the repo root. It serves a custom **EY-branded theme** built with **Keycloakify** (the `keycloakify-starter/` project). The theme can style **any** Keycloak page — login, registration, forgot/reset password, OTP, verify-email, terms, and more — though only the pages you customize are restyled; the rest fall back to Keycloak's default look. The compiled theme jar is a build artifact (git-ignored), so you build it **once before** starting Keycloak.

### What you get

| Item               | Value                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| Image              | `quay.io/keycloak/keycloak:26.1` (dev mode, `start-dev`)                        |
| URL                | [http://localhost:8085](http://localhost:8085)                                 |
| Admin console      | `admin` / `admin`                                                              |
| Realm              | `datapilot` (auto-imported on first boot from `keycloak/import/datapilot-realm.json`) |
| Frontend client    | `datapilot-frontend` (public, PKCE `S256`)                                     |
| Theme              | `datapilot` (Keycloakify — set as the realm's login theme via the import). Currently the **login** page is EY-branded; other pages use defaults until customized |

### Build prerequisites (for the theme)

You need a **JDK 17+** and **Maven** on your PATH with `JAVA_HOME` set. On Windows the quickest way is [Scoop](https://scoop.sh):

```bash
scoop bucket add java
scoop install temurin17-jdk maven
```

> The Keycloakify build downloads Maven plugins on first run. On Windows, the first build can fail with `zip file is empty` (antivirus truncating a jar mid-download) — just run it again; the cached jars validate on the second pass.

### First-time setup

```bash
# 1) Build the theme jar (output is git-ignored, must exist before `up`)
cd keycloakify-starter
npm install
npm run build-keycloak-theme        # produces dist_keycloak/keycloak-theme-for-kc-all-other-versions.jar
cd ..

# 2) Start Keycloak (imports the datapilot realm on first boot)
docker compose up -d
```

### Create a login user

The realm import does **not** include users, so create one:

1. Open [http://localhost:8085](http://localhost:8085) and log in with `admin` / `admin`.
2. Switch to the **datapilot** realm → **Users** → **Add user** (set a username + email, enable *Email verified*).
3. **Credentials** tab → **Set password** (turn *Temporary* **off**).

You can now sign in to the app with that user.

### Grant admin access (back-office)

The app gates the admin back-office (`/admin`) behind the **`admin` realm role**. Fresh
realm imports include this role automatically (`keycloak/import/datapilot-realm.json`).

> If your Keycloak was created **before** this role was added, the import won't re-run on an
> existing volume. Either create the role manually (**Realm roles → Create role → `admin`**),
> or wipe & re-import the realm (`docker compose down -v` then `docker compose up -d` — this
> **deletes all Keycloak users/data**).

To make a user an admin: **Users** → pick the user → **Role mapping** → **Assign role** →
filter by *realm roles* → select **`admin`**. After they log in again, the **ADMIN** link
appears in the navbar and `/admin` becomes accessible. The backend enforces the same role on
admin endpoints via `require_admin` (`app/core/auth.py`).

### Customizing theme pages (login, register, forgot password, …)

Out of the box only `login.ftl` carries the EY design. To brand **any other page** — registration, password reset, OTP, verify-email, terms, etc. — follow the same four steps:

```bash
cd keycloakify-starter

# 1) Eject the page → creates an editable React copy under src/login/pages/
npx keycloakify eject-page          # interactive: pick login → e.g. register.ftl
```

2. **Route it** — in `src/login/KcPage.tsx`, add a `case` for that page id rendering your new component with the custom `Template` (mirror the existing `login.ftl` case).
3. **Design it** — edit `src/login/pages/<PageName>.tsx` with your EY styling (the shared `Template` + Tailwind setup already applies). Preview it live by setting `pageId` in `src/main.tsx` and running `npm run dev`.
4. **Deploy it** — `npm run deploy-theme`.

Common page ids: `login.ftl`, `register.ftl`, `login-reset-password.ftl`, `login-update-password.ftl`, `login-verify-email.ftl`, `login-otp.ftl`, `terms.ftl`.

> ⚠️ A page only appears in a flow if that flow is **enabled in the realm** (Realm settings → Login — e.g. *User registration*, *Forgot password*), and email-based flows need **SMTP** configured (Realm settings → Email) to actually send mail. Styling the page does not enable the feature.

### Everyday commands

| Task                       | Command                                                                       |
| -------------------------- | ----------------------------------------------------------------------------- |
| Start / stop Keycloak      | `docker compose up -d` / `docker compose down` *(realm + users persist in a Docker volume)* |
| Iterate on a page design   | `cd keycloakify-starter && npm run dev` *(live preview with mock data, no Keycloak needed)* |
| Deploy a theme change      | `cd keycloakify-starter && npm run deploy-theme` *(stops container → rebuilds jar → restarts)* |

> After a theme rebuild, hard-refresh the login page (**Ctrl+F5**) to bypass cached assets.

## 3. Backend (FastAPI)

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1
# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt

# One-command database bootstrap (recommended for first-time setup):
# creates the "datapilot" database if missing -> runs migrations -> seeds
# reference data. Fully idempotent, so it's safe to re-run any time.
python -m app.db.init_db       # add --reset to wipe & reseed reference tables

# Run the API (http://localhost:8000)
uvicorn app.main:app --reload
```

> **Doing it step by step instead?** `init_db` just chains the two commands below,
> so you can still run them individually:
>
> ```bash
> alembic upgrade head       # apply migrations (creates all tables)
> python -m app.db.seed      # seed reference data (idempotent; --reset to wipe & reseed)
> ```
>
> The only thing `init_db` adds is auto-creating the database itself, so with the
> manual route the `datapilot` database must already exist (see Prerequisites).

### AI features (local LLM via Ollama)

Results narratives, recommendation reformulation, and the "Veille réglementaire"
circular extraction all call a local **Ollama** server through its
OpenAI-compatible API — no data ever reaches a public LLM API, which matters
for real bank records. Every one of these features degrades gracefully (a
templated sentence, the catalog text as-is, a regex-based article split) if
Ollama isn't running, so a fresh checkout works with no `.env` changes — you
only need this if you want the *actual* AI output instead of the fallback:

```bash
# https://ollama.com/download
ollama pull llama3.2:3b
ollama run llama3.2:3b   # first run pulls/warms the model; Ctrl+D to exit once ready
```

The backend expects the model name `llama32cpu` by default (`LLM_MODEL` env
var) — either `ollama cp llama3.2:3b llama32cpu` to alias it, or set
`LLM_MODEL=llama3.2:3b` in `backend/.env`. `LLM_BASE_URL` defaults to
`http://localhost:11434/v1` (Ollama's default port).

> **Heads up on speed:** this is CPU inference on a small model — a single
> "Veille réglementaire" import (extracting requirements from a whole
> circular) can take one to a few minutes. That's expected, not a hang.

### PDF reports (Jinja2 + WeasyPrint) — Windows only

The "Exporter PDF" buttons (Résultats, Évolution) render Jinja2 templates to PDF
with WeasyPrint. On Linux/Docker this just works once the system packages are
installed (`apt-get install libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b
libcairo2 fonts-liberation` or equivalent) — skip this section there.

On Windows, WeasyPrint doesn't bundle its native Pango/cairo/GObject libraries,
and the official installer ([GTK3 Runtime Windows Installer](https://github.com/tschoonj/GTK-for-Windows-Runtime-Environment-Installer))
requires admin rights. The admin-free alternative is a throwaway conda
environment holding just those libraries:

```bash
conda create -n gtk-libs -c conda-forge pango cairo gdk-pixbuf fontconfig glib -y
```

`app/services/pdf.py` picks this up automatically via the `GTK_DLL_DIR` env var
(defaults to `C:\Users\<you>\.conda\envs\gtk-libs\Library\bin` — set it in
`.env` if your conda env lives elsewhere, e.g. `GTK_DLL_DIR=C:\Users\me\.conda\envs\gtk-libs\Library\bin`).
No conda on your machine? Install [Miniconda](https://docs.conda.io/en/latest/miniconda.html) first (a lightweight,
admin-free conda) — you only need it for this one environment, not for running
the project itself.

> **Gotcha:** some unrelated tools (Tesseract-OCR, observed) ship their own,
> incompatible `libgobject`/`libglib` and put it on PATH, shadowing the
> correct ones even with the conda directory registered — `pdf.py`'s bootstrap
> already strips matching PATH entries for the current process, so this
> shouldn't bite you, but if PDF generation throws `OSError: cannot load
> library`, that's the likely cause.

## 4. Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

> **Windows / PowerShell note:** if `npm run dev` exits immediately after printing `> vite`, use `npm.cmd run dev` (or run it from Command Prompt). The PowerShell `npm` wrapper can send the dev server an early stdin EOF that shuts it down.

## 5. Open the app

Visit **http://localhost:5173**. The **landing page is public** — it loads without logging in. Protected pages (questionnaire, dashboard, results, recommendations, simulation) redirect you to the **EY Keycloak login** when you're not signed in; you can also sign in from the **CONNEXION** button in the navbar. Make sure Keycloak (step 2) is running first.
