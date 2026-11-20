# AliMind Research Methodology Notes

> **Purpose:** working source document for drafting a future research paper. It
> records the implemented prototype, its data flow, algorithms, and current
> limitations. It is not an approved study protocol, evidence of clinical
> validity, or a report of results. Replace the study-planning items below only
> after the research team has made and documented those decisions.

**Implementation snapshot:** 19 November 2026  
**Project:** AliMind browser-based nutrition coaching prototype

## 1. Study and product boundary

AliMind is an educational software prototype for reflecting on healthy-eating
attitudes, social support, perceived control, and intention. It combines an
account-based conversational assessment, experimental BERT/Ridge scoring for
TPB answers, phrase-based intention scoring, supportive coaching copy, an
optional recipe search, and a reviewer workspace for completed submissions.

The application is not a medical device, diagnostic tool, validated
psychometric instrument, or autonomous clinical decision system. Its live
TPB scorer is an experimental model trained on a 30-respondent questionnaire
dataset; its evaluation did not meet the stated performance targets. Intention
still uses hand-authored English phrase matching. No independent validation or
effectiveness trial is documented in this repository. Do not write about
recruitment, ethics approval, study outcomes, or efficacy as established facts.

The product brief mentions adults aged 18–40 in Davao City as an earlier
intended audience. That population has not been confirmed for a future study.

## 2. Important distinction: three separate assessment paths

The repository contains different instruments and code paths that must not be
described as one validated end-to-end algorithm:

1. **Live participant chat (`/demo`):** 62 randomized open-text questions:
   57 TPB items across attitude, subjective norm/social support, and perceived
   behavioral control, plus five intention items. The server uses an
   experimental frozen-BERT/Ridge predictor for non-skipped TPB answers and
   keeps intention on the phrase-matching path. TPB ratings are transformed
   from 1–7 to the profile's 0–100 display scale; intention bands still feed
   the provisional readiness estimate. The BERT predictor is trained on only
   30 survey respondents and has not met the stated validation targets.
2. **TPB/TTM Pipeline Lab (`/pipeline-lab`, development only):** a separate
   38-item free-text TPB form and a conditional four-question Yes/No TTM
   screen. The Part A TPB text is not scored. A synthetic-only BERT experiment
   proposes a score for one fixed item (Q1); a human must explicitly decide
   whether it can be used in the lab. Human-authored result text remains local
   to the page and is not published to participants or saved.
3. **TPB calculation and reviewer sample:** the 38-item Set A/Set B reviewer
   examples display fabricated 1–7 ratings to demonstrate belief-product and
   direct-measure arithmetic. They are illustrative data, not participant
   responses or ratings inferred from free text. `calculateTpb` is not wired
   into the live chat or the synthetic Q1 BERT experiment. A separate
   respondent-trained single-answer scoring head is used experimentally by
   the live chat for TPB items only.

The development Pipeline Lab currently presents five human-review steps. A
seven-step pipeline in older product planning notes is a conceptual target,
not the active participant workflow.

The Pipeline Lab's optional free-text context box is held only in page memory;
it is not analyzed, sent to the model, or saved. Its optional recipe search is
also separate from the human-review sequence and does not populate a
recommendation. Separately, the reviewer workspace provides a RecipeNLG
picker under the recommendation draft; selecting a recipe copies its details
into the editable draft for human review, without sending it to a participant.

## 3. Application context and participant procedure

### 3.1 Technology and routes

- React and Vite provide the browser interface; an Express API handles
  authenticated data operations and recipe requests.
- Supabase Auth manages email/password accounts. The API validates the
  bearer-token session with Supabase; it does not use a service-role key.
- `/demo` is the live assessment chat; `/reviewer` is the live reviewer
  workspace. `/reviewer-sample` and `/pipeline-lab` are development-only
  routes for fabricated examples and local experiments.
- Vite proxies `/api` requests to the local Express server during development.

### 3.2 Live participant flow

1. A participant signs in and sees storage-consent information before
   creating a session. The API requires consent and the current consent
   version (`demo-supabase-v1`) before session creation.
