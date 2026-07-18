const DAYS=[
  {name:"السبت",js:6},{name:"الأحد",js:0},{name:"الاثنين",js:1},{name:"الثلاثاء",js:2},{name:"الأربعاء",js:3},{name:"الخميس",js:4},{name:"الجمعة",js:5}
];
const BRANCHES=[
  {id:"hawalli",name:"دوام فرع حولي",color:"#1677d2",wash:"#eaf4ff"},
  {id:"abu_al_hasaniya",name:"دوام فرع أبو الحصانية",color:"#8b5fc7",wash:"#f3edfb"},
  {id:"yarmouk",name:"دوام فرع اليرموك",color:"#e29328",wash:"#fff5e5"}
];

let ctx=null;
let activeDay=null;
let schedule=null;
let selectedNoteEmployee=null;

const $=selector=>document.querySelector(selector);
const esc=(value="")=>String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const firstName=(name="")=>String(name).trim().split(/\s+/)[0]||"موظف";
const initials=(name="")=>String(name).trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("");
const formatHours=n=>Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const displayDate=date=>`\u200E${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}\u200E`;
const durationHours=(from,to)=>{const [fh,fm]=from.split(":").map(Number),[th,tm]=to.split(":").map(Number);let minutes=(th*60+tm)-(fh*60+fm);if(minutes<=0)minutes+=1440;return minutes/60;};
const timeParts=value=>{const [hour24,minute]=value.split(":").map(Number);return{hour:hour24%12||12,minute:minute>=30?"30":"00",period:hour24>=12?"pm":"am"};};
const formatTime=value=>{const p=timeParts(value);return`${String(p.hour).padStart(2,"0")}:${p.minute} ${p.period==="am"?"ص":"م"}`;};

function weekDays(){const now=new Date(),start=new Date(now);start.setHours(12,0,0,0);const sinceSaturday=(now.getDay()-6+7)%7;start.setDate(now.getDate()-sinceSaturday);return DAYS.map((day,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return{...day,date,key:dateKey(date)};});}
function emptySchedule(day){return{dateKey:day.key,dayName:day.name,date:day.date.toISOString(),assignments:{},notes:{},published:false,translation:null,updatedAt:Date.now()};}
function assignments(){return Object.values(schedule?.assignments||{});}
function notes(){return Object.values(schedule?.notes||{});}
function employeeById(id){return ctx.state.employees.find(employee=>employee.id===id);}
function usedHours(employeeId){return assignments().filter(item=>item.employeeId===employeeId).reduce((sum,item)=>sum+Number(item.hours||0),0);}
function remainingHours(employee){return Math.max(0,Number(employee.dailyHours||0)-usedHours(employee.id));}

export async function renderScheduleWorkspace(options){ctx=options;ctx.state.demoSchedules=ctx.state.demoSchedules||{};activeDay=null;schedule=null;renderDayFiles();}

function renderDayFiles(){
  const days=weekDays();
  ctx.container.innerHTML=`<section class="schedule-landing"><div class="schedule-landing-head"><div><span>التخطيط الأسبوعي</span><h1>جدول الدوامات</h1><p>اختر يومًا لتوزيع ساعات موظفي الجدول على الأفرع.</p></div><div class="week-badge">الأسبوع الحالي<br><b>${displayDate(days[0].date)} — ${displayDate(days[6].date)}</b></div></div><div class="day-files">${days.map((day,index)=>`<button class="day-file" data-day="${index}"><i>${String(index+1).padStart(2,"0")}</i><span><b>${day.name}</b><small>${displayDate(day.date)}</small></span><em>فتح الملف ←</em></button>`).join("")}</div></section>`;
  document.querySelectorAll(".day-file").forEach(button=>button.onclick=()=>openDay(days[Number(button.dataset.day)]));
}

async function openDay(day){
  activeDay=day;ctx.container.innerHTML='<div class="schedule-loading"><i></i><p>جاري فتح ملف اليوم...</p></div>';
  try{if(ctx.state.demo)schedule=ctx.state.demoSchedules[day.key]||emptySchedule(day);else{const snap=await ctx.get(ctx.ref(ctx.db,`organizations/default/schedules/${day.key}`));schedule=snap.exists()?snap.val():emptySchedule(day);}renderDayWorkspace();}catch(error){ctx.container.innerHTML=`<div class="empty"><b>تعذر فتح الجدول</b><p>${esc(error.message)}</p></div>`;}
}

