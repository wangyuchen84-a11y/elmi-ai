/* ============================================================
   ELMI CPO Dashboard — Chart.js factory (brand-themed)
   ============================================================ */
(function(){
window.ELMI = window.ELMI || {};
const C = {}; window.ELMI.charts = C;

const FONT = "Maven Pro, system-ui, sans-serif";
const COL = {
  red:'#E32028', purple:'#6D2A99', tangerine:'#EC6A2A', orange:'#F39A3A', magenta:'#B5188B',
  blue:'#2563EB', green:'#1F9D55', amber:'#E2A100', ink:'#0E0E14', grid:'#E7E7EB', fg2:'#4A4A55', fg3:'#9A9AA5'
};
C.COL = COL;
C.cp1 = COL.red; C.cp2 = COL.purple;

const registry = []; // track instances to destroy
C.destroyAll = function(){ while(registry.length){ const c=registry.pop(); try{c.destroy();}catch(e){} } };

function setup(){
  if(!window.Chart) return;
  Chart.defaults.font.family = FONT;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = COL.fg2;
  Chart.defaults.devicePixelRatio = 1;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.maintainAspectRatio = false;
  // Animations off: in embedded/preview contexts requestAnimationFrame is
  // throttled, so Chart's rAF-scheduled initial paint never fires and the
  // canvas stays blank. No animation = elements resolve to final geometry
  // synchronously, and we force-draw immediately in mk().
  Chart.defaults.animation = false;
  Chart.defaults.animations = false;
  Chart.defaults.transitions = Chart.defaults.transitions || {};
}
C.setup = setup;

function gradientFor(ctx, area, stops){
  if(!area) return stops[0];
  const g = ctx.createLinearGradient(0, area.bottom, 0, area.top);
  g.addColorStop(0, stops[0]); g.addColorStop(1, stops[1]);
  return g;
}

const tip = {
  backgroundColor:'#0E0E14', titleColor:'#fff', bodyColor:'#D1D1D8',
  padding:12, cornerRadius:10, titleFont:{family:FONT,weight:'700',size:13},
  bodyFont:{family:FONT,size:12.5}, displayColors:true, boxPadding:4, borderWidth:0
};

function mk(canvas, cfg){
  setup();
  if(!cfg.options) cfg.options={};
  cfg.options.plugins = Object.assign({tooltip:tip}, cfg.options.plugins||{});
  if(!cfg.options) cfg.options={};
  cfg.options.animation = false;
  const c = new Chart(canvas.getContext('2d'), cfg);
  registry.push(c);
  // Force a synchronous paint — do not rely on rAF (throttled in previews).
  try{ c.draw(); }catch(e){}
  return c;
}
C.mk = mk;

const baseScales = (yTitle, opts={}) => ({
  x:{ grid:{display:false, drawBorder:false}, ticks:{color:COL.fg2, font:{size:11}, maxRotation:0, autoSkip:true, ...(opts.xticks||{})}, border:{display:false} },
  y:{ grid:{color:COL.grid, drawBorder:false}, border:{display:false}, ticks:{color:COL.fg2, font:{size:11}, ...(opts.yticks||{})},
      title:{display:!!yTitle, text:yTitle, color:COL.fg3, font:{size:11,weight:'600'}}, beginAtZero:true }
});

// ---------- BAR (single or grouped) ----------
C.bar = function(canvas, labels, datasets, opts={}){
  const ds = datasets.map(d=>({
    label:d.label, data:d.data, backgroundColor:d.color, borderRadius:d.radius==null?6:d.radius,
    borderSkipped:false, barPercentage:opts.barPct||0.72, categoryPercentage:opts.catPct||0.7, ...(d.extra||{})
  }));
  return mk(canvas,{ type:'bar', data:{labels, datasets:ds}, options:{
    scales: opts.stacked? stackedScales(opts.yTitle,opts) : baseScales(opts.yTitle,opts),
    plugins:{ legend:{display:false}, ...(opts.plugins||{}) }, ...(opts.root||{})
  }});
};
function stackedScales(yTitle,opts){ const s=baseScales(yTitle,opts); s.x.stacked=true; s.y.stacked=true; return s; }
C.stackedScales = stackedScales;
C.baseScales = baseScales;

// ---------- LINE ----------
C.line = function(canvas, labels, datasets, opts={}){
  const ds = datasets.map(d=>({
    label:d.label, data:d.data, borderColor:d.color, backgroundColor:d.fill? (c=>{const{ctx,chartArea}=c.chart; return gradientFor(ctx,chartArea,[hexA(d.color,0), hexA(d.color,0.28)]);}) : d.color,
    fill:!!d.fill, tension:d.tension==null?0.32:d.tension, borderWidth:d.width||2.5,
    pointRadius:d.points?3:0, pointHoverRadius:5, pointBackgroundColor:d.color, pointBorderColor:'#fff', pointBorderWidth:1.5,
    borderDash:d.dash||[], ...(d.extra||{})
  }));
  return mk(canvas,{ type:'line', data:{labels, datasets:ds}, options:{
    interaction:{mode:'index',intersect:false},
    scales: baseScales(opts.yTitle,opts), plugins:{legend:{display:false}, ...(opts.plugins||{})}, ...(opts.root||{})
  }});
};

// ---------- DONUT ----------
C.donut = function(canvas, labels, values, colors, opts={}){
  return mk(canvas,{ type:'doughnut', data:{labels, datasets:[{data:values, backgroundColor:colors, borderColor:'#fff', borderWidth:2, hoverOffset:6}]},
    options:{ cutout: opts.cutout||'66%', plugins:{ legend:{display:false},
      tooltip:Object.assign({},tip,{callbacks:{label:(c)=>` ${c.label}: ${ELMI.compute.fmt(c.raw,0)} (${ELMI.compute.pct(c.raw/values.reduce((a,b)=>a+b,0||1),1)})`}}) } } });
};

// ---------- HISTOGRAM helper ----------
C.histogram = function(values, binW, max){
  const mx = max!=null?max:Math.max(1,...values);
  const nb = Math.max(1, Math.ceil(mx/binW));
  const bins = new Array(nb).fill(0);
  for(const v of values){ let i=Math.floor(v/binW); if(i>=nb) i=nb-1; if(i<0) i=0; bins[i]++; }
  const labels = bins.map((_,i)=>`${Math.round(i*binW)}–${Math.round((i+1)*binW)}`);
  return {labels, bins};
};

function hexA(hex,a){ const n=parseInt(hex.slice(1),16); const r=(n>>16)&255,g=(n>>8)&255,b=n&255; return `rgba(${r},${g},${b},${a})`; }
C.hexA = hexA;

})();
