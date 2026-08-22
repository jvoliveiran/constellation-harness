---
name: test-verified-development
description: Test-verified development workflow — the core software development process for all engineer agents. Use when writing new features, fixing bugs, or refactoring code. Implementation and tests land together; every test is then proven able to fail (the VERIFY gate) before the change is accepted, with checkpoint commits and coverage verification.
---

# Test-Verified Development Workflow

This skill is the **core development process** for the Software Engineer and Frontend Engineer agents. Implementation and unit tests are written together, guided by the plan's acceptance criteria — and no change is complete until every new test has been **proven able to fail** for the intended reason. A test that has never failed has never proven it tests anything; this workflow makes that proof a mechanical gate instead of a process ritual.

Design is not this skill's job: for planned work the approved plan already fixed the architecture, contracts, and edge cases — implement to it directly rather than letting test order shape the design.

Scope note: this skill covers **unit-level testing** — functions, components, and modules. Integration and E2E testing are deliberately out of scope here; they belong to the SDET agent (Parallel Gate 2), which assesses scenario-level coverage after implementation.

## When to Activate

- Writing new features or functionality
- Fixing bugs or issues
- Refactoring existing code
- Adding API endpoints
- Creating new components

## Core Principles

### 1. Tests Ship WITH the Code
Every production change lands together with the unit tests that cover it — same working session, same checkpoint commit. Derive the test cases from the plan's acceptance criteria (or the bug report) before implementing, so the tests assert required behavior, not whatever the implementation happens to do.

### 2. Every Test Is Proven Able to Fail
After tests pass, the **VERIFY gate** (Step 4) removes or breaks the production change and confirms the tests fail for the intended reason. A test that passes both with and without the implementation is tautological — rewrite it. This check is mandatory for every feature and bug fix.

### 3. Coverage Requirements
- Minimum 80% unit coverage on the code touched by the change (respect the project's configured thresholds when stricter)
- All edge cases covered
- Error scenarios tested
- Boundary conditions verified

### 4. Test Scope
Unit tests: individual functions and utilities, component logic, pure functions, helpers. Run them with the project's test commands from `.constellation/config.json` (`commands.test`, `commands.testRelated`).

### 5. Git Checkpoints
- If the repository is under Git, create a checkpoint commit after each stage on the feature branch
- Do not squash or rewrite these checkpoint commits until the workflow is complete — the PR is squash-merged into main (see the branching-strategy skill), so the branch history carries the verification evidence while main still receives a single commit
- Each checkpoint commit message must describe the stage and the exact evidence captured
- Count only commits created on the current active branch for the current task — never treat commits from other branches or earlier unrelated work as checkpoint evidence
- Before treating a checkpoint as satisfied, verify the commit is reachable from the current `HEAD` on the active branch
- The preferred compact sequence:
  - one commit for implementation + tests, GREEN and VERIFY validated (`feat:`/`fix:`)
  - one optional commit for refactor complete (`refactor:`)

## Workflow Steps

### Step 1: Derive Test Cases from the Behavior
Start from the acceptance criteria (planned work) or the reproduction (bug fix). For features without formal criteria, write the user journey first:

```
As a [role], I want to [action], so that [benefit]

Example:
As a user, I want to search for markets semantically,
so that I can find relevant markets even without exact keywords.
```

Then enumerate the test cases the change must satisfy:

```typescript
describe('Semantic Search', () => {
  it('returns relevant markets for query', async () => {})
  it('handles empty query gracefully', async () => {})
  it('falls back to substring search when cache unavailable', async () => {})
  it('sorts results by similarity score', async () => {})
})
```

This list is the contract for the implementation — it comes from the requirements, never from the finished code.

### Step 2: Implement Code and Tests Together
Write the implementation and fill in the test cases in the same session. Keep the implementation minimal — only what the acceptance criteria demand (YAGNI). For a bug fix, the test that reproduces the bug is part of this step, not optional.

### Step 3: Run Tests — the GREEN Gate
Run the relevant test target with the project's test command. All new and existing tests must pass. Fix failures before proceeding — do not weaken assertions to get to green.

### Step 4: Prove the Tests — the VERIFY Gate
**This step is mandatory and is what makes the tests trustworthy.** With tests green, demonstrate they would catch the absence (or breakage) of the change:

1. Temporarily remove the production change, keeping the tests in the tree:
   ```bash
   git stash push -u -- <production files touched by the change>
   ```
   (`-u` so newly created files are stashed too; test files are NOT included in the pathspec)
2. Rerun the same relevant test target. The new tests **must fail**, and fail for the intended reason:
   - a behavioral assertion mismatch caused by the missing feature or the resurfaced bug, or
   - a compile/import failure because the test exercises code that no longer exists
   - NOT unrelated syntax errors, broken test setup, missing dependencies, or unrelated regressions
3. Restore the change and confirm green again:
   ```bash
   git stash pop
   ```
   Rerun the target once — it must return to GREEN.

When stashing is impractical (e.g. the change is interleaved with pre-existing code in one file), instead temporarily invert or break the key logic of the change (a manual mutation), confirm the tests fail, then restore it exactly and confirm GREEN.

A test suite that stays green in step 2 is tautological or asserts too little — rewrite the tests and repeat the gate. Do not proceed to commit until VERIFY has passed.

### Step 5: Checkpoint Commit
Commit implementation + tests together once GREEN and VERIFY are validated:

- `feat: <feature>` or `fix: <bug>`
- The commit body records the VERIFY evidence, e.g. `verified: 4 new tests fail without the implementation (assertion mismatches in search.service.spec.ts)`

### Step 6: Refactor
Improve code quality while keeping tests green:
- Remove duplication
- Improve naming
- Optimize performance
- Enhance readability

Checkpoint commit after refactoring is complete and tests remain green:
- `refactor: clean up after <feature or bug> implementation`

### Step 7: Verify Coverage
Run the project's coverage command (e.g. `npm run test:coverage` or the project's equivalent) and verify the coverage requirement is met for the changed code.

