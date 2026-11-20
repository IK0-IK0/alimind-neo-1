# AliMind Remake Plan

## Purpose

Use this document as the product and implementation brief for the AliMind web prototype in this repository. It records both the existing source-product behavior and the remake's implemented prototype baseline, then defines the production-ready target and remaining roadmap.

The source-product notes below describe the earlier reference implementation and are not a complete description of the current React app. For the current runnable prototype, follow **Implemented prototype status** and the repository `README.md`. Keep a clean separation between UI, assessment/scoring logic, and optional AI/recipe features.

## Product summary

AliMind is a browser-based nutrition coaching demo. It uses free-text answers to a conversational assessment to estimate:

- **Theory of Planned Behavior (TPB)** factors: attitude, subjective norm/social support, and perceived behavioral control/confidence.
- **Transtheoretical Model (TTM)** readiness stage: pre-contemplation, contemplation, preparation, action, or maintenance.

The demo turns the assessment into a behavioral profile, identifies the lowest TPB factor, selects a stage- and factor-matched Behavior Change Technique (BCT), and presents supportive nutrition guidance. Its subject matter and recipe data are Filipino-food-oriented. The research notes describe an intended audience of adults aged 18–40 in Davao City; confirm whether the new project's audience is still the same before treating that as a product requirement.

This is a research/demo experience, not a medical or diagnostic product. Preserve a clear nutrition/medical disclaimer and avoid presenting inferred scores as clinical measurements.

## Implemented prototype status — 2026-11-05

The current project implements the visual/motion direction and uses Supabase Auth + Postgres:

- React/Vite frontend with an Express 5 API served on the same origin in production. Vite proxies `/api` to the API during development.
- Supabase Auth email/password registration, sign-in, session refresh, and sign-out. Email confirmation is disabled for this prototype; Supabase access tokens are validated by the API, and no service-role key is used by the app.
- `@supabase/supabase-js` and `@supabase/ssr` for typed Supabase client integration. The Supabase browser client follows the shadcn registry's React Router client block.
- `supabase/migrations/202611050001_assessment_sessions.sql` creates the Postgres assessment table, a one-active-assessment-per-user index, and owner-scoped RLS policies. Apply it in the Supabase SQL Editor before using the assessment.
- `supabase/migrations/202611050002_profiles.sql` creates an owner-scoped app profile table linked to `auth.users`, backfills existing users, and syncs display names from Auth metadata. It stores no credentials and does not change Supabase email-confirmation behavior.
- The signed-in user must accept the displayed storage consent before an assessment is created. Consent version/time, randomized question order, responses/scores, chat messages, status, and timestamps are stored in Supabase Postgres.
- The API validates user sessions, ownership, origin, question order, and answer input; it calculates score bands itself and uses optimistic updates to reject concurrent edits. RLS independently scopes rows to the authenticated user. Refresh/sign-in resumes an unfinished assessment; account history lists recent assessments.
- The earlier local SQLite database is no longer used and is not imported automatically. There is no admin access/audit trail, self-service deletion, scheduled retention, or backup/restore workflow. Use synthetic data only; never collect real participant or sensitive health information with this prototype.
- The scoring and coaching remain lightweight English-phrase-matched educational estimates—not validated psychometrics, clinical advice, or an AI conversation. No assessment text is sent to an inference provider.

Run instructions, Supabase setup, environment variables, migration, API outline, data handling, and validation commands are maintained in `README.md`. This implementation is a milestone, not a change to the production release boundary below: the security, privacy, research, versioning, and operational gaps still need to be resolved before real users or participant data.

The local-only pipeline-lab Q1 experiment uses `bert-base-uncased` through Python Transformers as a frozen mean-pooled encoder. A Ridge head is fit on 42 synthetic answers, 14 separate synthetic examples estimate a Gaussian residual scale, and 14 synthetic answers are held out for demo metrics. The experiment is not production scoring or real confidence: these examples are synthetic, English-only, and too small to establish validity. The route is authenticated and disabled in production; Python dependencies are listed in `server/tpb/requirements.txt`. The base checkpoint is pretrained for fill-mask, not TPB classification, and is not fine-tuned by this experiment. Any real deployment requires reviewed human-labeled responses and independent validation/calibration.

## Current behavior and source-of-truth notes

### Active user journey

1. The public landing page links to registration/login and the assessment. `/demo` redirects visitors without a valid Supabase session to login.
2. Before a new assessment is created, the signed-in user reviews and accepts the storage consent. Assessment text is then persisted in Supabase Postgres under owner-scoped RLS; consent is not a substitute for research/privacy approval.
3. The server snapshots the browser's randomized question order after validating it against the question bank. Questions are asked one at a time as free text; answers are saved before the chat advances. The server derives scores from the canonical question bank.
4. On refresh or a later sign-in, the API returns the user's latest in-progress assessment, or the latest completed conversation if none is in progress. The chat restores its ordered questions, responses, and messages. The account page lists up to 50 sessions and links to resume an unfinished one.
5. After question 20, the assistant typing presentation is followed by a persisted rule-based result response, profile summary, stage/factor-targeted intervention, Filipino dish, and action prompt. Follow-up chat text is stored but does not change the score or invoke an LLM.
6. Completed and abandoned sessions remain in account history. “Start over” asks for confirmation, marks an unfinished assessment abandoned without deleting it, and requires fresh consent before a new session. Self-service account/data deletion is not implemented.

### Assessment definition: 20 free-text questions

The active question bank is defined in `prototype/src/services/questionnaireService.ts`. It has **15 TPB questions plus 5 TTM questions**, not the 15-question multiple-choice form described in some older documents. The order is randomized for each session.

| Construct | Count | Question prompts |
|---|---:|---|
| Attitude | 5 | 1. How do you feel about eating healthy food?  2. Do you think eating healthier would improve your energy and overall wellbeing?  3. On a personal level, how important is healthy eating to you?  4. When you think about healthy food, what comes to mind? How would you describe it?  5. In your opinion, do the benefits of healthy eating outweigh the effort it takes? |
| Subjective norm / social support | 5 | 1. Do your family and friends support you in eating healthier?  2. What about the people who matter most to you - do they eat healthy themselves?  3. If you decided to eat healthier, would your family be willing to join you for healthy meals?  4. When you mention eating healthier to people around you, how do they usually react?  5. Are there any role models or people you admire who eat healthy? |
| Perceived behavioral control | 5 | 1. How confident do you feel about preparing healthy meals?  2. Thinking practically, do you have the time, money, and resources needed to eat healthier?  3. In your area, how easy or difficult is it to access healthy food options?  4. Generally speaking, do you feel like you have control over what you eat?  5. When you face obstacles to eating healthy, how capable do you feel in overcoming them? |
| TTM readiness | 5 | 1. Are you currently thinking about changing your eating habits?  2. If you're not already eating healthy, when do you think you might start?  3. Have you already taken any concrete steps toward eating healthier?  4. If you had to describe your current eating habits right now, what would you say?  5. If you're already eating healthy, how long have you been doing it? |

Each question has five keyword groups mapped to `100`, `75`, `50`, `25`, and `0`. The implementation lowercases the answer and counts substring matches in each group; the group with the most matches wins, ties retain the first/best level encountered, and no match defaults to `50`. A list of negation terms flips high/low results unless the matched keyword already includes negation. Low-quality/gibberish checks return a neutral score of `50` and later reduce confidence. This describes the earlier reference prototype only; the current remake stores unanswered/uncertain responses as missing rather than treating them as neutral evidence.

