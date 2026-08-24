/* ============================================================
   ELMI CPO Dashboard — UI builders (vanilla hyperscript)
   ============================================================ */
(function(){
window.ELMI = window.ELMI || {};
const U = {}; window.ELMI.ui = U;
const C = ()=>window.ELMI.compute;

function h(tag, attrs, ...kids){
  const e = document.createElement(tag);
  if(attrs){ for(const k in attrs){
    const v=attrs[k];
    if(k==='class') e.className=v;
    else if(k==='html') e.innerHTML=v;
    else if(k==='style' && typeof v==='object'){ Object.assign(e.style,v); }
    else if(k.startsWith('on') && typeof v==='function') e.addEventListener(k.slice(2),v);
    else if(v!=null && v!==false) e.setAttribute(k,v===true?'':v);
  }}
  for(let kid of kids.flat(Infinity)){ if(kid==null||kid===false) continue; if(typeof kid==='string'||typeof kid==='number'){ e.appendChild(document.createTextNode(String(kid))); continue; } if(kid instanceof Node){ e.appendChild(kid); continue; } console.error('[ELMI ui.h] Skipped non-Node child for <'+tag+'>:', kid); }
  return e;
}
U.h = h;

U.section = (txt, sub) => h('div',{class:'section-title'}, txt, sub?h('span',{style:{textTransform:'none',letterSpacing:'0',fontWeight:'500',color:'var(--fg3)'}}, '· '+sub):null);

// KPI tile. opts: {eb, val, unit, cap, grad, dark, accentDot}
U.kpi = (o) => {
  const val = h('div',{class:'val'+(o.grad?' grad':'')}, String(o.val), o.unit?h('span',{class:'u'},' '+o.unit):null);
  return h('div',{class:'kpi'+(o.dark?' dark':'')},
    h('div',{class:'eb'}, o.accentDot?h('i'):null, o.eb),
    val,
    o.cap?h('div',{class:'cap'}, o.cap):null);
};

U.kpiGrid = (cls, items) => h('div',{class:'grid '+cls}, items.map(U.kpi));

// card with header + body
U.card = (o) => {
  const head = (o.title||o.sub) ? h('div',{class:'card-head'},
      h('h3',null,o.title), o.sub?h('span',{class:'ch-sub'},o.sub):null) : null;
  const body = h('div',{class:'card-pad'}, o.body);
  return h('div',{class:'card'}, head, body);
};

// chart card: title + canvas (returns {node, canvas})
U.chartCard = (o) => {
  const canvas = h('canvas');
  const box = h('div',{class:'chart-box', style:{height:(o.height||300)+'px'}}, canvas);
  const head = h('div',{class:'card-head'}, h('h3',null,o.title), o.sub?h('span',{class:'ch-sub'},o.sub):null);
  const legend = o.legend ? h('div',{class:'legend', style:{padding:'10px 22px 0'}}, o.legend.map(l=>h('div',{class:'li'}, h('span',{class:'sw',style:{background:l.color}}), l.label))) : null;
  const node = h('div',{class:'card'}, head, legend, h('div',{class:'card-pad'}, box));
  return {node, canvas};
};

// table. cols: [{k, label, align, fmt, cls}], rows: array of objects, opts:{total}
U.table = (cols, rows, opts={}) => {
  const thead = h('thead', null, h('tr', null, ...cols.map(c=>h('th',{style:c.align==='left'?{textAlign:'left'}:null}, c.label))));
  const tbody = h('tbody', null, ...rows.map(r=>{
    const cls = r.__cls||'';
    return h('tr',{class:cls}, cols.map(c=>{
      let v = typeof c.render==='function'? c.render(r) : r[c.k];
      if(v && v.nodeType) return h('td',{class:c.cls}, v);
      if(c.fmt) v=c.fmt(r[c.k], r);
      return h('td',{class:c.cls}, v==null?'–':v);
    }));
  }));
  return h('div',{class:'tbl-wrap'}, h('table',{class:'tbl'}, thead, tbody));
};

// CSS bar list. items: [{label, value, max, color, display}]
U.barlist = (items, max) => {
  const mx = max!=null?max:Math.max(1,...items.map(i=>i.value));
  return h('div',{class:'barlist'}, items.map(i=>h('div',{class:'b'},
    h('div',{class:'bl'}, i.label),
    h('div',{class:'bt'}, h('i',{style:{width:Math.max(0,Math.min(100,i.value/mx*100))+'%', background:i.color||'var(--elmi-gradient)'}})),
    h('div',{class:'bv'}, i.display!=null?i.display:String(i.value)))));
};

// page header with step nav
U.pageHead = (o) => h('div',{class:'page-head'},
  h('div',{class:'ph-l'}, h('div',{class:'eyebrow'}, o.eyebrow), h('h1',null,o.title), o.lead?h('div',{class:'lead'}, o.lead):null),
  o.nav!==false ? h('div',{class:'stepnav'},
    h('button',{class:'btn ghost sm', onclick:()=>window.ELMI.app.prevPage()}, '← Back'),
    h('button',{class:'btn ghost sm', onclick:()=>window.ELMI.app.nextPage()}, 'Next →')) : null);

U.statrow = (items) => h('div',{class:'statrow'}, items.map(i=>h('div',{class:'s'}, h('div',{class:'n'+(i.grad?' gradtext':'')}, i.value), h('div',{class:'l'}, i.label))));

U.note = (html) => h('div',{class:'note', html});

})();
