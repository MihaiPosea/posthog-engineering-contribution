#!/usr/bin/env python3
"""Build dashboard_data.json from the two raw pulls. All formula constants live here."""
import json, os, re, math, statistics as st
from collections import defaultdict, Counter
from datetime import datetime, timedelta

D = "/Users/mihaiposea/Weave Takehome/data"
OUT = "/Users/mihaiposea/Weave Takehome/dashboard_data.json"
W_START, W_END = datetime(2026,6,4), datetime(2026,9,2,23,59,59)
CHURN_DAYS, SHRINK_K = 14, 5

GEN = [re.compile(p) for p in [
    r'\.lock$', r'pnpm-lock\.yaml$', r'uv\.lock$', r'\.min\.(js|css)$',
    r'__snapshots__/', r'\.snap$', r'/generated/', r'_pb2\.py$', r'\.pb\.go$',
    r'/api-?client/', r'\.svg$', r'schema\.graphql$', r'\.po$']]
is_gen = lambda p: any(r.search(p) for r in GEN)

BOTS = {'posthog','stamphog','greptile-apps','veria-ai','graphite-app','dependabot',
        'copilot-pull-request-reviewer','chatgpt-codex-connector','posthog-js-upgrader',
        'scheduled-actions-posthog','posthog-bot','github-actions','renovate'}
def is_bot(login, typ):
    if typ == 'Bot': return True
    l = (login or '').lower()
    return l in BOTS or '[bot]' in l or l.endswith('-bot')