The remake should keep the question categories, prompts, mappings, and behavior in a dedicated data/service module rather than embedding them in chat rendering code. Preserve the active free-text interaction unless the new project intentionally chooses the older multiple-choice questionnaire.

### Scoring

- **TPB**: in the current baseline, average the five scoreable questions per construct and round to the nearest integer. Scores are on `0–100`. If an admin publishes a version with different question counts, calculate from that version's defined question set and enforce its minimum coverage rule; never assume five in code.
- **TPB "confidence" in the questionnaire service**: average the three construct scores, then subtract 8 points per low-quality answer; clamp the result to at least 10. This is not a statistical confidence estimate; the UI describes it as an average. Rename it to an average/profile summary or remove it rather than implying model certainty.
- **TTM**: in the current baseline, map each scoreable TTM answer to a stage score using `round(answerScore / 25)`, average the five stage scores, then round the average to select one of the five stages. The order is `preContemplation`, `contemplation`, `preparation`, `action`, `maintenance`. For edited versions, use only that version's TTM items and minimum coverage rule.
- **TTM "confidence"**: derive a base value from response agreement (`max(50, 100 - stdDev * 12.5)`), then subtract 8 points per low-quality answer and clamp to at least 10. Agreement is not calibrated confidence; label it as consistency or omit it unless validated.
- **Interim profile in the prototype**: update as answers arrive. An unanswered TPB construct displays a neutral `50`; TTM remains unset until at least one TTM answer exists. **Remake improvement:** do not impute unanswered questions as neutral. Show coverage and a clearly marked provisional score; show “not enough answers” if the chosen minimum coverage is not met.
- **Weakest determinant**: the minimum of attitude, subjective norm, and perceived control. Use a deterministic tie-breaker so repeated renders/tests select the same factor.

Do not treat these prototype estimates as validated psychometric scores. The current text matching is intentionally lightweight, English-centric, and susceptible to ambiguous keywords and negation.

### Implementation audit: issues the remake should not copy

These are source-code findings, not just documentation mismatches. Treat them as explicit fixes and acceptance tests in the remake.

1. **A valid zero score is mistaken for a missing answer.** Final TPB/TTM calculation uses `answer?.score || 50`; a score of `0` becomes neutral `50`. Use a null/missing check (`??` or explicit presence test), and test all-zero answers produce the lowest TPB scores and pre-contemplation stage.
2. **The final UI may show stale interim results.** `ChatbotShowcase` computes `newState` after the last answer but the completion message uses React state captured before that update and explicitly avoids using final calculated values. Build the final response from the returned final state, persist those exact results, and test that changing the last answer changes the displayed profile.
3. **The displayed TPB "confidence" is not confidence.** Both questionnaire scoring and BERT conversion derive a field called confidence from score averages. Do not present an average score as likelihood/certainty. Provide an actual validated uncertainty measure or rename it clearly as an average; retain model probability separately if the model exposes calibrated probabilities.
4. **Keyword scoring can misread free text.** It uses substring occurrence counts, broad negation detection, and global score flipping. A keyword can match inside another word; negation may refer to a different phrase; opposing signals and ties are not robustly handled. Replace with explicit token/phrase matching and per-question scoring rules, allow “not sure / skip” as a distinct missing response, and show the inferred category for confirmation where appropriate. Evaluate against reviewed examples before making claims about accuracy.
5. **Low-quality detection and answer logs expose text.** The current questionnaire service logs raw response text to the browser console, and the chat path logs user answers. Remove raw-answer logging in the remake; send only redacted operational events to monitoring. Do not put answers, email addresses, or session tokens in telemetry/audit metadata.
6. **Model initialization can race.** Startup initializes four browser models together, while a second caller can return early merely because loading is in progress and then use an uninitialized classifier. Use a shared initialization promise (single-flight), explicit loading/error state, model/schema validation, and deterministic fallback; test concurrent calls and partial model-load failure.
7. **Post-assessment chat can disagree with the profile.** The service infers from the latest message only, while the sidebar retains assessment results. Either make the bot explicitly use the saved assessment profile/history, or label post-assessment analysis as a separate latest-message estimate and do not claim it reflects the questionnaire.
8. **Current controls are presentation-only.** The prototype has no authenticated server/database. The remake must validate question ID, session ownership, expected answer order, session status, and duplicate submission on the server before storing an answer or publishing an edited questionnaire.
9. **Consent and progress recovery do not exist.** The prototype does not persist or resume. The remake must collect consent before storing free-text data, save an explicit question order and current position, and define recovery after refresh/network failure.

The codebase's `prototype/src/services/questionnaireService.test.ts` also contains older assumptions (for example, numeric answer calls and canonical question ordering). Port tests only after rewriting them to assert the intended free-text, randomized, persisted flow.

## Target system architecture

Keep the browser responsible for accessible presentation and interaction; keep authority, sensitive data access, and durable truth on the server.

```text
Browser
  ├─ Public landing / auth pages
  ├─ Signed-in participant UI ── user-scoped API ──┐
  └─ Admin UI ──────────────── admin API ─────────┤
                                                   ▼
                                          Application server
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                         Auth/session       Domain services        Audit/metrics
                              │            assessment/scoring      (no raw text)
                              └────────────────────┼────────────────────┘
                                                   ▼
                                         Relational database
                         users, questionnaire versions, sessions, answers
```

- Treat the database as the durable source of truth. React state is a view/cache, never the authority for user ID, role, question version, answer order, score, or admin permission.
- Keep inference/scoring functions deterministic and versioned. Persist the input/version, result, and provenance needed to reproduce a result; do not make a model call necessary to render a saved result.
- Place all privileged operations behind the application server, including profile/answer reads, question edits/publication, account-role changes, dashboard aggregates, and export.
- Keep the question content manageable by admins, but keep the scoring algorithm and response-generation code deploy-controlled unless a separate reviewed configuration system is built. Editing arbitrary executable logic from a dashboard is out of scope.
- Prefer a same-origin app/API. If the frontend and API are separate, explicitly configure origins, cookie policy, CSRF protections, and secure CORS; never use wildcard credentialed CORS.

### Documented seven-step computational pipeline (target)

The research introduction and prototype Help dialog describe the following seven computational steps. This is a **target service pipeline**, not the three marketing/user-journey cards and not a claim that every step is currently connected to the active chat. Preserve the order and make each step independently testable:

1. **Context Collection** — collect Part A's free-text TPB responses and Part B's conditional TTM screening answers, and extract relevant dietary habits, barriers, goals, preferences, and practical constraints from the user's message or consented assessment answers. Keep TPB scoring separate from TTM classification; the lab's Part A scoring remains unavailable until its comparison dataset and rubric exist.
2. **TPB Inference** — estimate attitude, subjective norm/social support, and perceived behavioral control from the available context and scoreable assessment answers.
3. **TTM Stage Classification** — classify pre-contemplation, contemplation, preparation, action, or maintenance using the conditional healthy-eating screening questions captured in Context Collection. Keep this decision-tree result separate from TPB determinant scores. The current lab implements the supplied one-month and one-week cutoffs literally and labels the result provisional; these are not the conventional TTM time windows.
4. **Intervention Mode Selection** — choose the stage-appropriate mode from the stage-to-intervention table (awareness, ambivalence resolution, planning, coping, or relapse prevention).
5. **TPB-Targeted Intervention** — identify the weakest sufficiently covered TPB determinant using a deterministic tie-breaker, then select the matching stage × determinant BCT.
6. **Recipe Generation** — filter reviewed Filipino dishes using extracted preferences, dietary constraints, time, budget, equipment, and any explicitly supplied nutrition targets. Return a clear no-match result rather than inventing a suitable dish.
7. **Response Generation** — combine the supported context, TPB/TTM results, intervention mode, BCT, and optional recipe result into non-judgmental guidance. Label estimates as provisional; do not imply diagnosis or validated certainty.

