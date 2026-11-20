# Methods and Materials — Iteration 2 Draft

> **Draft status:** This second iteration restructures the project methodology
> to follow the organization of the supplied accepted paper. It is a working
> manuscript draft, not an approved protocol or report of study findings.
> Implementation facts and future study proposals are labeled separately.
> Nothing in this document establishes ethics approval, independent
> validation, or effectiveness testing.

**Project:** AliMind conversational nutrition-support prototype  
**Document version:** Iteration 2  
**Implementation snapshot:** 19 November 2026  
**Related implementation inventory:** [Research Methodology Notes](./research-methodology.md)

## Status key

- **Implemented:** present in the current repository or verified runtime.
- **Proposed:** described as a future phase in the reference paper; not
  completed or necessarily approved.
- **Decision required:** unresolved and must be confirmed before a study.

## Research Design

The reference paper frames AliMind as an iterative system-development project
using Design, Development, Testing, and Review cycles. This draft retains that
structure but separates prototype verification from empirical research:

1. **Iteration 1 — prototype and pipeline wiring (implemented):** application
   flow, an experimental respondent-trained TPB answer scorer, phrase-based
   intention estimates, a separate local TTM screening lab, recipe search,
   and human reviewer workflow.
2. **Iteration 2 — real-data integration and model validation (partially
   conducted):** a 30-respondent survey dataset was used to train an
   experimental per-answer model. The user stated that AI/ML training is
   permitted; formal ethics approval and permission scope for live inference
   have not been independently reviewed. External validation and
   construct-score validation remain future work.
3. **Iteration 3 — refinement and evaluation (proposed):** use approved pilot
   evidence and expert/user feedback to refine the prototype and evaluate
   usability, safety, and the intervention workflow.

The software currently supports a prototype/feasibility stage only. The live
assessment's experimental TPB ratings, phrase-based intention score, synthetic
Q1 experiment, and TTM lab must not be treated as validated instruments or as
evidence that the planned performance targets have been met.

### Objectives for the proposed study

The reference paper proposes examining:

- whether TPB constructs and TTM stage cues can be inferred from natural
  language relative to structured assessments;
- whether models can estimate TPB construct scores and classify TTM stages;
- whether a theory-informed intervention selector and recipe workflow produce
  appropriate results; and
- whether an integrated, personalized approach performs acceptably on
  behavioral, usability, engagement, and technical measures compared with
  generic nutrition-chat support.

These are proposed objectives. Confirm their scope, primary endpoints, and
study design before treating them as the final research questions.

## Overview of Iterations

| Iteration | Reference-paper purpose | Current evidence/status |
|---|---|---|
| 1: Proxy data and pipeline prototyping | Build the flow and exercise the pipeline before real-user data | **Partially represented by the current prototype.** The repo includes deterministic and synthetic components. It does not contain the paper's proposed MHC-Coach/openCHA adapted corpus, nor evidence that a complete seven-step AI pipeline was tested. |
| 2: Real data integration and model fine-tuning | Pair target-population responses with TPB ratings and TTM labels, then train/validate inference methods | **Partially conducted.** A 30-respondent questionnaire dataset and experimental item-rating model are present. The held-out item-rating metrics did not meet the stated targets; formal ethics approval, external validation, and construct-score validation are not established here. |
| 3: Refinement and enhancement | Refine the integrated system using pilot results and prepare later deployment | **Proposed, not conducted.** No participant pilot or deployment-readiness study is documented. |

The current repository's local Pipeline Lab has a five-step human-review
workflow; the reference paper's seven-step computational pipeline is a
conceptual target. See the implementation-status mapping below.

## Theoretical Framework

### Theory of Planned Behavior

The study framework treats intention as related to three distinct TPB
determinants:

- **Attitude:** evaluation of the target behavior.
- **Subjective norm:** perceived social expectations or support.
- **Perceived behavioral control (PBC):** perceived ease, difficulty, and
  control over performing the behavior.

