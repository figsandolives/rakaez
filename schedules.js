const DAYS=[
  {name:"السبت",js:6},{name:"الأحد",js:0},{name:"الاثنين",js:1},{name:"الثلاثاء",js:2},{name:"الأربعاء",js:3},{name:"الخميس",js:4},{name:"الجمعة",js:5}
];
const BRANCHES=[
  {id:"hawalli",name:"دوام فرع حولي",color:"#1677d2",wash:"#eaf4ff"},
  {id:"abu_al_hasaniya",name:"دوام فرع أبو الحصانية",color:"#8b5fc7",wash:"#f3edfb"},
  {id:"yarmouk",name:"دوام فرع اليرموك",color:"#e29328",wash:"#fff5e5"}
];
const whatsappBranchNames={hawalli:"حولي",abu_al_hasaniya:"أبو الحصانية",yarmouk:"اليرموك"};

let ctx=null;
let activeDay=null;
let schedule=null;
let selectedNoteEmployee=null;
let draggingAssignmentId="";

const $=selector=>document.querySelector(selector);
const esc=(value="")=>String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const firstName=(name="")=>String(name).trim().split(/\s+/).slice(0,2).join(" ")||"موظف";
const initials=(name="")=>String(name).trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("");
const formatHours=n=>Number.isInteger(n)?String(n):String(Math.round(n*100)/100);
const latinDigits=value=>String(value??"").replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d));
const dateKey=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const displayDate=date=>`\u200E${date.getDate()}-${date.getMonth()+1}-${date.getFullYear()}\u200E`;
const durationHours=(from,to)=>{const [fh,fm]=from.split(":").map(Number),[th,tm]=to.split(":").map(Number);let minutes=(th*60+tm)-(fh*60+fm);if(minutes<=0)minutes+=1440;return minutes/60;};
const timeParts=value=>{const [hour24,minute]=value.split(":").map(Number);return{hour:hour24%12||12,minute:minute>=30?"30":"00",period:hour24>=12?"pm":"am"};};
const arabicDigits=value=>String(value).replace(/\d/g,d=>"٠١٢٣٤٥٦٧٨٩"[d]);
const timeLabel=value=>{const p=timeParts(value),clock=p.minute==="00"?String(p.hour):`${p.hour}:${p.minute}`;return{clock,period:p.period};};
const formatTime=value=>{const p=timeLabel(value);return`${arabicDigits(p.clock)} ${p.period==="am"?"ص":"م"}`;};
const formatEnglishTime=value=>{const p=timeLabel(value);return`${p.clock} ${p.period.toUpperCase()}`;};
const assignmentTimeRange=(from,to)=>{const start=timeLabel(from),end=timeLabel(to);return`<span class="assignment-time" dir="rtl"><bdi>${arabicDigits(start.clock)}</bdi><em>${start.period==="am"?"ص":"م"}</em><i>—</i><bdi>${arabicDigits(end.clock)}</bdi><em>${end.period==="am"?"ص":"م"}</em></span>`;};

function weekDays(){const now=new Date(),start=new Date(now);start.setHours(12,0,0,0);const sinceSaturday=(now.getDay()-6+7)%7;start.setDate(now.getDate()-sinceSaturday);return DAYS.map((day,index)=>{const date=new Date(start);date.setDate(start.getDate()+index);return{...day,date,key:dateKey(date)};});}
function emptySchedule(day){return{dateKey:day.key,dayName:day.name,date:day.date.toISOString(),assignments:{},notes:{},published:false,translation:null,updatedAt:Date.now()};}
function assignments(){return Object.values(schedule?.assignments||{}).sort((a,b)=>Number(a.order??a.createdAt??0)-Number(b.order??b.createdAt??0));}
function notes(){return Object.values(schedule?.notes||{});}
function employeeById(id){return ctx.state.employees.find(employee=>employee.id===id);}
function assignmentWorkHours(item){const total=Math.max(0,Number(item?.hours||0)),stored=Number(item?.workHours);return Number.isFinite(stored)?Math.max(0,stored):Math.max(0,total-(Math.max(0,Number(item?.breakMinutes||0))/60));}
function usedHours(employeeId){return assignments().filter(item=>item.employeeId===employeeId).reduce((sum,item)=>sum+assignmentWorkHours(item),0);}
function leaveTypeLabel(leave){return leave?.type==="weekly"?"إجازة أسبوعية":leave?.type==="sick"?"إجازة مرضية":leave?.type==="annual"?"إجازة سنوية":"إجازة";}
function englishLeaveTypeLabel(leave){return leave?.type==="weekly"?"Weekly day off":leave?.type==="sick"?"Sick leave":leave?.type==="annual"?"Annual leave":"Leave";}
function weeklyDaysFor(leave){const stored=Array.isArray(leave?.weeklyDays)?leave.weeklyDays.map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<=6):[];if(stored.length)return[...new Set(stored)];return[Number.isInteger(Number(leave?.weeklyDay))?Number(leave.weeklyDay):new Date(`${leave?.startDate}T12:00:00`).getDay()];}
function leaveForDay(employeeId,key=activeDay?.key){if(!key)return null;const date=new Date(`${key}T12:00:00`),matching=(ctx?.state?.leaves||[]).filter(leave=>{if(leave.employeeId!==employeeId)return false;if(leave.type==="weekly")return weeklyDaysFor(leave).includes(date.getDay());return leave.startDate<=key&&leave.endDate>=key&&!(leave.skipEnabled&&Number(leave.skipWeekday)===date.getDay());});return matching.sort((a,b)=>(b.duration==="full")-(a.duration==="full")||Number(b.createdAt||0)-Number(a.createdAt||0))[0]||null;}
function availableWorkHours(employee){const leave=leaveForDay(employee.id),base=Math.max(0,Number(employee.dailyHours||0));if(leave?.duration==="full")return 0;if(leave?.duration==="half")return base/2;return base;}
function remainingHours(employee){return Math.max(0,availableWorkHours(employee)-usedHours(employee.id));}
function leaveNotesForDay(){return ctx.state.employees.map(employee=>({employee,leave:leaveForDay(employee.id)})).filter(item=>item.leave&&(item.leave.type==="weekly"||item.leave.type==="sick"));}
function documentLogos(){const companyLogo=ctx?.state?.settings?.companyLogoUrl||ctx?.state?.settings?.companyLogoDataUrl;return`<div class="document-logos"><div class="document-company-logo">${companyLogo?`<img src="${esc(companyLogo)}" crossorigin="anonymous" alt="شعار المنشأة">`:'<span>شعار المنشأة</span>'}</div><div class="document-rakaez-logo"><img src="rakaez-mark.png" crossorigin="anonymous" alt="شعار ركائز"></div></div>`;}

export async function renderScheduleWorkspace(options){ctx=options;ctx.state.demoSchedules=ctx.state.demoSchedules||{};activeDay=null;schedule=null;renderDayFiles();}

function renderDayFiles(){
  const days=weekDays();
  ctx.container.innerHTML=`<section class="schedule-landing"><div class="schedule-landing-head"><div><span>التخطيط الأسبوعي</span><h1>جدول الدوامات</h1></div><div class="week-badge">الأسبوع الحالي<br><b>${displayDate(days[0].date)} — ${displayDate(days[6].date)}</b></div></div><div class="day-files">${days.map((day,index)=>`<button class="day-file" data-day="${index}"><i>${String(index+1).padStart(2,"0")}</i><span><b>${day.name}</b><small>${displayDate(day.date)}</small></span><em>فتح الملف ←</em></button>`).join("")}</div></section>`;
  document.querySelectorAll(".day-file").forEach(button=>button.onclick=()=>openDay(days[Number(button.dataset.day)]));
}

async function openDay(day){
  activeDay=day;ctx.container.innerHTML='<div class="schedule-loading"><i></i></div>';
  try{
    if(ctx.state.demo){schedule=ctx.state.demoSchedules[day.key]||emptySchedule(day);}
    else{const snap=await ctx.get(ctx.ref(ctx.db,`organizations/default/schedules/${day.key}`));schedule=snap.exists()?snap.val():emptySchedule(day);}
    if(schedule.translation){
      schedule.translation.employeeNames=Object.fromEntries(ctx.state.employees.map(employee=>[employee.id,String(employee.fullNameEn||"").trim()]));
    }
    renderDayWorkspace();
  }catch(error){
    schedule=emptySchedule(day);
    ctx.container.innerHTML=`<div class="empty"><b>تعذر فتح الجدول</b><p>${esc(error.message)}. تم فتح نسخة فارغة مؤقتاً.</p><button id="retry-open-day" class="primary">إعادة المحاولة</button></div>`;
    $("#retry-open-day").onclick=()=>openDay(day);
  }
}

