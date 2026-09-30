(() => {
"use strict";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const DB_NAME = "JCFinanzasProDB";
const DB_VERSION = 1;
const STORE_APP = "app";
const STORE_BACKUPS = "backups";
const MAIN_KEY = "main";

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`;
const clone = x => JSON.parse(JSON.stringify(x));
const todayISO = () => new Date().toISOString().slice(0,10);
const monthKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const escapeHtml = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

const demo = {
  profile:{
    name:"J. Carlos", currency:"USD", theme:"light", privacy:false, savingsGoal:3000,
    pinHash:"", biometricCredentialId:"", autoLock:false, autoBackup:true, lastBackup:""
  },
  categories:["Alimentación","Transporte","Vivienda","Servicios","Educación","Salud","Entretenimiento","Ahorro","Salario","Deudas","Otros"],
  accounts:[
    {id:"a1",name:"Cuenta principal",type:"Banco",openingBalance:2350.49},
    {id:"a2",name:"Ahorro",type:"Ahorro",openingBalance:680},
    {id:"a3",name:"Efectivo",type:"Efectivo",openingBalance:154}
  ],
  transactions:[
    {id:"t1",type:"income",amount:650,date:"2026-09-01",category:"Salario",account:"a1",desc:"Salario mensual"},
    {id:"t2",type:"expense",amount:87.42,date:"2026-09-06",category:"Alimentación",account:"a1",desc:"Supermercado"},
    {id:"t3",type:"expense",amount:36,date:"2026-09-10",category:"Transporte",account:"a1",desc:"Combustible"},
    {id:"t4",type:"expense",amount:24.99,date:"2026-09-14",category:"Servicios",account:"a1",desc:"Suscripción digital"},
    {id:"t5",type:"income",amount:120,date:"2026-09-18",category:"Otros",account:"a1",desc:"Servicio profesional"},
    {id:"t6",type:"expense",amount:55.30,date:"2026-09-24",category:"Entretenimiento",account:"a3",desc:"Salida familiar"}
  ],
  transfers:[],
  budgets:[
    {id:"b1",category:"Alimentación",limit:250},
    {id:"b2",category:"Transporte",limit:140},
    {id:"b3",category:"Servicios",limit:160},
    {id:"b4",category:"Entretenimiento",limit:100}
  ],
  cards:[
    {id:"c1",name:"Visa Principal",limit:1200,balance:210,cutoffDay:18,dueDay:28,minPayment:25}
  ],
  debts:[
    {id:"d1",name:"Préstamo personal",original:1500,balance:980,monthlyPayment:95,rate:12,dueDay:15}
  ],
  assets:[
    {id:"as1",name:"Vehículo",type:"Vehículo",value:3200},
    {id:"as2",name:"Inversión",type:"Inversión",value:500}
  ],
  recurring:[
    {id:"r1",name:"Internet",day:5,amount:30,account:"a1",category:"Servicios"},
    {id:"r2",name:"Energía eléctrica",day:12,amount:48,account:"a1",category:"Servicios"},
    {id:"r3",name:"Telefonía",day:18,amount:22,account:"a1",category:"Servicios"}
  ],
  reminders:[
    {id:"m1",title:"Revisar presupuesto",date:"2026-10-01",note:"Ajustar límites del nuevo mes",done:false}
  ]
};

let db = null;
let data = clone(demo);
let currentView = "dashboard";
let calendarCursor = new Date();
let editingTx = null;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if(!d.objectStoreNames.contains(STORE_APP)) d.createObjectStore(STORE_APP);
      if(!d.objectStoreNames.contains(STORE_BACKUPS)) d.createObjectStore(STORE_BACKUPS,{keyPath:"id"});
    };
    req.onsuccess = () => {db=req.result; resolve(db)};
    req.onerror = () => reject(req.error);
  });
}
function dbGet(store,key){
  return new Promise((resolve,reject)=>{
    const req=db.transaction(store,"readonly").objectStore(store).get(key);
    req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
  });
}
function dbPut(store,value,key){
  return new Promise((resolve,reject)=>{
    const os=db.transaction(store,"readwrite").objectStore(store);
    const req = key===undefined ? os.put(value) : os.put(value,key);
    req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error);
  });
}
function dbDelete(store,key){
  return new Promise((resolve,reject)=>{
    const req=db.transaction(store,"readwrite").objectStore(store).delete(key);
    req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error);
  });
}
function dbAll(store){
  return new Promise((resolve,reject)=>{
    const req=db.transaction(store,"readonly").objectStore(store).getAll();
    req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);
  });
}
async function loadData(){
  try{
    await openDB();
    const saved=await dbGet(STORE_APP,MAIN_KEY);
    if(saved) data={...clone(demo),...saved,profile:{...demo.profile,...saved.profile}};
    else await dbPut(STORE_APP,data,MAIN_KEY);
  }catch(e){
    const raw=localStorage.getItem("JCFinanzasPWA");
    if(raw) data={...clone(demo),...JSON.parse(raw)};
  }
}
async function persist(){
  try{ if(db) await dbPut(STORE_APP,data,MAIN_KEY); else localStorage.setItem("JCFinanzasPWA",JSON.stringify(data)); }catch{}
  if(data.profile.autoBackup) maybeDailyBackup();
}
async function maybeDailyBackup(){
  const key=todayISO();
  if(data.profile.lastBackup===key) return;
  await createSnapshot(false);
}
async function createSnapshot(showToast=true){
  if(!db){ if(showToast) toast("El navegador no permitió respaldos locales"); return; }
  const id=`backup-${new Date().toISOString()}`;
  await dbPut(STORE_BACKUPS,{id,date:new Date().toISOString(),data:clone(data)});
  let all=(await dbAll(STORE_BACKUPS)).sort((a,b)=>b.date.localeCompare(a.date));
  for(const old of all.slice(10)) await dbDelete(STORE_BACKUPS,old.id);
  data.profile.lastBackup=todayISO();
  await dbPut(STORE_APP,data,MAIN_KEY);
  if(showToast) toast("Respaldo local creado");
  renderSettings();
}

function money(v){
  if(data.profile.privacy) return "••••••";
  try{return new Intl.NumberFormat("es-SV",{style:"currency",currency:data.profile.currency||"USD"}).format(Number(v)||0)}
  catch{return "$"+Number(v||0).toFixed(2)}
}
function dateFmt(s){
  if(!s) return "";
  const [y,m,d]=s.split("-");
  return `${d}/${m}/${y}`;
}
function accountBalance(id){
  const a=data.accounts.find(x=>x.id===id);
  if(!a) return 0;
  let bal=Number(a.openingBalance)||0;
  data.transactions.forEach(t=>{
    if(t.account===id) bal += t.type==="income" ? Number(t.amount)||0 : -(Number(t.amount)||0);
  });
  data.transfers.forEach(t=>{
    if(t.from===id) bal-=Number(t.amount)||0;
    if(t.to===id) bal+=Number(t.amount)||0;
  });
  return bal;
}
function totalAccounts(){ return data.accounts.reduce((s,a)=>s+accountBalance(a.id),0); }
function totalCards(){ return data.cards.reduce((s,c)=>s+(Number(c.balance)||0),0); }
function totalDebts(){ return data.debts.reduce((s,d)=>s+(Number(d.balance)||0),0); }
function totalAssets(){ return data.assets.reduce((s,a)=>s+(Number(a.value)||0),0); }
function netWorth(){ return totalAccounts()+totalAssets()-totalCards()-totalDebts(); }
function monthTransactions(year,month){
  const mk=`${year}-${String(month).padStart(2,"0")}`;
  return data.transactions.filter(t=>t.date.startsWith(mk));
}
function monthTotals(year,month){
  let income=0,expense=0;
  monthTransactions(year,month).forEach(t=>t.type==="income"?income+=+t.amount:expense+=+t.amount);
  return {income,expense};
}
function currentMonthTotals(){
  const n=new Date(); return monthTotals(n.getFullYear(),n.getMonth()+1);
}
function savingsRate(){
  const t=currentMonthTotals();
  return t.income ? Math.max(0,Math.round((t.income-t.expense)/t.income*100)) : 0;
}
function toast(msg){
  const t=$("#toast"); t.textContent=msg;t.classList.add("show");
  clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>t.classList.remove("show"),2300);
}
function empty(msg){return `<div class="empty">${escapeHtml(msg)}</div>`}
function accountName(id){return data.accounts.find(a=>a.id===id)?.name||"Cuenta eliminada"}

function render(){
  applyTheme();
  renderHeader();
  renderDashboard();
  renderTransactions();
  renderAccounts();
  renderBudgets();
  renderCards();
  renderDebts();
  renderNetWorth();
  renderCalendar();
  renderYears();
  renderSettings();
  renderAlerts();
  persist();
  setTimeout(drawCharts,30);
}
function renderHeader(){
  $("#headerDate").textContent=new Intl.DateTimeFormat("es-SV",{weekday:"short",day:"2-digit",month:"short"}).format(new Date());
  $("#drawerName").textContent=data.profile.name;
  $("#drawerNetWorth").textContent=money(netWorth());
  $("#privacyBtn").innerHTML=data.profile.privacy
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.5 10.5 0 0 1 12 4c6 0 10 8 10 8a18 18 0 0 1-3 3.8M6.6 6.6C3.9 8.5 2 12 2 12s4 8 10 8a10 10 0 0 0 4.1-.9"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>`;
  $("#themeBtn").innerHTML=data.profile.theme==="dark"
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A8 8 0 1 1 11.2 3 6.5 6.5 0 0 0 21 12.8z"/></svg>`;
}
function renderDashboard(){
  const t=currentMonthTotals();
  $("#netWorthHero").textContent=money(netWorth());
  $("#heroAccounts").textContent=money(totalAccounts());
  $("#heroSavingsRate").textContent=savingsRate()+"%";
  $("#kpiIncome").textContent=money(t.income);
  $("#kpiExpense").textContent=money(t.expense);
  $("#kpiDebt").textContent=money(totalDebts()+totalCards());
  $("#kpiAssets").textContent=money(totalAssets()+totalAccounts());
  const now=new Date();
  const totalBudget=data.budgets.reduce((s,b)=>s+(+b.limit||0),0);
  const expense=t.expense;
  $("#budgetPreview").innerHTML=data.budgets.slice(0,5).map(b=>{
    const used=monthTransactions(now.getFullYear(),now.getMonth()+1).filter(x=>x.type==="expense"&&x.category===b.category).reduce((s,x)=>s+(+x.amount||0),0);
    const pct=Math.min(100,Math.round(used/(+b.limit||1)*100));
    return `<div class="budget-block"><div class="budget-head"><b>${escapeHtml(b.category)}</b><span>${money(used)} / ${money(b.limit)}</span></div><div class="progress"><span style="width:${pct}%"></span></div></div>`;
  }).join("")||empty("Aún no hay presupuestos");
  $("#recentTransactions").innerHTML=[...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,6).map(txRow).join("")||empty("Sin movimientos");
  const events=calendarEventsForMonth(now.getFullYear(),now.getMonth());
  const future=events.filter(e=>e.date>=todayISO()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6);
  $("#upcomingPayments").innerHTML=future.map(e=>`<div class="list-row"><div class="list-icon">${e.icon}</div><div class="row-main"><div class="row-title">${escapeHtml(e.title)}</div><div class="row-sub">${dateFmt(e.date)} · ${escapeHtml(e.type)}</div></div><div class="amount">${e.amount?money(e.amount):""}</div></div>`).join("")||empty("No hay pagos próximos");
}
function txRow(t){
  return `<div class="list-row"><div class="list-icon">${t.type==="income"?"↗":"↘"}</div><div class="row-main"><div class="row-title">${escapeHtml(t.desc)}</div><div class="row-sub">${escapeHtml(t.category)} · ${dateFmt(t.date)}</div></div><div class="amount ${t.type==="income"?"pos":"neg"}">${t.type==="income"?"+":"-"}${money(t.amount)}</div></div>`;
}
function filteredTransactions(){
  const q=($("#txSearch")?.value||"").toLowerCase().trim();
  const type=$("#txTypeFilter")?.value||"";
  const acc=$("#txAccountFilter")?.value||"";
  return [...data.transactions].sort((a,b)=>b.date.localeCompare(a.date)).filter(t=>
    (!q||(t.desc+" "+t.category+" "+(t.note||"")).toLowerCase().includes(q))&&(!type||t.type===type)&&(!acc||t.account===acc)
  );
}
function renderTransactions(){
  const filter=$("#txAccountFilter");
  const prev=filter?.value||"";
  if(filter){
    filter.innerHTML=`<option value="">Todas las cuentas</option>`+data.accounts.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
    filter.value=prev;
  }
  const tbody=$("#transactionsTable");
  if(!tbody) return;
  const rows=filteredTransactions();
  tbody.innerHTML=rows.map(t=>`<tr>
    <td>${dateFmt(t.date)}</td><td><span class="type-badge ${t.type}">${t.type==="income"?"Ingreso":"Gasto"}</span></td>
    <td>${escapeHtml(t.desc)}</td><td>${escapeHtml(t.category)}</td><td>${escapeHtml(accountName(t.account))}</td>
    <td class="amount ${t.type==="income"?"pos":"neg"}">${t.type==="income"?"+":"-"}${money(t.amount)}</td>
    <td><div class="row-actions"><button class="mini-btn" data-edit-tx="${t.id}">✎</button><button class="mini-btn" data-delete-tx="${t.id}">×</button></div></td>
  </tr>`).join("")||`<tr><td colspan="7">${empty("No hay movimientos")}</td></tr>`;
  $$("[data-edit-tx]").forEach(b=>b.onclick=()=>openTransaction("expense",b.dataset.editTx));
  $$("[data-delete-tx]").forEach(b=>b.onclick=()=>deleteTransaction(b.dataset.deleteTx));
}
function renderAccounts(){
  $("#accountTotal").textContent=money(totalAccounts());
  $("#accountCount").textContent=data.accounts.length;
  const sorted=[...data.accounts].sort((a,b)=>accountBalance(b.id)-accountBalance(a.id));
  $("#largestAccount").textContent=sorted[0]?.name||"—";
  $("#accountsList").innerHTML=data.accounts.map(a=>`<div class="list-row">
    <div class="list-icon">${a.type==="Efectivo"?"$":"▣"}</div>
    <div class="row-main"><div class="row-title">${escapeHtml(a.name)}</div><div class="row-sub">${escapeHtml(a.type)} · Inicial ${money(a.openingBalance)}</div></div>
    <div class="amount">${money(accountBalance(a.id))}</div>
    <div class="row-actions"><button class="mini-btn" data-edit-account="${a.id}">✎</button><button class="mini-btn" data-delete-account="${a.id}">×</button></div>
  </div>`).join("")||empty("No hay cuentas");
  $$("[data-edit-account]").forEach(b=>b.onclick=()=>openAccount(b.dataset.editAccount));
  $$("[data-delete-account]").forEach(b=>b.onclick=()=>deleteAccount(b.dataset.deleteAccount));
}
function renderBudgets(){
  const n=new Date();
  $("#budgetsList").innerHTML=data.budgets.map(b=>{
    const used=monthTransactions(n.getFullYear(),n.getMonth()+1).filter(x=>x.type==="expense"&&x.category===b.category).reduce((s,x)=>s+(+x.amount||0),0);
    const pct=Math.min(100,Math.round(used/(+b.limit||1)*100));
    return `<div class="budget-block"><div class="budget-head"><div><b>${escapeHtml(b.category)}</b><div class="row-sub">${pct}% utilizado</div></div><span>${money(used)} / ${money(b.limit)}</span><div class="row-actions"><button class="mini-btn" data-edit-budget="${b.id}">✎</button><button class="mini-btn" data-delete-budget="${b.id}">×</button></div></div><div class="progress"><span style="width:${pct}%"></span></div></div>`;
  }).join("")||empty("No hay presupuestos");
  $$("[data-edit-budget]").forEach(b=>b.onclick=()=>openBudget(b.dataset.editBudget));
  $$("[data-delete-budget]").forEach(b=>b.onclick=()=>deleteBudget(b.dataset.deleteBudget));
}
function renderCards(){
  $("#creditCardsGrid").innerHTML=data.cards.map(c=>{
    const usedPct=Math.min(100,Math.round((+c.balance||0)/(+c.limit||1)*100));
    return `<article class="credit-card">
      <div class="cc-top"><div><div class="cc-name">${escapeHtml(c.name)}</div><small>Crédito disponible ${money(Math.max(0,c.limit-c.balance))}</small></div><div class="cc-chip"></div></div>
      <div class="cc-balance">${money(c.balance)}</div>
      <div class="progress" style="background:rgba(255,255,255,.15)"><span style="width:${usedPct}%;background:rgba(255,255,255,.9)"></span></div>
      <div class="cc-meta"><span>Límite ${money(c.limit)}</span><span>Corte ${c.cutoffDay}</span><span>Pago ${c.dueDay}</span></div>
      <div class="cc-actions"><button data-pay-card="${c.id}">Pagar</button><button data-edit-card="${c.id}">Editar</button><button data-delete-card="${c.id}">Eliminar</button></div>
    </article>`;
  }).join("")||empty("No hay tarjetas registradas");
  $$("[data-pay-card]").forEach(b=>b.onclick=()=>openCardPayment(b.dataset.payCard));
  $$("[data-edit-card]").forEach(b=>b.onclick=()=>openCard(b.dataset.editCard));
  $$("[data-delete-card]").forEach(b=>b.onclick=()=>deleteCard(b.dataset.deleteCard));
}
function renderDebts(){
  $("#debtTotal").textContent=money(totalDebts());
  $("#debtMonthly").textContent=money(data.debts.reduce((s,d)=>s+(+d.monthlyPayment||0),0));
  $("#debtCount").textContent=data.debts.length;
  $("#debtsList").innerHTML=data.debts.map(d=>{
    const paid=Math.max(0,(+d.original||0)-(+d.balance||0));
    const pct=Math.min(100,Math.round(paid/(+d.original||1)*100));
    return `<div class="list-row">
      <div class="list-icon">◒</div><div class="row-main"><div class="row-title">${escapeHtml(d.name)}</div><div class="row-sub">Cuota ${money(d.monthlyPayment)} · ${d.rate}% anual · vence día ${d.dueDay}</div><div class="progress"><span style="width:${pct}%"></span></div></div>
      <div class="amount">${money(d.balance)}</div>
      <div class="row-actions"><button class="mini-btn" data-pay-debt="${d.id}">Pagar</button><button class="mini-btn" data-edit-debt="${d.id}">✎</button><button class="mini-btn" data-delete-debt="${d.id}">×</button></div>
    </div>`;
  }).join("")||empty("No hay préstamos o deudas");
  $$("[data-pay-debt]").forEach(b=>b.onclick=()=>openDebtPayment(b.dataset.payDebt));
  $$("[data-edit-debt]").forEach(b=>b.onclick=()=>openDebt(b.dataset.editDebt));
  $$("[data-delete-debt]").forEach(b=>b.onclick=()=>deleteDebt(b.dataset.deleteDebt));
}
function renderNetWorth(){
  $("#assetsTotal").textContent=money(totalAssets());
  $("#netAccounts").textContent=money(totalAccounts());
  $("#netLiabilities").textContent=money(totalDebts()+totalCards());
  $("#netWorthTotal").textContent=money(netWorth());
  $("#assetsList").innerHTML=data.assets.map(a=>`<div class="list-row"><div class="list-icon">◇</div><div class="row-main"><div class="row-title">${escapeHtml(a.name)}</div><div class="row-sub">${escapeHtml(a.type)}</div></div><div class="amount">${money(a.value)}</div><div class="row-actions"><button class="mini-btn" data-edit-asset="${a.id}">✎</button><button class="mini-btn" data-delete-asset="${a.id}">×</button></div></div>`).join("")||empty("No hay activos");
  $$("[data-edit-asset]").forEach(b=>b.onclick=()=>openAsset(b.dataset.editAsset));
  $$("[data-delete-asset]").forEach(b=>b.onclick=()=>deleteAsset(b.dataset.deleteAsset));
}
function calendarEventsForMonth(year,monthZero){
  const days=new Date(year,monthZero+1,0).getDate();
  const pad=d=>String(d).padStart(2,"0");
  const mk=`${year}-${pad(monthZero+1)}`;
  const events=[];
  data.recurring.forEach(r=>{const day=Math.min(days,+r.day||1);events.push({date:`${mk}-${pad(day)}`,title:r.name,type:"Pago habitual",amount:+r.amount||0,icon:"↘"})});
  data.cards.forEach(c=>{const day=Math.min(days,+c.dueDay||1);events.push({date:`${mk}-${pad(day)}`,title:`${c.name} - fecha de pago`,type:"Tarjeta",amount:+c.balance||0,icon:"▤"})});
  data.debts.forEach(d=>{const day=Math.min(days,+d.dueDay||1);events.push({date:`${mk}-${pad(day)}`,title:`${d.name} - cuota`,type:"Deuda",amount:+d.monthlyPayment||0,icon:"◒"})});
  data.reminders.filter(r=>r.date.startsWith(mk)&&!r.done).forEach(r=>events.push({date:r.date,title:r.title,type:"Recordatorio",amount:0,icon:"!"}));
  return events.sort((a,b)=>a.date.localeCompare(b.date));
}
function renderCalendar(){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  $("#calendarTitle").textContent=new Intl.DateTimeFormat("es-SV",{month:"long",year:"numeric"}).format(calendarCursor);
  const first=new Date(y,m,1),days=new Date(y,m+1,0).getDate();
  let weekday=first.getDay(); weekday=weekday===0?6:weekday-1;
  const events=calendarEventsForMonth(y,m);
  let html="";
  const prevDays=new Date(y,m,0).getDate();
  for(let i=weekday-1;i>=0;i--) html+=`<div class="day out"><span class="day-num">${prevDays-i}</span></div>`;
  for(let d=1;d<=days;d++){
    const date=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dayEvents=events.filter(e=>e.date===date).slice(0,3);
    html+=`<div class="day ${date===todayISO()?"today":""}"><span class="day-num">${d}</span>${dayEvents.map(e=>`<span class="event-dot">${escapeHtml(e.title)}</span>`).join("")}</div>`;
  }
  const cells=weekday+days,trail=(7-(cells%7))%7;
  for(let d=1;d<=trail;d++) html+=`<div class="day out"><span class="day-num">${d}</span></div>`;
  $("#calendarGrid").innerHTML=html;
  $("#calendarEvents").innerHTML=events.map(e=>`<div class="list-row"><div class="list-icon">${e.icon}</div><div class="row-main"><div class="row-title">${escapeHtml(e.title)}</div><div class="row-sub">${dateFmt(e.date)} · ${escapeHtml(e.type)}</div></div><div class="amount">${e.amount?money(e.amount):""}</div></div>`).join("")||empty("No hay eventos este mes");
}
function renderYears(){
  const years=new Set([new Date().getFullYear(),...data.transactions.map(t=>+t.date.slice(0,4))]);
  const opts=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}</option>`).join("");
  ["dashYear","chartYear"].forEach(id=>{
    const el=$("#"+id); if(!el) return; const prev=el.value||String(new Date().getFullYear());el.innerHTML=opts;el.value=[...years].includes(+prev)?prev:String(Math.max(...years));
  });
}
function renderSettings(){
  $("#setName").value=data.profile.name;
  $("#setCurrency").value=data.profile.currency;
  $("#setSavingsGoal").value=data.profile.savingsGoal||0;
  $("#themeSwitch").classList.toggle("on",data.profile.theme==="dark");
  $("#privacySwitch").classList.toggle("on",!!data.profile.privacy);
  $("#autoLockSwitch").classList.toggle("on",!!data.profile.autoLock);
  $("#autoBackupSwitch").classList.toggle("on",!!data.profile.autoBackup);
  $("#lastBackupLabel").textContent=data.profile.lastBackup?`Última copia: ${dateFmt(data.profile.lastBackup)}`:"Sin respaldos";
  $("#pinSetupBtn").textContent=data.profile.pinHash?"Cambiar PIN":"Configurar";
  $("#bioSetupBtn").textContent=data.profile.biometricCredentialId?"Reconfigurar":"Activar";
}
function dueAlerts(){
  const now=todayISO();
  const d=new Date();const monthEvents=calendarEventsForMonth(d.getFullYear(),d.getMonth());
  return monthEvents.filter(e=>e.date<=now).slice(-9);
}
function renderAlerts(){
  const n=dueAlerts().length;
  $("#alertBadge").textContent=n;
  $("#alertBadge").classList.toggle("hidden",!n);
}
function applyTheme(){document.documentElement.dataset.theme=data.profile.theme||"light"}

function modal(title,html){
  $("#modalTitle").textContent=title;$("#modalBody").innerHTML=html;
  $("#modal").classList.add("show");$("#overlay").classList.add("show");
}
function closeLayers(){
  $("#drawer").classList.remove("show");$("#modal").classList.remove("show");$("#overlay").classList.remove("show");
}
function nav(view){
  currentView=view;
  $$(".view").forEach(v=>v.classList.toggle("active",v.dataset.view===view));
  $$("[data-nav]").forEach(b=>b.classList.toggle("active",b.dataset.nav===view));
  closeLayers();window.scrollTo({top:0,behavior:"smooth"});
  if(view==="calendar") renderCalendar();
  setTimeout(drawCharts,80);
}
function accountOptions(selected=""){return data.accounts.map(a=>`<option value="${a.id}" ${a.id===selected?"selected":""}>${escapeHtml(a.name)}</option>`).join("")}
function categoryOptions(selected=""){return data.categories.map(c=>`<option ${c===selected?"selected":""}>${escapeHtml(c)}</option>`).join("")}

function txCategoryIcon(name){
  const common='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  const icons={
    "Alimentación":`<svg ${common}><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M17 3v18M17 3c3 2 3 7 0 9"/></svg>`,
    "Transporte":`<svg ${common}><path d="M5 17h14l1-5-2-6H6l-2 6z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>`,
    "Vivienda":`<svg ${common}><path d="M3 11 12 4l9 7v9H3z"/><path d="M9 20v-6h6v6"/></svg>`,
    "Servicios":`<svg ${common}><path d="M13 2 5 14h7l-1 8 8-12h-7z"/></svg>`,
    "Educación":`<svg ${common}><path d="m2 10 10-5 10 5-10 5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>`,
    "Salud":`<svg ${common}><path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6z"/></svg>`,
    "Entretenimiento":`<svg ${common}><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m8 9 5 3-5 3zM16 9h1M16 15h1"/></svg>`,
    "Ahorro":`<svg ${common}><path d="M5 9c1-3 4-5 7-5 4 0 7 3 7 7 0 5-4 8-9 8H5z"/><path d="M5 13H2v-3h3M14 8h.01"/></svg>`,
    "Salario":`<svg ${common}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M8 6V4h8v2M3 11h18M10 14h4"/></svg>`,
    "Deudas":`<svg ${common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>`,
    "Otros":`<svg ${common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>`
  };
  return icons[name]||icons.Otros;
}