Intention is measured separately and should not be collapsed into an
unsupported overall TPB score. Belief-based composites and direct measures
are also distinct. Their item mapping, direction, aggregation, and
interpretation must be prespecified for the final instrument.

**Current implementation:** the live chat has 62 free-text prompts: 57 TPB
items and five intention items. A frozen-BERT/Ridge model predicts a 1–7 rating
for each non-skipped TPB answer; intention remains phrase-scored. The TPB
ratings are linearly mapped to the profile's 0–100 display scale. This
respondent-trained model used 30 survey respondents; item-level held-out MAE
was 0.865 and Pearson *r* was 0.518, so it did not meet the stated targets.
It is a pilot feature, not a validated construct score or an inference model
tested on free-form conversation histories. The separate 38-item free-text
form in the Pipeline Lab remains unscored. The numeric TPB utility calculates
belief-product and direct-measure arithmetic only when ratings are explicitly
provided; neither arithmetic nor the separately trained composite predictor
is wired into the live chat.

### Transtheoretical Model

The conceptual stage labels are Pre-contemplation, Contemplation, Preparation,
Action, and Maintenance. The reference paper distinguishes stage-matched
intervention needs. It also proposes deriving stage labels using structured
staging questions and comparing natural-language classifications with those
labels.

**Current implementation:** the live chat estimates a coarse stage from
keyword-matched answers to five intention questions. The Pipeline Lab instead
has a conditional Yes/No decision tree with one-month and one-week cutoffs.
Neither current method is validated. The paper's theory description and its
proposed stage-screening cutoffs should be reconciled with the final chosen
instrument before data collection.

## Data Collection and Preparation

### Target population

**Proposed in the reference paper:** Filipino adults aged 18–40 in Davao City,
with English, Tagalog, and Cebuano named as intended interaction languages.

**Decision required:** confirm the target population, location, language
coverage, eligibility rules, recruitment approach, and sample-size rationale.
The source-product brief and paper are not, on their own, an approved
recruitment protocol. The respondent-trained TPB model uses English survey
explanations, while intention phrase matching is English-centric; neither
establishes support for Tagalog or Cebuano.

### Target behavior

The reference paper describes a daily healthy/nutritious-eating behavior over
an upcoming month. Before study use, operationalize this behavior in
respondent-understandable terms, specify what counts as a qualifying meal or
pattern, and define the dietary guidance source. The current prototype's
phrase dictionaries and recipe search do not operationalize or measure
dietary adherence.

### Phase 1: elicitation study (proposed)

The reference paper proposes open-ended elicitation of behavioral, normative,
and control beliefs, followed by content analysis to identify salient beliefs
and organize them into TPB-aligned themes (for example, time, cost, family
influence, and taste).

It mentions a belief-frequency threshold of approximately 10–15% when
selecting commonly shared beliefs for later questionnaire development. This
threshold, the coding unit, coding framework, number/training of coders,
adjudication process, sample size, and language-specific procedures remain to
be confirmed. This phase has not been performed by the current prototype.

### Phase 2: structured questionnaire and paired explanations (proposed)

The reference paper proposes a structured TPB questionnaire with direct
measures and belief-based measures derived from Phase 1. Its example uses
seven-point ratings and asks for an open-text explanation immediately after
the rating. The rating/text pairs would provide criterion labels and natural
language examples for model development.

The repository's separate 38-item form contains open-ended prompts and stores
low/high scale-anchor descriptions as metadata, but the Pipeline Lab hides
the anchors and does not collect paired seven-point ratings. It is therefore
not yet the paired quantitative/qualitative training instrument proposed in
the paper. Item wording, source/adaptation permissions, reverse coding,
construct mapping, belief pairings, translations, missing-data rules, and
expert review need to be finalized before data collection.

### TTM stage labels

The reference paper proposes structured staging questions together with
open-ended exploration and uses structured labels as the comparison standard
for stage inference. The current lab's branching rule is:

