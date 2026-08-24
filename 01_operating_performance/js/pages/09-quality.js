/* Tab 9 — Process Quality */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute; const CH=()=>window.ELMI.charts;
const h = (...a)=>window.ELMI.ui.h(...a);

P.quality = function(M){
  const c=C(), u=U(), f=c.fmt, pct=c.pct;
  const p2p = M.plug2power;
  const finPerSess = M.sessionCount? M.finishingMin/M.sessionCount : 0;

  const kpis = u.kpiGrid('g4',[
    {eb:'Avg Plug-to-Power', val: p2p.length? f(c.median(p2p),1):'–', unit:'min', cap:`Median · ${f(p2p.length,0)} events`, grad:true, accentDot:true},
    {eb:'Post-Charge Finishing', val:f(finPerSess,1), unit:'min', cap:'Avg tail time per session'},
    {eb:'Charging in Occupied', val:pct(M.chargingShareInOcc,1), cap:'Active ÷ occupied'},
    {eb:'Failed Attempt Rate', val:pct(M.failedRate,1), cap:'Short aborts < 2 min'},
    {eb:'Avg SOC Gain', val: M.socGains.length? f(c.mean(M.socGains),0):'–', unit:'pct-pts', cap:'EV SOC per session'},
    {eb:'Peak AC Demand', val:f(M.peakAc,0), unit:'kW', cap:'Highest grid load'},
    {eb:'Battery SOC Swing', val:f(M.socSwing,0), unit:'pct-pts', cap:'Max − min storage SOC'},
    {eb:'Data Completeness', val:pct(M.dataCompleteness,1), cap:'Valid data points in window'},
  ]);

  // assessment table
  const band = (v, good, ok) => v>=good? {t:'good',c:'ok'} : v>=ok? {t:'medium',c:'warn'} : {t:'critical',c:'cp1'};
  const rows = [
    {m:'Plug-to-Power Time', val: p2p.length? c.median(p2p).toFixed(1)+' min':'–', b:'< 1.5 min', a: p2p.length&&c.median(p2p)<=1.5?{t:'good',c:'ok'}:{t:'check',c:'warn'}},
    {m:'Post-Charge Finishing', val: finPerSess.toFixed(1)+' min', b:'< 3 min', a: finPerSess<=3?{t:'good',c:'ok'}:{t:'check',c:'warn'}},
    {m:'Charging Share in Occupied', val: pct(M.chargingShareInOcc,1), b:'> 70 %', a: band(M.chargingShareInOcc,0.7,0.5)},
    {m:'Failed Attempt Rate', val: pct(M.failedRate,1), b:'< 5 %', a: M.failedRate<=0.05?{t:'good',c:'ok'}: M.failedRate<=0.1?{t:'medium',c:'warn'}:{t:'critical',c:'cp1'}},
    {m:'Avg SOC Gain per Session', val: M.socGains.length? c.mean(M.socGains).toFixed(0)+' pct-pts':'–', b:'> 30 pct-pts', a: M.socGains.length&&c.mean(M.socGains)>=30?{t:'good',c:'ok'}:{t:'check',c:'warn'}},
    {m:'Data Completeness', val: pct(M.dataCompleteness,1), b:'> 99 %', a: M.dataCompleteness>=0.99?{t:'good',c:'ok'}:{t:'medium',c:'warn'}},
  ];
  const table = u.table([
    {k:'m',label:'Process KPI',align:'left'},
    {k:'val',label:'Value'},
    {k:'b',label:'Target',render:r=>h('span',{class:'tcell-mut',style:{fontFamily:'var(--font-mono)'}},r.b)},
    {k:'a',label:'Assessment',render:r=>h('span',{class:'pill '+r.a.c}, r.a.t)},
  ], rows);

  // distribution of plug-to-power
  const distCard = (()=>{ const {node,canvas}=u.chartCard({title:'Plug-to-Power Distribution', sub:'Wait time connector → first power', height:260});
    window.ELMI.app.onMount(()=>{ const hg=CH().histogram(p2p.length?p2p:[0], 1, 10);
      CH().bar(canvas, hg.labels.map(l=>l+' min'), [{label:'Events',data:hg.bins,color:CH().cp1}], {yTitle:'Count', barPct:0.9, catPct:0.85, xticks:{maxRotation:0}}); });
    return node; })();

  return h('div',{class:'page','data-screen-label':'09 Process Quality'},
    u.pageHead({eyebrow:'Page 09 · Quality', title:'Process Quality',
      lead:'Operational quality of the charging process: response times, post-charge tail, success rate, energy transfer and data completeness.'}),
    kpis,
    h('div',{class:'grid', style:{gridTemplateColumns:'1.5fr 1fr', marginTop:'16px', alignItems:'start'}},
      u.card({title:'Assessment of Process KPIs', body:[table]}), distCard),
    h('div',{style:{marginTop:'16px'}}, u.note('<b>Note:</b> Target values are industry benchmarks for CPO operations and serve as orientation. Plug-to-Power and SOC gain require complete status and vehicle SOC telemetry; affected sessions are excluded when data is missing.'))
  );
};
})();