2. The browser randomizes the 62-item question order using Fisher–Yates
   shuffling. The API checks that the submitted order is a complete,
   duplicate-free permutation of the canonical question bank, then stores
   that order with the assessment.
3. One free-text question is presented at a time. An answer is saved before
   the chat advances. The API verifies question order, session ownership,
   session status, and input bounds. Non-skipped TPB answers are scored by the
   frozen-BERT/Ridge worker; intention answers retain phrase scoring. Explicit
   `skip`, `pass`, and `prefer not to answer` responses are stored as
   unanswered.
4. On completion, a rule-based bot message is saved and the UI presents the
   profile summary and supportive next step. This completion message is
   written by application code; it is not generated by a language model.
5. After completion, follow-up messages can be saved, but they do not
   recalculate the assessment score. The interface says follow-up text is not
   rescored. Recipe recommendations are not self-service in the participant
   chat; they belong in the reviewer-authored recommendation workflow.
6. On sign-in or refresh, the most recent in-progress assessment is resumed;
   if there is none, the most recent completed conversation is loaded.
   Starting over marks an unfinished assessment abandoned rather than
   deleting it.

### 3.3 Live 62-item question bank

Question prompts and phrase groups are defined in
[`src/data/questionnaire.ts`](../src/data/questionnaire.ts).

| Construct | Items | What the prompts cover |
|---|---:|---|
| Attitude | 24 | Behavioral beliefs (10), outcome evaluations (9), and direct attitude items (5) |
| Subjective norm | 12 | Normative beliefs (5), motivation to comply (4), and direct norm items (3) |
| Perceived behavioral control | 21 | Control beliefs (10), perceived power (6), and direct PBC items (5) |
| Intention | 5 | Commitment, willingness, effort, likelihood, and planning |

The 57 TPB prompts are scored by the respondent-trained BERT/Ridge model;
the five intention prompts retain hand-authored keyword/phrase groups. The
training data contain 30 respondents and questionnaire explanations rather
than open-ended chat histories. On five-fold respondent-held-out evaluation,
the separate item-rating model scored MAE 0.865 and Pearson *r* 0.518 on its
1–7 target; it did not meet the stated MAE < 0.5 and *r* > 0.70 targets.
The model has not been validated for production or clinical use.

## 4. Live response scoring and profile derivation

The implementation is in
[`src/features/assessment/scoring.ts`](../src/features/assessment/scoring.ts).
It contains shared profile derivation and intention phrase scoring; the server
uses the local model worker for TPB answers.

### 4.1 TPB answer inference and intention phrase match

For each non-skipped TPB answer:

1. The API starts a local Python worker that loads the frozen
   `bert-base-uncased` encoder and the Ridge head once per server process.
2. It encodes the question prompt and response together, mean-pools token
   embeddings with the attention mask, and predicts a continuous rating
   clipped to `1–7`.
3. The answer stores the experimental rating separately. For the existing
   profile display, ratings are linearly mapped to `0–100` using
   `(rating - 1) / 6 * 100`.

The five intention answers continue to use hand-authored phrase matching in
the `0`, `25`, `50`, `75`, and `100` bands. Unmatched intention answers and
skips remain unscored. The model emits no calibrated confidence.

The BERT/Ridge ratings are experimental estimates. The pilot dataset is small,
responses are questionnaire explanations rather than free conversation, and
the application prompts are not identical to the training survey statements.
The model may misread paraphrases, mixed beliefs, negation, or language
variation; its output is not calibrated confidence or a validated measure.

### 4.2 Construct summaries and readiness stage

- For attitude, subjective norm, and perceived control, include non-skipped
  model ratings after mapping them to `0–100`. A construct is displayed only
  when at least three items are scoreable.
- Each displayed construct is the arithmetic mean of its scoreable mapped
  ratings, rounded to the nearest integer.
- Each scoreable intention phrase band is mapped to an ordinal value using
  `round(band / 25)`, yielding `0–4`. At least three of the five intention
  answers must be scoreable. The mean is rounded to an integer and mapped in
  order to Pre-contemplation, Contemplation, Preparation, Action, and
  Maintenance.