| Screening answers | Current lab output |
|---|---|
| Not following the pattern and no intention to start within one month | Pre-contemplation |
| Not following; intends within one month but not within one week | Contemplation |
| Not following; intends within one week | Preparation |
| Following for one month or less | Action |
| Following for more than one month | Maintenance |

The thresholds are current prototype rules, not validated clinical cutoffs.
The final study protocol must specify one operationalization, substantiate
the time windows, and use the same labeling definition for reference data,
model training, and evaluation.

### Data sources and separation

- **Current live app:** stores account-owned question order, response text,
  experimental TPB model ratings, phrase-derived intention score bands,
  conversation messages, consent version/time, status, and timestamps in
  Supabase.
- **Respondent TPB data:** a workbook with 30 nonblank submissions is present
  under `dataset/respondent survey`. A pseudonymized annotation copy was used
  for pilot model training. The user stated that AI/ML training is permitted;
  formal ethics approval and whether the permission covers live inference have
  not been independently reviewed.
- **Current local model experiment:** uses 70 synthetic English Q1 examples
  (ten examples per score from 1–7); it uses no real respondent data.
- **Reference paper's proposed proxy data:** MHC-Coach and openCHA dialogue
  material are mentioned as possible curated sources for early prototyping.
  Those datasets are not included or used by the current implementation.
- **Recipe data:** the paper proposes Recipe1M-based retrieval. The current
  app instead queries Spoonacular at runtime; it does not contain a curated
  Recipe1M corpus.

Any future data reuse must be authorized and documented, including dataset
license, provenance, language, preprocessing, exclusion rules, label source,
and whether multiple examples from one person can cross train/test splits.

## System Development Methodology

### Seven-step computational pipeline in the reference paper

The following table maps the paper's intended seven-step architecture to the
current code. The sequence is a research target, not a claim that the
production chat currently runs seven independent AI services.

| Step | Intended method | Current implementation/status |
|---|---|---|
| 1. Conversational context collection | Gather TPB/TTM context and relevant user preferences and constraints | The live chat collects 62 ordered free-text answers (57 TPB items and five intention items). Recipe search is not exposed in the participant chat; the optional Pipeline Lab context box is not analyzed, sent, or saved. |
| 2. TPB construct inference | Estimate attitude, subjective norm, and PBC from conversation text | Live app uses an experimental frozen-BERT/Ridge head to estimate a 1–7 rating for each non-skipped TPB answer; intention remains phrase-scored. The 1–7 ratings are linearly transformed to the profile's 0–100 display scale. The model was trained on 30 survey respondents, has not met validation targets, and uses questionnaire responses rather than free-form conversation history. The 38-item Part A lab text is not scored. A separate synthetic BERT test proposes a score for one Q1 response. |
| 3. TTM stage estimation | Estimate one of five stages and track evidence/uncertainty | Live chat maps five phrase-scored intention answers to an ordinal stage. The lab has a deterministic conditional screening tree. No trained TTM model is implemented. |
| 4. Intervention mode selection | Select a stage-appropriate intervention mode | No separate mode-selection service is implemented. The live coaching copy selects a stage-specific message and behavior-change-technique cue. |
| 5. TPB-targeted intervention | Choose a target based on the weakest determinant and map to a technique | Live profile chooses the lowest sufficiently covered attitude/social-norm/PBC score with fixed tie order, then displays stage/factor-based coaching text. This is a fixed prototype mapping, not a validated intervention selector. |
| 6. Feasible dish/plan generation | Retrieve and rank recipes using constraints and the selected intervention | Optional search queries Spoonacular and applies user-specified filters. It is not a curated Recipe1M semantic-search system and is not automatically bound to the BCT or review recommendation. |
| 7. Response generation | Combine history, stage, target construct, technique, and recipe in a personalized response | Assessment completion response and coaching content are scripted. No LLM-generated participant response is used. Post-completion follow-up messages are stored but do not rescore the profile. |

