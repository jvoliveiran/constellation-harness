/**
 * Constellation Harness — OpenCode port of the SessionStart bootstrap (dynamic half).
 *
 * Source of truth: plugins/constellation/scripts/session-start.sh (Claude Code hook).
 *
 * The Claude Code SessionStart hook does TWO things:
 *   1. STATIC: prints the orchestrator routing policy into the session context.
 *   2. DYNAMIC: warns about an unfinished workflow and uncommitted .constellation artifacts.
 *
 * OpenCode has NO confirmed hook that injects text into the model's context at session
 * start (this is the one genuine gap vs Claude Code — see README). So the split is:
 *   - (1) STATIC policy  → lives in AGENTS.md (always-loaded instructions). See ../AGENTS.md.
 *   - (2) DYNAMIC checks → this plugin, on the `session.created` event.
 *
 * Because we can't push text into context, the dynamic warnings are surfaced via the SDK
 * client toast + a plugin log. That's advisory, not in-context — a fidelity gap to accept
 * or to close later with an experimental system-prompt-transform hook if the installed
 * @opencode-ai/plugin version exposes one.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { existsSync } from "node:fs"
import { join } from "node:path"

export const ConstellationBootstrap: Plugin = async ({ directory, client, $ }) => {
  return {
    event: async ({ event }: { event: { type: string } }) => {
      if (event.type !== "session.created") return

      const projectDir = directory
      const configFile = join(projectDir, ".constellation", "config.json")
      if (!existsSync(configFile)) return // not initialized — stay silent

      const notes: string[] = []

      // Unfinished workflow?
      const stateFile = join(projectDir, ".constellation", "state", "current-workflow.json")
      if (existsSync(stateFile)) {
        notes.push(
          "Unfinished Constellation workflow detected (.constellation/state/current-workflow.json). " +
            "Run /constellation:resume before starting new work.",
        )
      }

      // Uncommitted harness artifacts? (state/ and metrics/ are gitignored and never counted)
      try {
        const r = await $`git -C ${projectDir} status --porcelain -uall -- .constellation`.quiet().nothrow()
        const count = r.exitCode === 0 ? r.stdout.toString().trim().split("\n").filter(Boolean).length : 0
        if (count > 0) {
          const hasSync = existsSync(join(projectDir, ".constellation", "scripts", "sync-artifacts.sh"))
          notes.push(
            `Uncommitted harness artifacts: ${count} file(s) under .constellation/. ` +
              (hasSync
                ? "Run .constellation/scripts/sync-artifacts.sh to commit them."
                : "Run /constellation:init --refresh to install sync-artifacts.sh, then run it."),
          )
        }
      } catch {
        /* fail-open — resume's validation owns state integrity */
      }

      if (notes.length === 0) return
      const message = "🌌 Constellation\n" + notes.map((n) => `• ${n}`).join("\n")

      // Best-effort surfacing. `client` is the OpenCode SDK; the exact toast method name
      // should be confirmed against the installed package. Falls back to a plugin log,
      // which OpenCode shows in its logs.
      try {
        await (client as any)?.tui?.showToast?.({ message, variant: "info" })
      } catch {
        /* ignore */
      }
      console.log(message)
    },
  }
}
