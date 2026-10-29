#!/usr/bin/env node
/**
 * Scheduled-task restore / backup for this repo.
 *
 * The Claude desktop app keeps each local scheduled task as a folder
 *   $CLAUDE_CONFIG_DIR/scheduled-tasks/<name>/SKILL.md   (default ~/.claude)
 * plus an internal registry (schedule, folder, enabled state) that app updates
 * have been known to wipe. The report jobs are launchd plists under
 *   ~/Library/LaunchAgents/
 * Neither store is synced anywhere, so this script makes the repo the source of
 * truth: scheduled-tasks/manifest.json + scheduled-tasks/<name>/SKILL.md +
 * scripts/*.plist.
 *
 *   npm run tasks -- status            what is installed vs what the repo has
 *   npm run tasks -- install           copy task folders + launchd jobs into place
 *   npm run tasks -- export [--all]    capture the live task folders + plists back into the repo
 *   npm run tasks -- prompt            print the text to paste into a desktop session to re-register
 *   npm run tasks -- diff              show which installed SKILL.md files differ from the repo
 *
 * Flags: --dry-run  --no-launchd  --config-dir <dir>  --launch-agents <dir>  --all
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync, renameSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { homedir, platform, userInfo } from 'os';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(__dirname, '..');
// SCHEDULED_TASKS_REPO_ROOT lets the tests point every repo-side read/write at a scratch copy.
const REPO_ROOT = process.env.SCHEDULED_TASKS_REPO_ROOT || REPO;
const TASKS_DIR = join(REPO_ROOT, 'scheduled-tasks');
const MANIFEST_PATH = join(TASKS_DIR, 'manifest.json');

// ---------- arg parsing ----------
function parseArgs(argv) {
  const opts = { cmd: null, dryRun: false, launchd: true, all: false, configDir: null, launchAgents: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--no-launchd') opts.launchd = false;
    else if (a === '--all') opts.all = true;
    else if (a === '--config-dir') opts.configDir = argv[++i];
    else if (a === '--launch-agents') opts.launchAgents = argv[++i];
    else if (!a.startsWith('--') && !opts.cmd) opts.cmd = a;
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

// ---------- paths ----------
export function configDir(override) {
  return override || process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}
export function installedTasksDir(override) {
  return join(configDir(override), 'scheduled-tasks');
}
export function launchAgentsDir(override) {
  return override || join(homedir(), 'Library', 'LaunchAgents');
}

export function loadManifest(path = MANIFEST_PATH) {
  const m = JSON.parse(readFileSync(path, 'utf-8'));
  if (!Array.isArray(m.tasks)) throw new Error('manifest.tasks must be an array');
  for (const t of m.tasks) {
    if (!t.name || !/^[a-z0-9-]+$/.test(t.name)) throw new Error(`bad task name: ${JSON.stringify(t.name)}`);
  }
  m.launchd = m.launchd || [];
  return m;
}

// ---------- SKILL.md helpers ----------
export function parseSkill(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: text };
  const frontmatter = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) frontmatter[kv[1]] = kv[2].trim();
  }
  return { frontmatter, body: m[2] };
}

function readIfExists(p) {
  return existsSync(p) ? readFileSync(p, 'utf-8') : null;
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p).map((f) => join(entry, f)));
    else out.push(entry);
  }
  return out.sort();
}

function copyDir(src, dst, { dryRun, log }) {
  let changed = 0;
  for (const rel of filesUnder(src)) {
    const from = join(src, rel);
    const to = join(dst, rel);
    const before = readIfExists(to);
    const after = readFileSync(from, 'utf-8');
    if (before === after) continue;
    changed++;
    if (before !== null) {
      const bak = `${to}.bak-${stamp()}`;
      log(`  backup  ${to} -> ${basename(bak)}`);
      if (!dryRun) renameSync(to, bak);
    }
    log(`  write   ${to}`);
    if (!dryRun) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
  return changed;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

// ---------- launchd ----------
/** Rewrite the absolute paths baked into a plist so it points at THIS checkout and THIS user. */
export function relocatePlist(xml, repo = REPO, home = homedir()) {
  return xml
    .replace(/\/Users\/[^/<"]+\/(?:[^<"]*?\/)?tradingview-mcp(?=[/<"])/g, repo)
    .replace(/\/Users\/[^/<"]+(?=[/<"])/g, home);
}

function launchctl(args) {
  return execFileSync('launchctl', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function loadedLabels() {
  try {
    return new Set(launchctl(['list']).split('\n').map((l) => l.trim().split(/\s+/).pop()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function installPlist(job, opts, log) {
  const src = join(REPO_ROOT, job.plist);
  if (!existsSync(src)) {
    log(`  MISSING ${job.plist} — run \`npm run tasks -- export\` on the Mac that has it`);
    return false;
  }
  const dst = join(launchAgentsDir(opts.launchAgents), `${job.label}.plist`);
  const xml = relocatePlist(readFileSync(src, 'utf-8'));
  if (readIfExists(dst) !== xml) {
    log(`  write   ${dst}`);
    if (!opts.dryRun) {
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, xml);
    }
  }
  if (platform() !== 'darwin' || opts.dryRun) return true;
  const domain = `gui/${userInfo().uid}`;
  try { launchctl(['bootout', domain, dst]); } catch { /* not loaded yet */ }
  try {
    launchctl(['bootstrap', domain, dst]);
  } catch (e) {
    try { launchctl(['load', dst]); } catch (e2) {
      log(`  FAILED to load ${job.label}: ${(e2.stderr || e2.message).toString().trim()}`);
      return false;
    }
  }
  log(`  loaded  ${job.label}`);
  return true;
}

// ---------- the registration prompt ----------
export function registrationPrompt(manifest, repo = REPO) {
  const lines = [
    'Register these local scheduled tasks on this computer (create any that are missing, update the schedule of any that exist, leave the rest alone). Each one already has its SKILL.md under the scheduled-tasks folder of my Claude config dir, so use that file as the instructions and do not rewrite it. Working folder for every task: ' + repo + '. Schedules are cron in this computer\'s local time.',
    '',
  ];
  for (const t of manifest.tasks) {
    lines.push(`- ${t.name}: schedule \`${t.schedule}\` (${t.scheduleText}), permission mode ${t.permissionMode || 'auto'}${t.model ? `, model ${t.model}` : ''}`);
  }
  lines.push('', 'When done, list every scheduled task with its status so I can confirm all of the above are Active.');
  return lines.join('\n');
}

// ---------- commands ----------
function cmdStatus(manifest, opts, log) {
  const inst = installedTasksDir(opts.configDir);
  log(`Repo:            ${REPO}`);
  log(`Installed tasks: ${inst}`);
  log('');
  log('Claude desktop tasks');
  for (const t of manifest.tasks) {
    const repoSkill = readIfExists(join(TASKS_DIR, t.name, 'SKILL.md'));
    const liveSkill = readIfExists(join(inst, t.name, 'SKILL.md'));
    const state = !liveSkill ? 'NOT INSTALLED' : liveSkill === repoSkill ? 'installed' : 'installed (differs from repo)';
    log(`  ${t.name.padEnd(28)} ${t.scheduleText.padEnd(40)} ${state}`);
  }
  const extra = filesUnder(inst).map((f) => f.split('/')[0]).filter((d, i, a) => a.indexOf(d) === i && !manifest.tasks.some((t) => t.name === d));
  if (extra.length) log(`  (${extra.length} other task folders on this machine not in the manifest: ${extra.join(', ')})`);
  log('');
  log('launchd jobs');
  const loaded = platform() === 'darwin' ? loadedLabels() : null;
  for (const j of manifest.launchd) {
    const inRepo = existsSync(join(REPO_ROOT, j.plist));
    const state = loaded === null ? 'n/a (not macOS)' : loaded.has(j.label) ? 'loaded' : 'NOT LOADED';
    log(`  ${j.label.padEnd(34)} ${j.scheduleText.padEnd(50)} ${inRepo ? '' : 'plist MISSING from repo · '}${j.install ? state : 'optional, not auto-installed'}`);
  }
}

function cmdInstall(manifest, opts, log) {
  const inst = installedTasksDir(opts.configDir);
  log(`Installing task folders into ${inst}${opts.dryRun ? ' (dry run)' : ''}`);
  let changed = 0;
  for (const t of manifest.tasks) {
    const src = join(TASKS_DIR, t.name);
    if (!existsSync(join(src, 'SKILL.md'))) { log(`  MISSING scheduled-tasks/${t.name}/SKILL.md`); continue; }
    changed += copyDir(src, join(inst, t.name), { dryRun: opts.dryRun, log });
  }
  log(changed ? `  ${changed} file(s) written` : '  all task folders already up to date');
  if (opts.launchd) {
    log('');
    log(`Installing launchd jobs into ${launchAgentsDir(opts.launchAgents)}`);
    for (const j of manifest.launchd) {
      if (!j.install) { log(`  skip    ${j.label} (optional)`); continue; }
      installPlist(j, opts, log);
    }
  }
  log('');
  log('The desktop app only lists a task once it is registered. Open a Code-tab session on this Mac and paste:');
  log('');
  log(registrationPrompt(manifest));
}

function cmdExport(manifest, opts, log) {
  const inst = installedTasksDir(opts.configDir);
  if (!existsSync(inst)) throw new Error(`nothing to export: ${inst} does not exist`);
  const names = opts.all
    ? readdirSync(inst).filter((d) => statSync(join(inst, d)).isDirectory() && !d.startsWith('.'))
    : manifest.tasks.map((t) => t.name);
  log(`Exporting ${names.length} task folder(s) from ${inst} into scheduled-tasks/${opts.dryRun ? ' (dry run)' : ''}`);
  let changed = 0;
  let added = 0;
  for (const name of names) {
    const src = join(inst, name);
    if (!existsSync(join(src, 'SKILL.md'))) { log(`  skip    ${name} (no SKILL.md on this machine)`); continue; }
    changed += copyDir(src, join(TASKS_DIR, name), { dryRun: opts.dryRun, log });
    if (!manifest.tasks.some((t) => t.name === name)) {
      const fm = parseSkill(readFileSync(join(src, 'SKILL.md'), 'utf-8')).frontmatter;
      manifest.tasks.push({ name, schedule: null, scheduleText: 'FILL IN (schedule not stored in SKILL.md)', folder: '.', permissionMode: 'auto', description: fm.description || '' });
      added++;
      log(`  added   ${name} to manifest — fill in its schedule`);
    }
  }
  if (added && !opts.dryRun) writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  const la = launchAgentsDir(opts.launchAgents);
  log('');
  log(`Exporting launchd plists from ${la}`);
  for (const j of manifest.launchd) {
    const src = join(la, `${j.label}.plist`);
    const dst = join(REPO_ROOT, j.plist);
    if (!existsSync(src)) { log(`  skip    ${j.label} (not on this machine)`); continue; }
    const xml = readFileSync(src, 'utf-8');
    if (readIfExists(dst) === xml) continue;
    log(`  write   ${j.plist}`);
    if (!opts.dryRun) writeFileSync(dst, xml);
    changed++;
  }
  log(changed ? `  ${changed} file(s) updated — review with git diff, then commit` : '  repo already matches this machine');
}

function cmdDiff(manifest, opts, log) {
  const inst = installedTasksDir(opts.configDir);
  let n = 0;
  for (const t of manifest.tasks) {
    const a = readIfExists(join(TASKS_DIR, t.name, 'SKILL.md'));
    const b = readIfExists(join(inst, t.name, 'SKILL.md'));
    if (a === b) continue;
    n++;
    log(`${t.name}: ${b === null ? 'not installed' : a === null ? 'not in repo' : 'differs'}`);
    if (a !== null && b !== null) {
      try {
        log(execFileSync('diff', ['-u', join(TASKS_DIR, t.name, 'SKILL.md'), join(inst, t.name, 'SKILL.md')], { encoding: 'utf-8' }));
      } catch (e) { log(e.stdout || ''); }
    }
  }
  if (!n) log('installed SKILL.md files match the repo');
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const opts = parseArgs(argv);
  const manifest = loadManifest();
  switch (opts.cmd) {
    case 'status': return cmdStatus(manifest, opts, log);
    case 'install': return cmdInstall(manifest, opts, log);
    case 'export': return cmdExport(manifest, opts, log);
    case 'prompt': return log(registrationPrompt(manifest));
    case 'diff': return cmdDiff(manifest, opts, log);
    default:
      log('usage: npm run tasks -- <status|install|export|prompt|diff> [--dry-run] [--no-launchd] [--all] [--config-dir <dir>] [--launch-agents <dir>]');
      process.exitCode = opts.cmd ? 1 : 0;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exitCode = 1;
  }
}