function renderDayWorkspace(){
  const variableEmployees=ctx.state.employees,fixedEmployeesOnLeave=ctx.state.employees.filter(employee=>employee.scheduleType!=="variable"&&leaveForDay(employee.id)),leaveNotes=leaveNotesForDay(),dayNotes=notes();
  ctx.container.innerHTML=`<div class="schedule-workspace"><div class="schedule-toolbar"><button id="back-to-days" class="secondary">→ أيام الأسبوع</button><div><span>${activeDay.name}</span><h2>جدول دوام الأفرع ${activeDay.name} ${displayDate(activeDay.date)}</h2><small id="autosave-status"></small></div><div class="schedule-actions"><button id="publish-schedule" class="primary">نشر الجدول</button>${schedule.published&&schedule.translation?'<button id="download-schedule" class="secondary">تحميل PDF عربي + إنجليزي</button>':""}</div></div><div class="planner-layout"><aside class="employee-pool"><div class="pool-head"><div><h3>موظفو الجدول</h3></div><span>${variableEmployees.length}</span></div><div class="pool-list">${variableEmployees.length?variableEmployees.map(employeePoolCard).join(""):'<div class="pool-empty"></div>'}</div>${fixedEmployeesOnLeave.length?`<section class="daily-leaves-panel"><header><b>إجازات اليوم</b><span>${fixedEmployeesOnLeave.length}</span></header>${fixedEmployeesOnLeave.map(dailyLeaveCard).join("")}</section>`:""}</aside><section class="a4-sheet"><header>${documentLogos()}<h1>جدول دوام الأفرع ${activeDay.name} ${displayDate(activeDay.date)}</h1></header>${BRANCHES.map(branch=>branchSection(branch)).join("")}<section class="sheet-notes"><div class="sheet-section-title"><h3>الملاحظات</h3><button id="add-schedule-note" class="note-add">＋ إضافة ملاحظة</button></div><div class="notes-list">${leaveNotes.length||dayNotes.length?`${leaveNotes.map(leaveNoteCard).join("")}${dayNotes.map(noteCard).join("")}`:""}</div></section></section></div>${schedule.published?'<div class="published-banner">✓ تم نشر هذا الجدول لموظفي البصمة</div>':""}${schedule.translationError&&!schedule.translation?`<div class="translation-warning">تم نشر الجدول، لكن تعذرت الترجمة: ${esc(schedule.translationError)}</div>`:""}</div><div id="pdf-render-root"></div>`;
  bindWorkspaceEvents();
}

function employeePoolCard(employee){const leave=leaveForDay(employee.id),remaining=remainingHours(employee),fullLeave=leave?.duration==="full",done=remaining<=0&&!fullLeave,photo=employee.photoDataUrl||employee.photoUrl;const hours=leave?`<strong class="pool-leave-label">${esc(leaveTypeLabel(leave))}${leave.duration==="half"?" · نصف يوم":""}</strong>`:`<strong class="pool-hours"><b>${formatHours(remaining)}</b><small>ساعة متبقية</small></strong>`;return`<article class="pool-card ${done?"complete":""} ${fullLeave?"leave-full":""} ${leave?.duration==="half"?"leave-half":""}" draggable="${done||fullLeave?"false":"true"}" data-employee="${employee.id}"><div class="pool-avatar">${photo?`<img src="${esc(photo)}" alt="">`:initials(employee.fullName)}</div><div><b>${esc(employee.fullName)}</b><small>${esc(employee.jobTitle||"")}</small></div>${hours}</article>`;}
function dailyLeaveCard(employee){const leave=leaveForDay(employee.id),half=leave?.duration==="half";return`<article class="daily-leave-card ${half?"half":"full"}"><b>${esc(firstName(employee.fullName))}</b><span>${esc(leaveTypeLabel(leave))}${half?" · نصف يوم":""}</span></article>`;}
function branchSection(branch){const list=assignments().filter(item=>item.branchId===branch.id);return`<section class="branch-zone" data-branch="${branch.id}" style="--branch:${branch.color};--branch-wash:${branch.wash}"><div class="branch-title"><i></i><h2>${branch.name}</h2><span>${list.length} فترات</span></div><div class="branch-grid">${list.length?list.map(item=>assignmentCard(item,branch)).join(""):'<div class="drop-placeholder"></div>'}</div></section>`;}
function assignmentCard(item,branch){const employee=employeeById(item.employeeId);if(!employee)return"";const leave=leaveForDay(employee.id),breakMinutes=Math.max(0,Number(item.breakMinutes||0)),breakInfo=breakMinutes?`<small class="assignment-break">بريك ${formatHours(breakMinutes)} دقيقة</small>`:"",leaveInfo=leave?.duration==="half"?`<small class="assignment-leave-half">${esc(leaveTypeLabel(leave))} · نصف يوم</small>`:leave?.duration==="full"?`<small class="assignment-leave-full">${esc(leaveTypeLabel(leave))}</small>`:"";return`<article class="assignment-card ${leave?.duration==="full"?"on-full-leave":""}" draggable="true" data-assignment="${item.id}" style="--branch:${branch.color}"><button class="delete-assignment" data-delete="${item.id}" aria-label="حذف">×</button><b>${esc(firstName(employee.fullName))}</b>${assignmentTimeRange(item.from,item.to)}${breakInfo}${leaveInfo}<p>${item.tasks.map(esc).join(" + ")}</p><button class="add-more-hours" data-more="${item.id}" title="إضافة ساعات أخرى">＋</button></article>`;}
function leaveNoteCard({employee,leave}){return`<article class="schedule-note-card leave-note"><p><b>${esc(firstName(employee.fullName))}</b><span>${esc(leaveTypeLabel(leave))}</span></p></article>`;}
function noteCard(note){const employee=note.employeeId?employeeById(note.employeeId):null;return`<article class="schedule-note-card" data-note-id="${note.id}" title="دبل كليك لتعديل الملاحظة"><span>${note.general?"عام":esc(firstName(employee?.fullName||"موظف"))}</span><p>${esc(note.text)}</p><button data-delete-note="${note.id}" aria-label="حذف الملاحظة">×</button></article>`;}

function bindWorkspaceEvents(){
  $("#back-to-days").onclick=renderDayFiles;
  document.querySelectorAll(".pool-card:not(.complete):not(.leave-full)").forEach(card=>card.ondragstart=event=>event.dataTransfer.setData("text/plain",`employee:${card.dataset.employee}`));
  const clearDropMarkers=()=>document.querySelectorAll(".assignment-card.drop-before,.assignment-card.drop-after").forEach(item=>item.classList.remove("drop-before","drop-after"));
  document.querySelectorAll(".assignment-card").forEach(card=>{card.ondragstart=event=>{draggingAssignmentId=card.dataset.assignment;event.dataTransfer.setData("text/plain",`assignment:${card.dataset.assignment}`);event.dataTransfer.effectAllowed="move";};card.ondragend=()=>{draggingAssignmentId="";clearDropMarkers();};card.ondragover=event=>{event.preventDefault();event.stopPropagation();if(!draggingAssignmentId)return;clearDropMarkers();card.classList.add(event.clientX>card.getBoundingClientRect().left+card.getBoundingClientRect().width/2?"drop-before":"drop-after");};card.ondragleave=event=>{if(!card.contains(event.relatedTarget))card.classList.remove("drop-before","drop-after");};card.ondrop=event=>{event.preventDefault();event.stopPropagation();const [kind,id]=event.dataTransfer.getData("text/plain").split(":"),beforeId=card.classList.contains("drop-before")?card.dataset.assignment:card.nextElementSibling?.dataset.assignment||"";clearDropMarkers();if(kind==="assignment"){const target=schedule.assignments[card.dataset.assignment];if(target)moveAssignment(id,target.branchId,beforeId);}};card.ondblclick=event=>{if(event.target.closest("button"))return;const item=schedule.assignments[card.dataset.assignment];if(item)openAssignmentModal(item.employeeId,item.branchId,item.id);};});
  document.querySelectorAll(".branch-zone").forEach(zone=>{zone.ondragover=event=>{event.preventDefault();zone.classList.add("drag-over");};zone.ondragleave=()=>zone.classList.remove("drag-over");zone.ondrop=event=>{event.preventDefault();zone.classList.remove("drag-over");clearDropMarkers();const [kind,id]=event.dataTransfer.getData("text/plain").split(":");if(kind==="employee")openAssignmentModal(id,zone.dataset.branch);if(kind==="assignment")moveAssignment(id,zone.dataset.branch);};});
  document.querySelectorAll("[data-more]").forEach(button=>button.onclick=event=>{event.stopPropagation();const item=schedule.assignments[button.dataset.more];openAssignmentModal(item.employeeId,item.branchId);});
  document.querySelectorAll("[data-delete]").forEach(button=>button.onclick=async()=>{delete schedule.assignments[button.dataset.delete];await persistSchedule({invalidate:true});renderDayWorkspace();});
  document.querySelectorAll("[data-delete-note]").forEach(button=>button.onclick=async()=>{delete schedule.notes[button.dataset.deleteNote];await persistSchedule({invalidate:true});renderDayWorkspace();});
  document.querySelectorAll("[data-note-id]").forEach(card=>card.ondblclick=event=>{if(event.target.closest("button"))return;openNoteModal(card.dataset.noteId);});
  $("#add-schedule-note").onclick=openNoteModal;
  $("#publish-schedule").onclick=publishSchedule;
  $("#download-schedule")?.addEventListener("click",downloadPdf);
}

