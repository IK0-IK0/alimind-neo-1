# AliMind

AliMind is a browser-based nutrition coaching prototype based on
[AliMind-Remake-Plan.md](./AliMind-Remake-Plan.md). It includes an editorial,
Filipino-food-inspired landing page, animated consent-first assessment chat,
experimental TPB estimates, phrase-based intention/TTM feedback, and local
rule-based coaching.

For a source-grounded description of the current algorithms, data flow,
prototype boundaries, and items to resolve before research, see
[`docs/research-methodology.md`](./docs/research-methodology.md). It is a
working methodology note, not a validated study protocol or results report.
The paper-structured second iteration is in
[`docs/research-methodology-iteration-2.md`](./docs/research-methodology-iteration-2.md);
it follows the supplied paper's Methods and Materials organization and clearly
labels proposed study methods separately from the implemented prototype.

## Supabase setup

The app uses Supabase Auth for email/password accounts and Supabase Postgres
for assessment and chat history. The repository is configured for the Supabase
CLI project `rbhnuceijvrfwjydeaqb`. Apply the schema and row-level security
policies before running the app.

### Apply migrations with the Supabase CLI

The Supabase publishable key used by the browser is not sufficient to change
database schemas. To run migrations from this repository, first obtain the
database password in the Supabase dashboard and keep it private. Do not put it
in a `VITE_` variable, source file, or chat message. In PowerShell, set the
connection string only for the current terminal session:

```powershell
$securePassword = Read-Host "Supabase database password" -AsSecureString
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
try {
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  $encodedPassword = [uri]::EscapeDataString($password)
  $env:SUPABASE_DB_URL = "postgresql://postgres.rbhnuceijvrfwjydeaqb:$encodedPassword@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  Remove-Variable password, encodedPassword, securePassword, passwordPointer
}
npx supabase db push --remote="$env:SUPABASE_DB_URL" --skip-vault --dry-run
```

Review the dry-run output and do not apply migrations that already exist in the
remote project. The remote project records the account-role migration as
`20261114021801`, while the local file is named
`202611140001_account_roles.sql`; reconcile that version mismatch before using
`supabase db push`.

```powershell
npx supabase db push --remote="$env:SUPABASE_DB_URL" --skip-vault
```

The supplied port `6543` is the shared transaction pooler. If the CLI reports
connection or session-feature errors, use the direct database connection or
Supabase session pooler connection string from **Project Settings → Database**
instead. Clear the session variable when finished:

```powershell
Remove-Item Env:SUPABASE_DB_URL
```

The CLI migration creates `public.profiles` and `public.assessment_sessions`;
it does not create a duplicate `public.users` credentials table. Supabase
Auth's `auth.users` remains the identity store, and profiles reference those
Auth user IDs.

Alternatively, run the SQL files in the SQL Editor in order:

1. Open the configured Supabase project and go to **SQL Editor**.
2. Run:
   [`202611050001_assessment_sessions.sql`](./supabase/migrations/202611050001_assessment_sessions.sql),
   [`202611050002_profiles.sql`](./supabase/migrations/202611050002_profiles.sql),
   [`202611140001_account_roles.sql`](./supabase/migrations/202611140001_account_roles.sql),
   [`20261115050657_reviewer_assessment_reviews.sql`](./supabase/migrations/20261115050657_reviewer_assessment_reviews.sql),
   then [`20261116084319_restore_supabase_auth.sql`](./supabase/migrations/20261116084319_restore_supabase_auth.sql).
3. In **Authentication → URL Configuration**, set the local Site URL to
   `http://localhost:5173`. Add your production app's HTTPS URL when deploying.
4. In **Authentication → Providers → Email**, enable email/password sign-in
   and turn off **Confirm email**. This prototype signs users in immediately
   after registration and does not implement email verification.

The first migration creates the assessment table, a one-active-session-per-user
index, and RLS policies that limit row access to the signed-in owner. The
second creates `public.profiles`, adds a profile for existing Auth users, and
keeps profile display names synced from Auth metadata for new users and name
updates. The reviewer migration adds reviewer-only reads of completed
assessments, review assignment/status records, and a separate draft table whose
RLS limits in-progress draft access to its assigned reviewer. The forward repair
migration restores Supabase Auth as the credential store, remaps legacy profile
IDs to matching Auth user IDs without discarding assessment data, removes
legacy profile credential columns, and restores Auth triggers and RLS. It
idempotently provisions `alimind.pipeline.test@example.com` as `user` and
`reviewer@example.com` as `reviewer`; existing Auth passwords are preserved.
The reviewer migration is applied to the configured project as `20261115050657`;
the local migration file uses the same version. The configured project needs
the forward repair migration before Auth-backed sign-in and assessment access
will work again.

