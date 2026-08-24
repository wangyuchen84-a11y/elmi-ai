/* ============================================================
   ELMI CPO Dashboard — Excel → DB parser
   Reads a raw operation-data workbook (same shape as the
   embedded demo) and returns the exact { sn, start, statuses,
   rows } structure that compute.setDB() consumes. So the whole
   dashboard regenerates automatically from an uploaded file.
   ============================================================ */
(function(){
window.ELMI = window.ELMI || {};

const MS_MIN = 60000;

// robust UTC timestamp parse — string "YYYY-MM-DD HH:MM[:SS]", Date, or Excel serial
function parseTS(v){
  if(v==null||v==='') return null;
  if(v instanceof Date) return Date.UTC(v.getUTCFullYear(),v.getUTCMonth(),v.getUTCDate(),v.getUTCHours(),v.getUTCMinutes(),v.getUTCSeconds());
  if(typeof v==='number') return Math.round((v-25569)*86400000); // Excel serial → ms
  const s=String(v).trim();
  const m=s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if(m) return Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0));
  const t=Date.parse(s); return isNaN(t)?null:t;
}

function tsLabel(ms){
  const d=new Date(ms);
  const p=n=>String(n).padStart(2,'0');
  return d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate())+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());
}

const num = v => (v==null||v==='') ? null : (typeof v==='number'? v : (isNaN(+String(v).replace(',','.')) ? null : +String(v).replace(',','.')));

// find a column whose header contains every keyword; else fallback index
function col(headers, keys, fallback){
  const low = headers.map(x=>String(x==null?'':x).toLowerCase());
  for(let i=0;i<low.length;i++){ if(keys.every(k=>low[i].includes(k))) return i; }
  return fallback;
}

const KNOWN_STATUSES = ['Available','Charging','Finishing','Preparing','Starting'];
function normStatus(v){
  if(v==null) return null;
  const s=String(v).trim();
  if(!s) return null;
  const hit = KNOWN_STATUSES.find(k=>k.toLowerCase()===s.toLowerCase());
  return hit || s;
}

// Parse an array of header arrays (rows from sheet_to_json header:1) into db
function rowsToDB(matrix){
  // locate header row: first row that mentions a timestamp + a gun
  let hIdx=0;
  for(let i=0;i<Math.min(matrix.length,8);i++){
    const j=matrix[i].map(x=>String(x==null?'':x).toLowerCase()).join('|');
    if((j.includes('timestamp')||j.includes('time')) && (j.includes('gun')||j.includes('dc'))){ hIdx=i; break; }
  }
  const headers = matrix[hIdx]||[];
  const ix = {
    sn:   col(headers,['sn'],0),
    ts:   col(headers,['timestamp'],1),
    acE:  col(headers,['ac','kwh'],2),
    acP:  col(headers,['ac','power'],3),
    bSoc: col(headers,['battery','soc'],4),
    bP:   col(headers,['battery','power'],5),
    g1E:  col(headers,['gun1','meter'],6),
    g1S:  col(headers,['gun1','soc'],7),
    g1P:  col(headers,['gun1','power'],8),
    g1St: col(headers,['gun1','status'],9),
    g2E:  col(headers,['gun2','meter'],10),
    g2S:  col(headers,['gun2','soc'],11),
    g2P:  col(headers,['gun2','power'],12),
    g2St: col(headers,['gun2','status'],13),
  };

  const body = matrix.slice(hIdx+1).filter(r=>r && r.length && (r[ix.ts]!=null && r[ix.ts]!==''));
  if(!body.length) throw new Error('No data rows found.');

  let sn=null;
  const statuses = new Set();
  let last=null;
  const rows=[];
  for(const r of body){
    const t = parseTS(r[ix.ts]);
    if(t==null) continue;
    if(sn==null && r[ix.sn]!=null && r[ix.sn]!=='') sn=String(r[ix.sn]).trim();
    const ff = (raw,key)=>{ const v=num(raw); return (v==null && last)? last[key] : v; };
    const g1st=normStatus(r[ix.g1St]), g2st=normStatus(r[ix.g2St]);
    if(g1st) statuses.add(g1st); if(g2st) statuses.add(g2st);
    const o = {
      t,
      ac_kwh: ff(r[ix.acE],'ac_kwh'),  ac_kw: num(r[ix.acP])||0,
      bat_soc: ff(r[ix.bSoc],'bat_soc'), bat_kw: num(r[ix.bP])||0,
      g1_kwh: ff(r[ix.g1E],'g1_kwh'), g1_soc: ff(r[ix.g1S],'g1_soc')||0, g1_kw: num(r[ix.g1P])||0, g1_st: g1st,
      g2_kwh: ff(r[ix.g2E],'g2_kwh'), g2_soc: ff(r[ix.g2S],'g2_soc')||0, g2_kw: num(r[ix.g2P])||0, g2_st: g2st,
      gap: num(r[ix.g1E])==null && num(r[ix.g2E])==null
    };
    last=o;
    rows.push(o);
  }
  rows.sort((a,b)=>a.t-b.t);
  if(rows.length<2) throw new Error('Too few valid data points.');

  // sanity: monotonic-ish, at least one day
  const days = new Set(rows.map(r=>tsLabel(r.t).slice(0,10)));
  return {
    sn: sn||'—',
    start: tsLabel(rows[0].t),
    statuses: KNOWN_STATUSES,
    rows,
    _meta: { rowCount: rows.length, dayCount: days.size, from: tsLabel(rows[0].t), to: tsLabel(rows[rows.length-1].t) }
  };
}

// Public: parse a File / Blob / ArrayBuffer → db
window.ELMI.parseWorkbook = async function(input){
  if(typeof XLSX==='undefined') throw new Error('XLSX library not loaded.');
  let buf;
  if(input instanceof ArrayBuffer) buf = input;
  else if(input && typeof input.arrayBuffer==='function') buf = await input.arrayBuffer();
  else throw new Error('Invalid input.');
  const wb = XLSX.read(new Uint8Array(buf), {type:'array'});
  // prefer a sheet named like "raw"/"operation"/"data", else first
  let name = wb.SheetNames.find(n=>/raw|operation|data|roh/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[name];
  if(!ws) throw new Error('No sheet found in file.');
  const matrix = XLSX.utils.sheet_to_json(ws, {header:1, raw:true, defval:null});
  return rowsToDB(matrix);
};
})();
