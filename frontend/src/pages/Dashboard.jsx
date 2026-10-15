import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { TopBar } from "@/components/dash/TopBar";
import { Marquee } from "@/components/dash/Marquee";
import { Hero } from "@/components/dash/Hero";
import { Agenda } from "@/components/dash/Agenda";
import { WaitingList } from "@/components/dash/WaitingList";
import { ConsultHub } from "@/components/dash/ConsultHub";
import { RecentNotes } from "@/components/dash/RecentNotes";
import { ConsultationOverlay } from "@/components/dash/ConsultationOverlay";

const col = (d) => ({ initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.7, ease: [0.22, 1, 0.36, 1] } });

export default function Dashboard() {
  const [appointments, setAppointments] = useState([]);
  const [waiting, setWaiting] = useState([]);
  const [notes, setNotes] = useState([]);
  const [overlay, setOverlay] = useState({ open: false, patient: null, initial: null });

  const load = useCallback(() => {
    api.appointments().then(setAppointments).catch(() => {});
    api.waiting().then(setWaiting).catch(() => {});
    api.consultations().then(setNotes).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const next = waiting.find((w) => w.status === "in_studio") ?? waiting[0] ?? null;
  const centro = appointments.filter((a) => a.clinic === "Studio Centro").length;
  const provincia = appointments.length - centro;
  const ticker = [
    `Studio Centro · ${centro} visite`,
    `Studio Provincia · ${provincia} visite`,
    `${waiting.length} pazienti in sala d'attesa`,
    next ? `Prossimo: ${next.name}` : "Sala d'attesa libera",
    "Trascrizione AI attiva · Whisper",
    "Modello standard · Anamnesi · Esame obiettivo · Diagnosi · Terapia · Follow-up",
  ];

  const start = (patient) => setOverlay({ open: true, patient: patient ?? null, initial: null });

  return (
    <div className="min-h-screen overflow-x-clip bg-paper" data-testid="dashboard">
      <TopBar />
      <Marquee items={ticker} />
      <Hero total={appointments.length} waiting={waiting.length} />
      <main className="mx-auto grid max-w-[1440px] grid-cols-1 gap-5 px-5 pb-10 lg:grid-cols-12 lg:px-8">
        <motion.div {...col(0.35)} className="order-2 min-w-0 lg:order-1 lg:col-span-4"><Agenda appointments={appointments} onChange={load} /></motion.div>
        <motion.div {...col(0.45)} className="order-1 min-w-0 lg:order-2 lg:col-span-4"><ConsultHub next={next} onStart={start} /></motion.div>
        <motion.div {...col(0.55)} className="order-3 min-w-0 lg:col-span-4"><WaitingList waiting={waiting} onChange={load} onStart={start} /></motion.div>
      </main>
      <RecentNotes items={notes} onOpen={(c) => setOverlay({ open: true, patient: null, initial: c })} />
      <ConsultationOverlay
        open={overlay.open}
        patient={overlay.patient}
        initial={overlay.initial}
        waiting={waiting}
        onClose={() => setOverlay({ open: false, patient: null, initial: null })}
        onDone={load}
      />
    </div>
  );
}
