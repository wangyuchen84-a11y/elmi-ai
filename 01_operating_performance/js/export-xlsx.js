/* XLSX export via SheetJS (fulfils CDN xlsx requirement) */
(function(){
window.ELMI = window.ELMI || {};
const A = window.ELMI;
const C = ()=>window.ELMI.compute;

function aoaFromTable(tbl){
  const rows=[];
  tbl.querySelectorAll('tr').forEach(tr=>{
    const cells=[...tr.children].map(td=>{
      const t=td.textContent.trim();
      // try numeric -> number
      const n=t.replace(/\./g,'').replace(',', '.').replace(/[^\d.\-]/g,'');
      return (t.match(/^[\d.\-\s%]+$/) && n!=='' && !isNaN(+n)) ? +n : t;
    });
    rows.push(cells);
  });
  return rows;
}

A.app = A.app || {};
A.exportXlsx = function(){
  if(!window.XLSX){ alert('Export library not yet loaded.'); return; }
  const app=window.ELMI.app, c=C(); const M=app.metrics(); const s=app.state();
  const wb = XLSX.utils.book_new();

  // 1) Filter sheet
  const filt = [
    ['ELMI CPO Test Dashboard — Export'],
    ['Station', c.getDB().sn],
    ['Period', s.dateFrom+' – '+s.dateTo],
    ['Time Window', pad(s.tFrom)+' – '+(s.tTo>=1440?'24:00':pad(s.tTo))],
    ['Weekdays', c.WD.filter((w,i)=>s.weekdays[i]).join(', ')],
    ['Charging Point', s.cp.toUpperCase()],
    ['Status Filter', c.STATUSES.filter(x=>s.statuses[x]).join(', ')],
    ['Percentile Filter', s.pct],
    ['Selected Data Points', M.selected.length],
    ['Days', M.D], ['Measurement Hours', +M.scopeHours.toFixed(1)],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filt), 'Filter');

  // 2) all visible tables on current page
  const tables=document.querySelectorAll('#content table.tbl');
  const tabName = app.TABS[currentIdx()].label.slice(0,28);
  tables.forEach((t,i)=>{
    const ws=XLSX.utils.aoa_to_sheet(aoaFromTable(t));
    XLSX.utils.book_append_sheet(wb, ws, (tables.length>1?(i+1)+' ':'')+tabName);
  });

  // 3) per-day summary always
  const pd=[['Date','AC kWh','DC kWh','CP1 kWh','CP2 kWh','Sessions','DC Energy Util %','AC Energy Util %','Conn Time Util %','AC Time Util %']];
  M.perDay.forEach(d=>pd.push([c.dayLabel(d.day), r(d.ac), r(d.dc), r(d.g1), r(d.g2), d.sessions, r(d.dcEnergyUtil*100,2), r(d.acEnergyUtil*100,2), r(d.dcTimeUtil*100,2), r(d.acTimeUtil*100,2)]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(pd), 'Daily Values');

  // 4) sessions
  const se=[['Charging Point','Start (UTC)','End (UTC)','Duration min','kWh','Peak kW','Avg kW','SOC start %','SOC end %']];
  M.sessions.forEach(x=>se.push([c.gunLabel(x.gun), iso(x.startT), iso(x.endT), x.durMin, r(x.kwh,1), r(x.maxKw), r(x.avgKw), x.socStart, x.socEnd]));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(se), 'Sessions');

  XLSX.writeFile(wb, 'ELMI_CPO_Export_'+s.dateFrom+'_'+s.dateTo+'.xlsx');
};
function r(v,d){ d=d==null?0:d; return v==null||isNaN(v)?'':+(+v).toFixed(d); }
function pad(m){ return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
function iso(t){ return new Date(t).toISOString().slice(0,16).replace('T',' '); }
function currentIdx(){ const a=window.ELMI.app; return Math.max(1, a._cur||1); }
})();