- The “weakest” construct is the minimum available score among attitude,
  subjective norm, and perceived control. Ties are resolved by the fixed
  order attitude, subjective norm, then perceived control.
- The `answered` count is the number of submitted answer records; it can
  include skipped or unmatched responses. A displayed profile therefore
  also depends on scoreable-item coverage, not only the completion count.

The live stage estimate is derived from five phrase-matched intention
questions. It is **not** the conditional decision tree implemented for Part B
of the Pipeline Lab, and it is not a clinically validated TTM classification.

### 4.3 Coaching output

[`src/features/coaching/coaching.ts`](../src/features/coaching/coaching.ts)
maps each available stage and weakest construct to supportive copy, a
stage/factor-specific behavior-change-technique cue, and one next step.
The map is fixed in source code; the application does not estimate an
individual's response to a technique. If there is not enough scoreable
information, the UI shows a general non-judgmental completion message instead
of forcing a full profile. These are educational coaching suggestions, not
individualized clinical recommendations.

## 5. Separate TPB calculation instrument and TTM screening

### 5.1 Thirty-eight-item TPB form

[`src/features/assessment/tpb-free-text-questionnaire.ts`](../src/features/assessment/tpb-free-text-questionnaire.ts)
defines 38 open-ended prompts divided into ten sections:

| Section | Items | Measurement concept |
|---|---:|---|
| Behavioral beliefs/attitude | 1–5 | Beliefs about health, benefits, enjoyment, and satisfaction |
| Behavioral-belief outcomes | 6–9 | Expected health/energy and time/cost outcomes |
| Outcome evaluation | 10–13 | Valuation of health, energy, preparation time, and food spending |
| Subjective norm | 14–17 | Perceived approval, expectations, and descriptive norms |
| Normative beliefs | 18–20 | Perceived views of family, friends, and health professionals |
| Motivation to comply | 21–23 | Motivation to act in line with those referents |
| Direct perceived control | 24–27 | Difficulty, capability, control, and personal agency |
| Control beliefs | 28–31 | Cooking facilities, money, time, and skills as enablers |
| Perceived power | 32–35 | How easy those enablers make the behavior |
| Intention | 36–38 | Commitment, willingness, and likelihood |

Scale anchors are retained as metadata, but the Pipeline Lab hides rating
scales and asks for free-text explanations. These responses have no production
numeric scores. The current lab does not apply the expectancy-value formulas
to these free-text answers.

### 5.2 Numeric TPB arithmetic utility

[`src/features/assessment/tpb-calculation.ts`](../src/features/assessment/tpb-calculation.ts)
accepts explicitly supplied integer ratings on a 1–7 scale and computes:

- attitude belief-based composites from belief × outcome-evaluation pairs;
- subjective-norm composites from normative-belief × motivation-to-comply
  pairs;
- perceived-control composites from control-belief × perceived-power pairs;
- separate direct-measure means and an intention mean.

It returns item counts, sums, means, and theoretical item min/max. It also
provides a reverse-rating helper. It does not choose questionnaire items,
infer ratings from text, define reverse-coded items for a study instrument,
or combine TPB constructs into a single grand score. The item direction,
scoring rule, and measurement model must be settled for the actual instrument
before interpreting values. The utility is not connected to the active chat
or the live reviewer scoring.

### 5.3 Conditional TTM screen in the Pipeline Lab

[`src/features/pipeline/ttm.ts`](../src/features/pipeline/ttm.ts) contains a
branching Yes/No tree:

1. Ask whether the person currently follows the described healthy-eating
   pattern.
2. If yes, ask whether they have followed it for **more than one month**:
   yes → Maintenance; no → Action.
3. If no, ask whether they intend to start within **one month**: no →
   Pre-contemplation.
4. If yes, ask whether they intend to start within **one week**: yes →
   Preparation; no → Contemplation.

The tree reports incomplete status when a required branch answer is missing
and includes the decision path/reason in the lab. The one-month and one-week
thresholds are literal supplied prototype rules. They differ from commonly
used TTM time windows and require literature review and validation before
being presented as canonical or clinically meaningful.