function openTransaction(type="expense",id=null){
  editingTx=id;
  const t=id?data.transactions.find(x=>x.id===id):null;
  let kind=t?.type||type;
  let selectedCategory=t?.category || (kind==="income" ? (data.categories.includes("Salario")?"Salario":data.categories[0]) : (data.categories.includes("Alimentación")?"Alimentación":data.categories[0]));
  const initialAccount=t?.account||data.accounts[0]?.id||"";
  const oldRecurringId=t?.recurringId||"";

  modal(id?"Editar movimiento":"Registrar movimiento",`
    <div class="transaction-editor ${kind}">
      <div class="tx-kind-switch" role="tablist" aria-label="Tipo de movimiento">
        <button id="segExpense" type="button" class="tx-kind expense ${kind==="expense"?"active":""}"><span>↘</span><div><b>Gasto</b><small>Dinero que sale</small></div></button>
        <button id="segIncome" type="button" class="tx-kind income ${kind==="income"?"active":""}"><span>↗</span><div><b>Ingreso</b><small>Dinero que entra</small></div></button>
      </div>

      <section class="tx-amount-card">
        <span class="tx-amount-label" id="txAmountLabel">${kind==="income"?"Monto del ingreso":"Monto del gasto"}</span>
        <div class="tx-amount-row"><span class="tx-currency">${escapeHtml(data.profile.currency||"USD")}</span><input id="mAmount" inputmode="decimal" autocomplete="off" type="number" min="0" step="0.01" value="${t?.amount??""}" placeholder="0.00"></div>
        <div class="tx-quick-amounts"><button type="button" data-add-amount="5">+5</button><button type="button" data-add-amount="10">+10</button><button type="button" data-add-amount="20">+20</button><button type="button" data-add-amount="50">+50</button></div>
      </section>

      <div class="tx-section-head"><div><b>Categoría</b><small>Selecciona para clasificar automáticamente</small></div><button id="txMoreCategories" class="text-btn" type="button">Ver todas</button></div>
      <div id="txCategoryChips" class="tx-category-grid"></div>
      <select id="mCategory" class="select hidden" aria-label="Categoría">${categoryOptions(selectedCategory)}</select>

      <div class="tx-two-col">
        <label class="field"><span>Cuenta</span><select id="mAccount" class="select">${accountOptions(initialAccount)}</select><small id="txAccountBalance" class="field-hint"></small></label>
        <label class="field"><span>Fecha</span><input id="mDate" type="date" class="input" value="${t?.date||todayISO()}"><div class="date-shortcuts"><button type="button" data-date="today">Hoy</button><button type="button" data-date="yesterday">Ayer</button></div></label>
      </div>

      <label class="field tx-description"><span>Descripción</span><div class="input-with-icon"><span>${txCategoryIcon(selectedCategory)}</span><input id="mDesc" class="input" value="${escapeHtml(t?.desc||"")}" placeholder="Ej. Supermercado, salario, combustible..."></div></label>

      <div id="txSmartSummary" class="tx-smart-summary"></div>
      <div id="txBudgetNotice" class="tx-budget-notice hidden"></div>

      <details class="tx-details">
        <summary>Más detalles</summary>
        <div class="form-grid">
          <label class="field full"><span>Nota o referencia</span><textarea id="mNote" class="textarea" placeholder="Opcional: factura, referencia, detalle adicional...">${escapeHtml(t?.note||"")}</textarea></label>
          <label id="recurringField" class="field full tx-recurring-row ${kind==="income"?"hidden":""}">
            <span><b>Convertir en pago habitual</b><small>Se añadirá automáticamente al calendario mensual</small></span>
            <button id="mRecurringSwitch" type="button" class="switch ${oldRecurringId?"on":""}"><span></span></button>
          </label>
        </div>
      </details>

      <div class="tx-save-bar">
        <button id="mSaveAndNew" class="btn secondary" type="button">Guardar y otro</button>
        <button id="mSaveTx" class="btn primary" type="button"><span>${id?"Actualizar":"Guardar"}</span><b id="txSaveAmount">${t?.amount?money(t.amount):money(0)}</b></button>
      </div>
    </div>`);

  let recurringEnabled=!!oldRecurringId;
  let showAllCategories=false;
  const preferredExpense=["Alimentación","Transporte","Vivienda","Servicios","Educación","Salud","Entretenimiento","Deudas","Ahorro","Otros"];
  const preferredIncome=["Salario","Otros","Ahorro"];

  function categoryList(){
    const preferred=kind==="income"?preferredIncome:preferredExpense;
    const ordered=[...preferred.filter(x=>data.categories.includes(x)),...data.categories.filter(x=>!preferred.includes(x))];
    return showAllCategories?ordered:ordered.slice(0,kind==="income"?5:8);
  }
  function renderCategoryChips(){
    const box=$("#txCategoryChips");
    box.innerHTML=categoryList().map(c=>`<button type="button" class="tx-category-chip ${c===selectedCategory?"active":""}" data-category="${escapeHtml(c)}"><span>${txCategoryIcon(c)}</span><b>${escapeHtml(c)}</b></button>`).join("");
    box.querySelectorAll("[data-category]").forEach(btn=>btn.onclick=()=>{selectedCategory=btn.dataset.category;$("#mCategory").value=selectedCategory;renderCategoryChips();updatePreview()});
    $("#txMoreCategories").textContent=showAllCategories?"Ver menos":"Ver todas";
  }
  function baseBalanceForPreview(accountId){
    let bal=accountBalance(accountId);
    if(t && t.account===accountId){bal += t.type==="income" ? -(+t.amount||0) : (+t.amount||0)}
    return bal;
  }
  function updatePreview(){
    const amount=+$("#mAmount").value||0;
    const accountId=$("#mAccount").value;
    const before=baseBalanceForPreview(accountId);
    const after=before+(kind==="income"?amount:-amount);
    const account=accountName(accountId);
    $("#txAmountLabel").textContent=kind==="income"?"Monto del ingreso":"Monto del gasto";
    $("#txSaveAmount").textContent=money(amount);
    $("#txAccountBalance").textContent=`Saldo actual: ${money(before)} · Después: ${money(after)}`;
    $("#txSmartSummary").className=`tx-smart-summary ${kind}`;
    $("#txSmartSummary").innerHTML=`<span class="summary-icon">${kind==="income"?"↗":"↘"}</span><div><b>${kind==="income"?"Ingresará":"Saldrá"} ${money(amount)}</b><small>${escapeHtml(account)} · ${escapeHtml(selectedCategory)} · ${dateFmt($("#mDate").value)}</small></div><strong>${money(after)}</strong>`;
    const notice=$("#txBudgetNotice");
    notice.classList.add("hidden");
    if(kind==="expense"){
      const d=$("#mDate").value||todayISO(), ym=d.slice(0,7);
      const b=data.budgets.find(x=>x.category===selectedCategory);
      if(b){
        const used=data.transactions.filter(x=>x.type==="expense"&&x.category===selectedCategory&&x.date.startsWith(ym)&&x.id!==id).reduce((s,x)=>s+(+x.amount||0),0);
        const remaining=(+b.limit||0)-used-amount;
        const pct=Math.round((used+amount)/(+b.limit||1)*100);
        notice.classList.remove("hidden");
        notice.className=`tx-budget-notice ${remaining<0?"over":pct>=80?"warning":"ok"}`;
        notice.innerHTML=remaining<0?`<b>Presupuesto excedido por ${money(Math.abs(remaining))}</b><span>${escapeHtml(selectedCategory)} alcanzaría ${pct}% del límite mensual.</span>`:`<b>Quedarían ${money(Math.max(0,remaining))}</b><span>${escapeHtml(selectedCategory)} usaría ${pct}% del presupuesto mensual.</span>`;
      }
      if(amount>before && before>=0){
        notice.classList.remove("hidden");notice.className="tx-budget-notice over";notice.innerHTML=`<b>Saldo insuficiente en ${escapeHtml(account)}</b><span>El gasto supera el saldo disponible por ${money(amount-before)}.</span>`;
      }
    }
    $("#recurringField").classList.toggle("hidden",kind==="income");
    document.querySelector(".transaction-editor")?.classList.toggle("income",kind==="income");
    document.querySelector(".transaction-editor")?.classList.toggle("expense",kind==="expense");
    $("#segIncome").classList.toggle("active",kind==="income");$("#segExpense").classList.toggle("active",kind==="expense");
  }
  function setKind(next){
    kind=next;
    if(kind==="income" && !preferredIncome.includes(selectedCategory))selectedCategory=data.categories.includes("Salario")?"Salario":"Otros";
    if(kind==="expense" && selectedCategory==="Salario")selectedCategory=data.categories.includes("Alimentación")?"Alimentación":"Otros";
    $("#mCategory").value=selectedCategory;
    renderCategoryChips();updatePreview();
  }
  function saveTransaction(andNew=false){
    const amount=+$("#mAmount").value,date=$("#mDate").value,account=$("#mAccount").value;
    if(!(amount>0)){$("#mAmount").focus();return toast("Ingresa un monto mayor que cero")}
    if(!date||!account)return toast("Completa fecha y cuenta");
    const desc=$("#mDesc").value.trim()||selectedCategory;
    let recurringId=oldRecurringId;
    if(kind==="expense"&&recurringEnabled){
      if(!recurringId){recurringId=uid();data.recurring.push({id:recurringId,name:desc,day:+date.slice(-2),amount,account,category:selectedCategory})}
      else{const r=data.recurring.find(x=>x.id===recurringId);if(r)Object.assign(r,{name:desc,day:+date.slice(-2),amount,account,category:selectedCategory})}
    }else if(recurringId){data.recurring=data.recurring.filter(x=>x.id!==recurringId);recurringId=""}
    const obj={id:id||uid(),type:kind,amount,date,category:selectedCategory,account,desc,note:$("#mNote").value.trim(),recurringId};
    if(id)Object.assign(data.transactions.find(x=>x.id===id),obj);else data.transactions.push(obj);
    closeLayers();render();toast(id?"Movimiento actualizado":"Movimiento guardado");
    if(andNew)setTimeout(()=>openTransaction(kind),260);
  }

  $("#segIncome").onclick=()=>setKind("income");
  $("#segExpense").onclick=()=>setKind("expense");
  $("#txMoreCategories").onclick=()=>{showAllCategories=!showAllCategories;renderCategoryChips()};
  $("#mAmount").oninput=updatePreview;
  $("#mAccount").onchange=updatePreview;
  $("#mDate").onchange=updatePreview;
  $("#mDesc").oninput=()=>{};
  $$('[data-add-amount]').forEach(b=>b.onclick=()=>{$("#mAmount").value=((+$("#mAmount").value||0)+(+b.dataset.addAmount)).toFixed(2);updatePreview()});
  $$('[data-date]').forEach(b=>b.onclick=()=>{const d=new Date();if(b.dataset.date==="yesterday")d.setDate(d.getDate()-1);$("#mDate").value=d.toISOString().slice(0,10);updatePreview()});
  $("#mRecurringSwitch").onclick=()=>{recurringEnabled=!recurringEnabled;$("#mRecurringSwitch").classList.toggle("on",recurringEnabled)};
  $("#mSaveTx").onclick=()=>saveTransaction(false);
  $("#mSaveAndNew").onclick=()=>saveTransaction(true);

  renderCategoryChips();updatePreview();
  setTimeout(()=>$("#mAmount")?.focus(),220);
}
function deleteTransaction(id){if(confirm("¿Eliminar este movimiento?")){data.transactions=data.transactions.filter(x=>x.id!==id);render();toast("Movimiento eliminado")}}