async function moveAssignment(id,branchId,beforeId=""){const item=schedule.assignments[id];if(!item)return;item.branchId=branchId;const ordered=assignments().filter(assignment=>assignment.id!==id&&assignment.branchId===branchId),beforeIndex=beforeId?ordered.findIndex(assignment=>assignment.id===beforeId):-1;ordered.splice(beforeIndex>=0?beforeIndex:ordered.length,0,item);ordered.forEach((assignment,index)=>{schedule.assignments[assignment.id]={...schedule.assignments[assignment.id],branchId,order:index};});await persistSchedule({invalidate:true});renderDayWorkspace();}
function invalidatePublishedSchedule(){if(!schedule.published&&!schedule.translation&&!schedule.translationError)return;schedule.published=false;schedule.publishedAt=null;schedule.translation=null;schedule.translationError=null;}
async function persistSchedule({invalidate=false}={}){if(invalidate)invalidatePublishedSchedule();schedule.updatedAt=Date.now();if(ctx.state.demo)ctx.state.demoSchedules[activeDay.key]=structuredClone(schedule);else await ctx.set(ctx.ref(ctx.db,`organizations/default/schedules/${activeDay.key}`),schedule);}

function modalTimePicker(prefix,value){const p=timeParts(value);return`<div class="custom-time-picker" dir="ltr"><select id="${prefix}-hour" aria-label="الساعة">${Array.from({length:12},(_,i)=>i+1).map(hour=>`<option value="${hour}" ${hour===p.hour?"selected":""}>${String(hour).padStart(2,"0")}</option>`).join("")}</select><b>:</b><select id="${prefix}-minute" aria-label="الدقائق"><option value="00" ${p.minute==="00"?"selected":""}>00</option><option value="30" ${p.minute==="30"?"selected":""}>30</option></select><select id="${prefix}-period" class="period-select" aria-label="الفترة"><option value="am" ${p.period==="am"?"selected":""}>صباحاً</option><option value="pm" ${p.period==="pm"?"selected":""}>مساءً</option></select></div>`;}
function modalTimeValue(prefix){const hour=Number($(`#${prefix}-hour`).value),minute=$(`#${prefix}-minute`).value,period=$(`#${prefix}-period`).value,hour24=period==="pm"?(hour%12)+12:hour%12;return`${String(hour24).padStart(2,"0")}:${minute}`;}
function taskRow(value="",index=0){return`<div class="task-input"><span>${index+1}</span><input value="${esc(value)}" placeholder="اكتب مهمة العمل" required>${index?'<button type="button">×</button>':'<i></i>'}</div>`;}
function translationStatus(){return`<div class="item-translation-status hidden" aria-live="polite"><div><b class="item-translation-title"></b><span class="item-translation-eta"></span></div><i><em></em></i></div>`;}
function translationEditor(id,label="الترجمة الإنجليزية"){return`<label class="item-translation-editor hidden" id="${id}-wrap">${label}<textarea id="${id}" rows="3" dir="ltr" placeholder="ستظهر الترجمة الإنجليزية هنا"></textarea></label>`;}

