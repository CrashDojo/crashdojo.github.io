/* CrashDojo case lab — replays archived rollouts exported by tools/export_cases.py.
   Everything drawn comes from stored data: boxes, plans every replan, request route/corridor,
   seven-check selection record and per-replan strength log (λ_t, q_t, t_c, d_c). */
(() => {
const COL = { ego:'#4f8cff', tgt:'#ff8a3d', hit:'#ff4d5e', oth:'#7c8298', road:'#131824', edge:'#2b3248', req:'#7be0c3', grid:'rgba(150,160,200,.06)', ink:'#eef0f7', mute:'#8a90a6' };
const DPR = Math.min(devicePixelRatio || 1, 2);
const PRE = 2.4;                 // seconds of "selection" pre-roll before the rollout clock starts
const HOLD = 1.6;                // hold after contact / end
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));
const fmt = (v, d=2) => (v == null || Number.isNaN(v)) ? '—' : Number(v).toFixed(d);
const cache = {};
async function load(id){ if(!cache[id]) cache[id] = fetch(`data/cases/${id}.json`).then(r => r.json()); return cache[id]; }

const PARAM = {
  t0:['Onset t₀','s'], initial_offset_m:['Initial offset d₀','m'], delta_d_m:['Lateral increment Δd','m'], T_lc_s:['Lane-change duration T_lc','s'],
  initial_speed_mps:['Initial speed v₀','m/s'], target_speed_mps:['Speed goal v_goal','m/s'], speed_transition_s:['Speed transition T_v','s'], speed_t0:['Speed onset t_v','s'],
  A_m:['Intrusion amplitude A','m'], T_in_s:['Drift-in T_in','s'], T_hold_s:['Hold T_hold','s'], T_out_s:['Return T_out','s'], target_intrusion_m:['Target body intrusion','m'],
  return_offset_m:['Return offset','m'], arrival_s:['Arrival time','s'], arrival_route_s_m:['Arrival route station','m'], centerline_transition_s:['Centerline transition','s'],
  z_min_m:['Intrusion depth min','m'], z_max_m:['Intrusion depth max','m']
};

/* ---------------- shared renderer ---------------- */
function fit(cv){ const r = cv.getBoundingClientRect(); cv.width = Math.max(1, Math.round(r.width*DPR)); cv.height = Math.max(1, Math.round(r.height*DPR));
  const ctx = cv.getContext('2d'); ctx.setTransform(DPR,0,0,DPR,0,0); return { ctx, w:r.width, h:r.height }; }