function openAccount(id=null){
  const a=id?data.accounts.find(x=>x.id===id):null;
  modal(id?"Editar cuenta":"Nueva cuenta",`<div class="form-grid">
    <label class="field full"><span>Nombre</span><input id="mAccName" class="input" value="${escapeHtml(a?.name||"")}"></label>
    <label class="field"><span>Tipo</span><select id="mAccType" class="select"><option ${a?.type==="Banco"?"selected":""}>Banco</option><option ${a?.type==="Efectivo"?"selected":""}>Efectivo</option><option ${a?.type==="Ahorro"?"selected":""}>Ahorro</option></select></label>
    <label class="field"><span>Saldo inicial</span><input id="mAccBal" type="number" step="0.01" class="input" value="${a?.openingBalance??""}"></label>
  </div><button id="mSaveAccount" class="btn primary wide">Guardar cuenta</button>`);
  $("#mSaveAccount").onclick=()=>{const name=$("#mAccName").value.trim();if(!name)return toast("Escribe un nombre");const obj={id:id||uid(),name,type:$("#mAccType").value,openingBalance:+$("#mAccBal").value||0};if(id)Object.assign(data.accounts.find(x=>x.id===id),obj);else data.accounts.push(obj);closeLayers();render();toast("Cuenta guardada")};
}
function deleteAccount(id){
  if(data.accounts.length<=1)return toast("Debe existir al menos una cuenta");
  if(data.transactions.some(t=>t.account===id)||data.transfers.some(t=>t.from===id||t.to===id)||data.recurring.some(r=>r.account===id))return toast("La cuenta tiene operaciones asociadas");
  if(confirm("¿Eliminar esta cuenta?")){data.accounts=data.accounts.filter(x=>x.id!==id);render()}
}