The reference paper also proposes longitudinal tracking and exponential
moving-average smoothing across sessions. The current code does not implement
EMA, longitudinal change analysis, reminders, or multi-session intervention
adaptation. A future study should prespecify session timing, formula,
initialization, missing-session behavior, and whether smoothed values affect
intervention selection.

### Iteration 1: prototype design, development, testing, and review

**Design and development — implemented:** the browser uses React/Vite; the
Express API validates authenticated operations; Supabase Auth and Postgres
store accounts and assessments. The participant question order is randomized
and stored per session. The API checks ownership, status, expected answer
order, and input bounds. RLS independently scopes participant rows to their
owner and allows reviewers to read completed submissions.

For each non-skipped TPB answer, the live scorer sends the prompt and response
to a local worker using frozen BERT mean-pooled embeddings and a respondent-
trained Ridge head; its 1–7 rating is mapped to 0–100 for the profile.
Intention answers use whole-phrase matching in five bands (0, 25, 50, 75,
100), ignoring certain immediately negated phrases. At least three scoreable
answers are required for each construct and at least three of five intention
answers for the readiness estimate. Construct means and the weakest factor
are computed deterministically. These methods are implemented for the
prototype only.

**Separate lab components — implemented:** the Pipeline Lab contains the
38-item free-text TPB form, conditional TTM tree, explicit Q1 human-review
controls, and a synthetic-only Python experiment using frozen
`bert-base-uncased` embeddings with a Ridge head and residual-based score
distribution. The experiment has 42 training, 14 calibration, and 14 held-out
synthetic examples. Its metrics and probabilities are not valid estimates for
real participants. The endpoint is authenticated, disabled in production,
and does not persist the submitted answer.

**Recipe tools — implemented for separate purposes:** the Pipeline Lab's
Spoonacular search validates criteria server-side, filters and ranks returned
recipes, and displays a qualifying candidate. It is not exposed in the
participant chat. The reviewer workspace separately searches a local
RecipeNLG full-text index beneath the recommendation draft; a reviewer chooses
a recipe and its details are copied into the editable draft. The local CSV and
index are not sent to the browser as a bulk download. RecipeNLG is restricted
to non-commercial research and education and has no validated nutrition or
allergen-safety data; reviewers must inspect each recipe. Spoonacular cost
estimates are converted from USD to PHP using a cached exchange-rate quote
with a configured fallback. Cost is not a local market quote; effort is
heuristic; diet/allergen filters are not a safety guarantee.

**Reviewer workflow — implemented:** authorized reviewers see only completed
submissions in the queue, can open saved transcript/answers, claim a review,
autosave internal response/recommendation drafts, and mark the review
complete. Review status and drafts are separate from participant completion;
reviewer text is not sent to participants.

**Testing and review — software verification only:** the repository includes
unit tests for scoring, the TPB arithmetic utility, TTM branches, recipes,
reviewer mapping/guidance, and pipeline behavior. A live reviewer smoke test
used the reusable test account and synthetic content, then removed the test
submission. These checks verify software behavior, not participant
acceptability, measurement validity, model generalization, nutrition safety,
or behavior-change effectiveness.

### Iteration 2: real data integration and model fine-tuning (partially conducted)

**Design.** Obtain ethics and data-governance approvals before recruiting.
Finalize the target behavior, target population, multilingual instruments,
TPB item mapping, TTM stage labels, and paired-rating/open-text data
collection. Define participant-level data partitions before model selection
to prevent data leakage across repeated answers or sessions.

**Development.** The reference paper lists DeBERTa-v3-base, DeBERTa-v3-large,
and RoBERTa-base as TPB model candidates, and DistilBERT or BERT-small for TTM
classification. These are candidate methods in the paper, not models trained
or selected in the current repository. Compare them only after a sufficiently
annotated dataset is approved and available; include a transparent
rule-based baseline and record model, tokenizer, preprocessing, and training
configuration.

