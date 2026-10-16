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
  downloadReport: async (id) => {
    const r = await http.get(`/consultations/${id}/pdf`, { responseType: "blob" });
    const name = /filename="([^"]+)"/.exec(r.headers["content-disposition"] ?? "")?.[1] ?? "Referto.pdf";
    const url = URL.createObjectURL(r.data);
    const a = Object.assign(document.createElement("a"), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

export const CLINICS = ["Studio Centro", "Studio Provincia"];

export const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg).filter(Boolean).join(" ") || "Dati non validi";
  return "Operazione non riuscita";
};