function renderDayWorkspace(){
  const variableEmployees=ctx.state.employees.filter(employee=>employee.scheduleType==="variable");
  ctx.container.innerHTML=`<div class="schedule-workspace"><div class="schedule-toolbar"><button id="back-to-days" class="secondary">→ أيام الأسبوع</button><div><span>${activeDay.name}</span><h2>جدول دوام الأفرع ${activeDay.name} ${displayDate(activeDay.date)}</h2><small id="autosave-status">✓ الحفظ التلقائي مفعّل</small></div><div class="schedule-actions"><button id="publish-schedule" class="primary">نشر الجدول</button>${schedule.translation?'<button id="download-schedule" class="secondary">تحميل PDF عربي + إنجليزي</button>':""}</div></div><div class="planner-layout"><aside class="employee-pool"><div class="pool-head"><div><h3>موظفو الجدول</h3><p>اسحب الموظف إلى الفرع المطلوب</p></div><span>${variableEmployees.length}</span></div><div class="pool-list">${variableEmployees.length?variableEmployees.map(employeePoolCard).join(""):'<div class="pool-empty">لا يوجد موظفون يعتمد دوامهم على الجدول.</div>'}</div></aside><section class="a4-sheet"><header><span>ركائز HRMS</span><h1>جدول دوام الأفرع ${activeDay.name} ${displayDate(activeDay.date)}</h1><p>يُحفظ كل تعديل مباشرة</p></header>${BRANCHES.map(branch=>branchSection(branch)).join("")}<section class="sheet-notes"><div class="sheet-section-title"><h3>الملاحظات</h3><button id="add-schedule-note" class="note-add">＋ إضافة ملاحظة</button></div><div id="note-editor"></div><div class="notes-list">${notes().length?notes().map(noteCard).join(""):'<p class="no-notes">لا توجد ملاحظات لهذا اليوم.</p>'}</div></section></section></div>${schedule.published?'<div class="published-banner">✓ تم نشر هذا الجدول لموظفي البصمة</div>':""}${schedule.translationError?`<div class="translation-warning">تم نشر الجدول، لكن تعذرت الترجمة: ${esc(schedule.translationError)}</div>`:""}</div><div id="pdf-render-root"></div>`;
  bindWorkspaceEvents();
}

function employeePoolCard(employee){const remaining=remainingHours(employee),done=remaining<=0;return`<article class="pool-card ${done?"complete":""}" draggable="${done?"false":"true"}" data-employee="${employee.id}"><div class="pool-avatar">${employee.photoUrl?`<img src="${esc(employee.photoUrl)}" alt="">`:initials(employee.fullName)}</div><div><b>${esc(employee.fullName)}</b><small>${esc(employee.jobTitle||"")}</small></div><strong>${formatHours(remaining)} <small>ساعة متبقية</small></strong></article>`;}
function branchSection(branch){const list=assignments().filter(item=>item.branchId===branch.id);return`<section class="branch-zone" data-branch="${branch.id}" style="--branch:${branch.color};--branch-wash:${branch.wash}"><div class="branch-title"><i></i><h2>${branch.name}</h2><span>${list.length} فترات</span></div><div class="branch-grid">${list.length?list.map(item=>assignmentCard(item,branch)).join(""):'<div class="drop-placeholder">اسحب بطاقة موظف وضعها هنا</div>'}</div></section>`;}
function assignmentCard(item,branch){const employee=employeeById(item.employeeId);if(!employee)return"";return`<article class="assignment-card" draggable="true" data-assignment="${item.id}" style="--branch:${branch.color}"><button class="delete-assignment" data-delete="${item.id}" aria-label="حذف">×</button><b>${esc(firstName(employee.fullName))}</b><span>${formatTime(item.from)} — ${formatTime(item.to)}</span><p>${item.tasks.map(esc).join(" + ")}</p><button class="add-more-hours" data-more="${item.id}" title="إضافة ساعات أخرى">＋</button></article>`;}
function noteCard(note){const employee=note.employeeId?employeeById(note.employeeId):null;return`<article class="schedule-note-card"><span>${note.general?"عام":esc(firstName(employee?.fullName||"موظف"))}</span><p>${esc(note.text)}</p><button data-delete-note="${note.id}" aria-label="حذف الملاحظة">×</button></article>`;}

