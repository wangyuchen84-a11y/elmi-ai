/* Tab 10 — KPI Roadmap */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute;
const h = (...a)=>window.ELMI.ui.h(...a);

const ST = { ok:{t:'Available',c:'ok'}, part:{t:'Partial',c:'warn'}, miss:{t:'Data Missing',c:'cp1'} };

const KPI_GROUPS = [
  { group:'CPO · Utilization & Revenue', items:[
    ['Revenue / Yield per Session','Revenue per charging session','miss','Requires tariff/billing data (€/kWh, session fee)','High'],
    ['Utilization Rate (Time)','Occupied share vs. availability','ok','Derived from status & DC power','High'],
    ['Energy Throughput per Connector','kWh per charging point & time','ok','From DC meter readings','High'],
    ['Returning Users','Share of repeat customers','miss','Requires RFID/app identification','Medium'],
    ['Avg Revenue per Connector/Day','Revenue per connector/day','miss','Tariff data + sessions','High'],
  ]},
  { group:'CPO · Grid & Costs', items:[
    ['Peak Load / Peak Shaving','Grid peak reduction via storage','part','AC peak present, storage effect estimated','High'],
    ['Standby Consumption','Energy without active charging','part','Estimable from AC input at idle','Medium'],
    ['Grid Procurement Costs','€ grid input per period','miss','Requires electricity price/tariff time series','High'],
    ['CO₂ Intensity','g CO₂ per kWh','miss','Requires grid emission factor','Low'],
  ]},
  { group:'Hardware Vendor · Reliability', items:[
    ['Uptime / Availability (SLA)','Operational readiness','ok','From data completeness & status','High'],
    ['MTBF / Failure Frequency','Mean time between failures','part','Short aborts detected, error codes missing','High'],
    ['Error Code Analysis','Most frequent fault causes','miss','Requires event/error log','High'],
    ['Connector Success Rate','Successful vs. aborted sessions','ok','From session detection','Medium'],
    ['Thermal Derating','Power reduction at high temperature','miss','Requires temperature telemetry','Medium'],
  ]},
  { group:'Hardware Vendor · Battery & Efficiency', items:[
    ['Battery Throughput','kWh via storage','ok','Integrated from battery power','High'],
    ['Cycles / SOC Swing','Storage stress','part','SOC swing available, cycle count modelled','High'],
    ['Round-Trip Efficiency','Charge/discharge efficiency','part','Estimable from AC↔DC↔Battery','Medium'],
    ['System Efficiency (AC→DC)','Overall efficiency','ok','DC output ÷ AC input','High'],
    ['State of Health (SOH)','Battery ageing','miss','Requires long-term capacity data','High'],
  ]},
];

P.roadmap = function(M){
  const u=U();
  const sections = KPI_GROUPS.map(g=>{
    const rows = g.items.map(it=>({kpi:it[0], desc:it[1], status:it[2], note:it[3], rel:it[4]}));
    const table = u.table([
      {k:'kpi',label:'KPI',align:'left'},
      {k:'desc',label:'Description',align:'left',render:r=>h('span',{style:{fontFamily:'var(--font-body)',color:'var(--fg2)',fontSize:'12.5px'}},r.desc)},
      {k:'status',label:'Data Status',render:r=>h('span',{class:'pill '+ST[r.status].c}, ST[r.status].t)},
      {k:'note',label:'Basis / Need',align:'left',render:r=>h('span',{style:{fontFamily:'var(--font-body)',color:'var(--fg2)',fontSize:'12.5px'}},r.note)},
      {k:'rel',label:'Relevance',render:r=>h('span',{class:'pill '+(r.rel==='High'?'cp1':r.rel==='Medium'?'warn':'mut')}, r.rel)},
    ], rows);
    return h('div',null, u.section(g.group), table);
  });

  // summary counts
  const all = KPI_GROUPS.flatMap(g=>g.items);
  const cnt = s => all.filter(i=>i[2]===s).length;
  const kpis = u.kpiGrid('g4',[
    {eb:'Total KPIs', val:String(all.length), cap:'On the roadmap', grad:true, accentDot:true},
    {eb:'Available', val:String(cnt('ok')), cap:'Computable from current data'},
    {eb:'Partial', val:String(cnt('part')), cap:'With assumptions / estimates'},
    {eb:'Data Missing', val:String(cnt('miss')), cap:'Additional telemetry needed'},
  ]);

  return h('div',{class:'page','data-screen-label':'10 KPI Roadmap'},
    u.pageHead({eyebrow:'Page 10 · Outlook', title:'KPI Roadmap',
      lead:'Further KPIs for CPO operations and hardware sales — with data status and relevance as a basis for the next expansion stage.'}),
    kpis,
    h('div',{style:{marginTop:'6px'}}, sections),
    h('div',{style:{marginTop:'16px'}}, u.note('<b>Legend:</b> <span style="color:var(--success)">Available</span> = computable from current 1-minute raw data · <span style="color:#8a6300">Partial</span> = with model assumptions · <span style="color:var(--elmi-red)">Data Missing</span> = requires additional sources (tariffs, event logs, temperature, identification).'))
  );
};
})();