## 6. Synthetic Q1 model experiment

The local-only Pipeline Lab experiment is described in
[`server/tpb/bert_q1_experiment.py`](../server/tpb/bert_q1_experiment.py),
[`server/tpb-q1-experiment.ts`](../server/tpb-q1-experiment.ts), and
[`src/features/assessment/tpb-q1-synthetic-references.ts`](../src/features/assessment/tpb-q1-synthetic-references.ts).

- It tests one fixed TPB item (Q1), not the 38-item lab form or the live
  62-item assessment.
- Seven score groups (1–7) each contain ten generated English examples:
  70 synthetic examples in total.
- Within each score group, the first six examples form training data, the
  next two form a calibration set, and the final two form a held-out test
  set. This yields 42 training, 14 calibration, and 14 test examples.
- `bert-base-uncased` is loaded as a pretrained fill-mask encoder. Its
  weights remain frozen. The text is tokenized with a 128-token maximum;
  token embeddings are attention-mask mean-pooled.
- A Ridge head with alpha 1 is fit on centered training embeddings. Mean
  residual bias and residual standard deviation from the separate
  calibration subset parameterize a Gaussian score distribution on the
  bounded 1–7 range.
- The lab reports held-out MAE, within-one accuracy, multiclass Brier score,
  and expected calibration error, plus a query distribution. The test
  examples are not used to fit the Ridge head or the residual spread.
- A human must confirm the proposed score, override it with a reason, or
  mark it unscorable with a reason. Publishing the local preview also
  requires human-written response and recommendation fields.

The data are synthetic, English-only, generated by score group, and extremely
small. Their split does not establish generalization to real respondents;
the probability distribution is not validated confidence. The endpoint
requires authentication, is disabled in production, and does not persist the
submitted response. The encoder runs locally through Python; model weights
may be downloaded from Hugging Face on first use. Neither this model nor the
synthetic metrics are used by live participant scoring.

## 7. Recipe search and integration

The Spoonacular recipe finder remains a standalone development tool in the
Pipeline Lab, not a participant chat control or a reviewer-issued
recommendation.
[`src/features/recipes/RecipeFinder.tsx`](../src/features/recipes/RecipeFinder.tsx)
sends selected criteria to `POST /api/recipes/generate` and does not write
recipe content into the assessment score or reviewer recommendation.

The server validates query, diet, pantry/avoid ingredients, intolerance
categories, cooking-time limit, servings, PHP budget, and effort selection.
It then requests up to eight recipe candidates from Spoonacular with recipe
information, instructions, and ingredients. Results are filtered for
instructions, preparation time, serving count, effort, and optional cost,
then ranked primarily by pantry matches and missing ingredients (with a
time penalty). The client randomly selects one qualifying result to display.
An empty result is reported as no match; the application does not invent a
recipe.

The effort band is a heuristic: ready time at most 35 minutes with at most six
instruction steps is "easy"; at least 75 minutes or 12 steps is "advanced";
other recipes with known time and steps are "moderate." Missing time or steps
is "unknown" and does not pass a specific effort filter.
Costs are Spoonacular estimates in USD converted to PHP using the Frankfurter
USD/PHP quote, cached for 12 hours in process, with a configured fallback
rate/date if the quote is unavailable. These are not observed Philippine
market prices. Search-provider diet and allergen filters are not a safety
guarantee; users are instructed to inspect source ingredients. Search
results are provider-sourced and are not a curated Filipino recipe corpus;
the Filipino-food framing comes from UI/coaching, not a verified local
nutrition database.

The reviewer workspace has a separate RecipeNLG picker below the
recommendation text field. It searches a server-side local SQLite full-text
index built from `dataset/RecipeNLG_dataset.csv`, lets the reviewer search
recipe names or ingredients, filter by source collection and exclude listed
ingredients, and shows up to 20 matches in a five-card scroll area. Selecting
a recipe copies its title, ingredients, directions, and source into the
editable reviewer draft. This is a human-selected recommendation aid, not
participant-chat search, automated advice, or a nutrition-analysis feature.
RecipeNLG is restricted to non-commercial research and education; the corpus
has no validated nutrition or allergen-safety data, so reviewers must inspect
each candidate.

