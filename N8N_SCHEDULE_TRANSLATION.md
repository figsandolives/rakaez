# ترجمة المهام والملاحظات عبر n8n

ضع رابط Webhook الإنتاجي في `config.js` داخل `CONFIG.n8n.scheduleTranslationUrl`، مثلاً:

```js
scheduleTranslationUrl: "https://your-n8n.example/webhook/hrms-schedule-translate",
```

الـworkflow الموجود حالياً في n8n يعمل بهذا التسلسل:

1. **Webhook**: طريقة `POST` والمسار `hrms-schedule-translate`، مع تفعيل CORS للنطاق الذي يستضيف موقعك.
2. **HTTP Request**: يرسل الطلب إلى Ollama المحلي على `http://host.docker.internal:11434/api/chat` باستخدام النموذج `qwen3.5:9b`.
3. يعيد n8n رد Ollama كما هو؛ الموقع يقرأ `message.content` ويستخرج الترجمة منه.

```json
{
  "ok": true,
  "translations": [
    { "id": "0", "translation": "Shelf arrangement from 10:30 AM to 12:30 PM" }
  ]
}
```

الطلب الذي يرسله الموقع يحتوي `items`، وكل عنصر يحتوي `id` و`text`. يجب أن يعيد النموذج ترجمة لكل `id` بدون حذف أي عنصر. الموقع لا يضع مهلة اصطناعية على الطلب؛ يظهر شريط تقدم ووقت متبقٍ تقريبي فقط.

بعد تفعيل الـworkflow انسخ رابط **Production URL**، وليس رابط الاختبار، إلى `config.js` ثم انشر ملفات الموقع.
