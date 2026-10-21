export const MIC_KEY = "mantmed-mic";
export const savedMic = () => localStorage.getItem(MIC_KEY) || "";
export const micConstraints = (id = savedMic()) => ({ audio: id ? { deviceId: { ideal: id } } : true });

export const micError = (e) => {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "Il browser non consente il microfono su questa pagina: apra MantMed in una scheda sicura (https) o usi la trascrizione manuale";
  if (e?.name === "TimeoutError") return "Nessuna risposta alla richiesta del microfono: consenta l'accesso dall'icona nella barra degli indirizzi e riprovi";
  if (e?.name === "NotAllowedError" || e?.name === "SecurityError") return window.self !== window.top
    ? "Accesso al microfono bloccato in questa anteprima: apra MantMed in una nuova scheda del browser e riprovi"
    : "Accesso al microfono negato: lo consenta dall'icona del lucchetto nella barra degli indirizzi e riprovi";
  if (e?.name === "NotFoundError" || e?.name === "OverconstrainedError") return "Nessun microfono trovato: colleghi un microfono o usi la trascrizione manuale";
  if (e?.name === "NotReadableError") return "Il microfono è usato da un'altra applicazione: la chiuda e riprovi";
  return "Microfono non disponibile: consenta l'accesso o usi la trascrizione manuale";
};
