import { CONFIG } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAuth, browserLocalPersistence, setPersistence, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import { getDatabase, ref, get, set, push, onValue } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-storage.js";

const app = initializeApp(CONFIG.firebase);
const auth = getAuth(app);
const db = getDatabase(app);
const storage = getStorage(app);
const $ = (selector) => document.querySelector(selector);
const state = { user: null, demo: false, page: "employees", employees: [], entities: ["الإدارة العامة", "فرع العاصمة", "فرع الأحمدي"], search: "", pendingLogin: null, pendingSignup: null, authMode: "login", registrationInProgress: false };

const nav = [
  ["employees", "الموظفين", "♟"], ["general", "كتاب عام", "▤"], ["deduction", "كتاب خصم", "◫"],
  ["warning", "كتاب تنبيه", "⚠"], ["notice", "كتاب لفت نظر", "!"], ["decisions", "قرارات وتعميمات إدارية", "▧"],
  ["schedules", "جدول الدوامات", "▦"], ["attendance", "تقرير البصمة", "◎"], ["notifications", "إشعارات", "♢"],
  ["reminders", "تذكيرات", "◷"], ["entities", "جهات العمل", "▥"], ["add", "إدراج موظف", "+"], ["settings", "إعدادات", "⚙"]
];

const samples = [
  { id:"s1", fullName:"نورة خالد العتيبي", jobTitle:"رئيسة الموارد البشرية", workEntity:"الإدارة العامة", dailyHours:8, scheduleType:"fixed" },
  { id:"s2", fullName:"أحمد يوسف الشمري", jobTitle:"أخصائي شؤون موظفين", workEntity:"فرع العاصمة", dailyHours:8, scheduleType:"variable" },
  { id:"s3", fullName:"مريم عبدالعزيز القطان", jobTitle:"محاسبة رواتب", workEntity:"الإدارة العامة", dailyHours:7, scheduleType:"fixed" }
];

const digits = (value="") => String(value).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
const initials = (name="") => name.split(" ").slice(0,2).map(x => x[0] || "").join("");
const escapeHtml = (value="") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const showToast = (message) => { const el = $("#toast"); el.innerHTML = `<i>✓</i><div><b>تمت العملية بنجاح</b><p>${escapeHtml(message)}</p></div>`; el.classList.remove("hidden"); setTimeout(() => el.classList.add("hidden"), 3500); };
const showError = (message) => { const el = $("#form-message"); if (el) { el.textContent = message; el.className = "form-message error"; } };

async function initialize() {
  await setPersistence(auth, browserLocalPersistence);
  onAuthStateChanged(auth, user => {
    state.user = user;
    $("#loading").classList.add("hidden");
    if (state.registrationInProgress) return;
    if (user || state.demo) openDashboard(); else openAuth(state.authMode);
  });
}

function openAuth(mode="login") {
  $("#dashboard").classList.add("hidden"); $("#auth-page").classList.remove("hidden");
  renderAuth(mode);
}

