/* ============================================================
   ELMI CPO Dashboard — compute engine
   Sessions, filtering, KPIs, utilization. All pure functions.
   ============================================================ */
(function(){
const A = {}; // namespace
window.ELMI = window.ELMI || {};
window.ELMI.compute = A;

// ---------- math helpers ----------
const sum = a => a.reduce((s,x)=>s+x,0);
const mean = a => a.length ? sum(a)/a.length : 0;
function median(a){ if(!a.length) return 0; const b=[...a].sort((x,y)=>x-y); const m=b.length>>1; return b.length%2?b[m]:(b[m-1]+b[m])/2; }
function percentile(a,p){ if(!a.length) return 0; const b=[...a].sort((x,y)=>x-y); const idx=(b.length-1)*p/100; const lo=Math.floor(idx),hi=Math.ceil(idx); if(lo===hi) return b[lo]; return b[lo]+(b[hi]-b[lo])*(idx-lo); }
A.sum=sum; A.mean=mean; A.median=median; A.percentile=percentile;

const MS_DAY=86400000, MS_MIN=60000;
function ymd(t){ const d=new Date(t); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); }
function weekdayMon(t){ return (new Date(t).getUTCDay()+6)%7; } // 0=Mon..6=Sun
function minuteOfDay(t){ const d=new Date(t); return d.getUTCHours()*60+d.getUTCMinutes(); }
function hourOf(t){ return new Date(t).getUTCHours(); }
A.ymd=ymd; A.weekdayMon=weekdayMon; A.minuteOfDay=minuteOfDay; A.hourOf=hourOf;

A.WD = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
A.STATUSES = ['Available','Charging','Finishing','Preparing','Starting'];
A.dayLabel = function(day){ const t=Date.parse(day+'T00:00:00Z'); return A.WD[weekdayMon(t)]+' '+day.slice(8)+'.'+day.slice(5,7)+'.'; };
A.dayShort = function(day){ const t=Date.parse(day+'T00:00:00Z'); return A.WD[weekdayMon(t)]+' '+day.slice(8)+'.'+day.slice(5,7)+'.'; };

// ---------- DB ----------
let DB = null;
A.setDB = function(db){ DB = db;
  for(const r of db.rows){ r.day=ymd(r.t); r.wd=weekdayMon(r.t); r.mod=minuteOfDay(r.t); r.hr=hourOf(r.t); }
  // distinct days present
  A.allDays = [...new Set(db.rows.map(r=>r.day))].sort();
};
A.getDB = ()=>DB;

// ---------- default state ----------
A.defaultState = function(){
  return {
    dateFrom: A.allDays[0], dateTo: A.allDays[A.allDays.length-1],
    tFrom: 0, tTo: 1440,
    weekdays: [true,true,true,true,true,true,true],
    cp: 'both',
    statuses: {Available:true,Charging:true,Finishing:true,Preparing:true,Starting:true},
    pct: 'none'
  };
};

// ---------- core filter ----------
// scope = date/time/weekday window. guns from cp.
A.guns = s => s.cp==='both'?['g1','g2'] : (s.cp==='cp1'?['g1']:['g2']);
A.gunLabel = g => g==='g1'?'CP1':'CP2';

function inScope(r,s){
  if(r.day < s.dateFrom || r.day > s.dateTo) return false;
  if(!s.weekdays[r.wd]) return false;
  if(r.mod < s.tFrom || r.mod >= s.tTo) return false;
  return true;
}
function statusAllowed(r,s){
  const allOn = A.STATUSES.every(k=>s.statuses[k]);
  if(allOn) return true;
  const guns=A.guns(s);
  for(const g of guns){ const st=r[g+'_st']; if(st && s.statuses[st]) return true; }
  return false;
}

// Main compute — returns big metrics object
A.run = function(s){
  const rows = DB.rows;
  const guns = A.guns(s);
  const nGuns = guns.length;

  // scope rows (date/time/weekday)
  const scope = [];
  for(const r of rows) if(inScope(r,s)) scope.push(r);

  // percentile threshold on combined DC power among charging-ish rows in scope
  let pctThresh = 0;
  if(s.pct!=='none'){
    const p = +s.pct.slice(1);
    const dcvals = scope.map(r=>guns.reduce((a,g)=>a+Math.max(0,r[g+'_kw']),0)).filter(v=>v>0.5);
    pctThresh = percentile(dcvals,p);
  }
  function passPct(r){ if(s.pct==='none') return true; const dc=guns.reduce((a,g)=>a+Math.max(0,r[g+'_kw']),0); return dc>=pctThresh; }

  // selected = scope ∩ status ∩ pct  (for info counter + masked distributions)
  const selected = scope.filter(r=>statusAllowed(r,s) && passPct(r));

  const days = [...new Set(scope.map(r=>r.day))].sort();
  const D = days.length || 1;
  const scopeMin = scope.length;
  const scopeHours = scopeMin/60;

  // ---- energy via first/last meter reading in scope (correct for cumulative meters) ----
  const scopeSet = new Set(scope.map(r=>r.t));
  // meterDelta: sum of positive consecutive deltas for a field in an array of rows.
  // A naive last-first subtraction breaks when the cumulative meter resets
  // (firmware update / meter swap / rollover) inside the window — the whole
  // result would go negative and get clamped to 0. Summing forward steps and
  // resuming from the post-reset value survives any number of resets. A single
  // implausible spike (corrupt sample, e.g. a decimal-shifted reading) would
  // otherwise inflate the sum hugely, so a step is only counted if the implied
  // power stays under a generous physical ceiling — bad samples are skipped
  // entirely (not used as a new reference point) rather than counted or reset on.
  const METER_MAX_KW = 600;
  function meterDelta(arr, field){
    const allPts = arr.map(r=>({v:r[field], t:r.t})).filter(p=>p.v!=null);
    if(allPts.length<2) return 0;
    const firstV = allPts[0].v, lastV = allPts[allPts.length-1].v;
    if(lastV >= firstV) return lastV - firstV;
    const pts = allPts.filter(p=>p.v>0);
    if(pts.length<2) return 0;
    let e=0, last=pts[0];
    for(let i=1;i<pts.length;i++){
      const p=pts[i];
      const d = p.v - last.v;
      if(d<=0){ last=p; continue; }
      const dtMin = (p.t-last.t)/60000;
      const impliedKw = dtMin>0 ? (d/dtMin)*60 : Infinity;
      if(impliedKw>METER_MAX_KW) continue;
      e+=d; last=p;
    }
    return e;
  }
  const acKwh = meterDelta(scope,'ac_kwh');
  const gunKwh = {g1:meterDelta(scope,'g1_kwh'), g2:meterDelta(scope,'g2_kwh')};
  const dcKwh = guns.reduce((a,g)=>a+gunKwh[g],0);

  // ---- sessions per gun over scope (contiguous active minutes) ----
  const sessions = []; // {gun, startT, endT, durMin, kwh, maxKw, avgKw, socStart, socEnd}
  for(const g of guns){
    let run=null;
    for(let i=0;i<scope.length;i++){
      const r=scope[i];
      const adjacent = run && (r.t - run.lastT === MS_MIN);
      const active = r[g+'_kw'] > 0.5;
      if(active){
        if(run && adjacent){ run.rows.push(r); run.lastT=r.t; }
        else { if(run) flush(run); run={gun:g,rows:[r],lastT:r.t}; }
      } else {
        if(run){ flush(run); run=null; }
      }
    }
    if(run) flush(run);
    function flush(run){
      const rs=run.rows; const g=run.gun;
      const kws=rs.map(r=>r[g+'_kw']);
      // energy = meter delta across run (sum positive adjacent deltas)
      let e=0; for(let i=0;i<rs.length-1;i++){ e+=Math.max(0,rs[i+1][g+'_kwh']-rs[i][g+'_kwh']); }
      // include trailing minute energy estimate via kw if meter flat? keep meter-based
      if(e===0){ e = mean(kws)*(rs.length/60); }
      const socs = rs.map(r=>r[g+'_soc']).filter(v=>v>0);
      sessions.push({
        gun:g, startT:rs[0].t, endT:rs[rs.length-1].t, durMin:rs.length,
        kwh:e, maxKw:Math.max(...kws), avgKw:mean(kws),
        socStart: socs.length?socs[0]:null, socEnd: socs.length?socs[socs.length-1]:null
      });
    }
  }
  // min session length filter: ignore <2 min blips as "failed/aborted"
  const validSessions = sessions.filter(s=>s.durMin>=2);
  const shortSessions = sessions.filter(s=>s.durMin<2);

  // ---- minute-level activity ----
  let acActiveMin=0, dcActiveGunMin=0, occupiedMin=0;
  const gunActiveMin={g1:0,g2:0}, gunOccupiedMin={g1:0,g2:0};
  let parallelMin=0, singleMin=0, idleMin=0;
  for(const r of scope){
    if(r.ac_kw>1) acActiveMin++;
    let activeGuns=0;
    for(const g of guns){
      const act = r[g+'_kw']>0.5;
      if(act){ gunActiveMin[g]++; dcActiveGunMin++; activeGuns++; }
      const occ = r[g+'_st'] && r[g+'_st']!=='Available';
      if(occ){ gunOccupiedMin[g]++; occupiedMin++; }
    }
    if(activeGuns>=2) parallelMin++;
    else if(activeGuns===1) singleMin++;
    else idleMin++;
  }

  // ---- battery ----
  const batSoc = scope.map(r=>r.bat_soc);
  let batCharge=0, batDischarge=0;
  for(let i=0;i<rows.length-1;i++){ const a=rows[i],b=rows[i+1]; if(!scopeSet.has(a.t)) continue;
    const p=a.bat_kw; const e=p/60; if(p>0) batDischarge+=e; else batCharge+=-e; }
  const batThroughput = batDischarge; // kWh delivered from battery
  const socSwing = batSoc.length ? (Math.max(...batSoc)-Math.min(...batSoc)) : 0;

  // ---- status distribution per gun (over scope) ----
  const statusMin = {g1:{},g2:{}};
  for(const g of ['g1','g2']){ for(const st of A.STATUSES) statusMin[g][st]=0; statusMin[g]['—']=0; }
  for(const r of scope){ for(const g of ['g1','g2']){ const st=r[g+'_st']||'—'; statusMin[g][st]=(statusMin[g][st]||0)+1; } }

  // ---- DC Energy Utilization ----
  // Peak AC grid power in scope = maximum grid capacity available
  const acPeakKw = scope.length ? Math.max(...scope.map(r=>r.ac_kw)) : 90; // fallback 90 kW

  const BATT_KW = 240; // battery charging power baseline (kW)
  // Theoretical max DC energy = (battery baseline + peak AC grid) × nGuns × hours
  const dcEnergyBench = (BATT_KW + acPeakKw) * nGuns * scopeHours;
  // DC Energy Util = actual DC delivered / theoretical maximum
  const dcEnergyUtil = dcEnergyBench ? dcKwh / dcEnergyBench : 0;

  const acMax=90;
  const acEnergyBench = acMax*scopeHours;
  const acEnergyUtil = acEnergyBench? acKwh/acEnergyBench : 0;
  const connTimeUtil = scopeMin? dcActiveGunMin/(scopeMin*nGuns) : 0; // share of gun-minutes active
  const occTimeUtil  = scopeMin? occupiedMin/(scopeMin*nGuns) : 0;
  const acTimeUtil   = scopeMin? acActiveMin/scopeMin : 0;

  // active power means (only active minutes)
  const activeKw = {g1:[],g2:[]};
  for(const r of scope) for(const g of guns){ if(r[g+'_kw']>0.5) activeKw[g].push(r[g+'_kw']); }

  // ---- per-day aggregation ----
  const perDay = days.map(day=>{
    const dr = scope.filter(r=>r.day===day);
    const drSet=new Set(dr.map(r=>r.t));
    let acAct=0,dcAct=0,occ=0;
    const ac=meterDelta(dr,'ac_kwh'), g1=meterDelta(dr,'g1_kwh'), g2=meterDelta(dr,'g2_kwh');
    for(const r of dr){ if(r.ac_kw>1) acAct++; for(const g of guns){ if(r[g+'_kw']>0.5) dcAct++; if(r[g+'_st']&&r[g+'_st']!=='Available') occ++; } }
    const dc = guns.reduce((a,g)=>a+(g==='g1'?g1:g2),0);
    const ds = validSessions.filter(se=>ymd(se.startT)===day);
    const mins = dr.length;
    const hrs = mins/60;
    // Per-day benchmark uses scope-level peak AC (same capacity baseline for all days)
    const dayBench = (BATT_KW + acPeakKw) * nGuns * hrs;
    return { day, ac, g1, g2, dc, sessions:ds.length, energySessions:sum(ds.map(x=>x.kwh)),
      acActiveMin:acAct, dcActiveGunMin:dcAct, occMin:occ, minutes:mins,
      // DC Energy Util per day: same formula as overall, using scope peak AC
      dcEnergyUtil: dayBench ? dc/dayBench : 0,
      acEnergyUtil: hrs? ac/(acMax*hrs):0,
      dcTimeUtil: mins? dcAct/(mins*nGuns):0,
      acTimeUtil: mins? acAct/mins:0 };
  });

  // ---- hourly profile (0-23) over scope ----
  const hourly = Array.from({length:24},(_,h)=>({h, dc:0, starts:0, activeMin:0, ac:0}));
  // Sum per-minute kW readings (each row = 1 min) into hourly buckets
  for(const r of scope){
    const h=r.hr;
    for(const g of guns){
      hourly[h].dc += (r[g+'_kw']||0) / 60; // kW × 1min = kWh
      if(r[g+'_kw']>0.5){ hourly[h].activeMin++; }
    }
    if(r.ac_kw>1) hourly[h].ac++;
  }
  for(const se of validSessions){ hourly[hourOf(se.startT)].starts++; }

  // ---- process quality ----
  // plug-to-power: time from gun becoming occupied (non-Available) to first active power, per session start
  const plug2power=[];
  for(const g of guns){
    // scan scope for transitions
    let occStart=null, awaiting=false;
    for(let i=0;i<scope.length;i++){ const r=scope[i]; const st=r[g+'_st']; const occ=st&&st!=='Available';
      if(occ && !awaiting && r[g+'_kw']<=0.5){ if(occStart===null){occStart=r.t; awaiting=true;} }
      if(r[g+'_kw']>0.5){ if(awaiting && occStart!==null){ plug2power.push((r.t-occStart)/MS_MIN); } awaiting=false; occStart=null; }
      if(!occ){ awaiting=false; occStart=null; }
    }
  }
  // post-charge finishing minutes (Finishing status)
  let finishingMin=0; for(const r of scope) for(const g of guns){ if(r[g+'_st']==='Finishing') finishingMin++; }
  const chargingShareInOcc = occupiedMin? dcActiveGunMin/occupiedMin : 0;
  const failedRate = sessions.length? shortSessions.length/sessions.length : 0;
  const socGains = validSessions.filter(x=>x.socStart!=null&&x.socEnd!=null).map(x=>x.socEnd-x.socStart).filter(v=>v>=0);
  const peakAc = Math.max(0,...scope.map(r=>r.ac_kw));
  const dataCompleteness = (() => {
    // expected minutes in window vs present
    const expPerDay = (s.tTo-s.tFrom);
    const exp = expPerDay * D;
    return exp? scopeMin/exp : 1;
  })();

  const allGunKw = []; const peakDc = Math.max(0, ...scope.map(r=>guns.reduce((a,g)=>a+r[g+'_kw'],0)));

  return {
    s, guns, nGuns, days, D, activeDays: perDay.filter(d=>d.dc>0).length || 1, scope, selected, scopeMin, scopeHours,
    acKwh, dcKwh, gunKwh, g1Kwh:gunKwh.g1, g2Kwh:gunKwh.g2,
    efficiency: acKwh? dcKwh/acKwh : 0, peakAc, peakDc,
    sessions:validSessions, allSessions:sessions, shortSessions,
    sessionCount: validSessions.length,
    sessPerDay: validSessions.length/D,
    sessKwh: validSessions.map(x=>x.kwh),
    sessDur: validSessions.map(x=>x.durMin),
    acActiveMin, dcActiveGunMin, occupiedMin, parallelMin, singleMin, idleMin,
    gunActiveMin, gunOccupiedMin,
    batSocAvg: mean(batSoc), batSocMin: batSoc.length?Math.min(...batSoc):0, batSocMax: batSoc.length?Math.max(...batSoc):0,
    batCharge, batDischarge, batThroughput, socSwing,
    statusMin, hourly, perDay,
    dcEnergyUtil, acEnergyUtil, connTimeUtil, occTimeUtil, acTimeUtil,
    dcEnergyBench, acEnergyBench, acPeakKw, activeKw,
    plug2power, finishingMin, chargingShareInOcc, failedRate, socGains, dataCompleteness,
    pctThresh
  };
};

// formatting helpers
A.fmt = function(v,d){ if(v==null||isNaN(v)) return '–'; d=d==null?0:d; return v.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d}); };
A.pct = function(v,d){ d=d==null?1:d; return A.fmt(v*100,d)+' %'; };
A.dur = function(min){ if(min==null||isNaN(min)) return '–'; min=Math.round(min); const h=Math.floor(min/60), m=min%60; return h>0? h+' h '+String(m).padStart(2,'0')+' min' : m+' min'; };

})();