function bindWorkspaceEvents(){
  $("#back-to-days").onclick=renderDayFiles;
  document.querySelectorAll(".pool-card:not(.complete)").forEach(card=>card.ondragstart=event=>event.dataTransfer.setData("text/plain",`employee:${card.dataset.employee}`));
  document.querySelectorAll(".assignment-card").forEach(card=>card.ondragstart=event=>event.dataTransfer.setData("text/plain",`assignment:${card.dataset.assignment}`));
  document.querySelectorAll(".branch-zone").forEach(zone=>{zone.ondragover=event=>{event.preventDefault();zone.classList.add("drag-over");};zone.ondragleave=()=>zone.classList.remove("drag-over");zone.ondrop=event=>{event.preventDefault();zone.classList.remove("drag-over");const [kind,id]=event.dataTransfer.getData("text/plain").split(":");if(kind==="employee")openAssignmentModal(id,zone.dataset.branch);if(kind==="assignment")moveAssignment(id,zone.dataset.branch);};});
  document.querySelectorAll("[data-more]").forEach(button=>button.onclick=event=>{event.stopPropagation();const item=schedule.assignments[button.dataset.more];openAssignmentModal(item.employeeId,item.branchId);});
  document.querySelectorAll("[data-delete]").forEach(button=>button.onclick=async()=>{delete schedule.assignments[button.dataset.delete];await persistSchedule();renderDayWorkspace();});
  document.querySelectorAll("[data-delete-note]").forEach(button=>button.onclick=async()=>{delete schedule.notes[button.dataset.deleteNote];await persistSchedule();renderDayWorkspace();});
  $("#add-schedule-note").onclick=renderNoteEditor;
  $("#publish-schedule").onclick=publishSchedule;
  $("#download-schedule")?.addEventListener("click",downloadPdf);
}

async function moveAssignment(id,branchId){const item=schedule.assignments[id];if(!item||item.branchId===branchId)return;item.branchId=branchId;await persistSchedule();renderDayWorkspace();}
async function persistSchedule(){schedule.updatedAt=Date.now();$("#autosave-status")&&( $("#autosave-status").textContent="جارٍ الحفظ..." );if(ctx.state.demo)ctx.state.demoSchedules[activeDay.key]=structuredClone(schedule);else await ctx.set(ctx.ref(ctx.db,`organizations/default/schedules/${activeDay.key}`),schedule);$("#autosave-status")&&( $("#autosave-status").textContent="✓ تم الحفظ تلقائيًا" );}

function modalTimePicker(prefix,value){const p=timeParts(value);return`<div class="custom-time-picker" dir="ltr"><select id="${prefix}-hour" aria-label="الساعة">${Array.from({length:12},(_,i)=>i+1).map(hour=>`<option value="${hour}" ${hour===p.hour?"selected":""}>${String(hour).padStart(2,"0")}</option>`).join("")}</select><b>:</b><select id="${prefix}-minute" aria-label="الدقائق"><option value="00" ${p.minute==="00"?"selected":""}>00</option><option value="30" ${p.minute==="30"?"selected":""}>30</option></select><select id="${prefix}-period" class="period-select" aria-label="الفترة"><option value="am" ${p.period==="am"?"selected":""}>صباحاً</option><option value="pm" ${p.period==="pm"?"selected":""}>مساءً</option></select></div>`;}
function modalTimeValue(prefix){const hour=Number($(`#${prefix}-hour`).value),minute=$(`#${prefix}-minute`).value,period=$(`#${prefix}-period`).value,hour24=period==="pm"?(hour%12)+12:hour%12;return`${String(hour24).padStart(2,"0")}:${minute}`;}
function taskRow(value="",index=0){return`<div class="task-input"><span>${index+1}</span><input value="${esc(value)}" placeholder="اكتب مهمة العمل" required>${index?'<button type="button">×</button>':'<i></i>'}</div>`;}