function renderAuth(mode="login") {
  state.authMode = mode;
  const card = $("#auth-card");
  if (mode === "otp" && state.pendingLogin) {
    card.innerHTML = `<div class="auth-heading"><span>◈</span><h2>تحقق من واتساب</h2><p>أرسلنا رمزاً إلى الرقم المنتهي بـ ${state.pendingLogin.phone.slice(-4)}</p></div>
      <form id="otp-form"><label>رمز الدخول<input id="login-code" class="otp-input" inputmode="numeric" maxlength="6" placeholder="— — — — — —" autofocus required></label><p id="form-message" class="form-message">صلاحية الرمز 5 دقائق.</p><button class="primary wide">تحقق وادخل للنظام</button></form><button id="back-login" class="text-btn wide">العودة إلى تسجيل الدخول</button>`;
    $("#otp-form").onsubmit = verifyLoginOtp; $("#back-login").onclick = () => { state.pendingLogin = null; renderAuth("login"); };
    return;
  }
  if (mode === "signup-otp" && state.pendingSignup) {
    card.innerHTML = `<div class="auth-heading"><span>◈</span><h2>تحقق من رقم واتساب</h2><p>أرسلنا رمزاً إلى الرقم المنتهي بـ ${state.pendingSignup.phone.slice(-4)}</p></div>
      <form id="signup-otp-form"><label>رمز التحقق<input id="signup-code" class="otp-input" inputmode="numeric" maxlength="6" placeholder="— — — — — —" autofocus required></label><p id="form-message" class="form-message">بعد التحقق سنرسل رابط تفعيل إلى بريدك الإلكتروني.</p><button class="primary wide">تحقق وأنشئ الحساب</button></form><button id="back-register" class="text-btn wide">العودة إلى بيانات الحساب</button>`;
    $("#signup-otp-form").onsubmit = verifySignupOtp; $("#back-register").onclick = () => renderAuth("register"); return;
  }
  if (mode === "email-sent" && state.pendingSignup) {
    card.innerHTML = `<div class="auth-heading success-heading"><span>✓</span><h2>تم إنشاء الحساب</h2><p>أرسلنا رابط تفعيل البريد إلى<br><b>${escapeHtml(state.pendingSignup.email)}</b></p></div><div class="verification-note"><b>الخطوة الأخيرة</b><p>افتح الرسالة واضغط رابط التفعيل، ثم ارجع وسجّل الدخول. تحقق أيضاً من مجلد الرسائل غير المرغوب فيها.</p></div><button id="go-login" class="primary wide">الانتقال إلى تسجيل الدخول</button>`;
    $("#go-login").onclick = () => { state.pendingSignup = null; renderAuth("login"); }; return;
  }
  if (mode === "register") {
    card.innerHTML = `<div class="auth-heading"><span>♙</span><h2>إنشاء حساب المنشأة</h2><p>تحقق مزدوج عبر البريد وواتساب</p></div>
      <form id="register-form"><label>البريد الإلكتروني<input id="reg-email" type="email" autocomplete="email" required></label><label>رقم الهاتف الكويتي<div class="phone"><span>🇰🇼 +965</span><input id="reg-phone" inputmode="numeric" autocomplete="tel" maxlength="8" required></div></label><label>كلمة المرور<input id="reg-password" type="password" autocomplete="new-password" minlength="6" required></label><button class="primary wide">إرسال رمز واتساب</button><p id="form-message" class="form-message">سيصلك رمز على واتساب، وبعده رابط تفعيل على بريدك.</p></form><button id="back-login" class="text-btn wide">لدي حساب بالفعل</button>`;
    $("#register-form").onsubmit = requestSignup; $("#back-login").onclick = () => renderAuth("login"); return;
  }
  card.innerHTML = `<div class="auth-heading"><span>✓</span><h2>مرحباً بعودتك</h2><p>سجّل الدخول للمتابعة إلى لوحة الموارد البشرية</p></div>
    <form id="login-form"><label>البريد الإلكتروني أو رقم الهاتف<input id="identifier" placeholder="name@company.com أو 5XXXXXXX" required></label><label>رمز المرور<input id="password" type="password" placeholder="اكتب رمز المرور" autofocus required></label><p id="form-message" class="form-message hidden"></p><button class="primary wide">دخول آمن ←</button></form><div class="divider"><span>حساب جديد</span></div><button id="register-btn" class="secondary wide">＋ إنشاء حساب</button><button id="demo-btn" class="text-btn wide">معاينة النظام بدون تسجيل</button><small class="secure-note">🔒 جلسة دخول مشفّرة ومحفوظة على هذا الجهاز</small>`;
  $("#login-form").onsubmit = beginLogin; $("#register-btn").onclick = () => renderAuth("register"); $("#demo-btn").onclick = () => { state.demo = true; state.employees = samples; openDashboard(); };
}

async function resolveEmail(identifier) {
  if (identifier.includes("@")) return identifier.trim();
  const phone = digits(identifier).replace(/\D/g, "").slice(-8);
  const snap = await get(ref(db, `phoneDirectory/${phone}`));
  if (!snap.exists()) throw new Error("لم يتم العثور على حساب بهذا الرقم");
  return snap.val().email;
}

