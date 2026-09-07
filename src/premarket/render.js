/**
 * Renderers for the premarket report: Markdown (for the task hand-off and
 * chat) and a self-contained dark-theme HTML page (opened in the browser,
 * mobile-safe — the tables scroll inside their own containers).
 */
import { fmtPct } from './bias.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function fmtLevel(q) {
  if (!q) return '—';
  if (q.unit === 'pct') return `${q.price.toFixed(3)}%`;
  if (q.price >= 1000) return q.price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return q.price.toFixed(2);
}

function fmtChange(q) {
  if (!q) return '—';
  if (q.unit === 'pct') { const bp = (q.change ?? 0) * 100; return `${bp >= 0 ? '+' : ''}${bp.toFixed(1)} bp`; }
  return fmtPct(q.changePct);
}

const SNAPSHOT_ORDER = ['es', 'nq', 'ym', 'rty', 'vix', 'us2y', 'us10y', 'us30y', 'dxy', 'wti', 'brent', 'gold', 'btc'];

function biasWord(r) {
  return `${r.bias === 'Bullish' ? '🟢' : r.bias === 'Bearish' ? '🔴' : '🟡'} ${r.bias.toUpperCase()}`;
}

// ─── Markdown ────────────────────────────────────────────────────────────────

export function renderMarkdown(r) {
  const L = [];
  L.push(`# Premarket Market Direction — ${r.sessionDate}`);
  L.push(`*Generated ${r.generatedAtEt} · data as of ${r.dataAsOfEt ?? '—'}*`);
  if (r.holiday) L.push(`\n> **${r.holiday.name}.** ${r.holiday.note}`);
  L.push(`\n## Bias: ${biasWord(r)} · Confidence ${r.confidence}/100`);
  L.push(`Composite ${r.composite >= 0 ? '+' : ''}${r.composite.toFixed(2)} (agreement ${Math.round((r.agreement ?? 0) * 100)}%)${r.penalties.length ? ` · confidence reduced for: ${r.penalties.join('; ')}` : ''}`);
  L.push(`\n### Main drivers`);
  for (const d of r.drivers) L.push(`- ${d.direction === 'supportive' ? '▲' : d.direction === 'headwind' ? '▼' : '•'} ${d.text}`);
  L.push(`\n### Overnight snapshot`);
  L.push(`| Instrument | Last | Change |`);
  L.push(`|---|---:|---:|`);
  for (const k of SNAPSHOT_ORDER) { const q = r.snapshot[k]; if (q) L.push(`| ${q.name} | ${fmtLevel(q)} | ${fmtChange(q)} |`); }
  L.push(`\n### Sectors`);
  L.push(`**Strength:** ${r.sectors.strength.map(s => `${s.name} (${fmtPct(s.changePct)}, 5d rel ${fmtPct(s.rel5d)})`).join(' · ') || '—'}`);
  L.push(`**Weakness:** ${r.sectors.weakness.map(s => `${s.name} (${fmtPct(s.changePct)}, 5d rel ${fmtPct(s.rel5d)})`).join(' · ') || '—'}`);
  L.push(`\n### Key levels`);
  for (const key of ['spy', 'qqq', 'es', 'nq']) {
    const l = r.levels[key]; if (!l) continue;
    L.push(`- **${l.name}** ${fmtLevel({ price: l.price })}: resistance ${l.resistance.map(x => `${x.value.toFixed(2)} (${x.label})`).join(', ') || '—'} · support ${l.support.map(x => `${x.value.toFixed(2)} (${x.label})`).join(', ') || '—'}`);
  }
  L.push(`\n### What investors should watch today`);
  for (const w of r.watch) L.push(`- ${w}`);
  L.push(`\n### Market-moving events (${r.sessionDate})`);
  if (!r.events.length) L.push(`No notable scheduled releases, large-cap earnings or overnight headlines identified.`);
  for (const e of r.events) {
    L.push(`- **${e.time}** · ${e.title} · impact **${e.impact}**${e.forecast ? ` · forecast ${e.forecast}${e.previous ? ` (prev ${e.previous})` : ''}` : ''}${e.source ? ` · ${e.source}` : ''}`);
    L.push(`  - Expected: ${e.expected}`);
    if (e.flip) L.push(`  - Flips the bias if: ${e.flip}`);
  }
  if (r.laterWeek.length) L.push(`\n**Later this week:** ${r.laterWeek.map(e => `${e.title} (${e.date} ${e.time})`).join('; ')}`);
  if (Object.keys(r.missing).length) L.push(`\n*Missing inputs this run: ${Object.values(r.missing).join('; ')}*`);
  L.push(`\n---\n*${r.methodology}*`);
  L.push(`\n**${r.disclaimer}**`);
  return L.join('\n') + '\n';
}

