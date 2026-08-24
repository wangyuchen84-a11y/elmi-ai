/* Tab 7 - Energy Flow */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute; const CH=()=>window.ELMI.charts;
const h = (...a)=>window.ELMI.ui.h(...a);

P.flow = function(M){
  const c=C(), u=U(), f=c.fmt, pct=c.pct;

  // operating mode minutes
  const modeCard = u.card({title:'Operating Mode', sub:'Distribution of measurement time', body:[
    u.barlist([
      {label:'Idle', value:M.idleMin, color:CH().COL.fg3, display:c.dur(M.idleMin)},
      {label:'Single Charging', value:M.singleMin, color:CH().cp1, display:c.dur(M.singleMin)},
      {label:'Parallel Charging', value:M.parallelMin, color:CH().cp2, display:c.dur(M.parallelMin)},
    ], M.scopeMin)
  ]});

  // source split donut
  const fromBat = M.batThroughput;
  const fromGrid = Math.max(0, M.dcKwh - fromBat);
  const {node:srcNode, canvas:srcC} = u.chartCard({title:'DC Output Source Split', sub:'Grid-direct vs. battery storage', height:260,
    legend:[{label:'From Grid (AC)',color:CH().COL.tangerine},{label:'From Battery',color:CH().cp2}]});
  window.ELMI.app.onMount(()=>{ CH().donut(srcC, ['From Grid (AC)','From Battery'], [+fromGrid.toFixed(0), +fromBat.toFixed(0)], [CH().COL.tangerine, CH().cp2], {cutout:'64%'}); });

  // energy balance KPIs
  const kpis = u.kpiGrid('g4',[
    {eb:'AC Input', val:f(M.acKwh,0), unit:'kWh', cap:'From grid', grad:true, accentDot:true},
    {eb:'DC Output', val:f(M.dcKwh,0), unit:'kWh', cap:'To vehicles'},
    {eb:'Battery Throughput', val:f(M.batThroughput,0), unit:'kWh', cap:'Discharged from storage'},
    {eb:'Storage Contribution', val:pct(fromBat/(M.dcKwh||1),1), cap:'Share of DC from battery'},
  ]);

  // ---- Battery SOC with day selector ----
  const days = [...new Set(M.scope.map(r=>r.day))].sort();
  let socChart = null;

  const {node:socNode, canvas:socC} = u.chartCard({title:'Battery SOC & Power',
    sub:'1-min resolution for selected day (Min / Avg / Max over period shown below)', height:300,
    legend:[{label:'Battery SOC %',color:CH().cp2},{label:'Battery kW (+charge / -discharge)',color:CH().COL.tangerine}]});

  function drawSocDay(day){
    const dr = M.scope.filter(r=>r.day===day);
    const labels=[], soc=[], pw=[];
    for(const r of dr){
      const d=new Date(r.t);
      labels.push(String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0'));
      soc.push(r.bat_soc);
      pw.push(+r.bat_kw.toFixed(1));
    }
    if(socChart){ socChart.destroy(); socChart=null; }
    socChart = CH().line(socC, labels, [
      {label:'Battery SOC %', data:soc, color:CH().cp2, fill:true, width:2},
    ], {yTitle:'SOC %', xticks:{maxTicksLimit:12}, yticks:{callback:function(v){return v+'%';}}});
    socChart.options.scales.y.min=0; socChart.options.scales.y.max=100;
    socChart.options.scales.y1={position:'right', grid:{display:false,drawBorder:false}, border:{display:false},
      ticks:{color:CH().COL.fg2,font:{size:11}}, title:{display:true,text:'kW',color:CH().COL.fg3,font:{size:11,weight:'600'}}};
    socChart.data.datasets.push({label:'Battery kW (+/-)', data:pw, yAxisID:'y1',
      borderColor:CH().COL.tangerine, backgroundColor:'transparent', borderWidth:1.5, tension:0.2, pointRadius:0, fill:false});
    socChart.update();
  }

  // day selector dropdown
  const selStyle = 'background:var(--bg2);color:var(--fg1);border:1px solid var(--border);border-radius:8px;padding:5px 12px;font-size:13px;font-family:var(--font-mono);cursor:pointer;';
  const selEl = h('select', {style:selStyle,
    onchange:function(e){ drawSocDay(e.target.value); }},
    ...days.map(d=>h('option',{value:d}, c.dayLabel ? c.dayLabel(d) : d)));

  // SOC stats KPIs (min / avg / max over whole scope)
  const allSoc = M.scope.map(r=>r.bat_soc).filter(v=>v!=null);
  const socMin = Math.min(...allSoc), socMax = Math.max(...allSoc);
  const socAvg = Math.round(allSoc.reduce((a,b)=>a+b,0)/allSoc.length);
  const socStats = u.kpiGrid('g3',[
    {eb:'SOC Min', val:socMin, unit:'%', cap:'Lowest reading in period'},
    {eb:'SOC Avg', val:socAvg, unit:'%', cap:'Mean over all minutes', grad:true, accentDot:true},
    {eb:'SOC Max', val:socMax, unit:'%', cap:'Highest reading in period'},
  ]);

  const socWrapper = h('div', null,
    h('div', {style:'display:flex;align-items:center;gap:12px;margin-bottom:8px;'},
      h('span', {style:'font-size:13px;color:var(--fg2);font-family:var(--font-body);'}, 'Day:'),
      selEl),
    socNode);

  window.ELMI.app.onMount(()=>{ drawSocDay(days[days.length-1]); });

  // table: AC / Battery / DC summary
  const tableRows = [
    {src:'Grid Input (AC)', kwh:M.acKwh, note:'Total input'},
    {src:'Battery Discharge', kwh:M.batDischarge, note:'Supports peak load'},
    {src:'Battery Charge', kwh:M.batCharge, note:'Buffered from grid'},
    {src:'DC Output', kwh:M.dcKwh, note:'To vehicles', __cls:'total'},
  ];
  const table = u.table([
    {k:'src',label:'Energy Flow',align:'left'},
    {k:'kwh',label:'kWh',fmt:function(v){return f(v,0);}},
    {k:'note',label:'Note',align:'left',render:function(r){return h('span',{class:'tcell-mut',style:{fontFamily:'var(--font-body)'}},r.note);}},
  ], tableRows);

  return h('div',{class:'page','data-screen-label':'07 Energy Flow'},
    u.pageHead({eyebrow:'Page 07 · Energy', title:'Energy Flow',
      lead:'From grid input through battery storage to DC output — including operating mode and SOC per day.'}),
    kpis,
    h('div',{class:'grid', style:{gridTemplateColumns:'1.4fr 1fr', marginTop:'16px', alignItems:'start'}}, modeCard, srcNode),
    h('div',{style:{marginTop:'16px'}}, socWrapper),
    socStats,
    u.section('Energy Balance'), table
  );
};
})();
