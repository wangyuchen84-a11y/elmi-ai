/* Tab 5 — Hardware Availability */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute; const CH=()=>window.ELMI.charts;
const h = (...a)=>window.ELMI.ui.h(...a);

P.hardware = function(M){
  const c=C(), u=U(), f=c.fmt, pct=c.pct;
  const sm = M.scopeMin||1;

  const operational = M.dataCompleteness; // station responding share
  const idleShare = M.idleMin/sm;
  const occShare = M.occupiedMin/(sm*M.nGuns);
  const activeShare = M.connTimeUtil;

  const kpis = u.kpiGrid('g4',[
    {eb:'Operational', val:pct(operational,1), cap:'Valid data points (uptime)', grad:true, accentDot:true},
    {eb:'Idle', val:pct(idleShare,1), cap:'Minutes without occupancy'},
    {eb:'Occupied', val:pct(occShare,1), cap:'Connector occupied (not Available)'},
    {eb:'Active Charging', val:pct(activeShare,1), cap:'Minutes with DC power'},
  ]);

  const availCard = u.card({title:'Availability & Occupancy', sub:'Share of measurement time', body:[
    u.barlist([
      {label:'Operational', value:operational*100, color:CH().COL.green, display:pct(operational,1)},
      {label:'Occupied', value:occShare*100, color:CH().cp2, display:pct(occShare,1)},
      {label:'Active Charging', value:activeShare*100, color:CH().cp1, display:pct(activeShare,1)},
      {label:'Idle', value:idleShare*100, color:CH().COL.fg3, display:pct(idleShare,1)},
    ], 100)
  ]});

  // success / failed sessions chart
  const succ = M.sessions.length, fail = M.shortSessions.length;
  const {node:sNode, canvas:sC} = u.chartCard({title:'Successful vs. Aborted Sessions', sub:'Sessions ≥ 2 min vs. short aborts < 2 min', height:260,
    legend:[{label:'Successful',color:CH().COL.green},{label:'Aborted',color:CH().COL.red}]});
  window.ELMI.app.onMount(()=>{
    CH().donut(sC, ['Successful','Aborted'], [succ, fail], [CH().COL.green, CH().COL.red], {cutout:'68%'});
  });

  // per-CP availability table
  const rows = M.guns.map(g=>{ const lbl=c.gunLabel(g);
    const occ=M.gunOccupiedMin[g], act=M.gunActiveMin[g];
    return {cp:lbl, op:operational, idle:(sm-occ)/sm, occ:occ/sm, act:act/sm,
      succ:M.sessions.filter(s=>s.gun===g).length, fail:M.shortSessions.filter(s=>s.gun===g).length}; });
  rows.push({__cls:'total', cp:'Total', op:operational, idle:idleShare, occ:occShare, act:activeShare, succ, fail});
  const table = u.table([
    {k:'cp',label:'Charging Point',align:'left',render:r=> r.cp==='Total'?'Total':h('span',{class:'pill '+(r.cp==='CP1'?'cp1':'cp2')},r.cp)},
    {k:'op',label:'Operational',fmt:v=>pct(v,1)},
    {k:'idle',label:'Idle',fmt:v=>pct(v,1)},
    {k:'occ',label:'Occupied',fmt:v=>pct(v,1)},
    {k:'act',label:'Active',fmt:v=>pct(v,1)},
    {k:'succ',label:'Success',fmt:v=>f(v,0),cls:'tcell-pos'},
    {k:'fail',label:'Failure',fmt:v=>f(v,0),cls:'tcell-neg'},
  ], rows);

  return h('div',{class:'page','data-screen-label':'05 Hardware Availability'},
    u.pageHead({eyebrow:'Page 05 · Availability', title:'Hardware Availability',
      lead:'Operational readiness, occupancy and session success rate — basis for SLA and maintenance evaluation.'}),
    kpis,
    h('div',{class:'grid', style:{gridTemplateColumns:'1.5fr 1fr', marginTop:'16px', alignItems:'start'}}, availCard, sNode),
    u.section('Availability per Charging Point'), table
  );
};
})();
