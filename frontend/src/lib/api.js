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
  updateConsultation: (id, note) => http.patch(`/consultations/${id}`, { note }).then((r) => r.data),
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
  cancelRequest: (id) => http.post(`/portal/appointment-requests/${id}/cancel`).then((r) => r.data),
  cancellations: () => http.get("/appointments/cancellations").then(list),
  getSchedule: () => http.get("/settings/schedule").then((r) => r.data),
  saveSchedule: (b) => http.put("/settings/schedule", b).then((r) => r.data),
  downloadReport: async (id) => saveBlob(await http.get(`/consultations/${id}/pdf`, { responseType: "blob" }), "Referto.pdf"),
  portalReport: async (id) => saveBlob(await http.get(`/portal/reports/${id}/pdf`, { responseType: "blob" }), "Referto.pdf"),
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
