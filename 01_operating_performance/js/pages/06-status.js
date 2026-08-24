/* Tab 6 — Status Distribution */
(function(){
const P = window.ELMI.pages;
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute; const CH=()=>window.ELMI.charts;
const h = (...a)=>window.ELMI.ui.h(...a);

const STCOL = {Available:'#D1D1D8', Charging:'#E32028', Finishing:'#EC6A2A', Preparing:'#6D2A99', Starting:'#2563EB', '—':'#F4F4F6'};

P.status = function(M){
  const c=C(), u=U(), f=c.fmt, pct=c.pct;
  const order=[...c.STATUSES,'—'];

  function donutCard(g){
    const lbl=c.gunLabel(g); const sm=M.statusMin[g];
    const labels=order.filter(s=>sm[s]>0); const vals=labels.map(s=>sm[s]); const cols=labels.map(s=>STCOL[s]);
    const total=c.sum(vals)||1;
    const {node,canvas}=u.chartCard({title:'Status Distribution '+lbl, sub:`${f(total,0)} minutes`, height:260,
      legend:labels.map(s=>({label:s,color:STCOL[s]}))});
    window.ELMI.app.onMount(()=>{ CH().donut(canvas, labels, vals, cols, {cutout:'64%'}); });
    return node;
  }

  // table: minutes & share per status, both guns
  const rows = order.map(st=>{
    const m1=M.statusMin.g1[st]||0, m2=M.statusMin.g2[st]||0;
    const t1=c.sum(Object.values(M.statusMin.g1))||1, t2=c.sum(Object.values(M.statusMin.g2))||1;
    return {st, m1, s1:m1/t1, m2, s2:m2/t2, tot:m1+m2};
  }).filter(r=>r.tot>0);
  const table = u.table([
    {k:'st',label:'Status',align:'left',render:r=>h('span',{class:'pill mut', style:{background:CH().hexA(STCOL[r.st]==='#D1D1D8'?'#9A9AA5':STCOL[r.st],0.12), color:STCOL[r.st]==='#D1D1D8'?'#6B6B76':STCOL[r.st]}}, r.st)},
    {k:'m1',label:'CP1 Min',fmt:v=>f(v,0)},
    {k:'s1',label:'CP1 Share',fmt:v=>pct(v,1)},
    {k:'m2',label:'CP2 Min',fmt:v=>f(v,0)},
    {k:'s2',label:'CP2 Share',fmt:v=>pct(v,1)},
    {k:'tot',label:'Total Min',fmt:v=>f(v,0)},
  ], rows);

  // KPIs
  const chg1=M.statusMin.g1.Charging||0, chg2=M.statusMin.g2.Charging||0;
  const fin1=M.statusMin.g1.Finishing||0, fin2=M.statusMin.g2.Finishing||0;
  const kpis = u.kpiGrid('g4',[
    {eb:'Total Charging', val:f(chg1+chg2,0), unit:'min', cap:'Active charging minutes', grad:true, accentDot:true},
    {eb:'Total Finishing', val:f(fin1+fin2,0), unit:'min', cap:'Trailing time after charge end'},
    {eb:'Available', val:pct((M.statusMin.g1.Available+M.statusMin.g2.Available)/((M.scopeMin*2)||1),1), cap:'Free / available'},
    {eb:'Charging Rate', val:pct((chg1+chg2)/((M.occupiedMin)||1),1), cap:'Charging ÷ Occupied'},
  ]);

  return h('div',{class:'page','data-screen-label':'06 Status Distribution'},
    u.pageHead({eyebrow:'Page 06 · Status', title:'Status Distribution',
      lead:'Time spent per connector status (Available, Charging, Finishing, Preparing, Starting) for both charging points.'}),
    kpis,
    h('div',{class:'grid g2', style:{marginTop:'16px'}}, donutCard('g1'), donutCard('g2')),
    u.section('Minutes & Shares per Status'), table
  );
};
})();