**Testing.** The reference paper proposes an initial pilot of 10–15
participants, with 2–3 sessions per participant, to inspect conversation
flow, construct coverage, response relevance, and naturalness. This is a
draft proposal, not an approved sample-size calculation or completed pilot.
Confirm whether this pilot is appropriate and whether its data may be used
for model development or must remain separate from evaluation.

**Review.** Compare performance with prespecified targets; inspect errors,
coverage, calibration, language/subgroup behavior, and theoretical alignment.
Do not tune decision thresholds on the final test set. Any corrections,
unscorable items, or reviewer adjudication should be recorded with a
prespecified rubric and audit trail.

### Iteration 3: refinement and enhancement (proposed)

Use authorized pilot feedback and independent expert review to refine
conversation flow, accessibility, response safety, recipe constraints, and
model fallback behavior. The reference paper proposes follow-up sessions,
including an approximately two-week targeted check-in and an approximately
one-month comprehensive reassessment. Confirm these time points and measures
before use. The current app has no scheduled check-ins, EMA tracking, or
comparison-group assignment.

## Evaluation Metrics

The reference paper includes the following candidate metrics and target
thresholds. **All are proposed targets, not observed results.** Confirm their
definitions, denominators, confidence intervals, and feasibility against the
final instrument and study design.

| Evaluation area | Proposed measure in the reference paper | Status/interpretation |
|---|---|---|
| TPB score prediction | MAE < 0.5 on a 1–7 scale; Pearson correlation `r > 0.70`; paper also discusses RMSE and R² | Proposed; no real labeled evaluation set exists in the repo |
| TTM classification | Weighted F1 > 0.80, with precision/recall also reported | Proposed; no trained classifier or study gold labels |
| Construct coverage | Percentage of intended TPB constructs with sufficient evidence | Proposed; define construct-level coverage and minimum evidence before measuring |
| Intervention selection | Decision accuracy ≥80% against expert/appropriate reference decisions | Proposed; reference labels and adjudication method remain to be defined |
| Recipe constraints | At least 90% of reviewed recommendations satisfy all stated constraints | Proposed; verify constraints with experts and distinguish user filters from actual safety |
| Nutrition expert rating | RND ratings of nutritional appropriateness, feasibility, relevance; mean ≥4.0/5 | Proposed; define expert number, rubric, blinding, and agreement |
| Conversational naturalness | Linguistic experts rate 50 sampled transcripts across fluency/coherence, appropriateness, engagement, and empathy | Proposed; sample source and rating protocol need approval |
| Nutrition safety | At least 85% of 100 reviewed responses receive a safety rating ≥3 on a 1–5 scale | Proposed; establish rubric and escalation rules before exposure to users |
| Usability and acceptance | SUS >68 and above-average helpfulness/therapeutic-alliance ratings | Proposed; specify validated instruments, timing, and interpretation |
| Behavioral outcomes | Pre/post TPB changes and TTM stage progression; compare with generic nutrition-chat support | Proposed; requires a prespecified design and analysis plan; not causal evidence by itself |

For model validation, report the number of participants and responses at each
stage, score/stage distributions, missing or unscorable rates, participant-
level train/validation/test allocation, and uncertainty intervals. For
classification, specify class weighting and report per-stage confusion
matrices in addition to aggregate weighted F1. For regression, report
construct-specific results, not only pooled metrics. Consider an external or
temporal validation cohort if the study design and sample support it.

The current synthetic Q1 experiment reports MAE, within-one accuracy, Brier
score, and expected calibration error on a 14-example synthetic holdout. These
are software-experiment outputs only; they do not satisfy the study
evaluation metrics above.

## Ethical Considerations and Data Governance

The reference paper states that the research proposal is to be submitted to
the University of the Immaculate Conception Research Ethics Committee
(UIC-REC), with the protocol code to be added after issuance. **Confirm the
current approval status and authorized institution wording.** Do not imply
approval or recruit participants until the required review and approvals are
in place.

