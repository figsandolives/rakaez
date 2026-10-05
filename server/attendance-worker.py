"""Maintain attendance states on the VPS independently of browser sessions."""
import json, time, os, urllib.request, urllib.parse, logging, threading
from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from concurrent.futures import ThreadPoolExecutor
BASE='https://hrpro-f80e7-default-rtdb.firebaseio.com'
KEY='AIzaSyC5aYsmT1qUJd5D8GVh5WlIlLeiT35t8WQ'
ROOT='organizations/default'
AUTH=Path(os.environ.get('ATTENDANCE_AUTH_FILE','/opt/rakaez/attendance-worker/auth.json'))
TZ=ZoneInfo('Asia/Kuwait')
WAKE=threading.Event()

def request(url, data=None, method=None):
    body=None if data is None else json.dumps(data,ensure_ascii=False).encode()
    req=urllib.request.Request(url,data=body,method=method,headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=25) as response:return json.load(response)

def token():
    auth=json.loads(AUTH.read_text())
    if time.time()-AUTH.stat().st_mtime>3000:
        data=urllib.parse.urlencode({'grant_type':'refresh_token','refresh_token':auth['refreshToken']}).encode()
        req=urllib.request.Request('https://securetoken.googleapis.com/v1/token?key='+KEY,data=data)
        with urllib.request.urlopen(req,timeout=25) as response:refreshed=json.load(response)
        auth.update(idToken=refreshed['id_token'],refreshToken=refreshed['refresh_token']);AUTH.write_text(json.dumps(auth));AUTH.chmod(0o600)
    return auth['idToken']

def db(path,auth,data=None,method=None,params=None):
    query={'auth':auth,**(params or {})}
    return request(BASE+'/'+path+'.json?'+urllib.parse.urlencode(query),data,method)

def values(data):return [x for x in (data if isinstance(data,list) else (data or {}).values()) if isinstance(x,dict)]

def pairs(events):
    result=[];checkin=None
    for event in sorted(events,key=lambda x:float(x.get('timestamp') or 0)):
        if event.get('type')=='checkIn':
            if checkin:result.append((checkin,None))
            checkin=event
        elif event.get('type')=='checkOut' and checkin:
            result.append((checkin,event));checkin=None
    if checkin:result.append((checkin,None))
    return result

