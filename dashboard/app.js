/* PostHog Engineering Contribution dashboard.
   100% client-side: one JSON payload in, all re-weighting done in the browser.
   No network calls at runtime. Charts: Recharts (vendored locally). */

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const AVFB = "this.replaceWith(Object.assign(document.createElement('span'),{className:this.className+' fb',textContent:this.alt||'?'}))";
const n0 = v => Number(v ?? 0).toLocaleString('en-US');
const n1 = v => Number(v ?? 0).toFixed(1);
const pct = v => (v == null ? '—' : Math.round(v * 100) + '%');
const hrs = v => (v == null ? '—' : n1(v) + 'h');
const shortLabel = (l, key) => key ? key[0].toUpperCase() + key.slice(1) : l.split(' ')[0].replace('&', '');

const state = { data: null, dims: [], weights: {}, sel: null, hi: null, baseline: {} };
let radarRoot = null;

/* ── scoring ───────────────────────────────────────────────── */
function contributions(eng, weights) {
  const tot = state.dims.reduce((s, d) => s + (weights[d.key] || 0), 0);
  const parts = state.dims.map(d => {
    const w = weights[d.key] || 0, norm = eng.norm[d.key] ?? 0;
    return { d, w, norm, raw: eng.raw?.[d.key], share: tot ? (w * norm) / tot : 0 };
  });
  return { parts, total: tot ? parts.reduce((s, p) => s + p.share, 0) : 0, wsum: tot };
}
const score = (eng, w) => contributions(eng, w).total;
const ranked = w => state.data.engineers.map(e => ({ e, s: score(e, w) }))
  .sort((a, b) => b.s - a.s || a.e.login.localeCompare(b.e.login));

/* ── tooltip ───────────────────────────────────────────────── */
const tip = $('#tip');
document.addEventListener('mousemove', ev => {
  const host = ev.target.closest('[data-tip]');
  if (!host) { tip.hidden = true; return; }
  if (tip.dataset.for !== host.dataset.tipId || tip.hidden) {
    tip.innerHTML = host.dataset.tip; tip.dataset.for = host.dataset.tipId || ''; tip.hidden = false;
  }
  const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
  tip.style.left = Math.max(8, x) + 'px'; tip.style.top = Math.max(8, y) + 'px';
});
const tipAttr = html => `data-tip="${esc(html)}" data-tip-id="${Math.random().toString(36).slice(2)}"`;

const dimTip = (d, p, eng) => `<h4>${esc(d.label)}</h4>${esc(d.blurb)}
  <span class="f">${esc(d.formula)}</span>
  <div class="kv"><span>Percentile in cohort</span><b>${n1(p.norm)}</b></div>
  <div class="kv"><span>Raw value</span><b>${p.raw == null ? '—' : n1(p.raw)}</b></div>
  <div class="kv"><span>Weight</span><b>${p.w} / 5</b></div>
  <div class="kv"><span>Adds to score</span><b>${n1(p.share)}</b></div>
  <div class="note">${esc(eng.login)} sits ahead of ${Math.round(p.norm)}% of the ${n0(state.data.meta.eligible_engineers)} eligible engineers here.</div>`;

const scoreTip = (e, parts, total, wsum) => `<h4>${esc(state.data.meta.score_name)} = ${n1(total)}</h4>
  A weighted mean of seven percentile ranks — not a count of anything.
  <span class="f">${parts.filter(p => p.w).map(p => `${p.w} × ${n1(p.norm)}`).join('\n+ ')}\n÷ ${wsum}  =  ${n1(total)}</span>
  <div class="note">Percentile 80 means "ahead of 80% of eligible engineers on that dimension". Every row of the table below is hoverable, and the PRs behind the claims are linked at the bottom.</div>`;

/* ── header ────────────────────────────────────────────────── */
function renderHeader() {
  $('#weightsLabel').textContent = activePreset() || 'Custom';
}

