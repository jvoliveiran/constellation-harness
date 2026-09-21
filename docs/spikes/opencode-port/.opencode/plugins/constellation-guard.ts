/**
 * Constellation Harness — OpenCode port of the PreToolUse git guard.
 *
 * Source of truth: plugins/constellation/scripts/guard-git.sh (Claude Code hook).
 * Claude Code fires this as a `PreToolUse` hook matched to the `Bash` tool; it
 * receives the tool input on stdin and blocks with exit code 2. OpenCode has no
 * shell-command hooks, so the same rules are expressed here as a `tool.execute.before`
 * handler on the `bash` tool. Blocking is done by THROWING — OpenCode surfaces the
 * thrown message to the agent the same way exit-2 + stderr did in Claude Code.
 *
 * Bonus: this port drops the `jq` dependency the shell version needed — config and
 * state are parsed with the runtime's own JSON.
 *
 * Install: listed automatically because it lives in `.opencode/plugins/`. No config entry needed.
 */
import type { Plugin } from "@opencode-ai/plugin"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Subcommand anchor — a direct translation of GIT_SUB in guard-git.sh.
 * Matches `git`, its global options (`-C <path>`, `-c k=v`, `--paginate`, …), then
 * whitespace, so a rule matches the SUBCOMMAND POSITION only — never the same word
 * appearing in a branch name, path, or -m message. POSIX [[:space:]] → \s.
 */
const GIT_SUB = String.raw`git(?:\s+-[^\s|;&]+(?:\s+[^-][^\s|;&]*)?)*\s+`

const readJson = (path: string): any => {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

export const ConstellationGuard: Plugin = async ({ directory, $ }) => {
  return {
    "tool.execute.before": async (input: any, output: any) => {
      if (input.tool !== "bash") return

      const projectDir = directory
      const config = readJson(join(projectDir, ".constellation", "config.json"))
      if (!config) return // not an initialized project — stay silent, behave like vanilla

      const cmd: string = output?.args?.command ?? ""
      if (!cmd || !/git/.test(cmd)) return

      const mainBranch: string = config?.branching?.mainBranch || "main"
      const deny = (msg: string): never => {
        throw new Error(`constellation guard: ${msg}`)
      }
      const has = (re: RegExp) => re.test(cmd)

      // Resolve the repo a subcommand targets: honor an absolute `git -C <dir>` or a
      // leading `cd <dir>`; otherwise fall back to the project dir (conservative default).
      const gitTargetDir = (sub: string): string => {
        const prefix = cmd.replace(new RegExp(`\\s+${sub}([\\s;|&].*|$)`), "")
        const cflag = [...prefix.matchAll(/-C\s+([^\s|;&]+)/g)].pop()?.[1]
        const cd = cmd.match(/^\s*cd\s+([^\s|;&]+)/)?.[1]
        let d = (cflag ?? cd ?? "").replace(/^["']|["']$/g, "")
        return d.startsWith("/") ? d : projectDir
      }

      // Run a git query in a target repo; empty string on any failure (fail-open).
      const git = async (dir: string, args: string): Promise<string> => {
        try {
          const r = await $`git -C ${dir} ${{ raw: args }}`.quiet().nothrow()
          return r.exitCode === 0 ? r.stdout.toString().trim() : ""
        } catch {
          return ""
        }
      }

      // Rule: never bypass hooks
      if (has(new RegExp(`${GIT_SUB}(commit|push)\\b[^|;&]*--no-verify`)))
        deny("--no-verify is not allowed — fix the underlying issue instead of bypassing hooks.")

      // Rule: never push to the main branch (incl. force push)
      if (has(new RegExp(`${GIT_SUB}push\\b[^|;&]*[\\s:]${mainBranch}(\\s|$)`)))
        deny(`pushing directly to '${mainBranch}' is not allowed — all changes go through feature branches and PRs.`)

      const isPush = has(new RegExp(`${GIT_SUB}push(\\s|$)`))

      // Rule: gates before remote — mid-pipeline, push is allowed only after the gates.
      if (isPush) {
        const state = readJson(join(projectDir, ".constellation", "state", "current-workflow.json"))
        const step: string = state?.currentStep ?? ""
        if (step && !["devops-pr", "ship", "post-pr"].includes(step))
          deny(`workflow in progress (step: ${step}) — push is allowed only after the gates pass (steps devops-pr/post-pr/ship). Finish the gates, or /constellation:abort.`)
      }

      // Rule: artifacts ship with the work — never push while harness artifacts sit uncommitted.
      if (isPush) {
        const targetDir = gitTargetDir("push")
        if (existsSync(join(targetDir, ".constellation", "config.json"))) {
          const dirty = await git(targetDir, "status --porcelain -uall -- .constellation")
          if (dirty)
            deny(`uncommitted .constellation artifacts exist — include them in the workflow commit (git add -A) or run .constellation/scripts/sync-artifacts.sh before pushing: ${dirty.split("\n").slice(0, 20).join(" ")}`)
        }
      }

      // Rule: never commit on the main branch (of the repo the commit actually targets)
      if (has(new RegExp(`${GIT_SUB}commit(\\s|$)`))) {
        const targetDir = gitTargetDir("commit")
        const branch = await git(targetDir, "branch --show-current")
        if (branch && branch === mainBranch)
          deny(`committing on '${mainBranch}' is not allowed — create a feature branch first (branching-strategy skill). For .constellation artifacts only, run .constellation/scripts/sync-artifacts.sh — the one sanctioned commit on ${mainBranch}.`)
      }

      // Rule: never stage secrets
      if (has(new RegExp(`${GIT_SUB}add(\\s|$)`))) {
        if (/\.env(\.[A-Za-z0-9_-]+)?\b/.test(cmd) && !/\.env\.(example|sample|template|test)\b/.test(cmd))
          deny("staging .env files is not allowed — secrets never enter version control.")
        if (/(id_rsa|id_ed25519|\.pem\b|credentials\.json|service-account.*\.json)/.test(cmd))
          deny("staging credential/key files is not allowed.")
        // Sweep staging (git add -A / --all / .) can pull in secrets without naming them.
        if (has(new RegExp(`${GIT_SUB}add\\b[^|;&]*(-[A-Za-z]*A|--all\\b|\\s\\.(\\s|$))`))) {
          const porcelain = await git(projectDir, "status --porcelain")
          const suspects = porcelain
            .split("\n")
            .map((l) => l.slice(3))
            .filter((f) => /(^|\/)\.env(\.[A-Za-z0-9_-]+)?$|id_rsa|id_ed25519|\.pem$|credentials\.json$|service-account.*\.json$/.test(f))
            .filter((f) => !/\.env\.(example|sample|template|test)$/.test(f))
          if (suspects.length)
            deny(`sweep-staging would include secret-pattern files: ${suspects.join(" ")} — stage files explicitly or gitignore them.`)
        }
      }
    },
  }
}