// ─── HTML ────────────────────────────────────────────────────────────────────

const CSS = `
:root{--bg:#0f1115;--card:#171a21;--line:#262b36;--fg:#e8eaf0;--muted:#9aa3b2;--green:#22c55e;--red:#ef4444;--amber:#f59e0b;--blue:#60a5fa}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
main{max-width:920px;margin:0 auto;padding:20px 16px 48px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:26px 0 10px;color:var(--fg)}
.stamp{color:var(--muted);font-size:13px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-top:14px}
.bias{display:flex;flex-wrap:wrap;align-items:center;gap:14px}.pill{font-weight:700;font-size:20px;padding:6px 14px;border-radius:999px;border:2px solid}
.Bullish{color:var(--green);border-color:var(--green)}.Bearish{color:var(--red);border-color:var(--red)}.Neutral{color:var(--amber);border-color:var(--amber)}
.conf{font-size:15px;color:var(--muted)}.bar{height:8px;background:var(--line);border-radius:4px;overflow:hidden;width:180px}.bar>i{display:block;height:100%;background:var(--blue)}
ul{padding-left:20px;margin:6px 0}li{margin:4px 0}.up{color:var(--green)}.down{color:var(--red)}.flat{color:var(--muted)}
.tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.ev{border-left:3px solid var(--line);padding:6px 10px;margin:8px 0}.ev.High{border-color:var(--red)}.ev.Medium{border-color:var(--amber)}.ev.Low{border-color:var(--muted)}
.ev b{font-size:14px}.ev .meta{color:var(--muted);font-size:13px}.ev p{margin:3px 0;font-size:14px}.note{background:#2a2410;border:1px solid #5b4a12;color:#fde68a;padding:10px 12px;border-radius:10px;margin-top:12px}
.foot{color:var(--muted);font-size:12px;margin-top:28px}.disc{font-weight:700;color:var(--fg);margin-top:10px}.tag{display:inline-block;font-size:11px;padding:1px 6px;border-radius:6px;background:var(--line);color:var(--muted);margin-left:6px}
`;

