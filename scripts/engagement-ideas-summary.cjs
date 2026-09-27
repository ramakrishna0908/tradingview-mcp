#!/usr/bin/env node
// Rebuild docs/social/engagement/ideas-summary.md from ideas.jsonl + the newest stats CSV.
// Usage: node scripts/engagement-ideas-summary.cjs [stats.csv]
// Stats CSV columns: tk,d,close,chg5d,chg1m,vs20,vs50,vs200,rsi,offHigh,offLow,volRatio
// (produced by the Massive daily-bar query documented in the x-engagement-agent task). Educational tracking only.
const fs = require('fs'); const path = require('path');
const dir = path.join(__dirname, '..', 'docs', 'social', 'engagement');
const statsDir = path.join(dir, 'stats');
const statsFile = process.argv[2] || path.join(statsDir, fs.readdirSync(statsDir).filter(f => f.endsWith('.csv')).sort().pop());
const rows = fs.readFileSync(statsFile, 'utf8').trim().split('\n'); const hdr = rows.shift().split(',');
const stats = {}; for (const r of rows) { const o = {}; r.split(',').forEach((v, i) => o[hdr[i]] = i > 1 ? Number(v) : v); stats[o.tk] = o; }
const ideas = fs.readFileSync(path.join(dir, 'ideas.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
const cutoff = Date.now() - 30 * 86400e3;
const recent = ideas.filter(i => new Date(i.postedAt || i.at).getTime() >= cutoff);
const score = s => s === 'bullish' ? 1 : s === 'bearish' ? -1 : 0;
const byT = {};
for (const i of recent) { (byT[i.ticker] = byT[i.ticker] || []).push(i); }
const table = Object.entries(byT).map(([tk, list]) => {
  const creators = [...new Set(list.map(i => i.handle))];
  const net = list.reduce((a, i) => a + score(i.stance), 0);
  const first = list.map(i => i.postedAt || i.at.slice(0, 10)).sort()[0];
  // Each creator counts once per ticker, on their most recent stance; a creator who has posted both
  // bullish and bearish on the ticker is a stance change, not a conflict with themselves.
  const latest = {};
  for (const i of [...list].sort((a, b) => (a.postedAt || a.at.slice(0, 10)).localeCompare(b.postedAt || b.at.slice(0, 10)) || a.at.localeCompare(b.at))) latest[i.handle] = i.stance;
  const bull = creators.filter(h => latest[h] === 'bullish'); const bear = creators.filter(h => latest[h] === 'bearish');
  const flips = creators.filter(h => list.some(i => i.handle === h && i.stance === 'bullish') && list.some(i => i.handle === h && i.stance === 'bearish')).map(h => `${h} (now ${latest[h]})`);
  return { tk, creators, net, first, bull, bear, flips, list, s: stats[tk] };
}).sort((a, b) => b.creators.length - a.creators.length || b.net - a.net || a.tk.localeCompare(b.tk));
const f = (x, suf = '') => x === undefined || x === null || Number.isNaN(x) ? 'n/a' : x + suf;
const read = s => { if (!s) return 'no data yet'; const t = []; t.push(s.vs200 > 0 ? 'above 200d' : 'below 200d'); t.push(s.vs50 > 0 ? 'above 50d' : 'below 50d'); if (s.rsi >= 70) t.push('RSI overbought'); else if (s.rsi <= 30) t.push('RSI oversold'); if (s.offHigh > -5) t.push('near 52w high'); if (s.volRatio >= 1.3) t.push('volume expanding'); return t.join(', '); };
let md = `# Stock ideas aggregated from tracked X accounts\n\nRebuilt ${new Date().toISOString().slice(0, 16)}Z from ${recent.length} ideas (last 30 days) across ${new Set(recent.map(i => i.handle)).size} creators; market stats as of ${Object.values(stats)[0]?.d || 'n/a'} close (${path.basename(statsFile)}). Educational tracking of what creators are saying, not advice.\n\n`;
md += `## All tickers (ordered by number of distinct creators, then net stance)\n\n| Ticker | Creators | Net stance | First seen | Close | 5d % | 1m % | vs 20d | vs 50d | vs 200d | RSI14 | Off 52w high | Vol 5d/20d | Read |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const r of table) { const s = r.s || {}; md += `| ${r.tk} | ${r.creators.join(', ')} | ${r.net > 0 ? '+' : ''}${r.net} | ${r.first} | ${f(s.close)} | ${f(s.chg5d, '%')} | ${f(s.chg1m, '%')} | ${f(s.vs20, '%')} | ${f(s.vs50, '%')} | ${f(s.vs200, '%')} | ${f(s.rsi)} | ${f(s.offHigh, '%')} | ${f(s.volRatio)} | ${read(r.s)} |\n`; }
const consensus = table.filter(r => r.creators.length >= 2 && (r.bull.length >= 2 || r.bear.length >= 2) && !(r.bull.length && r.bear.length));
const conflicts = table.filter(r => r.bull.length && r.bear.length);
md += `\n## Consensus (2+ distinct creators on the same side, latest stance each)\n\n`; md += consensus.length ? consensus.map(r => `- **${r.tk}** ${r.bull.length >= 2 ? 'bullish' : 'bearish'}: ${(r.bull.length >= 2 ? r.bull : r.bear).join(', ')} — ${read(r.s)}`).join('\n') + '\n' : '- none yet\n';
md += `\n## Conflicts (different creators on opposite sides, latest stance each)\n\n`; md += conflicts.length ? conflicts.map(r => `- **${r.tk}**: bullish ${r.bull.join(', ')} vs bearish ${r.bear.join(', ')} — ${read(r.s)}`).join('\n') + '\n' : '- none\n';
const stanceChanges = table.filter(r => r.flips.length);
md += `\n## Stance changes (same creator on both sides)\n\n`; md += stanceChanges.length ? stanceChanges.map(r => `- **${r.tk}**: ${r.flips.join(', ')}`).join('\n') + '\n' : '- none\n';
md += `\n## Ideas by creator\n\n`;
const byH = {}; for (const i of recent) (byH[i.handle] = byH[i.handle] || []).push(i);
for (const [h, list] of Object.entries(byH).sort()) { md += `### @${h}\n`; for (const i of list) md += `- ${i.ticker} — ${i.stance} (${i.horizon || 'unknown'}), ${i.postedAt || i.at.slice(0, 10)}: ${i.reason} [post](${i.postUrl})${i.priceAtPost ? ` · price at post ${i.priceAtPost}` : ''}\n`; md += '\n'; }
md += `## Since-mentioned performance\n\nFilled in as prices accumulate: for each idea, % change from the close on the mention date to the latest close, sign-adjusted for stance (bearish ideas count a decline as positive). Requires priceAtPost on the idea record; ideas without it show n/a.\n\n| Creator | Ticker | Stance | Mentioned | Price at post | Latest | Sign-adjusted % |\n|---|---|---|---|---|---|---|\n`;
for (const i of recent) { const s = stats[i.ticker]; const p = i.priceAtPost; const pct = (p && s) ? ((s.close / p - 1) * 100 * (i.stance === 'bearish' ? -1 : 1)).toFixed(1) + '%' : 'n/a'; md += `| ${i.handle} | ${i.ticker} | ${i.stance} | ${i.postedAt || i.at.slice(0, 10)} | ${f(p)} | ${f(s && s.close)} | ${pct} |\n`; }
fs.writeFileSync(path.join(dir, 'ideas-summary.md'), md); console.log('wrote ideas-summary.md', table.length, 'tickers');