function openTransfer(){
  if(data.accounts.length<2)return toast("Necesitas al menos dos cuentas");
  modal("Nueva transferencia",`<div class="form-grid">
    <label class="field"><span>Desde</span><select id="mTrFrom" class="select">${accountOptions()}</select></label>
    <label class="field"><span>Hacia</span><select id="mTrTo" class="select">${accountOptions(data.accounts[1]?.id)}</select></label>
    <label class="field"><span>Monto</span><input id="mTrAmount" type="number" min="0" step="0.01" class="input"></label>
    <label class="field"><span>Fecha</span><input id="mTrDate" type="date" class="input" value="${todayISO()}"></label>
    <label class="field full"><span>Nota</span><input id="mTrNote" class="input" placeholder="Transferencia entre cuentas"></label>
  </div><button id="mSaveTransfer" class="btn primary wide">Transferir</button>`);
  $("#mSaveTransfer").onclick=()=>{const from=$("#mTrFrom").value,to=$("#mTrTo").value,amount=+$("#mTrAmount").value;if(from===to)return toast("Selecciona cuentas distintas");if(!(amount>0))return toast("Monto inválido");data.transfers.push({id:uid(),from,to,amount,date:$("#mTrDate").value||todayISO(),note:$("#mTrNote").value.trim()});closeLayers();render();toast("Transferencia registrada")};
}