function openAssignmentModal(employeeId,branchId,assignmentId=""){
  const existing=assignmentId?schedule.assignments?.[assignmentId]:null,employee=employeeById(employeeId),branch=BRANCHES.find(item=>item.id===branchId),leave=employee&&leaveForDay(employeeId),remaining=employee&&remainingHours(employee),available=Math.max(0,Number(remaining||0)+assignmentWorkHours(existing));if(!employee||!branch||leave?.duration==="full"||(!existing&&remaining<=0))return;
  const leaveNotice=leave?.duration==="half"?`<div class="assignment-half-notice">${esc(leaveTypeLabel(leave))} · نصف يوم</div>`:"",editing=Boolean(existing),initialBreak=Math.max(0,Number(existing?.breakMinutes||0));
  const existingTaskTranslations=Array.isArray(existing?.taskTranslations)?existing.taskTranslations:[];
  document.querySelector("#modal-root").innerHTML=`<div class="modal-backdrop"><section class="modal work-segment-modal" role="dialog" aria-modal="true"><header><div><span>${esc(branch.name)}</span><h3>${editing?"تعديل دوام":"إضافة دوام"} ${esc(firstName(employee.fullName))}</h3></div><button type="button" class="modal-close">×</button></header><form id="schedule-assignment-form">${leaveNotice}<div class="assignment-remaining">متبقي للموظف <b>${formatHours(available)} ساعات عمل</b></div><div class="time-grid"><label>من الساعة${modalTimePicker("schedule-from",existing?.from||"08:00")}</label><span>←</span><label>إلى الساعة${modalTimePicker("schedule-to",existing?.to||"10:00")}</label></div><div class="modal-duration">مدة الفترة: <b id="schedule-duration">2 ساعات</b></div><section class="assignment-break-config"><label class="assignment-break-toggle"><input id="schedule-break-enabled" type="checkbox" ${initialBreak?"checked":""}><span>يوجد وقت بريك</span></label><label id="schedule-break-minutes-wrap" class="assignment-break-minutes ${initialBreak?"":"hidden"}">مدة البريك بالدقائق<input id="schedule-break-minutes" inputmode="numeric" maxlength="3" value="${initialBreak||""}" placeholder="مثال: 30"></label></section><div class="tasks-head"><label>مهام العمل</label><button type="button" id="schedule-add-task" class="mini-add">＋ مهمة إضافية</button></div><div id="schedule-tasks">${(existing?.tasks?.length?existing.tasks:[""]).map(taskRow).join("")}</div><section class="item-translation-panel"><div class="item-translation-head"><div><b>الترجمة الإنجليزية للمهام</b><span>تُحفظ مع كل مهمة قبل إضافتها للجدول</span></div><button type="button" id="translate-assignment" class="secondary">ترجمة المهام</button></div>${translationStatus()}<div id="assignment-translations">${existingTaskTranslations.length?existingTaskTranslations.map((item,index)=>`<label class="task-translation-field">ترجمة المهمة ${index+1}<input dir="ltr" value="${esc(item.text||"")}" data-task-translation-source="${esc(item.source||"")}"></label>`).join(""):""}</div></section><p id="schedule-modal-error" class="form-message error hidden"></p><footer><span></span><div><button type="button" class="secondary modal-cancel">إلغاء</button><button class="primary" id="save-assignment">${editing?"حفظ التعديلات":"إضافة إلى الجدول"}</button></div></footer></form></section></div>`;
  const close=()=>document.querySelector("#modal-root").innerHTML="";$(".modal-close").onclick=$(".modal-cancel").onclick=close;
  const taskValues=()=>[...document.querySelectorAll("#schedule-tasks input")].map(input=>input.value.trim()).filter(Boolean);
  const renderedTaskTranslations=()=>[...document.querySelectorAll("#assignment-translations input")].map(input=>({source:input.dataset.taskTranslationSource||"",text:input.value.trim()}));
  const clearTaskTranslations=()=>{$("#assignment-translations").innerHTML="";};
  const bindTaskDeletes=()=>document.querySelectorAll("#schedule-tasks .task-input button").forEach(button=>button.onclick=()=>{button.parentElement.remove();document.querySelectorAll("#schedule-tasks .task-input span").forEach((span,index)=>span.textContent=index+1);clearTaskTranslations();});bindTaskDeletes();
  $("#schedule-add-task").onclick=()=>{$("#schedule-tasks").insertAdjacentHTML("beforeend",taskRow("",$("#schedule-tasks").children.length));$("#schedule-tasks input:last-of-type").oninput=clearTaskTranslations;clearTaskTranslations();bindTaskDeletes();};
  document.querySelectorAll("#schedule-tasks input").forEach(input=>input.oninput=clearTaskTranslations);
  $("#translate-assignment").onclick=async()=>{const tasks=taskValues(),error=$("#schedule-modal-error");if(!tasks.length){error.textContent="اكتب مهمة واحدة على الأقل قبل الترجمة.";error.classList.remove("hidden");return;}error.classList.add("hidden");const button=$("#translate-assignment");button.disabled=true;try{const translated=await translateItems(tasks.map((text,index)=>({id:String(index),text})),"المهام");$("#assignment-translations").innerHTML=tasks.map((task,index)=>`<label class="task-translation-field">ترجمة المهمة ${index+1}<input dir="ltr" value="${esc(translated[index])}" data-task-translation-source="${esc(task)}"></label>`).join("");}catch(error){error=$("#schedule-modal-error");error.textContent=error.message||"تعذرت ترجمة المهام.";error.classList.remove("hidden");}finally{button.disabled=false;}};
  const breakEnabled=$("#schedule-break-enabled"),breakMinutesInput=$("#schedule-break-minutes"),breakMinutesWrap=$("#schedule-break-minutes-wrap"),currentBreakMinutes=()=>breakEnabled.checked?Math.max(0,Number(latinDigits(breakMinutesInput.value)||0)):0,updateDuration=()=>{const hours=durationHours(modalTimeValue("schedule-from"),modalTimeValue("schedule-to")),breakHours=currentBreakMinutes()/60,workHours=Math.max(0,hours-breakHours);$("#schedule-duration").textContent=breakHours?`${formatHours(hours)} ساعات · صافي العمل ${formatHours(workHours)} ساعات`:`${formatHours(hours)} ساعات`;};breakEnabled.onchange=()=>{breakMinutesWrap.classList.toggle("hidden",!breakEnabled.checked);if(!breakEnabled.checked)breakMinutesInput.value="";updateDuration();};breakMinutesInput.oninput=()=>{breakMinutesInput.value=latinDigits(breakMinutesInput.value).replace(/\D/g,"");updateDuration();};document.querySelectorAll(".custom-time-picker select").forEach(select=>select.onchange=updateDuration);
  $("#schedule-assignment-form").onsubmit=async event=>{event.preventDefault();const from=modalTimeValue("schedule-from"),to=modalTimeValue("schedule-to"),hours=durationHours(from,to),breakMinutes=currentBreakMinutes(),workHours=Math.max(0,hours-(breakMinutes/60)),tasks=taskValues(),taskTranslations=renderedTaskTranslations(),error=$("#schedule-modal-error");if(!tasks.length){error.textContent="أضف مهمة واحدة على الأقل.";error.classList.remove("hidden");return;}if(taskTranslations.length!==tasks.length||taskTranslations.some((item,index)=>item.source!==tasks[index]||!item.text)){error.textContent="اضغط «ترجمة المهام» ثم راجع النص الإنجليزي قبل الحفظ.";error.classList.remove("hidden");return;}if(breakEnabled.checked&&!breakMinutes){error.textContent="اكتب عدد دقائق البريك.";error.classList.remove("hidden");return;}if(breakMinutes>=hours*60){error.textContent="يجب أن يكون البريك أقل من مدة الفترة.";error.classList.remove("hidden");return;}if(workHours>available){error.textContent=`صافي ساعات العمل أكبر من الساعات المتبقية (${formatHours(available)} ساعات).`;error.classList.remove("hidden");return;}const id=existing?.id||crypto.randomUUID();schedule.assignments=schedule.assignments||{};schedule.assignments[id]={...(existing||{}),id,employeeId,branchId,from,to,hours,workHours,breakMinutes,tasks,taskTranslations,createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()};close();await persistSchedule({invalidate:true});renderDayWorkspace();};
}

function openNoteModal(noteId=""){
  const existing=noteId?schedule.notes?.[noteId]:null;
  selectedNoteEmployee=existing?.general?null:existing?.employeeId||null;
  const root=$("#modal-root");
  const translationReady=existing?.translation&&existing?.translationSource===existing?.text;
  root.innerHTML=`<div class="modal-backdrop schedule-note-backdrop"><section class="modal note-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-note-title"><header><div><span>ملاحظات جدول الدوامات</span><h3 id="schedule-note-title">${existing?"تعديل الملاحظة":"إضافة ملاحظة جديدة"}</h3></div><button type="button" class="modal-close" aria-label="إغلاق">×</button></header><form id="schedule-note-form" class="note-editor"><div class="note-mode"><button type="button" id="general-note" aria-pressed="${existing?.general?"true":"false"}" class="${existing?.general?"active":""}">عام</button><label id="note-employee-field" class="${existing?.general?"hidden":""}">اسم الموظف<div class="employee-note-search"><input id="note-employee" autocomplete="off" placeholder="اسم الموظف" value="${esc(existing?.general?"":employeeById(selectedNoteEmployee)?.fullName||"")}"><div id="employee-suggestions"></div></div></label></div><label>الملاحظة<textarea id="note-text" rows="5" placeholder="الملاحظة" autofocus>${esc(existing?.text||"")}</textarea></label><section class="item-translation-panel note-translation-panel"><div class="item-translation-head"><div><b>الترجمة الإنجليزية</b><span>راجع النص ويمكنك تعديله قبل الحفظ</span></div><button type="button" id="translate-note" class="secondary">ترجمة</button></div>${translationStatus()}${translationEditor("note-translation")}</section><p id="schedule-note-error" class="form-message error hidden"></p><footer><span></span><div><button type="button" id="cancel-note" class="secondary">إلغاء</button><button class="primary">${existing?"حفظ التعديل":"حفظ الملاحظة"}</button></div></footer></form></section></div>`;
  const close=()=>root.innerHTML="";
  $(".modal-close").onclick=$("#cancel-note").onclick=close;
  $(".schedule-note-backdrop").onclick=event=>{if(event.target.classList.contains("schedule-note-backdrop"))close();};
  let general=Boolean(existing?.general);
  const toggleGeneral=()=>{$("#general-note").classList.toggle("active",general);$("#general-note").setAttribute("aria-pressed",String(general));$("#note-employee-field").classList.toggle("hidden",general);if(general){selectedNoteEmployee=null;$("#note-employee").value="";}};
  $("#general-note").onclick=()=>{general=!general;toggleGeneral();};
  toggleGeneral();
  const translationWrap=$("#note-translation-wrap"),translationInput=$("#note-translation"),showNoteTranslation=()=>{translationWrap.classList.remove("hidden");};
  if(translationReady){translationInput.value=existing.translation;translationInput.dataset.source=existing.text;showNoteTranslation();}
  $("#note-text").oninput=()=>{if(translationInput.dataset.source!==$("#note-text").value.trim()){translationInput.value="";translationInput.dataset.source="";translationWrap.classList.add("hidden");}};
  $("#translate-note").onclick=async()=>{const source=$("#note-text").value.trim(),error=$("#schedule-note-error");if(!source){error.textContent="اكتب الملاحظة أولاً.";error.classList.remove("hidden");return;}error.classList.add("hidden");const button=$("#translate-note");button.disabled=true;try{translationInput.value=(await translateItems([{id:"note",text:source}],"الملاحظة"))[0];translationInput.dataset.source=source;showNoteTranslation();}catch(requestError){error.textContent=requestError.message||"تعذرت ترجمة الملاحظة.";error.classList.remove("hidden");}finally{button.disabled=false;}};
  $("#note-employee").oninput=event=>{const query=event.target.value.trim(),matches=ctx.state.employees.filter(employee=>employee.fullName.includes(query)).slice(0,6);$("#employee-suggestions").innerHTML=query?matches.map(employee=>{const photo=employee.photoDataUrl||employee.photoUrl;return`<button type="button" data-note-employee="${employee.id}"><span>${photo?`<img src="${esc(photo)}" alt="">`:initials(employee.fullName)}</span><b>${esc(employee.fullName)}</b></button>`;}).join(""):"";document.querySelectorAll("[data-note-employee]").forEach(button=>button.onclick=()=>{selectedNoteEmployee=button.dataset.noteEmployee;$("#note-employee").value=employeeById(selectedNoteEmployee).fullName;$("#employee-suggestions").innerHTML="";});};
  $("#schedule-note-form").onsubmit=async event=>{event.preventDefault();const text=$("#note-text").value.trim(),translation=translationInput.value.trim(),error=$("#schedule-note-error");if(!text){error.textContent="اكتب الملاحظة أولاً.";error.classList.remove("hidden");return;}if(translationInput.dataset.source!==text||!translation){error.textContent="اضغط «ترجمة» ثم راجع النص الإنجليزي قبل حفظ الملاحظة.";error.classList.remove("hidden");return;}if(!general&&!selectedNoteEmployee){error.textContent="اختر موظفاً أو فعّل خيار «عام».";error.classList.remove("hidden");return;}schedule.notes=schedule.notes||{};const id=existing?.id||crypto.randomUUID();schedule.notes[id]={...(existing||{}),id,text,translation,translationSource:text,general,employeeId:general?null:selectedNoteEmployee,createdAt:existing?.createdAt||Date.now(),updatedAt:Date.now()};close();await persistSchedule({invalidate:true});renderDayWorkspace();};
}

