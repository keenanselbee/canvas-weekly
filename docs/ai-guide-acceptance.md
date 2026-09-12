AI guide acceptance
===================

The full weekly-guide contract has deterministic validation and desktop tests.
The earlier real-model verification exercised the old suggestion format, not
the current four-course weekly guide. Do not treat it as a current quality pass.


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

On September 12, 2026, offline preparation and fixture integrity passed. The
development planner had no current remembered-login marker, so the live check
stopped before runtime startup or any AI request. Its older encrypted credentials
were left untouched. Full weekly-guide live model quality remains unverified.

Completion still needs a reviewed live result, manual online-chat review, and
representative real-course review after the user chooses the material to share.
Course variations and collection gaps must stay visible. No AI output test can
prove that past Canvas activity left all server-side progress unchanged.
