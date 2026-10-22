---
status: parked
type: feature
source: product-manager
feature: F001-board-ui-overhaul.md
related: 025-board-session-reader-tokens-and-agent-output.md
revisit: the user names the stepper look, a static running duration, or a missing Copy button as a gap at the 025 verification or in a later board session
date-created: 21-10-2026
last-edit: 21-10-2026
---
# Board: stepper restyle, running-row pulse, Copy button in the agent dialog

Parked by the task 025 scope pass on 21-10-2026. Spec `docs/specs/board-ui-v2.md` §4.2 (Stepper), §6.1 (pulse), and §6.5 (Copy button) list these items. The task 023 scope pass moved the first two into 025.

**Value hypothesis**: a user reads the workflow position faster with a connector line and a ring on the current step, sees that a running agent is alive from the pulse, and pastes an agent report elsewhere with one click.

**Parked because**: the 025 loop is see the real spend, then open the output of a finished agent or a done step. Task 025 makes a done step with agents a button with a hover and focus style, and that is enough to open the outputs. The restyle, the pulse, and the Copy button change no data and answer no user feedback. The user can select and copy the report text by hand.

**Scope when the trigger fires**:
- Stepper: a connector line between the nodes, done in `--ok`, current in `--accent` with a ring, pending muted (spec §4.2).
- A running agent row pulses its duration in `--warn`, with a `prefers-reduced-motion` rule that stops the animation (spec §6.1).
- The agent dialog header gets a `Copy` button that copies the raw report text (spec §6.5).

**Effort**: S