#### Connections and boundaries

Treat the pipeline as a sequence of small transformations, orchestrated by a coaching service rather than embedded in React rendering or an API route:

```text
consented message + assessment snapshot
  -> Context Collection
  -> TPB Inference + TTM Stage Classification
  -> Intervention Mode Selection
  -> weakest covered TPB determinant + stage × determinant BCT
  -> recipe filter/recommendation (optional result)
  -> Response Generation
  -> versioned result returned to UI and persisted with the assessment
```

- Pass typed results forward; do not have later steps re-read UI state or parse earlier steps' display text. A context result should contain only supported fields (for example, `habits`, `goals`, `barriers`, `preferences`, and `constraints`) and should preserve unknown/unmentioned values as unknown rather than guessing.
- TPB scores come from their own accumulated, versioned answer set. TTM classification uses the explicit conditional staging answers captured in Context Collection; do not average TTM screening answers into TPB or infer the stage from unrelated free text. Context from follow-up chat can personalize a response or recipe, but must not silently overwrite saved assessment scores.
- The pipeline lab includes a separate 38-item free-text TPB sample instrument grouped into ten source sections. Its original 1–7 scale endpoints are retained as data metadata but hidden from respondents. Do not assign numeric scores until a comparison dataset and scoring rubric are available; the lab's existing keyword scorer is a separately labeled legacy fixture and does not score this instrument.
- Intervention mode depends on TTM stage. BCT selection depends on both stage and the weakest TPB determinant; do not select a BCT when the relevant scores lack minimum coverage.
- Recipe filtering consumes extracted constraints and returns recipe IDs plus match/exclusion reasons. It must not change TPB/TTM scores. A single dish recommendation is distinct from a multi-day meal plan; multi-day planning remains optional Phase 9 scope.
- Response Generation is a formatter/composer over the prior results, not another scoring step. If inference or recipe selection is unavailable, state that explicitly and still return safe guidance where possible.
- Keep raw free text out of logs/telemetry. Persist the input/version and result provenance needed to reproduce a result under the consent/retention policy; do not persist hidden model reasoning.

#### Per-step verification

| Step | Input → output contract | Unit tests | Pipeline/integration tests |
|---|---|---|---|
| 1. Context Collection | Message/answers → typed context with explicit unknowns | Extracted supported habits, goals, barriers, preferences, and constraints; negation, ambiguity, empty input, and unsupported details do not become facts | Representative messages pass only the extracted context to scoring/recommendation; no raw text appears in logs |
| 2. TPB Inference | Versioned answers/context → three optional `0–100` determinant scores plus coverage | Each construct's aggregation, minimum coverage, skipped/unmatched answers, valid zero, and deterministic weakest-factor tie | Known answer sets produce the expected profile; insufficient coverage suppresses determinant-targeted selection |
| 3. TTM Classification | Conditional healthy-eating screening answers → one of five stages or explicit incomplete result | Every decision-tree branch, conditional follow-up, missing required answer, and irrelevant branch answer | Each screening path selects the expected intervention mode; unrelated follow-up text does not mutate the result |
| 4. Intervention Mode | TTM stage → one defined mode | All five stages map to the intended mode and copy | Each classified stage passes the matching mode to response composition |
| 5. BCT Selection | Stage + covered weakest determinant → one of 15 BCTs or explicit unavailable result | Assert the exact expected BCT for all 15 pairs, tie-break order, missing factor, and invalid stage | All stage/factor combinations produce the right BCT and explanation in the composed response |
| 6. Recipe Generation | Context/constraints + recipe provider/catalog → ranked matches with reasons, or no-match | Each individual filter, combined constraints, ranking, dietary exclusions, provider errors, and no-match behavior | Constraints extracted in Step 1 exclude incompatible dishes; unavailable recipes do not block profile/intervention output. If multi-day planning is enabled, additionally test calorie tolerance, duplicate prevention, and incomplete plans |
| 7. Response Generation | Typed pipeline result → user-facing response sections | Required sections, safe wording, estimate labels, no unsupported claims, and unavailable-result wording | End-to-end fixtures cover every stage and weakest factor, recipe match/no-match, and partial inference failure; persisted result renders identically after reload |

Keep unit tests for each pure step in its owning feature module, plus one coaching-pipeline integration suite using fixed fixtures and injected model/recipe dependencies. Add component tests for rendering/loading/error states and browser tests only for the full consent → assessment → result → persistence journey. Use deterministic fixtures (and injected randomness where needed); do not rely on live model downloads or real user data in routine tests.

#### Current implementation status (do not confuse with target)

- A development-only visual workbench is available at `/pipeline-lab` while running Vite locally. It runs existing scoring/coaching code against deterministic fixtures and editable question answers. Recipe Generation calls Spoonacular through the server-only `/api/recipes/generate` route, requires sign-in and `SPOONACULAR_API_KEY`, and accepts dish/ingredient query, dietary/allergen, pantry, exclusion, time, servings, estimated PHP cost, and effort criteria. The server converts provider USD estimates using a daily USD/PHP rate (with a visible, configurable fallback) and filters using the entered PHP budget. The reusable recipe finder/card can also be opened from chat; chat recipe searches are not persisted as assessment messages. Context extraction remains unavailable; the live recipe provider does not make the entire target pipeline active in chat.
- Live integration testing showed Spoonacular returns no matches for the hardcoded `cuisine=Filipino` filter (or a `Filipino <dish>` query), while an unfiltered `adobo` query returns recipe candidates. The integration therefore does not hardcode a cuisine filter; users should enter a dish name and evaluate source/result relevance. The official Complex Search docs specify `addRecipeInstructions=true` for analyzed steps; live checks also showed provider-side time/servings/instruction filters could eliminate all candidates, so these constraints are checked against returned details locally. This is limited to the fetched candidate set and must be tested with additional real-world queries.
- The Spoonacular integration supplies recipe search/details and per-serving USD cost estimate where the API returns one; the UI converts these estimates to PHP using the latest Frankfurter USD/PHP quote or the explicitly labeled fallback rate. Step 6 randomly picks one eligible candidate; recipe instructions and equipment come from analyzed provider instructions where available. Its difficulty label is an explicit heuristic based on ready time and instruction count; pantry overlap does not establish Philippine ingredient availability or price. Do not treat the converted price, difficulty, or availability as verified local data.
- TPB scoring, TTM readiness classification, stage descriptions, and a stage × weakest-factor mapping exist in `src/features/assessment/scoring.ts` and `src/features/coaching/coaching.ts`. The current BCT strings are prototype labels; verify and align them with the canonical taxonomy/mapping table above rather than assuming the 15 outputs already match it.
- Assessment scoring uses accumulated answers. The active post-assessment follow-up chat does not call context extraction or message inference; it stores messages and gives a fixed response.
- The completion UI currently displays one hard-coded dish (`Ginisang monggo`). It is not selected by extracted dietary/practical constraints. Spoonacular search is currently wired only into the development Pipeline Lab; the normal chat does not yet invoke it. Multi-day meal planning remains unimplemented.
- Existing tests cover scoring basics and smoke-check that all 15 stage/factor combinations return non-empty coaching content. Strengthen these to assert exact expected outputs, boundaries, and end-to-end connections as listed above.

### Core workflows and system invariants

**Participant lifecycle**

