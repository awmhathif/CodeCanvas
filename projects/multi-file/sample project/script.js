/* Personal Finance Forecast - single-file frontend logic
   - localStorage persistence
   - scenarios with items (income/expense)
   - projection over months
   - compare multiple scenarios (checkbox)
   - CSV export, JSON import
*/

(function(){
  // DOM
  const monthsEl = dom('#months');
  const startBalanceEl = dom('#startBalance');
  const addScenarioBtn = dom('#addScenario');
  const exportCSVBtn = dom('#exportCSV');
  const clearAllBtn = dom('#clearAll');
  const scenarioListEl = dom('#scenarioList');
  const itemForm = dom('#itemForm');
  const itemName = dom('#itemName');
  const itemAmt = dom('#itemAmt');
  const itemType = dom('#itemType');
  const itemFreq = dom('#itemFreq');
  const itemStart = dom('#itemStart');
  const itemScenario = dom('#itemScenario');
  const itemsListEl = dom('#itemsList');
  const itemsCountEl = dom('#itemsCount');
  const chartCanvas = dom('#chart');
  const tableWrap = dom('#tableWrap');
  const importBtn = dom('#importBtn');
  const fileImport = dom('#fileImport');

  // state & storage
  const STORAGE_KEY = 'finance_forecast_v1';
  let state = { scenarios: [], activeId: null, compare: {} }; // compare: id->bool
  const COLORS = ['#2563eb','#059669','#ef4444','#f97316','#7c3aed','#0ea5a4','#db2777'];

  // init
  load();
  if (!state.scenarios.length) {
    createScenario('Base scenario');
  }
  renderAll();
  attachEvents();

  // ---------- helpers ----------
  function dom(sel){ return document.querySelector(sel); }
  function q(sel, el=document){ return el.querySelector(sel); }
  function el(tag, attrs={}, children=[]){
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if (k==='class') e.className=v;
      else if (k==='html') e.innerHTML=v;
      else e.setAttribute(k,v);
    });
    (Array.isArray(children)?children:[children]).flat().forEach(c=>{ if (typeof c === 'string') e.appendChild(document.createTextNode(c)); else if(c) e.appendChild(c); });
    return e;
  }
  function uid(prefix='id'){ return prefix + Math.random().toString(36).slice(2,9); }
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  function load(){ try{ state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || state; }catch(e){ console.warn('load failed', e); } }

  // ---------- state actions ----------
  function createScenario(name){
    const s = { id: uid('s'), name: name||'Scenario', items: [] };
    state.scenarios.push(s);
    state.activeId = s.id;
    save();
    return s;
  }
  function deleteScenario(id){
    const idx = state.scenarios.findIndex(s=>s.id===id);
    if (idx>=0) state.scenarios.splice(idx,1);
    if (state.activeId===id) state.activeId = state.scenarios.length ? state.scenarios[0].id : null;
    delete state.compare[id];
    save();
  }
  function addItemToScenario(sid, item){
    const s = state.scenarios.find(x=>x.id===sid);
    if (!s) return;
    s.items.push(Object.assign({ id: uid('i') }, item));
    save();
  }
  function removeItem(sid, itemId){
    const s = state.scenarios.find(x=>x.id===sid);
    if (!s) return;
    s.items = s.items.filter(i=>i.id!==itemId);
    save();
  }
  function renameScenario(id, name){
    const s = state.scenarios.find(x=>x.id===id);
    if (s){ s.name = name; save(); }
  }

  // ---------- rendering ----------
  function renderAll(){
    renderScenarioList();
    renderItemsPanel();
    renderProjection();
  }

  function renderScenarioList(){
    scenarioListEl.innerHTML = '';
    state.scenarios.forEach((s, idx)=>{
      const row = el('div',{class:'scenario-item'});
      const meta = el('div',{class:'scenario-meta'});
      const chk = el('input',{type:'checkbox','class':'checkbox'});
      chk.checked = !!state.compare[s.id];
      chk.addEventListener('change', ()=>{ state.compare[s.id] = chk.checked; save(); renderProjection(); });

      const nameInput = el('input',{value:s.name});
      nameInput.style.border='none'; nameInput.style.background='transparent'; nameInput.style.fontWeight='600';
      nameInput.addEventListener('blur', ()=>{ renameScenario(s.id, nameInput.value); renderScenarioList(); renderProjection(); });

      const left = el('div',{},[chk, nameInput]);
      meta.appendChild(left);

      const actions = el('div',{});
      const btnView = el('button',{class:'btn ghost', title:'Set active'}, 'Open');
      btnView.addEventListener('click', ()=>{ state.activeId = s.id; save(); renderAll(); });
      const btnDup = el('button',{class:'btn ghost'}, 'Dup');
      btnDup.addEventListener('click', ()=>{ const ns = JSON.parse(JSON.stringify(s)); ns.id = uid('s'); ns.name = s.name + ' (copy)'; state.scenarios.push(ns); save(); renderAll(); });
      const btnDel = el('button',{class:'btn danger'}, 'Del');
      btnDel.addEventListener('click', ()=>{ if(confirm('Delete scenario?')){ deleteScenario(s.id); renderAll(); }});
      actions.appendChild(btnView); actions.appendChild(btnDup); actions.appendChild(btnDel);

      row.appendChild(meta); row.appendChild(actions);
      if (state.activeId === s.id) row.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.08)';
      scenarioListEl.appendChild(row);
    });
  }

  function renderItemsPanel(){
    const s = state.scenarios.find(x=>x.id===state.activeId);
    itemScenario.value = state.activeId || '';
    itemsListEl.innerHTML = '';
    if (!s) { itemsCountEl.textContent = ''; return; }
    itemsCountEl.textContent = `${s.items.length} items`;

    s.items.forEach(it=>{
      const r = el('div',{class:'item-row'});
      const left = el('div',{},[
        el('div',{html:`<strong>${it.name}</strong> <span class="muted small">(${it.type}, ${it.freq}, start ${it.start})</span>`})
      ]);
      const right = el('div',{},[
        el('div',{html:`${formatMoney( it.type==='income' ? it.amount : -it.amount )}`})
      ]);
      const del = el('button',{class:'btn ghost'}, 'x');
      del.addEventListener('click', ()=>{ removeItem(s.id, it.id); renderItemsPanel(); renderProjection(); });
      r.appendChild(left); r.appendChild(right); r.appendChild(del);
      itemsListEl.appendChild(r);
    });
  }

  function renderProjection(){
    // determine months and scenarios to draw
    const months = Math.max(1, parseInt(monthsEl.value||12,10));
    const startBal = parseFloat(startBalanceEl.value||0);
    const toCompare = Object.keys(state.compare).filter(id=>state.compare[id]).slice(0,6);
    // if none selected, use active scenario only
    const scenariosToPlot = toCompare.length ? state.scenarios.filter(s=>toCompare.includes(s.id)) : (state.activeId ? state.scenarios.filter(s=>s.id===state.activeId) : []);
    // compute projections
    const projections = scenariosToPlot.map((s, idx)=>{
      const data = computeProjection(s, months, startBal);
      return { id:s.id, name:s.name, color: COLORS[idx % COLORS.length], data };
    });

    drawChart(projections, months);
    renderTable(projections[0] || null, months);
  }

  // ---------- projection logic ----------
  function computeProjection(scenario, months, startBalance){
    // returns array of {month, net, balance}
    const res = [];
    let bal = Number(startBalance) || 0;
    for(let m=0;m<months;m++){
      let net = 0;
      scenario.items.forEach(it=>{
        const amt = Number(it.amount) || 0;
        const start = Number(it.start) || 0;
        if (m < start) return;
        if (it.freq === 'monthly') net += (it.type==='income' ? amt : -amt);
        else if (it.freq === 'one-time'){
          if (m === start) net += (it.type==='income' ? amt : -amt);
        } else if (it.freq === 'annual'){
          if ((m - start) % 12 === 0) net += (it.type==='income' ? amt : -amt);
        }
      });
      bal = +(bal + net);
      res.push({ month: m, net: +net, balance: +bal });
    }
    return res;
  }

  // ---------- chart ----------
  function drawChart(projections, months){
    const canvas = chartCanvas;
    const ctx = canvas.getContext('2d');
    // responsive
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0,0,rect.width, rect.height);

    // compute y-range across projections
    let minY = Infinity, maxY = -Infinity;
    projections.forEach(p=>p.data.forEach(pt=>{ if(pt.balance<minY) minY=pt.balance; if(pt.balance>maxY) maxY=pt.balance; }));
    if (!isFinite(minY)){ // nothing to plot
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px system-ui';
      ctx.fillText('No scenario selected or no data', 20, 30);
      return;
    }
    // padding
    const padTop = 20, padBottom = 30, padLeft = 50, padRight = 20;
    const w = rect.width - padLeft - padRight;
    const h = rect.height - padTop - padBottom;
    // if flat range, expand
    if (maxY === minY){ maxY = maxY + 1; minY = minY - 1; }
    const yScale = v => padTop + h - ((v - minY) / (maxY - minY)) * h;
    const xScale = i => padLeft + (i / Math.max(1, months-1)) * w;

    // axes grid
    ctx.strokeStyle = '#eef2f7'; ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=0;i<=4;i++){
      const gy = padTop + (h/4)*i;
      ctx.moveTo(padLeft, gy); ctx.lineTo(padLeft + w, gy);
    }
    ctx.stroke();

    // y labels
    ctx.fillStyle = '#64748b'; ctx.font = '12px system-ui';
    for(let i=0;i<=4;i++){
      const v = minY + ( (4-i)/4 )*(maxY-minY);
      const y = padTop + (h/4)*i + 4;
      ctx.fillText(formatMoney(Math.round(v*100)/100), 6, y);
    }

    // x labels
    ctx.textAlign = 'center';
    for(let i=0;i<months;i+=Math.ceil(Math.max(1, months/12))){
      const x = xScale(i);
      ctx.fillText(`M${i+1}`, x, padTop + h + 18);
    }
    ctx.textAlign = 'left';

    // plot each projection line
    projections.forEach((p, idx)=>{
      ctx.beginPath();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = p.color;
      p.data.forEach((pt,i)=>{
        const x = xScale(i), y = yScale(pt.balance);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      });
      ctx.stroke();

      // draw circles
      ctx.fillStyle = p.color;
      p.data.forEach((pt,i)=>{
        const x = xScale(i), y = yScale(pt.balance);
        ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
      });

      // legend
      ctx.fillStyle = p.color;
      ctx.fillRect(rect.width - padRight - 110, padTop + idx*18 - 6, 10,10);
      ctx.fillStyle = '#0b1220';
      ctx.font = '12px system-ui';
      ctx.fillText(p.name, rect.width - padRight - 90, padTop + idx*18 + 2);
    });
  }

  // ---------- table ----------
  function renderTable(projection, months){
    tableWrap.innerHTML = '';
    if (!projection) return;
    const data = projection.data;
    const tbl = el('table');
    const thead = el('thead',{}, [
      el('tr',{}, [
        el('th',{}, 'Month'),
        el('th',{}, 'Net'),
        el('th',{}, 'Balance')
      ])
    ]);
    const tbody = el('tbody');
    data.forEach(row=>{
      const tr = el('tr',{},[
        el('td',{}, `M${row.month+1}`),
        el('td',{}, formatMoney(row.net)),
        el('td',{}, formatMoney(row.balance))
      ]);
      tbody.appendChild(tr);
    });
    tbl.appendChild(thead); tbl.appendChild(tbody);
    tableWrap.appendChild(tbl);
  }

  // ---------- CSV / import / export ----------
  function exportCSV(){
    const months = Math.max(1, parseInt(monthsEl.value||12,10));
    const startBal = parseFloat(startBalanceEl.value||0);
    const active = state.scenarios.find(s=>s.id===state.activeId);
    if (!active) return alert('No active scenario to export.');
    const proj = computeProjection(active, months, startBal);
    const lines = [['month','net','balance']];
    proj.forEach(r=> lines.push([r.month+1, r.net, r.balance]));
    const csv = lines.map(r => r.join(',')).join('\n');
    downloadBlob(new Blob([csv],{type:'text/csv'}), `${safeFilename(active.name)}-projection.csv`);
  }

  function importJSONFile(file){
    const reader = new FileReader();
    reader.onload = (e)=>{
      try{
        const obj = JSON.parse(e.target.result);
        if (Array.isArray(obj.scenarios)){
          // merge scenarios (assign new ids)
          obj.scenarios.forEach(s=>{
            s.id = uid('s');
            if (Array.isArray(s.items)) s.items.forEach(it=>it.id = uid('i'));
            state.scenarios.push(s);
          });
          save(); renderAll();
        } else alert('JSON should contain { "scenarios": [ ... ] }');
      }catch(err){ alert('Invalid JSON'); }
    };
    reader.readAsText(file);
  }

  // ---------- utilities ----------
  function formatMoney(n){ return (typeof n === 'number' ? (n<0?'-':'') + '$' + Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : n); }
  function downloadBlob(blob, filename){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  }
  function safeFilename(s){ return s.replace(/[^\w\d\-]+/g,'_').slice(0,60); }

  // ---------- events ----------
  function attachEvents(){
    addScenarioBtn.addEventListener('click', ()=>{ const s = createScenario(prompt('Scenario name') || 'Scenario'); save(); renderAll(); });

    itemForm.addEventListener('submit', (e)=>{
      e.preventDefault();
      const sid = itemScenario.value || state.activeId;
      if (!sid) return alert('No active scenario');
      const item = {
        name: itemName.value.trim(),
        amount: Math.abs(parseFloat(itemAmt.value||0)),
        type: itemType.value,
        freq: itemFreq.value,
        start: Math.max(0, parseInt(itemStart.value||0,10))
      };
      addItemToScenario(sid, item);
      itemName.value=''; itemAmt.value=''; itemStart.value=0;
      renderItemsPanel(); renderProjection();
    });

    exportCSVBtn.addEventListener('click', exportCSV);

    clearAllBtn.addEventListener('click', ()=>{ if(confirm('Clear all data?')){ localStorage.removeItem(STORAGE_KEY); state = {scenarios:[], activeId:null, compare:{}}; createScenario('Base'); renderAll(); }});

    monthsEl.addEventListener('change', renderProjection);
    startBalanceEl.addEventListener('change', renderProjection);

    importBtn.addEventListener('click', ()=> fileImport.click());
    fileImport.addEventListener('change', (ev)=>{
      const f = ev.target.files && ev.target.files[0];
      if (f) importJSONFile(f);
      fileImport.value = '';
    });

    // when clicking Open from scenario list we set active; need to render items; also allow selecting scenario by clicking the name (handled above)
    // observe state changes on storage from other tabs
    window.addEventListener('storage', (e)=>{ if (e.key === STORAGE_KEY) { load(); renderAll(); } });

    // initial render and ensure resize handling
    window.addEventListener('resize', ()=> { renderProjection(); });
  }

  // ---------- initial sample data if empty ----------
  function ensureSample(){
    if (state.scenarios.length) return;
    const s = createScenario('Default');
    s.items.push({ id: uid('i'), name:'Salary', amount:2000, type:'income', freq:'monthly', start:0});
    s.items.push({ id: uid('i'), name:'Rent', amount:700, type:'expense', freq:'monthly', start:0});
    s.items.push({ id: uid('i'), name:'Vacation', amount:800, type:'expense', freq:'one-time', start:6});
    save();
  }

  ensureSample();

  // final render helpers
  // when state changes and active scenario changed, re-render scenario list and items panel are triggered by renderAll
  // ensure activeId exists
  if (!state.activeId && state.scenarios.length) state.activeId = state.scenarios[0].id;

  // expose minor debug to window
  window.ffstate = state;

})();
