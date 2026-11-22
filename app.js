/* CrashDojo project page — no dependencies */
(() => {
const C = { ego:'#4f8cff', tgt:'#ff8a3d', hit:'#ff4d5e', bg:'#6c7288', road:'#121622', lane:'rgba(200,210,240,.28)', grid:'rgba(160,170,210,.07)' };
const DPR = Math.min(window.devicePixelRatio || 1, 2);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const L = 4.6, W = 1.9; // vehicle box (m)

/* ---------- nav + placeholders ---------- */
const nav = document.querySelector('.nav');
const prog = document.querySelector('.nav-progress');
const navLinks = [...document.querySelectorAll('.nav-links a')];
const navTargets = navLinks.map(a => document.querySelector(a.getAttribute('href')));
function onScroll(){
  nav.classList.toggle('scrolled', scrollY > 40);
  const max = document.documentElement.scrollHeight - innerHeight;
  prog.style.setProperty('--p', max > 0 ? (scrollY / max).toFixed(4) : 0);
  let cur = -1; navTargets.forEach((t,i) => { if (t && t.getBoundingClientRect().top < innerHeight*.35) cur = i; });
  navLinks.forEach((a,i) => a.classList.toggle('active', i === cur));
}
addEventListener('scroll', onScroll, { passive:true }); onScroll();
document.querySelectorAll('[data-todo]').forEach(a => a.addEventListener('click', e => {
  if (a.getAttribute('href') === '#') { e.preventDefault(); toast('Link will be added at release.'); }
}));
function toast(msg){
  let t = document.querySelector('.toast');
  if(!t){ t = document.createElement('div'); t.className='toast';
    Object.assign(t.style,{position:'fixed',bottom:'28px',left:'50%',transform:'translateX(-50%)',background:'#f1f2f8',color:'#0a0c12',padding:'10px 18px',borderRadius:'99px',fontSize:'14px',zIndex:99,transition:'opacity .3s'});
    document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = 1; clearTimeout(t._h); t._h = setTimeout(()=>t.style.opacity=0, 1800);
}

/* ---------- helpers ---------- */
const clamp = (x,a,b) => Math.max(a, Math.min(b, x));
const S = u => { u = clamp(u,0,1); return 10*u**3 - 15*u**4 + 6*u**5; }; // quintic from the paper
function fitCanvas(cv){
  const r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width*DPR); cv.height = Math.round(r.height*DPR);
  const ctx = cv.getContext('2d'); ctx.setTransform(DPR,0,0,DPR,0,0); return { ctx, w:r.width, h:r.height };
}
function car(ctx, x, y, h, s, color, outline=false, alpha=1){
  ctx.save(); ctx.translate(x,y); ctx.rotate(h); ctx.globalAlpha = alpha;
  const l = L*s, w = W*s, r = Math.max(2, .35*s);
  ctx.beginPath(); ctx.roundRect(-l/2,-w/2,l,w,r);
  if(outline){ ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke(); }
  else{
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(10,12,20,.55)';
    ctx.fillRect(l*.12, -w*.36, l*.16, w*.72);   // windshield
    ctx.fillRect(-l*.38, -w*.32, l*.1, w*.64);   // rear glass
  }
  ctx.restore();
}
function dashed(ctx, pts, color, width=2){
  if(pts.length < 2) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash([7,6]); ctx.globalAlpha=.85;
  ctx.beginPath(); pts.forEach((p,i)=> i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.stroke(); ctx.restore();
}
function ring(ctx, x, y, k){
  for(let i=0;i<2;i++){
    const p = (k + i*.5) % 1;
    ctx.beginPath(); ctx.arc(x,y, 10 + p*42, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(255,77,94,${.9*(1-p)})`; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(x,y,9,0,Math.PI*2); ctx.strokeStyle=C.hit; ctx.lineWidth=2.5; ctx.stroke();
}
function heading(f, t){ const a=f(Math.max(0,t-.05)), b=f(t+.05); return Math.atan2(b[1]-a[1], b[0]-a[0]); }

/* ---------- hero: endless highway with periodic cut-ins ---------- */
const hcv = document.getElementById('hero-canvas'); let hv;
function resizeHero(){ hv = fitCanvas(hcv); } addEventListener('resize', resizeHero); resizeHero();
const LANES = [-7,-3.5,0,3.5,7], EGO_V = 9;
const traffic = Array.from({length:22}, (_,i)=>({ lane: LANES[i%5], x: -60 + (i*37)%180 + (i%3)*6, v: 6.5 + (i*7%5)*.6 }));
// Five schematic request families, target position relative to the ego (dx ahead, y left) at time k in a 6.5 s cycle.
const lanesBetween = (y0) => LANES.filter(l => l !== 0 && Math.sign(l) === Math.sign(y0) && Math.abs(l) <= Math.abs(y0));
function mech(name, pos, extra={}){
  const m = { name, pos, cross:false, clear:(lane,dx)=>lanesBetween(pos(0)[1]).includes(lane) && dx>-8 && dx<34, ...extra };
  // first contact: boxes overlap (crossing target is rotated 90 degrees)
  const hx = m.cross ? (L+W)/2 : L, hy = m.cross ? (L+W)/2 : W;
  m.hit = 6; for(let q=0;q<6;q+=.01){ const p = pos(q); if(Math.abs(p[0])<hx && Math.abs(p[1])<hy){ m.hit=q; break; } }
  return m;
}
const MECHS = [
  mech('Cut-in', k => [16-3.2*k, 3.5 - 3.15*S((k-1.2)/3.2)]),
  mech('Lead braking', k => { const a = 4, kb = Math.max(0, k-1), ts = EGO_V/a, d = kb < ts ? .5*a*kb*kb : .5*a*ts*ts + EGO_V*(kb-ts); return [24 - d, 0]; }, { clear:(lane,dx)=>false }),
  mech('Crossing', k => [32 - EGO_V*k, -22 + 6.9*k], { cross:true, road:k => 32 - EGO_V*k,
    clear:(lane,dx,k)=>Math.abs(dx-(32-EGO_V*k))<9 }),
  mech('Partial intrusion', k => [7-1.6*k, -3.5 + 1.75*S((k-0.8)/3.0)]),
  mech('Merge', k => [21-4.2*k, 7 - 7*S((k-0.6)/3.6)]),
  mech('Cut-in', k => [16-3.2*k, -3.5 + 3.15*S((k-1.2)/3.2)]),
];
const heroTag = document.querySelector('.hero-legend .muted');
const HITSUM = MECHS.reduce((a,m)=>a+m.hit,0);
// World time advances only until first contact in each cycle, so the scene freezes on contact.
const worldClock = (idx, kk) => Math.floor(idx/MECHS.length)*HITSUM + MECHS.slice(0, idx%MECHS.length).reduce((a,m)=>a+m.hit,0) + kk;
function drawHero(now){
  const {ctx,w,h} = hv, cyc = 6.5, k = (now/1000) % cyc, idx = Math.floor(now/1000/cyc);
  const s = clamp(w/62, 14, 30);
  const T = worldClock(idx, Math.min(k, MECHS[idx % MECHS.length].hit));
  const egoX = EGO_V*T;
  const ang = -0.17;
  ctx.clearRect(0,0,w,h);
  ctx.save(); ctx.translate(w*.66, h*.55); ctx.rotate(ang);
  const P = (x,y) => [(x-egoX)*s, -y*s];
  // road
  ctx.fillStyle = C.road; ctx.fillRect(-w*1.5, -8.75*s, w*3, 17.5*s);
  ctx.strokeStyle = C.lane; ctx.lineWidth = 1.2;
  for(const y of [-5.25,-1.75,1.75,5.25]){ ctx.setLineDash([12,14]); ctx.lineDashOffset = (egoX*s)%26; ctx.beginPath(); ctx.moveTo(-w*1.5,-y*s); ctx.lineTo(w*1.5,-y*s); ctx.stroke(); }
  ctx.setLineDash([]); for(const y of [-8.75,8.75]){ ctx.beginPath(); ctx.moveTo(-w*1.5,-y*s); ctx.lineTo(w*1.5,-y*s); ctx.stroke(); }
  // dotted shoulder grid
  ctx.fillStyle = C.grid; const gs=3*s, off=(egoX*s)%gs;
  for(let x=-w*1.5-off; x<w*1.5; x+=gs) for(let y=9.5*s; y<h*1.2; y+=gs){ ctx.fillRect(x,y,1.4,1.4); ctx.fillRect(x,-y,1.4,1.4); }
  // this cycle's mechanism (target position relative to the ego, in m)
  const M = MECHS[idx % MECHS.length], hitT = M.hit;
  if(M.cross){ const rx = M.road(Math.min(k,hitT)), q = P(egoX+rx, 0); ctx.fillStyle = C.road; ctx.fillRect(q[0]-3.6*s, -h*1.2, 7.2*s, h*2.4);
    ctx.strokeStyle = C.lane; ctx.lineWidth = 1.2; ctx.setLineDash([12,14]); ctx.beginPath(); ctx.moveTo(q[0], -h*1.2); ctx.lineTo(q[0], h*1.2); ctx.stroke(); ctx.setLineDash([]);
    for(const e of [-3.6,3.6]){ ctx.beginPath(); ctx.moveTo(q[0]+e*s, -h*1.2); ctx.lineTo(q[0]+e*s, -8.75*s); ctx.moveTo(q[0]+e*s, 8.75*s); ctx.lineTo(q[0]+e*s, h*1.2); ctx.stroke(); } }
  // background traffic (wraps around ego), kept clear of the target's path
  for(const c of traffic){ let x = c.x + c.v*T; const span=180; x = egoX - 90 + ((x - egoX + 90) % span + span) % span;
    const dx = x - egoX; if(c.lane===0 && Math.abs(dx)<30) continue; if(M.clear(c.lane, dx, Math.min(k,hitT))) continue;
    const p=P(x,c.lane); car(ctx,p[0],p[1],0,s,C.bg,true,.75); }
  // ego dashed plan ahead
  ctx.save(); ctx.strokeStyle=C.ego; ctx.globalAlpha=.6; ctx.setLineDash([6,7]); ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(L*s*.6,0); ctx.lineTo(18*s,0); ctx.stroke(); ctx.restore();
  const kk = Math.min(k,hitT), r = M.pos(kk), pt = P(egoX + r[0], r[1]);
  const a0 = M.pos(Math.max(0,kk-.05)), a1 = M.pos(kk+.05);
  const hd = M.cross ? -Math.sign(a1[1]-a0[1]||1)*Math.PI/2 : Math.atan2(-(a1[1]-a0[1]), Math.max((a1[0]-a0[0]) + EGO_V*.1, .05));
  car(ctx, pt[0], pt[1], hd, s, C.tgt, false, k > cyc-.5 ? (cyc-k)/.5 : (k<.4? k/.4:1));
  const pe = P(egoX,0); car(ctx, pe[0], pe[1], 0, s, C.ego);
  if(k > hitT && k < cyc-.3) ring(ctx, (pe[0]+pt[0])/2, (pe[1]+pt[1])/2, (k-hitT)/1.1);
  if(heroTag && heroTag.dataset.m !== M.name){ heroTag.dataset.m = M.name; heroTag.textContent = 'Schematic · ' + M.name; }
  ctx.restore();
}

/* ---------- main loop ---------- */
let heroVisible = true;
new IntersectionObserver(e=>heroVisible=e[0].isIntersecting).observe(hcv);
function frame(now){
  if(heroVisible) drawHero(reduce ? 2600 : now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- results ---------- */
const COLS = ['Ego CR','Target CR','Target–BG','Body OR','W₁','JSD','MMD','ADE','FDE'];
const UP = [true,true,false,false,false,false,false,false,false];
const D = {
 nuPlan:{
  learn:{ CrashDojo:[57.50,34.50,10.50,1.11,.03799,.01383,.05873,.750,1.519], 'SAFE-SIM':[55.50,34.50,20.00,3.97,.04138,.01523,.06048,.791,1.654], 'CCDiff-DDPM':[21.50,7.50,52.00,11.63,.06649,.02590,.08386,.949,2.278], 'CCDiff-FM':[25.00,7.50,43.50,7.54,.06280,.02486,.07537,.922,2.096] },
  rule:{ CrashDojo:[59.00,9.67,18.67,1.79,.03672,.01360,.06437,1.058,2.176], 'SAFE-SIM':[54.33,9.67,26.00,5.22,.04068,.01518,.06811,1.048,2.221], 'CCDiff-DDPM':[35.33,6.67,53.00,11.81,.06630,.02676,.09021,1.194,2.742], 'CCDiff-FM':[33.67,4.00,43.33,7.69,.06193,.02445,.08285,1.163,2.569] } },
 nuScenes:{
  learn:{ CrashDojo:[32.50,20.50,12.00,23.68,.12802,.08937,.11995,2.129,4.789], 'SAFE-SIM':[23.00,11.50,16.00,30.54,.14284,.09887,.12186,2.120,4.809], 'CCDiff-DDPM':[15.50,9.50,31.00,39.90,.14999,.09953,.15001,2.935,7.438], 'CCDiff-FM':[14.50,6.50,30.00,34.96,.15198,.10077,.13675,2.609,6.246] },
  rule:{ CrashDojo:[22.33,7.33,14.00,24.12,.14443,.09918,.14027,2.702,6.601], 'SAFE-SIM':[19.33,8.00,14.67,31.12,.15778,.10700,.14328,2.759,6.768], 'CCDiff-DDPM':[13.67,8.67,33.67,39.58,.16389,.10906,.16841,3.562,9.384], 'CCDiff-FM':[10.67,4.67,31.00,35.25,.16090,.10818,.15427,3.147,7.958] } }
};
const CHARTS = [[1,'Initial-target contact','% · higher = harder test'],[2,'Target–background contact','% · lower = fewer side effects'],[3,'Target body off-road','% · lower'],[0,'Ego contact, any vehicle','% · higher'],[4,'Motion discrepancy W₁','lower = more natural'],[8,'Final displacement FDE','m · lower']];
let ds='nuPlan', pc='learn';
const fmt = (v,i) => i<4 ? v.toFixed(2) : i<7 ? v.toFixed(4) : v.toFixed(3);
function best(rows,i){ const vals=Object.values(rows).map(r=>r[i]); return UP[i]?Math.max(...vals):Math.min(...vals); }
function renderResults(){
  const rows = D[ds][pc], el = document.getElementById('charts');
  el.innerHTML = CHARTS.map(([i,title,sub]) => {
    const mx = Math.max(...Object.values(rows).map(r=>r[i])), b = best(rows,i);
    return `<div class="chart"><div class="chart-h"><h4>${title}</h4><span>${sub}</span></div>` +
      Object.entries(rows).map(([n,r]) => `<div class="bar-row ${n==='CrashDojo'?'me':''}"><span class="lbl">${n}</span><div class="track"><div class="fill" data-w="${(r[i]/mx*100).toFixed(1)}"></div></div><span class="val">${fmt(r[i],i)}${r[i]===b?'<span class="best-badge">★</span>':''}</span></div>`).join('') + '</div>';
  }).join('');
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.querySelectorAll('.fill').forEach(f=>f.style.width=f.dataset.w+'%')));
  document.getElementById('full-table').innerHTML =
    `<thead><tr><th>Method</th>${COLS.map((c,i)=>`<th>${c} ${UP[i]?'↑':'↓'}</th>`).join('')}</tr></thead><tbody>` +
    Object.entries(rows).map(([n,r]) => `<tr class="${n==='CrashDojo'?'me':''}"><td>${n}</td>${r.map((v,i)=>`<td>${v===best(rows,i)?`<b>${fmt(v,i)}</b>`:fmt(v,i)}</td>`).join('')}</tr>`).join('') + '</tbody>';
}
function seg(id, cb){ const s=document.getElementById(id); s.querySelectorAll('button').forEach(b=>b.onclick=()=>{ s.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); cb(b.dataset.v); }); }
seg('seg-data', v=>{ds=v;renderResults();}); seg('seg-class', v=>{pc=v;renderResults();});
renderResults();

/* ---------- ablation (final component study, mean ± s.d., 3 seeds) ---------- */
const ABL = {
 idm:[['A0 · Full CrashDojo',14.7,2.9,.7827,.0045],['A1 · Random actor',12.3,1.5,.8202,.0052],['A2 · TTC actor',13.3,0.6,.7898,.0057],['A3 · Generic contact pressure',14.0,3.6,.8935,.0115],['A4 · No adversarial guidance',4.3,2.1,.8372,.0040]],
 dp:[['A0 · Full CrashDojo',23.0,1.0,.7857,.0112],['A1 · Random actor',7.7,2.1,.8269,.0030],['A2 · TTC actor',11.0,1.0,.7862,.0073],['A3 · Generic contact pressure',17.3,2.1,.8814,.0083],['A4 · No adversarial guidance',9.0,1.0,.8272,.0147]]
};
let ablP='dp', ablM='cr';
function renderAbl(){
  const el = document.getElementById('abl-bars'), rows = ABL[ablP], cr = ablM==='cr';
  const lo = cr ? 0 : .75, hi = cr ? 30 : .91;            // RM axis zoomed so differences are visible
  const pct = v => clamp((v-lo)/(hi-lo)*100, 0, 100);
  el.innerHTML = rows.map(([n,c,cs,r,rs],i)=>{
    const v = cr?c:r, sd = cr?cs:rs, txt = cr ? `${c.toFixed(1)} ± ${cs.toFixed(1)} %` : `${r.toFixed(4)} ± ${rs.toFixed(4)}`;
    return `<div class="abl-row ${i===0?'full':''}"><div class="top"><span>${n}</span><span>${txt}</span></div><div class="bar"><i data-w="${pct(v)}"></i><b class="sd" style="left:${pct(v-sd)}%;width:${pct(v+sd)-pct(v-sd)}%"></b></div></div>`;
  }).join('') + (cr?'':'<p class="muted small" style="margin-top:10px">Axis starts at 0.75 to show differences.</p>');
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.querySelectorAll('[data-w]').forEach(b=>b.style.width=b.dataset.w+'%')));
}
seg('seg-abl', v=>{ablP=v;renderAbl();}); seg('seg-metric', v=>{ablM=v;renderAbl();}); renderAbl();
renderAbl('dp');

/* ---------- counters, reveal, bibtex ---------- */
const io = new IntersectionObserver(es => es.forEach(e => { if(!e.isIntersecting) return; e.target.classList.add('in');
  const b = e.target.querySelector?.('[data-count]'); io.unobserve(e.target); }), { threshold:.15 });
document.querySelectorAll('.section .wrap > *, .stats').forEach(el => { el.classList.add('reveal'); io.observe(el); });
const cio = new IntersectionObserver(es => es.forEach(e => { if(!e.isIntersecting) return; cio.unobserve(e.target);
  const el = e.target, to = +el.dataset.to, dec = +(el.dataset.dec || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || '', t0 = performance.now();
  const step = now => { const u = clamp((now-t0)/1400,0,1), v = to*(1-(1-u)**3); el.textContent = pre + v.toFixed(dec) + suf; if(u<1) requestAnimationFrame(step); };
  if(!reduce) requestAnimationFrame(step); }), { threshold:.4 });
document.querySelectorAll('[data-to]').forEach(el => cio.observe(el));
document.getElementById('copy-bib').onclick = async e => { try{ await navigator.clipboard.writeText(document.getElementById('bibtex').textContent); e.target.textContent='Copied ✓'; }catch{ e.target.textContent='Select & copy'; } setTimeout(()=>e.target.textContent='Copy',1600); };
})();

/* ---------- effects (2026-11-22) ---------- */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Cursor spotlight on cards
  document.querySelectorAll('.q-card,.abl-note,.abl-card,.paper-fig,.cmp-cell,.vlm-card').forEach(el => {
    el.classList.add('fx-host'); const g = document.createElement('span'); g.className = 'fx-glow'; el.prepend(g);
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px'); });
  });
  if (reduce) return;
  // Hero title: split into letters (gradient span keeps its gradient per letter)
  const h1 = document.querySelector('.hero h1'); let i = 0;
  const split = node => [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) { const f = document.createDocumentFragment();
      [...n.textContent].forEach(c => { const s = document.createElement('span'); s.className = 'ch'; s.style.setProperty('--i', i++); s.textContent = c; f.append(s); });
      n.replaceWith(f); }
    else if (n.classList && n.classList.contains('grad')) { n.classList.add('ch'); n.style.setProperty('--i', i++ + 1); }
    else split(n); });
  if (h1) split(h1);
  // Section headings: split into words
  document.querySelectorAll('.section h2').forEach(h => { let k = 0;
    const walk = node => [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) { const f = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(t => { if (!t) return; if (/^\s+$/.test(t)) { f.append(t); return; }
          const s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--i', k++); s.textContent = t; f.append(s); });
        n.replaceWith(f); }
      else if (n.nodeName !== 'BR') walk(n); });
    walk(h); });
  // Figures tilt toward the cursor
  document.querySelectorAll('.paper-fig').forEach(el => {
    el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      el.style.setProperty('--ry', (x * 3).toFixed(2) + 'deg'); el.style.setProperty('--rx', (-y * 3).toFixed(2) + 'deg'); });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg'); });
  });
})();
