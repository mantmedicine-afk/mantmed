import os
os.chdir('/app/frontend/src')
def ed(p, pairs):
    s=open(p).read()
    for a,b in pairs:
        assert a in s, (p,a[:70]); s=s.replace(a,b)
    open(p,'w').write(s)
ed('components/oggi/Panels.jsx',[
('import { FolderOpen,','import { FileUp, FolderOpen,'),
('export const Summary = ({ visits, done, toSign, unread, requests, onVisits, onSign, onMessages }) => (','export const Summary = ({ visits, done, toSign, unread, requests, fse, onVisits, onSign, onMessages, onFse }) => ('),
('''    <Stat i={5} id="messages" icon={MessagesSquare} value={unread} label="Messaggi da leggere" sub={requests > 0 ? `+ ${requests} richieste dal portale` : null} onClick={onMessages} />''','''    <Stat i={5} id="messages" icon={MessagesSquare} value={unread} label="Messaggi da leggere" sub={requests > 0 ? `+ ${requests} richieste dal portale` : null} onClick={onMessages} />
    {fse && <Stat i={6} id="fse" icon={FileUp} value={fse.count} label="Referti FSE da inviare"
      sub={fse.next_deadline ? `scadenza più vicina ${new Date(fse.next_deadline).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}` : fse.count ? null : "tutto inviato"} onClick={onFse} />}'''),
])
ed('components/oggi/OggiScreen.jsx',[
('  const [booking, setBooking] = useState(null);\n','') if False else ('  const [selected, setSelected] = useState(null);\n','  const [selected, setSelected] = useState(null);\n  const [fse, setFse] = useState(null);\n  useEffect(() => { api.fsePending().then(setFse).catch(() => setFse(null)); }, [appointments]);\n'),
('import { CLINICS } from "@/lib/api";','import { CLINICS, api } from "@/lib/api";'),
('            onMessages={() => nav("/app/messaggi")} />','            onMessages={() => nav("/app/messaggi")} fse={fse} onFse={() => nav("/app/pazienti?vista=visite")} />'),
])
print('ok')
