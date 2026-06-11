---
name: tdd-workflow
description: Test-driven development workflow — the core software development process for all engineer agents. Use when writing new features, fixing bugs, or refactoring code. Enforces RED → GREEN → REFACTOR at the unit level with checkpoint commits and coverage verification.
---

# Test-Driven Development Workflow

This skill is the **core development process** for the Software Engineer and Frontend Engineer agents. All production code changes follow TDD: tests are written and validated as failing BEFORE any implementation code is written.

Scope note: this skill covers **unit-level TDD** — the red/green/refactor cycle around functions, components, and modules. Integration and E2E testing are deliberately out of scope here; they belong to the SDET agent (Parallel Gate 2), which assesses scenario-level coverage after implementation.

## When to Activate

- Writing new features or functionality
- Fixing bugs or issues
- Refactoring existing code
- Adding API endpoints
- Creating new components

## Core Principles

### 1. Tests BEFORE Code
ALWAYS write tests first, then implement code to make tests pass. Do not edit production code until a valid RED state is confirmed.

### 2. Coverage Requirements
- Minimum 80% unit coverage on the code touched by the change (respect the project's configured thresholds when stricter)
- All edge cases covered
- Error scenarios tested
- Boundary conditions verified

### 3. Test Scope
Unit tests: individual functions and utilities, component logic, pure functions, helpers. Run them with the project's test commands from `.constellation/config.json` (`commands.test`, `commands.testRelated`).

### 4. Git Checkpoints
- If the repository is under Git, create a checkpoint commit after each TDD stage on the feature branch
- Do not squash or rewrite these checkpoint commits until the workflow is complete — the PR is squash-merged into main (see the branching-strategy skill), so the branch history carries the TDD evidence while main still receives a single commit
- Each checkpoint commit message must describe the stage and the exact evidence captured
- Count only commits created on the current active branch for the current task — never treat commits from other branches or earlier unrelated work as checkpoint evidence
- Before treating a checkpoint as satisfied, verify the commit is reachable from the current `HEAD` on the active branch
- The preferred compact sequence:
  - one commit for failing test added and RED validated
  - one commit for minimal fix applied and GREEN validated
  - one optional commit for refactor complete

## TDD Workflow Steps

### Step 1: Write User Journeys
```
As a [role], I want to [action], so that [benefit]

Example:
As a user, I want to search for markets semantically,
so that I can find relevant markets even without exact keywords.
```

### Step 2: Generate Test Cases
For each user journey, create comprehensive test cases:

```typescript
describe('Semantic Search', () => {
  it('returns relevant markets for query', async () => {
    // Test implementation
  })

  it('handles empty query gracefully', async () => {
    // Test edge case
  })

  it('falls back to substring search when cache unavailable', async () => {
    // Test fallback behavior
  })

  it('sorts results by similarity score', async () => {
    // Test sorting logic
  })
})
```

### Step 3: Run Tests (They Should Fail) — the RED Gate
Run the relevant tests with the project's test command. **This step is mandatory and is the RED gate for all production changes.**

Before modifying business logic or other production code, verify a valid RED state via one of these paths:
- **Runtime RED**:
  - The relevant test target compiles successfully
  - The new or changed test is actually executed
  - The result is RED
- **Compile-time RED**:
  - The new test newly instantiates, references, or exercises the buggy code path
  - The compile failure is itself the intended RED signal

In either case:
- The failure is caused by the intended business-logic bug, undefined behavior, or missing implementation
- The failure is NOT caused only by unrelated syntax errors, broken test setup, missing dependencies, or unrelated regressions

A test that was only written but not compiled and executed does not count as RED.

**Do not edit production code until this RED state is confirmed.**

Checkpoint commit after RED is validated:
- `test: add reproducer for <feature or bug>`
- This commit serves as the RED validation checkpoint if the reproducer was compiled, executed, and failed for the intended reason

### Step 4: Implement Code
Write **minimal** code to make tests pass:

```typescript
// Implementation guided by tests
export async function searchMarkets(query: string) {
  // Implementation here
}
```

Stage the minimal fix now but defer the checkpoint commit until GREEN is validated in Step 5.

### Step 5: Run Tests Again — the GREEN Gate
Rerun the same relevant test target after the fix and confirm the previously failing test is now GREEN.

Only after a valid GREEN result may you proceed to refactor.

Checkpoint commit after GREEN is validated:
- `fix: <feature or bug>` (or `feat: <feature>` for new functionality)
- The commit serves as the GREEN validation checkpoint if the same relevant test target was rerun and passed

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

1. **Write Tests First** — always TDD
2. **One Assert Per Test** — focus on single behavior
3. **Descriptive Test Names** — explain what's tested
4. **Arrange-Act-Assert** — clear test structure
5. **Mock External Dependencies** — isolate unit tests
6. **Test Edge Cases** — null, undefined, empty, large
7. **Test Error Paths** — not just happy paths
8. **Keep Tests Fast** — unit tests < 50ms each
9. **Clean Up After Tests** — no side effects
10. **Review Coverage Reports** — identify gaps

## Success Metrics

- 80%+ unit coverage achieved on changed code
- All tests passing (green)
- No skipped or disabled tests
- Fast test execution (< 30s for unit tests)
- RED → GREEN → REFACTOR evidence captured in checkpoint commits

---

**Remember**: tests are not optional. They are the safety net that enables confident refactoring, rapid development, and production reliability. The RED gate is what makes a test trustworthy — a test that has never failed has never proven it tests anything.