def ts(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ") if s else None

TITLE = re.compile(r'^(feat|fix|chore|perf|refactor|docs|test|build|ci|style|revert)(\(([^)]*)\))?!?:', re.I)
def parse_title(t):
    m = TITLE.match(t or '')
    if not m: return ('other', None)
    return (m.group(1).lower(), (m.group(3) or '').lower().strip() or None)

def pct_rank(vals):
    """value -> percentile 0..100 (ties share the mean rank)"""
    s = sorted(vals); n = len(s)
    if n <= 1: return lambda v: 50.0
    import bisect
    def f(v):
        lo = bisect.bisect_left(s, v); hi = bisect.bisect_right(s, v)
        return 100.0 * ((lo + hi - 1) / 2) / (n - 1)
    return f

# ---------- load ----------
prs = {}
for line in open(f"{D}/prs.ndjson"):
    try: r = json.loads(line)
    except: continue
    m = ts(r.get('ma'))
    if not m or not (W_START <= m <= W_END): continue
    prs[r['n']] = r
print(f"merged PRs in window: {len(prs)}")

files = {}
fp = f"{D}/files.ndjson"
if os.path.exists(fp):
    for line in open(fp):
        try: r = json.loads(line)
        except: continue
        files[r['n']] = r
print(f"PRs with file data: {len(files)}")

def dirs_of(n):
    r = files.get(n)
    if not r: return []
    ds = set()
    for f in r.get('f', []):
        if is_gen(f['p']): continue
        parts = f['p'].split('/')
        ds.add('/'.join(parts[:2]) if len(parts) > 1 else parts[0])
    return sorted(ds)

def eff_lines(n, pr):
    r = files.get(n)
    if not r or not r.get('f'):
        return pr.get('add',0) + pr.get('del',0)          # fallback: API totals
    tot = sum(f['a']+f['d'] for f in r['f'] if not is_gen(f['p']))
    if r.get('ftc',0) > len(r['f']):                       # file list truncated at 20
        seen = sum(f['a']+f['d'] for f in r['f'])
        api  = pr.get('add',0)+pr.get('del',0)
        tot += max(0, api - seen)
    return tot

# ---------- attribution ----------
def dri(pr):
    for a in pr.get('asg') or []:
        if a: return a
    return pr['au'] if not is_bot(pr['au'], pr['aut']) else None

for n, pr in prs.items():
    pr['_dri'] = dri(pr)
    pr['_type'], pr['_scope'] = parse_title(pr['t'])
    pr['_dirs'] = dirs_of(n)
    pr['_L'] = eff_lines(n, pr)

attributed = {n:p for n,p in prs.items() if p['_dri'] and not is_bot(p['_dri'],'User')}
unattributed = len(prs) - len(attributed)
bot_authored = sum(1 for p in prs.values() if is_bot(p['au'], p['aut']))
print(f"attributed={len(attributed)} unattributed={unattributed} bot_authored={bot_authored}")

# ---------- centrality kappa(d) ----------
dir_devs = defaultdict(set)
for n, p in attributed.items():
    for d in p['_dirs']: dir_devs[d].add(p['_dri'])
kappa = {d: len(s) for d, s in dir_devs.items()}
dir_total = defaultdict(float)
kvals = sorted(kappa.values()) or [1]
kpct = pct_rank(kvals)
med_kappa = st.median(kvals)
print(f"directories: {len(kappa)}  median kappa={med_kappa}  max={max(kvals)}")

# ---------- per-PR weights ----------
for n, p in attributed.items():
    ks = [kappa.get(d,0) for d in p['_dirs']]
    p['_kappa'] = max(ks) if ks else 0
    p['_C'] = 0.6 + 1.4 * (kpct(p['_kappa'])/100.0)
    L = p['_L']
    S = min(1.4, 0.6 + 0.35*math.log2(1 + L/50.0))
    if L > 1500: S *= 0.7
    p['_S'] = S
    p['_A'] = 0.5 if p.get('auto') == 'autonomous' else 1.0
    p['_W']  = p['_C'] * p['_A'] * p['_S']
    p['_W0'] = p['_C'] * p['_S']

for n,p in attributed.items():
    if p.get('auto') == 'autonomous': continue
    for d in p['_dirs']: dir_total[d] += p['_W']

# ---------- churn ----------
# File-level, not directory-level: a directory in this repo sees a fix within 14d
# essentially always (160 merges/day), which made the signal degenerate. Requiring the
# later fix to touch at least one of the SAME FILES is a far tighter causal claim.
def paths_of(n):
    r = files.get(n)
    return set() if not r else {f['p'] for f in r.get('f',[]) if not is_gen(f['p'])}
for n,p in attributed.items(): p['_paths'] = paths_of(n)

fixes_by_file = defaultdict(list)
for n,p in attributed.items():
    if p['_type'] in ('fix','perf'):
        for f in p['_paths']: fixes_by_file[f].append((ts(p['ma']), n))
for v in fixes_by_file.values(): v.sort(key=lambda x: x[0])

def churned(p):
    t0 = ts(p['ma']); t1 = t0 + timedelta(days=CHURN_DAYS)
    for f in p['_paths']:
        for tf, fn in fixes_by_file.get(f, []):
            if t0 < tf <= t1 and fn != p['n']: return True
    return False

REVERT = re.compile(r'^revert[\s:"]', re.I)
revert_titles = [p['t'] for p in prs.values() if REVERT.match(p['t'] or '')]

# ---------- per-engineer accumulation ----------
E = defaultdict(lambda: {'feat':[], 'fixperf':[], 'agent':[], 'all':[], 'dirs':defaultdict(float),
                         'reviews':[], 'churn_num':0, 'churn_den':0, 'reverts':0, 'auto_only':[]})
for n,p in attributed.items():
    e = E[p['_dri']]
    if p.get('auto') == 'autonomous':
        e['agent'].append(p); e['auto_only'].append(p)
        continue
    e['all'].append(p)
    for d in p['_dirs']: e['dirs'][d] += p['_W']
    if p['_type'] == 'feat':
        e['feat'].append(p); e['churn_den'] += 1
        if churned(p): e['churn_num'] += 1
    if p['_type'] in ('fix','perf'): e['fixperf'].append(p)
    if p.get('auto') == 'assisted': e['agent'].append(p)

for t in revert_titles:
    m = re.search(r'"(.+?)"', t)
    if not m: continue
    for n,p in attributed.items():
        if p['t'] == m.group(1): E[p['_dri']]['reverts'] += 1; break

# reviews (humans only, no self-review)
for n,p in attributed.items():
    first = {}
    for r in p.get('rv') or []:
        if is_bot(r['a'], r['ty']) or r['a'] == p['_dri']: continue
        rt = ts(r.get('at'))
        E[r['a']]['reviews'].append({'pr':n,'author':p['_dri'],'ic':r.get('ic',0) or 0,
            'at':rt,'created':ts(p['ca']),'last':ts(p.get('lc'))})

churn_rates = [e['churn_num']/e['churn_den'] for e in E.values() if e['churn_den'] >= 3]
M_CHURN = st.median(churn_rates) if churn_rates else 0.0
lat_all = []
for e in E.values():
    for r in e['reviews']:
        if r['at'] and r['created']: lat_all.append(max(0.0,(r['at']-r['created']).total_seconds()/3600))
MED_LAT = st.median(lat_all) if lat_all else 24.0
print(f"median churn={M_CHURN:.3f}  median review latency={MED_LAT:.1f}h")

# ---------- eligibility ----------
elig = {k:v for k,v in E.items() if len(v['all']) >= 5 or len(v['reviews']) >= 10}
print(f"eligible engineers: {len(elig)}")

def Q(e):
    n = e['churn_den']
    c = (n*(e['churn_num']/n) + SHRINK_K*M_CHURN)/(n+SHRINK_K) if n else M_CHURN
    return max(0.5, min(1.5, 1 + (M_CHURN - c) - 0.15*min(e['reverts'],3))), (e['churn_num']/n if n else None)

raw = {}
for login, e in elig.items():
    q,_ = Q(e)
    feat = sum(p['_W'] for p in e['feat'])
    rel  = sum(p['_W'] for p in e['fixperf']) * q
    blast = sum(math.log2(1+kappa[d]) for d in e['dirs'] if kappa.get(d,0) > med_kappa)
    revs = e['reviews']; da = len({r['author'] for r in revs})
    lats = [max(0.0,(r['at']-r['created']).total_seconds()/3600) for r in revs if r['at'] and r['created']]
    lat = max(0.5, min(1.5, MED_LAT/st.median(lats))) if lats else 1.0
    lev = math.sqrt(da*len(revs))*lat if revs else 0.0
    dep = sum(((1+r['ic'])**0.6 - 1)*(1 + (1 if (r['last'] and r['at'] and r['last']>r['at']) else 0)) for r in revs)
    own = 0.0
    for d,w in e['dirs'].items():
        tot = dir_total.get(d, 0.0)
        if tot and w/tot >= 0.25: own += (w/tot)*kappa.get(d,0)
    agent = sum(p['_W0'] for p in e['agent'])*q
    raw[login] = {'feature':feat,'reliability':rel,'blast':blast,'leverage':lev,
                  'depth':dep,'ownership':own,'agent':agent}

KEYS = ['feature','reliability','blast','leverage','depth','ownership','agent']
rankers = {k: pct_rank([raw[l][k] for l in raw]) for k in KEYS}
norm = {l: {k: round(rankers[k](raw[l][k]),1) for k in KEYS} for l in raw}
json.dump({'raw':raw,'norm':norm,'meta':{'merged':len(prs),'attributed':len(attributed),
  'unattributed':unattributed,'bot_authored':bot_authored,'eligible':len(elig),
  'median_churn':M_CHURN,'median_latency_h':MED_LAT,'median_kappa':med_kappa}},
  open(f"{D}/scores_intermediate.json","w"), indent=1)
print("intermediate written ->", f"{D}/scores_intermediate.json")

# ================= OUTPUT =================
DIMS = [
 ("feature","Feature Delivery","New capability shipped, weighted by how central the touched code is.",
  "FD(e) = Σ W(pr) over merged feat PRs where DRI(pr)=e"),
 ("reliability","Reliability","Fix and perf work delivered, scaled by whether their own features stay fixed.",
  "REL(e) = Σ W(pr) over fix+perf PRs × Q(e)"),
 ("blast","Blast Radius","How much of the load-bearing, widely-shared code they operate across.",
  "BLAST(e) = Σ log₂(1+κ(d)) over dirs d they touch with κ(d) > median"),
 ("leverage","Review Leverage","How many different engineers they unblock, and how fast.",
  "LEV(e) = √(distinct_authors × reviews) × latency factor"),
 ("depth","Review Depth","Whether their reviews actually changed the code.",
  "DEP(e) = Σ [(1+inline)^0.6 − 1] × (1 + followed_by_commits)"),
 ("ownership","Ownership & Bus Factor","Whether they hold a critical area. Two-signed: fewer defects, more continuity risk.",
  "OWN(e) = Σ share(e,d) × κ(d) for share(e,d) ≥ 0.25"),
 ("agent","Agent Leverage","Volume shipped through agents that actually held up.",
  "AGT(e) = Q(e) × Σ W₀(pr) over agent-involved PRs"),
]
PRESETS = {"Balanced":[3,3,3,3,3,3,3], "Ship features":[5,2,3,2,1,2,3],
  "Stability first":[1,5,3,3,4,3,2], "Platform":[1,4,5,3,3,4,1],
  "Force multipliers":[1,2,2,5,5,2,2], "Key-person risk":[3,3,4,1,1,5,1]}

def archetype(nm):
    top = sorted(KEYS, key=lambda k: -nm[k])[:2]
    s = set(top)
    if s & {'leverage','depth'} and len(s & {'leverage','depth'}) == 2: return "Tech Lead"
    if 'ownership' in s and 'blast' in s: return "Architect"
    if 'reliability' in s and 'blast' in s: return "Solver"
    if 'feature' in s and 'agent' in s: return "Shipper"
    if 'leverage' in s or 'depth' in s: return "Multiplier"
    return "Generalist"

all_lines = sorted(p['_L'] for p in attributed.values())
def pctl(a, q): return a[min(len(a)-1, int(len(a)*q))] if a else 0
revert_pct = round(100.0*len(revert_titles)/max(1,len(prs)), 2)

engineers = []
for login, e in elig.items():
    q, own_churn = Q(e)
    revs = e['reviews']
    lats = [max(0.0,(r['at']-r['created']).total_seconds()/3600) for r in revs if r['at'] and r['created']]
    followed = sum(1 for r in revs if r['last'] and r['at'] and r['last'] > r['at'])
    da = len({r['author'] for r in revs})
    tc = Counter(p['_type'] for p in e['all'])
    top_dirs = sorted(e['dirs'].items(), key=lambda kv:-kv[1])[:4]
    flags = [{"dir":d,"share":round(e['dirs'][d]/dir_total[d],2),"contributors":kappa.get(d,0)}
             for d,_ in top_dirs
             if dir_total.get(d) and e['dirs'][d]/dir_total[d] >= 0.5 and kappa.get(d,99) <= 3]
    ev = sorted(e['all'], key=lambda p:-p['_W'])[:4]
    why = []
    if da: why.append(f"Unblocked {da} different engineers across {len(revs)} human reviews"
                      + (f", median first response {st.median(lats):.1f}h." if lats else "."))
    if revs: why.append(f"{100*followed/len(revs):.0f}% of their reviews were followed by new commits — review that changes code.")
    if e['feat']: why.append(f"Shipped {len(e['feat'])} features; "
                             + (f"rework rate {own_churn:.0%} vs {M_CHURN:.0%} cohort median." if own_churn is not None else "."))
    if e['auto_only']: why.append(f"Runs an agent fleet: {len(e['auto_only'])} fully-autonomous PRs merged under their account — counted as Agent Leverage, not personal delivery.")
    elif e['agent']: why.append(f"{len(e['agent'])} of {len(e['all'])} PRs agent-assisted ({100*len(e['agent'])/max(1,len(e['all'])):.0f}%), quality factor Q={q:.2f}.")
    if flags: why.append(f"Key-person risk: sole maintainer of {flags[0]['dir']} ({flags[0]['share']:.0%} of its work, {flags[0]['contributors']} contributors).")
    engineers.append({
      "login":login, "avatar":f"https://github.com/{login}.png?size=120",
      "profile":f"https://github.com/{login}", "archetype":archetype(norm[login]),
      "norm":norm[login], "raw":{k:round(raw[login][k],2) for k in KEYS},
      "stats":{"merged_prs":len(e['all']),"feat_prs":tc.get('feat',0),"fix_prs":tc.get('fix',0),
        "perf_prs":tc.get('perf',0),"chore_prs":tc.get('chore',0),"refactor_prs":tc.get('refactor',0),
        "reviews_given":len(revs),"distinct_authors_unblocked":da,
        "median_review_latency_h":round(st.median(lats),1) if lats else None,
        "review_followup_rate":round(followed/len(revs),2) if revs else None,
        "churn_rate":round(own_churn,3) if own_churn is not None else None,
        "median_churn_rate":round(M_CHURN,3),"Q":round(q,2),"reverts":e['reverts'],
        "agent_assisted_prs":sum(1 for p in e['agent'] if p.get('auto')=='assisted'),
        "agent_autonomous_prs":len(e['auto_only']),
        "autonomous_excluded_from_delivery":len(e['auto_only']),
        "agent_share":round(len(e['agent'])/max(1,len(e['all'])),2),
        "median_pr_lines":int(st.median([p['_L'] for p in e['all']])) if e['all'] else 0,
        "top_dirs":[{"dir":d,"weighted_prs":round(w,1),
                     "share":round(w/dir_total[d],2) if dir_total.get(d) else None,
                     "kappa":kappa.get(d,0)} for d,w in top_dirs],
        "key_person_flags":flags},
      "why":why[:4],
      "evidence_prs":[{"n":p['n'],"title":p['t'],"type":p['_type'],
        "dir":(p['_dirs'][0] if p['_dirs'] else None),
        "url":f"https://github.com/PostHog/posthog/pull/{p['n']}","merged":p['ma'][:10],
        "lines":p['_L'],"kappa":p['_kappa'],"W":round(p['_W'],2),
        "autonomy":p.get('auto')} for p in ev]})

engineers.sort(key=lambda x:-sum(x['norm'][k] for k in KEYS))
human_rev = sum(1 for p in attributed.values() for r in (p.get('rv') or []) if not is_bot(r['a'],r['ty']))
bot_rev   = sum(1 for p in prs.values() for r in (p.get('rv') or []) if is_bot(r['a'],r['ty']))
doc = {"meta":{"repo":"PostHog/posthog","window_start":"2026-06-04","window_end":"2026-09-02",
   "score_name":"Contribution Score","merged_prs":len(prs),"attributed_prs":len(attributed),
   "bot_authored_prs":bot_authored,"unattributed_prs":unattributed,
   "human_reviews":human_rev,"bot_reviews":bot_rev,"eligible_engineers":len(elig),
   "counter_metrics":{"revert_pct":revert_pct,"pr_lines_p50":pctl(all_lines,.5),
                      "pr_lines_p90":pctl(all_lines,.9),"median_churn":round(M_CHURN,3),
                      "median_review_latency_h":round(MED_LAT,1)},
   "generated_at":datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")},
 "dimensions":[{"key":k,"label":l,"default_weight":3,"blurb":b,"formula":f} for k,l,b,f in DIMS],
 "presets":{n:dict(zip(KEYS,v)) for n,v in PRESETS.items()},
 "engineers":engineers}
json.dump(doc, open(OUT,"w"), indent=1)
print(f"WROTE {OUT}: {len(engineers)} engineers, {len(prs)} PRs, revert={revert_pct}%")
print("top 5 (balanced):", ", ".join(e['login'] for e in engineers[:5]))
