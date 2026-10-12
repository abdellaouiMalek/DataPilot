# DataPilot — Architecture globale

Document de référence pour la construction du schéma d'architecture.
Tout ce qui suit est extrait du code réel (pas de projection).

---

## 1. Vue d'ensemble — les 5 plans

DataPilot est une application web à **4 processus** + **1 plan IA local**, sans
orchestrateur ni file de messages : les traitements longs passent par les
`BackgroundTasks` de FastAPI, dans le même processus.

| Plan | Composant | Techno | Port | Déploiement |
|---|---|---|---|---|
| **Présentation** | SPA React | React 18 + Vite 8 + TS 6 + Tailwind 4 | 5173 | Vite dev / build statique |
| **Identité** | Keycloak 26.1 | OIDC + thème Keycloakify | 8085 | Docker |
| **Application** | API REST | FastAPI + SQLAlchemy 2 async | 8000 | Uvicorn (natif) |
| **Données** | PostgreSQL 18 + **pgvector** | image `pgvector/pgvector:pg18` | 5434 | Docker |
| **IA** | Ollama (local) + Gemini (cloud, optionnel) | LLM + embeddings | 11434 | natif / SaaS |

Deux bases sur la **même instance Postgres** : `datapilot` (métier) et
`keycloak` (schéma interne Keycloak, créé par `db/init/01-create-keycloak-db.sql`).

> **Contrainte structurante** : l'image `pgvector` est obligatoire. L'index RAG
> de la Veille réglementaire utilise une colonne `vector(1024)` ; un Postgres
> Windows natif ne peut pas recevoir l'extension (droits Program Files).

---

## 2. Flux d'authentification (OIDC / Keycloak)

```
Navigateur ──(1) route protégée──> RequireAuth / RequireAdmin / RequireSuperAdmin
           ──(2) redirect PKCE S256──> Keycloak (realm "datapilot", thème "datapilot")
           <──(3) code → token JWT RS256──
           ──(4) Authorization: Bearer <JWT>──> FastAPI
                                                  └─(5) vérif JWKS (signature, iss, exp, azp)
```

**Realm `datapilot`** — 2 clients :
- `datapilot-frontend` : **public**, PKCE S256 → utilisé par la SPA.
- `datapilot-backend` : **confidentiel**, service account → utilisé par l'API
  pour piloter l'Admin API Keycloak (CRUD utilisateurs, rôles, `manage-realm`).

**Rôles realm** : `super_admin`, `admin`, `consultant`, `validateur`, `repondant`.

### Modèle d'autorisation (3 niveaux, `app/core/auth.py`)

| Dépendance | Rôles acceptés | Portée |
|---|---|---|
| `verify_token` | tout utilisateur authentifié | parcours client |
| `require_back_office` | `admin` **ou** `super_admin` | back-office restreint (dashboard, users, lectures référentiel) |
| `require_super_admin` | `super_admin` uniquement | back-office complet (écritures, veille, logs, settings) |

**Cloisonnement par banque** : `get_bank_scope` résout l'attribut Keycloak
`bank_id` de l'utilisateur via l'Admin API. `super_admin` → `None` (accès total) ;
tout autre → son `bank_id`, appliqué en filtre sur chaque lecture d'évaluation.
Un compte sans `bank_id` reçoit un **403** explicite (faille de configuration,
pas un résultat vide).

**Point de performance** : un unique `httpx.AsyncClient` partagé au niveau du
processus (`app/core/keycloak_admin.py`). Un client par appel coûtait ~300 ms
(construction du contexte SSL Windows) → dashboard 35× plus lent.

---

## 3. Architecture backend (FastAPI)

### Découpage en couches

```
app/routers/    18 routeurs — HTTP, validation, gardes de rôles
      ↓
app/schemas/    Pydantic — contrats d'entrée/sortie
      ↓
app/services/   16 modules — logique métier (scoring, ranking, RAG, PDF, audit)
      ↓
app/models/     15 modèles SQLAlchemy (async, Mapped[...])
      ↓
PostgreSQL + pgvector          |   llm/ + ml/  (plan IA, hors couche web)
```

### Les 18 routeurs, par domaine

