export const CONFIG = {
  firebase: {
    apiKey: "AIzaSyC5aYsmT1qUJd5D8GVh5WlIlLeiT35t8WQ",
    authDomain: "hrpro-f80e7.firebaseapp.com",
    databaseURL: "https://hrpro-f80e7-default-rtdb.firebaseio.com",
    projectId: "hrpro-f80e7",
    storageBucket: "hrpro-f80e7.firebasestorage.app",
    messagingSenderId: "999134303706",
    appId: "1:999134303706:web:a9f0b7bacb6ba796f55ce3",
    measurementId: "G-JFC4SPKXDK"
  },
  n8n: {
    employeeMessagesEnabled: false,
    loginOtpUrl: "https://burke-whereas-beginning-adding.trycloudflare.com/webhook/hrms-login-otp",
    verifyOtpUrl: "https://burke-whereas-beginning-adding.trycloudflare.com/webhook/hrms-verify-otp",
    scheduleTranslationUrl: "https://hearing-simpson-nyc-surprising.trycloudflare.com/webhook/hrms-schedule-translate",
    scheduleWhatsappUrl: "",
    emailOtpUrl: "",
    whatsappSignupOtpUrl: ""
  },
  localAI: {
    provider: "ollama",
    // Permanent VPS endpoint. Do not replace this with a temporary loca.lt
    // or Cloudflare tunnel address: those stop working when the local device
    // disconnects.
    url: "https://162-35-27-249.sslip.io/api/chat",
    model: "qwen3.5:9b"
  }
};
