/* Tab 4 — Power Performance per Charging Point */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute; const CH=()=>window.ELMI.charts;
const h = (...a)=>window.ELMI.ui.h(...a);

P.power = function(M){
  const c=C(), u=U(), f=c.fmt;
  const guns = M.guns;
  const stat = g => { const a=M.activeKw[g]; return {avg:c.mean(a), med:c.median(a), p75:c.percentile(a,75), p90:c.percentile(a,90), peak:a.length?Math.max(...a):0, n:a.length}; };
  const cpColor = g => g==='g1'?CH().cp1:CH().cp2;

  // per-CP power KPIs
  const blocks = guns.map(g=>{
    const s=stat(g); const lbl=c.gunLabel(g);
    return u.card({ title:'Power '+lbl, sub:`${f(s.n,0)} active minutes`, body:[
      u.statrow([
        {value:f(s.avg,0), label:'Avg kW', grad:true},
        {value:f(s.med,0), label:'Median'},
        {value:f(s.p75,0), label:'P75'},
        {value:f(s.p90,0), label:'P90'},
        {value:f(s.peak,0), label:'Peak'},
      ])
    ]});
  });

  // CP1 vs CP2 comparison bars (avg / peak / energy / sessions)
  const cmpCard = (()=>{
    const {node,canvas}=u.chartCard({title:'CP1 vs. CP2 — Comparison', sub:'Avg power, peak, energy, sessions (normalized)', height:300,
      legend:[{label:'CP1',color:CH().cp1},{label:'CP2',color:CH().cp2}]});
    window.ELMI.app.onMount(()=>{
      const metrics=['Avg kW','Peak kW','DC kWh','Sessions','Avg kWh/Sess.'];
      const g1s=M.sessions.filter(s=>s.gun==='g1'), g2s=M.sessions.filter(s=>s.gun==='g2');
      const v1=[c.mean(M.activeKw.g1), Math.max(0,...M.activeKw.g1), M.gunKwh.g1, g1s.length, c.mean(g1s.map(s=>s.kwh))];
      const v2=[c.mean(M.activeKw.g2), Math.max(0,...M.activeKw.g2), M.gunKwh.g2, g2s.length, c.mean(g2s.map(s=>s.kwh))];
      CH().bar(canvas, metrics, [
        {label:'CP1',data:v1.map(x=>+x.toFixed(1)),color:CH().cp1},
        {label:'CP2',data:v2.map(x=>+x.toFixed(1)),color:CH().cp2},
      ], {catPct:0.66, barPct:0.84});
    });
    return node;
  })();

  // histograms: session energy & duration (all selected guns combined, colored by gun)
  const energyHist = (()=>{
    const {node,canvas}=u.chartCard({title:'Session Energy Distribution', sub:'Number of sessions per kWh class', height:280});
    window.ELMI.app.onMount(()=>{
      const vals=M.sessions.map(s=>s.kwh); const hg=CH().histogram(vals,10);
      CH().bar(canvas, hg.labels, [{label:'Sessions',data:hg.bins,color:CH().COL.tangerine}], {yTitle:'Sessions', xticks:{maxRotation:0}, barPct:0.92, catPct:0.9});
    });
    return node;
  })();
  const durHist = (()=>{
    const {node,canvas}=u.chartCard({title:'Session Duration Distribution', sub:'Number of sessions per minute class', height:280});
    window.ELMI.app.onMount(()=>{
      const vals=M.sessions.map(s=>s.durMin); const hg=CH().histogram(vals,10);
      CH().bar(canvas, hg.labels, [{label:'Sessions',data:hg.bins,color:CH().cp2}], {yTitle:'Sessions', xticks:{maxRotation:0}, barPct:0.92, catPct:0.9});
    });
    return node;
  })();

  // table per CP
  const rows = guns.map(g=>{ const s=stat(g); const ss=M.sessions.filter(x=>x.gun===g);
    return {cp:c.gunLabel(g), avg:s.avg, med:s.med, p75:s.p75, p90:s.p90, peak:s.peak, sess:ss.length, ekwh:c.mean(ss.map(x=>x.kwh)), dur:c.mean(ss.map(x=>x.durMin))}; });
  const table = u.table([
    {k:'cp',label:'Charging Point',align:'left',render:r=>h('span',{class:'pill '+(r.cp==='CP1'?'cp1':'cp2')},r.cp)},
    {k:'avg',label:'Avg kW',fmt:v=>f(v,0)},{k:'med',label:'Median kW',fmt:v=>f(v,0)},
    {k:'p75',label:'P75 kW',fmt:v=>f(v,0)},{k:'p90',label:'P90 kW',fmt:v=>f(v,0)},{k:'peak',label:'Peak kW',fmt:v=>f(v,0)},
    {k:'sess',label:'Sessions',fmt:v=>f(v,0)},{k:'ekwh',label:'Avg kWh',fmt:v=>f(v,1)},{k:'dur',label:'Avg Duration',fmt:v=>c.dur(v)},
  ], rows);

  return h('div',{class:'page','data-screen-label':'04 Power Performance'},
    u.pageHead({eyebrow:'Page 04 · Power', title:'Power Performance per Charging Point',
      lead:'Power statistics (avg, median, P75, P90, peak) and distribution of session energy and duration.'}),
    u.section('Power Statistics'),
    h('div',{class:'grid '+(blocks.length>1?'g2':'g2')}, blocks),
    u.section('Distributions & Comparison'),
    h('div',{class:'grid g2'}, energyHist, durHist),
    h('div',{style:{marginTop:'16px'}}, cmpCard),
    u.section('Metrics per Charging Point'), table
  );
};
})();