1. Visitor registers and signs in immediately. Before the first assessment, show the versioned privacy/consent notice that specifically explains free-text storage, admin review, model processing, retention, and deletion. No consent means no assessment submission/storage.
2. Authenticated participant starts a session. The server snapshots the active questionnaire version, scoring version, consent version, randomized question order, and status (`in_progress`).
3. Each answer is validated against that session's current question and recorded with an idempotency key. A refresh reloads server state. Network failures preserve input for retry but do not advance progress until the write succeeds.
4. On completion, the server verifies required-answer/skip rules, calculates results from the persisted answer set, commits the final answers/results/status atomically, and marks the session immutable. If computation fails, keep it recoverable as in-progress; never mark it completed with missing results.
5. Participant dashboard reads only the authenticated user's records. A new attempt creates a new assessment; do not silently overwrite prior results. User correction/deletion follows a documented workflow and leaves only the minimum permitted audit record.

**Admin question lifecycle**

1. Admin creates a draft from an existing published version. Draft edits never affect active or historical sessions.
2. Server validates question IDs/types, required content, scoring mappings, stage/category coverage, duplicate/empty values, and supported scoring configuration. Preview with known example answers and expected scores.
3. Admin explicitly publishes. In one transaction, freeze the version, record publisher/time/audit event, and move the active-version pointer. Existing sessions continue on their pinned version; new sessions use the new one.
4. A rollback publishes a prior content snapshot as a new version rather than rewriting the history. All individual-response access and exports are authorized and audited.

**Invariants**

- `assessment.user_id` comes from the verified server session, never the request body.
- An answer is accepted only if its assessment belongs to the caller, remains in progress, and the question is the server's expected unanswered item (or the same idempotent retry).
- A completed assessment, its answer set, question snapshot, scoring version, and result snapshot are immutable.
- Admin role is checked on every admin data/action request; database query filters are always applied server-side.
- User-facing score and AI labels accurately state whether they are preliminary, rule-based, model-inferred, or final.
- Raw free-text answers are not written to application logs, analytics events, traces, or error reports.

### Stage-to-intervention mapping

The coaching style follows the TTM stage:

| Stage | Intervention mode | Intended emphasis |
|---|---|---|
| Pre-contemplation | Awareness | Information and low-pressure exploration |
| Contemplation | Ambivalence resolution | Pros/cons, social support, or reframing |
| Preparation | Planning | Practical support, action planning, small next steps |
| Action | Coping | Step-by-step help, emotional support, and sustaining progress |
| Maintenance | Relapse prevention | Reinforcement, self-reward, and problem solving |

The active chatbot service maps the pair `(stage, weakest determinant)` to a BCT:

| TTM stage | Weak attitude | Weak social support | Weak perceived control |
|---|---|---|---|
| Pre-contemplation | 5.1 Information about health consequences | 6.2 Social comparison | 15.1 Verbal persuasion about capability |
| Contemplation | 9.2 Pros and cons | 3.1 Social support (unspecified) | 13.2 Framing/reframing |
| Preparation | 5.3 Information about social/environmental consequences | 3.2 Practical social support | 1.4 Action planning |
| Action | 10.4 Social reward | 3.3 Emotional social support | 4.1 Instruction on how to perform the behavior |
| Maintenance | 10.9 Self-reward | 6.3 Information about others' approval | 1.2 Problem solving |

Keep the stage/factor mapping in a pure function or table and test all 15 combinations. The completion response should explain the profile in friendly language, not just show internal codes.

### Message inference and AI behavior

`prototype/src/services/chatbotService.ts` has two inference paths:

1. `processChatMessage()` tries four Transformers.js text classifiers from Hugging Face (`franzzzzzzzzz/tpb-attitude-nutrition`, `tpb-subjective-norm-nutrition`, `tpb-perceived-control-nutrition`, and `ttm-stage-nutrition`). The classifiers are loaded in the browser at app startup; model failure falls back to keyword-based TPB/TTM inference.
2. `processChatMessageSync()` is a keyword-only compatibility path.

This is **not** a Hugging Face generative-chat integration. The separate `huggingFaceConnector.ts` and older integration instructions describe an optional/older approach and are not the active chat path.

Important current behavior: the normal chat call is `processChatMessage(text)` with only the latest message. Questionnaire results are displayed and used for the completion/intervention flow, but are not passed into that service. The service response currently has `recommendedRecipes: []`. The dietary-context extraction, recipe filtering, and recipe recommendation helpers exist in the same service, but are not used by the active `processChatMessage()` path. Do not claim that normal chat uses questionnaire context, history, or recipes unless the remake intentionally wires and tests those features.

The BERT classifiers download model assets from Hugging Face and execute inference in the browser; this differs from sending each message to a hosted inference API. Make the model source and browser processing clear in the privacy notice. The separate text-generation connector is not the active path and should not be enabled without explicit product/privacy review.

The assessment-completion intervention in `ChatbotShowcase.tsx` is also a separate implementation: it uses local stage/determinant-specific text and a local dish-selection helper. It does not call `chatbotService.selectBCT()` or the standard `processChatMessage()` response pipeline. The remake should consolidate these into one coaching service so that assessment completion and later coaching use consistent rules and tests.

### Supporting modules that exist but are not part of the active chat loop

- `prototype/src/data/recipes.ts`: local Filipino recipe records with ingredients, instructions, prep/cook time, difficulty, nutrition fields, tags, budget/equipment, and meal type.
- `prototype/src/utils/recipeFilters.ts`: text, constraint, dietary restriction, and calorie filtering helpers.
- `prototype/src/services/mealPlanService.ts` and `prototype/src/components/MealPlanView.tsx`: multi-day meal plan generation/display.
- `prototype/src/services/huggingFaceConnector.ts`: optional external text-generation connector described by older docs.
- `prototype/src/components/QuestionnaireFlow.tsx`: older radio-button questionnaire UI. It is not the active chat-based questionnaire and its assumptions do not match the current free-text question data shape.

Treat these as optional scope. If the remake includes them, wire them into an explicit user flow and add tests; otherwise leave them out of the first working release rather than implying they are already active.

## Recommended implementation order

Complete each phase before starting the next. Keep the new project runnable at each milestone.

### Phase 0 — Establish the new project and boundaries

- Confirm the target framework, hosting, visual assets, and whether the remake includes optional recipe/meal-planning screens.
- Start with a client-rendered React + TypeScript web app. The reference uses Vite, React 18, React Router, Material UI, Emotion, and Framer Motion. Transformers.js is only needed if browser BERT inference is included.
- Before implementation, select the auth provider, server/API architecture, database, and hosting. The reference is a client-side Vite app with no authentication, backend, or durable database; these are new requirements and cannot be safely implemented as client-only features.
- Prefer one same-origin full-stack deployment with server-side route handlers/actions and a managed relational database. If the target project is a static Vite SPA, add a real protected API/backend; never place database credentials or authorization decisions in Vite/client code.
- Create the new project's README, environment-variable template if needed, lint/test/build scripts, and a `.gitignore`.
- Keep secrets out of browser bundles. The current BERT models are public model downloads; if a future provider requires credentials, call it through a server-side endpoint rather than embedding a private key in frontend code.
- Decide the privacy/consent model, retention period, who may review identifiable assessment answers, whether admins may export them, and whether normal chat transcripts are in scope. This plan assumes admins can review questionnaire responses and derived results; it does not assume they can read ordinary follow-up chat transcripts.
- Create a simple folder structure:

  ```text
  src/
    app/             # routing, theme, app shell
    pages/           # landing and demo routes
    components/      # shared layout, dialogs, chat primitives
    features/
      assessment/    # question bank, state, scoring, progress UI
      coaching/      # TPB/TTM inference, BCT selection, response copy
      recipes/       # recipe data, filters, optional meal planner
    services/        # model loading / inference adapters
    data/            # static content and recipe data
    types/           # shared domain contracts where useful
  server/            # protected APIs and persistence (if colocated)
  db/                # schema and migrations
  ```

