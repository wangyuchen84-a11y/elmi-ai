/* ============================================================
   ELMI CPO Dashboard — Tab 0: Settings (live filter controls)
   ============================================================ */
(function(){
window.ELMI = window.ELMI || {};
window.ELMI.pages = window.ELMI.pages || {};
const U = ()=>window.ELMI.ui; const C = ()=>window.ELMI.compute;
const h = (...a)=>window.ELMI.ui.h(...a);

function dualSlider(state, onChange){
  const min=0, max=1440, step=15;
  const fmt = m => String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  const valL = h('span',null, fmt(state.tFrom));
  const valR = h('span',null, fmt(state.tTo));
  const fill = h('div',{class:'fill'});
  const a = h('input',{type:'range',min,max,step,value:state.tFrom});
  const b = h('input',{type:'range',min,max,step,value:state.tTo});
  function upd(){
    let lo=+a.value, hi=+b.value;
    if(lo>hi-step){ if(document.activeElement===a){ lo=hi-step; a.value=lo; } else { hi=lo+step; b.value=hi; } }
    state.tFrom=lo; state.tTo=hi;
    valL.textContent=fmt(lo); valR.textContent=hi>=1440?'24:00':fmt(hi);
    fill.style.left=(lo/max*100)+'%'; fill.style.width=((hi-lo)/max*100)+'%';
    onChange();
  }
  a.addEventListener('input',upd); b.addEventListener('input',upd);
  const wrap = h('div',{class:'slider-wrap'},
    h('div',{class:'slider-vals'}, valL, valR),
    h('div',{class:'dual'}, h('div',{class:'track'}), fill, a, b));
  // init fill
  setTimeout(()=>{ fill.style.left=(state.tFrom/max*100)+'%'; fill.style.width=((state.tTo-state.tFrom)/max*100)+'%'; valR.textContent=state.tTo>=1440?'24:00':fmt(state.tTo); },0);
  return wrap;
}

window.ELMI.pages.input = function(state, onChange){
  const cc = C();
  const allDays = cc.allDays;

  // --- Date range ---
  const dFrom = h('input',{type:'date',value:state.dateFrom,min:allDays[0],max:allDays[allDays.length-1],
    onchange:e=>{ state.dateFrom=e.target.value; if(state.dateTo<state.dateFrom) state.dateTo=state.dateFrom; dTo.value=state.dateTo; onChange(); }});
  const dTo = h('input',{type:'date',value:state.dateTo,min:allDays[0],max:allDays[allDays.length-1],
    onchange:e=>{ state.dateTo=e.target.value; if(state.dateFrom>state.dateTo) state.dateFrom=state.dateTo; dFrom.value=state.dateFrom; onChange(); }});

  // --- Weekday chips ---
  const wdChips = cc.WD.map((w,i)=>h('button',{class:'chip-tog'+(state.weekdays[i]?' on':''),
    onclick:e=>{ state.weekdays[i]=!state.weekdays[i]; e.currentTarget.classList.toggle('on',state.weekdays[i]); onChange(); }},
    h('span',{class:'dotc'}), w));

  // --- Charging point segmented ---
  const cpOpts=[['both','Both'],['cp1','CP1'],['cp2','CP2']];
  const cpSeg = h('div',{class:'seg'}, cpOpts.map(([v,l])=>h('button',{class:(state.cp===v?'on accent':''),
    onclick:e=>{ state.cp=v; [...cpSeg.children].forEach(b=>b.className=''); e.currentTarget.className='on accent'; onChange(); }}, l)));

  // --- Status chips ---
  const stChips = cc.STATUSES.map(st=>h('button',{class:'chip-tog accent'+(state.statuses[st]?' on':''),
    onclick:e=>{ state.statuses[st]=!state.statuses[st]; e.currentTarget.classList.toggle('on',state.statuses[st]); onChange(); }},
    h('span',{class:'dotc'}), st));

  // --- Percentile segmented ---
  const pctOpts=[['none','No Filter'],['p25','P25'],['p50','P50'],['p75','P75'],['p90','P90']];
  const pctSeg = h('div',{class:'seg'}, pctOpts.map(([v,l])=>h('button',{class:(state.pct===v?'on accent':''),
    onclick:e=>{ state.pct=v; [...pctSeg.children].forEach(b=>b.className=''); e.currentTarget.className='on accent'; onChange(); }}, l)));

  // --- info bar ---
  const infoBig = h('span',null,'0');
  const infoTxt = h('div',{class:'txt'},'');
  const openBtn = h('button',{class:'btn primary', onclick:()=>window.ELMI.app.goTo(1)}, 'Open Dashboard',
    h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2.5','stroke-linecap':'round','stroke-linejoin':'round',html:'<path d="M5 12h14M13 5l7 7-7 7"/>'}));
  const resetBtn = h('button',{class:'btn ghost-d sm', onclick:()=>window.ELMI.app.reset()}, 'Reset');

  const infobar = h('div',{class:'infobar'},
    h('div',null, h('div',{class:'big'}, infoBig, h('span',{class:'u'},'data points')), infoTxt),
    h('div',{class:'spacer'}), resetBtn, openBtn);

  // update info on each compute
  window.ELMI.app._updateInfo = (M)=>{
    infoBig.textContent = cc.fmt(M.selected.length,0);
    const total = cc.getDB().rows.length;
    infoTxt.innerHTML = `of ${cc.fmt(total,0)} data points · ${M.D} day(s) · ${M.nGuns} charging point(s) · Window ${pad(state.tFrom)}–${state.tTo>=1440?'24:00':pad(state.tTo)} · ${cc.fmt(M.scopeHours,0)} h measurement time`;
  };
  function pad(m){ return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }

  const left = U().card({ title:'Date Range & Time Window', body:[
    h('div',{class:'field'}, h('label',null,'Date from / to'), h('div',{class:'row2'}, dFrom, dTo)),
    h('div',{class:'field'}, h('label',null,'Time from / to'), dualSlider(state,onChange)),
    h('div',{class:'field'}, h('label',null,'Day of Week'), h('div',{class:'chips'}, wdChips)),
  ]});

  const right = U().card({ title:'Charging Point, Status & Power', body:[
    h('div',{class:'field'}, h('label',null,'Charging Point'), cpSeg),
    h('div',{class:'field'}, h('label',null,'Status Filter'), h('span',{class:'hint'},'Which connector statuses are included in the selection'), h('div',{class:'chips'}, stChips)),
    h('div',{class:'field'}, h('label',null,'Charging Power Percentile Filter'), h('span',{class:'hint'},'Only minutes at or above the selected power percentile'), pctSeg),
  ]});

  const page = h('div',{class:'page'},
    U().pageHead({eyebrow:'Settings · Filter', title:'Analysis Parameters', nav:false,
      lead:'All settings apply live to every dashboard page. Select date range, time window, weekdays, charging point, status and an optional power percentile filter.'}),
    window.ELMI.upload ? window.ELMI.upload.datasetCard() : null,
    h('div',{class:'input-grid'}, left, right),
    h('div',{style:{marginTop:'18px'}}, infobar),
    h('div',{style:{marginTop:'16px'}}, U().note('<b>Data basis:</b> ELMI AiO 360 · 1-minute raw data · Station SN '+cc.getDB().sn+'. Energy is calculated from meter deltas; sessions are detected as contiguous blocks with DC power &gt; 0.5 kW per charging point.'))
  );
  return page;
};
})();