function openBudget(id=null){
  const b=id?data.budgets.find(x=>x.id===id):null;
  modal(id?"Editar presupuesto":"Nuevo presupuesto",`<div class="form-grid">
    <label class="field"><span>Categoría</span><select id="mBudgetCat" class="select">${categoryOptions(b?.category||"")}</select></label>
    <label class="field"><span>Límite mensual</span><input id="mBudgetLimit" type="number" min="0" step="0.01" class="input" value="${b?.limit??""}"></label>
  </div><button id="mSaveBudget" class="btn primary wide">Guardar presupuesto</button>`);
  $("#mSaveBudget").onclick=()=>{const lim=+$("#mBudgetLimit").value;if(!(lim>0))return toast("Ingresa un límite válido");const obj={id:id||uid(),category:$("#mBudgetCat").value,limit:lim};if(id)Object.assign(data.budgets.find(x=>x.id===id),obj);else data.budgets.push(obj);closeLayers();render();toast("Presupuesto guardado")};
}
function deleteBudget(id){if(confirm("¿Eliminar presupuesto?")){data.budgets=data.budgets.filter(x=>x.id!==id);render()}}

function openCard(id=null){
  const c=id?data.cards.find(x=>x.id===id):null;
  modal(id?"Editar tarjeta":"Nueva tarjeta",`<div class="form-grid">
    <label class="field full"><span>Nombre</span><input id="mCardName" class="input" value="${escapeHtml(c?.name||"")}"></label>
    <label class="field"><span>Límite</span><input id="mCardLimit" type="number" min="0" step="0.01" class="input" value="${c?.limit??""}"></label>
    <label class="field"><span>Saldo utilizado</span><input id="mCardBalance" type="number" min="0" step="0.01" class="input" value="${c?.balance??0}"></label>
    <label class="field"><span>Día de corte</span><input id="mCardCut" type="number" min="1" max="31" class="input" value="${c?.cutoffDay??1}"></label>
    <label class="field"><span>Día de pago</span><input id="mCardDue" type="number" min="1" max="31" class="input" value="${c?.dueDay??1}"></label>
    <label class="field"><span>Pago mínimo</span><input id="mCardMin" type="number" min="0" step="0.01" class="input" value="${c?.minPayment??0}"></label>
  </div><button id="mSaveCard" class="btn primary wide">Guardar tarjeta</button>`);
  $("#mSaveCard").onclick=()=>{const name=$("#mCardName").value.trim(),limit=+$("#mCardLimit").value,balance=+$("#mCardBalance").value;if(!name||!(limit>0)||balance<0)return toast("Completa correctamente la tarjeta");const obj={id:id||uid(),name,limit,balance,cutoffDay:Math.min(31,Math.max(1,+$("#mCardCut").value||1)),dueDay:Math.min(31,Math.max(1,+$("#mCardDue").value||1)),minPayment:+$("#mCardMin").value||0};if(id)Object.assign(data.cards.find(x=>x.id===id),obj);else data.cards.push(obj);closeLayers();render();toast("Tarjeta guardada")};
}
function deleteCard(id){if(confirm("¿Eliminar tarjeta?")){data.cards=data.cards.filter(x=>x.id!==id);render()}}
function openCardPayment(id){
  const c=data.cards.find(x=>x.id===id);if(!c)return;
  modal(`Pagar ${c.name}`,`<div class="form-grid">
    <label class="field"><span>Monto</span><input id="mPayAmount" type="number" min="0" step="0.01" class="input" value="${Math.min(c.balance,c.minPayment||c.balance)}"></label>
    <label class="field"><span>Cuenta</span><select id="mPayAccount" class="select">${accountOptions()}</select></label>
    <label class="field"><span>Fecha</span><input id="mPayDate" type="date" class="input" value="${todayISO()}"></label>
  </div><button id="mPayCardSave" class="btn primary wide">Registrar pago</button>`);
  $("#mPayCardSave").onclick=()=>{const amount=+$("#mPayAmount").value;if(!(amount>0))return toast("Monto inválido");const paid=Math.min(amount,c.balance);c.balance-=paid;data.transactions.push({id:uid(),type:"expense",amount:paid,date:$("#mPayDate").value||todayISO(),category:"Deudas",account:$("#mPayAccount").value,desc:`Pago tarjeta ${c.name}`});closeLayers();render();toast("Pago de tarjeta registrado")};
}