function itemTranslationEstimate(items){const characters=items.reduce((total,item)=>total+String(item.text||"").length,0);return Math.max(4,Math.min(45,Math.round(3+(characters/42)+(items.length*1.5))));}
function setItemTranslationProgress({title="",remaining="",percent=0,visible=true}={}){const status=$(".item-translation-status");if(!status)return;status.classList.toggle("hidden",!visible);const titleNode=status.querySelector(".item-translation-title"),etaNode=status.querySelector(".item-translation-eta"),bar=status.querySelector("em");if(title)titleNode.textContent=title;if(remaining)etaNode.textContent=remaining;if(bar)bar.style.width=`${Math.max(0,Math.min(100,percent))}%`;}
function extractItemTranslations(payload,items){let response=payload;if(typeof response?.message?.content==="string"){try{response=JSON.parse(response.message.content);}catch{throw new Error("رد Ollama لا يحتوي JSON صالحاً للترجمة.");}}const raw=Array.isArray(response)?response:(response?.translations||response?.data?.translations||response?.output?.translations||response?.result?.translations||response?.data||response?.output||response?.result);const records=Array.isArray(raw)?raw:null;if(!records)throw new Error("رد n8n لا يحتوي على قائمة ترجمات صالحة.");const byId=new Map(records.map((item,index)=>[String(item?.id??index),String(item?.translation??item?.translation_text??item?.text??item?.translatedText??item?.english??"").trim()]));const result=items.map((item,index)=>byId.get(String(item.id))||byId.get(String(index))||"");if(result.some(text=>!text))throw new Error("رد n8n لم يترجم كل النصوص المطلوبة.");return result;}
async function translateItems(items,label){
  const url=ctx.CONFIG?.n8n?.scheduleTranslationUrl?.trim();
  if(!url)throw new Error("رابط ترجمة n8n غير مضاف بعد. أضفه في ملف config.js أولاً.");
  const estimated=itemTranslationEstimate(items),startedAt=Date.now();
  setItemTranslationProgress({title:`جاري ترجمة ${label} بالذكاء الاصطناعي...`,remaining:`الوقت المتوقع: ${estimated} ثوانٍ`,percent:12});
  const timer=setInterval(()=>{const elapsed=(Date.now()-startedAt)/1000,percent=Math.min(90,12+Math.round((elapsed/estimated)*78)),remaining=Math.max(1,Math.ceil(estimated-elapsed));setItemTranslationProgress({title:`جاري ترجمة ${label} بالذكاء الاصطناعي...`,remaining:`متبقي تقريباً ${remaining} ثوانٍ`,percent});},500);
  try{
    const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"translate_schedule_items",sourceLanguage:"ar",targetLanguage:"en",context:"Professional HR branch schedule. Return clear English only.",items})});
    let payload;try{payload=await response.json();}catch{throw new Error("رد n8n ليس بصيغة JSON صالحة.");}
    if(!response.ok||payload?.ok===false)throw new Error(payload?.message||"تعذر اتصال n8n بخدمة الترجمة.");
    const translations=extractItemTranslations(payload,items);
    setItemTranslationProgress({title:"اكتملت الترجمة",remaining:"يمكنك الآن مراجعة النص وحفظه",percent:100});
    return translations;
  }finally{clearInterval(timer);}
}