async function beginLogin(event) {
  event.preventDefault(); const button = event.submitter; button.disabled = true; button.textContent = "جارٍ التحقق...";
  try {
    const identifier = $("#identifier").value; const password = $("#password").value; const email = await resolveEmail(identifier);
    const check = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${CONFIG.firebase.apiKey}`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({email,password,returnSecureToken:true}) });
    const identity = await check.json(); if (!check.ok) throw new Error("البريد أو رقم الهاتف أو كلمة المرور غير صحيحة");
    const profile = await fetch(`${CONFIG.firebase.databaseURL}/userProfiles/${identity.localId}.json?auth=${identity.idToken}`).then(r => r.json());
    if (profile?.requiresEmailVerification) {
      const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${CONFIG.firebase.apiKey}`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({idToken:identity.idToken}) }).then(r => r.json());
      if (!lookup.users?.[0]?.emailVerified) throw new Error("فعّل بريدك الإلكتروني من الرسالة التي أرسلناها، ثم حاول الدخول مرة أخرى");
    }
    const phone = String(profile?.phone || digits(identifier).replace(/\D/g,"")); if (phone.length < 8) throw new Error("لا يوجد رقم واتساب مسجل لهذا الحساب");
    const request = await fetch(CONFIG.n8n.loginOtpUrl, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({phone,email,purpose:"hrms_login"}) });
    const data = await request.json(); if (!request.ok || data.ok === false) throw new Error(data.message || "تعذر إرسال رمز الدخول");
    state.pendingLogin = { email, password, phone }; renderAuth("otp");
  } catch (error) { showError(error.message || "تعذر تسجيل الدخول"); button.disabled = false; button.textContent = "دخول آمن ←"; }
}

async function verifyLoginOtp(event) {
  event.preventDefault(); const code = digits($("#login-code").value).replace(/\D/g,""); const button = event.submitter; button.disabled = true;
  try {
    const verify = await fetch(CONFIG.n8n.verifyOtpUrl, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({phone:state.pendingLogin.phone,code,purpose:"hrms_login"}) });
    const data = await verify.json(); if (!verify.ok || !data.ok) throw new Error(data.message || "رمز الدخول غير صحيح");
    await signInWithEmailAndPassword(auth, state.pendingLogin.email, state.pendingLogin.password); state.pendingLogin = null;
  } catch (error) { showError(error.message); button.disabled = false; }
}

async function requestSignup(event) {
  event.preventDefault(); const button = event.submitter; button.disabled = true; button.textContent = "جارٍ إرسال الرمز...";
  try {
    const email = $("#reg-email").value.trim().toLowerCase();
    const phone = digits($("#reg-phone").value).replace(/\D/g, "");
    const password = $("#reg-password").value;
    if (!/^\d{8}$/.test(phone)) throw new Error("رقم الهاتف الكويتي يجب أن يتكون من 8 أرقام");
    if (password.length < 6) throw new Error("كلمة المرور يجب ألا تقل عن 6 خانات");
    const endpoint = CONFIG.n8n.whatsappSignupOtpUrl || CONFIG.n8n.loginOtpUrl;
    const request = await fetch(endpoint, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({phone:`965${phone}`,email,purpose:"hrms_signup"}) });
    const data = await request.json(); if (!request.ok || data.ok === false) throw new Error(data.message || "تعذر إرسال رمز واتساب");
    state.pendingSignup = { email, phone:`965${phone}`, localPhone:phone, password }; renderAuth("signup-otp");
  } catch (error) { showError(error.message || "تعذر بدء إنشاء الحساب"); button.disabled = false; button.textContent = "إرسال رمز واتساب"; }
}