function openDebt(id=null){
  const d=id?data.debts.find(x=>x.id===id):null;
  modal(id?"Editar deuda":"Nueva deuda / préstamo",`<div class="form-grid">
    <label class="field full"><span>Nombre</span><input id="mDebtName" class="input" value="${escapeHtml(d?.name||"")}"></label>
    <label class="field"><span>Monto original</span><input id="mDebtOriginal" type="number" min="0" step="0.01" class="input" value="${d?.original??""}"></label>
    <label class="field"><span>Saldo actual</span><input id="mDebtBalance" type="number" min="0" step="0.01" class="input" value="${d?.balance??""}"></label>
    <label class="field"><span>Cuota mensual</span><input id="mDebtPayment" type="number" min="0" step="0.01" class="input" value="${d?.monthlyPayment??""}"></label>
    <label class="field"><span>Tasa anual %</span><input id="mDebtRate" type="number" min="0" step="0.01" class="input" value="${d?.rate??0}"></label>
    <label class="field"><span>Día de pago</span><input id="mDebtDue" type="number" min="1" max="31" class="input" value="${d?.dueDay??1}"></label>
  </div><button id="mSaveDebt" class="btn primary wide">Guardar deuda</button>`);
  $("#mSaveDebt").onclick=()=>{const name=$("#mDebtName").value.trim(),original=+$("#mDebtOriginal").value,balance=+$("#mDebtBalance").value;if(!name||!(original>0)||balance<0)return toast("Completa correctamente la deuda");const obj={id:id||uid(),name,original,balance,monthlyPayment:+$("#mDebtPayment").value||0,rate:+$("#mDebtRate").value||0,dueDay:Math.min(31,Math.max(1,+$("#mDebtDue").value||1))};if(id)Object.assign(data.debts.find(x=>x.id===id),obj);else data.debts.push(obj);closeLayers();render();toast("Deuda guardada")};
}
function deleteDebt(id){if(confirm("¿Eliminar deuda?")){data.debts=data.debts.filter(x=>x.id!==id);render()}}
function openDebtPayment(id){
  const d=data.debts.find(x=>x.id===id);if(!d)return;
  modal(`Pagar ${d.name}`,`<div class="form-grid">
    <label class="field"><span>Monto</span><input id="mDebtPay" type="number" min="0" step="0.01" class="input" value="${Math.min(d.balance,d.monthlyPayment||d.balance)}"></label>
    <label class="field"><span>Cuenta</span><select id="mDebtAcc" class="select">${accountOptions()}</select></label>
    <label class="field"><span>Fecha</span><input id="mDebtDate" type="date" class="input" value="${todayISO()}"></label>
  </div><button id="mDebtPaySave" class="btn primary wide">Registrar pago</button>`);
  $("#mDebtPaySave").onclick=()=>{const amount=+$("#mDebtPay").value;if(!(amount>0))return toast("Monto inválido");const paid=Math.min(amount,d.balance);d.balance-=paid;data.transactions.push({id:uid(),type:"expense",amount:paid,date:$("#mDebtDate").value||todayISO(),category:"Deudas",account:$("#mDebtAcc").value,desc:`Pago ${d.name}`});closeLayers();render();toast("Pago registrado")};
}

function openAsset(id=null){
  const a=id?data.assets.find(x=>x.id===id):null;
  modal(id?"Editar activo":"Nuevo activo",`<div class="form-grid">
    <label class="field full"><span>Nombre</span><input id="mAssetName" class="input" value="${escapeHtml(a?.name||"")}"></label>
    <label class="field"><span>Tipo</span><select id="mAssetType" class="select"><option>Vehículo</option><option>Inversión</option><option>Propiedad</option><option>Equipo</option><option>Otro</option></select></label>
    <label class="field"><span>Valor estimado</span><input id="mAssetValue" type="number" min="0" step="0.01" class="input" value="${a?.value??""}"></label>
  </div><button id="mSaveAsset" class="btn primary wide">Guardar activo</button>`);
  if(a)$("#mAssetType").value=a.type;
  $("#mSaveAsset").onclick=()=>{const name=$("#mAssetName").value.trim(),value=+$("#mAssetValue").value;if(!name||value<0)return toast("Completa correctamente el activo");const obj={id:id||uid(),name,type:$("#mAssetType").value,value};if(id)Object.assign(data.assets.find(x=>x.id===id),obj);else data.assets.push(obj);closeLayers();render();toast("Activo guardado")};
}
function deleteAsset(id){if(confirm("¿Eliminar activo?")){data.assets=data.assets.filter(x=>x.id!==id);render()}}

