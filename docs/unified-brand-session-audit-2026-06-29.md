# Unified Brand Session Audit (2026-06-29)

## Scope

- Unified endpoint: `POST /skill/faq`
- Dedicated endpoints: Laurastar, Woods, Aarke, Litter-Robot
- Session storage: Supabase `faq_brand_sessions`
- Session key: Kakao `userRequest.user.id`
- Session lifetime: 24 hours, extended on every successful branded question

## Verified Scenarios

| Scenario | Laurastar | Woods | Aarke | Litter-Robot |
|---|---|---|---|---|
| Appears in brand selection | Pass | Pass | Pass | Pass |
| Selection marker resolves brand | Pass | Pass | Pass | Pass |
| Selected brand is saved | Pass | Pass | Pass | Pass |
| Next unmarked question reuses brand | Pass | Pass | Pass | Pass |
| Response includes `브랜드 변경` | Pass | Pass | Pass | Pass |
| Dedicated skill URL works | Pass | Pass | Pass | Pass |
| Shared typo normalization works | Pass | Pass | Pass | Pass |

`브랜드 변경` clears the current user's session and returns the complete four-brand selection response.

## Production Database Check

- Existing session rows: 34
- Laurastar: 6
- Woods: 23
- Aarke: 5
- Litter-Robot: 0 before the audit
- Expired rows: 33

An audit-only Litter-Robot session was saved, read back as `litter-robot`, and deleted successfully. The REST results were HTTP 201 for save and HTTP 204 for delete.

The high expired-row count did not affect brand resolution because expired rows were already ignored. The code now deletes an expired row when it is read, preventing revisiting users from leaving stale sessions indefinitely.

## Operational Limitations

- Litter-Robot has no real production session or FAQ history yet, so production user behavior cannot be assessed until deployment and traffic begin.
- A missing Kakao user ID allows the selected question to be answered but cannot provide persistence for the next request.
- If Supabase is unavailable, the production Worker currently returns an error instead of silently switching to isolate memory. This avoids inconsistent cross-isolate sessions but makes Supabase availability part of the unified endpoint's reliability.
- Current local changes, including Litter-Robot and typo normalization, are not active on the deployed Worker until deployment.

## Verification

- Automated tests: 62 passed, including worksheet routing, typo normalization, and expired-session cleanup.
- Worker dry-run bundle: passed.
- Production Supabase table read/save/read/delete: passed.