async function verifySignupOtp(event) {
  event.preventDefault(); const button = event.submitter; button.disabled = true; button.textContent = "جارٍ إنشاء الحساب...";
  try {
    const code = digits($("#signup-code").value).replace(/\D/g, "");
    if (code.length !== 6) throw new Error("اكتب رمز التحقق المكوّن من 6 أرقام");
    const endpoint = CONFIG.n8n.whatsappSignupVerifyUrl || CONFIG.n8n.verifyOtpUrl;
    const verify = await fetch(endpoint, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({phone:state.pendingSignup.phone,code,purpose:"hrms_signup"}) });
    const data = await verify.json(); if (!verify.ok || !data.ok) throw new Error(data.message || "رمز التحقق غير صحيح");
    state.registrationInProgress = true;
    const credential = await createUserWithEmailAndPassword(auth, state.pendingSignup.email, state.pendingSignup.password);
    await Promise.all([
      set(ref(db, `userProfiles/${credential.user.uid}`), { email:state.pendingSignup.email, phone:state.pendingSignup.phone, localPhone:state.pendingSignup.localPhone, requiresEmailVerification:true, createdAt:Date.now() }),
      set(ref(db, `phoneDirectory/${state.pendingSignup.localPhone}`), { email:state.pendingSignup.email, uid:credential.user.uid })
    ]);
    await sendEmailVerification(credential.user);
    state.authMode = "email-sent";
    await signOut(auth);
    state.registrationInProgress = false;
    renderAuth("email-sent");
  } catch (error) {
    state.registrationInProgress = false;
    const messages = { "auth/email-already-in-use":"هذا البريد مسجل مسبقاً", "auth/invalid-email":"البريد الإلكتروني غير صحيح", "auth/weak-password":"كلمة المرور ضعيفة" };
    showError(messages[error.code] || error.message || "تعذر إنشاء الحساب"); button.disabled = false; button.textContent = "تحقق وأنشئ الحساب";
  }
}

function openDashboard() {
  $("#auth-page").classList.add("hidden"); $("#dashboard").classList.remove("hidden");
  const identity = state.user?.email || "وضع المعاينة"; $("#user-email").textContent = identity; $("#user-avatar").textContent = identity[0]?.toUpperCase() || "م"; $("#header-avatar").textContent = identity[0]?.toUpperCase() || "م";
  renderNav(); bindData(); renderPage();
}

function renderNav() {
  $("#side-nav").innerHTML = nav.map(([key,label,icon]) => `<button data-page="${key}" class="${state.page===key?"active":""}"><i>${icon}</i><span>${label}</span>${key==="notifications"?"<em>3</em>":""}</button>`).join("");
  $("#side-nav").querySelectorAll("button").forEach(button => button.onclick = () => { state.page = button.dataset.page; renderNav(); renderPage(); });
}

function bindData() {
  if (state.demo || !state.user || state.bound) return; state.bound = true;
  onValue(ref(db,"organizations/default/employees"), snap => { const value=snap.val()||{}; state.employees=Object.entries(value).map(([id,v])=>({id,...v})); renderPage(); });
  onValue(ref(db,"organizations/default/workEntities"), snap => { if(snap.exists()) state.entities=Object.values(snap.val()); renderPage(); });
}

function hero(title, subtitle, button="") { return `<section class="page-hero"><div><span class="eyebrow">قاعدة بيانات الموارد البشرية</span><h1>${title}</h1><p>${subtitle}</p></div>${button}</section>`; }

function renderPage() {
  const label = nav.find(x=>x[0]===state.page)?.[1] || "الموظفون"; $("#page-title").textContent=label;
  if(state.page==="employees") renderEmployees(); else if(state.page==="add") renderEmployeeForm(); else if(state.page==="entities") renderEntities(); else if(state.page==="schedules") renderSchedules(); else renderGeneric(label);
}