/* ── controls ──────────────────────────────────────────────── */
function activePreset() {
  for (const [name, w] of Object.entries(state.data.presets || {}))
    if (state.dims.every(d => (w[d.key] || 0) === state.weights[d.key])) return name;
  return null;
}
function renderPresets() {
  const cur = activePreset();
  $('#presets').innerHTML = Object.keys(state.data.presets || {}).map(name => {
    const w = state.data.presets[name];
    const body = state.dims.map(d => `<div class="kv"><span>${esc(d.label)}</span><b>${w[d.key] || 0}</b></div>`).join('');
    return `<button class="preset${name === cur ? ' on' : ''}" data-preset="${esc(name)}"
      ${tipAttr(`<h4>${esc(name)}</h4>Sets all seven weights at once.${body}`)}>${esc(name)}</button>`;
  }).join('');
}
function renderSliders() {
  $('#sliders').innerHTML = state.dims.map(d => {
    const w = state.weights[d.key];
    return `<label class="sl${w === 0 ? ' off' : ''}" style="--dc:var(--d-${d.key})">
      <span class="sl-top">
        <span class="sl-label" ${tipAttr(`<h4>${esc(d.label)}</h4>${esc(d.blurb)}<span class="f">${esc(d.formula)}</span><div class="note">0 drops this dimension out of the score entirely.</div>`)}>
          <i class="swatch" style="background:var(--d-${d.key})"></i>${esc(d.label)}
        </span><span class="sl-w">${w}</span>
      </span>
      <input type="range" min="0" max="5" step="1" value="${w}" data-dim="${d.key}" aria-label="${esc(d.label)} weight">
    </label>`;
  }).join('');
}

/* ── leaderboard ───────────────────────────────────────────── */
function cardHTML(row, i) {
  const { e, s } = row, { parts, total, wsum } = contributions(e, state.weights);
  const base = state.baseline[e.login], delta = base ? base - (i + 1) : 0;
  return `<article class="card${state.sel === e.login ? ' sel' : ''}" data-login="${esc(e.login)}">
    <div class="rank">${i + 1}</div>
    <img class="avatar" src="${esc(e.avatar)}" alt="${esc(e.login[0].toUpperCase())}" loading="lazy" onerror="${esc(AVFB)}">
    <div class="who">
      <div class="who-top">
        <span class="login">${esc(e.login)}</span>
        ${e.archetype ? `<span class="arch" ${tipAttr(`<h4>${esc(e.archetype)}</h4>A shape-of-contribution label taken from the dimensions they lead on. Descriptive only — it does not affect the score or the rank.`)}>${esc(e.archetype)}</span>` : ''}
        ${delta ? `<span class="delta ${delta > 0 ? 'up' : 'down'}" ${tipAttr(`<h4>Rank change</h4>#${base} under the default Balanced weighting, #${i + 1} under the current one.`)}>${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}</span>` : ''}
      </div>
      <ul class="why" ${tipAttr(`<h4>Why ${esc(e.login)}</h4>${(e.why || []).map(w => '— ' + esc(w)).join('<br>')}<div class="note">Every figure quoted here is in the evidence panel on the right.</div>`)}>
        ${(e.why || []).slice(0, 2).map(w => `<li>${esc(w)}</li>`).join('')}</ul>
    </div>
    <div class="score">
      <div class="score-v" ${tipAttr(scoreTip(e, parts, total, wsum))}>${n1(s)}</div>
      <div class="score-l">score ⓘ</div>
    </div>
  </article>`;
}