## 8. Live reviewer procedure

The live reviewer page is separate from the fabricated `/reviewer-sample`
route:

1. `/reviewer` checks the signed-in account's `profiles.account_role`.
2. The queue includes only `assessment_sessions.status = completed`.
   Queue rows use shortened assessment UUIDs and omit participant name,
   email, transcript, and raw answers. They show assignment/status badges and
   provisional stage/weakest-construct summaries.
3. Opening details retrieves the saved conversation and maps stored answers
   back to prompts using the question order saved at session creation.
4. Starting a review creates one review record, assigned to the current
   reviewer. Only the assigned reviewer can edit an in-progress review.
5. Response/recommendation drafts are autosaved into the separate
   `assessment_review_drafts` table. They are internal notes and are not sent
   to participants. Completion requires both fields and changes reviewer
   status; it does not change the participant assessment's completed status.
6. Completed reviews are read-only in the UI.

The stage/factor draft suggestions are deterministic starting copy derived
from the live provisional profile. Reviewers must check and edit them against
the conversation. The sample route uses fabricated cases, separate UI logic,
and browser-local drafts; it is not connected to real submissions.

## 9. Data handling and access controls

- Supabase Auth is the identity store; `public.profiles` holds display name
  and account role, not passwords.
- `assessment_sessions` stores user ID, status, randomized question order,
  structured answers/scores, chat messages, consent version/time, and
  timestamps. The database enforces JSON array and size constraints plus one
  active assessment per user.
- Participant RLS restricts session rows to their owner. Reviewer RLS adds
  read access only for completed sessions and reviewer accounts.
- Review assignment/status are stored separately from internal draft text.
  Draft RLS limits in-progress draft access to the assigned reviewer.
  Completed review drafts are readable by reviewer accounts under the
  current policies.
- API handlers also check identity, reviewer role, session ownership,
  completion status, request origin for writes, UUID/input limits, and
  expected question sequence. Database RLS remains an independent control.
- No service-role key is used by the app. No participant delivery of
  reviewer drafts is implemented.
- Session completion/abandonment does not imply deletion. A formal retention
  period, participant deletion workflow, access audit trail, data export
  process, and research-grade backup/restore procedure are not defined here.

Consent in the prototype is an implementation gate, not evidence of research
ethics approval or a substitute for an institution-approved consent form.
Do not use real research/health data until privacy, security, ethics, access,
retention, and incident-response arrangements are approved.

## 10. Verification performed on the software

The repository has unit tests for scoring, TPB arithmetic, TTM branches,
recipe validation/mapping, reviewer mapping/guidance, and pipeline behavior.
An integration smoke test of the live reviewer path used only the reusable
test account and temporary synthetic assessment content. It exercised
reviewer access, completed-only queue inclusion, transcript and questionnaire
responses, reviewer assignment, draft persistence, review
completion, and deletion of the synthetic submission. The test account's
pre-existing in-progress submission was left untouched.

Software tests establish only the behaviors they exercise. They do not
demonstrate construct validity, inter-rater reliability, predictive
performance, intervention effectiveness, usability with a target population,
or food/allergen safety.

## 11. Items to specify before writing a study protocol

Do not fill these with assumptions from the product brief. Agree them with
the research team, ethics board, and relevant domain experts:

- Study aim, hypotheses, design (e.g., feasibility/usability, cross-sectional
  validation, or intervention evaluation), setting, and unit of analysis.
- Target population, geographic scope, age range, language(s), inclusion and
  exclusion criteria, recruitment channels, consent process, sample-size
  rationale, and handling of withdrawal.
- Whether the study uses the 62-item live chat, the 38-item Part A plus TTM
  Part B instrument, or a newly reconciled instrument. Define versions,
  translations, source citations/permissions, respondent-visible anchors,
  skip logic, and missing-data handling.