function renderEmployees() {
  const list=state.employees.filter(e=>[e.fullName,e.jobTitle,e.workEntity].some(v=>String(v||"").includes(state.search)));
  $("#page-content").innerHTML = `${hero("الموظفون","نظرة موحّدة على فريقك وبياناتهم ونظام دوامهم.",'<button id="add-employee" class="primary">＋ إدراج موظف</button>')}<div class="toolbar"><label class="search-box">⌕<input id="employee-search" placeholder="ابحث بالاسم أو المسمى أو جهة العمل"></label><div class="chips"><button class="active">الكل <span>${state.employees.length}</span></button><button>دوام ثابت</button><button>حسب الجدول</button></div></div><div class="employees-grid">${list.length?list.map(employeeCard).join(""):'<div class="empty"><b>لا توجد نتائج</b><p>أضف أول موظف أو غيّر عبارة البحث.</p></div>'}</div>`;
  $("#add-employee").onclick=()=>{state.page="add";renderNav();renderPage();}; $("#employee-search").oninput=e=>{state.search=e.target.value;renderEmployees();};
}

function employeeCard(e) { return `<article class="employee-card"><div class="card-cover"><span class="status ${e.scheduleType||"fixed"}"></span><div class="avatar">${e.photoUrl?`<img src="${escapeHtml(e.photoUrl)}" alt="">`:initials(e.fullName)}</div><button class="bell">♢<span><b>آخر الإشعارات</b><small>طلب تعديل بصمة</small><small>إجازة بانتظار الاعتماد</small></span></button></div><div class="employee-info"><h3>${escapeHtml(e.fullName)}</h3><p>${escapeHtml(e.jobTitle||"")}</p><div class="entity">▥ ${escapeHtml(e.workEntity||"")}</div><footer><span>◷ ${e.dailyHours||0} ساعات</span><em class="${e.scheduleType||"fixed"}">${e.scheduleType==="variable"?"حسب الجدول":"دوام ثابت"}</em></footer></div></article>`; }

function renderEmployeeForm() {
  $("#page-content").innerHTML=`${hero("إدراج موظف","أدخل البيانات الأساسية والتواصل ونظام الدوام.")}<form id="employee-form" class="employee-form"><section><div class="section-head"><span>01</span><div><h3>البيانات الأساسية</h3><p>الهوية الوظيفية والرسمية للموظف</p></div></div><label class="photo-upload"><input id="photo" type="file" accept="image/*"><span>▣</span><b>إدراج صورة عرض</b><small>PNG أو JPG</small></label><div class="form-grid"><label>الاسم الكامل *<input name="fullName" required></label><label>الرقم المدني *<input name="civilId" inputmode="numeric" required></label><label>الجنسية *<input name="nationality" value="الكويت" required></label><label>المسمى الوظيفي *<input name="jobTitle" required></label><label class="wide-field">جهة العمل *<select name="workEntity">${state.entities.map(e=>`<option>${escapeHtml(e)}</option>`).join("")}</select></label></div></section><section><div class="section-head"><span>02</span><div><h3>معلومات التواصل</h3><p>أرقام الموظف والأشخاص الأقرب إليه</p></div></div><div class="form-grid"><label>الهاتف الكويتي *<div class="phone"><span>🇰🇼 +965</span><input name="kuwaitPhone" maxlength="8" required></div></label><label>رقم الموظف الخاص<input name="personalPhone"></label><label>رقم قريب<input name="relativePhone"></label><label>نوع القرابة<input name="relation"></label></div></section><section><div class="section-head"><span>03</span><div><h3>ساعات العمل</h3><p>نظام الدوام وتوزيع المهام اليومية</p></div></div><div class="form-grid"><label>عدد الساعات<input name="dailyHours" type="number" min="1" max="24" value="8"></label><label>نظام الدوام<select name="scheduleType"><option value="fixed">ساعات عمل ثابتة</option><option value="variable">متغيرة حسب الجدول</option></select></label><label>من الساعة<input name="from" type="time" value="08:00"></label><label>إلى الساعة<input name="to" type="time" value="16:00"></label><label class="wide-field">مهام العمل<textarea name="tasks" rows="3" placeholder="افصل المهام بعلامة +"></textarea></label></div></section><button class="primary submit">＋ إضافة الموظف</button></form>`;
  $("#employee-form").onsubmit=saveEmployee;
}