The prototype requires an account and storage-consent acceptance before
creating an assessment, but this is not research consent. Research use
requires an approved consent form, explicit data-use and withdrawal terms,
data minimization, retention/deletion schedule, reviewer access policy,
secure export/backup, incident response, and documentation of any external
services. Do not submit identifiable or sensitive research responses to the
current prototype without those approvals and controls.

Supabase stores participant assessment text and messages under owner-scoped
row-level security. Reviewer access is role-protected and limited to
completed assessments; in-progress review drafts are restricted to the
assigned reviewer. The live reviewer system has no participant delivery,
full access audit trail, or research retention workflow. The optional recipe
search sends its criteria to Spoonacular; confirm the provider's data terms
and minimize what is sent before any research deployment. Recipe cost,
dietary filtering, and allergen filtering must not be represented as
clinically verified nutrition or food-safety advice.

## Decisions Required Before Protocol Approval

1. Confirm target population, target behavior, setting, languages, and
   recruitment/sampling plan.
2. Reconcile the live 62-item assessment with the separate 38-item TPB form
   and structured TTM screening. Specify which is the study instrument.
3. Resolve TTM timing inconsistencies and cite the selected staging
   operationalization.
4. Finalize questionnaire item-source permissions, translations, scale
   anchors, scoring direction, TPB belief pairings, missingness, and
   adjudication procedures.
5. Establish the data collection, annotation, participant-level split,
   sample-size, model comparison, calibration, and external validation
   protocols.
6. Confirm intervention/BCT references and expert label procedures.
7. Verify recipe corpus/provider provenance, cultural validity, nutrition
   information, local prices/availability, allergy handling, and safety
   escalation.
8. Confirm ethics approval, consent, retention, deletion, auditing, and
   data-sharing/security arrangements.
9. Prespecify primary/secondary outcomes, statistical analyses, thresholds,
   missing-data handling, and whether/how a generic-chat comparison will be
   conducted.

## Source Map

| Method component | Current source |
|---|---|
| Live chat and participant procedure | [`src/App.tsx`](../src/App.tsx), [`server/index.ts`](../server/index.ts) |
| Live 62-item questions and scoring | [`src/data/questionnaire.ts`](../src/data/questionnaire.ts), [`src/features/assessment/scoring.ts`](../src/features/assessment/scoring.ts), [`server/tpb-answer-scorer.ts`](../server/tpb-answer-scorer.ts), [`server/tpb/bert_answer_score_worker.py`](../server/tpb/bert_answer_score_worker.py) |
| 38-item free-text TPB form and numeric arithmetic | [`src/features/assessment/tpb-free-text-questionnaire.ts`](../src/features/assessment/tpb-free-text-questionnaire.ts), [`src/features/assessment/tpb-calculation.ts`](../src/features/assessment/tpb-calculation.ts) |
| TTM decision tree and coaching | [`src/features/pipeline/ttm.ts`](../src/features/pipeline/ttm.ts), [`src/features/coaching/coaching.ts`](../src/features/coaching/coaching.ts) |
| Local synthetic Q1 experiment | [`server/tpb/bert_q1_experiment.py`](../server/tpb/bert_q1_experiment.py), [`src/features/assessment/tpb-q1-synthetic-references.ts`](../src/features/assessment/tpb-q1-synthetic-references.ts) |
| Recipe search | [`src/features/recipes/RecipeFinder.tsx`](../src/features/recipes/RecipeFinder.tsx), [`server/recipes.ts`](../server/recipes.ts), [`server/exchange-rate.ts`](../server/exchange-rate.ts) |
| Reviewer process and RLS | [`src/features/reviewer/LiveReviewerAssessmentsPage.tsx`](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx), [`src/features/reviewer/reviewer-guidance.ts`](../src/features/reviewer/reviewer-guidance.ts), [`supabase/migrations/20261115050657_reviewer_assessment_reviews.sql`](../supabase/migrations/20261115050657_reviewer_assessment_reviews.sql) |
| Earlier methodology inventory | [`docs/research-methodology.md`](./research-methodology.md) |