## Unit Test Pattern (Jest/Vitest)

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { Button } from './Button'

describe('Button Component', () => {
  it('renders with correct text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const handleClick = jest.fn()
    render(<Button onClick={handleClick}>Click</Button>)

    fireEvent.click(screen.getByRole('button'))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled prop is true', () => {
    render(<Button disabled>Click</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

## Test File Organization

Unit tests are co-located with the code they test, following the project's conventions (see `.constellation/project-map.md`):

```
src/
├── components/
│   └── Button/
│       ├── Button.tsx
│       └── Button.test.tsx          # Unit tests, co-located
└── services/
    ├── search.service.ts
    └── search.service.spec.ts
```

## Mocking External Dependencies

Mock at the boundary — database clients, HTTP clients, third-party SDKs — so unit tests stay fast and deterministic:

```typescript
jest.mock('@/lib/database', () => ({
  db: {
    findMany: jest.fn(() => Promise.resolve([{ id: 1, name: 'Test Market' }])),
  },
}))

jest.mock('@/lib/embeddings', () => ({
  generateEmbedding: jest.fn(() => Promise.resolve(new Array(1536).fill(0.1))),
}))
```

Mock shapes must match the real contract (actual schema field names, actual return types). Never mock what you own if the real thing is cheap to use.

## Coverage Thresholds

When the project defines thresholds, respect them; when adding them, 80% is the floor:

```json
{
  "jest": {
    "coverageThresholds": {
      "global": {
        "branches": 80,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

## Edge Cases You MUST Test

For every unit under test, work through this list and cover what applies:

1. **Null/Undefined** input
2. **Empty** arrays/strings
3. **Invalid types** passed
4. **Boundary values** (min/max, off-by-one)
5. **Error paths** (dependency failures, thrown exceptions)
6. **Race conditions** (concurrent calls, out-of-order async resolution)
7. **Large data** (performance and correctness with 10k+ items)
8. **Special characters** (Unicode, emojis, quotes, SQL/HTML-significant characters)

## Common Testing Mistakes to Avoid

### ❌ WRONG: Testing Implementation Details
```typescript
// Don't test internal state
expect(component.state.count).toBe(5)
```

### ✅ CORRECT: Test User-Visible Behavior
```typescript
// Test what users see
expect(screen.getByText('Count: 5')).toBeInTheDocument()
```

### ❌ WRONG: Brittle Selectors
```typescript
// Breaks easily
const el = container.querySelector('.css-class-xyz')
```

### ✅ CORRECT: Semantic Queries
```typescript
// Resilient to changes
screen.getByRole('button', { name: 'Submit' })
screen.getByTestId('submit-button')
```

### ❌ WRONG: Asserting Too Little
```typescript
// Passes even when the behavior is broken
const result = calculateTotal(lineItems)
expect(result).toBeDefined()
```

### ✅ CORRECT: Specific, Meaningful Assertions
```typescript
// A wrong value fails the test
const result = calculateTotal(lineItems)
expect(result).toBe(255) // 300 - 15% discount
```

### ❌ WRONG: No Test Isolation
```typescript
// Tests depend on each other
test('creates user', () => { /* ... */ })
test('updates same user', () => { /* depends on previous test */ })
```

### ✅ CORRECT: Independent Tests
```typescript
// Each test sets up its own data
test('creates user', () => {
  const user = createTestUser()
  // Test logic
})

test('updates user', () => {
  const user = createTestUser()
  // Update logic
})
```

## Continuous Testing

### Watch Mode During Development
Run the project's test command in watch mode (e.g. `npm test -- --watch`) so tests run automatically on file changes.

### Pre-Commit Verification
Before every checkpoint commit: the relevant tests pass and lint is clean.

## Best Practices

1. **Derive Tests from Requirements** — acceptance criteria, not the finished code
2. **Prove Every Test Can Fail** — the VERIFY gate is not optional
3. **One Assert Per Test** — focus on single behavior
4. **Descriptive Test Names** — explain what's tested
5. **Arrange-Act-Assert** — clear test structure
6. **Mock External Dependencies** — isolate unit tests
7. **Test Edge Cases** — null, undefined, empty, large
8. **Test Error Paths** — not just happy paths
9. **Keep Tests Fast** — unit tests < 50ms each
10. **Clean Up After Tests** — no side effects
11. **Review Coverage Reports** — identify gaps

## Quality Checklist

Self-check before handing off to the Lint Gate:

- [ ] All public functions/components touched by the change have unit tests
- [ ] Test cases were derived from acceptance criteria / the bug report, not from the implementation
- [ ] Every new test was proven to fail without the change (VERIFY gate), for the intended reason
- [ ] Edge cases covered (null, empty, invalid, boundaries)
- [ ] Error paths tested — not just the happy path
- [ ] External dependencies mocked at the boundary
- [ ] Tests are independent (no shared state, no ordering)
- [ ] Assertions are specific and meaningful — a wrong value fails them
- [ ] Coverage is 80%+ on the changed code
- [ ] Checkpoint commit(s) with VERIFY evidence exist on the branch

## Success Metrics

- 80%+ unit coverage achieved on changed code
- All tests passing (green)
- No skipped or disabled tests
- Fast test execution (< 30s for unit tests)
- VERIFY evidence captured in checkpoint commit messages

---

**Remember**: tests are not optional. They are the safety net that enables confident refactoring, rapid development, and production reliability. The VERIFY gate is what makes a test trustworthy — a test that has never failed has never proven it tests anything.