def calculate(date,now,employees,schedule,attendance,legacy):
    employees={key:{**value,'id':key} for key,value in (employees or {}).items() if isinstance(value,dict)}
    grouped={key:values(value) for key,value in (attendance or {}).items()}
    for punch in values(legacy):
        employee=employees.get(str(punch.get('empId',''))) or next((e for e in employees.values() if e.get('fullName')==punch.get('empName')),None)
        if not employee:continue
        try:
            stamp=punch.get('iso') or date+'T'+(punch.get('timeExact') or punch.get('time') or '00:00')
            dt=datetime.fromisoformat(stamp.replace('Z','+00:00'))
            if not dt.tzinfo:dt=dt.replace(tzinfo=TZ)
            grouped.setdefault(employee['id'],[]).append({'type':'checkOut' if punch.get('type')=='out' else 'checkIn','timestamp':dt.timestamp()*1000})
        except (ValueError,TypeError):continue
    assignments=values((schedule or {}).get('assignments'));alerts={};states={}
    names={'hawalli':'حولي','surra':'حولي','abu_al_hasaniya':'أبو الحصانية','abulhasania':'أبو الحصانية','yarmouk':'اليرموك'}
    for employee_id in {a.get('employeeId') for a in assignments}:
        employee=employees.get(employee_id)
        if not employee:continue
        shifts=sorted([a for a in assignments if a.get('employeeId')==employee_id and a.get('from') and a.get('to')],key=lambda a:a['from'])
        punch_pairs=pairs(grouped.get(employee_id,[]))
        details=[{'time':f"من {a['from']} إلى {a['to']}",'branch':names.get(a.get('branchId'),a.get('branchName') or a.get('branchId') or '')} for a in shifts]
        for index,shift in enumerate(shifts):
            start=datetime.fromisoformat(date+'T'+shift['from']).replace(tzinfo=TZ);end=datetime.fromisoformat(date+'T'+shift['to']).replace(tzinfo=TZ)
            if end<=start:end+=timedelta(days=1)
            checkin,checkout=punch_pairs[index] if index<len(punch_pairs) else (None,None)
            branch=names.get(shift.get('branchId'),shift.get('branchName') or shift.get('branchId') or 'غير محدد')
            status={'employeeId':employee_id,'assignmentId':shift.get('id'),'checkIn':checkin,'checkOut':checkout,'from':shift['from'],'to':shift['to']}
            def add(kind,before,after,minutes=0):
                key=f'attendance-alert-{date}-{employee_id}-{kind}-{index}'
                alerts[key]={'id':key,'kind':kind,'before':before,'after':after,'employeeId':employee_id,'employeeName':employee.get('fullName') or 'موظف','minutes':minutes,'date':date,'branchId':shift.get('branchId') or '', 'branchName':branch,'shiftDetails':details}
            if checkin:
                late=max(0,int((float(checkin['timestamp'])/1000-start.timestamp())//60));status['arrival']='late' if late else 'present'
                if late:add('late','تأخر الموظف',f'عن الدوام في فرع {branch} {late} دقيقة.',late)
            else:
                status['arrival']='missing_checkin' if now>=start else 'pending'
                if now>=start:add('missing_checkin','لم يقم الموظف',f'ببصمة دخول في فرع {branch} إلى الآن.')
            if checkout:
                early=max(0,int((end.timestamp()-float(checkout['timestamp'])/1000)//60));status['departure']='early' if early else 'completed'
                if early:add('early','خرج الموظف',f'مبكراً من دوامه في فرع {branch} {early} دقيقة.',early)
            else:
                status['departure']='missing_checkout' if checkin and now>=end else 'pending'
                if checkin and now>=end:add('missing_checkout','لم يقم الموظف',f'ببصمة خروج في فرع {branch} إلى الآن.')
            states[f'{employee_id}-{index}']=status
    return {'date':date,'generatedAt':int(now.timestamp()*1000),'alerts':alerts,'states':states}

def watch_punches():
    while True:
        try:
            date=datetime.now(TZ).date().isoformat()
            url=BASE+'/'+ROOT+'/attendance/'+date+'.json?'+urllib.parse.urlencode({'auth':token()})
            req=urllib.request.Request(url,headers={'Accept':'text/event-stream'})
            with urllib.request.urlopen(req,timeout=65) as stream:
                for line in stream:
                    if datetime.now(TZ).date().isoformat()!=date:break
                    if line.startswith((b'event: put',b'event: patch')):WAKE.set()
        except Exception:time.sleep(3)

def run():
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(message)s')
    threading.Thread(target=watch_punches,daemon=True).start()
    last=''
    while True:
        try:
            auth=token();now=datetime.now(TZ);date=now.date().isoformat()
            calls=[('employees',None),(f'schedules/{date}',None),(f'attendance/{date}',None)]
            with ThreadPoolExecutor(max_workers=4) as pool:
                jobs=[pool.submit(db,ROOT+'/'+path,auth,params=params) for path,params in calls]
                old=pool.submit(db,'fingerprintPunches',auth,params={'orderBy':json.dumps('date'),'startAt':json.dumps(date),'endAt':json.dumps(date+'\uf8ff')})
                employees,schedule,attendance=[job.result() for job in jobs];legacy=old.result()
            result=calculate(date,datetime.now(TZ),employees,schedule,attendance,legacy)
            signature=json.dumps([date,result['alerts'],result['states']],sort_keys=True)
            if signature!=last or int(time.time())%60<15:
                db(ROOT+'/systemAttendanceAlerts/'+date,auth,result,'PUT');last=signature
            logging.info('Attendance synchronized: %s, %s alerts',date,len(result['alerts']))
        except Exception as error:logging.error('Attendance sync failed: %s',type(error).__name__)
        WAKE.wait(15);WAKE.clear()
if __name__=='__main__':run()
