// Build past-day alerts when no saved end-of-day snapshot exists.
export function historicalSystemAlerts(date,source,employees,now=Date.now()){
 const names={hawalli:'حولي',surra:'حولي',abu_al_hasaniya:'أبو الحصانية',abulhasania:'أبو الحصانية',yarmouk:'اليرموك'};
 const alerts={},assignments=Object.values(source.schedule?.assignments||{}).filter(a=>a.employeeId&&a.from&&a.to);
 for(const employeeId of new Set(assignments.map(a=>a.employeeId))){
  const employee=employees.find(e=>e.id===employeeId);if(!employee)continue;
  const shifts=assignments.filter(a=>a.employeeId===employeeId).sort((a,b)=>a.from.localeCompare(b.from)),endOf=a=>{const start=Date.parse(`${date}T${a.from}:00+03:00`);let end=Date.parse(`${date}T${a.to}:00+03:00`);return end<=start?end+86400000:end;};
  const events=Object.values(source.attendance?.[employeeId]||{}).filter(Boolean);
  for(const p of Object.values(source.legacy||{})){if(String(p.empId)!==employeeId&&p.empName!==employee.fullName)continue;const stamp=Date.parse(p.iso||`${String(p.date||date).slice(0,10)}T${p.timeExact||p.time||'00:00'}+03:00`);if(Number.isFinite(stamp))events.push({timestamp:stamp,type:p.type==='out'?'checkOut':'checkIn'});}
  const buckets=shifts.map(()=>[]);for(const e of events){const stamp=Number(e.timestamp),branch=e.branchId||e.branchKey,candidates=shifts.map((a,i)=>({i,a,distance:Math.abs(stamp-(e.type==='checkOut'?endOf(a):Date.parse(`${date}T${a.from}:00+03:00`)))})).filter(c=>!branch||!c.a.branchId||(names[branch]||branch)===(names[c.a.branchId]||c.a.branchId));const c=candidates.sort((a,b)=>a.distance-b.distance)[0];if(c)buckets[c.i].push(e);}
  const shiftDetails=shifts.map(a=>({time:`من ${a.from} إلى ${a.to}`,branch:names[a.branchId]||a.branchName||a.branchId||'غير محدد'}));
  shifts.forEach((a,index)=>{const events=buckets[index].sort((x,y)=>Number(x.timestamp)-Number(y.timestamp)),checkIn=events.find(e=>e.type==='checkIn'),checkOut=events.filter(e=>e.type==='checkOut').at(-1),start=Date.parse(`${date}T${a.from}:00+03:00`),end=endOf(a),branch=shiftDetails[index].branch;
   const add=(kind,before,after,minutes=0)=>{const id=`attendance-alert-${date}-${employeeId}-${kind}-${index}`;alerts[id]={id,kind,before,after,minutes,date,employeeId,employeeName:employee.fullName,branchName:branch,shiftDetails};};
   if(!checkIn&&now>=start)add('missing_checkin','لم يقم الموظف',`ببصمة دخول في فرع ${branch} إلى الآن.`);else if(checkIn){const late=Math.max(0,Math.floor((Number(checkIn.timestamp)-start)/60000));if(late)add('late','تأخر الموظف',`عن الدوام في فرع ${branch} ${late} دقيقة.`,late);}
   if(!checkOut&&now>=end)add('missing_checkout','لم يقم الموظف',`ببصمة خروج في فرع ${branch} إلى الآن.`);else if(checkOut){const early=Math.max(0,Math.floor((end-Number(checkOut.timestamp))/60000));if(early)add('early','خرج الموظف',`مبكراً من دوامه في فرع ${branch} ${early} دقيقة.`,early);}
  });
 }
 return {date,alerts,generatedAt:now};
}
