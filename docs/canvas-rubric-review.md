Canvas rubric criterion text
===========================

Decision, 2026-09-11: admit the fixed CanvasWeeklyCourseRubrics query after the
existing account/student preflights, assignment/status scan and optional sources.
This adds available rubric criterion and rating text to the weekly guide, with
grading-use, free-form comment and criterion range/scoring flags. It does not
enable expanded reading or retrieve assessment responses, grading feedback,
numeric scoring, linked content or assignment descriptions.


Bounded upstream review
-----------------------

Reviewed against Canvas revision 1c9f0bb8013ed69c4f2efe11fd483025469b7e6c in the
local pinned source archive. The query uses the existing Course.assignmentsConnection
arguments and visibility path documented in canvas-metadata-admission.md. The
initial criterion-only selection was subsequently extended with the stored
rating/usage fields reviewed below; the current query is pinned at the end.

| Selected dependency | Finding |
| --- | --- |
| AssignmentType.rubric | Checks active_rubric_association? then load_association(:rubric); it does not call load_locked_for or Assignment.description. |
| AbstractAssignment associations | The grading association selects by purpose and creation order and preloads its rubric; the through-rubric association merges RubricAssociation.active. active_rubric_association? reads the association's active state predicate. |
| RubricAssociation | SoftDeletable declares active/deleted Workflow states and a scope. Its save/create/destroy callbacks update assignments, assessments and audit data, but those callbacks are not invoked by loading the association. has_a_broadcast_policy retains the previously reviewed save-triggered behavior. |
| RubricType.criteria | Sets a request-context rubric ID and returns object.criteria. Rubric.criteria returns its serialized data field. It does not call generate_criteria, update_criteria, outcome resolution or an LLM service. |
| RubricCriterionType | Constructor stores the request-context rubric ID in memory. Descriptions and IDs read stored hash fields; criterionUseRange and ignoreForScoring coerce stored flags. ratings returns the stored ratings list and sets the request-local rubric ID; no learning-outcome resolver is selected. |
| RubricRatingType | Constructor stores a request-local ID. Only stored ID/description/longDescription are selected; numeric points and student assessments are excluded. |
| RubricAssociationType | associationId/associationType read stored values. useForGrading coerces its stored flag. AssignmentType.rubricAssociation uses the same active grading association as the earlier rubric read. No saved-comments, assessment, hidePoints or permission resolver is selected. |
| RubricType.freeFormCriterionComments | Coerces the stored flag without reading assessment comments. |
| Rubric model and concerns | Direct callbacks attach to validation/save/create. Trackable adds before_save metrics; SimplyVersioned adds before_save/after_save versioning. Workflow and HtmlTextHelper retain their prior model/helper findings. No new find/initialize persistence callback was identified. |
| GraphQL object authorization | ApplicationObjectType uses the existing type-scope check; no new object-level rubric permission resolver is selected. Existing course and assignment visibility checks still apply. |

Source files: app/graphql/types/{assignment_type,rubric_type,rubric_criterion_type,rubric_rating_type,rubric_association_type,
application_object_type}.rb, app/graphql/interfaces/legacy_id_interface.rb,
app/models/{abstract_assignment,rubric,rubric_association}.rb,
app/models/rubric/trackable.rb, lib/canvas/soft_deletable.rb, and
gems/plugins/simply_versioned/lib/simply_versioned.rb. Also reviewed the versioning
initializer; its Version configuration does not run a rubric-save operation.

No selected path was found to mark content read, evaluate module progression,
touch an assignment on unlock, start/resume attempts or submit work. This is
source-level evidence for a pinned stock implementation, not verification of
UBC's deployed version or proof of historical account invariance. Generic server
authentication/access telemetry and caches retain the existing caveat.


Collection and guide contract
-----------------------------

- The main-process transport constructs the exact request with its bound course
  ID. Generic request() does not admit it; the pending byte-for-byte network gate
  remains required. No renderer-provided GraphQL or rubric IDs are accepted.
- A rubric scan requires assignments observed by that transport. Its returned
  assignment set must match the earlier completed metadata scan. Changed sets,
  repeated identities/cursors, partial GraphQL errors or malformed criterion text
  reject the optional source. Server visibility can still change between requests;
  client checks cannot undo server processing.
- It shares the existing per-course 200-request/16-MiB budget and 2-MiB response
  limit. Up to 100 assignments per page and 200 criteria per rubric are accepted.
  Up to 100 ratings per criterion and individual text bounds apply, with
  HTML/credential sanitization. No extracted
  link or embedded asset is fetched. Limits can produce explicit coverage gaps.
- Collected text reaches source details, Markdown/HTML/Word output and optional AI
  evidence. It is labeled partial, with a full-rubric verification task. Missing,
  empty or failed reads retain older criteria as stale with their original age.
  A null rubric is not reported as proof that the assignment has no rubric.
- The rubric association must identify the returned assignment and the Assignment
  type. Rating IDs are checked for duplicates within each criterion. Missing rating
  descriptions are disclosed; older criterion-only data keeps its original gap
  label. Ratings describe standards, never the student's earned result. Changes to
  rating text appear in the guide's source differences.
- Account, identity, cancellation and audit failures remain fatal to the refresh.
  No successful partial rubric snapshot is exported after a later rubric-page failure.
  History records the course-level operation and outcomes; content never enters
  the request audit. Source links remain normal user-initiated browser navigation.

Query SHA256: 3713f15a719eea355b658b6aa0b6fce124806bd9ddbf8c53a44cae939ba55b69.
The independent admission test pins it. The query validates against the pinned
GraphQL schema. Parser/collector, transport, guide and localhost Electron tests
cover the selected contract, including second-page errors and wrong-account or
expired responses. These fixtures do not demonstrate real Canvas account effects.

Numeric scoring remains uncollected. RubricAssociation.hidePoints is not a simple
stored flag: it calls assignment/course restrict_quantitative_data? and the account
manage-permission path. Do not add numeric fields without reviewing visibility
semantics and respecting restricted quantitative data. No attempt was made to
exercise that path on a personal account. The stored range flag is presented
without inventing numeric boundaries, and useForGrading does not establish a
course weighting or an earned grade.