function openPublishLoading(){
  const root=$("#modal-root");
  root.innerHTML=`<div class="schedule-publish-loading" role="status" aria-live="polite"><section class="publish-progress-card"><div class="publish-orbit" aria-hidden="true"><i></i><i></i><span>✦</span></div><span class="publish-kicker">ركائز HRMS</span><h2 id="publish-loading-title">جاري تجهيز صفحات الجدول...</h2><p id="publish-loading-message">نتحقق من الترجمات المحفوظة ثم نجهز النسختين العربية والإنجليزية.</p><div class="publish-progress-track" aria-label="تقدّم عملية النشر"><span id="publish-progress-bar" style="width:8%"></span></div><div class="publish-progress-meta"><b id="publish-progress-value">8%</b><span id="publish-progress-remaining">سيكون التحميل جاهزاً خلال لحظات</span></div><ol class="publish-steps"><li data-publish-step="1" class="active"><i>1</i><span>حفظ توزيع الدوامات</span></li><li data-publish-step="2"><i>2</i><span>التحقق من الترجمات</span></li><li data-publish-step="3"><i>3</i><span>تجهيز صفحات الجدول</span></li><li data-publish-step="4"><i>4</i><span>نشر الجدول للموظفين</span></li></ol></section></div>`;
  return root;
}
function setPublishProgress(percent,{title,message,remaining,step}={}){const value=Math.max(0,Math.min(100,Math.round(percent)));$("#publish-progress-bar")&&( $("#publish-progress-bar").style.width=`${value}%` );$("#publish-progress-value")&&($("#publish-progress-value").textContent=`${value}%`);title&&($("#publish-loading-title").textContent=title);message&&($("#publish-loading-message").textContent=message);remaining&&($("#publish-progress-remaining").textContent=remaining);document.querySelectorAll("[data-publish-step]").forEach(item=>{const itemStep=Number(item.dataset.publishStep);item.classList.toggle("active",itemStep===step);item.classList.toggle("complete",itemStep<step);});}
const translationStatsKey="rakaez.translation.stats";
function readTranslationStats(){try{const raw=localStorage.getItem(translationStatsKey);if(!raw)return null;const parsed=JSON.parse(raw);const avgSeconds=Number(parsed?.avgSeconds);if(!Number.isFinite(avgSeconds)||avgSeconds<=0)return null;return{avgSeconds,count:Number(parsed?.count)||0};}catch{return null;}}
function writeTranslationStats(seconds){try{const current=readTranslationStats(),safeSeconds=Math.max(1,Math.round(seconds)),next=current?Math.round((current.avgSeconds*0.7)+(safeSeconds*0.3)):safeSeconds;localStorage.setItem(translationStatsKey,JSON.stringify({avgSeconds:next,count:(current?.count||0)+1}));}catch{}}
function translationWorkUnits(){const taskChars=assignments().reduce((sum,item)=>sum+String(item.tasks?.join(" ")).length,0),noteChars=notes().reduce((sum,note)=>sum+String(note.text||"").length,0),employeeCount=assignments().length+notes().length;return(taskChars/28)+(noteChars/35)+(employeeCount*1.5);}
function translationEstimateSeconds(){const units=translationWorkUnits(),base=Math.max(20,Math.min(600,Math.round(18+(units*3.2)))),history=readTranslationStats()?.avgSeconds;return history?Math.max(15,Math.min(600,Math.round((history*0.55)+(base*0.45)))):base;}
function etaLabel(seconds){const safe=Math.max(1,Math.round(seconds));return safe>=120?`الوقت المتبقي التقريبي: ${Math.ceil(safe/60)} دقيقة`:`الوقت المتبقي التقريبي: ${safe} ثانية`;}
function startTranslationProgress(){const estimatedTotal=translationEstimateSeconds();const startedAt=Date.now();let progress=42;setPublishProgress(progress,{title:"جاري ترجمة جدول الدوامات...",message:"الذكاء الاصطناعي يجهز النسخة الإنجليزية النهائية الآن.",remaining:etaLabel(estimatedTotal),step:3});return{timer:setInterval(()=>{const elapsed=(Date.now()-startedAt)/1000;progress=Math.min(92,42+Math.min(50,Math.round((elapsed/estimatedTotal)*50)));const remaining=Math.max(1,estimatedTotal-elapsed);setPublishProgress(progress,{title:"جاري ترجمة جدول الدوامات...",message:"الذكاء الاصطناعي يجهز النسخة الإنجليزية النهائية الآن.",remaining:etaLabel(remaining),step:3});},2000),startedAt,estimatedTotal};}
function scheduleTranslationsReady(){const employeeIds=[...new Set([...assignments().map(item=>item.employeeId),...notes().map(note=>note.general?null:note.employeeId)].filter(Boolean))];return employeeIds.every(id=>String(employeeById(id)?.fullNameEn||"").trim())&&assignments().every(item=>Array.isArray(item.taskTranslations)&&item.taskTranslations.length===item.tasks.length&&item.taskTranslations.every((translation,index)=>translation?.source===item.tasks[index]&&String(translation?.text||"").trim()))&&notes().every(note=>note.translationSource===note.text&&String(note.translation||"").trim());}
function savedItemTranslation(){const employeeNames=Object.fromEntries(ctx.state.employees.map(employee=>[employee.id,String(employee.fullNameEn||"").trim()]));return{title:`Branch Schedule - ${titleCase({السبت:"Saturday",الأحد:"Sunday",الاثنين:"Monday",الثلاثاء:"Tuesday",الأربعاء:"Wednesday",الخميس:"Thursday",الجمعة:"Friday"}[schedule.dayName]||schedule.dayName)} ${displayDate(activeDay.date)}`,branchNames:fallbackBranchNames,employeeNames,tasks:Object.fromEntries(assignments().map(item=>[item.id,item.taskTranslations.map(translation=>translation.text.trim())])),notes:Object.fromEntries(notes().map(note=>[note.id,note.translation.trim()]))};}
async function publishEmployeeAppNotifications(){
  const publishedAt=Number(schedule.publishedAt)||Date.now(),generalNotes=notes().filter(note=>note.general);
  if(ctx.state.demo){schedule.demoNotificationCount=ctx.state.employees.filter(employee=>assignments().some(item=>item.employeeId===employee.id)||notes().some(note=>!note.general&&note.employeeId===employee.id)||leaveForDay(employee.id,activeDay.key)).length;return;}
  await Promise.all(ctx.state.employees.map(employee=>{
    const employeeShifts=assignments().filter(item=>item.employeeId===employee.id);
    const employeeNotes=notes().filter(note=>!note.general&&note.employeeId===employee.id);
    const relevantNotes=[...employeeNotes,...(employeeShifts.length?generalNotes:[])];
    const leave=leaveForDay(employee.id,activeDay.key);
    const shouldNotify=employeeShifts.length||employeeNotes.length||leave;
    const notification=shouldNotify?{
      id:`schedule-${activeDay.key}`,type:"schedule",employeeId:employee.id,
      scheduleDate:activeDay.key,dayName:schedule.dayName,publishedAt,createdAt:publishedAt,read:false,
      leave:leave?{type:leave.type||"leave",duration:leave.duration||"full"}:null,
      shifts:employeeShifts.map(item=>({id:item.id,branchId:item.branchId,from:item.from,to:item.to,tasks:item.tasks||[],taskTranslations:item.taskTranslations||[]})),
      notes:relevantNotes.map(note=>({id:note.id,text:note.text,translation:note.translation||"",general:Boolean(note.general)}))
    }:null;
    return ctx.set(ctx.ref(ctx.db,`organizations/default/employeeNotifications/${employee.id}/schedule-${activeDay.key}`),notification);
  }));
}
const arabicNationalityTerms=["الكويت","كويتي","السعود","سعودي","الامارات","الإمارات","اماراتي","إماراتي","قطر","قطري","البحرين","بحريني","عمان","عماني","العراق","عراقي","الاردن","الأردن","اردني","أردني","فلسطين","فلسطيني","لبنان","لبناني","سوريا","سوري","مصر","مصري","اليمن","يمني","السودان","سوداني","ليبيا","ليبي","تونس","تونسي","الجزائر","جزائري","المغرب","مغربي","موريتانيا","موريتاني","الصومال","صومالي","جيبوتي","جزر القمر","قمري"];
function isArabicNationality(nationality=""){const normalized=normalizeArabic(nationality).toLowerCase();return arabicNationalityTerms.some(term=>normalized.includes(normalizeArabic(term).toLowerCase()));}
function whatsappNumber(employee){const phone=employee?.primaryPhone?.phone||employee?.phone||employee?.phoneNumber||"",dialCode=employee?.primaryPhone?.dialCode||"+965";const number=latinDigits(`${dialCode}${phone}`).replace(/\\D/g,"");return number||"";}
function scheduleWhatsappMessages(){
  const translation=schedule.translation||savedItemTranslation(),generalNotes=notes().filter(note=>note.general),messages=[];
  for(const employee of ctx.state.employees){
    const number=whatsappNumber(employee),employeeAssignments=assignments().filter(item=>item.employeeId===employee.id),employeeNotes=notes().filter(note=>!note.general&&note.employeeId===employee.id),leave=leaveForDay(employee.id,activeDay.key),weeklyLeave=leave?.type==="weekly"&&leave?.duration==="full";
    if(!number||(!weeklyLeave&&!employeeAssignments.length&&!employeeNotes.length))continue;
    const arabic=isArabicNationality(employee.nationality),name=arabic?firstName(employee.fullName):firstName(translation.employeeNames?.[employee.id]||employee.fullNameEn||employee.fullName);
    let message;
    if(weeklyLeave)message=arabic?`مرحباً ${name}\n\nإجازتك الأسبوعية غداً\nإجازة سعيدة.`:`Hello ${name}\n\nYour weekly day off is tomorrow.\nHave a happy day off.`;
    else{
      const shifts=employeeAssignments.map(item=>{const branch=BRANCHES.find(value=>value.id===item.branchId);const times=arabic?`${formatTime(item.from)} — ${formatTime(item.to)}`:`${formatEnglishTime(item.from)} — ${formatEnglishTime(item.to)}`;const branchName=arabic?whatsappBranchNames[item.branchId]||branch?.name||item.branchId:(translation.branchNames?.[item.branchId]||branch?.name||item.branchId).replace(/\\s*Branch Schedule$/i,"");const tasks=arabic?item.tasks:(translation.tasks?.[item.id]||[]);return arabic?`• ${times}\nالفرع: ${branchName}\nالمهام: ${tasks.join("، ")}`:`• ${times}\nBranch: ${branchName}\nTasks: ${tasks.join(", ")}`;}).join("\n\n");
      const relevantNotes=[...employeeNotes,...(employeeAssignments.length?generalNotes:[])];const noteText=relevantNotes.map(note=>arabic?note.text:translation.notes?.[note.id]).filter(Boolean);const notesText=noteText.length?arabic?`\n\nملاحظات:\n${noteText.map(note=>`• ${note}`).join("\n")}`:`\n\nNotes:\n${noteText.map(note=>`• ${note}`).join("\n")}`:"";
      message=arabic?`مرحباً ${name}\n\nمهام عملك غداً كالتالي:\n\n${shifts}${notesText}`:`Hello ${name}\n\nYour work duties for tomorrow are:\n\n${shifts}${notesText}`;
    }
    messages.push({employeeId:employee.id,number,language:arabic?"ar":"en",message});
  }
  return messages;
}
async function notifyScheduleByWhatsapp(){
  if(ctx.CONFIG?.n8n?.employeeMessagesEnabled!==true)return{sent:0,skipped:0,disabled:true};
  const url=ctx.CONFIG?.n8n?.scheduleWhatsappUrl?.trim(),notifications=scheduleWhatsappMessages();
  if(!notifications.length)return{sent:0,skipped:0};
  if(!url)throw new Error("رابط إشعارات واتساب غير مضاف في config.js.");
  const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"send_schedule_whatsapp",schedule:{dateKey:activeDay.key,dayName:schedule.dayName},notifications})});
  let payload={};try{payload=await response.json();}catch{}
  if(!response.ok||payload?.ok===false)throw new Error(payload?.message||"تعذر إرسال إشعارات واتساب.");
  return{sent:Number(payload?.sent??notifications.length),skipped:Number(payload?.skipped??0)};
}
async function publishSchedule(){
  if(!scheduleTranslationsReady()){ctx.showToast("أكمل الاسم الإنجليزي لكل موظف في الجدول وترجم المهام والملاحظات أولاً.");return;}
  const root=openPublishLoading();
  try{setPublishProgress(20,{title:"جاري حفظ جدول الدوامات...",message:"نحفظ التوزيع والترجمات التي راجعتها.",remaining:"الوقت المتوقع: بضع ثوانٍ",step:1});schedule.published=true;schedule.publishedAt=Date.now();schedule.translationError=null;await persistSchedule();setPublishProgress(52,{title:"تم التحقق من الترجمات",message:"كل مهمة وملاحظة تحتوي ترجمتها الإنجليزية المحفوظة.",remaining:"جاري تجهيز الصفحات",step:2});schedule.translation=savedItemTranslation();setPublishProgress(78,{title:"جاري تجهيز صفحات الجدول...",message:"نجهز النسختين العربية والإنجليزية وإشعارات الموظفين.",remaining:"متبقي ثوانٍ قليلة",step:3});await persistSchedule();await publishEmployeeAppNotifications();schedule.whatsappNotification={status:"disabled",sent:0,at:Date.now()};setPublishProgress(100,{title:"تم نشر جدول الدوامات",message:"وصل إشعار شخصي في تطبيق البصمة لكل موظف لديه دوام أو ملاحظة.",remaining:"اكتملت العملية",step:4});await persistSchedule();await new Promise(resolve=>setTimeout(resolve,250));ctx.showToast("تم نشر الجدول وإشعارات الموظفين في تطبيق البصمة");}finally{root.innerHTML="";renderDayWorkspace();}
}

