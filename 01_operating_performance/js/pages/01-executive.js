/* Tab 1 — Executive Summary */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute; const CH=()=>window.ELMI.charts;
const h = (...a)=>window.ELMI.ui.h(...a);

P.exec = function(M){
  const c=C(), u=U();
  const f=c.fmt, pct=c.pct;
  const perDaySess = M.perDay.map(d=>d.sessions);

  // KPI sections
  const energie = u.kpiGrid('g3',[
    {eb:'AC Input', val:f(M.acKwh,0), unit:'kWh', cap:'Total grid input', grad:true, accentDot:true},
    {eb:'Total DC Output', val:f(M.dcKwh,0), unit:'kWh', cap:'Delivered to vehicles'},
    {eb:'Efficiency', val:pct(M.efficiency,1), cap:'DC delivered ÷ AC input'},
    {eb:'DC · CP1', val:f(M.g1Kwh,0), unit:'kWh', cap:'Charging Point 1'},
    {eb:'DC · CP2', val:f(M.g2Kwh,0), unit:'kWh', cap:'Charging Point 2'},
    {eb:'Peak Power', val:f(M.peakDc,0), unit:'kW', cap:'Highest DC power in period'},
  ]);

  const sessions = u.kpiGrid('g4',[
    {eb:'Sessions', val:f(M.sessionCount,0), cap:'Detected charging sessions', grad:true, accentDot:true},
    {eb:'Avg Sessions / Day', val:f(M.sessPerDay,1), cap:`Median ${f(c.median(perDaySess),0)} / day`},
    {eb:'Avg Energy / Session', val:f(c.mean(M.sessKwh),1), unit:'kWh', cap:`Median ${f(c.median(M.sessKwh),1)} kWh`},
    {eb:'Avg Duration / Session', val:c.dur(c.mean(M.sessDur)), cap:`Median ${c.dur(c.median(M.sessDur))}`},
  ]);

  const benchLabel = `(${f(240+Math.round(M.acPeakKw||90),0)} kW × ${M.nGuns} × ${f(M.scopeHours,0)} h)`;
  const util = u.kpiGrid('g3',[
    {eb:'Connector Time Util', val:pct(M.connTimeUtil,1), cap:'Share of active connector-minutes'},
    {eb:'DC Energy Util', val:pct(M.dcEnergyUtil,1), cap:`vs. ${benchLabel}`},
    {eb:'AC Energy Util', val:pct(M.acEnergyUtil,1), cap:`vs. 90 kW × ${f(M.scopeHours,0)} h`},
    {eb:'AC Time Util', val:pct(M.acTimeUtil,1), cap:'Share of minutes with AC input'},
    {eb:'Avg Active Power CP1', val:f(c.mean(M.activeKw.g1),0), unit:'kW', cap:'Active charging minutes only'},
    {eb:'Avg Active Power CP2', val:f(c.mean(M.activeKw.g2),0), unit:'kW', cap:'Active charging minutes only'},
  ]);

  const hw = u.kpiGrid('g4',[
    {eb:'Avg Battery SOC', val:f(M.batSocAvg,0), unit:'%', cap:`${f(M.batSocMin,0)}–${f(M.batSocMax,0)} % range`, dark:true},
    {eb:'Battery Throughput', val:f(M.batThroughput,0), unit:'kWh', cap:'Discharged from storage', dark:true},
    {eb:'Idle', val:pct(M.idleMin/(M.scopeMin||1),1), cap:'Minutes without active charging', dark:true},
    {eb:'Failed Rate', val:pct(M.failedRate,1), cap:'Aborted short sessions', dark:true},
  ]);

  // summary table CP1 vs CP2
  const cpRow = (g,label)=>{
    const sess = M.sessions.filter(s=>s.gun===g);
    return { cp:label, kwh:M.gunKwh[g], sess:sess.length, ekwh:c.mean(sess.map(s=>s.kwh)), maxkw:Math.max(0,...sess.map(s=>s.maxKw)), avgkw:c.mean(M.activeKw[g]),
      occ: pct(M.gunOccupiedMin[g]/(M.scopeMin||1),1), act: pct(M.gunActiveMin[g]/(M.scopeMin||1),1) };
  };
  const rows=[];
  if(M.guns.includes('g1')) rows.push(cpRow('g1','CP1'));
  if(M.guns.includes('g2')) rows.push(cpRow('g2','CP2'));
  rows.push({__cls:'total', cp:'Total', kwh:M.dcKwh, sess:M.sessionCount, ekwh:c.mean(M.sessKwh), maxkw:M.peakDc, avgkw:c.mean([...M.activeKw.g1,...M.activeKw.g2]),
    occ:pct(M.occupiedMin/((M.scopeMin*M.nGuns)||1),1), act:pct(M.connTimeUtil,1)});

  const table = u.table([
    {k:'cp', label:'Charging Point', align:'left', render:r=> r.cp==='Total'? 'Total' : h('span',{class:'pill '+(r.cp==='CP1'?'cp1':'cp2')}, r.cp)},
    {k:'kwh', label:'DC kWh', fmt:v=>f(v,0)},
    {k:'sess', label:'Sessions', fmt:v=>f(v,0)},
    {k:'ekwh', label:'Avg kWh/Sess.', fmt:v=>f(v,1)},
    {k:'maxkw', label:'Peak kW', fmt:v=>f(v,0)},
    {k:'avgkw', label:'Avg Act. kW', fmt:v=>f(v,0)},
    {k:'occ', label:'Occupied', fmt:v=>v},
    {k:'act', label:'Active Charging', fmt:v=>v},
  ], rows);

  // energy split donut
  const {node:donutNode, canvas:donutC} = u.chartCard({title:'Energy Balance', sub:'AC Input → DC Output → Battery', height:260,
    legend:[{label:'DC · CP1',color:CH().cp1},{label:'DC · CP2',color:CH().cp2},{label:'Losses/Own Use',color:'#D1D1D8'}]});
  window.ELMI.app.onMount(()=>{
    const losses = Math.max(0, M.acKwh - M.dcKwh);
    CH().donut(donutC, ['DC · CP1','DC · CP2','Losses/Own Use'], [M.g1Kwh,M.g2Kwh,losses], [CH().cp1,CH().cp2,'#D1D1D8'], {cutout:'64%'});
  });

  return h('div',{class:'page','data-screen-label':'01 Executive Summary'},
    u.pageHead({eyebrow:'Page 01 · Overview', title:'Executive Summary',
      lead:'Condensed key metrics on energy, sessions, utilization and hardware for the selected period.'}),
    u.section('Energy'), energie,
    u.section('Sessions'), sessions,
    u.section('Performance & Utilization'), util,
    u.section('Battery & Hardware'), hw,
    u.section('Charging Point Comparison'),
    h('div',{class:'grid', style:{gridTemplateColumns:'1.6fr 1fr', gap:'16px', alignItems:'start'}}, table, donutNode)
  );
};
})();