function openReminder(){
  modal("Nuevo recordatorio",`<div class="form-grid">
    <label class="field full"><span>Título</span><input id="mRemTitle" class="input"></label>
    <label class="field"><span>Fecha</span><input id="mRemDate" type="date" class="input" value="${todayISO()}"></label>
    <label class="field full"><span>Nota</span><textarea id="mRemNote" class="textarea"></textarea></label>
  </div><button id="mRemSave" class="btn primary wide">Guardar recordatorio</button>`);
  $("#mRemSave").onclick=()=>{const title=$("#mRemTitle").value.trim(),date=$("#mRemDate").value;if(!title||!date)return toast("Completa título y fecha");data.reminders.push({id:uid(),title,date,note:$("#mRemNote").value.trim(),done:false});closeLayers();render();toast("Recordatorio guardado")};
}

function openAlerts(){
  const alerts=dueAlerts();
  modal("Alertas y vencimientos",alerts.map(e=>`<div class="list-row"><div class="list-icon">${e.icon}</div><div class="row-main"><div class="row-title">${escapeHtml(e.title)}</div><div class="row-sub">${dateFmt(e.date)} · ${escapeHtml(e.type)}</div></div><div class="amount">${e.amount?money(e.amount):""}</div></div>`).join("")||empty("No hay alertas vencidas"));
}

