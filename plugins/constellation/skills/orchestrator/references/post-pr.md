# Post-PR Phase — full protocol

Loaded on demand by the orchestrator when re-entering a PR that received human
feedback (see the stub in SKILL.md). State is already at `post-pr` on entry.

1. DevOps fetches **unresolved** review threads (github-remote GraphQL query).
2. Orchestrator classifies each thread:
   - **Change request** → joins the fix list.
   - **Question / discussion** → escalate to the user with a drafted answer — never guess
     an answer on the human's behalf, never mark it addressed silently.
3. Software Engineer implements the change requests (TDD) → **Lint Gate** → **Gate 1
   incremental** (fix delta + the comment list as the blocker context; same 3-loop cap;
   cross-model participates if enabled — a blocker here sets `hadBlockers`).
4. Push. DevOps replies on each addressed thread referencing the fix commit, resolves the
   threads, refreshes the gate summary comment.
   **→ Log**: `{ event: "pr-comments-addressed", data: { threads: N, loops: N } }`
5. Return to the **Ship step** (preconditions re-checked — CI runs again on the push),
   saving state back to the ship step.
