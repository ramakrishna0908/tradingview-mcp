/**
 * scheduled-tasks: manifest ↔ folder consistency, SKILL.md frontmatter, the
 * install/export round trip into scratch directories, plist relocation and
 * the registration prompt. No launchd, no TradingView.
 *
 * Run: node --test tests/scheduled-tasks.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync, cpSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const SCRIPT = join(REPO, 'scripts', 'scheduled-tasks.js');
const TASKS_DIR = join(REPO, 'scheduled-tasks');

const { loadManifest, parseSkill, relocatePlist, registrationPrompt } = await import(SCRIPT);

function run(args, env = {}) {
  return execFileSync('node', [SCRIPT, ...args], { encoding: 'utf-8', env: { ...process.env, ...env } });
}

describe('manifest and task folders', () => {
  const manifest = loadManifest();

  it('every manifest task has a folder with a SKILL.md whose name matches', () => {
    for (const t of manifest.tasks) {
      const p = join(TASKS_DIR, t.name, 'SKILL.md');
      assert.ok(existsSync(p), `${t.name}: missing ${p}`);
      const { frontmatter, body } = parseSkill(readFileSync(p, 'utf-8'));
      assert.equal(frontmatter.name, t.name, `${t.name}: frontmatter name mismatch`);
      assert.ok(frontmatter.description && frontmatter.description.length > 20, `${t.name}: description missing`);
      assert.ok(body.trim().length > 100, `${t.name}: prompt body too short`);
    }
  });

  it('every task folder in the repo is listed in the manifest', () => {
    const folders = readdirSync(TASKS_DIR).filter((d) => statSync(join(TASKS_DIR, d)).isDirectory());
    for (const d of folders) assert.ok(manifest.tasks.some((t) => t.name === d), `${d} is not in manifest.json`);
  });

  it('schedules are 5-field cron and names are unique', () => {
    const seen = new Set();
    for (const t of manifest.tasks) {
      assert.ok(!seen.has(t.name), `duplicate task ${t.name}`);
      seen.add(t.name);
      assert.match(t.schedule, /^(\S+\s+){4}\S+$/, `${t.name}: schedule "${t.schedule}" is not 5-field cron`);
      assert.ok(t.scheduleText, `${t.name}: scheduleText missing`);
    }
  });

  it('every launchd job that installs by default has its plist in the repo', () => {
    for (const j of manifest.launchd.filter((j) => j.install)) {
      // tvcryptoreport is known-missing until `export` runs on the Mac; everything else must exist.
      if (j.label === 'com.ramakrishna.tvcryptoreport') continue;
      assert.ok(existsSync(join(REPO, j.plist)), `${j.label}: ${j.plist} missing`);
    }
  });

  it('shell scripts no longer hardcode a home directory', () => {
    for (const f of ['premarket-report.sh', 'daily-report.sh', 'crypto-report.sh', 'social-auto.sh', 'crypto-social-auto.sh']) {
      const s = readFileSync(join(REPO, 'scripts', f), 'utf-8');
      assert.ok(!/\/Users\/[a-z0-9]+\//.test(s), `${f} still contains a /Users/<name>/ path`);
      assert.match(s, /REPO="\$\(cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\." && pwd\)"/, `${f}: REPO is not derived from the script location`);
    }
  });
});

describe('plist relocation', () => {
  it('rewrites the baked-in repo and home paths', () => {
    const xml = '<string>/Users/ramakrishna0908/MyProjects/trading/tradingview-mcp/scripts/x.sh</string><string>/Users/ramakrishna0908/.local/bin</string>';
    const out = relocatePlist(xml, '/srv/tv', '/home/me');
    assert.equal(out, '<string>/srv/tv/scripts/x.sh</string><string>/home/me/.local/bin</string>');
  });
  it('is idempotent on an already relocated plist', () => {
    const xml = '<string>/srv/tv/scripts/x.sh</string>';
    assert.equal(relocatePlist(xml, '/srv/tv', '/home/me'), xml);
  });
});

describe('install / export round trip', () => {
  let cfg, la, repoRoot, repoTasks;
  before(() => {
    const base = mkdtempSync(join(tmpdir(), 'tvtasks-'));
    cfg = join(base, 'cfg');
    la = join(base, 'LaunchAgents');
    // a scratch copy of the repo-side files so export never touches the real checkout
    repoRoot = join(base, 'repo');
    repoTasks = join(repoRoot, 'scheduled-tasks');
    cpSync(TASKS_DIR, repoTasks, { recursive: true });
    mkdirSync(join(repoRoot, 'scripts'));
    for (const f of readdirSync(join(REPO, 'scripts')).filter((f) => f.endsWith('.plist'))) cpSync(join(REPO, 'scripts', f), join(repoRoot, 'scripts', f));
  });

  it('install copies every task folder and relocates the plists', () => {
    const out = run(['install', '--config-dir', cfg, '--launch-agents', la, '--dry-run']);
    assert.match(out, /dry run/);
    assert.ok(!existsSync(join(cfg, 'scheduled-tasks')), 'dry run must not write');

    run(['install', '--config-dir', cfg, '--launch-agents', la]);
    const manifest = loadManifest();
    for (const t of manifest.tasks) {
      assert.equal(
        readFileSync(join(cfg, 'scheduled-tasks', t.name, 'SKILL.md'), 'utf-8'),
        readFileSync(join(TASKS_DIR, t.name, 'SKILL.md'), 'utf-8'),
      );
    }
    const plist = readFileSync(join(la, 'com.ramakrishna.tvpremarket.plist'), 'utf-8');
    assert.ok(plist.includes(join(REPO, 'scripts', 'premarket-report.sh')), 'plist should point at this checkout');
    assert.ok(!plist.includes('/Users/ramakrishna0908'), 'plist should not keep the original home path');
    assert.ok(!existsSync(join(la, 'com.ramakrishna.tvsocialauto.plist')), 'optional job must not be installed');
  });

  it('a second install is a no-op and status reports installed', () => {
    const out = run(['install', '--config-dir', cfg, '--no-launchd']);
    assert.match(out, /already up to date/);
    const status = run(['status', '--config-dir', cfg]);
    assert.ok(!/NOT INSTALLED/.test(status), status);
  });

  it('install backs up a locally edited SKILL.md before overwriting it', () => {
    const live = join(cfg, 'scheduled-tasks', 'post-weekly-scorecard', 'SKILL.md');
    writeFileSync(live, readFileSync(live, 'utf-8') + '\nlocal edit\n');
    const out = run(['install', '--config-dir', cfg, '--no-launchd']);
    assert.match(out, /backup/);
    const backups = readdirSync(dirname(live)).filter((f) => f.startsWith('SKILL.md.bak-'));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(live, 'utf-8'), readFileSync(join(TASKS_DIR, 'post-weekly-scorecard', 'SKILL.md'), 'utf-8'));
  });

  it('export captures live edits and, with --all, adds unknown tasks to the manifest', () => {
    const live = join(cfg, 'scheduled-tasks', 'post-weekly-scorecard', 'SKILL.md');
    writeFileSync(live, readFileSync(live, 'utf-8') + '\nedited on the Mac\n');
    mkdirSync(join(cfg, 'scheduled-tasks', 'some-other-task'), { recursive: true });
    writeFileSync(join(cfg, 'scheduled-tasks', 'some-other-task', 'SKILL.md'), '---\nname: some-other-task\ndescription: An unrelated task that lives on this Mac only.\n---\n\nDo the thing.\n');

    const env = { SCHEDULED_TASKS_REPO_ROOT: repoRoot };
    run(['export', '--config-dir', cfg, '--launch-agents', la], env);
    assert.match(readFileSync(join(repoTasks, 'post-weekly-scorecard', 'SKILL.md'), 'utf-8'), /edited on the Mac/);
    assert.ok(!existsSync(join(repoTasks, 'some-other-task')), 'without --all only manifest tasks are exported');

    run(['export', '--all', '--config-dir', cfg, '--launch-agents', la], env);
    assert.ok(existsSync(join(repoTasks, 'some-other-task', 'SKILL.md')));
    const m = JSON.parse(readFileSync(join(repoTasks, 'manifest.json'), 'utf-8'));
    const added = m.tasks.find((t) => t.name === 'some-other-task');
    assert.ok(added, 'exported task must be added to the manifest');
    assert.equal(added.schedule, null);
    assert.match(added.description, /unrelated task/);

    // plists exported from the (relocated) LaunchAgents copy land in the scratch repo only
    assert.ok(readFileSync(join(repoRoot, 'scripts', 'com.ramakrishna.tvpremarket.plist'), 'utf-8').includes(REPO));
    assert.ok(readFileSync(join(REPO, 'scripts', 'com.ramakrishna.tvpremarket.plist'), 'utf-8').includes('/Users/ramakrishna0908'));

    // the real repo copy is untouched
    assert.ok(!existsSync(join(TASKS_DIR, 'some-other-task')));
    assert.ok(!/edited on the Mac/.test(readFileSync(join(TASKS_DIR, 'post-weekly-scorecard', 'SKILL.md'), 'utf-8')));
  });

  it('diff lists the tasks whose installed copy differs', () => {
    const out = run(['diff', '--config-dir', cfg]);
    assert.match(out, /post-weekly-scorecard: differs/);
    assert.match(out, /edited on the Mac/);
  });
});

describe('registration prompt', () => {
  it('names every task with its cron and the working folder', () => {
    const manifest = loadManifest();
    const p = registrationPrompt(manifest, '/srv/tv');
    assert.ok(p.includes('/srv/tv'));
    for (const t of manifest.tasks) assert.ok(p.includes(`- ${t.name}: schedule \`${t.schedule}\``), `prompt missing ${t.name}`);
    assert.equal(run(['prompt']).trim(), registrationPrompt(manifest).trim());
  });
});