export function renderHtml(r) {
  const cls = v => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
  const snap = SNAPSHOT_ORDER.map(k => r.snapshot[k]).filter(Boolean).map(q => `<tr><td>${esc(q.name)}<span class="tag">${esc(q.symbol)}</span></td><td class="n">${esc(fmtLevel(q))}</td><td class="n ${cls(q.change ?? 0)}">${esc(fmtChange(q))}</td></tr>`).join('');
  const sect = r.sectors.ranked.map(s => `<tr><td>${esc(s.name)}<span class="tag">${esc(s.symbol)}</span></td><td class="n">${s.price.toFixed(2)}</td><td class="n ${cls(s.changePct)}">${esc(fmtPct(s.changePct))}</td><td class="n ${cls(s.rel5d ?? 0)}">${esc(fmtPct(s.rel5d))}</td><td>${s.aboveSma20 == null ? '—' : s.aboveSma20 ? '<span class="up">above</span>' : '<span class="down">below</span>'}</td></tr>`).join('');
  const levels = ['spy', 'qqq', 'es', 'nq'].map(k => r.levels[k]).filter(Boolean).map(l => `<tr><td>${esc(l.name)}</td><td class="n">${esc(fmtLevel({ price: l.price }))}</td><td>${l.resistance.map(x => `${x.value.toFixed(2)} <span class="tag">${esc(x.label)}</span>`).join('<br>') || '—'}</td><td>${l.support.map(x => `${x.value.toFixed(2)} <span class="tag">${esc(x.label)}</span>`).join('<br>') || '—'}</td></tr>`).join('');
  const events = r.events.length ? r.events.map(e => `<div class="ev ${esc(e.impact)}"><b>${esc(e.time)} · ${esc(e.title)}</b><span class="tag">${esc(e.impact)} impact</span>${e.source ? `<span class="tag">${esc(e.source)}</span>` : ''}${e.forecast ? `<div class="meta">forecast ${esc(e.forecast)}${e.previous ? ` · previous ${esc(e.previous)}` : ''}</div>` : ''}<p><b>Expected:</b> ${esc(e.expected)}</p>${e.flip ? `<p><b>Flips the bias if:</b> ${esc(e.flip)}</p>` : ''}</div>`).join('') : '<p class="stamp">No notable scheduled releases, large-cap earnings or overnight headlines identified.</p>';
  const drivers = r.drivers.map(d => `<li class="${d.direction === 'supportive' ? 'up' : d.direction === 'headwind' ? 'down' : 'flat'}">${d.direction === 'supportive' ? '▲' : d.direction === 'headwind' ? '▼' : '•'} <span style="color:var(--fg)">${esc(d.text)}</span></li>`).join('');
  const comps = r.components.map(c => `<tr><td>${esc(c.key)}</td><td class="n">${c.weight}</td><td class="n ${cls(c.score)}">${c.score >= 0 ? '+' : ''}${c.score.toFixed(2)}</td><td>${esc(c.text)}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Premarket Market Direction — ${esc(r.sessionDate)}</title><style>${CSS}</style></head><body><main>
<h1>Premarket Market Direction — ${esc(r.sessionDate)}</h1>
<div class="stamp">Generated ${esc(r.generatedAtEt)} · data as of ${esc(r.dataAsOfEt ?? '—')} · before the 9:30 AM ET open</div>
${r.holiday ? `<div class="note"><b>${esc(r.holiday.name)}.</b> ${esc(r.holiday.note)}</div>` : ''}
<div class="card"><div class="bias"><span class="pill ${esc(r.bias)}">${esc(r.bias.toUpperCase())}</span><div><div class="conf">Confidence <b style="color:var(--fg)">${r.confidence}/100</b> · composite ${r.composite >= 0 ? '+' : ''}${r.composite.toFixed(2)} · agreement ${Math.round((r.agreement ?? 0) * 100)}%</div><div class="bar"><i style="width:${r.confidence}%"></i></div>${r.penalties.length ? `<div class="conf">Reduced for: ${esc(r.penalties.join('; '))}</div>` : ''}</div></div>
<h2>Main drivers</h2><ul>${drivers}</ul></div>
<h2>Overnight snapshot</h2><div class="card tbl"><table><thead><tr><th>Instrument</th><th class="n">Last</th><th class="n">Change</th></tr></thead><tbody>${snap}</tbody></table></div>
<h2>Sectors — strength &amp; weakness</h2><div class="card"><p><b class="up">Strength:</b> ${esc(r.sectors.strength.map(s => s.name).join(', ') || '—')} &nbsp;·&nbsp; <b class="down">Weakness:</b> ${esc(r.sectors.weakness.map(s => s.name).join(', ') || '—')}</p><div class="tbl"><table><thead><tr><th>Sector</th><th class="n">Last</th><th class="n">1d</th><th class="n">5d vs SPY</th><th>20-day avg</th></tr></thead><tbody>${sect}</tbody></table></div></div>
<h2>Key support / resistance</h2><div class="card tbl"><table><thead><tr><th>Instrument</th><th class="n">Price</th><th>Resistance</th><th>Support</th></tr></thead><tbody>${levels}</tbody></table></div>
<h2>What investors should watch today</h2><div class="card"><ul>${r.watch.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>
<h2>Market-moving events — ${esc(r.sessionDate)}</h2><div class="card">${events}${r.laterWeek.length ? `<p class="stamp"><b>Later this week:</b> ${esc(r.laterWeek.map(e => `${e.title} (${e.date} ${e.time})`).join('; '))}</p>` : ''}</div>
<h2>How the bias was scored</h2><div class="card tbl"><table><thead><tr><th>Input</th><th class="n">Weight</th><th class="n">Score</th><th>Reading</th></tr></thead><tbody>${comps}</tbody></table><p class="stamp">${esc(r.methodology)}</p>${Object.keys(r.missing).length ? `<p class="stamp">Missing inputs this run: ${esc(Object.values(r.missing).join('; '))}</p>` : ''}</div>
<div class="foot">Sources: ${esc(Object.entries(r.sources).map(([k, v]) => `${k}: ${v}`).join(' · '))}<div class="disc">${esc(r.disclaimer)}</div></div>
</main></body></html>
`;
}
