import { isStrong } from "@/components/auth/PasswordRules";

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?[0-9 ./-]{6,20}$/;
const CF_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;
const ODD = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
const val = (c) => (/\d/.test(c) ? +c : c.charCodeAt(0) - 65);

export const cfError = (raw) => {
  const v = (raw || "").trim().toUpperCase();
  if (!v) return "Inserisca il codice fiscale";
  if (v.length !== 16) return `Il codice fiscale ha 16 caratteri (ne ha inseriti ${v.length})`;
  if (!CF_RE.test(v)) return "Formato del codice fiscale non valido";
  const sum = [...v.slice(0, 15)].reduce((s, c, i) => s + (i % 2 === 0 ? ODD[val(c)] : val(c)), 0);
  return String.fromCharCode(65 + (sum % 26)) === v[15] ? "" : "Codice fiscale non valido: l'ultimo carattere non corrisponde";
};

const min = (n, label) => (v) => ((v || "").trim().length >= n ? "" : `${label}: almeno ${n} caratteri`);

export const VALIDATORS = {
  first_name: min(2, "Nome"),
  last_name: min(2, "Cognome"),
  specialty: min(2, "Specializzazione"),
  order_number: min(2, "Numero di iscrizione"),
  studio_address: min(5, "Indirizzo"),
  email: (v) => (!(v || "").trim() ? "Inserisca l'email" : EMAIL_RE.test(v.trim()) ? "" : "Formato email non valido (es. nome@dominio.it)"),
  phone: (v) => (PHONE_RE.test((v || "").trim()) ? "" : "Numero di telefono non valido"),
  child_fiscal_code: cfError,
  password: (v) => (isStrong(v || "") ? "" : "La password non rispetta tutti i requisiti"),
};

export const serverFieldErrors = (err) => {
  const status = err?.response?.status;
  const d = err?.response?.data?.detail;
  if (status === 409) return { email: typeof d === "string" ? d : "Email già registrata" };
  if (!Array.isArray(d)) return null;
  const out = {};
  d.forEach((x) => { const k = x?.loc?.[x.loc.length - 1]; if (typeof k === "string" && x?.msg) out[k] = x.msg.replace(/^Value error, /, ""); });
  return Object.keys(out).length ? out : null;
};
