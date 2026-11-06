import { useEffect, useState } from "react";
import { api } from "@/lib/api";

let cache = null;
export const loadModules = () => {
  cache = cache ?? api.specialtyModules().catch((e) => { cache = null; throw e; });
  return cache;
};
export const useModules = () => {
  const [cat, setCat] = useState(null);
  useEffect(() => { let alive = true; loadModules().then((c) => alive && setCat(c)).catch(() => {}); return () => { alive = false; }; }, []);
  return cat;
};

export const STRUCTURED = ["cardiologia", "dermatologia", "ginecologia", "oftalmologia"];
export const MODULE_NAMES = { pediatria: "Pediatria", cardiologia: "Cardiologia", dermatologia: "Dermatologia", ginecologia: "Ginecologia", oftalmologia: "Oftalmologia", generale: "Generale" };
export const isStructured = (note) => STRUCTURED.includes(note?.modulo?.id);
export const moduleOf = (cat, note) => cat?.moduli?.find((m) => m.id === note?.modulo?.id);

const ordered = (fields, note) => {
  const order = note?.modulo?.ordine ?? [];
  const pos = (f, i) => (order.includes(f.key) ? order.indexOf(f.key) : order.length + i);
  return fields.map((f, i) => [f, pos(f, i)]).sort((a, b) => a[1] - b[1]).map(([f]) => f);
};
const hasValue = (v) => (typeof v === "string" ? Boolean(v.trim()) : Array.isArray(v) ? v.some(hasValue) : v && typeof v === "object" ? Object.entries(v).some(([k, x]) => k !== "verifica" && hasValue(x)) : v != null && v !== false);
// Campi del modulo visibili per un gruppo: ordine e campi nascosti della personalizzazione salvata nella visita
export const visibleFields = (mod, note, gruppo) => ordered((mod?.campi ?? []).filter((f) => f.gruppo === gruppo), note)
  .filter((f) => !(note?.modulo?.nascosti ?? []).includes(f.key) || hasValue(note?.modulo?.campi?.[f.key]));

const B = (key, label, hint = "") => [key, label, hint];
export const structuredTabs = (mod, note) => {
  const tabs = [
    { id: "anamnesi", label: "Anamnesi", group: "anamnesi", fields: [B("anamnesi_fisiologica", "Anamnesi", "Patologica remota e prossima, familiarità"), B("allergie", "Allergie e intolleranze", "Come riferite"), B("farmaci_in_uso", "Farmaci in uso", "Come riferiti")], mgroup: "anamnesi" },
    { id: "motivo", label: "Motivo e sintomi", group: "sintomi", fields: [B("motivo_visita", "Motivo della visita"), B("sintomi", "Sintomi")] },
    { id: "parametri", label: "Parametri", group: "parametri_vitali", fields: [], mgroup: "parametri" },
    { id: "esame", label: "Esame obiettivo", group: "esame_obiettivo", fields: [B("esame_obiettivo", "Esame obiettivo generale (condizioni generali)")], mgroup: "esame_obiettivo" },
    { id: "esami", label: mod?.gruppi?.esami ?? "Esami", group: null, fields: [], mgroup: "esami" },
    { id: "terapia", label: "Diagnosi e terapia", group: "altro", fields: [B("diagnosi", "Diagnosi"), B("terapia", "Terapia e indicazioni", "Farmaci come prescritti"), B("follow_up", "Follow-up")], mgroup: "piano" },
  ].filter((t) => t.fields.length || visibleFields(mod, note, t.mgroup).length);
  return tabs.map((t, i) => ({ ...t, n: String(i + 1).padStart(2, "0") }));
};

const r1 = (n) => String(Math.round(n * 10) / 10).replace(".", ",");
// Note "occhio non specificato" ancora aperte: bloccano la firma
export const openEyeNotes = (mod, note) => (mod?.campi ?? []).filter((f) => f.tipo === "occhi" && String(note?.modulo?.campi?.[f.key]?.nota ?? "").trim()).map((f) => f.label);
export const valueText = (f, v) => {
  if (f.tipo === "numero") return v?.v == null ? "" : `${r1(v.v)}${f.unita ? ` ${f.unita}` : ""}${v.note ? ` · ${v.note}` : ""}`;
  if (f.tipo === "pressione") return (v ?? []).filter((x) => x.sis != null || x.dia != null).map((x) => `${x.sis ?? "—"}/${x.dia ?? "—"} mmHg${x.note ? ` · ${x.note}` : ""}`).join("; ");
  if (f.tipo === "occhi") {
    const side = (e) => (f.sub ?? []).filter((x) => String(v?.[e]?.[x.k] ?? "").trim()).map((x) => `${x.label} ${v[e][x.k]}`.trim()).join(" · ");
    return [...["od", "os"].filter(side).map((e) => `${e.toUpperCase()}: ${side(e)}`), ...(v?.nota?.trim() ? [`Occhio non specificato: ${v.nota}`] : [])].join(" | ");
  }
  if (f.tipo === "terapia_occhi") return (v ?? []).map((x) => [x.farmaco, x.occhio || "occhio non indicato", x.posologia].filter(Boolean).join(" · ")).join("; ");
  if (f.tipo === "data" && v) return new Date(`${v}T12:00:00`).toLocaleDateString("it-IT");
  return String(v ?? "").trim();
};

export const structuredText = (c, note, mod) => {
  const line = (l, v) => (String(v ?? "").trim() ? `${l}: ${v}` : null);
  const mrows = (g) => visibleFields(mod, note, g).map((f) => line(f.label, valueText(f, note.modulo?.campi?.[f.key])));
  const sez = (g) => (note.sezioni ?? []).filter((x) => x.gruppo === g && !x.da_verificare).map((x) => line(x.titolo, x.testo));
  return [`${c.patient_name} — ${new Date(c.created_at).toLocaleString("it-IT")} · ${mod?.nome ?? note.specialita}`,
    ...structuredTabs(mod, note).map((t) => {
      const rows = [...t.fields.map(([k, l]) => line(l, note[k])), ...(t.mgroup ? mrows(t.mgroup) : []), ...(t.group ? sez(t.group) : []), ...(t.id === "terapia" ? sez("altre_voci") : [])].filter(Boolean);
      return rows.length ? `${t.label.toUpperCase()}\n${rows.join("\n")}` : null;
    })].filter(Boolean).join("\n\n");
};