**Exit check:** a clean install, dev server, test runner, lint, and production build all work in the new repository; architecture decisions document where authorization and database access are enforced.

### Phase 1 — Establish authentication and persistent data foundations

- Choose one auth approach that fits the actual framework. For a Vite frontend with a separate API, use an auth provider or a server-side TypeScript auth solution such as Better Auth; for a Next.js remake, Clerk or Better Auth are reasonable choices. Do not mix providers or copy framework-specific examples without adapting them.
- Implement server-verified sessions and roles (`user`, `admin`). Authentication proves identity; authorization must be checked on every protected server action/API request, not just by hiding frontend routes or controls.
- Support registration, sign-in, sign-out, email verification, password reset, session expiry, and account deletion/deactivation. Add rate limits and generic error messages for sign-in/registration endpoints. Never store plaintext passwords or credentials in the client.
- Provision the first administrator through a documented, one-time server-side bootstrap/invite process or provider-managed role assignment. Never ship a default admin password, allow public self-assignment of admin, or trust a client-supplied role.
- Add a database and migrations before assessment work. Use durable IDs, timestamps, indexes, foreign keys, transactional writes, TLS, least-privilege DB credentials, backups, and a documented restore procedure.
- Mark assessment/profile API responses private and non-cacheable by shared CDNs; rely on managed encryption at rest and TLS in transit, and restrict production database access to the application service and approved operators.
- Model at least:
  - Users/auth provider identities and role/status metadata; keep provider-managed credentials/sessions under the auth system.
  - `questionnaire_versions`: immutable content version, status, creator/publisher, publication time, and scorer version.
  - Questions with stable IDs, version IDs, construct/type, prompt, display order, and versioned scoring mappings/options.
  - `assessment_sessions`: owner user ID, questionnaire/scorer version IDs, pinned randomized question order, current position, status (`in_progress`, `completed`, `abandoned`), start/completion timestamps, consent version, and result snapshot.
  - `assessment_answers`: assessment ID, stable question/version ID, response or explicit skip status, inferred score/quality status, and timestamps. Enforce one current response per question/session and keep completed records immutable.
  - `consent_records`: user/assessment, policy version, acceptance timestamp, and the disclosed processing choices.
  - `audit_events`: actor, action, target, timestamp, and safe metadata for admin question edits, publishes, sensitive record access, account changes, and exports.
- Define retention/deletion rules. Do not store IP addresses, device fingerprints, or full chat histories unless there is a specific approved need and disclosed consent. Restrict raw free-text responses to authorized reviewers and avoid sending them to third-party model providers by default.
- Do not use participant answers for model training, marketing, or unrelated product analytics without separate explicit consent and appropriate review.
- For a separate frontend/API deployment, configure trusted origins, secure HTTP-only session cookies, CSRF protections as appropriate, and server-side secret storage. Validate requests and paginate data endpoints safely.

**Exit check:** migrations apply from an empty database; register → verify → sign in → retrieve server-verified session → sign out works; regular users cannot grant themselves admin; unauthorized and unauthenticated API requests are rejected.

### Release boundaries

**Required first release:** account creation and recovery; verified user/admin roles; consented and resumable assessment; correct/versioned scoring; participant history; admin user/assessment lookup with response review; versioned question editing/publishing; audit trail; responsive accessible experience; and documented retention/deletion.

**Defer until the core is reliable:** external generative chat, broad recipe search, multi-day meal plans, CSV export, and advanced analytics. The one locally selected dish in the completion message is part of the baseline experience; meal-planning features are not required for release.

Do not launch data collection with placeholder auth, unversioned questions, client-only results, or unreviewed consent/retention rules.

### Phase 2 — Build the app shell and role-aware navigation

- Add routes for `/` and `/demo`, navigation between them, and a shared responsive app shell.
- Rebuild the landing page sections from `prototype/src/components/`: `TopBar`, `Hero`, `Features`, `HowItWorks`, `ContactSection`, and `Footer`.
- Add routes for `/sign-in`, `/register`, `/forgot-password`, `/dashboard`, and `/admin` (adapt paths to the framework).
- Add role-aware navigation: signed-out visitors can reach public pages and auth flows; signed-in users can reach their own dashboard/demo; admins can reach the admin dashboard and user experience. A route guard is UX only; every backing endpoint must independently authorize the session.
- Match the reference’s green/teal visual language: primary `#4CAF50`, dark green `#2E7D32`, secondary teal `#00897B`, pale background `#FAFAFA`, and white surfaces. Use the existing Inter/Roboto/system sans-serif style and rounded cards/buttons.
- Preserve route transitions only if they improve the remake; avoid adding animation complexity before navigation and responsive layout are correct.

**Exit check:** landing CTAs reach `/demo`; protected routes redirect or show access denied appropriately; role-aware navigation works with keyboard and touch; no horizontal overflow at mobile widths.

#### Visual direction update — 2026-11-02

The first prototype's clean green cards felt too generic. Give AliMind a more ownable, Filipino-food-led editorial identity while keeping the experience calm, welcoming, and non-clinical:

- Lead with food, culture, family, and everyday routines; use specific, conversational copy rather than generic wellness slogans. Avoid assumptions about a user's region, income, family structure, or diet.
- Use a deep kitchen green `#18392F`, warm rice-paper cream `#FBF8EF`, calamansi leaf `#DCE78E`, and guava/coral `#B85843` as the core palette. Keep text contrast accessible and reserve saturated color for focused accents.
- Use oversized editorial serif display copy paired with a restrained sans-serif UI. Give the landing hero a distinctive meal illustration, layered paper/grain texture, generous negative space, and one clear action. Avoid stock wellness imagery, generic gradient-card grids, and fabricated testimonials/social proof.
- Use shadcn/ui compositional patterns for reusable buttons, cards, badges, avatars, inputs, progress, checkboxes, and dialogs. In a non-Tailwind Vite app, use locally owned components with Radix primitives where interaction/accessibility benefits from them; do not introduce a Tailwind runtime solely to imitate shadcn styling.
- Use React Bits background components selectively. The prototype uses a locally styled, CSS-only Aurora-like backdrop, not a downloaded model or hosted rendering service. Keep motion decorative and behind readable content, honor `prefers-reduced-motion`, and avoid continuous pointer listeners or WebGL where a CSS animation is sufficient.
- Treat the landing page and assessment as one visual system: repeat the palette, typography, paper texture, and small botanical/meal details, while keeping assessment controls quieter than the hero.
- Use a small motion hierarchy instead of animating every element: one-time hero entrance, slow plate/label drift, staggered scroll reveals for content sections, brief chat-message arrivals, and eased progress/score updates. Keep the aurora the only continuous ambient motion. Respect `prefers-reduced-motion` by removing movement and revealing content immediately; animation must never gate access to content or controls.

**Current prototype implementation:** the marketing hero uses a slow, CSS-animated aurora, a gently floating CSS-drawn Filipino-inspired meal, and the updated rice-paper/forest/calamansi/guava palette. A shared IntersectionObserver reveals landing and demo sections as they enter the viewport. Route changes, chat messages, a simulated assistant typing indicator, profile score updates, progress, and dialogs are animated; the chat scrolls to the latest turn and disables sending while the local typing delay runs. This delay is presentation only, not a network request or AI inference. Keep motion non-blocking and honor `prefers-reduced-motion` by removing animation and shortening the simulated delay. `src/components/ui/primitives.tsx` provides shadcn-style primitives backed by Radix Dialog and Checkbox; `src/components/AuroraBackground.tsx` owns the decorative background. The demo has no login or persisted chat: its UI labels this clearly, and its in-memory state is not a substitute for authentication.

