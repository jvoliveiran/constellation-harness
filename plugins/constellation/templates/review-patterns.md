# Review Patterns

Common patterns found across code reviews and security reviews in THIS project. The Software Engineer self-checks against these before triggering the review gate.

This file is a living document — agents update it after each review cycle when a new recurring pattern is identified.

---

## Common Code Review Blockers

_No patterns recorded yet. This section will be populated as reviews are conducted._

<!-- Example format:
- **Missing permission guard on new endpoints** (seen: 3 times) — Every non-public endpoint must have an explicit authorization check.
- **Queries returning sensitive fields** (seen: 2 times) — Always exclude credential/secret columns from query results.
-->

---

## Common Security Blockers

_No patterns recorded yet._

<!-- Example format:
- **Missing auth guard on new endpoint** (seen: 4 times) — Every new endpoint must be explicitly protected or explicitly marked public.
- **Correlation/request ID missing in error handlers** (seen: 3 times) — All catch blocks in services must include the request ID in log metadata.
-->

---

## Common Test Gaps

_No patterns recorded yet._

<!-- Example format:
- **Missing error path tests for repository methods** (seen: 3 times) — Every data-access method that can throw (unique constraint, not found) needs an error path test.
-->

---

## How to Update This File

After a review cycle, if a blocker or suggestion matches a pattern already listed here, increment the `seen` counter. If it's a new recurring pattern (found 2+ times across different workflows), add it.

Agents that update this file:
- **Code Reviewer**: after finding a blocker that matches or establishes a pattern
- **Security Analyst**: after finding a security blocker that matches or establishes a pattern
- **SDET**: after finding a recurring test gap
