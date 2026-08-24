/* ============================================================
   ELMI CPO Dashboard — app shell, navigation, state
   ============================================================ */
(function(){
window.ELMI = window.ELMI || {};
const A = {}; window.ELMI.app = A;
const h = (...a)=>window.ELMI.ui.h(...a);
const C = ()=>window.ELMI.compute;

const TABS = [
  {id:'input',  short:'Settings',       label:'Settings'},
  {id:'exec',   short:'Executive',      label:'Executive Summary'},
  {id:'daily',  short:'Daily Trend',    label:'Daily Trend'},
  {id:'dailyutil', short:'Daily Util.', label:'Daily Utilization'},
  {id:'power',  short:'Power',          label:'Power Performance'},
  {id:'hardware', short:'Hardware',     label:'Hardware Availability'},
  {id:'status', short:'Status',         label:'Status Distribution'},
  {id:'flow',   short:'Energy Flow',    label:'Energy Flow'},
  {id:'hourly', short:'Hourly',         label:'Hourly Profile'},
  {id:'quality',short:'Process Quality',label:'Process Quality'},
  {id:'roadmap',short:'KPI Roadmap',    label:'KPI Roadmap'},
];
A.TABS = TABS;

let state, M, current=0;
let mountQueue=[];
A.onMount = fn => mountQueue.push(fn);

A.state = ()=>state;
A.metrics = ()=>M;

let elTabs, elContent, elInfoHost, elStationChip;
A._dataSource = 'Demo Dataset (embedded)';

// Swap in a freshly parsed dataset and regenerate the whole dashboard.
A.applyDB = function(db, sourceName){
  C().setDB(db);
  A._dataSource = sourceName ? ('Upload · '+sourceName) : (A._dataSource||'Dataset');
  state = C().defaultState();
  if(elStationChip) elStationChip.lastChild.textContent = 'SN '+db.sn;
  A.recompute();
  A.render();
};

A.recompute = function(){
  M = C().run(state);
  if(A._updateInfo) A._updateInfo(M);
};

A.render = function(){
  // tabs active state
  [...elTabs.children].forEach((b,i)=>{
    b.classList.toggle('active', i===current);
  });
  window.ELMI.charts.destroyAll();
  mountQueue = [];
  elContent.innerHTML='';
  const tab = TABS[current];
  let node;
  try{
    if(tab.id==='input'){
      node = window.ELMI.pages.input(state, ()=>A.recompute());
    } else {
      A.recompute();
      const fn = window.ELMI.pages[tab.id];
      node = fn ? fn(M) : h('div',{class:'page'}, h('h1',null,tab.label), h('p',{class:'muted'},'Coming soon.'));
    }
  }catch(err){
    console.error('[ELMI app.render] Failed to render tab "'+tab.id+'":', err);
    node = null;
  }
  if(!(node instanceof Node)){
    if(node!=null) console.error('[ELMI app.render] Tab "'+tab.id+'" returned a non-DOM value instead of a page node:', node);
    node = h('div',{class:'page'}, h('h1',null,tab.label||tab.id), h('p',{class:'muted'},'This page could not be rendered. Check the browser console for details.'));
  }
  elContent.appendChild(node);
  // force layout, then mount charts synchronously (rAF is throttled in hidden tabs)
  void elContent.offsetHeight;
  mountQueue.forEach(fn=>{ try{fn();}catch(e){console.error('chart mount error',e);} });
  if(tab.id==='input' && A._updateInfo) A._updateInfo(M);
  window.scrollTo(0,0);
  try{ location.hash = tab.id; }catch(e){}
};

A.goTo = function(i){ current=Math.max(0,Math.min(TABS.length-1,i)); A._cur=current; A.render(); };
A.nextPage = ()=>A.goTo(current+1);
A.prevPage = ()=>A.goTo(current-1);
A.reset = function(){ state = C().defaultState(); A.recompute(); A.render(); };

function buildShell(){
  const logo = h('img',{class:'logo', src:(window.__resources&&window.__resources.logo)||'assets/logo-elmi-power-black.png', alt:'ELMI Power'});
  const meta = h('div',{class:'appbar-meta'},
    h('span',{class:'title'},'CPO Test Dashboard'),
    h('span',{class:'sub'},'AiO 360 · Operations Data Analysis'));
  const station = h('div',{class:'station-chip'}, h('span',{class:'dot'}), 'SN '+C().getDB().sn);
  elStationChip = station;
  const uploadBtn = h('button',{class:'btn ghost sm', onclick:()=>window.ELMI.upload.pick(), title:'Load Excel raw data – dashboard will be recalculated automatically'},
    h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round',html:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'}), 'Load Data');
  const exportBtn = h('button',{class:'btn ghost sm', onclick:()=>window.ELMI.exportXlsx(), title:'Export current selection as Excel'},
    h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round',html:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'}), 'XLSX');
  const top = h('div',{class:'appbar-top'}, logo, meta, h('div',{class:'spacer'}), uploadBtn, exportBtn, station);

  elTabs = h('div',{class:'tabs'}, TABS.map((t,i)=>h('button',{class:'tab'+(t.id==='input'?' tab-input':''), onclick:()=>A.goTo(i)},
    h('span',{class:'num'}, t.id==='input'?'·':String(i).padStart(2,'0')), t.short)));

  const appbar = h('div',{class:'appbar'}, top, elTabs, h('div',{class:'gbar'}));
  elContent = h('div',{id:'content'});
  document.body.appendChild(appbar);
  document.body.appendChild(elContent);
}

A.boot = async function(){
  const db = await window.loadElmiData();
  C().setDB(db);
  state = C().defaultState();
  buildShell();
  if(window.ELMI.upload && window.ELMI.upload.initDragDrop) window.ELMI.upload.initDragDrop();
  // deep link
  const hash=(location.hash||'').slice(1);
  const idx = TABS.findIndex(t=>t.id===hash);
  current = idx>=0?idx:0;
  A.recompute();
  A.render();
};


/* ---- Passwortschutz: bewusst ENTFERNT ----
   Hier stand ein zweiter, eigener Login mit hartcodiertem Klartext-Passwort
   und einer nicht-kryptografischen Hashfunktion (Math.imul-Rolling-Hash) auf
   demselben sessionStorage-Key 'elmi_auth_37910'.

   Warum raus:
   1. Sicherheit - Passwort und Hashfunktion standen im ausgelieferten Code.
      Wer die Seite aufrief, konnte den Hash selbst berechnen, in sessionStorage
      schreiben und das Overlay ausblenden. Das Gate war damit wirkungslos.
   2. Korrektheit - der DOMContentLoaded-Handler blendete das Overlay wieder
      EIN, sobald sessionStorage nicht diesem alten Hash entsprach. Solange die
      Seite gebundelt war, lief dieser Handler nie (DOMContentLoaded war beim
      Einspielen der Bundle-Skripte laengst durch). Ohne Bundle laeuft er - und
      wuerde angemeldeten Nutzern das Login-Overlay erneut vor die Nase setzen.

   Der gueltige Zugangsschutz sitzt in index.html: SHA-256 gegen einen Hash,
   der beim Deploy aus dem GitHub-Secret AI_DASHBOARD_PASSWORD injiziert wird.
   window.elmiCheckLogin wird dort per Object.defineProperty festgenagelt.
   ------------------------------------------------------------------------ */
function _bootNow(){ A.boot().catch(e=>{ console.error(e); document.body.innerHTML='<div style="padding:40px;font-family:sans-serif">Error loading: '+e.message+'</div>'; }); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', _bootNow);
else _bootNow();
})();