function openAssignmentModal(employeeId,branchId){
  const employee=employeeById(employeeId),branch=BRANCHES.find(item=>item.id===branchId),remaining=remainingHours(employee);if(!employee||remaining<=0)return;
  document.querySelector("#modal-root").innerHTML=`<div class="modal-backdrop"><section class="modal work-segment-modal" role="dialog" aria-modal="true"><header><div><span>${esc(branch.name)}</span><h3>إضافة دوام ${esc(firstName(employee.fullName))}</h3></div><button type="button" class="modal-close">×</button></header><form id="schedule-assignment-form"><div class="assignment-remaining">متبقي للموظف <b>${formatHours(remaining)} ساعات</b></div><div class="time-grid"><label>من الساعة${modalTimePicker("schedule-from","08:00")}</label><span>←</span><label>إلى الساعة${modalTimePicker("schedule-to","10:00")}</label></div><div class="modal-duration">مدة الفترة: <b id="schedule-duration">2 ساعات</b></div><div class="tasks-head"><label>مهام العمل</label><button type="button" id="schedule-add-task" class="mini-add">＋ مهمة إضافية</button></div><div id="schedule-tasks">${taskRow()}</div><p id="schedule-modal-error" class="form-message error hidden"></p><footer><span></span><div><button type="button" class="secondary modal-cancel">إلغاء</button><button class="primary">إضافة إلى الجدول</button></div></footer></form></section></div>`;
  const close=()=>document.querySelector("#modal-root").innerHTML="";$(".modal-close").onclick=$(".modal-cancel").onclick=close;
  const bindTaskDeletes=()=>document.querySelectorAll("#schedule-tasks .task-input button").forEach(button=>button.onclick=()=>{button.parentElement.remove();document.querySelectorAll("#schedule-tasks .task-input span").forEach((span,index)=>span.textContent=index+1);});bindTaskDeletes();
  $("#schedule-add-task").onclick=()=>{$("#schedule-tasks").insertAdjacentHTML("beforeend",taskRow("",$("#schedule-tasks").children.length));bindTaskDeletes();};
  const updateDuration=()=>$("#schedule-duration").textContent=`${formatHours(durationHours(modalTimeValue("schedule-from"),modalTimeValue("schedule-to")))} ساعات`;document.querySelectorAll(".custom-time-picker select").forEach(select=>select.onchange=updateDuration);
  $("#schedule-assignment-form").onsubmit=async event=>{event.preventDefault();const from=modalTimeValue("schedule-from"),to=modalTimeValue("schedule-to"),hours=durationHours(from,to),tasks=[...document.querySelectorAll("#schedule-tasks input")].map(input=>input.value.trim()).filter(Boolean),error=$("#schedule-modal-error");if(!tasks.length){error.textContent="أضف مهمة واحدة على الأقل.";error.classList.remove("hidden");return;}if(hours>remaining){error.textContent=`الفترة أكبر من الساعات المتبقية (${formatHours(remaining)} ساعات).`;error.classList.remove("hidden");return;}const id=crypto.randomUUID();schedule.assignments=schedule.assignments||{};schedule.assignments[id]={id,employeeId,branchId,from,to,hours,tasks,createdAt:Date.now()};close();await persistSchedule();renderDayWorkspace();};
}

function renderNoteEditor(){selectedNoteEmployee=null;$("#note-editor").innerHTML=`<form id="schedule-note-form" class="note-editor"><div class="note-mode"><button type="button" id="general-note">عام</button><label>اسم الموظف<div class="employee-note-search"><input id="note-employee" autocomplete="off" placeholder="ابدأ بكتابة اسم الموظف"><div id="employee-suggestions"></div></div></label></div><label>الملاحظة<textarea id="note-text" rows="3" placeholder="اكتب الملاحظة الخاصة بالموظف"></textarea></label><div><button type="button" id="cancel-note" class="secondary">إلغاء</button><button class="primary">حفظ الملاحظة</button></div></form>`;
  let general=false;$("#general-note").onclick=()=>{general=!general;$("#general-note").classList.toggle("active",general);$(".employee-note-search").closest("label").classList.toggle("hidden",general);};
  $("#note-employee").oninput=event=>{const query=event.target.value.trim(),matches=ctx.state.employees.filter(employee=>employee.fullName.includes(query)).slice(0,6);$("#employee-suggestions").innerHTML=query?matches.map(employee=>`<button type="button" data-note-employee="${employee.id}"><span>${employee.photoUrl?`<img src="${esc(employee.photoUrl)}" alt="">`:initials(employee.fullName)}</span><b>${esc(employee.fullName)}</b></button>`).join(""):"";document.querySelectorAll("[data-note-employee]").forEach(button=>button.onclick=()=>{selectedNoteEmployee=button.dataset.noteEmployee;$("#note-employee").value=employeeById(selectedNoteEmployee).fullName;$("#employee-suggestions").innerHTML="";});};
  $("#cancel-note").onclick=()=>$("#note-editor").innerHTML="";
  $("#schedule-note-form").onsubmit=async event=>{event.preventDefault();const text=$("#note-text").value.trim();if(!text||(!general&&!selectedNoteEmployee))return;schedule.notes=schedule.notes||{};const id=crypto.randomUUID();schedule.notes[id]={id,text,general,employeeId:general?null:selectedNoteEmployee,createdAt:Date.now()};await persistSchedule();renderDayWorkspace();};
}