Controls should feel responsive, not static: add a short press/compression response and clear hover/focus feedback to buttons, animate icons with their actions, and reveal the mobile navigation dropdown using opacity/translation and a subtle stagger rather than toggling `display`. Keep keyboard focus, touch targets, disabled states, and reduced-motion behavior intact. These are interaction affordances; avoid adding gratuitous motion to every text element.

### Phase 3 — Define the versioned question bank and admin editor

- Add typed models for `QuestionType`, `Question`, `KeywordMapping`, answer records, `QuestionnaireState`, `TPBScores`, and `TTMStage`.
- Port all 20 prompts and their five keyword groups from the current `questionnaireService.ts`; preserve stable IDs and construct labels. Store the active bank in the database with an immutable published version, not a hard-coded frontend constant.
- Load only the currently published questionnaire version when a new assessment begins. Pin its version ID to the session; historical answers and scoring must remain interpretable after admins publish edits.
- Build the admin question editor early: create/edit/reorder/archive draft questions, configure scoring mappings, inspect a preview, and publish/roll back with immutable versions and audit events. Do not permit editing published question snapshots or executable scoring code.
- Validate question type, unique IDs/order, required prompt text, answer/scoring mapping ranges, and expected construct/stage coverage before publication. Keep scoring algorithm changes deploy-controlled and reviewed.
- Keep question order in the assessment state. Shuffle a copy using Fisher–Yates when starting a session; never mutate the canonical question bank.
- Keep answer values as free text plus inferred numeric score. Associate every answer with its assessment and exact question/version. Validate known question IDs and reject invalid progression rather than silently advancing.

**Exit check:** tests verify the initial version has 20 unique questions and category counts `5/5/5/5`, valid mappings, randomized order containing every question exactly once, deterministic behavior when randomness is seeded/mocked, malformed drafts cannot publish, and historical versions remain unchanged after edits/rollback.

### Phase 4 — Implement the persisted assessment state machine

- Create an initial chat greeting that identifies AliMind and asks permission/readiness to begin.
- Require verified sign-in and affirmative privacy/assessment consent before starting. State clearly that admins can review questionnaire responses.
- Recognize start consent using exact phrases/tokens case-insensitively; substring matching can treat unrelated words as affirmative. Give the user a clear retry response otherwise.
- Ask one server-selected randomized question at a time and treat the next user message as that question's free-text answer. Compute the progress denominator from the pinned questionnaire version, not a hard-coded `20`, because admins may publish another validated version.
- Show progress from server state, disable sending while a write is pending, and keep the latest messages visible.
- Persist an assessment session, question order, current position, and each answer to the authenticated user's account. Save answers idempotently and use optimistic concurrency/version checks so duplicate tabs cannot silently overwrite answers. A network failure must not advance the question.
- Validate answer size and content server-side; render escaped text, rate-limit writes, and provide an explicit skip/prefer-not-to-answer path rather than inventing a neutral score.
- Implement resume and abandon semantics explicitly. Distinguish restarting the UI from deleting a saved assessment; confirm before abandoning and follow the retention policy.
- Preserve a development-only shortcut/test-profile flow only if it can be hidden from end users and does not contaminate production state.

**Exit check:** tests cover consent, non-affirmative response, progression, final-question completion, reload/resume, ownership enforcement, concurrent tabs, idempotent retry, abandon semantics, overlong/empty input, and database failure recovery. Progress and completion use the count/order for the pinned questionnaire version, not a constant.

### Phase 5 — Implement scoring, result snapshots, and profile updates

- Port/refine five-level keyword scoring, TPB averages, TTM stage selection, and profile updates. Do not blindly port the prototype's broad negation flipping or treat a missing answer as neutral.
- Keep scoring pure and independently testable; do not place scoring calculations in React components.
- Use explicit matching boundaries, per-question negation rules, deterministic tie handling, and a distinct missing/uncertain result. Do not claim accuracy until the scoring method is reviewed and evaluated on representative, consented examples.
- Maintain a versioned, human-reviewed evaluation set covering expected positive/negative/ambiguous answers and the language patterns of the intended audience (including Filipino-English code-switching if that audience is retained). Record per-construct/stage errors and the agreed release threshold; unsupported language should be flagged, not confidently mis-scored.
- Calculate final results only from the complete persisted answer set. In one transaction, store the final result snapshot and algorithm/model provenance; the completion view must use that server response, never stale UI state.
- For interim values, show answered/required counts and label scores provisional. Only show a construct score when the methodology's minimum answer coverage is met; don't fill missing answers with `50`.
- Avoid an arbitrary penalty-per-low-quality-answer confidence formula. If input quality is inadequate, ask for clarification or mark the item unusable; if confidence is not empirically calibrated, omit it or label the metric accurately as consistency.
- Store the scoring algorithm/version and derived results alongside the assessment so dashboard history remains explainable if scoring logic changes.

**Exit check:** deterministic fixtures verify all-low, all-high, mixed, unmatched, negated, low-quality, partial, missing, and complete assessment cases. Explicit zero scores stay zero; the final UI exactly matches the persisted final result; score provenance is recorded.

### Phase 6 — Implement participant and admin dashboards

- Build a **participant dashboard** showing only that user's assessment history, dates/status, questionnaire/scoring versions, results, and their own submitted answers. Provide a clear start-new/resume/review flow.
- Build an **admin dashboard** with:
  - Overview cards/charts for registered users, starts/completions, completion rate, stage distribution, TPB construct summaries, trends by time range, and operational health (model availability and request/error counts without response text). Define each metric's denominator, time zone, and included assessment statuses; distinguish unique users from repeated attempts. Use aggregates/de-identified data by default; suppress small cohorts that could reveal identities.
  - A user directory with basic account status and joined assessment history. Allow authorized admins to locate an account and see its assessments; keep email/identifiers out of aggregate views and show only fields needed for administration.
  - Server-side searchable, filterable, paginated assessment records (date, status, questionnaire version, stage, and score range), without exposing data to normal users.
  - Assessment detail with all submitted answers, per-answer score/status, final results, timestamps, consent and questionnaire/scoring versions. Clearly separate raw responses from automated inference and record each sensitive detail-view access.
  - User and account administration limited to necessary fields/actions (status, verified state, role provisioning through a protected workflow). Never expose passwords, tokens, or unrestricted impersonation.
  - Audit log for admin edits, publications, individual response views, account role/status changes, and exports. Log actor/action/target/time, not raw answer text.
  - Optional CSV export only if approved in Phase 0; server-authorize, scope, minimize identifiers, rate-limit, and audit every export.
- Implement privacy/retention/deletion controls and make consent status visible. User deletion should remove or irreversibly de-identify assessment records under the approved policy; define any retention exception before launch.
- Use server-side aggregates and bounded pagination. Raw-answer detail access is auditable. Never load all users' data into the browser and filter locally.

**Exit check:** cross-user reads are denied; ordinary users cannot access admin endpoints; admin can review paginated results and answer details; aggregate views meet the minimum cohort rule; question edits preserve historical versions; sensitive views/exports generate audit events.

For every dashboard chart, show its date range and denominator and define how incomplete, abandoned, deleted, and repeated assessments are counted. Do not compare questionnaire versions as if their scores were directly comparable when the wording or scoring rules changed.

