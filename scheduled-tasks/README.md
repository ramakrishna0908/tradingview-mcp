# Scheduled tasks — the repo is the source of truth

Every recurring job this project owns lives in one of two stores on the Mac,
and neither is synced anywhere:

| Store | Where | What it holds |
|---|---|---|
| Claude desktop local tasks | `~/.claude/scheduled-tasks/<name>/SKILL.md` (or `$CLAUDE_CONFIG_DIR`) plus the app's internal registry | the prompt (SKILL.md); schedule, folder, model and enabled state (registry) |
| launchd report jobs | `~/Library/LaunchAgents/com.ramakrishna.tv*.plist` | the data-only report jobs that run before the posters |

Desktop app updates have wiped the registry before, and the sidebar only lists
tasks that are registered and Active. When that happens the folders are still on
disk but the tasks are gone from the menu and stop firing. This directory makes
the fix one command on any Mac.

## One-command restore

```bash
git pull
npm run tasks -- install
```

That copies every `scheduled-tasks/<name>/` folder into the Claude config dir
(backing up any local copy that differs), writes the launchd plists with the
paths rewritten to this checkout and this user, loads them, and prints a
registration prompt. **Paste that prompt into a Code-tab session on the Mac**:
Claude registers each task with its schedule from `manifest.json` (the
registry is only writable through the app). Then open **Scheduled** in the
sidebar and confirm every task shows Active.

Other commands:

```bash
npm run tasks -- status        # installed vs repo, launchd loaded or not
npm run tasks -- diff          # which installed SKILL.md files differ from the repo
npm run tasks -- prompt        # just the registration prompt
npm run tasks -- export        # capture the live folders + plists from this Mac into the repo
npm run tasks -- export --all  # also pull task folders the manifest does not know yet
```

Flags: `--dry-run`, `--no-launchd`, `--config-dir <dir>`, `--launch-agents <dir>`.

## Keep the repo current

The SKILL.md files here were written from the docs. The copies on the Mac that
has been running the jobs are the real ones, so on that machine run:

```bash
npm run tasks -- export
git diff scheduled-tasks scripts/*.plist   # review
git commit -am "Scheduled tasks: capture live prompts"
```

Do the same after editing a task's prompt in the app. `export --all` also
brings in the other task folders on the Mac (the gamesol404, globalrsc,
engagement tasks and so on) and adds them to the manifest with
`"schedule": null`; fill the schedule in before committing, or delete the entry
if the task belongs to another project.

## What is in the manifest

`manifest.json` lists each task's name, cron schedule (Mac local time, ET),
working folder (`.` = this repo), permission mode and the doc that describes
it, plus the launchd jobs and whether `install` loads them by default
(`com.ramakrishna.tvsocialauto` is API-mode only and is not).

Schedules not stated exactly in the docs were chosen as: scorecard Fridays
4:30 PM ET, explainer daily 7:00 PM ET (the latest engagement plan; the older
Tuesday/Friday 8 AM cadence is superseded).

## Limits

- Browser-mode posting needs the Chrome profile signed in as the X account, so
  these stay **local** tasks. They cannot be moved to cloud scheduled tasks.
- A local task only fires while the desktop app is open and the Mac is awake.
- The registry file's path and format are not documented, so `install` never
  writes it; registration goes through the app via the printed prompt.
