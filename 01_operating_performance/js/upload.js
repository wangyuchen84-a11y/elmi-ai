/* ============================================================
   ELMI CPO Dashboard — upload / data-ingest UI
   File picker + full-window drag&drop + toast. Parses a raw
   Excel export and hands the resulting DB to app.applyDB(),
   which regenerates every page automatically.
   ============================================================ */
(function(){
window.ELMI = window.ELMI || {};
const h = (...a)=>window.ELMI.ui.h(...a);
const Up = {}; window.ELMI.upload = Up;

let fileInput=null, overlay=null, toastHost=null;

function ensureFileInput(){
  if(fileInput) return fileInput;
  fileInput = h('input',{type:'file', accept:'.xlsx,.xls', style:{display:'none'}});
  fileInput.addEventListener('change', e=>{
    const f = e.target.files && e.target.files[0];
    if(f) Up.handleFile(f);
    fileInput.value='';
  });
  document.body.appendChild(fileInput);
  return fileInput;
}

Up.pick = function(){ ensureFileInput().click(); };

// ---- toast ----
function ensureToastHost(){
  if(toastHost) return toastHost;
  toastHost = h('div',{class:'toast-host'});
  document.body.appendChild(toastHost);
  return toastHost;
}
Up.toast = function(msg, kind){
  const host = ensureToastHost();
  const icon = kind==='error'
    ? '<path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.42 0z"/>'
    : '<path d="M20 6 9 17l-5-5"/>';
  const t = h('div',{class:'toast '+(kind||'ok')},
    h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2.2','stroke-linecap':'round','stroke-linejoin':'round',html:icon}),
    h('span',null,msg));
  host.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('in'));
  setTimeout(()=>{ t.classList.remove('in'); setTimeout(()=>t.remove(),300); }, kind==='error'?6000:3800);
};

// ---- core handler ----
Up.handleFile = async function(file){
  const name = (file.name||'').toLowerCase();
  if(!/\.(xlsx|xls)$/.test(name)){ Up.toast('Please select a .xlsx / .xls file.', 'error'); return; }
  Up.toast('Reading file…', 'ok');
  try{
    const db = await window.ELMI.parseWorkbook(file);
    window.ELMI.app.applyDB(db, file.name);
    const m = db._meta || {};
    Up.toast('Loaded: '+(m.rowCount||0).toLocaleString('en')+' data points · '+(m.dayCount||0)+' day(s) · SN '+db.sn, 'ok');
  }catch(err){
    console.error(err);
    Up.toast('Error: '+(err.message||'File could not be read.'), 'error');
  }
};

// ---- full-window drag & drop ----
Up.initDragDrop = function(){
  if(overlay) return;
  overlay = h('div',{class:'drop-overlay'},
    h('div',{class:'drop-card'},
      h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round',
        html:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 9l5-5 5 5"/><path d="M12 4v12"/>'}),
      h('div',{class:'dt'},'Drop raw Excel data here'),
      h('div',{class:'ds'},'.xlsx · same format as the demo dataset')));
  document.body.appendChild(overlay);
  let depth=0;
  const show=()=>overlay.classList.add('show');
  const hide=()=>overlay.classList.remove('show');
  window.addEventListener('dragenter', e=>{ if(e.dataTransfer && [...e.dataTransfer.types].includes('Files')){ e.preventDefault(); depth++; show(); }});
  window.addEventListener('dragover', e=>{ if(e.dataTransfer && [...e.dataTransfer.types].includes('Files')){ e.preventDefault(); }});
  window.addEventListener('dragleave', e=>{ depth=Math.max(0,depth-1); if(depth===0) hide(); });
  window.addEventListener('drop', e=>{
    if(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){ e.preventDefault(); depth=0; hide();
      Up.handleFile(e.dataTransfer.files[0]); }
  });
};

// ---- reusable dataset / dropzone card for the settings page ----
// returns a DOM node summarising the loaded dataset + an upload trigger
Up.datasetCard = function(){
  const c = window.ELMI.compute;
  const db = c.getDB();
  const days = c.allDays;
  const rng = (days.length? c.dayLabel(days[0])+' – '+c.dayLabel(days[days.length-1]) : '—');
  const src = window.ELMI.app._dataSource || 'Demo Dataset (embedded)';

  const dz = h('div',{class:'dropzone',
    onclick:()=>window.ELMI.upload.pick(),
    ondragover:e=>{ e.preventDefault(); dz.classList.add('hot'); },
    ondragleave:()=>dz.classList.remove('hot'),
    ondrop:e=>{ e.preventDefault(); dz.classList.remove('hot'); if(e.dataTransfer.files[0]) window.ELMI.upload.handleFile(e.dataTransfer.files[0]); }},
    h('div',{class:'dz-ic'},
      h('svg',{viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round',
        html:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'})),
    h('div',{class:'dz-tx'},
      h('div',{class:'dz-t'},'Upload Raw Excel Data'),
      h('div',{class:'dz-s'},'Drag file here or click · same column format as the demo export. The entire dashboard will be recalculated automatically.')),
    h('div',{class:'dz-cta'},'Select File'));

  const meta = h('div',{class:'ds-meta'},
    metaItem('Source', src),
    metaItem('Station SN', db.sn),
    metaItem('Period', rng),
    metaItem('Days', String(days.length)),
    metaItem('Data Points', c.fmt(db.rows.length,0)));

  return h('div',{class:'ds-card'}, dz, meta);
};
function metaItem(l,v){ return h('div',{class:'ds-mi'}, h('div',{class:'ds-ml'},l), h('div',{class:'ds-mv'},v)); }

})();