async function saveEmployee(event) {
  event.preventDefault(); const button=event.submitter; button.disabled=true; button.textContent="جارٍ إدراج الموظف..."; const data=Object.fromEntries(new FormData(event.target)); const id=crypto.randomUUID(); let photoUrl="";
  try { const file=$("#photo").files[0]; if(file&&state.user){const target=storageRef(storage,`employee-photos/${state.user.uid}/${id}-${file.name}`);await uploadBytes(target,file);photoUrl=await getDownloadURL(target);} const record={...data,id,dailyHours:Number(data.dailyHours),photoUrl,segments:data.scheduleType==="fixed"?[{from:data.from,to:data.to,tasks:String(data.tasks||"").split("+").map(x=>x.trim()).filter(Boolean)}]:[],createdAt:Date.now()}; if(state.demo||!state.user)state.employees.unshift(record);else await set(ref(db,`organizations/default/employees/${id}`),record); showToast(`تم إدراج الموظف ${data.fullName}`);state.page="employees";renderNav();renderPage(); } catch(error){alert(error.message);} finally{button.disabled=false;}
}

function renderEntities() { $("#page-content").innerHTML=`${hero("جهات العمل","أنشئ الفروع والإدارات التي يُسند إليها الموظفون.",'<form id="entity-form" class="entity-form"><input id="entity-name" placeholder="اسم الإدارة أو الفرع"><button class="primary">＋ إضافة جهة</button></form>')}<div class="entities">${state.entities.map((e,i)=>`<article><i style="background:${["#0f766e","#c6923f","#2563eb"][i%3]}">▥</i><div><h3>${escapeHtml(e)}</h3><p>${4+i*3} موظفين</p></div></article>`).join("")}</div>`; $("#entity-form").onsubmit=async e=>{e.preventDefault();const name=$("#entity-name").value.trim();if(!name)return;state.entities.push(name);if(state.user&&!state.demo)await set(push(ref(db,"organizations/default/workEntities")),name);showToast(`تمت إضافة ${name}`);renderEntities();}; }

function renderSchedules(){const list=state.employees.filter(e=>e.scheduleType==="variable");$("#page-content").innerHTML=`${hero("جدول الدوامات","يظهر هنا الموظفون ذوو ساعات العمل المتغيرة فقط.")}<div class="schedule-list">${list.length?list.map(e=>`<article><span>${initials(e.fullName)}</span><div><b>${escapeHtml(e.fullName)}</b><small>${escapeHtml(e.workEntity||"")}</small></div><em>الأحد — الخميس</em><strong>08:00 — 16:00</strong></article>`).join(""):'<div class="empty"><b>لا يوجد موظفون بدوام متغير</b><p>اختر «متغيرة حسب الجدول» عند إدراج موظف.</p></div>'}</div>`;}

function renderGeneric(label){$("#page-content").innerHTML=`${hero(label,`مساحة منظمة لإنشاء ومراجعة واعتماد ${label}.`,'<button class="primary">＋ إنشاء جديد</button>')}<div class="kpis"><article><i>▤</i><div><small>إجمالي السجلات</small><b>24</b></div></article><article><i>◷</i><div><small>بانتظار الاعتماد</small><b>6</b></div></article><article><i>✓</i><div><small>مكتمل</small><b>18</b></div></article></div><div class="documents"><h3>أحدث السجلات</h3>${["اعتماد تحديث السياسات الداخلية","مراجعة بيانات الحضور الشهرية","تعميم تنظيم الإجازات"].map((x,i)=>`<div><i>▤</i><span><b>${x}</b><small>الإدارة العامة · منذ ${i+1} أيام</small></span><em>${i===1?"قيد المراجعة":"معتمد"}</em></div>`).join("")}</div>`;}

$("#logout-btn").onclick=async()=>{if(state.demo){state.demo=false;state.bound=false;openAuth();}else await signOut(auth);};
$("#global-search").oninput=e=>{state.search=e.target.value;if(state.page==="employees")renderEmployees();};
initialize().catch(error=>{ $("#loading").innerHTML=`<b>تعذر تشغيل النظام</b><p>${escapeHtml(error.message)}</p>`; });
