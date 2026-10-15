import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;
export const http = axios.create({ baseURL: `${BASE}/api` });

const list = (r) => (Array.isArray(r?.data) ? r.data : []);

export const api = {
  appointments: () => http.get("/appointments").then(list),
  addAppointment: (b) => http.post("/appointments", b).then((r) => r.data),
  updateAppointment: (id, b) => http.patch(`/appointments/${id}`, b).then((r) => r.data),
  deleteAppointment: (id) => http.delete(`/appointments/${id}`),
  waiting: () => http.get("/waiting").then(list),
  addWaiting: (b) => http.post("/waiting", b).then((r) => r.data),
  updateWaiting: (id, b) => http.patch(`/waiting/${id}`, b).then((r) => r.data),
  deleteWaiting: (id) => http.delete(`/waiting/${id}`),
  consultations: () => http.get("/consultations").then(list),
  transcribe: (blob) => {
    const fd = new FormData();
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    fd.append("audio", blob, `consultazione.${ext}`);
    return http.post("/consultations/transcribe", fd).then((r) => r.data?.transcript ?? "");
  },
  createConsultation: (b) => http.post("/consultations", b).then((r) => r.data),
  updateConsultation: (id, note) => http.patch(`/consultations/${id}`, { note }).then((r) => r.data),
};

export const CLINICS = ["Studio Centro", "Studio Provincia"];

export const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));

export const errMsg = (e) => e?.response?.data?.detail || "Operazione non riuscita";
