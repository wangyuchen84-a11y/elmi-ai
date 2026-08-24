/* Tab 2 — Daily Trend & Tab 3 — Daily Utilization */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute; const CH=()=>window.ELMI.charts;
const h = (...a)=>window.ELMI.ui.h(...a);

P.daily = function(M){
  const c=C(), u=U(), f=c.fmt;
  const labels = M.perDay.map(d=>c.dayLabel(d.day));
  const both = M.guns.length===2;

  // ---- Chart ----
  const {node:chartNode, canvas} = u.chartCard({title:'Energy & Sessions per Day', sub:'Bars: Energy (kWh) · Line: Sessions', height:340,
    legend:[{label:'AC Input',color:'#D1D1D8'},{label:'DC · CP1',color:CH().cp1},{label:'DC · CP2',color:CH().cp2},{label:'Sessions',color:CH().COL.ink}]});
  window.ELMI.app.onMount(()=>{
    const ds=[{label:'AC Input',data:M.perDay.map(d=>+d.ac.toFixed(0)),color:'#D7D7DD',extra:{stack:'a',order:3}}];
    if(M.guns.includes('g1')) ds.push({label:'DC · CP1',data:M.perDay.map(d=>+d.g1.toFixed(0)),color:CH().cp1,extra:{stack:'b',order:2}});
    if(M.guns.includes('g2')) ds.push({label:'DC · CP2',data:M.perDay.map(d=>+d.g2.toFixed(0)),color:CH().cp2,extra:{stack:'b',order:2}});
    const chart = CH().bar(canvas, labels, ds, {stacked:true, yTitle:'kWh', barPct:0.8, catPct:0.66, plugins:{tooltip:{}}, root:{}});
    chart.options.scales.y1={position:'right',beginAtZero:true,grid:{display:false,drawBorder:false},border:{display:false},ticks:{color:CH().COL.fg2,font:{size:11}},title:{display:true,text:'Sessions',color:CH().COL.fg3,font:{size:11,weight:'600'}}};
    chart.data.datasets.push({type:'line',label:'Sessions',data:M.perDay.map(d=>d.sessions),yAxisID:'y1',borderColor:CH().COL.ink,backgroundColor:CH().COL.ink,borderWidth:2.5,tension:0.32,pointRadius:3,pointBackgroundColor:CH().COL.ink,pointBorderColor:'#fff',pointBorderWidth:1.5,order:0});
    chart.update();
  });

  // ---- Table ----
  const dataRows = M.perDay.map(d=>({day:c.dayLabel(d.day), ac:d.ac, g1:d.g1, g2:d.g2, dc:d.dc, sessions:d.sessions, min:d.minutes}));
  // full days only for mean/median (>=360 min = 6h excludes boundary stub days)
  const fullDays = M.perDay.filter(d=>d.minutes>=360);
  const fr = fullDays.length ? fullDays : M.perDay;
  const pick = k => fr.map(d=>d[k]);
  const sumRow = {__cls:'total', day:'Total',    ac:M.acKwh,            g1:M.g1Kwh,            g2:M.g2Kwh,            dc:M.dcKwh,            sessions:M.sessionCount};
  const avgRow = {__cls:'total', day:'Avg / Day',    ac:c.mean(pick('ac')), g1:c.mean(pick('g1')), g2:c.mean(pick('g2')), dc:c.mean(pick('dc')), sessions:c.mean(pick('sessions'))};
  const medRow = {__cls:'total', day:'Median/Day', ac:c.median(pick('ac')),g1:c.median(pick('g1')),g2:c.median(pick('g2')),dc:c.median(pick('dc')),sessions:c.median(pick('sessions'))};
  const tblRows = dataRows.concat([sumRow, avgRow, medRow]);
  const cols = [
    {k:'day',      label:'Date',           align:'left'},
    {k:'ac',       label:'AC Input kWh',   fmt:v=>f(v,0)},
    {k:'g1',       label:'DC CP1 kWh',     fmt:v=>f(v,0)},
    {k:'g2',       label:'DC CP2 kWh',     fmt:v=>f(v,0)},
    {k:'dc',       label:'DC Total kWh',   fmt:v=>f(v,0)},
    {k:'sessions', label:'Sessions',       fmt:v=>f(v,0)},
  ];
  if(!both) cols.splice(3,1);
  const table = u.table(cols, tblRows);

  // ---- KPIs ----
  const avgDc = c.mean(pick('dc'));
  const medDc = c.median(pick('dc'));
  const kpis = u.kpiGrid('g5',[
    {eb:'Avg Energy / Day', val:f(avgDc,0), unit:'kWh', cap:f(M.dcKwh,0)+' kWh / '+fr.length+' days', grad:true, accentDot:true},
    {eb:'Median / Day',    val:f(medDc,0), unit:'kWh', cap:'Median DC'},
    {eb:'Best Day',      val:f(Math.max(...M.perDay.map(d=>d.dc)),0), unit:'kWh', cap:c.dayLabel(M.perDay.reduce((a,b)=>b.dc>a.dc?b:a,M.perDay[0]).day)},
    {eb:'Avg Sessions / Day',val:f(c.mean(pick('sessions')),1), cap:f(M.sessionCount,0)+' total'},
    {eb:'Weakest Day', val:f(Math.min(...fr.map(d=>d.dc)),0), unit:'kWh', cap:c.dayLabel(fr.reduce((a,b)=>b.dc<a.dc?b:a,fr[0]).day)},
  ]);

  return h('div',{class:'page','data-screen-label':'02 Daily Trend'},
    u.pageHead({eyebrow:'Page 02 · Trend', title:'Daily Trend',
      lead:'Energy output and charging sessions per calendar day for the selected period.'}),
    kpis,
    h('div',{style:{marginTop:'16px'}}, chartNode),
    u.section('Daily Values'), table
  );
};
P.dailyutil = function(M){
  const c=C(), u=U(), f=c.fmt, pct=c.pct;
  const labels = M.perDay.map(d=>c.dayLabel(d.day));
  const benchKw = Math.round((240 + (M.acPeakKw||90)) * M.nGuns);

  const {node:e1, canvas:c1} = u.chartCard({title:'Energy Utilization per Day', sub:`DC vs. benchmark (240 + peak AC) × nGuns · AC vs. 90 kW`, height:300,
    legend:[{label:'DC Energy Util',color:CH().cp1},{label:'AC Energy Util',color:CH().cp2}]});
  window.ELMI.app.onMount(()=>{
    CH().line(c1, labels, [
      {label:'DC Energy Util',data:M.perDay.map(d=>+(d.dcEnergyUtil*100).toFixed(2)),color:CH().cp1,fill:true,points:true},
      {label:'AC Energy Util',data:M.perDay.map(d=>+(d.acEnergyUtil*100).toFixed(2)),color:CH().cp2,points:true},
    ], {yTitle:'%', yticks:{callback:v=>v+'%'}});
  });

  const {node:e2, canvas:c2} = u.chartCard({title:'Time Utilization per Day', sub:'Share of measurement intervals with active power', height:300,
    legend:[{label:'DC Time Util',color:CH().COL.tangerine},{label:'AC Time Util',color:CH().COL.blue}]});
  window.ELMI.app.onMount(()=>{
    CH().line(c2, labels, [
      {label:'DC Time Util',data:M.perDay.map(d=>+(d.dcTimeUtil*100).toFixed(2)),color:CH().COL.tangerine,fill:true,points:true},
      {label:'AC Time Util',data:M.perDay.map(d=>+(d.acTimeUtil*100).toFixed(2)),color:CH().COL.blue,points:true},
    ], {yTitle:'%', yticks:{callback:v=>v+'%'}});
  });

  const rows = M.perDay.map(d=>({day:c.dayLabel(d.day), de:d.dcEnergyUtil, ae:d.acEnergyUtil, dt:d.dcTimeUtil, at:d.acTimeUtil, dc:d.dc, ac:d.ac}));
  rows.push({__cls:'total', day:'Avg / Total', de:M.dcEnergyUtil, ae:M.acEnergyUtil, dt:M.connTimeUtil, at:M.acTimeUtil, dc:M.dcKwh, ac:M.acKwh});
  const table = u.table([
    {k:'day',label:'Date',align:'left'},
    {k:'de',label:'DC Energy Util',fmt:v=>pct(v,1)},
    {k:'ae',label:'AC Energy Util',fmt:v=>pct(v,1)},
    {k:'dt',label:'DC Time Util',fmt:v=>pct(v,1)},
    {k:'at',label:'AC Time Util',fmt:v=>pct(v,1)},
    {k:'dc',label:'DC kWh',fmt:v=>f(v,0)},
    {k:'ac',label:'AC kWh',fmt:v=>f(v,0)},
  ], rows);

  const kpis = u.kpiGrid('g4',[
    {eb:'DC Energy Util Avg', val:pct(M.dcEnergyUtil,1), cap:`Benchmark ${benchKw} kW (240 + peak AC) × ${M.nGuns}`, grad:true, accentDot:true},
    {eb:'AC Energy Util Avg', val:pct(M.acEnergyUtil,1), cap:'Benchmark 90 kW grid'},
    {eb:'Connector Time Util', val:pct(M.connTimeUtil,1), cap:'Active connector-minutes'},
    {eb:'AC Time Util', val:pct(M.acTimeUtil,1), cap:'Minutes with AC input'},
  ]);

  return h('div',{class:'page','data-screen-label':'03 Daily Utilization'},
    u.pageHead({eyebrow:'Page 03 · Utilization', title:'Daily Utilization',
      lead:'Daily energy and time utilization against hardware benchmarks (DC: (240 kW battery + peak AC) per charging point, AC: 90 kW grid connection).'}),
    kpis,
    h('div',{class:'grid g2', style:{marginTop:'16px'}}, e1, e2),
    u.section('Utilization per Day'), table
  );
};
})();