**Parcours client** (`verify_token` + `get_bank_scope`)
- `config` — `/api/dimensions|banks|departments|roles|maturity-levels` (référentiel de lecture)
- `assessments` — `POST /api/assessments` (soumission + scoring), `GET /me`, `GET /{id}`
- `recommendations` — plan priorisé, narratif, comparaison (`/api/assessments/...`)
- `reports` — 3 PDF : évaluation, recommandations, comparaison
- `profile`, `notifications`

**Back-office restreint** (`require_back_office`) — préfixe `/admin` côté SPA
- `admin_dashboard`, `admin_users`, `admin_profile`, `versions`

**Back-office complet** (`require_super_admin`) — préfixe `/super-admin`
- `admin` (CRUD dimensions / sous-dimensions / questions / recommandations)
- `admin_banks`, `admin_scoring`, `admin_framework`, `admin_logs`,
  `admin_settings`, `admin_topbar`, `regulatory`

### Services transverses notables

| Service | Rôle |
|---|---|
| `scoring.py` | Moyennes pondérées → scores dimension + score global + palier de maturité. **Pur, sans I/O** (donc testable seul). |
| `questionnaire_reference.py` | Résout les `question_id` historiques contre le **snapshot** de la version, jamais contre les tables vivantes. |
| `framework_publish.py` | Publication = **réconciliation** de l'arbre complet en une transaction (diff → apply), + snapshot immuable + changelog. |
| `audit.py` | Journal d'audit sur une **session séparée**, après le commit métier : une écriture d'audit ne doit jamais faire échouer une action légitime. |
| `notifications.py` | E-mails admin, *fire-and-forget* via `BackgroundTasks` (SMTP down ≠ requête échouée). |
| `pdf.py` | Jinja2 + WeasyPrint. SVG inline pré-calculé par `report_charts.py` (WeasyPrint n'exécute pas de JS). |

---

## 4. Modèle de données (PostgreSQL)

### Référentiel (éditable, versionné)
```
dimensions (key, code, weight, color, sort_order)
    └─< sub_dimensions
            └─< questions (type, weight, level_responses JSONB, is_required)
                    └─< recommendations (code, trigger_level → target_level,
                                         category, regulatory_flag, effort,
                                         prerequisite_id → self-FK)
maturity_levels (label, min_score, max_score, color)   ← paliers de scoring
```

### Versionnement du questionnaire
```
framework_drafts (singleton id=1, tree JSONB)     ← brouillon autosauvegardé
        │ POST /publish  (1 transaction)
        ▼
questionnaire_versions (number UNIQUE, is_active, archived,
                        snapshot JSONB, changelog JSONB, question_count…)
```
**Principe clé** : `answers.question_id` n'est **pas** une FK. Les tables vivantes
sont réécrites à chaque publication ; une évaluation se relit toujours contre
le `snapshot` de **sa** version (`version_id` → `questionnaire_versions`). C'est
ce qui autorise la suppression franche des questions plutôt que la désactivation.

### Soumissions
```
banks ──< assessments (bank_id FK, keycloak_sub, version_id,
          score_global, maturity_label, narrative, dimension_analysis JSONB)
              ├─< answers (question_id historique, value)
              ├─< dimension_scores (dimension_id historique, score)
              └─1 assessment_recommendation_plans (plan JSONB — cache du plan LTR)
```
Trois caches matérialisés sur l'évaluation : `narrative`, `dimension_analysis`,
et le plan de recommandations — tous coûteux (LLM / LightGBM), tous
pré-chauffés en tâche de fond à la soumission (`prewarm_*`).

### Veille réglementaire
```
regulatory_circulars (reference, institution, publication_date,
                      raw_text / raw_text_original, source_hash,
                      detected_language, analysis_status, is_published)
    └─< regulatory_impacts (entity_type, proposed_action, proposed_data JSONB,
                            excerpt / excerpt_original, action, edited_text)

regulatory_embeddings (entity_type, entity_code, embedding vector(1024),
                       question_code, category, regulatory_flag, dimension,
                       subdimension)
```

### Transverse
`audit_logs` (actor, module, action, status, entity, before/after, details JSONB, ip, user_agent) ·
`notifications` (user_id = sub Keycloak, type, read, circular_id) ·
`platform_settings` (singleton) · `banks` / `departments` / `roles`

**35 migrations Alembic** — le schéma a une histoire, pas un `create_all`.

---

## 5. Le plan IA — trois pipelines distincts

C'est la partie qui différencie le projet. **Trois chaînes indépendantes**,
avec une frontière de confidentialité explicite.

### 5.1 Scoring — déterministe, sans IA
`scoring.py` : moyennes pondérées question → dimension → global, puis mapping
sur `maturity_levels`. Aucun modèle. Reproductible.

### 5.2 Priorisation des recommandations — Learning-to-Rank + XAI

```
Réponses + catalogue
      ↓  features.py — 11 features canoniques (ordre figé)
         current_level, gap_to_max, question_global_weight, dimension_weight,
         dimension_score, global_score, regulatory_flag, effort,
         dimension_is_weakest, na_rate_dimension, category_id
      ↓  ranking.py — LightGBM (booster chargé une fois à l'import)
      ↓  explain.py — SHAP TreeExplainer → facteurs signés par feature
      ↓  action_plan.py — règle d'affichage déterministe
      ↓  llm/generation.py — reformulation ancrée (Ollama local)
      ↓  cache JSONB (assessment_recommendation_plans)
```

**Modèle** : LightGBM **pointwise** (`objective=regression`, 121 arbres). Choisi
par comparaison pointwise / pairwise / listwise puis validation croisée
répétée (5 plis × 5 graines) : NDCG@5 = **0.9801 ± 0.0018**, écart significatif
(Wilcoxon apparié, p < 1e-3).

**Garde-fou train/serve skew** : `ranking.py` compare au démarrage
`model_features.json` à `FEATURE_COLUMNS` et **refuse de démarrer** en cas de
divergence. Le modèle entraîné dans `ml/` est copié comme artefact dans
`app/ml_models/` — l'API n'embarque pas la chaîne d'entraînement.

**Règle du plan d'action** (`action_plan.py`, déterministe) : dimension faible
si score < score global (seuil adaptatif) → top-N par dimension faible →
**toute recommandation réglementaire est toujours incluse**, hors plafond →
une place réservée par dimension représentée → tri final par score LTR.

### 5.3 Veille réglementaire — RAG sur circulaires BCT

```
(1) Requête HTTP (rapide)   upload PDF / URL → hash SHA-256
                            → cache-hit ? réutilise : crée circulaire "en_cours"
                            → répond immédiatement

(2) BackgroundTask (lent)
    pdf_extract.py     PyMuPDF (PDF texte) ─ ou ─ Tesseract OCR fra+ara (PDF scanné)
          ↓            seuil : < 20 caractères natifs/page → OCR
    langdetect         si arabe → traduction du DOCUMENT ENTIER en 1 passe
          ↓                       (avant découpage : 1 appel LLM, pas 1 par chunk)
    chunk_text         découpage avec chevauchement
          ↓
    embeddings.py      bge-m3 (1024-d, L2-normalisé) via Ollama — TOUJOURS local
          ↓
    regulatory_index   pgvector : ORDER BY embedding <#> :query LIMIT k
          ↓            (<#> = produit scalaire négatif ≡ cosinus sur vecteurs normés)
          ↓            k = 4 questions + 6 recommandations (prompt court = rapide + fiable)
    regulatory_analysis  LLM → exigences proposées (enum plat à 7 valeurs)
          ↓
    regulatory_impacts   PROPOSITIONS uniquement (action=NULL)
          ↓
(3) Validation humaine → PATCH /impacts/{id} → puis publication
```

**Règle absolue codée** : ce pipeline n'écrit **jamais** dans le référentiel.
Il ne produit que des `proposed_data`, à valider par un humain.

**Détail d'ingénierie** : bge-m3 est annoncé cross-lingue, mais des tests sur
cette installation montrent que la similarité FR↔AR directe (~0.30) est au
niveau du bruit entre deux phrases françaises sans rapport, contre ~0.70 pour
deux phrases françaises du même sujet. Palliatif : **traduire la requête vers
le français** avant encodage ; le catalogue reste toujours en français, et le
texte source original est conservé pour les citations (`excerpt_original`).

### 5.4 Frontière de confidentialité (à faire figurer sur le schéma)

| Traitement | Modèle | Sort de la machine ? |
|---|---|---|
| Reformulation des recommandations | Ollama local (`qwen2.5:3b`) | **Non** |
| Narratifs de résultats / comparaison | Ollama local | **Non** |
| Embeddings (RAG) | bge-m3 local | **Non** |
| OCR / extraction PDF | Tesseract + PyMuPDF locaux | **Non** |
| **Génération** de la veille réglementaire | Gemini (API OpenAI-compatible) | **Oui**, avec repli local automatique |

Seule l'étape de génération de la veille sort — et uniquement des **métadonnées
de référentiel** (codes, titres, extraits de circulaires publiques). **Aucune
donnée bancaire identifiante.** Laisser `REG_LLM_API_KEY` vide rend la chaîne
100 % locale.

Chaque fonction LLM a un **repli non-LLM** (texte du catalogue tel quel, ou
phrase templatée) : serveur absent, erreur réseau ou JSON invalide → le
résultat reste exploitable.

---

## 6. Architecture frontend

**SPA React 18** — `createBrowserRouter`, **toutes les pages en `lazy`**.
Seuls les gardes et les layouts sont chargés d'emblée (un garde différé
retarderait la redirection Keycloak ; un layout immédiat affiche bandeau et
menu pendant le chargement du contenu).

