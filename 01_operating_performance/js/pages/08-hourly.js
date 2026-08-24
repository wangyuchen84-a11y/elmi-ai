/* Tab 8 — Hourly Profile */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute; const CH=()=>window.ELMI.charts;
const h = (...a)=>window.ELMI.ui.h(...a);

P.hourly = function(M){
  const c=C(), u=U(), f=c.fmt;
  const labels = M.hourly.map(x=>String(x.h).padStart(2,'0'));

  const dcCard = (()=>{ const {node,canvas}=u.chartCard({title:'DC Energy by Hour', sub:'kWh output per hour of day (total over period)', height:260});
    window.ELMI.app.onMount(()=>{ CH().bar(canvas, labels, [{label:'kWh',data:M.hourly.map(x=>+x.dc.toFixed(0)),color:CH().cp1}], {yTitle:'kWh', barPct:0.86, catPct:0.82, xticks:{autoSkip:false}}); });
    return node; })();

  const startCard = (()=>{ const {node,canvas}=u.chartCard({title:'Session Starts by Hour', sub:'Number of charging sessions starting', height:260});
    window.ELMI.app.onMount(()=>{ CH().bar(canvas, labels, [{label:'Starts',data:M.hourly.map(x=>x.starts),color:CH().cp2}], {yTitle:'Sessions', barPct:0.86, catPct:0.82, xticks:{autoSkip:false}}); });
    return node; })();

  const actCard = (()=>{ const {node,canvas}=u.chartCard({title:'Active Minutes by Hour', sub:'Charging minutes per hour of day', height:260});
    window.ELMI.app.onMount(()=>{ CH().bar(canvas, labels, [{label:'Minutes',data:M.hourly.map(x=>x.activeMin),color:CH().COL.tangerine}], {yTitle:'Minutes', barPct:0.86, catPct:0.82, xticks:{autoSkip:false}}); });
    return node; })();

  const rows = M.hourly.map(x=>({hr:String(x.h).padStart(2,'0')+':00', dc:x.dc, starts:x.starts, act:x.activeMin}));
  rows.push({__cls:'total', hr:'Total', dc:c.sum(M.hourly.map(x=>x.dc)), starts:c.sum(M.hourly.map(x=>x.starts)), act:c.sum(M.hourly.map(x=>x.activeMin))});
  const table = u.table([
    {k:'hr',label:'Hour',align:'left'},
    {k:'dc',label:'DC kWh',fmt:v=>f(v,0)},
    {k:'starts',label:'Session Starts',fmt:v=>f(v,0)},
    {k:'act',label:'Active Minutes',fmt:v=>f(v,0)},
  ], rows);

  // peak hour KPIs
  const peakDc = M.hourly.reduce((a,b)=>b.dc>a.dc?b:a, M.hourly[0]);
  const peakStart = M.hourly.reduce((a,b)=>b.starts>a.starts?b:a, M.hourly[0]);
  const kpis = u.kpiGrid('g3',[
    {eb:'Peak Energy Hour', val:String(peakDc.h).padStart(2,'0')+':00', cap:`${f(peakDc.dc,0)} kWh in this hour`, grad:true, accentDot:true},
    {eb:'Peak Session Start Hour', val:String(peakStart.h).padStart(2,'0')+':00', cap:`${f(peakStart.starts,0)} session starts`},
    {eb:'Avg DC / Hour', val:f(c.sum(M.hourly.map(x=>x.dc))/24,0), unit:'kWh', cap:'Averaged over 24 hours'},
  ]);

  return h('div',{class:'page','data-screen-label':'08 Hourly Profile'},
    u.pageHead({eyebrow:'Page 08 · Daily Profile', title:'Hourly Profile',
      lead:'Load curve over the day (0–23 h): energy output, session starts and active charging minutes per hour.'}),
    kpis,
    h('div',{style:{marginTop:'16px'}}, dcCard),
    h('div',{class:'grid g2', style:{marginTop:'16px'}}, startCard, actCard),
    u.section('Hourly Values (0–23 h)'), table
  );
};
})();