async function publishSchedule(){
  const loading=$("#action-loading");loading.classList.remove("hidden");loading.querySelector("h3").textContent="يرجى الانتظار";loading.querySelector("p").textContent="يتم نشر الدوامات وتجهيز الترجمة الإنجليزية...";
  try{schedule.published=true;schedule.publishedAt=Date.now();schedule.translationError=null;await persistSchedule();if(ctx.CONFIG.localAI?.url){try{schedule.translation=await translateWithLocalAI();await persistSchedule();}catch(error){schedule.translationError=error.message;await persistSchedule();}}await new Promise(resolve=>setTimeout(resolve,900));ctx.showToast("تم نشر الجدول للموظفين" );}finally{loading.classList.add("hidden");loading.querySelector("h3").textContent="جاري إدراج الموظف";loading.querySelector("p").textContent="نرتّب البيانات ونجهّز ملف الموظف...";renderDayWorkspace();}
}

async function translateWithLocalAI(){
  const compact={day:schedule.dayName,date:displayDate(activeDay.date),branches:BRANCHES.map(branch=>({id:branch.id,name:branch.name,assignments:assignments().filter(item=>item.branchId===branch.id).map(item=>({id:item.id,employeeId:item.employeeId,employee:firstName(employeeById(item.employeeId)?.fullName),from:formatTime(item.from),to:formatTime(item.to),tasks:item.tasks}))})),notes:notes().map(note=>({id:note.id,employee:note.general?"عام":firstName(employeeById(note.employeeId)?.fullName),text:note.text}))};
  const response=await fetch(ctx.CONFIG.localAI.url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model:ctx.CONFIG.localAI.model||"local-model",temperature:.15,messages:[{role:"system",content:"You are a professional HR schedule translator. Translate the supplied Arabic schedule into clear professional English. Return JSON only with this exact shape: {title, branchNames:{branchId:englishName}, employeeNames:{employeeId:englishFirstName}, tasks:{assignmentId:[english tasks]}, notes:{noteId:englishNote}}. Preserve all IDs."},{role:"user",content:JSON.stringify(compact)}]})});if(!response.ok)throw new Error("لم يستجب نموذج الذكاء الاصطناعي");const payload=await response.json(),content=payload.choices?.[0]?.message?.content||payload.content||"";try{return JSON.parse(String(content).replace(/^```json\s*|\s*```$/g,""));}catch{throw new Error("استجابة الترجمة ليست بصيغة صالحة");}
}

function pdfPage(language){const english=language==="en",translation=schedule.translation||{};return`<section class="pdf-page ${english?"english":"arabic"}" dir="${english?"ltr":"rtl"}"><header><small>RAKAEZ HRMS</small><h1>${english?esc(translation.title||`Branch Schedule — ${schedule.dayName} ${displayDate(activeDay.date)}`):`جدول دوام الأفرع ${schedule.dayName} ${displayDate(activeDay.date)}`}</h1></header>${BRANCHES.map(branch=>`<div class="pdf-branch" style="--branch:${branch.color}"><h2>${english?esc(translation.branchNames?.[branch.id]||branch.name):branch.name}</h2><div>${assignments().filter(item=>item.branchId===branch.id).map(item=>{const employee=employeeById(item.employeeId);return`<article><b>${english?esc(translation.employeeNames?.[item.employeeId]||firstName(employee?.fullName)):esc(firstName(employee?.fullName))}</b><span>${formatTime(item.from)} — ${formatTime(item.to)}</span><p>${english?(translation.tasks?.[item.id]||item.tasks).map(esc).join(" + "):item.tasks.map(esc).join(" + ")}</p></article>`;}).join("")||`<p class="pdf-empty">${english?"No assignments":"لا يوجد دوام"}</p>`}</div></div>`).join("")}<footer>${notes().map(note=>`<p><b>${note.general?(english?"General":"عام"):esc(firstName(employeeById(note.employeeId)?.fullName))}:</b> ${english?esc(translation.notes?.[note.id]||note.text):esc(note.text)}</p>`).join("")}</footer></section>`;}
async function downloadPdf(){if(!schedule.translation)return;const root=$("#pdf-render-root");root.innerHTML=pdfPage("ar")+pdfPage("en");const pages=[...root.querySelectorAll(".pdf-page")],{jsPDF}=window.jspdf,pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});for(let index=0;index<pages.length;index++){const canvas=await window.html2canvas(pages[index],{scale:2,backgroundColor:"#ffffff"});if(index)pdf.addPage("a4","landscape");pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,297,210);}pdf.save(`جدول دوام الأفرع يوم ${schedule.dayName} تاريخ ${displayDate(activeDay.date)}.pdf`);root.innerHTML="";}
