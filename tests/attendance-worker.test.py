import unittest,importlib.util,tempfile,json
from pathlib import Path
from datetime import datetime,timedelta
s=importlib.util.spec_from_file_location('worker',Path(__file__).parents[1]/'server/attendance-worker.py');w=importlib.util.module_from_spec(s);s.loader.exec_module(w)
class WorkerTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();w.CLOSING_STATE=Path(self.tmp.name)/'closing.json';self.records={};self.notifications={};self.writes=[]
  self.employees={'john':{'fullName':'جون'}};self.schedule={'assignments':{'a':{'id':'a','employeeId':'john','from':'08:00','to':'12:00','branchId':'hawalli'},'b':{'id':'b','employeeId':'john','from':'13:00','to':'17:00','branchId':'abu_al_hasaniya'}}};self.attendance={}
  def db(path,auth,data=None,method=None,params=None):
   if path.endswith('/schedules/2026-10-08'):return self.schedule
   if path.endswith('/attendance/2026-10-08'):return self.attendance
   if path=='fingerprintPunches':return {}
   if path.startswith(w.ROOT+'/employeeNotifications/'):
    if method=='PUT':self.notifications[path]=data
    return self.notifications.get(path)
   if method=='PUT':self.writes.append((path,data))
   return None
  def claim(path,auth,record):
   if path in self.records:return self.records[path],False
   self.records[path]=record;return record,True
  w.db=db;w.claim_record=claim
  w.load_closing_state(datetime(2026,10,8,14,tzinfo=w.TZ))
 def tearDown(self):self.tmp.cleanup()
 def test_midnight_four_missing_and_idempotent(self):
  w.close_due_days('test',datetime(2026,10,8,23,59,tzinfo=w.TZ),self.employees);self.assertEqual(len(self.records),0)
  w.close_due_days('test',datetime(2026,10,9,0,0,tzinfo=w.TZ),self.employees);self.assertEqual(len(self.records),4);self.assertEqual(len(self.notifications),4);self.assertEqual(sum(r['amountFils'] for r in self.records.values()),1000)
  w.close_due_days('test',datetime(2026,10,9,0,1,tzinfo=w.TZ),self.employees);self.assertEqual(len(self.notifications),4)
 def test_manual_charge_not_duplicated(self):
  key=w.ROOT+'/attendanceDeductions/2026-10-08/attendance-alert-2026-10-08-john-missing_checkin-0';self.records[key]={'automatic':False}
  w.close_due_days('test',datetime(2026,10,9,0,tzinfo=w.TZ),self.employees);self.assertEqual(len(self.records),4);self.assertEqual(len(self.notifications),3)
 def test_checkout_before_midnight_resolves_missing(self):
  self.attendance={'john':{'in':{'type':'checkIn','branchId':'hawalli','timestamp':datetime(2026,10,8,8,tzinfo=w.TZ).timestamp()*1000},'out':{'type':'checkOut','branchId':'hawalli','timestamp':datetime(2026,10,8,12,30,tzinfo=w.TZ).timestamp()*1000}}}
  w.close_due_days('test',datetime(2026,10,9,0,tzinfo=w.TZ),self.employees);self.assertEqual(len(self.records),2)
 def test_overnight_not_premature_and_recovered(self):
  self.schedule={'assignments':{'a':{'id':'a','employeeId':'john','from':'20:00','to':'02:00','branchId':'hawalli'}}}
  w.close_due_days('test',datetime(2026,10,9,0,tzinfo=w.TZ),self.employees);self.assertEqual(len(self.records),1);self.assertTrue(w.load_closing_state(datetime.now(w.TZ))['pendingOvernight'])
  w.close_due_days('test',datetime(2026,10,9,2,1,tzinfo=w.TZ),self.employees);self.assertEqual(len(self.records),2);self.assertFalse(w.load_closing_state(datetime.now(w.TZ))['pendingOvernight'])
 def test_cutoff_ignores_after_midnight_punch_for_day_close(self):
  self.attendance={'john':{'out':{'type':'checkOut','branchId':'hawalli','timestamp':datetime(2026,10,9,0,15,tzinfo=w.TZ).timestamp()*1000}}}
  w.close_due_days('test',datetime(2026,10,9,1,tzinfo=w.TZ),self.employees);self.assertEqual(len(self.records),4)
 def test_exact_midnight_wakeup(self):self.assertAlmostEqual(w.midnight_wait(datetime(2026,10,8,23,59,58,tzinfo=w.TZ)),2)
if __name__=='__main__':unittest.main()