function annualSeries(year){
  return Array.from({length:12},(_,i)=>{const t=monthTotals(+year,i+1);return {m:["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][i],i:t.income,g:t.expense}});
}
function setupCanvas(canvas){
  if(!canvas||!canvas.offsetParent)return null;
  const r=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
  canvas.width=Math.max(1,r.width*dpr);canvas.height=Math.max(1,r.height*dpr);
  const ctx=canvas.getContext("2d");ctx.scale(dpr,dpr);return {ctx,w:r.width,h:r.height};
}
function drawLine(canvas,series){
  const o=setupCanvas(canvas);if(!o)return;const {ctx,w,h}=o,p={l:36,r:12,t:18,b:30};
  ctx.clearRect(0,0,w,h);const max=Math.max(100,...series.flatMap(x=>[x.i,x.g]))*1.12;
  const x=i=>p.l+i*(w-p.l-p.r)/Math.max(1,series.length-1),y=v=>p.t+(h-p.t-p.b)*(1-v/max);
  ctx.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue("--border");ctx.lineWidth=1;
  for(let j=0;j<4;j++){const yy=p.t+j*(h-p.t-p.b)/3;ctx.beginPath();ctx.moveTo(p.l,yy);ctx.lineTo(w-p.r,yy);ctx.stroke()}
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");ctx.font="11px system-ui";
  series.forEach((d,i)=>ctx.fillText(d.m,x(i)-10,h-8));
  const line=(key,color)=>{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();series.forEach((d,i)=>i?ctx.lineTo(x(i),y(d[key])):ctx.moveTo(x(i),y(d[key])));ctx.stroke();series.forEach((d,i)=>{ctx.fillStyle=color;ctx.beginPath();ctx.arc(x(i),y(d[key]),3.5,0,Math.PI*2);ctx.fill()})};
  line("i","#1aa176");line("g","#e15b5f");
}
function drawCategory(canvas,year){
  const o=setupCanvas(canvas);if(!o)return;const {ctx,w,h}=o;
  const sums={};data.transactions.filter(t=>t.type==="expense"&&t.date.startsWith(String(year))).forEach(t=>sums[t.category]=(sums[t.category]||0)+(+t.amount||0));
  const entries=Object.entries(sums).sort((a,b)=>b[1]-a[1]),total=entries.reduce((s,x)=>s+x[1],0);
  ctx.clearRect(0,0,w,h);if(!entries.length){ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");ctx.textAlign="center";ctx.fillText("Sin gastos en este año",w/2,h/2);return}
  const colors=["#10a276","#e65d61","#efaa2d","#4f84e8","#8e6bd8","#40b6c4","#d66eae","#8bbf55","#d78a40"];
  const cx=w*.60,cy=h*.48,rad=Math.min(w,h)*.27;let start=-Math.PI/2;
  entries.forEach(([k,v],i)=>{const a=v/total*Math.PI*2;ctx.beginPath();ctx.strokeStyle=colors[i%colors.length];ctx.lineWidth=28;ctx.arc(cx,cy,rad,start,start+a);ctx.stroke();start+=a});
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--text");ctx.textAlign="center";ctx.font="800 18px system-ui";ctx.fillText(money(total),cx,cy+6);
  ctx.textAlign="left";ctx.font="11px system-ui";entries.slice(0,7).forEach(([k,v],i)=>{ctx.fillStyle=colors[i%colors.length];ctx.fillRect(10,18+i*27,9,9);ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");ctx.fillText(k,26,27+i*27)});
}
function drawNetWorth(){
  const canvas=$("#netWorthChart"),o=setupCanvas(canvas);if(!o)return;const {ctx,w,h}=o;
  const parts=[["Cuentas",Math.max(0,totalAccounts()),"#10a276"],["Activos",Math.max(0,totalAssets()),"#4f84e8"],["Pasivos",Math.max(0,totalCards()+totalDebts()),"#e65d61"]];
  const total=parts.reduce((s,x)=>s+x[1],0)||1,cx=w*.58,cy=h*.50,rad=Math.min(w,h)*.27;let start=-Math.PI/2;
  parts.forEach(p=>{const a=p[1]/total*Math.PI*2;ctx.beginPath();ctx.strokeStyle=p[2];ctx.lineWidth=28;ctx.arc(cx,cy,rad,start,start+a);ctx.stroke();start+=a});
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--text");ctx.textAlign="center";ctx.font="800 18px system-ui";ctx.fillText(money(netWorth()),cx,cy+6);
  ctx.textAlign="left";ctx.font="12px system-ui";parts.forEach((p,i)=>{ctx.fillStyle=p[2];ctx.fillRect(12,22+i*28,10,10);ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--muted");ctx.fillText(`${p[0]} ${money(p[1])}`,30,31+i*28)});
}
function drawCharts(){
  const dy=$("#dashYear")?.value||new Date().getFullYear();
  const cy=$("#chartYear")?.value||dy;
  drawLine($("#dashboardChart"),annualSeries(dy));
  drawLine($("#annualChart"),annualSeries(cy));
  drawCategory($("#categoryChart"),cy);
  drawNetWorth();
}

function downloadJSON(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`JC_Finanzas_${todayISO()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}
function exportCSV(){
  const rows=[["Fecha","Tipo","Descripcion","Categoria","Cuenta","Monto"],...filteredTransactions().map(t=>[t.date,t.type,t.desc,t.category,accountName(t.account),t.amount])];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`movimientos_${todayISO()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

async function sha256(text){
  const bytes=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function setupPin(){
  modal(data.profile.pinHash?"Cambiar PIN":"Configurar PIN",`<div class="form-grid">
    <label class="field full"><span>Nuevo PIN de 4 dígitos</span><input id="mPin1" inputmode="numeric" maxlength="4" class="input"></label>
    <label class="field full"><span>Confirmar PIN</span><input id="mPin2" inputmode="numeric" maxlength="4" class="input"></label>
  </div><button id="mPinSave" class="btn primary wide">Guardar PIN</button>`);
  $("#mPinSave").onclick=async()=>{const p1=$("#mPin1").value,p2=$("#mPin2").value;if(!/^\d{4}$/.test(p1)||p1!==p2)return toast("El PIN debe tener 4 dígitos y coincidir");data.profile.pinHash=await sha256(p1);data.profile.autoLock=true;closeLayers();render();toast("PIN configurado")};
}
function b64url(buf){
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function fromB64url(s){
  s=s.replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
async function setupBiometric(){
  if(!window.PublicKeyCredential||!navigator.credentials)return toast("Este navegador no admite WebAuthn");
  if(!window.isSecureContext)return toast("Face ID / Touch ID requiere HTTPS");
  try{
    const cred=await navigator.credentials.create({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),
      rp:{name:"JC Finanzas Pro"},
      user:{id:crypto.getRandomValues(new Uint8Array(16)),name:"jc-finanzas-local",displayName:data.profile.name},
      pubKeyCredParams:[{alg:-7,type:"public-key"},{alg:-257,type:"public-key"}],
      authenticatorSelection:{authenticatorAttachment:"platform",userVerification:"required",residentKey:"preferred"},
      timeout:60000,
      attestation:"none"
    }});
    if(!cred)throw new Error("Sin credencial");
    data.profile.biometricCredentialId=b64url(cred.rawId);
    await persist();renderSettings();toast("Face ID / Touch ID activado");
  }catch(e){toast("No se pudo activar la biometría")}
}
async function biometricUnlock(){
  if(!data.profile.biometricCredentialId)return false;
  if(!window.PublicKeyCredential||!window.isSecureContext)return false;
  try{
    const assertion=await navigator.credentials.get({publicKey:{
      challenge:crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials:[{id:fromB64url(data.profile.biometricCredentialId),type:"public-key"}],
      userVerification:"required",timeout:60000
    }});
    if(assertion){unlockApp();return true}
  }catch{}
  return false;
}
function showLock(){
  if(!data.profile.pinHash&&!data.profile.biometricCredentialId)return toast("Configura PIN o biometría primero");
  $("#lockScreen").classList.remove("hidden");$("#pinInput").value="";
  $("#unlockPinBtn").classList.toggle("hidden",!data.profile.pinHash);
  $("#pinInput").classList.toggle("hidden",!data.profile.pinHash);
  $("#unlockBioBtn").classList.toggle("hidden",!data.profile.biometricCredentialId);
  setTimeout(()=>$("#pinInput")?.focus(),100);
}
function unlockApp(){$("#lockScreen").classList.add("hidden");$("#pinInput").value=""}
async function unlockPin(){
  if(!data.profile.pinHash)return;
  const h=await sha256($("#pinInput").value);
  if(h===data.profile.pinHash){unlockApp();toast("Desbloqueado")}else{toast("PIN incorrecto");$("#pinInput").value=""}
}

async function restoreSnapshot(){
  if(!db)return toast("No hay respaldo local disponible");
  const all=(await dbAll(STORE_BACKUPS)).sort((a,b)=>b.date.localeCompare(a.date));
  if(!all.length)return toast("No hay respaldos locales");
  const list=all.map((b,i)=>`<button class="btn secondary wide" data-snapshot="${b.id}">${new Intl.DateTimeFormat("es-SV",{dateStyle:"medium",timeStyle:"short"}).format(new Date(b.date))}</button>`).join("");
  modal("Restaurar copia local",list);
  $$("[data-snapshot]").forEach(btn=>btn.onclick=async()=>{const snap=await dbGet(STORE_BACKUPS,btn.dataset.snapshot);if(!snap)return;if(confirm("¿Restaurar esta copia? Los datos actuales serán reemplazados.")){data=clone(snap.data);await persist();closeLayers();render();toast("Copia restaurada")}});
}

function installHelp(){
  modal("Instalar en iPhone",`<div class="list">
    <div class="list-row"><div class="list-icon">1</div><div class="row-main"><div class="row-title">Publica esta carpeta con HTTPS</div><div class="row-sub">GitHub Pages, Netlify o Cloudflare Pages.</div></div></div>
    <div class="list-row"><div class="list-icon">2</div><div class="row-main"><div class="row-title">Abre la dirección en Safari</div><div class="row-sub">No uses el visor interno de otra app.</div></div></div>
    <div class="list-row"><div class="list-icon">3</div><div class="row-main"><div class="row-title">Toca Compartir</div><div class="row-sub">El icono cuadrado con flecha hacia arriba.</div></div></div>
    <div class="list-row"><div class="list-icon">4</div><div class="row-main"><div class="row-title">Añadir a pantalla de inicio</div><div class="row-sub">Se instalará como JC Finanzas.</div></div></div>
  </div><p class="tiny">El Service Worker permite uso sin conexión después de la primera carga. Face ID/Touch ID necesita un contexto HTTPS seguro.</p>`);
}

function bindStaticEvents(){
  $("#menuBtn").onclick=()=>{$("#drawer").classList.add("show");$("#overlay").classList.add("show")};
  $("#overlay").onclick=closeLayers;$("#modalClose").onclick=closeLayers;
  $$("[data-nav]").forEach(b=>b.onclick=()=>nav(b.dataset.nav));
  $$("[data-open='transaction']").forEach(b=>b.onclick=()=>openTransaction(b.dataset.type||"expense"));
  $$("[data-open='transfer']").forEach(b=>b.onclick=openTransfer);
  $("#fab").onclick=()=>openTransaction("expense");
  $("#newAccountBtn").onclick=()=>openAccount();
  $("#newBudgetBtn").onclick=()=>openBudget();
  $("#newCardBtn").onclick=()=>openCard();
  $("#newDebtBtn").onclick=()=>openDebt();
  $("#newAssetBtn").onclick=()=>openAsset();
  $("#newReminderBtn").onclick=openReminder;
  $("#txSearch").oninput=renderTransactions;
  $("#txTypeFilter").onchange=renderTransactions;
  $("#txAccountFilter").onchange=renderTransactions;
  $("#exportCsvBtn").onclick=exportCSV;
  $("#prevMonth").onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar()};
  $("#nextMonth").onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar()};
  $("#dashYear").onchange=drawCharts;$("#chartYear").onchange=drawCharts;
  $("#privacyBtn").onclick=()=>{data.profile.privacy=!data.profile.privacy;render()};
  $("#themeBtn").onclick=()=>{data.profile.theme=data.profile.theme==="dark"?"light":"dark";render()};
  $("#alertsBtn").onclick=openAlerts;
  $("#quickBackup").onclick=downloadJSON;$("#drawerBackup").onclick=downloadJSON;
  $("#drawerLock").onclick=()=>{closeLayers();showLock()};
  $("#saveProfileBtn").onclick=()=>{data.profile.name=$("#setName").value.trim()||"Usuario";data.profile.currency=$("#setCurrency").value;data.profile.savingsGoal=+$("#setSavingsGoal").value||0;render();toast("Perfil actualizado")};
  $("#themeSwitch").onclick=()=>{data.profile.theme=data.profile.theme==="dark"?"light":"dark";render()};
  $("#privacySwitch").onclick=()=>{data.profile.privacy=!data.profile.privacy;render()};
  $("#autoLockSwitch").onclick=()=>{if(!data.profile.pinHash&&!data.profile.biometricCredentialId)return toast("Configura primero PIN o biometría");data.profile.autoLock=!data.profile.autoLock;render()};
  $("#autoBackupSwitch").onclick=()=>{data.profile.autoBackup=!data.profile.autoBackup;render()};
  $("#pinSetupBtn").onclick=setupPin;
  $("#bioSetupBtn").onclick=setupBiometric;
  $("#backupNowBtn").onclick=()=>createSnapshot(true);
  $("#downloadBackupBtn").onclick=downloadJSON;
  $("#restoreBackupBtn").onclick=()=>$("#restoreFile").click();
  $("#restoreSnapshotBtn").onclick=restoreSnapshot;
  $("#installHelpBtn").onclick=installHelp;
  $("#resetBtn").onclick=()=>{if(confirm("¿Restablecer todos los datos?")){data=clone(demo);persist();render();toast("Datos restablecidos")}};
  $("#restoreFile").onchange=async e=>{try{const raw=await e.target.files[0].text(),parsed=JSON.parse(raw);if(!parsed.profile||!parsed.accounts||!parsed.transactions)throw 0;data={...clone(demo),...parsed,profile:{...demo.profile,...parsed.profile}};await persist();render();toast("Respaldo importado")}catch{toast("Archivo JSON no válido")}finally{e.target.value=""}};
  $("#unlockPinBtn").onclick=unlockPin;$("#pinInput").addEventListener("keydown",e=>{if(e.key==="Enter")unlockPin()});
  $("#unlockBioBtn").onclick=biometricUnlock;
  $("#forgotPinBtn").onclick=()=>toast("Restaura un respaldo previo o restablece los datos desde el navegador si no recuerdas el PIN.");
  window.addEventListener("resize",()=>{clearTimeout(window.__resize);window.__resize=setTimeout(drawCharts,120)});
  document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"&&data.profile.autoLock)sessionStorage.setItem("jc-lock","1");if(document.visibilityState==="visible"&&data.profile.autoLock&&sessionStorage.getItem("jc-lock")==="1"){sessionStorage.removeItem("jc-lock");showLock()}});
}

async function init(){
  await loadData();
  bindStaticEvents();
  render();
  if(data.profile.autoBackup) maybeDailyBackup();
  if(data.profile.autoLock&&(data.profile.pinHash||data.profile.biometricCredentialId)) showLock();
  if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost")){
    navigator.serviceWorker.register("./service-worker.js").catch(()=>{});
  }
}
document.addEventListener("DOMContentLoaded",init);
})();