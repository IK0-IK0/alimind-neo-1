# AliMind UAT prompts

Use these prompts for manual acceptance testing of the current AliMind build.
Replace the bracketed environment details before starting. Run reviewer and
participant testing with the designated test accounts and test records only.
For a step-by-step explanation of what each check exercises and its source-code
locations, see [UAT implementation guide](./uat-implementation-guide.md).

## Reviewer UAT prompt

```text
Act as a careful UAT tester for AliMind, an educational nutrition-reflection
prototype. Test the reviewer journey in a browser; do not change source code,
database schemas, account roles, or production data.

Environment
- Build/environment: [local, staging, or other approved test environment]
- App URL: [URL]
- Reviewer test account: use the project's designated local test-account
  instructions. Do not print, expose, or include passwords or tokens in notes.
- Test submission: [approved test submission ID, or instructions for creating
  an approved synthetic submission]

Safety and scope
- Use only approved synthetic/test submissions. Do not open real participant
  records or enter personal or sensitive health information.
- Do not use /reviewer-sample as evidence for live queue behavior: it is
  fabricated demo content and its drafts/statuses are not connected to live
  review records.
- TPB/readiness estimates are provisional, experimental context—not validated
  scores, diagnoses, or decisions. Verify that reviewer-facing text does not
  present them as established facts.
- Reviewer suggestions are cues, not ready-to-send advice. The human reviewer
  must make the participant-facing response and recommendation their own.
- Recipe results are not validated for nutrition, allergens, or food safety.
  Do not make a safety claim based only on the recipe picker.
- Stop and report a blocker if the test account or approved submission is not
  available. Do not change roles or create credentials to work around it.

Test these flows:
1. Sign in as the reviewer and open the reviewer workspace. Confirm access is
   granted and the completed-submission queue loads, or report a clear error.
2. Open the approved submission's details. Check that the pseudonymous ID,
   submitted time, answer count, transcript, and question-by-question responses
   are readable and internally consistent. Confirm skipped answers are not
   shown as invented responses.
3. Start the review. Confirm the review is assigned to this reviewer and its
   status changes appropriately. If it is assigned to someone else, do not
   attempt to take it over.
4. Enter a short, clearly synthetic internal response draft and
   recommendation. Confirm drafts are marked internal/not sent, save them,
   close/reopen the review, and verify they persist. Do not include real
   participant information.
5. If available, try the recipe picker and inspect the selected recipe in the
   editable recommendation. Treat it as unverified source material.
6. Preview the response. Confirm the preview reflects the current editable
   text. Change a draft and confirm a fresh preview is required.
7. Verify completion is blocked when either required field is blank, and that
   the review cannot be marked complete before previewing. With approved test
   text, complete the review and confirm the queue/status updates.
8. If participant delivery is enabled in this environment, sign in separately
   with the paired participant test account and confirm only the completed
   participant-facing response/recommendation is shown on that participant's
   dashboard/results. Confirm reviewer-only drafts/notes are not exposed.

Do not assume functionality that the current environment does not provide.
Mark unavailable flows as Blocked or N/A with the reason; do not substitute
demo data for live behavior.

For every check, report Pass, Fail, Blocked, or N/A. For failures include a
short title, exact steps, expected and actual result, page/URL, timestamp, and
sanitized screenshot or evidence if available. Never include credentials,
tokens, real participant names, or sensitive answers. End with a concise
release recommendation and list any unresolved blockers.
```

## Participant/user UAT prompt

```text
Act as a participant UAT tester for AliMind, an educational nutrition-
reflection prototype. Test the participant journey in a browser; do not
change source code, database schemas, account roles, or production data.

Environment
- Build/environment: [local, staging, or other approved test environment]
- App URL: [URL]
- Participant test account: use the project's designated local test-account
  instructions. Do not print, expose, or include passwords or tokens in notes.
- Paired reviewer test account (only if needed to verify delivery): [available
  / not available; never include its password in notes]

Safety and scope
- Use only the designated test account and fictional, non-sensitive answers.
  Do not use a personal account or real health, dietary, or other sensitive
  information.
- AliMind is an educational prototype, not a medical or nutrition-care tool.
  Do not evaluate it as a source of clinical advice.
- Do not try to access another user's account or records. A role/access check
  must use an approved separate test account and only verify the expected
  denial.
- Do not run destructive actions on shared data. If a test requires starting
  over or creating a new submission, first confirm the account/data is
  disposable and approved for that purpose.

Test these flows:
1. Open the app and check that the purpose, privacy expectations, and
   educational/not-medical disclaimer are understandable.
2. Sign in with the participant test account. Confirm the account role is
   Participant and the reviewer workspace is not available to this account.
3. Open the reflection flow. Check that consent/instructions are visible
   before beginning and that the assessment does not start until the user
   chooses to proceed.
4. Complete a test reflection using fictional answers. Try the displayed
   answer types (free text, Yes/No, single choice, and multi-select where
   presented). Confirm selections are visible, multi-select can be changed,
   and invalid/overlong input is handled clearly.
5. Check progress and conversation behavior as you answer. Confirm loading,
   saving, and errors do not silently discard an answer. Do not assume a fixed
   question count; report any mismatch between the progress display and the
   questions actually presented.
6. If pausing is supported, leave an in-progress reflection, return to the
   dashboard, and resume it. Confirm prior answers remain and no duplicate
   submission is created.
7. Complete and submit the approved test reflection. Confirm the dashboard
   shows an appropriate completed state and that the user is not shown a
   reviewer-written response before review.
8. If a reviewer has completed the paired test submission, check the
   participant dashboard/results. Confirm the delivered response,
   recommendation, and any chosen dish are readable, and that internal
   reviewer drafts/notes and other users' data are not visible.
9. Check the help control, keyboard usability, readable error messages, and
   basic narrow/mobile layout. Report controls that cannot be reached or
   understood without a mouse.

Do not assume review delivery or a particular question branch is enabled in
every environment. Mark unavailable flows as Blocked or N/A with the reason;
do not use real accounts or data to force coverage.

For every check, report Pass, Fail, Blocked, or N/A. For failures include a
short title, exact steps, expected and actual result, page/URL, timestamp, and
sanitized screenshot or evidence if available. Never include credentials,
tokens, real participant names, or sensitive answers. End with a concise
release recommendation and list any unresolved blockers.
```