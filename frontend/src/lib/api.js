import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const http = axios.create({ baseURL: `${BASE}/api`, withCredentials: true });

let refreshing = null;
http.interceptors.response.use(undefined, async (error) => {
  const cfg = error.config;
  if (error.response?.status !== 401 || cfg?._retry || cfg?.url?.startsWith("/auth/")) throw error;
  cfg._retry = true;
  refreshing = refreshing ?? http.post("/auth/refresh").finally(() => { refreshing = null; });
  try { await refreshing; } catch { window.dispatchEvent(new Event("auth:expired")); throw error; }
  return http(cfg);
});

const list = (r) => (Array.isArray(r?.data) ? r.data : []);

export const api = {
  me: () => http.get("/auth/me").then((r) => r.data),
  refresh: () => http.post("/auth/refresh").then((r) => r.data),
  login: (email, password) => http.post("/auth/login", { email, password }).then((r) => r.data),
  verify2fa: (mfa_token, code) => http.post("/auth/2fa/verify", { mfa_token, code }).then((r) => r.data),
  setup2fa: () => http.post("/auth/2fa/setup").then((r) => r.data),
  enable2fa: (code) => http.post("/auth/2fa/enable", { code }).then((r) => r.data),
  disable2fa: (password, code) => http.post("/auth/2fa/disable", { password, code }).then((r) => r.data),
  ping: () => http.post("/auth/ping").then((r) => r.data),
  logout: () => http.post("/auth/logout"),
  appointments: () => http.get("/appointments").then(list),
  addAppointment: (b) => http.post("/appointments", b).then((r) => r.data),
  updateAppointment: (id, b) => http.patch(`/appointments/${id}`, b).then((r) => r.data),
  deleteAppointment: (id) => http.delete(`/appointments/${id}`),
  waiting: () => http.get("/waiting").then(list),
  addWaiting: (b) => http.post("/waiting", b).then((r) => r.data),
  updateWaiting: (id, b) => http.patch(`/waiting/${id}`, b).then((r) => r.data),
  deleteWaiting: (id) => http.delete(`/waiting/${id}`),
  consultations: () => http.get("/consultations").then(list),
  patientConsultations: (patient_id) => http.get("/consultations", { params: { patient_id } }).then(list),
  patients: () => http.get("/patients").then(list),
  addPatient: (b) => http.post("/patients", b).then((r) => r.data),
  updatePatient: (id, b) => http.patch(`/patients/${id}`, b).then((r) => r.data),
  passport: (id) => http.get(`/patients/${id}/passport`).then((r) => r.data),
  addMeasurement: (id, b) => http.post(`/patients/${id}/measurements`, b).then((r) => r.data),
  percentiles: (params) => http.get("/growth/percentiles", { params }).then((r) => r.data),
  curves: (params) => http.get("/growth/curves", { params }).then(list),
  checkpointTemplate: (id) => http.get(`/patients/${id}/checkpoint`).then((r) => r.data),
  submitCheckpoint: (id, b) => http.post(`/patients/${id}/checkpoints`, b).then((r) => r.data),
  transcribe: (blob) => {
    const fd = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", blob, `consultazione.${ext}`);
    return http.post("/consultations/transcribe", fd).then((r) => r.data?.transcript ?? "");
  },
  createConsultation: (b) => http.post("/consultations", b).then((r) => r.data),
  // Elaborazione asincrona: crea la visita "in elaborazione" e avvia Whisper + IA sul server
  startConsultation: (meta, blob) => {
    const fd = new FormData();
    Object.entries(meta).forEach(([k, v]) => { if (v !== null && v !== undefined) fd.append(k, String(v)); });
    if (blob) {
      const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      fd.append("audio", blob, `consultazione.${ext}`);
    }
    return http.post("/consultations/start", fd).then((r) => r.data);
  },
  uploadAudioPart: (blob, i) => {
    const fd = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", blob, `parte-${i + 1}.${ext}`);
    return http.post("/consultations/audio-parts", fd).then((r) => r.data.part_id);
  },
  visitTemplates: () => http.get("/visit-templates").then(list),
  visitTemplateBase: () => http.get("/visit-templates/base").then((r) => r.data),
  createVisitTemplate: (b) => http.post("/visit-templates", b).then((r) => r.data),
  saveVisitTemplate: (id, b) => http.put(`/visit-templates/${id}`, b).then((r) => r.data),
  deleteVisitTemplate: (id) => http.delete(`/visit-templates/${id}`).then((r) => r.data),
  regenerateSummary: (id) => http.post(`/consultations/${id}/summary`).then((r) => r.data.riepilogo),
  search: (q, signal) => http.get("/search", { params: { q }, signal }).then((r) => r.data),
  getConsultation: (id) => http.get(`/consultations/${id}`).then((r) => r.data),
  retryConsultation: (id, transcript = "") => http.post(`/consultations/${id}/retry`, { transcript }).then((r) => r.data),
  updateConsultation: (id, note, growthOnly = false) => http.patch(`/consultations/${id}`, { note, growth_only: growthOnly }).then((r) => r.data),
  sendReport: (id) => http.post(`/consultations/${id}/send-report`).then((r) => r.data),
  payments: (params) => http.get("/payments", { params }).then((r) => ({ items: Array.isArray(r.data?.items) ? r.data.items : [], summary: r.data?.summary ?? null, today: r.data?.today })),
  addPayment: (b) => http.post("/payments", b).then((r) => r.data),
  deletePayment: (id) => http.delete(`/payments/${id}`),
  exportPayments: async (params) => saveBlob(await http.get("/payments/export", { params, responseType: "blob" }), "Registro_cassa.csv"),
  sendFeedback: (b) => http.post("/beta/feedback", b).then((r) => r.data),
  betaMetrics: () => http.get("/beta/metrics").then((r) => r.data),
  sendLead: (b) => http.post("/public/leads", b).then((r) => r.data),
  leads: () => http.get("/admin/leads").then(list),
  updateLead: (id, b) => http.patch(`/admin/leads/${id}`, b).then((r) => r.data),
  testDataPreview: () => http.get("/admin/test-data").then((r) => r.data),
  purgeTestData: (owner_ids) => http.post("/admin/test-data/purge", { owner_ids }).then((r) => r.data),
  adminDoctors: () => http.get("/admin/doctors").then(list),
  setDoctorStatus: (id, status) => http.post(`/admin/doctors/${id}/status`, { status }).then((r) => r.data),
  registerStart: (b) => http.post("/register/start", b).then((r) => r.data),
  registerVerify: (b) => http.post("/register/verify", b).then((r) => r.data),
  portalMe: () => http.get("/portal/me").then((r) => r.data),
  portalAddChild: (fiscal_code) => http.post("/portal/children", { fiscal_code }).then((r) => r.data),
  publishToPortal: (id, published) => http.post(`/consultations/${id}/portal`, { published }).then((r) => r.data),
  upcoming: () => http.get("/appointments/upcoming").then(list),
  apptRequests: () => http.get("/appointment-requests").then(list),
  confirmRequest: (id, b) => http.post(`/appointment-requests/${id}/confirm`, b).then((r) => r.data),
  declineRequest: (id, reason) => http.post(`/appointment-requests/${id}/decline`, { reason }).then((r) => r.data),
  invitePortal: (pid) => http.post(`/patients/${pid}/invite`).then((r) => r.data),
  inviteInfo: (token) => http.get(`/register/invite/${encodeURIComponent(token)}`).then((r) => r.data),
  portalRequest: (b) => http.post("/portal/appointment-requests", b).then((r) => r.data),
  portalSlots: (params) => http.get("/portal/slots", { params }).then((r) => r.data),
  cancelAppointment: (id, reason) => http.post(`/portal/appointments/${id}/cancel`, { reason }).then((r) => r.data),
  portalCheckout: (b) => http.post("/portal/checkout", b).then((r) => r.data),
  checkoutStatus: (sid) => http.get(`/portal/checkout/${encodeURIComponent(sid)}`).then((r) => r.data),
  abandonCheckout: (rid) => http.post(`/portal/checkout/abandon/${encodeURIComponent(rid)}`).then((r) => r.data),
  portalReceipt: async (id) => saveBlob(await http.get(`/portal/receipts/${id}/pdf`, { responseType: "blob" }), "Ricevuta.pdf"),
  doctorReceipt: async (id) => saveBlob(await http.get(`/payments/${id}/receipt`, { responseType: "blob" }), "Ricevuta.pdf"),
  saveTour: (completed) => http.post("/onboarding/tour", { completed }).then((r) => r.data),
  createDoctor: (b) => http.post("/admin/doctors", { ...b, origin_url: window.location.origin }).then((r) => r.data),
  resendDoctorInvite: (id) => http.post(`/admin/doctors/${id}/invite`).then((r) => r.data),
  setDoctorNetwork: (id, in_network) => http.post(`/admin/doctors/${id}/network`, { in_network }).then((r) => r.data),
  activateInfo: (token) => http.get(`/register/activate/${encodeURIComponent(token)}`).then((r) => r.data),
  activate: (b) => http.post("/register/activate", b).then((r) => r.data),
  portalNetwork: () => http.get("/portal/network").then(list),
  sharing: () => http.get("/portal/sharing").then((r) => ({ items: Array.isArray(r.data?.items) ? r.data.items : [], text: r.data?.text ?? "", version: r.data?.version ?? "" })),
  createShare: (b) => http.post("/portal/sharing", b).then((r) => r.data),
  // Firma elettronica e documenti firmati
  signTemplate: () => http.get("/signatures/template").then((r) => r.data),
  signConsent: (b) => http.post("/signatures", b).then((r) => r.data),
  patientDocuments: (pid) => http.get(`/patients/${pid}/documents`).then(list),
  documentPdf: async (id) => saveBlob(await http.get(`/documents/${id}/pdf`, { responseType: "blob" }), "Documento_firmato.pdf"),
  consentForm: async (pid, params) => saveBlob(await http.get(`/patients/${pid}/consent-form.pdf`, { params, responseType: "blob" }), "Modulo_consenso.pdf"),
  doctorSignature: () => http.get("/settings/signature").then((r) => r.data),
  saveDoctorSignature: (image) => http.put("/settings/signature", { image }).then((r) => r.data),
  deleteDoctorSignature: () => http.delete("/settings/signature").then((r) => r.data),
  portalSignTemplate: (patient_id) => http.get("/portal/signatures/template", { params: { patient_id } }).then((r) => r.data),
  portalSignConsent: (b) => http.post("/portal/signatures", b).then((r) => r.data),
  portalDocumentPdf: async (id) => saveBlob(await http.get(`/portal/documents/${id}/pdf`, { responseType: "blob" }), "Documento_firmato.pdf"),
  verifyDocument: (sha256) => http.post("/public/verify", { sha256 }).then((r) => r.data),
  revokeShare: (id) => http.post(`/portal/sharing/${id}/revoke`).then((r) => r.data),
  patientNetwork: (pid) => http.get(`/patients/${pid}/network`).then((r) => ({ consent: r.data?.consent ?? null, specialists: Array.isArray(r.data?.specialists) ? r.data.specialists : [] })),
  sharedReport: async (pid, cid) => saveBlob(await http.get(`/patients/${pid}/network/reports/${cid}/pdf`, { responseType: "blob" }), "Referto.pdf"),
  cancelRequest: (id) => http.post(`/portal/appointment-requests/${id}/cancel`).then((r) => r.data),
  cancellations: () => http.get("/appointments/cancellations").then(list),
  getSchedule: () => http.get("/settings/schedule").then((r) => r.data),
  saveSchedule: (b) => http.put("/settings/schedule", b).then((r) => r.data),
  downloadReport: async (id) => saveBlob(await http.get(`/consultations/${id}/pdf`, { responseType: "blob" }), "Referto.pdf"),
  portalReport: async (id) => saveBlob(await http.get(`/portal/reports/${id}/pdf`, { responseType: "blob" }), "Referto.pdf"),
  portalThreads: () => http.get("/portal/threads").then(list),
  portalThread: (id) => http.get(`/portal/threads/${id}`).then((r) => r.data),
  portalNewThread: (b) => http.post("/portal/threads", b).then((r) => r.data),
  portalReply: (id, body) => http.post(`/portal/threads/${id}/messages`, { body }).then((r) => r.data),
  notifications: () => http.get("/portal/notifications").then((r) => ({ items: Array.isArray(r.data?.items) ? r.data.items : [], unread: r.data?.unread ?? 0, messages_unread: r.data?.messages_unread ?? 0 })),
  readNotifications: (ids) => http.post("/portal/notifications/read", ids ? { ids } : {}).then((r) => r.data),
  msgSummary: () => http.get("/messages/summary").then((r) => r.data?.unread ?? 0),
  msgThreads: () => http.get("/messages/threads").then(list),
  msgThread: (id) => http.get(`/messages/threads/${id}`).then((r) => r.data),
  msgReply: (id, body) => http.post(`/messages/threads/${id}/messages`, { body }).then((r) => r.data),
  forgotPassword: (identifier) => http.post("/auth/password/forgot", { identifier }).then((r) => r.data),
  resetInfo: (token) => http.get(`/auth/password/reset/${encodeURIComponent(token)}`).then((r) => r.data),
  resetPassword: (token, password) => http.post("/auth/password/reset", { token, password }).then((r) => r.data),
  changePassword: (current_password, new_password) => http.post("/auth/password/change", { current_password, new_password }).then((r) => r.data),
  account: () => http.get("/account").then((r) => r.data),
  saveParentProfile: (b) => http.put("/account/profile/parent", b).then((r) => r.data),
  saveDoctorProfile: (b) => http.put("/account/profile/doctor", b).then((r) => r.data),
  changeEmail: (email, password) => http.put("/account/email", { email, password }).then((r) => r.data),
  saveNotifyPrefs: (prefs) => http.put("/account/notifications", { prefs }).then((r) => r.data?.prefs ?? {}),
  sessions: () => http.get("/account/sessions").then(list),
  endSession: (id) => http.delete(`/account/sessions/${id}`).then((r) => r.data),
  closeOtherSessions: () => http.post("/account/sessions/close-others").then((r) => r.data),
  addAbsence: (b) => http.post("/account/absences", b).then(list),
  deleteAbsence: (id) => http.delete(`/account/absences/${id}`).then(list),
  exportMyData: async () => saveBlob(await http.get("/account/export", { responseType: "blob" }), "MantMed_miei_dati.json"),
  deleteAccount: (password, reason) => http.post("/account/delete", { password, reason }).then((r) => r.data),
  getBodychart: (cid) => http.get(`/consultations/${cid}/bodychart`).then((r) => r.data ?? null),
  saveBodychart: (cid, b) => http.put(`/consultations/${cid}/bodychart`, b).then((r) => r.data),
  patientBodycharts: (pid) => http.get(`/patients/${pid}/bodycharts`).then(list),
  bodychart: (id) => http.get(`/bodycharts/${id}`).then((r) => r.data),
  portalBodychart: (cid) => http.get(`/portal/reports/${cid}/bodychart`).then((r) => r.data),
  sendPortalFeedback: (b) => http.post("/portal/feedback", b).then((r) => r.data),
};

const saveBlob = (r, fallback) => {
  const name = /filename="([^"]+)"/.exec(r.headers["content-disposition"] ?? "")?.[1] ?? fallback;
  const url = URL.createObjectURL(r.data);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const eur = (v) => (Number(v) || 0).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export const CLINICS = ["Studio Centro", "Studio Provincia"];
export const CLINIC_ADDR = {};
export const setClinics = (list) => {
  const items = Array.isArray(list) && list.length ? list : [{ name: "Studio principale", address: "" }];
  CLINICS.splice(0, CLINICS.length, ...items.map((c) => c.name));
  Object.keys(CLINIC_ADDR).forEach((k) => delete CLINIC_ADDR[k]);
  items.forEach((c) => { CLINIC_ADDR[c.name] = c.address ?? ""; });
};

export const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" ") || "Dati non validi";
  return "Operazione non riuscita";
};