### Trois espaces
```
/                         LandingPage (public)
/questionnaire /dashboard /historique /profile
/results/:id  /recommendations/:id  /evolution?ids=      ← RequireAuth
/admin/*        (8 pages)                                ← RequireAdmin
/super-admin/*  (11 pages)                               ← RequireSuperAdmin
```
Le back-office restreint **réutilise** les pages du super-admin en lecture
(`AdminUsers`, `AdminRecommendations`, `AdminScoring`, `AdminVersions`…) —
un seul composant, deux niveaux de droits.

**Règle de navigation** : toute page de parcours est adressable par URL
(`/results/:assessmentId`). L'état du routeur ne survit ni au rechargement ni
au détour par Keycloak — les pages se reconstruisent seules via `getAssessment`.

### Couche d'accès
`lib/api.ts` — `apiFetch` rafraîchit le token (`updateToken(30)`) avant chaque
appel, aplatit les 422 FastAPI en « champ : message », expose `getBlob` pour
les PDF (avec lecture de `Content-Disposition`, d'où `expose_headers` côté CORS).
Un module `lib/*.ts` par domaine (19 fichiers) — pas d'appel `fetch` dans les pages.

**Stack UI** : Tailwind 4, Radix UI, Recharts, Motion, Sonner, ExcelJS (exports).

---

## 7. Thème Keycloak (Keycloakify)

Projet séparé `keycloakify-starter/` → thème `datapilot` compilé en **JAR**,
monté dans le conteneur Keycloak (`/opt/keycloak/providers/`).
Pages thématisées : `Login`, `LoginResetPassword`, `UpdatePassword`, `Error`,
`Info`, `LoginPageExpired`, `LoginUpdateProfile`, `LogoutConfirm`.
Build : JDK 17 + Maven. Redéploiement : `npm run deploy-theme` (arrête Keycloak
avant le build — un build à chaud échoue en EPERM sur Windows).

---

## 8. Configuration & déploiement

### Docker Compose (2 services)
- `datapilot-postgres` — `pgvector/pgvector:pg18`, port `127.0.0.1:5434`,
  healthcheck `pg_isready`, volume `datapilot-pgdata`, init SQL monté en RO.
- `keycloak` — `quay.io/keycloak/keycloak:26.1`, `start-dev --import-realm`,
  dépend du healthcheck Postgres, import du realm **au premier boot seulement**.

Backend et frontend tournent **nativement** (hors Docker).

### Variables d'environnement (37 clés)
`DATABASE_URL` · `KEYCLOAK_URL|REALM|CLIENT_ID|ALGORITHMS|SUPER_ADMIN_ROLE|ADMIN_ROLE` ·
`KEYCLOAK_ADMIN_CLIENT_ID|SECRET` · `FRONTEND_URL` · `APP_URL` ·
`SMTP_HOST|PORT|USER|PASSWORD|FROM_NAME` ·
`LLM_BASE_URL|API_KEY|MODEL|KEEP_ALIVE|NUM_THREAD` · `EMBEDDING_MODEL` ·
`REG_LLM_PROVIDER|BASE_URL|API_KEY|MODEL|MAX_RETRIES|BACKOFF_BASE|MAX_OUTPUT_TOKENS|QUOTA_COOLDOWN*` ·
`REG_CHUNK_SIZE|OVERLAP` · `REG_TRANSLATION_BLOCK_CHARS` · `EMBED_MAX_RETRIES|BACKOFF_BASE`
Côté SPA : `VITE_KEYCLOAK_URL|REALM|CLIENT_ID`, `VITE_API_URL`.

### Tests
Backend : pytest (`test_scoring`, `test_action_plan`, `test_admin_banks_api`,
`test_regulatory_helpers`, `test_draft_recommendations_helpers`) — base de test
dédiée (`db/init/02-create-test-db.sql`).
Frontend : Vitest + Testing Library.

---

## 9. Décisions d'architecture à défendre

1. **Pas de FK sur `answers.question_id`** — le référentiel est versionné et
   réécrit ; les évaluations se relisent contre leur snapshot. C'est ce qui
   permet de *supprimer* une question au lieu de la désactiver indéfiniment.
2. **Publication par réconciliation en une transaction** — un référentiel
   à moitié appliqué est pire qu'une publication refusée.
3. **Audit sur session séparée, après commit** — la preuve ne doit jamais
   faire échouer l'acte.
4. **Le LLM ne décide rien.** Il reformule (recommandations) ou narre
   (scores déjà calculés) ; en veille il *propose*, un humain valide.
   Ranking = LightGBM, explication = SHAP, sélection = règle déterministe.
5. **Vérification train/serve au démarrage** — refus de démarrer plutôt que
   scoring silencieusement faux.
6. **RAG plutôt que catalogue complet dans le prompt** — 4+6 candidats au lieu
   de 33 questions + 128 recommandations : plus rapide sur CPU local, et moins
   de bruit = moins de codes inventés.
7. **Local par défaut, cloud par exception** — la seule sortie réseau est la
   génération de la veille, sur données non bancaires, avec repli local.
8. **Pas de file de messages** — `BackgroundTasks` suffit à l'échelle visée
   (une poignée de banques) ; le coût d'un Celery/Redis ne serait pas payé.

---

## 10. Schéma à produire — couches suggérées

```
┌─ POSTE CLIENT ────────────────────────────────────────────────┐
│  Navigateur → SPA React (3 espaces : client / admin / super)  │
└───────────────┬──────────────────────────┬────────────────────┘
                │ OIDC PKCE                │ REST + Bearer JWT
┌───────────────▼──────────┐   ┌───────────▼───────────────────┐
│  Keycloak 26.1 (Docker)  │◄──┤  FastAPI (18 routeurs)        │
│  realm datapilot         │   │  ├ gardes 3 niveaux + bank    │
│  thème Keycloakify JAR   │   │  ├ services métier            │
│  2 clients, 5 rôles      │   │  └ BackgroundTasks            │
└───────────────┬──────────┘   └───┬───────────┬───────────────┘
                │                  │           │
        ┌───────▼──────────────────▼──┐  ┌─────▼──────────────────┐
        │  PostgreSQL 18 + pgvector   │  │  PLAN IA               │
        │  db keycloak | db datapilot │  │  ├ LightGBM + SHAP     │
        │  35 migrations Alembic      │  │  ├ Ollama (local)      │
        │  vector(1024) RAG index     │  │  │   qwen2.5 + bge-m3  │
        └─────────────────────────────┘  │  ├ Tesseract + PyMuPDF │
                                         │  └ Gemini (cloud, opt) │
                                         └────────────────────────┘
                      SMTP ──► e-mails (identifiants, notifications)
```