const fallbackBranchNames={hawalli:"Hawalli Branch Schedule",abu_al_hasaniya:"Abu Al Hasaniya Branch Schedule",yarmouk:"Yarmouk Branch Schedule"};
const fallbackTaskNames={"عامل":"Worker","استقبال":"Reception","فران":"Baker","مخازن":"Warehouse","سكرتاريا":"Secretary","عامل مطبخ":"Kitchen Staff","عاملة مطبخ":"Kitchen Staff","فراش":"Office Attendant","أمين صندوق":"Cashier","تنظيف":"Cleaning","مبيعات":"Sales","حلويات":"Sweets","إعداد خلطات":"Mix Preparation","اعداد خلطات":"Mix Preparation","محاسب":"Accountant","سائق":"Driver","خلاط":"Mixer","مخبز":"Bakery","عصير":"Juice","فرن":"Oven","فوال":"Beans","استقبال":"Reception","عامل نظافة":"Cleaner"};
const arabicLatin={ا:"a",أ:"a",إ:"i",آ:"a",ب:"b",ت:"t",ث:"th",ج:"j",ح:"h",خ:"kh",د:"d",ذ:"dh",ر:"r",ز:"z",س:"s",ش:"sh",ص:"s",ض:"d",ط:"t",ظ:"z",ع:"a",غ:"gh",ف:"f",ق:"q",ك:"k",ل:"l",م:"m",ن:"n",ه:"h",ة:"a",و:"w",ي:"y",ى:"a",ئ:"y",ؤ:"w",ء:""};
function latinizeArabic(value=""){return String(value).split("").map(letter=>arabicLatin[letter]??letter).join("").replace(/\s+/g," ").trim();}
function normalizeArabic(value=""){return String(value).replace(/[ًٌٍَُِّْـ]/g,"").replace(/\s+/g," ").trim();}
function titleCase(value){return String(value||"").split(/\s+/).filter(Boolean).map(word=>word.charAt(0).toUpperCase()+word.slice(1)).join(" ");}
function translateCompoundText(clean){return clean.split(/([+/،])/).map(part=>{const token=normalizeArabic(part);if(!token||token==="+"||token==="/"||token==="،")return part;return fallbackTaskNames[token]||latinizeArabic(token)||token;}).join("").replace(/\s+/g," ").trim();}
function translateTaskText(value=""){const clean=normalizeArabic(value);if(!clean)return"Work task";const directMap={...fallbackTaskNames,"إجازة أسبوعية":"Weekly leave","إجازة سنوية":"Annual leave","إجازة مرضية":"Sick leave","نصف يوم":"Half day","دوام":"Shift","سائق/حواية":"Driver / Helper","سائق / حواية":"Driver / Helper","سائق / حلويات":"Driver / Sweets","فران / حلويات":"Baker / Sweets","فران + استقبال":"Baker + Reception","استقبال + فران":"Reception + Baker"};return directMap[clean]||(/[\+/،]/.test(clean)?translateCompoundText(clean):latinizeArabic(clean))||"Work task";}
function translateNoteText(value=""){let text=normalizeArabic(value);if(!text)return"Note";const replacements=[["إجازة أسبوعية","Weekly leave"],["إجازة سنوية","Annual leave"],["إجازة مرضية","Sick leave"],["نصف يوم","Half day"],["من الساعة","from"],["من الساعه","from"],["الى","to"],["إلى","to"],["في حولي","in Hawalli"],["في أبو الحصانية","in Abu Al Hasaniya"],["في اليرموك","in Yarmouk"],["ترتيب ارفف","shelf arrangement"],["ترتيب الارفف","shelf arrangement"],["تقطيع","cutting"],["ملفوف احمر","red cabbage"],["حلويات","sweets"],["حلويات","sweets"],["عمل غربية","Western work"],["عام","General"]];for(const [from,to] of replacements)text=text.split(from).join(to);text=text.replace(/(\d{1,2})[.:](\d{2})\s*([صم])/g,(_,hour,minute,period)=>`${hour}:${minute} ${period==="ص"?"AM":"PM"}`);text=text.replace(/\b(من|الى|إلى)\b/g,word=>word==="من"?"from":"to");text=text.replace(/\s*\/\s*/g," / ");text=text.replace(/\s*\+\s*/g," + ");text=text.split(" ").map(token=>{const clean=token.trim();if(!clean)return clean;if(/^[A-Za-z0-9:/.+-]+$/.test(clean))return clean;return fallbackTaskNames[clean]||latinizeArabic(clean);}).join(" ").replace(/\s+/g," ").replace(/\s+([/+:,-])/g,"$1").trim();return titleCase(text);}
function fallbackTranslation(){const employeeNames=Object.fromEntries(ctx.state.employees.map(employee=>[employee.id,String(employee.fullNameEn||"").trim()]));return{title:`Branch Schedule - ${titleCase({السبت:"Saturday",الأحد:"Sunday",الاثنين:"Monday",الثلاثاء:"Tuesday",الأربعاء:"Wednesday",الخميس:"Thursday",الجمعة:"Friday"}[schedule.dayName]||schedule.dayName)} ${displayDate(activeDay.date)}`,branchNames:fallbackBranchNames,employeeNames,tasks:Object.fromEntries(assignments().map(item=>[item.id,item.tasks.map(translateTaskText)])),notes:Object.fromEntries(notes().map(note=>[note.id,translateNoteText(note.text)]))};}
function validateTranslationShape(translation){if(!translation||typeof translation!=="object")return null;const expectedBranches=BRANCHES.map(branch=>branch.id),expectedAssignments=assignments().map(item=>item.id),expectedNotes=notes().map(note=>note.id),expectedEmployees=[...new Set([...assignments().map(item=>item.employeeId),...notes().map(note=>note.general?null:note.employeeId)].filter(Boolean))];if(typeof translation.title!=="string"||!translation.title.trim())return null;if(!translation.branchNames||typeof translation.branchNames!=="object")return null;if(!translation.employeeNames||typeof translation.employeeNames!=="object")return null;if(!translation.tasks||typeof translation.tasks!=="object")return null;if(!translation.notes||typeof translation.notes!=="object")return null;for(const branchId of expectedBranches)if(typeof translation.branchNames[branchId]!=="string"||!translation.branchNames[branchId].trim())return null;for(const employeeId of expectedEmployees)if(typeof translation.employeeNames[employeeId]!=="string"||!translation.employeeNames[employeeId].trim())return null;for(const assignmentId of expectedAssignments){const taskList=translation.tasks[assignmentId];if(!Array.isArray(taskList)||!taskList.length||taskList.some(task=>typeof task!=="string"||!task.trim()))return null;}for(const noteId of expectedNotes)if(typeof translation.notes[noteId]!=="string"||!translation.notes[noteId].trim())return null;return{title:translation.title.trim(),branchNames:{...translation.branchNames},employeeNames:{...translation.employeeNames},tasks:{...translation.tasks},notes:{...translation.notes}};}
function parseTranslationResponse(payload){const candidates=[];if(typeof payload==="string")candidates.push(payload);else if(payload&&typeof payload==="object"){if(payload.title||payload.branchNames||payload.employeeNames||payload.tasks||payload.notes)return payload;candidates.push(payload.message?.content,payload.choices?.[0]?.message?.content,payload.content,payload.response);}for(const candidate of candidates){if(typeof candidate!=="string"||!candidate.trim())continue;const cleaned=candidate.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/i,"");const snippets=[cleaned];const start=cleaned.indexOf("{"),end=cleaned.lastIndexOf("}");if(start>=0&&end>start)snippets.push(cleaned.slice(start,end+1));for(const snippet of snippets)try{const parsed=JSON.parse(snippet);if(parsed&&typeof parsed==="object")return parsed;}catch{}}return null;}
async function translateWithLocalAI(){
  const compact={
    day: schedule.dayName,
    date: displayDate(activeDay.date),
    branches: BRANCHES.map(branch => ({
      id: branch.id,
      name: branch.name,
      assignments: assignments().filter(item => item.branchId === branch.id).map(item => ({
        id: item.id,
        employeeId: item.employeeId,
        employee: firstName(employeeById(item.employeeId)?.fullName),
        from: formatTime(item.from),
        to: formatTime(item.to),
        tasks: item.tasks
      }))
    })),
    notes: notes().map(note => ({
      id: note.id,
      employee: note.general ? "عام" : firstName(employeeById(note.employeeId)?.fullName),
      text: note.text
    }))
  };
  const ollama = ctx.CONFIG.localAI.provider === "ollama";
  const baseMessages = [
    {
      role: "system",
      content: "You are a professional HR schedule translator. Translate the supplied Arabic schedule into clear professional English. Return JSON only with this exact shape: {title, branchNames:{branchId:englishName}, employeeNames:{employeeId:englishFirstName}, tasks:{assignmentId:[english tasks]}, notes:{noteId:englishNote}}. Preserve all IDs. Every employee referenced anywhere, including notes, must have a Latin-script English first name in employeeNames. Do not omit any keys. Do not add extra text."
    },
    { role: "user", content: JSON.stringify(compact) }
  ];
  const requestBase = ollama
    ? { model: ctx.CONFIG.localAI.model, stream: false, think: false, format: "json", options: { temperature: 0.05, num_predict: 1600 } }
    : { model: ctx.CONFIG.localAI.model || "local-model", temperature: 0.05 };
  let lastError = null;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const messages = attempt === 0
        ? baseMessages
        : [...baseMessages, {
            role: "user",
            content: `The previous response was invalid or incomplete. Fix it and return a complete JSON object only. Required employee IDs: ${compact.branches.flatMap(branch => branch.assignments.map(item => item.employeeId)).filter(Boolean).join(", ") || "none"}. Required assignment IDs: ${compact.branches.flatMap(branch => branch.assignments.map(item => item.id)).join(", ") || "none"}. Required note IDs: ${compact.notes.map(note => note.id).join(", ") || "none"}.`
          }];
      const request = { ...requestBase, messages };
      try {
        const response = await fetch(ctx.CONFIG.localAI.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request)
        });
        if (!response.ok) throw new Error("لم يستجب نموذج الذكاء الاصطناعي");
        let payload;
        try {
          payload = await response.json();
        } catch {
          payload = await response.text();
        }
        const parsed = validateTranslationShape(parseTranslationResponse(payload));
        if (parsed) return parsed;
        lastError = new Error("استجابة الترجمة ليست بصيغة صالحة");
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("تعذرت الترجمة");
      }
    }
    throw lastError || new Error("استجابة الترجمة ليست بصيغة صالحة");
  } finally {
  }
}

