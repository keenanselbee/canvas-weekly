Canvas preflight model review
============================

Reviewed 2026-09-11 against Canvas revision
1c9f0bb8013ed69c4f2efe11fd483025469b7e6c. This closes the four additional
preflight-model checks identified in the permission review. It does not enable
production collection or certify a different institutional build.

Model loading and selected getters
----------------------------------

| Model | Reachable behavior | Finding |
|---|---|---|
| User | Self-node load, account associations, pseudonym fallback, fake_student?, unavailable? and impersonated | No direct after_find/after_initialize registration. pseudonym is an ordered has_one association excluding deleted rows. fake_student? reads preferences and an enrollment exists? query; unavailable? delegates to deleted?; impersonated is an accessor. These getters do not create enrollment state. |
| AccountUser | Membership lookup and reconstruction of cached site-admin entries | Validation, save, destroy and update-commit hooks exist. RootAccountResolver and Role::AssociationHelper register before_save behavior. Loading a row or constructing a cached readonly object does not run these save hooks. |
| Pseudonym | User.account fallback and cached root-account association | No direct read-time callback. RootAccountCacher returns the current domain account when it matches, otherwise uses RequestCache and Account.find_cached. Authentication and list macros require the additional review below. |
| UserAccountAssociation | User's associated_accounts through relationship | RootAccountResolver registers before_save. update_user_root_account_ids is after_commit; selecting existing associations does not schedule that update. |

The inclusion review covered ManyRootAccounts, TurnitinID, Pronouns, Context,
ModelCache, UserLearningObjectScopes, PermissionsHelper, TimeZoneHelper, Workflow,
UserPreferenceValue::UserMethods, StickySisFields, FeatureFlags, SearchTermHelper,
RootAccountResolver, RootAccountCacher and Role::AssociationHelper. Previously
reviewed shared concerns retain their existing findings in the permission review.

ModelCache registers after_create/after_update cache maintenance; its lookup
wrappers return cached objects or delegate to the original lookup. StickySisFields
prepends persistence helpers and registers before_save. UserPreferenceValue's
methods are not inclusion callbacks: get_preference reads existing values and
mark_preference_row updates an in-memory Set. Its upsert/update methods require
explicit calls. The selected preflight does not call them.

Some included methods do write when explicitly used. TurnitinID generates and
saves an ID; Context can publish external-feed announcements; PermissionsHelper
has methods that evaluate date-based enrollment state. Their mere inclusion is
not evidence those methods run. None is called by the fixed self-node/account
policy route documented in canvas-metadata-permissions-review.md. Do not admit
new fields or routes using this model-load conclusion alone.

Macros and Authlogic
-------------------

The pinned Canvas acts_as_list macro registers before_create and before_destroy
list maintenance. has_a_broadcast_policy registers after_save notifications.
Neither registers a model-find or model-initialize callback.

Canvas's Gemfile.lock pins Authlogic 6.4.3 to Git revision
d155fff4672595af99cb3488d9731f1efc595049. The source archive was downloaded from
the dependency's repository; 44 regular Ruby files under lib were extracted for
inspection without executing or installing the package. Archive SHA256:
c298376a3a9108526af654157c6c68a7cacb354c5a9d97117ccec9a4cfb8788c.

acts_as_authentic iterates its registered modules at model setup. Reviewed the
inclusion bodies for email, login, logged-in status, magic columns, password,
perishable token, persistence token, session maintenance and single-access token.
They add configuration, scopes, validations, explicit password callbacks, and
save/validation hooks. No after_find or after_initialize hook was registered.
Password verification can reset and save a persistence token; a plain Pseudonym
association lookup does not invoke password verification. This finding applies
to model loading, not to authentication requests.

Canvas's authlogic_mods initializer reorders session persistence callbacks so
the session cookie precedes the remember-me cookie. It also wraps save_record
to tolerate specified secondary-database write errors. That is evidence of
potential authentication persistence, not a read-only guarantee. Existing
authentication/access bookkeeping remains outside the claim about coursework
and learning-state actions. No real authentication or Canvas request ran here.

The ActiveRecord initializer matches for initialize and after_initialize were
also examined: migration, connection/preloader and application schema-cache
setup are distinct from model after_initialize callbacks. The model-level
DefineAttributeMethods.init_internals wrapper creates an AttributesDefiner
helper in memory and delegates to super; its Marshal helper defines attribute
methods on load. It does not save the model. No model-find callback was found
in that initializer. Institutional patches and unreviewed future fields remain
outside this bounded source conclusion.

Next admission step
-------------------

Reconcile this result with the fixed-query getter inventory, controller and
permission findings in one explicit admission decision. The four preflight
models no longer remain an open direct/included-hook review task. The remaining
decision must retain the production special-account assumptions, authentication
bookkeeping, institution-version uncertainty, and the prohibition on restoring
the removed instruction/body/download routes through this metadata decision.

Sources
-------

- [User](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/user.rb)
- [AccountUser](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/account_user.rb)
- [Pseudonym](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/pseudonym.rb)
- [UserAccountAssociation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/user_account_association.rb)
- [RootAccountCacher](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/canvas/root_account_cacher.rb)
- [RootAccountResolver](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/root_account_resolver.rb)
- [List macro](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/acts_as_list/lib/active_record/acts/list.rb)
- [Broadcast macro](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/broadcast_policy/lib/broadcast_policy/class_methods.rb)
- [Authlogic module setup](https://github.com/binarylogic/authlogic/blob/d155fff4672595af99cb3488d9731f1efc595049/lib/authlogic/acts_as_authentic/base.rb)
- [Authlogic session maintenance](https://github.com/binarylogic/authlogic/blob/d155fff4672595af99cb3488d9731f1efc595049/lib/authlogic/acts_as_authentic/session_maintenance.rb)
- [Canvas Authlogic changes](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/config/initializers/authlogic_mods.rb)
- [Canvas ActiveRecord changes](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/config/initializers/active_record.rb)
