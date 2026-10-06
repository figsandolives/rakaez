import test from 'node:test';
import assert from 'node:assert/strict';
import {resolvePayrollPeriod,payrollWindows,monthDate,nextDate,buildPayrollLedger,payrollDay,payrollClock} from '../payroll.js';
const config={startDate:'2026-09-27',endDate:'2026-10-23'};
test('period expires after its last day and resumes the following day',()=>{
 assert.equal(resolvePayrollPeriod(config,'2026-10-23').active,true);
 assert.deepEqual(resolvePayrollPeriod(config,'2026-10-24'),{start:'2026-10-24',end:'',active:false});
 assert.equal(resolvePayrollPeriod({},'2026-10-06').active,false);
});
test('pinned periods roll across months and retain end day after February',()=>{
 const p=resolvePayrollPeriod({...config,fixed:true},'2026-12-02');assert.equal(p.start,'2026-11-24');assert.equal(p.end,'2026-12-23');
 const feb=resolvePayrollPeriod({startDate:'2027-01-01',endDate:'2027-01-31',fixed:true,endDay:31},'2027-02-02');assert.equal(feb.end,'2027-02-28');assert.equal(payrollWindows(feb)[1].end,'2027-03-31');
 assert.equal(monthDate('2028-01-31'),'2028-02-29');assert.equal(nextDate('2026-12-31'),'2027-01-01');
});
const source=()=>({schedules:{'2026-10-05':{assignments:{a:{id:'a',employeeId:'john',from:'07:30',to:'15:30',branchId:'abu_al_hasaniya',breakMinutes:30},b:{id:'b',employeeId:'john',from:'15:30',to:'20:00',branchId:'hawalli'}}}},attendance:{}});
const stamp=t=>Date.parse(`2026-10-05T${t}:00+03:00`);
test('absence is counted per completed shift and excludes scheduled break',()=>{
 const before=buildPayrollLedger(source(),[{id:'john'}],stamp('19:00'));assert.equal(before.length,1);assert.equal(before[0].minutes,450);
 const after=buildPayrollLedger(source(),[{id:'john'}],stamp('21:00'));assert.equal(after.length,2);assert.equal(after.reduce((n,r)=>n+r.minutes,0),720);
});
test('late arrival and orphan checkout do not become total absence',()=>{
 const s=source();s.attendance={'2026-10-05':{john:{in:{type:'checkIn',timestamp:stamp('07:45')},out:{type:'checkOut',timestamp:stamp('15:30')}}}};
 let records=buildPayrollLedger(s,[{id:'john'}],stamp('21:00'));assert.equal(records.find(r=>r.type.startsWith('تأخير')).minutes,15);assert.equal(records.find(r=>r.type.startsWith('غياب')).minutes,270);
 delete s.attendance['2026-10-05'].john.in;records=buildPayrollLedger(s,[{id:'john'}],stamp('21:00'));assert.equal(records.length,1);assert.equal(records[0].branch,'حولي');
});
test('books and attendance penalties retain distinct stable IDs and exact fils',()=>{
 const s={books:[{id:'book',employeeId:'john',date:'2026-10-05',amount:'5.250',bookNumber:'DED-2026-0001'}],penalties:{'2026-10-05':{alert:{employeeId:'john',amountFils:250,reason:'عدم القيام ببصمة دخول في فرع حولي بتاريخ 05/10/2026'}}}};
 const rows=buildPayrollLedger(s,[{id:'john'}]);assert.equal(rows.reduce((n,r)=>n+r.amountFils,0),5500);assert.equal(new Set(rows.map(r=>r.id)).size,2);assert.equal(rows.find(r=>r.id.startsWith('penalty')).type,'بصمة حضور مفقودة من فرع حولي');
});

test('Arabic weekday and twelve-hour shift display',()=>{assert.equal(payrollDay('2026-10-01'),'الخميس');assert.equal(payrollClock('00:00'),'12:00 صباحًا');assert.equal(payrollClock('12:30'),'12:30 مساءً');assert.equal(payrollClock('23:00'),'11:00 مساءً');});

test('ten-minute grace waives small delays but counts entire delay once exceeded',()=>{for(const [arrival,expected] of [['07:39',0],['07:40',0],['07:41',11],['07:45',15]]){const s=source();delete s.schedules['2026-10-05'].assignments.b;s.attendance={'2026-10-05':{john:{in:{type:'checkIn',timestamp:stamp(arrival)}}}};const rows=buildPayrollLedger(s,[{id:'john'}],stamp('21:00'));assert.equal(rows.reduce((n,r)=>n+r.minutes,0),expected,arrival);}});