### Minimum server API surface

Use the framework's route/server-action conventions, but keep these operations distinct and enforce the listed authorization on the server:

| Operation | Caller | Required behavior |
|---|---|---|
| Register/sign in/verify/reset password | Public/authenticated user | Delegate credential handling to the auth system; rate limit; never return secrets |
| Read own account and assessment list | Authenticated user | Derive owner from session; paginate; return only own records |
| Create assessment / resume active assessment | Verified user with consent | Snapshot active questionnaire/scorer versions and question order; do not accept caller-supplied owner or role |
| Submit the current in-progress answer | Assessment owner | Check ownership, expected question, session status, input limits, and idempotency/version token; persist before advancing. Treat retries idempotently; do not silently overwrite prior answers |
| Complete assessment | Assessment owner | Validate completion/skip policy; calculate and commit immutable results atomically |
| Read one assessment and answers | Owner or admin | Owner scope enforced; admin access role-checked and audited |
| Admin list users/assessments and metrics | Admin | Server-side filters, bounded pagination, aggregate small-cell suppression, no bulk raw answers |
| Create/edit/preview/publish questionnaire draft | Admin | Validate version, record diff/actor, publish atomically, immutable history |
| Export assessment data | Admin only, if approved | Explicit scope/confirmation, minimum data, bounded size, audit record, safe download handling |
| Delete/deactivate account or request deletion | Account owner; admin only through policy workflow | Apply documented retention rules and cascade/anonymize consistently; audit without retaining raw answers |

Never build generic endpoints that accept arbitrary table names, user IDs as trusted ownership, or broad query/filter expressions from the browser.

### Phase 7 — Add coaching strategy and assessment completion

- Implement a deterministic weakest-determinant selector and all 15 stage/BCT mappings from the table above.
- Create stage-specific, supportive response templates and determinant-specific guidance. Keep the language non-judgmental, culturally appropriate, and not prescriptive medical advice.
- On completion, summarize the user's attitude, social support, perceived control, and TTM stage; explain the main barrier/facilitator in plain language; show a concrete next step.
- Reproduce the current completion flow's single local dish recommendation using reviewed recipe data and the user's profile/constraints; state why it was chosen and handle no suitable result explicitly. Keep broader search and meal planning optional.
- Include the medical/nutrition disclaimer in a visible and accessible way. The current wording is available in `prototype/src/services/chatbotService.ts`.

**Exit check:** every stage and weakest factor produces the expected intervention; completion renders the saved result even when a model or dish recommendation is unavailable.

### Phase 8 — Implement post-assessment chat and inference fallback

- Define a stable inference interface that returns TPB scores, TTM stage, inference method, and model metadata; include probability/uncertainty only if calibrated and clearly distinguished from the score.
- Implement keyword inference as the guaranteed local fallback. Add browser Transformers.js models only if the new project intentionally requires them.
- For the classifier path, load models lazily, use a shared initialization promise, show explicit loading/error status, and retain a working fallback if download/inference fails. Validate classifier labels/output ranges and pin model IDs/revisions.
- Improve over the reference by using the stored assessment profile as explicit context. Keep any follow-up chat context ephemeral by default; do not persist or expose chat transcripts to admins unless separately approved and disclosed. Never mix message-level inference with final assessment results without labeling the distinction.
- Do not send free-text responses to a third-party inference service by default. If enabled, disclose provider/processing, minimize provider payload retention, and provide a non-external inference option.
- Render a clear, recoverable error message if both inference paths fail. Avoid silent success-shaped fallback results.

**Exit check:** mock model success, model loading failure, inference failure, and keyword fallback. Verify the UI identifies the method only when appropriate and never blocks the assessment when remote model assets are unavailable.

### Phase 9 — Decide and build recipe/meal-planning scope

For a faithful first release, recipe filtering and multi-day meal planning can remain out of scope because they are not currently wired into the main chat response. If requested for the remake:

- Port the recipe schema and curated Filipino recipe records into a separately typed data module.
- Add search, time/budget/difficulty/equipment constraints, dietary restrictions, and calorie matching as pure filter functions.
- Add an explicit recipe results experience before integrating recommendations into chat.
- Add meal planning only after recipe filtering works: distribute target calories as breakfast 25%, lunch 35%, dinner 35%, snack 5%; match within 10% when possible; avoid duplicates; clearly report when constraints prevent a complete plan.
- Make serving sizes, calorie data, and nutritional claims reviewable; label estimates and avoid presenting generated plans as medical advice.

**Exit check:** tests cover each filter, combined constraints, no-match fallback, calorie tolerance, duplicate prevention, and incomplete meal plans.

### Phase 10 — Polish accessibility, responsive design, help, and safety

- Rebuild the demo header, chat, user-profile sidebar, reset/help controls, typing state, and disclaimer.
- Apply the shared AliMind editorial visual system; use shadcn-style controls and React Bits backgrounds only where they reinforce clarity, with keyboard-accessible Radix interactions and reduced-motion behavior.
- Match the reference responsive behavior: chat/sidebar stack on smaller screens and sit side-by-side on desktop; keep controls tappable and text readable.
- Use semantic headings, labels, buttons, focus indicators, keyboard-operable controls, appropriate live announcements for new chat messages/progress, and accessible dialogs.
- Test short and long messages, loading states, model errors, empty states, narrow screens, and zoom.

**Exit check:** manual keyboard/screen-reader smoke test and viewport checks at approximately 375px, 768px, and 1440px with no clipped controls or horizontal scrolling.

### Phase 11 — Verify the whole journey and prepare handoff

- Add unit tests for domain/scoring/inference/filtering code and component tests for the assessment/chat flow.
- Run lint, type-check, tests, and production build in the new project.
- Perform an end-to-end browser pass: landing → register → verify/sign in → user dashboard → demo → affirmative start → all 20 questions → persisted profile/intervention → follow-up chat → reset → retry with a different profile → review own assessment history.
- Perform an admin pass: sign in as provisioned admin → dashboard aggregates → search/filter users and assessments → open a user's answer-level detail → edit question draft → validate/preview → publish a new version → verify old assessment still references its original version → inspect audit log → test export only if enabled.
- Test direct API calls for cross-user access, role escalation, unauthenticated access, malformed question edits, and export authorization.
- Verify model download failures and recipe-empty cases. Confirm no secrets are present in client bundles and clarify what data leaves the browser.
- Update the new project README with install/run/test commands, feature boundaries, auth/bootstrap instructions, required environment variables, migrations/backups, admin provisioning, privacy/retention behavior, model requirements, and known limitations.

**Release gate:** all above checks pass; role/ownership policies are verified at the server boundary; consent/retention behavior is documented; and intentional deviations from this plan are recorded in the new project's README.

## Proposed contracts

These are illustrative contracts; keep names consistent with the new project's conventions.

```ts
type QuestionType =
  | 'tpb-attitude'
  | 'tpb-subjective-norm'
  | 'tpb-perceived-control'
  | 'ttm';

type TTMStageName =
  | 'preContemplation'
  | 'contemplation'
  | 'preparation'
  | 'action'
  | 'maintenance';

interface TPBScores {
  attitude: number;          // 0–100
  subjectiveNorm: number;    // 0–100
  perceivedControl: number;  // 0–100
  // No confidence field unless it has a separately defined and validated meaning.
}

interface TTMStage {
  stage: TTMStageName;
  description: string;
}

interface Answer {
  questionId: string;
  responseText: string | null; // null only for explicit skip / prefer-not-to-answer
  score: number | null;        // null when skipped or not scoreable
  quality: 'scoreable' | 'needs_review' | 'skipped';
}

interface AssessmentResult {
  tpbScores: TPBScores | null; // null until the coverage rule is satisfied
  ttmStage: TTMStageName | null;
  questionnaireVersionId: string;
  scoringVersion: string;
  completedAt: string;
}
```

