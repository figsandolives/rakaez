# ركائز HRMS — نسخة GitHub Pages

هذه نسخة ثابتة تعمل مباشرة من `index.html` ولا تحتاج Node.js على الاستضافة.

## النشر على GitHub Pages

1. أنشئ مستودعاً جديداً في GitHub.
2. ارفع جميع الملفات الظاهرة معاً إلى جذر المستودع؛ لا توجد مجلدات داخل المشروع.
3. افتح Settings ثم Pages.
4. اختر Deploy from a branch، ثم `main` والمجلد `/root`.
5. احفظ الإعدادات وانتظر ظهور الرابط.

## مهم

- أضف رابط GitHub Pages إلى Firebase Authentication > Authorized domains.
- روابط n8n موجودة في `config.js`.
- يجب أن يعمل Docker وn8n وCloudflare Tunnel على جهازك لكي تصل رموز واتساب.
- لا ترفع كلمات مرور أو مفاتيح سرية إلى المستودع.