function renderCards(rows) {
  const host = $('#cards');
  const before = new Map([...host.children].map(c => [c.dataset.login, c.getBoundingClientRect().top]));
  host.innerHTML = rows.slice(0, 5).map(cardHTML).join('');
  for (const c of host.children) {                        // FLIP so the re-sort is readable
    const y = before.get(c.dataset.login); if (y == null) continue;
    const dy = y - c.getBoundingClientRect().top; if (!dy) continue;
    c.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
      { duration: 280, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }
  const RUNNERS = 8, rest = rows.slice(5, 5 + RUNNERS), hidden = Math.max(0, rows.length - 5 - RUNNERS);
  $('#runners').innerHTML = rest.length
    ? '<span class="lbl">next up</span>' + rest.map((r, i) => `<button class="runner${state.sel === r.e.login ? ' sel' : ''}" data-login="${esc(r.e.login)}"
        ${tipAttr(`<h4>#${i + 6} ${esc(r.e.login)}</h4>Outside the top five under the current weighting. Click to inspect — or raise the weight on what they are strong at and watch them move.`)}>
        <img src="${esc(r.e.avatar)}" alt="${esc(r.e.login[0].toUpperCase())}" onerror="${esc(AVFB)}"> ${esc(r.e.login)} <b>${n1(r.s)}</b></button>`).join('')
      + (hidden ? `<span class="lbl">+${n0(hidden)} more</span>` : '')
    : '';
  const wsum = state.dims.reduce((s, d) => s + state.weights[d.key], 0);
  $('#rankNote').textContent = wsum === 0 ? 'every weight is 0 — raise one to rank'
    : `${n0(state.data.engineers.length)} shown of ${n0(state.data.meta.eligible_engineers)} eligible`;
}

/* ── radar (Recharts) ──────────────────────────────────────── */
function renderRadar(eng) {
  const R = window.Recharts, h = React.createElement;
  const data = state.dims.map(d => ({
    key: d.key, label: shortLabel(d.label, d.key), pctl: +(eng.norm[d.key] ?? 0).toFixed(1), median: 50
  }));
  radarRoot.render(
    h(R.ResponsiveContainer, { width: '100%', height: '100%' },
      h(R.RadarChart, { data, outerRadius: '70%', margin: { top: 8, right: 8, bottom: 8, left: 8 } },
        h(R.PolarGrid, { stroke: '#232936' }),
        h(R.PolarAngleAxis, { dataKey: 'label', tick: { fill: '#8792a6', fontSize: 9.5 } }),
        h(R.PolarRadiusAxis, { domain: [0, 100], tick: false, axisLine: false }),
        h(R.Radar, { name: 'cohort median', dataKey: 'median', stroke: '#3a4354', strokeDasharray: '3 3', fill: 'none', isAnimationActive: false }),
        h(R.Radar, { name: 'percentile', dataKey: 'pctl', stroke: '#5b9dff', fill: '#5b9dff', fillOpacity: .3, isAnimationActive: false }),
        h(R.Tooltip, {
          contentStyle: { background: '#0b0e14', border: '1px solid #2b3242', borderRadius: 9, fontSize: 11.5, color: '#e8ecf4' },
          labelStyle: { color: '#fff', fontWeight: 700 },
          formatter: (v, n) => [n === 'percentile' ? `${v} pctl` : `${v} pctl`, n]
        })
      )
    )
  );
}

/* ── detail panel ──────────────────────────────────────────── */
const STAT_TIPS = {
  merged_prs: 'Merged PRs where this engineer is the DRI — the assignee if one is set, otherwise the author.',
  feat_prs: 'Merged PRs whose conventional-commit type is feat.',
  fix_prs: 'Merged PRs typed fix.', perf_prs: 'Merged PRs typed perf.',
  chore_prs: 'Merged PRs typed chore. Counted, but weighted far below feature and fix work.',
  reviews_given: 'Human reviews they submitted. Bot reviews and self-reviews are excluded.',
  distinct_authors_unblocked: 'How many different engineers they reviewed for. Review Leverage uses the geometric mean of this and review volume, so reviewing many people beats reviewing one person often.',
  median_review_latency_h: 'Median hours from a PR opening to their first review. Faster than the cohort median lifts Review Leverage; slower discounts it.',
  median_cycle_time_h: 'Median hours from their own PR opening to merge. Context, not scored.',
  review_followup_rate: 'Share of their reviews followed by new commits on that PR — review that changed the code, rather than a rubber stamp.',
  churn_rate: 'Share of their features followed within 14 days by a fix in the same area. A proxy for rework, not proof of a regression.',
  median_churn_rate: 'The cohort median rework rate, for comparison.',
  Q: 'Churn-quality factor, clamped to [0.5, 1.5]: 1 + median churn − their churn − 0.15 × reverts. It scales Reliability and Agent Leverage, so volume only counts when the work held up.',
  reverts: 'Merged PRs of theirs that were later reverted. The hard quality signal, as opposed to the churn proxy.',
  agent_assisted_prs: 'PRs where an agent helped but a human was driving.',
  agent_autonomous_prs: 'Fully autonomous agent PRs with this engineer as DRI. These carry half weight.',
  agent_share: 'Share of their merged PRs that involved an agent.',
  median_pr_lines: 'Median lines changed across their PRs. Shown for context — deliberately not scored.'
};
const statRow = (k, label, val, cls) => `<div class="st" ${tipAttr(`<h4>${esc(label)}</h4>${esc(STAT_TIPS[k] || '')}`)}>
  <span class="k">${esc(label)}</span><span class="v ${cls || ''}">${val}</span></div>`;

function renderDetail() {
  const e = state.data.engineers.find(x => x.login === state.sel) || state.data.engineers[0];
  const rows = ranked(state.weights);
  const rank = rows.findIndex(r => r.e.login === e.login) + 1;
  const { parts, total, wsum } = contributions(e, state.weights);
  const s = e.stats || {};

  $('#insHd').innerHTML = `<div class="ins-hd">
    <img src="${esc(e.avatar)}" alt="${esc(e.login[0].toUpperCase())}" onerror="${esc(AVFB)}">
    <div>
      <div class="n"><a href="${esc(e.profile)}" target="_blank" rel="noopener">${esc(e.login)}</a></div>
      <div class="muted small">#${rank} of ${rows.length} · ${esc(e.archetype || '—')}</div>
    </div>
    <div class="s" ${tipAttr(scoreTip(e, parts, total, wsum))}>
      <b>${n1(total)}</b> <span class="info">ⓘ</span><div class="hint">${esc(state.data.meta.score_name)}</div>
    </div></div>`;

  renderRadar(e);

  $('#mathRoot').innerHTML = `<table class="math">
    <thead><tr><th>Dimension</th><th>W</th><th>Pctl</th><th>Raw</th><th>Adds</th></tr></thead><tbody>
    ${parts.map(p => `<tr class="${p.w === 0 ? 'zero' : ''}${state.hi === p.d.key ? ' on' : ''}" data-dim="${p.d.key}" ${tipAttr(dimTip(p.d, p, e))}>
      <td><span class="dname"><i class="swatch" style="background:var(--d-${p.d.key})"></i>${esc(p.d.label)}</span></td>
      <td>${p.w}</td><td>${n1(p.norm)}</td><td>${p.raw == null ? '—' : n1(p.raw)}</td><td>${n1(p.share)}</td></tr>`).join('')}
    <tr class="tot" ${tipAttr(scoreTip(e, parts, total, wsum))}>
      <td>${esc(state.data.meta.score_name || 'Score')}</td><td>${wsum}</td><td colspan="2"></td><td>${n1(total)}</td></tr>
    </tbody></table>`;

  const H = [];
  H.push(`<div class="sec"><h3>Delivery</h3><div class="stats">
    ${statRow('merged_prs', 'merged PRs', n0(s.merged_prs))}
    ${statRow('feat_prs', 'feat', n0(s.feat_prs))}
    ${statRow('fix_prs', 'fix', n0(s.fix_prs))}
    ${statRow('perf_prs', 'perf', n0(s.perf_prs))}
    ${statRow('chore_prs', 'chore', n0(s.chore_prs))}
    ${statRow('median_cycle_time_h', 'cycle time', hrs(s.median_cycle_time_h))}
    ${s.median_pr_lines != null ? statRow('median_pr_lines', 'median PR lines', n0(s.median_pr_lines)) : ''}
  </div></div>`);

  H.push(`<div class="sec"><h3>Review</h3><div class="stats">
    ${statRow('reviews_given', 'human reviews', n0(s.reviews_given))}
    ${statRow('distinct_authors_unblocked', 'engineers unblocked', n0(s.distinct_authors_unblocked))}
    ${statRow('median_review_latency_h', 'response time', hrs(s.median_review_latency_h))}
    ${statRow('review_followup_rate', 'led to new commits', pct(s.review_followup_rate), s.review_followup_rate >= 0.5 ? 'good' : '')}
  </div></div>`);

  const churnGood = s.churn_rate != null && s.median_churn_rate != null && s.churn_rate <= s.median_churn_rate;
  H.push(`<div class="sec"><h3>Quality &amp; agents</h3><div class="stats">
    ${statRow('churn_rate', 'rework rate', pct(s.churn_rate), churnGood ? 'good' : 'bad')}
    ${statRow('median_churn_rate', 'cohort median', pct(s.median_churn_rate))}
    ${statRow('Q', 'quality factor Q', s.Q == null ? '—' : '×' + n1(s.Q), s.Q >= 1 ? 'good' : 'bad')}
    ${statRow('reverts', 'reverts', n0(s.reverts), s.reverts ? 'bad' : 'good')}
    ${statRow('agent_share', 'agent-involved', pct(s.agent_share))}
    ${statRow('agent_assisted_prs', 'agent-assisted', n0(s.agent_assisted_prs))}
    ${statRow('agent_autonomous_prs', 'autonomous', n0(s.agent_autonomous_prs))}
  </div></div>`);

  if (s.top_dirs?.length) H.push(`<div class="sec"><h3>Where they work</h3><div class="dirs">${s.top_dirs.map(d => `
    <div class="dir" ${tipAttr(`<h4>${esc(d.dir)}</h4>DRI on ${pct(d.share)} of the weighted work landing in this directory${d.weighted_prs != null ? ` (${n1(d.weighted_prs)} weighted PRs)` : d.prs != null ? ` (${n0(d.prs)} PRs)` : ''}.
      <div class="kv"><span>κ — distinct engineers shipping here</span><b>${n0(d.kappa)}</b></div>
      <div class="note">κ is how load-bearing the directory is. Code many engineers depend on scores higher than a private corner — it drives Blast Radius and Ownership.</div>`)}>
      <div class="dir-top"><code>${esc(d.dir)}</code><span class="muted">${pct(d.share)} · κ${n0(d.kappa)}</span></div>
      <div class="dir-bar"><i style="width:${Math.min(100, (d.share || 0) * 100)}%"></i></div></div>`).join('')}</div></div>`);

  if (s.key_person_flags?.length) H.push(`<div class="sec"><h3>Key-person risk</h3>${s.key_person_flags.map(f => `
    <div class="flag" ${tipAttr('<h4>Bus factor</h4>Flagged when one engineer is DRI on ≥50% of an area\'s weighted work and that area has ≤3 contributors.')}>
      <b>${esc(f.scope || f.dir)}</b> — ${pct(f.share)} of the work, ${n0(f.contributors)} contributors total.</div>`).join('')}</div>`);

  H.push(`<div class="sec"><h3>Spot-check the claims</h3>${(e.evidence_prs || []).length
    ? e.evidence_prs.map(p => `<a class="pr" href="${esc(p.url)}" target="_blank" rel="noopener"
        ${tipAttr(`<h4>PR weight W = ${n1(p.W)}</h4>W = centrality × autonomy × substance — the unit every dimension sums. A PR into load-bearing code counts for more than the same diff in a quiet corner.
          <div class="kv"><span>κ of the directory</span><b>${n0(p.kappa)}</b></div>
          <div class="kv"><span>lines changed</span><b>${n0(p.lines)}</b></div><div class="note">Opens on GitHub.</div>`)}>
        <span class="pr-t"><span class="pr-n">#${n0(p.n)}</span><span class="pr-title">${esc(p.title)}</span></span>
        <span class="pr-m"><span class="tag">${esc(p.type)}</span><span class="tag">${esc(p.dir || p.scope || '')}</span>
          <span>merged ${esc(p.merged)}</span><span>W ${n1(p.W)}</span></span>
        ${p.why ? `<span class="pr-why">${esc(p.why)}</span>` : ''}</a>`).join('')
    : '<p class="empty">No evidence PRs in this payload.</p>'}</div>`);

  $('#insRest').innerHTML = H.join('');
}

/* ── method modal ──────────────────────────────────────────── */
function renderModal() {
  const m = state.data.meta, c = m.counter_metrics || {};
  const facts = [
    [n0(m.merged_prs), 'merged PRs analysed'],
    [n0(m.eligible_engineers), 'eligible engineers'],
    [n0(m.human_reviews), 'human reviews scored'],
    [n0(m.bot_authored_prs), 'bot PRs re-credited to a human DRI'],
    [n0(m.unattributed_prs), 'autonomous PRs excluded'],
    [n0(m.bot_reviews), 'bot reviews filtered out']
  ].map(([v, k]) => `<div class="fact"><b>${v}</b><span>${k}</span></div>`).join('');

  $('#modalBody').innerHTML = `
    <h3>The claim</h3>
    <p>Impact is not lines, commits or PR count. This model scores seven things an engineering leader actually acts on,
    each weighted by <b>how load-bearing the touched code is</b>, and reports every engineer's <b>percentile rank</b>
    on each — so 82 means "ahead of 82% of the eligible cohort", never "82 of something".</p>

    <h3>The window</h3>
    <div class="facts">${facts}</div>
    <p class="small muted">${esc(m.window_start)} → ${esc(m.window_end)} · generated ${esc(m.generated_at)}</p>

    <h3>Who gets the credit</h3>
    <p>DRI(pr) = first assignee, falling back to the author. PostHog's PR template asks the directing human to be the
    assignee, so agent-authored PRs still credit the engineer who drove them. Fully autonomous PRs with no human
    assignee are excluded from person scoring. Every bot review is filtered out. An engineer is eligible with
    ≥5 merged PRs or ≥10 human reviews.</p>

    <h3>Per-PR weight</h3>
    <p><code>W(pr) = C × A × G</code> — <b>C</b> centrality, 0.6–2.0, from κ, the number of distinct engineers shipping
    into that area; <b>A</b> autonomy, 1.0 human-driven or agent-assisted, 0.5 fully autonomous; <b>G</b> substance,
    0.4 for a one-line one-file change, else 1.0. Every dimension sums W, never a raw count.</p>

    <h3>The seven dimensions</h3>
    <table><tr><th>Dimension</th><th>Formula</th></tr>
    ${state.dims.map(d => `<tr><td><b>${esc(d.label)}</b><br><span class="small muted">${esc(d.blurb)}</span></td><td class="f">${esc(d.formula)}</td></tr>`).join('')}</table>

    <h3>Normalisation and the composite</h3>
    <p>Each raw dimension becomes its percentile inside the eligible cohort — percentile rather than z-score, because
    the distributions are heavily right-skewed — then
    <code>${esc(m.score_name)} = Σ(w·pctl) ÷ Σ(w)</code>, w ∈ [0,5]. Raw values sit beside every percentile in the panel.</p>

    <h3>Presets</h3>
    <table><tr><th>Preset</th>${state.dims.map(d => `<th>${esc(shortLabel(d.label, d.key))}</th>`).join('')}</tr>
    ${Object.entries(state.data.presets || {}).map(([name, w]) =>
      `<tr><td>${esc(name)}</td>${state.dims.map(d => `<td>${w[d.key] ?? 0}</td>`).join('')}</tr>`).join('')}</table>

    <h3>Deliberately not scored</h3>
    <p>Lines changed and PR size are context only — repo median ${n0(c.pr_lines_p50)} lines, p90 ${n0(c.pr_lines_p90)},
    revert rate ${n1(c.revert_pct)}%. Commit counts are absent entirely.</p>

    <h3>Known caveats</h3>
    <p>Rework rate is a <b>proxy</b>: a fix landing in the same area within 14 days is not proof of a regression —
    reverts are the hard signal, and both are shown. Ownership is two-signed: it rewards holding a critical area and
    simultaneously flags the continuity risk of that. Review depth counts inline comments with a 0.6 exponent, so a
    nitpick storm cannot dominate. Work that never becomes a PR — design, incident response, mentoring — is invisible
    to any repo-derived model, this one included.</p>`;
  $('#modal').hidden = false;
}

/* ── render + events ───────────────────────────────────────── */
function render(opts = {}) {
  const rows = ranked(state.weights);
  if (!state.sel) state.sel = rows[0].e.login;
  renderPresets();
  if (!opts.keepSliders) renderSliders();      // never rebuild the stack mid-drag
  renderCards(rows); renderDetail(); renderHeader();
}

function toggleWeights(open) {
  const pop = $('#weightsPop'), btn = $('#weightsBtn');
  const next = open ?? pop.hidden;
  pop.hidden = !next; btn.classList.toggle('on', next); btn.setAttribute('aria-expanded', String(next));
}

function wire() {
  $('#weightsBtn').addEventListener('click', ev => { ev.stopPropagation(); toggleWeights(); });
  $('#weightsPop').addEventListener('click', ev => ev.stopPropagation());
  $('#sliders').addEventListener('input', ev => {
    const k = ev.target.dataset.dim; if (!k) return;
    const v = +ev.target.value;
    state.weights[k] = v; state.hi = k;
    const row = ev.target.closest('.sl');
    row.querySelector('.sl-w').textContent = v;          // patch in place: the drag survives
    row.classList.toggle('off', v === 0);
    render({ keepSliders: true });
  });
  $('#presets').addEventListener('click', ev => {
    const b = ev.target.closest('[data-preset]'); if (!b) return;
    Object.assign(state.weights, state.data.presets[b.dataset.preset]); state.hi = null; render();
  });
  $('#resetBtn').addEventListener('click', () => {
    state.dims.forEach(d => state.weights[d.key] = d.default_weight ?? 3);
    state.hi = null; render();
  });
  document.addEventListener('click', ev => {
    if (!ev.target.closest('.hdr-actions')) toggleWeights(false);
    const card = ev.target.closest('.card, .runner');
    if (card) { state.sel = card.dataset.login; render(); return; }
    const mrow = ev.target.closest('#mathRoot tr[data-dim]');
    if (mrow) { state.hi = state.hi === mrow.dataset.dim ? null : mrow.dataset.dim; render(); }
  });
  $('#methodBtn').addEventListener('click', renderModal);
  $('#modalClose').addEventListener('click', () => $('#modal').hidden = true);
  $('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal') $('#modal').hidden = true; });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') { $('#modal').hidden = true; toggleWeights(false); return; }
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    const rows = ranked(state.weights);
    const i = rows.findIndex(r => r.e.login === state.sel);
    const j = Math.min(rows.length - 1, Math.max(0, i + (ev.key === 'ArrowDown' ? 1 : -1)));
    if (j !== i) { ev.preventDefault(); state.sel = rows[j].e.login; render(); }
  });
}

async function boot() {
  let data = null;
  try {                                                  // static JSON when served over http
    const r = await fetch('dashboard_data.json', { cache: 'no-cache' });
    if (r.ok) data = await r.json();
  } catch (_) { /* file:// — fall through to the embedded copy */ }
  data = data || window.__DASHBOARD_DATA__;
  if (!data) { document.body.innerHTML = '<p style="padding:40px">No data payload. Run <code>./build.sh</code>.</p>'; return; }

  state.data = data;
  state.data.meta.score_name = data.meta.score_name || 'Contribution Score';
  state.dims = data.dimensions;                          // dimensions[] order IS the slider order
  state.dims.forEach(d => state.weights[d.key] = d.default_weight ?? 3);
  const baseW = {}; state.dims.forEach(d => baseW[d.key] = d.default_weight ?? 3);
  ranked(baseW).forEach((r, i) => state.baseline[r.e.login] = i + 1);

  radarRoot = ReactDOM.createRoot($('#radarRoot'));
  $('#scoreName').textContent = state.data.meta.score_name;
  document.title = `PostHog — Engineering Contribution (${data.meta.window_start} → ${data.meta.window_end})`;
  wire(); render();
}
boot();