function pdfPage(language){
  const english=language==="en",translation=schedule.translation||{},time=english?formatEnglishTime:formatTime,employeeName=id=>translation.employeeNames?.[id]||firstName(employeeById(id)?.fullName),leaveNotes=leaveNotesForDay();
  const leaveMarkup=leaveNotes.map(({employee,leave})=>`<article class="pdf-note leave-note"><b>${english?esc(employeeName(employee.id)):esc(firstName(employee.fullName))}:</b><p>${english?englishLeaveTypeLabel(leave):leaveTypeLabel(leave)}</p></article>`).join("");
  const noteMarkup=notes().map(note=>`<article class="pdf-note"><b>${note.general?(english?"General":"عام"):(english?esc(employeeName(note.employeeId)):esc(firstName(employeeById(note.employeeId)?.fullName)))}:</b><p>${english?esc(translation.notes?.[note.id]||note.text):esc(note.text)}</p></article>`).join("");
  return`<section class="pdf-page ${english?"english":"arabic"}" dir="${english?"ltr":"rtl"}"><div class="pdf-sheet"><header>${documentLogos()}<h1>${english?esc(translation.title||`Branch Schedule — ${schedule.dayName} ${displayDate(activeDay.date)}`):`جدول دوام الأفرع ${schedule.dayName} ${displayDate(activeDay.date)}`}</h1></header>${BRANCHES.map(branch=>`<div class="pdf-branch" style="--branch:${branch.color}"><h2>${english?esc(translation.branchNames?.[branch.id]||branch.name):branch.name}</h2><div>${assignments().filter(item=>item.branchId===branch.id).map(item=>{const breakMinutes=Math.max(0,Number(item.breakMinutes||0));return`<article><b>${english?esc(employeeName(item.employeeId)):esc(firstName(employeeById(item.employeeId)?.fullName))}</b><span>${time(item.from)} — ${time(item.to)}</span>${breakMinutes?`<small class="pdf-break">${english?`Break: ${formatHours(breakMinutes)} min`:`بريك: ${formatHours(breakMinutes)} دقيقة`}</small>`:""}<p>${english?(translation.tasks?.[item.id]||item.tasks).map(esc).join(" + "):item.tasks.map(esc).join(" + ")}</p></article>`;}).join("")||`<p class="pdf-empty">${english?"No assignments":"لا يوجد دوام"}</p>`}</div></div>`).join("")}<footer class="pdf-notes"><h3>${english?"Notes":"الملاحظات"}</h3><div>${leaveMarkup||noteMarkup?`${leaveMarkup}${noteMarkup}`:`<p class="pdf-empty">${english?"No notes":"لا توجد ملاحظات"}</p>`}</div></footer></div></section>`;
}
async function downloadPdf(){if(!schedule.translation){ctx.showToast("لا يمكن تحميل PDF حتى تكتمل الترجمة.");return;}const root=$("#pdf-render-root");root.innerHTML=pdfPage("ar")+pdfPage("en");const pages=[...root.querySelectorAll(".pdf-page")],{jsPDF}=window.jspdf,pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});for(let index=0;index<pages.length;index++){const canvas=await window.html2canvas(pages[index],{scale:2,backgroundColor:"#ffffff",useCORS:true});if(index)pdf.addPage("a4","landscape");pdf.addImage(canvas.toDataURL("image/png"),"PNG",0,0,297,210);}pdf.save(`جدول دوام الأفرع يوم ${schedule.dayName} تاريخ ${displayDate(activeDay.date)}.pdf`);root.innerHTML="";}