Profiles contain app display metadata only; passwords and email verification
state remain exclusively managed by Supabase Auth. Apply all migrations to any
other target Supabase database. This repository does not include or require a
Supabase service-role key; never put a
`service_role` or secret key in a `VITE_` variable or browser bundle.

The account-role migration adds `profiles.account_role`, defaulting every
account to `user`. The `/account` page shows the current role, and authorized
reviewer accounts can open `/reviewer`. The development-only
`http://localhost:5173/reviewer-sample` route previews a fabricated reviewer
workspace without accessing an account or real case. Its Set A and Set B
samples show the TPB belief-composite and direct-measure calculations, a TTM
screening result, and expandable sections for all 38 questions and responses.
The displayed 1–7 ratings and written responses are fabricated; the ratings
demonstrate the formula only and are not inferred from the text. The real
reviewer page checks access through the authenticated API and lists only
completed assessments. It displays pseudonymous submission IDs, separate
review-status and assignment badges, and provisional readiness/construct
estimates when enough answers are available. Reviewers can open the saved chat
transcript and each question/answer pair. Starting a review automatically
assigns it to the current reviewer; assignment/status and
response/recommendation drafts are saved in separate Supabase tables, with
draft access limited to the assigned reviewer until completion. Draft text is
internal only and is not sent to the participant. TPB estimates come from the
experimental respondent-trained BERT/Ridge model; intention and its
readiness-stage estimate still use English phrase matching. These outputs are
not validated TPB scores or clinical classifications; generated suggestions
are editable coaching cues that must be checked against the conversation.

The reviewer recommendation field includes a RecipeNLG picker. It searches a
local SQLite full-text index and copies the selected recipe's title,
ingredients, directions, and source into the editable recommendation draft.
To build the index, place `RecipeNLG_dataset.csv` under `dataset/` and run
`npm run recipes:index`. The generated index and original CSV are ignored by
Git and must stay server-side; the dataset is restricted to non-commercial
research and education. Reviewers must check recipes for dietary suitability
and food safety because RecipeNLG does not validate nutrition or allergens.

The sample queue continues to show fabricated Set A/Set B data and has separate
review and more-details popups. Its page-local statuses and browser-stored drafts
are not connected to the live review records.

Users cannot change their own role from the client. Grant reviewer access only
through a trusted administrative database session, after verifying the Auth
user UUID:

```sql
update public.profiles
set account_role = 'reviewer', updated_at = now()
where id = '<verified auth.users UUID>';
```

The live queue does not implement reviewer reassignment, a full audit history,
or participant delivery. Do not assign roles through user metadata or expose
database owner/service credentials in browser code.

The supplied project URL and publishable key connect to Supabase Auth, but
application tables are not provisioned automatically in a new Supabase
project. The migrations are applied to the configured project; a fresh or
different project needs both migrations before assessment history and profile
reads will work. The app deliberately does not attempt remote schema changes
with a publishable key.

## Run locally

Use Node.js 22.12+ (or a current Node.js LTS) and npm.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

`.env.example` is prefilled with the Supabase project URL and publishable key
provided for this app. A publishable key is intended for browser use; access to
database rows is controlled by user sessions and RLS. The Vite development
server proxies `/api` to the Express API on port 3001. Open
`http://localhost:5173`.

For authenticated local testing, use the reusable Supabase test account stored
in the ignored `.env.test-account.local` file; see [AGENTS.md](./AGENTS.md) for
the testing convention. Do not use a personal account or real user data.

On the local `/demo` page, the development-only **Run automated test** button
shows a normal chat transcript filled with synthetic answers while the live
TPB model and intention scorer run. The preview does not create or modify an
assessment; **Return to saved chat** restores the unchanged conversation. The
first run may take longer while the local BERT worker loads.