function makeTF(view, w, h, pad=18){
  const [x0,y0,x1,y1] = view, s = Math.min((w-2*pad)/(x1-x0), (h-2*pad)/(y1-y0)), cx=(x0+x1)/2, cy=(y0+y1)/2;
  return { s, p:(x,y) => [w/2 + (x-cx)*s, h/2 - (y-cy)*s] };
}
function pathPoly(ctx, tf, ring){ ring.forEach(([x,y],i) => { const [u,v] = tf.p(x,y); i ? ctx.lineTo(u,v) : ctx.moveTo(u,v); }); ctx.closePath(); }
function box(ctx, tf, f, ext, fill, stroke, lw=1.2){
  const [x,y,h] = f, [L,B] = ext, c=Math.cos(h), s=Math.sin(h);
  ctx.beginPath();
  [[L/2,B/2],[L/2,-B/2],[-L/2,-B/2],[-L/2,B/2]].forEach(([dx,dy],i) => { const [u,v] = tf.p(x+c*dx-s*dy, y+s*dx+c*dy); i ? ctx.lineTo(u,v) : ctx.moveTo(u,v); });
  ctx.closePath();
  if(fill){ ctx.fillStyle = fill; ctx.fill(); }
  if(stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  if(fill){ // windshield tick for heading
    const [u,v] = tf.p(x+c*L*.28, y+s*L*.28), [u2,v2] = tf.p(x+c*L*.28 - s*B*.32, y+s*L*.28 + c*B*.32), [u3,v3] = tf.p(x+c*L*.28 + s*B*.32, y+s*L*.28 - c*B*.32);
    ctx.strokeStyle = 'rgba(8,10,16,.55)'; ctx.lineWidth = Math.max(1.5, tf.s*.35); ctx.beginPath(); ctx.moveTo(u2,v2); ctx.lineTo(u3,v3); ctx.stroke();
  }
}
function line(ctx, tf, pts, color, w=1.6, dash=null, alpha=1){
  if(!pts || pts.length < 2) return;
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; if(dash) ctx.setLineDash(dash);
  ctx.beginPath(); pts.forEach(([x,y],i) => { const [u,v] = tf.p(x,y); i ? ctx.lineTo(u,v) : ctx.moveTo(u,v); }); ctx.stroke(); ctx.restore();
}
function frameAt(c, t){ return clamp(Math.floor(t / c.dt + 1e-6), 0, c.frames-1); }
function drawScene(ctx, w, h, c, t, opt={}){
  const tf = makeTF(c.view, w, h, opt.pad ?? 18), k = frameAt(c, Math.max(0,t)), pre = t < 0;
  ctx.clearRect(0,0,w,h);
  // road + dotted texture
  ctx.fillStyle = COL.road; ctx.strokeStyle = COL.edge; ctx.lineWidth = 1;
  for(const poly of c.road){ ctx.beginPath(); poly.forEach(r => pathPoly(ctx, tf, r)); ctx.fill('evenodd'); ctx.stroke(); }
  // requested corridor + route (step 2 emphasis)
  const reqA = opt.compact ? .35 : (opt.step === 2 ? 1 : .45);
  ctx.save(); ctx.globalAlpha = reqA; ctx.setLineDash([5,5]); ctx.strokeStyle = COL.req; ctx.lineWidth = 1;
  for(const poly of c.corridor){ ctx.beginPath(); poly.forEach(r => pathPoly(ctx, tf, r)); ctx.stroke(); }
  ctx.restore();
  line(ctx, tf, c.route, COL.req, opt.compact ? 1 : 1.4, null, reqA*.8);
  // trails
  const trail = (a) => a.f.slice(0, k+1).filter(Boolean).map(f => [f[0], f[1]]);
  if(!pre){ line(ctx, tf, trail(c.agents[c.ego]), COL.ego, 1.6, [4,4], .85); line(ctx, tf, trail(c.agents[c.target]), COL.tgt, 1.6, [4,4], .85); }
  // guided plans (every replan)
  if(!pre && !opt.noPlans){
    const tp = c.plans.target.filter(p => p.t <= k), ep = c.plans.ego.filter(p => p.t <= k);
    tp.forEach((p,i) => line(ctx, tf, p.xy, COL.tgt, i === tp.length-1 ? 2 : 1, null, i === tp.length-1 ? .95 : .12 + .25*i/Math.max(1,tp.length)));
    if(ep.length) line(ctx, tf, ep[ep.length-1].xy, COL.ego, 1.6, [2,3], .8);
  }
  // vehicles
  c.agents.forEach((a, i) => {
    const f = a.f[k]; if(!f || i === c.ego || i === c.target) return;
    box(ctx, tf, f, a.ext, null, pre && opt.step === 1 ? 'rgba(200,205,225,.75)' : COL.oth, 1);
  });
  const fe = c.agents[c.ego].f[k], ft = c.agents[c.target].f[k];
  if(fe) box(ctx, tf, fe, c.agents[c.ego].ext, COL.ego, 'rgba(255,255,255,.75)', .8);
  if(ft){
    const sel = pre ? clamp((PRE + t) / PRE * 1.6 - .4, 0, 1) : 1;   // target "lights up" during pre-roll
    box(ctx, tf, ft, c.agents[c.target].ext, `rgba(255,138,61,${.25 + .75*sel})`, 'rgba(255,255,255,.75)', .8);
    if(pre && opt.step === 1){
      const [u,v] = tf.p(ft[0], ft[1]), r = 16 + 10*Math.abs(Math.sin(t*3));
      ctx.beginPath(); ctx.arc(u,v,r,0,Math.PI*2); ctx.strokeStyle = `rgba(255,138,61,${.35+.5*sel})`; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
  // labels
  if(!opt.compact && (pre || k < 8)){
    ctx.font = '600 12px Inter, system-ui'; ctx.textAlign = 'center';
    if(fe){ const [u,v] = tf.p(fe[0], fe[1]); ctx.fillStyle = COL.ego; ctx.fillText('Ego', u, v + 22); }
    if(ft){ const [u,v] = tf.p(ft[0], ft[1]); ctx.fillStyle = COL.tgt; ctx.fillText(pre ? 'Selected target' : 'Target', u, v - 16); }
  }
  // contact
  const fc = c.first_contact_s;
  if(fc != null && t >= fc){
    const kc = frameAt(c, fc), a = c.agents[c.ego].f[kc], b = c.agents[c.target].f[kc];
    if(a && b){ const [u,v] = tf.p((a[0]+b[0])/2, (a[1]+b[1])/2), ph = ((t - fc) % 1.2) / 1.2;
      ctx.beginPath(); ctx.arc(u,v, 9 + ph*30, 0, Math.PI*2); ctx.strokeStyle = `rgba(255,77,94,${1-ph})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(u,v, 8, 0, Math.PI*2); ctx.strokeStyle = COL.hit; ctx.lineWidth = 2.4; ctx.stroke(); }
  }
  // scale bar
  if(!opt.compact){ const [u0,v0] = [16, h-16]; ctx.fillStyle = 'rgba(230,232,242,.75)'; ctx.fillRect(u0, v0, 5*tf.s, 2); ctx.font = '11px Inter, system-ui'; ctx.textAlign = 'left'; ctx.fillText('5 m', u0, v0-6); }
  return k;
}
function lambdaAt(c, t){ const st = c.strength.steps; let cur = st[0]; for(const s of st) if(s.t <= t + 1e-6) cur = s; return cur; }

/* ---------------- case lab ---------------- */
const lab = document.querySelector('.lab'); if(!lab) return;
const listEl = document.getElementById('lab-cases'), panel = document.getElementById('lab-panel'), hud = document.getElementById('lab-hud');
const cv = document.getElementById('lab-canvas'), strip = document.getElementById('lab-strip'), range = document.getElementById('lab-range');
const stepsEl = document.getElementById('lab-steps'), playBtn = document.getElementById('lab-play');
let C = null, t = -PRE, playing = true, speed = 1, last = performance.now(), forced = 0, view, sview, visible = true;
const total = () => C ? (C.frames-1)*C.dt : 7;
// Freeze at first target contact (the simulator has no collision physics), as in the teaser GIF.
const end = () => C ? (C.first_contact_s != null ? Math.min(total(), C.first_contact_s) : total()) : 7;

const SHORT = {C1:'Lead braking',C2:'Cut-in',C3A:'Lane intrusion',C3B:'Intrusion & return',C4:'Crossing',C5:'Merge'};
const LAB = ['eval150_146_idm','eval150_071_flow_planner','eval150_013_flow_planner','eval150_010_flow_planner','eval150_126_flow_planner','eval150_048_idm','full1514_extra_0507_idm'];
fetch('data/cases/index.json').then(r => r.json()).then(all => {
  const idx = LAB.map(id => all.find(c => c.id === id)).filter(Boolean);
  const fams = [...new Set(idx.map(c => c.family_name))];
  listEl.innerHTML = fams.map(fn => `<div class="lc-group"><p class="lc-h">${fn}</p>` + idx.filter(c => c.family_name === fn).map(c =>
    `<button class="lc" data-id="${c.id}"><span class="lc-m"><i>${c.family.slice(0,2)}</i>${SHORT[c.family] || c.family_name}</span><span class="lc-d">${c.planner} · ${c.dataset}</span>${c.first_contact_s != null
      ? `<span class="lc-b hit">contact ${c.first_contact_s.toFixed(1)} s</span>` : `<span class="lc-b ok">avoided</span>`}</button>`).join('') + '</div>').join('');
  listEl.querySelectorAll('.lc').forEach(b => b.onclick = () => choose(b.dataset.id));
  choose('eval150_071_flow_planner');
});

async function choose(id){
  C = await load(id); t = -PRE; forced = 0; playing = true; playBtn.textContent = 'Ⅱ Pause';
  listEl.querySelectorAll('.lc').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  renderPanel(); resize();
}
function stepOf(tt){ if(forced) return forced; if(tt < 0) return 1; const fc = C.first_contact_s ?? total(); return tt < Math.min(1.5, fc*.45) ? 2 : 3; }

function renderPanel(){
  const s = C.selection, rq = C.request, st = C.strength;
  const crit = s.criteria.map(c => `<li class="${c.status}"><i>${c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : '?'}</i>${c.name}</li>`).join('');
  const params = Object.entries(rq.parameters).filter(([k]) => PARAM[k]).map(([k,v]) => `<div><dt>${PARAM[k][0]}</dt><dd>${fmt(v, Math.abs(v) < 10 ? 2 : 1)} <small>${PARAM[k][1]}</small></dd></div>`).join('');
  const win = rq.interaction_window_s;
  const overall = s.overall === 'pass' ? `All seven checks pass${s.ranked_first ? ' · ranked first' : ''}` : s.overall === 'fail' ? 'Archived exploratory case — not every check passed' : 'Selection record not stored for this case';
  const ev = C.evidence || {}, w = rq.interaction_window_s, lam = st.steps.map(x => x.lambda);
  const chips = [];
  if(/^C[23]/.test(C.family) && ev.lateral_shift_m != null) chips.push(['ok', `lateral shift ${Math.abs(ev.lateral_shift_m).toFixed(2)} m`]);
  if(C.first_contact_s != null && w) chips.push(ev.contact_in_window ? ['ok','contact inside requested window'] : ['warn', C.first_contact_s < w[0] ? 'contact before requested window' : 'contact after requested window']);
  chips.push(['ok', `λ ${Math.min(...lam).toFixed(1)} → ${Math.max(...lam).toFixed(1)}`]);
  chips.push(ev.target_background_contact ? ['warn','target touched other traffic'] : ['ok','no target–background contact']);
  if(ev.orr_native === 0) chips.push(['ok','0% off-road']);
  panel.innerHTML = `
  <div class="lp-ev">${chips.map(([k,t]) => `<span class="${k}">${k === 'ok' ? '✓' : '!'} ${t}</span>`).join('')}</div>
  <div class="lp-head"><p class="lp-id">${C.id}</p><h3>${C.family_name}</h3>
    <p class="lp-meta">${C.dataset} · ${C.planner} · ${C.first_contact_s != null ? `<b class="hit">first target contact ${C.first_contact_s.toFixed(1)} s</b>` : '<b class="ok">no target contact</b>'}</p></div>
  <section class="lp-block" data-s="1">
    <p class="lp-k"><span>1</span>Select the actor</p>
    <div class="lp-sel"><b>${s.candidates ?? '—'}</b><span>candidate actor–mechanism pairs enumerated</span></div>
    <p class="lp-line">${C.mechanism || '—'}${C.najm_id ? ` · Najm pre-crash type ${C.najm_id}` : ''}</p>
    <ul class="lp-crit">${crit}</ul>
    <p class="lp-note ${s.overall}">${overall}${s.strength_tier ? ` · strength tier <code>${s.strength_tier}</code>` : ''}${s.min_gap_m != null ? ` · nominal min. gap ${s.min_gap_m} m` : ''}</p>
  </section>
  <section class="lp-block" data-s="2">
    <p class="lp-k"><span>2</span>Request the conflict</p>
    <p class="lp-line">${C.family} template · ${rq.role_check ? rq.role_check.replaceAll('_',' ') : ''}${rq.geometry_status === 'native_map_verified' ? ' · native-map geometry' : ''}</p>
    <dl class="lp-params">${params}</dl>
    ${win ? `<p class="lp-note">Requested interaction window ${fmt(win[0],1)}–${fmt(win[1],1)} s (shaded on the timeline). Orange lines: the target's guided plan at each 0.5 s replan; blue dotted: the ego planner's latest plan.</p>` : ''}
  </section>
  <section class="lp-block" data-s="3">
    <p class="lp-k"><span>3</span>Modulate pressure</p>
    <p class="lp-eq">λ<sub>t</sub> = b<sub>m</sub>·α·p<sub>c</sub>·e<sup>β(1−2q<sub>t</sub>)</sup> &nbsp;<span>b<sub>m</sub>=${st.base_pressure_b_m} · α=${st.scale_alpha} · p<sub>c</sub>=${fmt(st.prior_factor_p_c,2)} · β=${st.beta}</span></p>
    <div class="lp-live" id="lp-live"></div>
    <canvas class="lp-chart" id="lp-chart"></canvas>
    <p class="lp-note">Logged at every replan. Higher proximity q<sub>t</sub> lowers further contact pressure. Logged range ${fmt(st.logged_range[0],2)}–${fmt(st.logged_range[1],2)}${st.range_check ? ' ✓ matches the run record' : ''}.</p>
  </section>`;
  panel.querySelectorAll('.lp-block').forEach(b => b.onclick = () => { forced = forced == +b.dataset.s ? 0 : +b.dataset.s; });
}
stepsEl.querySelectorAll('li').forEach(li => li.onclick = () => {
  const s = +li.dataset.s; forced = 0;
  t = s === 1 ? -PRE : s === 2 ? 0 : Math.max(0, Math.min(1.5, (C.first_contact_s ?? total())*.45));
  playing = true; playBtn.textContent = 'Ⅱ Pause';
});
playBtn.onclick = () => { playing = !playing; playBtn.textContent = playing ? 'Ⅱ Pause' : '▶ Play'; if(playing && t >= end()) t = -PRE; };
document.querySelectorAll('#lab-speed button').forEach(b => b.onclick = () => { document.querySelectorAll('#lab-speed button').forEach(x => x.classList.toggle('on', x === b)); speed = +b.dataset.v; });
range.oninput = () => { t = -PRE + (range.value/1000) * (end() + PRE); playing = false; playBtn.textContent = '▶ Play'; };

function resize(){ view = fit(cv); sview = fit(strip); }
addEventListener('resize', () => { resize(); cmpResize(); });
new IntersectionObserver(e => visible = e[0].isIntersecting).observe(lab);

function drawChart(cvs, tt){
  const r = fit(cvs), { ctx, w, h } = r, st = C.strength.steps, T = total(), pad = { l: 30, r: 34, t: 10, b: 18 };
  const lmax = Math.max(...st.map(s => s.lambda)) * 1.15, X = x => pad.l + x/T*(w-pad.l-pad.r), Y = v => pad.t + (1 - v/lmax)*(h-pad.t-pad.b), Q = q => pad.t + (1-q)*(h-pad.t-pad.b);
  ctx.clearRect(0,0,w,h); ctx.font = '10px "Geist Mono", monospace';
  ctx.strokeStyle = 'rgba(175,185,225,.12)'; ctx.lineWidth = 1;
  for(let i=0;i<=4;i++){ const y = pad.t + i*(h-pad.t-pad.b)/4; ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(w-pad.r,y); ctx.stroke(); }
  ctx.fillStyle = COL.mute; ctx.textAlign = 'right'; ctx.fillText(lmax.toFixed(0), pad.l-6, pad.t+8); ctx.fillText('0', pad.l-6, h-pad.b);
  ctx.textAlign = 'left'; ctx.fillText('1', w-pad.r+6, pad.t+8); ctx.fillText('0', w-pad.r+6, h-pad.b);
  const win = C.request.interaction_window_s; if(win){ ctx.fillStyle = 'rgba(123,224,195,.07)'; ctx.fillRect(X(win[0]), pad.t, X(Math.min(win[1],T))-X(win[0]), h-pad.t-pad.b); }
  // q_t (secondary axis)
  ctx.strokeStyle = 'rgba(170,164,255,.9)'; ctx.setLineDash([3,3]); ctx.lineWidth = 1.4; ctx.beginPath();
  st.forEach((s,i) => { const x = X(s.t), y = Q(s.q); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); }); ctx.stroke(); ctx.setLineDash([]);
  // λ_t step function
  ctx.strokeStyle = COL.tgt; ctx.lineWidth = 2; ctx.beginPath();
  st.forEach((s,i) => { const x = X(s.t), y = Y(s.lambda), xn = X(i < st.length-1 ? st[i+1].t : T); i ? ctx.lineTo(x,y) : ctx.moveTo(x,y); ctx.lineTo(xn,y); }); ctx.stroke();
  if(C.first_contact_s != null){ ctx.strokeStyle = COL.hit; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(C.first_contact_s), pad.t); ctx.lineTo(X(C.first_contact_s), h-pad.b); ctx.stroke(); }
  if(tt >= 0){ ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(Math.min(tt,T)), pad.t); ctx.lineTo(X(Math.min(tt,T)), h-pad.b); ctx.stroke(); }
  ctx.fillStyle = COL.tgt; ctx.fillText('λt', pad.l+4, h-4); ctx.fillStyle = 'rgba(170,164,255,.95)'; ctx.fillText('q t (proximity)', pad.l+26, h-4);
}
function drawStrip(tt){
  const { ctx, w, h } = sview, T = end() + PRE, X = x => (x + PRE)/T*w;
  ctx.clearRect(0,0,w,h);
  ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(0, h/2-3, w, 6);
  ctx.fillStyle = 'rgba(255,138,61,.16)'; ctx.fillRect(0, h/2-3, X(0), 6);       // selection pre-roll
  const win = C.request.interaction_window_s; if(win){ ctx.fillStyle = 'rgba(123,224,195,.35)'; ctx.fillRect(X(win[0]), h/2-3, X(Math.min(win[1], end())) - X(win[0]), 6); }
  C.strength.steps.forEach(s => { if(s.t <= end()){ ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(X(s.t)-.5, h/2-7, 1, 14); } });
  if(C.first_contact_s != null){ ctx.fillStyle = COL.hit; ctx.beginPath(); ctx.arc(X(C.first_contact_s), h/2, 4.5, 0, Math.PI*2); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.fillRect(X(tt)-1, 2, 2, h-4);
  range.value = Math.round((tt + PRE)/T*1000);
}
function updateHud(tt, k){
  const st = stepOf(tt);
  stepsEl.querySelectorAll('li').forEach(li => li.classList.toggle('on', +li.dataset.s === st));
  panel.querySelectorAll('.lp-block').forEach(b => b.classList.toggle('on', +b.dataset.s === st));
  const gap = tt < 0 ? C.gap[0] : C.gap[k], L = lambdaAt(C, Math.max(0, tt));
  const contact = C.first_contact_s != null && tt >= C.first_contact_s - 1e-6;
  hud.innerHTML = `<span class="mono">${tt < 0 ? 'selection' : `t = ${tt.toFixed(1)} s`}</span><span>body gap <b>${contact ? '0.00' : fmt(gap)}</b> m</span>` +
    (tt >= 0 ? `<span>λ<sub>t</sub> <b>${fmt(L.lambda)}</b></span>` : '') + (contact ? '<span class="hit">first target contact</span>' : '');
  const live = document.getElementById('lp-live');
  if(live) live.innerHTML = tt < 0 ? '<span class="muted">starts with the rollout</span>' :
    `<div><dt>λ<sub>t</sub></dt><dd>${fmt(L.lambda)}</dd></div><div><dt>q<sub>t</sub></dt><dd>${fmt(L.q)}</dd></div><div><dt>t<sub>c</sub></dt><dd>${fmt(L.tc,1)} s</dd></div><div><dt>d<sub>c</sub></dt><dd>${fmt(L.dc,1)} m</dd></div>`;
}

/* ---------------- planner comparison ---------------- */
const grid = document.getElementById('cmp-grid'), CMP = ['eval150_013_diffusion_planner','eval150_013_flow_planner','eval150_013_idm','eval150_013_pdm_closed'];
let cmpCases = [], cmpViews = [], ct = 0, cmpVisible = false;
if(grid){
  grid.innerHTML = CMP.map(id => `<figure class="cmp-cell"><canvas></canvas><figcaption><b></b><span></span></figcaption></figure>`).join('');
  Promise.all(CMP.map(load)).then(cs => { cmpCases = cs; cs.forEach((c,i) => { const fc = grid.children[i].querySelector('figcaption');
    fc.querySelector('b').textContent = c.planner; fc.querySelector('span').innerHTML = c.first_contact_s != null ? `<em class="hit">contact at ${c.first_contact_s.toFixed(1)} s</em>` : '<em class="ok">avoided · no target contact</em>'; }); cmpResize(); });
  new IntersectionObserver(e => cmpVisible = e[0].isIntersecting).observe(grid);
}
function cmpResize(){ if(grid) cmpViews = [...grid.querySelectorAll('canvas')].map(fit); }

/* ---------------- loop ---------------- */
function loop(now){
  const dt = Math.min(.1, (now - last)/1000); last = now;
  if(C && visible && view){
    if(playing){ t += dt*speed; if(t > end() + HOLD) t = -PRE; }
    const tt = Math.min(t, end()), k = drawScene(view.ctx, view.w, view.h, C, tt, { step: stepOf(tt) });
    drawStrip(tt); updateHud(tt, k);
    const ch = document.getElementById('lp-chart'); if(ch) drawChart(ch, tt);
  }
  if(cmpVisible && cmpCases.length === 4 && cmpViews.length === 4){
    ct += dt; const T = 4.2; if(ct > T + HOLD) ct = 0;
    cmpCases.forEach((c,i) => { const v = cmpViews[i], tc = Math.min(ct, T, c.first_contact_s ?? T); drawScene(v.ctx, v.w, v.h, c, tc, { compact: true, pad: 8 });
      v.ctx.font = '11px "Geist Mono", monospace'; v.ctx.fillStyle = 'rgba(230,232,242,.8)'; v.ctx.textAlign = 'left'; v.ctx.fillText(`t = ${tc.toFixed(1)} s`, 10, 16); });
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------------- VLM cards ---------------- */
const vg = document.getElementById('vlm-grid');
if(vg) fetch('data/vlm_cases.json').then(r => r.json()).then(d => {
  vg.innerHTML = d.cases.map(c => {
    const flag = /footnote †/.test(c.verdict) ? ['†','Cites a “normal range” without a supplied threshold'] : /footnote ‡/.test(c.verdict) ? ['‡','States 0.67 m where the supplied maximum is 0.698 m'] : null;
    return `<article class="vlm-card">
      <div class="vlm-img"><img src="${(c.images_dark||c.images)[0]}" alt="Six-frame overview: ${c.mechanism}, ${c.planner}" loading="lazy"></div>
      <div class="vlm-body">
        <p class="vlm-k">${c.mechanism} · ${c.dataset} · ${c.planner}</p>
        <p class="vlm-label"><span class="ok">● ${c.fields.label_en}</span>${c.overlap_s && c.overlap_s !== 'none' ? `<span class="muted">overlap ${c.overlap_s} s</span>` : '<span class="muted">no overlap</span>'}</p>
        <p class="vlm-en">“${c.vlm_excerpt_en_paper}”</p>
        <details><summary>Original model output (Chinese)</summary><p class="vlm-zh">${c.vlm_excerpt_zh}</p></details>
        ${flag ? `<p class="vlm-flag"><b>${flag[0]}</b>${flag[1]}</p>` : ''}
      </div></article>`; }).join('');
});
})();