- Operational definition of healthy eating and the evidence/rationale for
  each TTM screening threshold. The current live intention-based readiness
  estimate and Pipeline Lab decision tree are different operationalizations.
- TPB item-to-construct mapping, item polarity, reverse scoring, belief ×
  evaluation pairing, normative-belief × motivation pairing, control-belief ×
  power pairing, minimum coverage, construct-level aggregation, and
  comparator/gold-standard measures. Decide whether direct and belief-based
  measures are reported separately; do not create an unsupported total TPB
  score.
- Human coding rubric for free text, reviewer training, blinding, number of
  raters, adjudication, inter-rater agreement statistic, treatment of
  unscorable text, and how reviewer decisions will be recorded.
- If an NLP model is studied: prespecified baseline(s), participant-level
  data splits to prevent leakage, sample-size justification, held-out or
  external validation, language/dialect coverage, calibration protocol,
  performance metrics with uncertainty intervals, subgroup/fairness plan,
  model/version pinning, and human-oversight rules. Synthetic examples are
  not a substitute for annotated human responses.
- Primary and secondary outcomes, time points, analysis plan, missingness and
  multiplicity handling, usability instruments, and success criteria.
- Nutrition expert review, recipe provenance/licensing, local availability
  checks, nutrition/allergen verification, and safety escalation.
- Data minimization, retention/deletion schedule, reviewer authorization,
  audit controls, secure backups, breach response, and approved storage/
  processing location.

## 12. Source map

| Topic | Main implementation/source |
|---|---|
| Live question bank | [`src/data/questionnaire.ts`](../src/data/questionnaire.ts) |
| Live scoring and profile | [`src/features/assessment/scoring.ts`](../src/features/assessment/scoring.ts) |
| 38-item TPB form | [`src/features/assessment/tpb-free-text-questionnaire.ts`](../src/features/assessment/tpb-free-text-questionnaire.ts) |
| Numeric TPB arithmetic | [`src/features/assessment/tpb-calculation.ts`](../src/features/assessment/tpb-calculation.ts) |
| Conditional TTM logic | [`src/features/pipeline/ttm.ts`](../src/features/pipeline/ttm.ts) |
| Live chat and coaching | [`src/App.tsx`](../src/App.tsx), [`src/features/coaching/coaching.ts`](../src/features/coaching/coaching.ts) |
| Pipeline Lab and human review | [`src/features/pipeline/PipelineLabPage.tsx`](../src/features/pipeline/PipelineLabPage.tsx), [`src/features/pipeline/human-review.ts`](../src/features/pipeline/human-review.ts) |
| Synthetic Q1 experiment | [`server/tpb/bert_q1_experiment.py`](../server/tpb/bert_q1_experiment.py), [`src/features/assessment/tpb-q1-synthetic-references.ts`](../src/features/assessment/tpb-q1-synthetic-references.ts) |
| Recipe search | [`src/features/recipes/RecipeFinder.tsx`](../src/features/recipes/RecipeFinder.tsx), [`server/recipes.ts`](../server/recipes.ts), [`server/exchange-rate.ts`](../server/exchange-rate.ts) |
| Reviewer guidance and live workflow | [`src/features/reviewer/reviewer-guidance.ts`](../src/features/reviewer/reviewer-guidance.ts), [`src/features/reviewer/LiveReviewerAssessmentsPage.tsx`](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx), [`server/index.ts`](../server/index.ts) |
| Database access policies | [`supabase/migrations/202611050001_assessment_sessions.sql`](../supabase/migrations/202611050001_assessment_sessions.sql), [`supabase/migrations/20261115050657_reviewer_assessment_reviews.sql`](../supabase/migrations/20261115050657_reviewer_assessment_reviews.sql) |
| Operational setup and test instructions | [`README.md`](../README.md), [`AGENTS.md`](../AGENTS.md) |

For background on TPB measurement, the repository README links to Ajzen's TPB
measurement guidance and the 1991 theory paper. Confirm sources, adaptations,
permissions, and the final instrument with the research team before citing
this implementation in a manuscript.