During local development, open `http://localhost:5173/pipeline-lab` to inspect
the five-step human-review workflow prototype. Provide context in Step 1 and
run the available analysis steps individually or use **Run available analysis
steps**. The steps are context collection, a synthetic-only score proposal,
TTM screening context, explicit human score review, and human-authored
response/recommendation publishing.
Context Collection shows only the next applicable healthy-eating screening
question. It contains Part A (the free-text TPB items) and Part B (the TTM
decision-tree questions), each in its own collapsible section.
Part A contains the supplied 38 free-text TPB items, grouped into ten
collapsible sections. Rating scales are hidden from respondents. The source
scale anchors are retained as metadata, and this separate lab form is not
scored. In the local-only Pipeline Lab, the fixed Q1 experiment uses the
English [`bert-base-uncased` checkpoint](https://huggingface.co/google-bert/bert-base-uncased)
as a frozen mean-pooled encoder, then fits a temporary Ridge score head on 42
synthetic answers. Fourteen separate synthetic answers estimate a Gaussian
residual scale for demo probabilities; 14 more are held out for a small demo
evaluation. This tests the Python / BERT / scoring / calibration wiring only.
Synthetic metrics and probabilities are not valid estimates for real people.

The synthetic Q1 Python route is authenticated, disabled in production, and
does not persist the submitted answer. Install the Python dependencies with
`python -m pip install -r server/tpb/requirements.txt`. Both that experiment
and the live TPB scorer use frozen BERT weights downloaded from Hugging Face
and cached locally on first use; the live scorer also loads the bundled Ridge
head in a persistent Python worker. The live head was trained on 1,701
nonblank explanations from 30 respondents. Five-fold respondent-held-out
evaluation yielded MAE 0.865 and Pearson *r* 0.518 on a 1–7 item-rating target,
below the stated MAE < 0.5 and *r* > 0.70 targets. It is an experimental
prototype estimate, not validated measurement or calibrated confidence. Do
not use the synthetic Q1 predictions as real-participant scores.
The separate [`tpb-calculation.ts`](./src/features/assessment/tpb-calculation.ts)
module implements the expectancy-value arithmetic for numeric responses:
attitude from behavioral belief × outcome evaluation, subjective norm from
normative belief × motivation to comply, and perceived control from control
belief × perceived power. It returns sums and means for these composites and
separate means for direct measures and intention. It does not choose item
mappings, validate a questionnaire, or infer ratings from text. Scale anchors,
item direction, and any reverse-coding must be defined for the actual
instrument before interpreting a result. In the reviewer sample, Q1–Q5 have
no matched outcome-evaluation items, so they are not treated as a direct
attitude measure or included in those belief products.

TPB reports attitude, subjective norm, perceived control, and intention as
distinct constructs; it does not prescribe one grand TPB score. Their
relative predictive weights need to be estimated for the target study. The
existing 38 TPB prompts collect free text, not validated numeric item ratings,
so this calculation module is a foundation only and is not connected to
production or the synthetic lab.
This design follows [Ajzen's TPB measurement guidance](https://people.umass.edu/aizen/#tpb)
and the original [Theory of Planned Behavior paper](https://doi.org/10.1016/0749-5978(91)90020-T):
the expectancy-value belief products are distinct from direct measures of the
constructs, and prediction weights must be estimated for the target study.
The reusable live-answer confidence policy is in
[`answer-confidence.ts`](./src/features/assessment/answer-confidence.ts).
It accepts a model's score distribution and calibration evidence, asks for a
clarification below its default 0.8 threshold or without approved validation,
and preserves the current chat flow when no model is configured. This policy is not yet connected to production scoring: the live TPB scorer
does not provide a calibrated score distribution, and the synthetic Pipeline
Lab output must never be supplied as live confidence. Before adding
confidence-driven clarifications, validate calibration and persist/replay
clarification turns in the assessment chat.
The TTM stage preview
updates through its decision tree, showing a provisional stage while a
relevant follow-up is unanswered and a final stage when its branch is complete.
This stays separate from TPB determinant scoring. The one-month and one-week
cutoffs are implemented as supplied and are labeled as prototype estimates,
not conventional or clinically validated TTM time windows. Sign in before
opening the lab; if your session has expired, logging in returns you to
`/pipeline-lab`.
The lab's optional recipe search is separate from the human-review workflow;
it is never used to produce or populate a recommendation. Recipe Generation
searches Spoonacular using the selected dish/ingredient
query, diet, allergens, ingredients on hand, and ingredients to avoid. It
requests analyzed cooking instructions and equipment. Each run randomly
selects one qualifying dish from the returned candidates; run it again to
randomize another. Changing filters does not automatically discard the current
result; use the form's **Search again** button (or press Enter in a filter) to
redo the search. A loading indicator appears while Spoonacular is queried.
Estimated average and batch costs display in PHP, converted from Spoonacular's
USD estimate using the daily USD/PHP quote from Frankfurter. The per-serving
budget filter is also in PHP. Prices remain provider estimates converted at
the displayed exchange rate, not observed Philippine ingredient or market
prices. Time, servings, budget, and effort are checked against returned recipe
details.
The same reusable recipe finder and recipe card are available from the
conversation's **Recipe** button. Chat searches show the recipe in the
conversation panel; recipe searches are not saved as assessment messages.
Spoonacular's Filipino cuisine filter returned no matches in a live check, so
the app does not apply that filter; search by a dish name such as `adobo`
instead. Dietary and allergy filters are not a safety guarantee; users must
check each source recipe's ingredients. The recipe endpoint requires a
signed-in user and a server-only API key; generated content is displayed in
the lab and is not saved. Context extraction remains explicitly not
implemented. The lab is excluded from production routes and keeps sample
inputs in page memory only. Use `npm test` for repeatable automated checks.

The integration follows Spoonacular's
[Complex Search API documentation](https://spoonacular.com/food-api/docs#Search-Recipes-Complex).
Live checks showed applying Spoonacular's own ready-time/servings/instructions
filters can yield no candidates even when the unfiltered query has recipes, so
the app requests recipe details and enforces those criteria locally instead.
This only filters the fetched candidate set; it may return no match even if a
broader search could find one.

To enable live recipe search, create a Spoonacular API key and add it to the
server environment as `SPOONACULAR_API_KEY`. Restart the API process after
changing the environment. Never expose this key in a `VITE_` variable or
browser code. The daily exchange-rate quote is cached for up to 12 hours. If
Frankfurter is unavailable, the server uses `USD_TO_PHP_FALLBACK_RATE` and
`USD_TO_PHP_FALLBACK_DATE`; both the rate source and date are shown with the
recipe. Update the fallback rate/date together. Automated tests use mocked
provider responses and do not consume API quota.

Spoonacular's cost estimate is converted to PHP and may not reflect Philippine
prices. Effort is a rough heuristic from cooking time and the returned number
of instruction steps; it is not a provider difficulty rating. Equipment is
only shown when present in the provider's analyzed instructions. Ingredient
matches only indicate matching pantry inputs and do not establish local
availability. Results include source links; review Spoonacular's current API
plan, attribution, and data-use terms before production use.

For production, build and run the Express server:

```sh
npm run build
npm start
```

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the
frontend build. Set `APP_ORIGIN` to the production HTTPS origin, `PORT` to the
platform's assigned port, and `TRUST_PROXY=true` only when deployed behind a
trusted reverse proxy. The frontend and Express API should share one origin.
Keep `.env` out of source control.

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | — | Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | — | Browser-safe Supabase publishable key. Never substitute a service-role/secret key. |
| `SPOONACULAR_API_KEY` | For recipe search | — | Server-only Spoonacular key. Never expose it to the browser. |
| `USD_TO_PHP_FALLBACK_RATE` | No | `63.251` | Server-only fallback USD/PHP rate used when the daily Frankfurter quote cannot be fetched. |
| `USD_TO_PHP_FALLBACK_DATE` | No | `2026-11-11` | Date for the configured fallback rate, in `YYYY-MM-DD` form. |
| `APP_ORIGIN` | No | `http://localhost:5173` | Allowed origin for state-changing API requests. |
| `PORT` | No | `3001` | Express API/production server port. |
| `TRUST_PROXY` | No | `false` | Trust one reverse proxy only when explicitly configured. |

## Authentication and saved assessments

- Supabase Auth provides registration, sign-in, session refresh, and sign-out.
  Email confirmation must be disabled in the Supabase project settings for
  registration to create an active session immediately. A profiles table
  cannot bypass this Auth setting; an existing unconfirmed account must be
  confirmed or the project setting changed before password sign-in succeeds.
  Supabase stores browser auth state; the API verifies each access token with
  Supabase Auth before accepting protected requests.
- `public.profiles` stores each user's display name, keyed to `auth.users.id`.
  Its trigger initializes and syncs names from Auth user metadata; backfill
  covers existing Auth users. Row-level security lets each signed-in user read
  only their own profile. The account page uses the saved profile name and
  falls back to Auth metadata if the profile migration has not been applied.
- The signed-in profile menu lets users update their display name or password.
  Password changes require the current password; the email address is
  read-only in AliMind and cannot be changed from these settings.
- `/demo` requires a valid Supabase session. Before creating an assessment,
  the user must accept the displayed storage consent.
- Assessment order, answer text and provisional scores, chat messages, consent
  version/time, status, and timestamps are stored in Supabase Postgres.
- The Express API validates request origin, question order, inputs, session
  ownership, and answer scoring. It computes scores from the server's question
  bank rather than trusting browser-supplied scores. Concurrent edits use an
  optimistic timestamp check.
- RLS policies scope database rows to `auth.uid()`. The server uses the
  publishable key together with the caller's access token, not an elevated
  service key. Users can read and modify only their own rows; RLS is the
  database boundary, and the API's validation is the supported application
  workflow.
- Since the API uses the user's RLS-scoped access token, an owner could also
  modify their own row directly through Supabase's Data API, bypassing the
  app's server-side validation/scoring. This prototype does not treat scores
  as tamper-proof or research-grade. A future trusted write path should use
  narrowly scoped database functions or a server-only secret key, never a
  service key in the browser.
- Refreshing or signing back in restores the user's latest in-progress
  assessment, or their latest completed conversation when none is in progress.
  The account page lists up to 50 sessions. Starting over marks an unfinished
  assessment abandoned and keeps it in history.
- Account deletion, data-retention automation, admin dashboard/audit trail,
  and backup/restore procedures are not implemented. Deleting the Supabase
  Auth user cascades to that user's assessment rows through the foreign key.

## API outline

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | API health check and configured storage provider. |
| `GET` | `/api/assessments/active` | Latest in-progress assessment, or latest completed conversation. |
| `GET` | `/api/assessments` | Up to 50 owner-scoped history summaries. |
| `GET` | `/api/assessments/:id` | Owner-scoped assessment detail. |
| `POST` | `/api/assessments` | Create an assessment after the current consent is accepted. |
| `POST` | `/api/assessments/:id/answers` | Save the next ordered answer; score is computed on the server. |
| `POST` | `/api/assessments/:id/messages` | Persist an assistant or completed-session chat message. |
| `POST` | `/api/assessments/:id/abandon` | Mark an unfinished assessment abandoned without deleting it. |

Protected API calls require `Authorization: Bearer <Supabase access token>`.
Assessment mutation calls also require an allowed `Origin`. The API filters
queries by the verified Supabase user ID; RLS independently enforces row
ownership.

## Data migration and privacy boundary

The earlier temporary SQLite database is no longer used and is not
automatically imported into Supabase. Apply the SQL migration above before
using this version.

Supabase is a hosted database/auth provider, not a guarantee of research or
health-data compliance. This prototype does not implement a formal research
consent workflow, audited administrative access, scheduled retention,
self-service deletion, or validated nutrition assessment. The TPB model was
trained on a small respondent survey dataset, but it has not been validated
for research or operational decisions. Do not enter identifying or sensitive
health information.

The live assessment uses an experimental BERT/Ridge model for 57 TPB items and
English-language phrase matching for five intention items. It is not a
validated psychometric instrument, does not diagnose a condition, and must not
be used for medical decisions. Skipped answers remain unscored rather than
being treated as neutral. Construct estimates are withheld until at least
three items have scoreable answers. The TPB encoder runs through a local
Python worker; the app does not send assessment text to an external inference
provider.

Before collecting additional participant data or using the system in a study,
implement and review the production requirements in the remake plan, including
versioned questionnaires/scoring, formal consent, verified accounts, access/audit
controls, secure backups, retention/deletion, and research/privacy approval.

## Quality checks

```sh
npm test
npm run typecheck
npm run build
npm audit
```

`npm run build` type-checks both the React client and Express server before
building the production frontend.

## Design and motion

The interface uses a Filipino-food-led editorial direction: forest green,
rice-paper cream, calamansi, and guava accents, with a custom CSS meal
illustration. The locally rendered Aurora-style background is inspired by
React Bits, without WebGL, external images, or hosted effects.

Reusable controls in `src/components/ui/primitives.tsx` follow shadcn/ui
composition patterns; Radix powers the consent checkbox and accessible help
dialog. The Supabase browser client follows the Supabase shadcn registry
client block. Route changes, scroll reveals, chat entrances/typing, progress
updates, dialogs, buttons, and the mobile dropdown use motion that respects
the visitor's reduced-motion preference.
