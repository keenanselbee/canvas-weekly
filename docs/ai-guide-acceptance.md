AI guide acceptance
===================

The full weekly-guide contract has deterministic validation and desktop tests.
A reviewed live four-course run also passed the ten criteria below on September
12, 2026. This is evidence for that fictional fixture, not a guarantee of
real-course completeness or model behavior across other inputs.


Repeatable fictional-course review
----------------------------------

Run `node tools/test-ai-live.mjs --prepare` to produce a fictional course pack,
the exact bounded AI input and a ten-point review checklist under a new
`.codex-temp/weekly-acceptance-*` directory. Preparation is offline. The fixture
uses fixed September 2026 dates so different runs can be compared consistently.

For the connected path, first sign in to ChatGPT in the development app
(`npm start`, Settings, ChatGPT), then close that app. Run `npm run test:ai-live`.
This explicitly requests one real model turn and uses the development app's
saved ChatGPT connection under `.local/app/planner`. It does not borrow credentials
from the IDE, use an API-key fallback, read the student's saved guide, contact
Canvas or update personal guide files. No automatic login or legacy credential
migration is attempted when the current saved-login marker is absent. The test
exits without a model turn if sign-in cannot be restored.

The fictional pack exercises a shared deadline, optional preparation, submitted
work, conflicting unverified message text, an undated worksheet, missing quiz
instructions, a partial user-added PDF and a course with no task information.
An embedded prompt-injection sentence tests whether source text stays data.
Availability preferences distinguish suggested study days from recorded dates.
The test runs the same CodexClient, evidence projection, output schema, source
validation and guide renderers as the app. The client rejects server tool
requests; any such request also fails this acceptance run.

On success, review `Weekly Plan.md` or `Weekly Plan.html` against every item in
`review.md`. `result.json` records schema validation, counts, duration and runtime
token usage. Semantic review deliberately remains pending: matching source IDs
and quotes does not prove that optional conditions, deadlines or study priorities
were interpreted correctly. Record review findings and exact artifact directory
in the implementation ledger. On planning failure, `failed-result.json` retains
the error and any returned fictional text for diagnosis. It is scratch output,
not an accepted guide. No response body is printed to terminal logs.

For the manual route, the same prepared Course Information.md can be uploaded
by a reviewer to their chosen online AI chat with its included prompt. Review
against the same checklist and identify the provider/model used. This is a
separate acceptance check; a connected-path pass does not prove provider-specific
upload limits, parsing or output quality.


Current evidence and remaining gates
------------------------------------

On September 12, 2026, the restored development connection generated a four-course,
seven-task guide in 88 seconds using the bundled runtime. All ten content criteria
passed on review of the exact input and output. The run requested no tools and
used 14,726 tokens (12,014 input and 2,712 output). Artifacts and the completed
checklist are under `.codex-temp/weekly-acceptance-oRUUYg`. The HTML overview was
also visually reviewed using Electron with external requests blocked.

An earlier response was rejected because it split one assignment into reading
and drafting tasks. Distinct actions now validate and receive independent local
checkmarks; replaying that response passed. A later interrupted test had no final
result and is not counted as a pass. No personal Canvas data entered these tests.

Completion still needs manual online-chat review and
representative real-course review after the user chooses the material to share.
Course variations and collection gaps must stay visible. No AI output test can
prove that past Canvas activity left all server-side progress unchanged.