Keep the question-keyword mapping, inference adapter, recipe record, chatbot response, and assessment-state contracts typed and separately testable. Avoid coupling presentation components directly to model library output formats. Treat this as a contract sketch: select the minimum answer policy before making result fields required, and keep model confidence separate from construct scores.

### Additional authenticated records

Use framework/provider-specific schema names as appropriate, but preserve these relationships and access boundaries:

```text
User 1 ─── N AssessmentSession
QuestionnaireVersion 1 ─── N AssessmentSession
QuestionnaireVersion 1 ─── N QuestionVersion
AssessmentSession 1 ─── N AssessmentAnswer
Admin/User 1 ─── N AuditEvent
```

- Every assessment and answer has an opaque ID and an owning user relationship; never rely on sequential IDs as authorization.
- A user may access only their own profile and assessment records. An admin may access assessment response data only through protected admin operations. Admin access to an individual's raw answers should be auditable.
- Use a distinct published version identifier and stable question identifier; editing a published question creates a new draft/version rather than rewriting the historical prompt.
- Keep account roles separate from editable profile fields. Role changes are restricted to a trusted server-side admin provisioning process and audited.
- Keep raw answer text and derived scores separate so users/admins can tell the difference. Configure DB backups and deletion/retention behavior to account for both.

## Authentication and dashboard acceptance checklist

- [ ] Registration, email verification, login, logout, password reset, session expiry, and account deletion/deactivation work.
- [ ] The first admin is provisioned securely; public signup cannot create or promote an administrator.
- [ ] Server-side authorization checks protect every user and admin data API, not only page routes.
- [ ] A user can view, resume, and review their own assessment history and cannot retrieve another user's data.
- [ ] An admin can view aggregate dashboard metrics and paginated individual assessment records, including submitted questionnaire answers and derived scores.
- [ ] Admin question edits are validated, previewable, versioned, publishable, and audit logged.
- [ ] Historical assessments remain tied to the exact question/scoring version used at completion.
- [ ] Consent, access, retention, and deletion rules are visible and documented; exports and raw-answer access are restricted and audited.
- [ ] Ordinary follow-up chat transcripts are not included in admin views unless separately approved, disclosed, and implemented with explicit controls.
- [ ] Empty/loading/error states, keyboard access, and mobile layouts work for sign-in, user dashboard, and admin dashboard.

## Reference implementation map

| Area | Reference files | Rebuild responsibility |
|---|---|---|
| App shell/routes/theme | `prototype/src/App.tsx`, `prototype/src/index.tsx`, `prototype/src/index.css` | Routes, theme, global styles, model initialization policy |
| Authentication and persistence | New provider config, protected APIs/server actions, schema/migrations | Registration, sessions, role authorization, data ownership, audit trail |
| Landing page | `prototype/src/components/TopBar.tsx`, `Hero.tsx`, `Features.tsx`, `HowItWorks.tsx`, `ContactSection.tsx`, `Footer.tsx` | Marketing/intro content and navigation |
| Dashboards | New user/admin dashboard pages and protected data APIs | Own history, aggregate metrics, individual assessment review, question editor |
| Demo shell | `prototype/src/pages/DemoPage.tsx` | Help/reset/back/fullscreen framing, signed-in user context, and disclaimer |
| Conversational assessment | `prototype/src/components/ChatbotShowcase.tsx`, `prototype/src/services/questionnaireService.ts` | Welcome, consent, persisted question loop, progress, profile, reset |
| Coaching pipeline | `prototype/src/services/chatbotService.ts`, `tpbInference.ts`, `ttmInference.ts` | Inference, stage mapping, weakest factor, BCT, response templates |
| Browser models | `prototype/src/services/bertInferenceBrowser.ts`, `bertInferenceService.ts` | Optional model loading/prediction and fallback |
| Recipe utilities | `prototype/src/data/recipes.ts`, `prototype/src/utils/recipeFilters.ts` | Static dish data and pure filtering |
| Optional meal plan | `prototype/src/services/mealPlanService.ts`, `prototype/src/components/MealPlanView.tsx` | Multi-day meal plan generation and UI |
| Supporting docs/tests | `prototype/src/services/*test.ts`, `prototype/src/utils/*test.ts`, component tests, `prototype/REAL_TIME_SCORES_VERIFICATION.md`, `prototype/RESPONSIVE_DESIGN_VERIFICATION.md` | Acceptance criteria and regression coverage |

## Documentation conflicts and migration cautions

1. **Question count and interaction:** `QUESTIONNAIRE_SYSTEM_README.md`, `INTEGRATION_GUIDE.md`, `SYSTEM_FLOW.md`, and `QUICKSTART.md` describe a 15-question multiple-choice form. Current service and chat code implement a randomized 20-question free-text assessment (15 TPB + 5 TTM). The remake baseline in this plan is the latter.
2. **Unused questionnaire UI:** `QuestionnaireFlow.tsx` describes radio options and accesses `question.options`, while the active question model stores keyword mappings and is used by `ChatbotShowcase`. Treat it as legacy unless you deliberately build a separate multiple-choice assessment.
3. **Recipe recommendations:** chatbot documentation describes recipe recommendations in the response pipeline, but the active `processChatMessage()` currently returns an empty recipe list. Filtering/recommendation helpers are present but not connected to that path.
4. **AI claims:** older docs describe a Hugging Face generative-chat connector. The active message service instead uses browser text classifiers with keyword fallback. Do not expose a generative-AI setting unless it is implemented and secured.
5. **Questionnaire results vs chat:** post-assessment responses are not currently conditioned on questionnaire state/history in `processChatMessage()`. The questionnaire does drive the completion guidance/profile UI. Make any stronger personalization an explicit, tested enhancement.
6. **Tests may encode old assumptions:** review tests against the current service types and randomized order before porting them. Tests must assert current intended behavior, not a stale 15-question numeric-option API.
7. **Privacy and research validity:** accounts and stored assessment answers are new scope. Obtain informed consent, minimize data, document retention/deletion, restrict answer access, and review research/ethics requirements before collecting real participant data. Keyword/model outputs are estimates, not validated diagnoses.
8. **Authentication and administration are new scope:** the reference has no account system or admin backend. Do not simulate auth with localStorage, a hard-coded password, or a frontend-only `isAdmin` flag. Build real sessions, server-checked role controls, database ownership rules, and auditable access before exposing user results.

## Source documents consulted

- `prototype/SYSTEM_FLOW.md`
- `prototype/REAL_TIME_SCORES_VERIFICATION.md`
- `prototype/QUESTIONNAIRE_SYSTEM_README.md`
- `prototype/CONVERSATIONAL_QUESTIONNAIRE_README.md`
- `prototype/INTEGRATION_GUIDE.md`
- `prototype/QUICKSTART.md`
- `prototype/src/services/CHATBOT_SERVICE_README.md`
- `prototype/src/services/TPB_IMPLEMENTATION_SUMMARY.md`
- `prototype/src/services/MEAL_PLAN_SERVICE_README.md`
- `prototype/RECIPE_FILTERS_IMPLEMENTATION.md`
- `prototype/RESPONSIVE_DESIGN_VERIFICATION.md`
- `prototype/data/README.md`
- Active implementation files listed in the reference implementation map.
