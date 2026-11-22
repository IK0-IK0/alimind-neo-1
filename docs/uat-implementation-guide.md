# AliMind UAT implementation guide

This guide explains how the checks in [uat-prompts.md](./uat-prompts.md)
exercise the current application, what a tester should observe, and where the
relevant implementation lives. Code links point to the current source lines;
line numbers can move as the app changes.

## Before testing

1. Choose an approved local or staging environment and use only the reusable
   test accounts described in the [local testing instructions](../README.md#run-locally).
   Do not copy credentials into UAT notes or screenshots.
2. Obtain an approved synthetic submission for reviewer testing. Do not start
   a participant assessment on shared or production data merely to populate
   the queue.
3. If running locally, the `/demo` page has a development-only **Run automated
   test** control. It previews a synthetic conversation without creating or
   modifying a saved assessment.
4. Do not use `/reviewer-sample` to accept the live reviewer queue. It is a
   separate, fabricated UI with browser-local drafts. The route and mode split
   are in [App.tsx](../src/App.tsx#L1591) and
   [ReviewerWorkspacePage.tsx](../src/features/reviewer/ReviewerWorkspacePage.tsx#L155).

## Reviewer journey

The route `/reviewer` is protected by sign-in and renders the live reviewer
queue. The live queue separately checks the server-side reviewer role. See
[App.tsx](../src/App.tsx#L1065),
[App.tsx](../src/App.tsx#L1590),
[ReviewerWorkspacePage.tsx](../src/features/reviewer/ReviewerWorkspacePage.tsx#L155),
and [server/index.ts](../server/index.ts#L98).

### R1. Sign in and open the reviewer workspace

- **What happens:** Authentication is performed by Supabase. The live
  workspace reads `profiles.account_role` through the authenticated Supabase
  client; RLS controls access to reviewer-scoped data.
- **Check:** The designated reviewer reaches **Submitted assessments**. If
  checking reviewer access fails or a non-reviewer reaches the queue, record
  the role, route, and visible error. Do not change the account role to make
  the test pass.
- **Code:** Login/register submission and navigation:
  [App.tsx](../src/App.tsx#L658). Route protection:
  [App.tsx](../src/App.tsx#L1065). Live access request and queue loading:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L131).
  Server authorization:
  [server/index.ts](../server/index.ts#L98) and
  [server/index.ts](../server/index.ts#L264).

### R2. Inspect a submission and its answers

- **What happens:** Supabase queries return completed assessment records,
  shortened IDs, timestamps, answer totals, review status/assignment, and
  provisional profile summaries. **View submission** fetches a detail record,
  which includes the saved chat messages and question/answer pairs. The
  details dialog groups those pairs and includes skipped/conditional entries.
- **Check:** Compare the ID and submitted time across queue and detail view.
  Expand the transcript and question groups; verify text belongs to the test
  submission and missing/skipped answers are not fabricated.
- **Code:** Queue rendering and empty/error/loading states:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L428).
  Opening details:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L286).
  Detail dialog:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L700).
  Server queue filtering and summaries:
  [server/index.ts](../server/index.ts#L275). Detail authorization/data:
  [server/index.ts](../server/index.ts#L334). Question mapping/grouping:
  [reviewer-assessment.ts](../src/features/reviewer/reviewer-assessment.ts#L66)
  and [reviewer-assessment.ts](../src/features/reviewer/reviewer-assessment.ts#L112).

### R3. Start or continue a review

- **What happens:** Starting an unassigned review calls the start endpoint.
  The server creates an in-progress review assigned to the signed-in reviewer
  and initializes drafts. A review assigned to someone else is disabled in
  the UI and rejected by the server if claimed. Continuing a review assigned
  to the current reviewer reloads its details and drafts.
- **Check:** Confirm the status/assignment changes to **In progress / Assigned
  to you** and survives a queue refresh. If assigned to another reviewer, do
  not take it over; verify that the action is unavailable.
- **Code:** Queue badges/actions:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L479).
  Start/continue flow:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L304).
  Claiming and conflict checks:
  [server/index.ts](../server/index.ts#L396).

### R4. Write, save, and reopen internal drafts

- **What happens:** The response and recommendation fields update local draft
  state. Edits are autosaved after a short pause and can also be saved with
  **Save now**; closing the review waits for a dirty draft save. The API only
  accepts draft writes for an in-progress review assigned to the current
  reviewer.
- **Check:** Use clearly synthetic text. Confirm the UI moves through pending
  and saved states, close/reopen the review, and verify both fields remain.
  An error or unsaved indicator is a failure, not a successful save.
- **Code:** State updates, explicit save, close behavior:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L328).
  Autosave request and timer:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L201)
  and [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L253).
  Internal-only label and fields:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L559).
  Server-side assignment/status/length validation and persistence:
  [server/index.ts](../server/index.ts#L484).

### R5. Search and add a recipe (if the recipe index is available)

- **What happens:** The picker searches by recipe/ingredient and can filter a
  collection or enter ingredients to exclude. A result can be expanded to
  inspect ingredients and directions. Selecting it copies formatted recipe
  text into the editable recommendation draft; the reviewer can still edit
  that draft.
- **Check:** Search a harmless test ingredient, inspect a result, add it, then
  confirm the chosen dish is included in the draft and preview. If the local
  recipe index is unavailable, record that as blocked rather than claiming the
  recipe flow passed. Exclusion filters are search filters, not an allergy or
  food-safety guarantee.
- **Code:** Search request and selection UI:
  [ReviewerRecipePicker.tsx](../src/features/reviewer/ReviewerRecipePicker.tsx#L36).
  Result details, add action, and warning:
  [ReviewerRecipePicker.tsx](../src/features/reviewer/ReviewerRecipePicker.tsx#L95).
  Recipe search endpoint:
  [server/index.ts](../server/index.ts#L611). Draft formatting:
  [reviewer-recipes.ts](../src/features/reviewer/reviewer-recipes.ts#L29).

### R6. Preview and re-preview edits

- **What happens:** Preview is available only when both response and
  recommendation have non-empty text. It shows the response, optional
  selected recipe, and recommendation. Any edit sets `previewed` back to
  false, so the current draft must be previewed again before completion.
- **Check:** Preview valid synthetic text, edit one field, and confirm the
  send action is disabled until previewing again. The preview itself is not
  delivery.
- **Code:** Edit invalidates prior preview:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L328).
  Preview validation/render and disabled send action:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L627)
  and [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L668).

### R7. Complete the review

- **What happens:** The client requires both fields and a current preview,
  saves pending edits, and calls the completion endpoint. The server independently
  requires both persisted fields, then marks the review completed and sets
  `delivered_at`. This is the action labeled **Send to participant**.
- **Check:** Verify blank fields cannot be previewed/sent. With approved test
  text, send once and confirm the review becomes completed. Do not repeatedly
  submit to try to generate additional records.
- **Code:** Client completion:
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L372)
  and action controls at
  [LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L668).
  Server required-field guard and completion/delivery timestamp:
  [server/index.ts](../server/index.ts#L555).

### R8. Verify participant delivery and privacy

- **What happens:** The participant assessment-list query joins delivered
  reviews to their response/recommendation/recipe drafts. The dashboard shows
  those participant-facing fields and a **View session results** dialog with
  answers/transcript. Drafts are internal while a review is in progress; the
  reviewer detail endpoint only exposes them to the assigned reviewer or after
  completion.
- **Check:** Sign in separately using the paired participant test account.
  Confirm the response/recommendation appears only after reviewer completion
  and only in that participant's history. Confirm another test participant
  cannot see it, and that no separate reviewer-only notes are exposed.
- **Code:** Participant-owned assessment list and delivery data:
  [assessment-data.ts](../src/features/assessment/assessment-data.ts) and
  [App.tsx](../src/App.tsx). Participant dashboard and result
  dialog: [App.tsx](../src/App.tsx#L824). Reviewer draft visibility rule:
  [server/index.ts](../server/index.ts#L334).

## Participant journey

### P1. Review the purpose, privacy notice, and disclaimer

- **What happens:** The home page describes a private food-habit reflection,
  says the reviewer flow is in development, and shows an educational/non-medical
  disclaimer. The participant page repeats that answers are saved to Supabase.
- **Check:** Verify the language is understandable and does not promise
  clinical outcomes. Record the review-rollout wording as a mismatch if the
  test environment actually exposes live human review; see
  [Known source discrepancies](#known-source-discrepancies).
- **Code:** Home introduction/process copy:
  [App.tsx](../src/App.tsx#L360). Rollout statement:
  [App.tsx](../src/App.tsx#L414). Consent notice:
  [App.tsx](../src/App.tsx#L569). Assessment disclaimer:
  [App.tsx](../src/App.tsx#L1534).

### P2. Sign in and verify participant role/access

- **What happens:** `/account` reads the signed-in user's role from Supabase.
  `/demo` is gated by sign-in. Participant assessment rows are scoped by RLS;
  reviewer access is further scoped by reviewer policies.
- **Check:** Confirm the paired account shows **Participant**. If doing an
  access-control check, try only the approved participant account and confirm
  reviewer API access is denied. Do not enumerate or attempt to read another
  user's records.
- **Code:** Account UI and role read:
  [AccountAccessPage.tsx](../src/features/accounts/AccountAccessPage.tsx#L8)
  and [account-data.ts](../src/features/accounts/account-data.ts).
  Protected routes:
  [App.tsx](../src/App.tsx#L1044) and route table:
  [App.tsx](../src/App.tsx#L1585).

### P3. Start only after consent

- **What happens:** A checkbox inside the consent notice enables **I'm ready**.
  The client requires consent and a valid question order before inserting the
  session through Supabase. RLS scopes the inserted row to the signed-in user.
- **Check:** Before accepting, verify the assessment has not started and the
  answer controls are unavailable. Accept and verify the first prompt appears
  only after the start request succeeds. If the request fails, report the
  visible error.
- **Code:** Consent UI and session creation:
  [App.tsx](../src/App.tsx) and
  [assessment-data.ts](../src/features/assessment/assessment-data.ts).

### P4. Enter responses using the available input types

- **What happens:** TPB reflection questions use text input; TTM questions use
  Yes/No buttons; additional questions may use numeric, single-choice, or
  multi-select controls. Multi-select keeps multiple options and makes
  **None** exclusive.   Answers are saved directly to Supabase before the next prompt is queued.
  Client validation checks the supported answer shape; RLS enforces row
  ownership.
- **Check:** Exercise only the input types actually presented. Toggle a
  multi-select choice on and off, choose **None** and another option, and
  ensure the selection behaves exclusively. Verify invalid input or a network
  error is visible and the answer is not silently lost. Use fictional answers.
- **Code:** Live question composition and branch filtering:
  [App.tsx](../src/App.tsx#L608). Question definitions:
  [pilot-survey-questions.ts](../src/data/pilot-survey-questions.ts#L111).
  Form controls and selected state:
  [App.tsx](../src/App.tsx#L1462). Client submission/save and persistence:
  [App.tsx](../src/App.tsx#L1306) and
  [assessment-data.ts](../src/features/assessment/assessment-data.ts).

### P5. Check progress, persistence, and errors

- **What happens:** The chat displays answered count against the currently
  displayed question list, and a progress bar; loading/saving states disable
  relevant controls. Answers and history are stored/read directly through
  Supabase, with RLS enforcing ownership.
- **Check:** Compare the progress count to the questions applicable to the
  selected branch; do not assume there are exactly 20 questions. If progress
  goes backward, advances without saving, or shows a contradictory total,
  record the values and exact branch answers.
- **Code:** Chat count/progress:
  [App.tsx](../src/App.tsx#L1454). Loading/saving/error behavior:
  [App.tsx](../src/App.tsx#L1306). Applicable branch logic:
  [App.tsx](../src/App.tsx#L614) and
  [assessment-progress.ts](../src/features/assessment/assessment-progress.ts).

### P6. Pause and resume an in-progress reflection

- **What happens:** On entering `/demo`, the client loads the current
  in-progress session from Supabase. If found, it restores the saved question
  order, answers, and transcript; the dashboard offers **Resume reflection**.
  RLS scopes the query to the signed-in user. Starting over is a
  separate action that abandons an unfinished session after confirmation.
- **Check:** Leave an unfinished test session, return to the dashboard, and
  resume. Verify prior answers and transcript return and there is no duplicate
  active session. Do not click **Start over** unless the account is disposable
  and the action was approved; it marks the current unfinished session
  abandoned.
- **Code:** Client restoration:
  [App.tsx](../src/App.tsx#L1120). Dashboard resume link:
  [App.tsx](../src/App.tsx#L897). Active-session read and abandon persistence:
  [assessment-data.ts](../src/features/assessment/assessment-data.ts).

### P7. Complete the participant assessment

- **What happens:** After each answer, the client chooses the next applicable
  question. Once none remain, it queues a final bot completion message. The
  server checks all required/non-conditional questions are answered and marks
  the assessment completed when it saves that bot message. The completion card
  tells the participant no recommendation is shown before review.
- **Check:** Complete an approved test session and confirm the completion
  message/card appears, the dashboard status becomes completed, and no
  reviewer response appears before one exists.
- **Code:** Next-question decision and final message:
  [App.tsx](../src/App.tsx#L1306). Completion card:
  [App.tsx](../src/App.tsx#L581). Client bot message persistence:
  [App.tsx](../src/App.tsx#L1189). Server completion validation/status:
  [server/index.ts](../server/index.ts#L1262). Dashboard history status:
  [server/index.ts](../server/index.ts#L918).

### P8. Read delivered review results

- **What happens:** Once a review is completed and delivered, the participant
  dashboard shows the review response, optional chosen dish, and
  recommendation. **View session results** loads the assessment and displays
  those delivered fields plus the participant's answer list and transcript.
- **Check:** Use the paired approved test accounts. Confirm the delivered text
  matches the reviewed preview, is associated with the right test session, and
  is not available before delivery or to a different participant.
- **Code:** Review delivery assembly:
  [server/index.ts](../server/index.ts#L918). Dashboard delivery display:
  [App.tsx](../src/App.tsx#L942). Result dialog and answers:
  [App.tsx](../src/App.tsx#L974). Reviewer completion:
  [server/index.ts](../server/index.ts#L555).

### P9. Check help, keyboard operation, and narrow layouts

- **What happens:** The help dialog explains open text, fixed choices, skipping,
  storage, and privacy. The controls use labels, button states, regions, status
  and alert announcements. Styles include small-screen layouts and reduced
  motion rules.
- **Check:** Navigate with Tab/Shift+Tab and keyboard activation; verify focus
  is visible, labels make sense, dialogs can be dismissed, and errors/status
  are announced. At a narrow viewport, verify the chat, answer choices, help,
  and buttons do not overlap or require horizontal scrolling. These are
  browser-observed acceptance checks; source presence alone does not prove
  usability.
- **Code:** Help dialog:
  [App.tsx](../src/App.tsx#L1537). Chat semantics and input controls:
  [App.tsx](../src/App.tsx#L1452). Mobile chat layout:
  [styles.css](../src/styles.css#L273). Dashboard mobile layout:
  [styles.css](../src/styles.css#L534). Reduced motion:
  [styles.css](../src/styles.css#L279).

## Known source discrepancies to treat as UAT findings

These are inconsistencies in the current checkout, not assumptions that a
tester should silently resolve:

1. The home page says human review is in development and the demo is not
   reviewed by a person ([App.tsx](../src/App.tsx#L414)), while `/reviewer`
   renders the live queue and its server supports completion/delivery
   ([ReviewerWorkspacePage.tsx](../src/features/reviewer/ReviewerWorkspacePage.tsx#L155),
   [server/index.ts](../server/index.ts#L555)). The deployed environment may
   still have review disabled or lack data/migrations; confirm its actual
   behavior and report confusing or inaccurate copy.
2. The account-role page says the reviewer workspace is sample-only
   ([AccountAccessPage.tsx](../src/features/accounts/AccountAccessPage.tsx#L70)),
   but the live `/reviewer` route is wired to `LiveReviewerAssessmentsPage`
   ([ReviewerWorkspacePage.tsx](../src/features/reviewer/ReviewerWorkspacePage.tsx#L155)).
3. The reviewer details dialog says pilot TTM/additional answers are not part
   of live response data ([LiveReviewerAssessmentsPage.tsx](../src/features/reviewer/LiveReviewerAssessmentsPage.tsx#L731)).
   However, the server constructs question-answer records from the saved
   question order ([server/index.ts](../server/index.ts#L334)), and the mapping
   helper recognizes pilot questions ([reviewer-assessment.ts](../src/features/reviewer/reviewer-assessment.ts#L66)).
   Check whether the UI actually renders the expected groups; report any
   discrepancy between the banner and visible answers.
4. The dashboard's active-assessment stat and history text use a hard-coded
   `/20` and `of 20 responses` ([App.tsx](../src/App.tsx#L933) and
   [App.tsx](../src/App.tsx#L945)), while live assessments use a larger,
   branch-dependent question pool ([pilot-survey-questions.ts](../src/data/pilot-survey-questions.ts#L111),
   [server/index.ts](../server/index.ts#L194)). Compare dashboard and chat
   counts and report mismatches; do not use 20 as the acceptance baseline.

## UAT result format

For each numbered test step, record:

| Field | What to write |
| --- | --- |
| Result | Pass, Fail, Blocked, or N/A |
| Test context | Environment, role, and approved synthetic case/session ID |
| Steps | Actions taken, including relevant branch choices |
| Expected | User-visible behavior expected from the step |
| Actual | What happened, including any exact status/count/message |
| Evidence | Sanitized screenshot or browser evidence; no credentials or real participant data |
| Finding | Short title, severity, and whether it is one of the source discrepancies above |
