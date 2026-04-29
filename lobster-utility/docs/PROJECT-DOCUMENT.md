# LOBSTER UTILITY — Documento di Progetto Completo

**Versione:** 2.0 (Rewrite per Vibe-Coders)  
**Data:** 12 Aprile 2026  
**Autore:** Lorenzo Stillittano + Claude AI  
**Stato:** Visione Completamente Riconsiderata  

---

## 1. Executive Summary: Cos'è Davvero Lobster Utility

**Lobster Utility NON è uno strumento per sviluppatori.**

È un **assistente intelligente per creatori non-tecnici che costruiscono software usando l'AI** (vibe-coding con Claude, Cursor, o altri LLM). È il cockpit amichevole che traduce tutta la complessità tecnica (porte, Docker, terminali, PID, processi) in concetti semplici e visivi che un essere umano può capire in un secondo.

Pensa a Lobster come il **"cervello del tuo laboratorio di AI"**: sa dove girano i tuoi progetti, come stanno di salute, che cosa sta succedendo quando qualcosa va male, e come sistemare i problemi. Non devi essere un DevOps engineer per usarlo. Devi solo sapere che vuoi costruire qualcosa.

**Il Problema Fondamentale:**
- L'AI ti aiuta a scrivere codice fantastico.
- Ma nessuno ti aiuta a **gestire ciò che stai facendo girare**.
- Apri 7-8 progetti su Desktop, avvii terminali ovunque, container Docker si avviano/fermano, porti si scontrano, e improvvisamente non sai più cosa sta girando, dove, o perché ha smesso di funzionare.

**La Soluzione Lobster Utility:**
Guarda una sola finestra. Vedi tutti i tuoi progetti, ciascuno con un semaforo:
- 🟢 Verde = "Va tutto bene, torna a programmare"
- 🟡 Giallo = "Qualcosa merita attenzione, ma non è critico"
- 🔴 Rosso = "Hai un problema, e ti dico esattamente cosa è"

Clicca sul progetto. Vedi di cosa ha bisogno. Un click per riavviare il database, un click per liberare una porta, un click per capire perché il container è crashato. E se non capisci? Chiedi a Lobster. Risponde in italiano naturale, senza gergo tecnico.

**Target User: "Il Vibe-Coder"**
- Costruisce software con Claude/Cursor/AI, non è un ingegnere dei sistemi
- Capisce cosa vuole fare, sa come usare un terminale seguendo istruzioni AI
- Non sa (e non vuole sapere) come funzionano i port binding, il docker-compose, i PID, gli indirizzi TCP
- Ha 4-8 progetti che girano contemporaneamente e perde il filo di cosa sta dove

---

## 2. Il Problema: Lo Sviluppatore Non-Tecnico nel 2026

### 2.1 L'Era della Vibe-Coding

Nel 2026, un nuovo tipo di sviluppatore è emerso. Non hanno studiato Computer Science in università. Non hanno 10 anni di esperienza DevOps. Ma hanno accesso a Claude, Cursor, o altri LLM potenti. E con quell'accesso, stanno costruendo cose **reali e complesse**.

Possono chiedere: "Voglio un'app che fa X usando Y con architettura Z", e l'AI risponde con codice, configurazioni, istruzioni passo-passo. Non capiscono cosa significhi ogni singola riga. Non sanno perché certi file vanno in certe cartelle. Ma **funziona**.

Il problema? Quando funziona, va benissimo. Quando non funziona... nessuno li ha insegnato come debuggare al livello di infrastruttura.

### 2.2 Il Divario Infrastrutturale

L'AI può aiutarti a scrivere il codice, ma:

- **L'AI non gestisce le tue porte.** Se chiedi "Avvia il server frontend", e il progetto è configurato per girar su porta 3000, ma qualcos'altro usa già la porta 3000... sei fregato. L'AI non sa quale processo sta usando quella porta, e tu non sai come scoprirlo senza aprire Terminal e digitare comandi oscuri.

- **L'AI non monitora i tuoi container.** Se il tuo database Docker non parte, l'AI potrebbe dirti "controlla il docker log", ma tu non sai come vederlo. E anche se lo vedi, il messaggio di errore è tecnico e incomprensibile.

- **L'AI non traccia lo stato complessivo.** Hai 5 progetti che corrono. Uno ha fatto crash il database. Un altro sta consumando 8GB di RAM. Un terzo non sta più rispondendo. Come scopri quale è quale senza passare da progetto a progetto in Terminal?

- **L'AI non sa quale progetto sta su quale terminale.** Lorenzo ha 7 finestre Terminal.app aperte. Quale è Urban Leaf? Quale è LobsterCode? Quale è Decision Lab? Quando fa crash uno, dovrebbe cercare in 7 finestre.

### 2.3 Il Caso Specifico: Il Laboratorio di Lorenzo

Lorenzo è il vibe-coder perfetto. Ha sul Desktop:
- **Urban Leaf** — FastAPI + Python + 8 container Docker (database, cache, API, worker...)
- **LobsterCode** — React frontend + TypeScript
- **Decision Lab** — Un laboratorio di ricerca con Ollama integrato
- **Super Sapiens LLM** — Progetto ML
- **DAMM Framework** — Architettura di system design
- **Claw Code** — Terminal app Electron
- **5 progetti di contenuto** — Romanzo, articoli, ricerche

Tutti questi hanno porte diverse (o dovrebbero). Tutti potrebbero avere container Docker. Tutti potrebbero stare su terminali diversi. Quando avvia il suo flusso di lavoro mattutino:

1. Apre VS Code (per scrivere codice con Claude)
2. Apre 3-4 terminali in Terminal.app per avviare i server locali
3. Apre Docker Desktop per gestire i container (visione confusa di cosa sta girando dove)
4. Spesso dimentica di avviare un progetto, scopre a metà sessione che il backend non è online
5. Quando qualcosa crasha, deve passare in rassegna le finestre e i log per capire cosa è successo
6. Le porte conflitto non sono rare: "Perché il server frontend non si avvia? Oh, già sto girando un progetto diverso sulla 3000..."

**Quanto tempo perde ogni giorno?** 10-15 minuti solo in gestione operativa.

### 2.4 Perché lo Strumento Tradizionale Fallisce

I tool tradizionali per devops (Kubernetes dashboard, Docker CLI, htop, Activity Monitor) sono costruiti per ingegneri che:
- Capiscono cosa sia un port, un PID, un container, uno stack
- Conoscono jargon tecnico e sanno interpretare i numeri
- Hanno studiato le cose o hanno esperienza nel settore

Lorenzo no. Ha una visione del progetto, non una visione dell'infrastruttura. Quando apre Activity Monitor, vede una lista di processi con numeri e nomi oscuri. Non capisce cosa significhi "Process 12345 on tcp:*:8000". Vuole sapere: "Il mio Urban Leaf funziona? Sì o no? E se no, perché?"

Ecco perché Lobster Utility esiste per **traduire** la complessità tecnica in semafori, suggerimenti intelligenti, e azioni one-click.

---

## 3. Vision: Il Cockpit del Vibe-Coder

### 3.1 Principio Fondamentale

**Lobster Utility è il "gemello di stato" del tuo ecosistema di sviluppo.**

Conosce:
- Quali progetti esistono (auto-discovery + custom config)
- Quali processi stanno girando e quale progetto possiede ogni processo
- Quali porte sono occupate da quale progetto
- Quale container è sano, quale crashato, quale rallentato
- Quando un progetto è stato avviato/stoppato l'ultima volta
- Se c'è un pattern di crash ripetuti o memory leak

E ti racconta tutto questo **in italiano naturale, senza tecnicismi**, con azioni immediate disponibili.

### 3.2 I Cinque Pilastri

#### Pilastro 1: Visibilità Istantanea
**Una finestra, tutto ciò che serve sapere.**

Apri Lobster Utility. Vedi una griglia di card, uno per ogni progetto. Ogni card ha:
- **Nome del progetto e icona** (personalizzabile o auto-rilevata)
- **Un semaforo** (🟢 🟡 🔴) che riassume la salute complessiva
- **Una riga di testo leggibile** che spiega lo stato in italiano: "Urban Leaf gira bene, 8 container sani, memoria OK, ultimi commit 2 ore fa"
- **Timestamp** di quando è stato fatto l'ultimo controllo

Tutto in meno di 2 secondi di scansione.

#### Pilastro 2: Intelligenza Umano-Centrica
**La tecnologia traduce se stessa per te.**

Ogni informazione tecnica è resa umana:
- Non: "TCP *:8000 LISTEN, PID 12345, process 'python'"
- Sì: "Urban Leaf gira su porta 8000 (server API)"

- Non: "Container exited with code 137"
- Sì: "Il database di Urban Leaf si è fermato per mancanza di memoria. Il container chiede 4GB ma il tuo Mac ne ha disponibili solo 2GB."

- Non: "Port 3000 already in use"
- Sì: "⚠️ Due progetti vogliono usare la porta 3000! LobsterCode (frontend) e DecisionLab (web interface) entrambi configurati su 3000. Quale vuoi avviare?"

#### Pilastro 3: AI-Powered Assistance
**Ollama Integration per spiegazioni intelligenti e azioni suggerite.**

Lobster Utility è connesso a Ollama (che Lorenzo già usa in LobsterCode). Quando qualcosa va male:

- Container crashes? Lobster legge il log, lo passa a Ollama, riceve una spiegazione umana e suggerimenti per sistemare.
- Errore nel terminale? Lobster cattura l'output, lo fa analizzare a Ollama, suggerisce il fix.
- Domanda naturale ("Perché il mio progetto è lentissimo?")? Lobster analizza CPU, memoria, I/O, e risponde con ipotesi e test da fare.

Fallback intelligente: se Ollama non è disponibile, Lobster usa logica built-in per i problemi comuni.

#### Pilastro 4: One-Click Everything
**Nessuna azione dovrebbe richiedere più di un click.**

Vuoi avviare il database? Un click su "Riavvia Urban Leaf". Lobster sa quale container è il database, lo restarta, e ti notifica quando è pronto.

Vuoi liberare una porta? Un click su "Libera porta 3000", Lobster trova il processo che la occupa, chiede conferma, lo uccide, e riavvia il progetto se necessario.

Vuoi vedere i log? Click su "Mostra log recenti", Lobster filtra solo gli errori degli ultimi 10 minuti in formato leggibile.

#### Pilastro 5: Zero-Config Discovery
**Non vuoi configurare niente.**

Lobster scansiona automaticamente:
- `~/Desktop` e `~/Documents` per cartelle che sembrano progetti
- File comuni come `docker-compose.yml`, `package.json`, `requirements.txt`, `.git`
- Determina il tipo di progetto (Python, Node, Electron, etc.)
- Mappa le porte comuni (8000, 8080, 3000, 5173, 5432...)
- Trova i container Docker associati

Se scopre qualcosa, te lo chiede: "Ho trovato 'Urban Leaf' — è uno dei tuoi progetti? Vuoi che lo monitorizzi?" Un sì, e inizia il monitoraggio. Se vuoi customizzare, scrivi un file `.lobster.json` semplice, ma non è obbligatorio.

---

## 4. Analisi del Sistema di Lorenzo (Infrastruttura Locale)

### 4.1 Hardware & OS

**Macchina:** Mac Apple Silicon (M1/M2/M3 series) — ARM64
**Display:** Dual monitor
- Principale: MacBook Retina integrato
- Secondario: Samsung LS24A40xU (monitor esterno)
**Sistema Operativo:** macOS, localizzazione italiana
**RAM:** ~16GB (tipicamente)
**Storage:** SSD interno (spazio varia, ma importante per Docker images)

**Implicazione per Lobster:** 
- ARM64: Some Docker images sono compilate per linux/amd64 e girano con emulazione. Lobster deve rilevare questo e avvisare quando performance è degradata.
- Dual monitor: Lobster dovrebbe essere "always on secondary monitor" per visibilità costante.

### 4.2 Ecosistema di Sviluppo

**Strumenti Primari:**
1. **VS Code** — Editor principale, con estensione Claude Code per AI coding assistenza
2. **Claude Desktop** — Chat con Claude, accesso diretto a Claude Opus
3. **Terminal.app** — Shell primaria (zsh), 7+ finestre contemporaneamente aperte
4. **Docker Desktop** — Orchestrazione container, monitoraggio GUI minimalista
5. **Git** — Versionamento, repo su GitHub (SuperSapensAi organization)
6. **Ollama** — LLM locale (già integrato nei tuoi progetti Burryllama e Super-Sapiens-LLM). Modelli reali dal tuo ecosistema: `mistral-small` (triage veloce, 2-5s), `qwen3:30b` (analisi, 10-20s), `deepseek-r1:32b` (troubleshooting complesso, 30-60s), `mistral:7b` (fallback leggero)
7. **Activity Monitor** / **eu.exelban.Stats** — Monitoraggio sistema (ma difficile da leggere per non-tecnici)

### 4.3 Progetti Attivi sul Desktop

#### **Tier 1: Mission-Critical (Development)**

1. **Urban Leaf** 
   - Tipo: Backend Python + Multi-Container
   - Stack: FastAPI, PostgreSQL, Redis, Celery workers
   - Configurazione: `docker-compose.yml` con ~8 container
   - Porte: API su 8000, Swagger UI su 8001, Redis su 6379, Postgres su 5432
   - Cartella: `~/Desktop/Urban Leaf/`
   - Pain: Docker compose usa `linux/amd64`, warning su M-chip
   - Criticità: Database crash causa cascata failure su tutto il sistema

2. **LobsterCode / claw-code**
   - Tipo: Frontend React + UI
   - Stack: TypeScript, React (Vite), Tailwind CSS
   - Repository: `SuperSapensAi/LobsterCode.git`
   - Porte: Dev server su 5173 (Vite default), potrebbe avere backend su 3000
   - Cartella: `~/Desktop/LobsterCode/` o `~/Desktop/claw-code/`
   - Commit recenti: UI improvements, system prompt engineering, AI integrations
   - Criticità: Hot reload dipende da Vite watcher; se fallisce, deve essere manualmente riavviato

3. **Decision Lab**
   - Tipo: Ricerca + Sperimentazione
   - Stack: Python, Ollama integration, Jupyter notebooks (probabilmente)
   - Porte: Jupyter su 8888 (standard), API su 5000 (Flask?)
   - Cartella: `~/Desktop/Decision Lab/`
   - Pain: Memoria consumata da training/inference di Ollama models
   - Criticità: Se Ollama crasha, il lab è inutilizzabile

4. **Super-Sapiens-LLM**
   - Tipo: Machine Learning / Model Training
   - Stack: Python, PyTorch/TensorFlow
   - Porte: Tensorboard su 6006 (standard)
   - Cartella: `~/Desktop/Super-Sapiens-LLM/`
   - Pain: GPU-heavy, consuma molta RAM e CPU
   - Criticità: Training lunghe possono bloccare il sistema

5. **DAMM Framework**
   - Tipo: System Architecture / Framework
   - Stack: TypeScript/JavaScript (probabilmente Electron)
   - Porte: TBD da discovery
   - Cartella: `~/Desktop/DAMM Framework/`

6. **Claw Code**
   - Tipo: Terminal App / CLI Interface
   - Stack: Electron + Node.js
   - Porte: Se ha GUI, probabile su 3000+
   - Cartella: `~/Desktop/Claw Code/`

#### **Tier 2: Content & Research**
- Il Romanzo Apocrifo
- Senza far rumore
- Decisioni Che costano
- Piccolo Champ
- Super Sapiens Q-Edge

*(Non richiedono monitoraggio di porte/container, ma Lobster dovrebbe saperli identificare per visione complessiva)*

### 4.4 Pain Points Confermati e Estesi

1. **Fragmentazione Terminale** (CRITICA)
   - 7+ finestre di Terminal.app aperte
   - Nessun visual differentiation tra finestre per progetto
   - Passare da una finestra all'altra causa disorientamento: "Quale progetto sta in quale finestra?"
   - Una finestra crasha, bisogna riaprirla manualmente e riavviare il comando

2. **Invisibilità delle Porte** (ALTISSIMA)
   - Scoperta visiva di quali porte sono occupate richiede Terminal + `lsof -iTCP -sTCP:LISTEN`
   - Conflitti di porta non sono rilevati finché non avvii un progetto e fallisce
   - Quando fallisce ("Address already in use on 3000"), devi identificare manualmente quale processo lo occupa con `lsof -i :3000`
   - Non c'è storico: quali porte ha usato nel passato? Ha mai cambiato porta?

3. **Caos Docker** (ALTISSIMA)
   - Docker Desktop GUI mostra il raw elenco di container, non raggruppati per project
   - Platform mismatch warnings non sono compresi
   - Crash di un container non è immediatamente evidente fino a quando non lo cerchi
   - Logs richiedono: apri terminal → `docker logs <container_id>` → scroll per trovare errore
   - Resource limits non sono visible: quale container sta mangiando memoria?

4. **Mancanza di Contesto di Progetto** (ALTA)
   - Un processo non è etichettato con "appartiene a Urban Leaf"
   - Quando apri Activity Monitor, vedi "python" in esecuzione, ma quale python? Quale progetto?
   - Memoria alta: "Chi la consuma?" La risposta richiede ricerca manuale

5. **Assenza di Notifiche Intelligenti** (MODERATA)
   - Container crash silenzioso: scopri solo quando provi a interagire con esso
   - Port conflicts non sono prevenuti: solo rilevati quando accade
   - Resource warnings (RAM >80%, Disk >90%) non esistono per Lobster
   - Build failures (se c'è un npm build automatico) non sono tracciati

6. **Perdita di Sessione Terminale** (BASSA)
   - Se chiudi una finestra Terminal per errore, la sessione è persa
   - Comandi frequenti (docker-compose up, npm run dev) devono essere ridefattati
   - Command history è per-window, non aggregato

---

## 5. Target Persona: "Il Vibe-Coder"

### 5.1 Chi È

**Nome Archetipo:** Il Vibe-Coder  
**Età:** 25-45 anni  
**Background:** Non da Computer Science formale, magari autodidatta o bootcamp  
**Linguaggio:** Parla italiano fluentemente  
**Relazione con il codice:** Capisce la logica, scrive codice valido, ma non ha background sysadmin/DevOps

### 5.2 Cosa Sa

- **Cosa vuole costruire** — Ha una visione del progetto: "Voglio un'app che fa X"
- **Come usare un terminale seguendo istruzioni** — Sa digitare comandi se gli dai la procedura, ma non sa crearne di nuovi
- **Concetti di base di programmazione** — if/else, funzioni, strutture dati, classi
- **Come leggere error messages, sort of** — Se l'errore dice "Syntax Error", capisce. Se dice "SIGTERM on pid 12345", no.
- **Come usare Git con GUI o seguendo tutorial** — Sa fare commit, pull, push
- **Come chiedere all'AI** — Conosce Claude, Cursor, sa come fare prompt efficaci

### 5.3 Cosa NON Sa (e Non Vuole Sapere)

- **Port binding e TCP sockets** — "Che cos'è una porta?" "Perché due progetti non possono usarla?"
- **Docker internals** — Come funziona un container, cosa significa linux/amd64 vs ARM64, perché ci sono warning
- **Process management** — Cos'è un PID? Come killare un processo? Cosa significa SIGTERM vs SIGKILL?
- **Memory/CPU architecture** — Quanta memoria usa un container? Come ottimizzarla? Cosa significa swap?
- **Kubernetes, systemd, daemon, service managers** — Nomi oscuri di cose che non lo riguardano
- **Shell scripting** — Non vuole scrivere bash script
- **SSH/remote debugging** — Solo local development

### 5.4 Cosa Vuole

1. **Visibilità istantanea** — In un secondo, sapere: "Quali dei miei progetti stanno girando? Come stanno di salute?"
2. **Protezione dai propri errori** — "Mi avvisi se sto per fare un casino? Come se due progetti usassero la stessa porta?"
3. **Semplificazione di compiti comuni** — "Avvia il database" in un click, non in 5 step manuale
4. **Spiegazioni umane di problemi** — Non "Container exited with code 137", ma "Il database è rimasto senza memoria"
5. **Aiuto da un intelligenza** — Quando qualcosa va male, un assistente che sa dire "Prova questo" invece di "Leggi il log"
6. **Nessuna configurazione complessa** — Auto-discovery, settings semplici, defaults intelligenti

---

## 6. Architettura Tecnica: Electron + React + AI

### 6.1 Stack Tecnologico Fondamentale

**Frontend:**
- Electron (native macOS app)
- React (UI components)
- TypeScript (type safety)
- Tailwind CSS (styling simple & consistent)
- Zustand (state management, lightweight)

**Backend Locale (Main Process):**
- Node.js (native modules)
- TypeScript
- Service-oriented architecture (PortScanner, DockerMonitor, TerminalSession, ProjectDiscovery)

**AI Layer:**
- Ollama (local LLM integration)
- @anthropic-ai/sdk (fallback for Claude API se Ollama non disponibile)
- Prompt engineering for human-friendly explanations

**System Integration:**
- `child_process` per esecuzione shell commands
- `net` per port scanning
- Docker SDK (node-docker-sdk oppure Docker CLI wrapper)
- macOS native notifications

### 6.2 Filosofia: Semplicità Prima di Tutto

L'architettura deve essere **semplice e leggibile** perché Lorenzo la mantiene e l'estende con AI. Non usiamo framework giganti. Non usiamo pattern di architettura over-engineered.

**Principio:** "Se devo spiegare una feature a Claude e lui mi fa scrivere codice, il codice deve essere self-explanatory."

### 6.3 AI Layer (Novità Chiave)

#### Come Funziona

1. **Discovery Phase** — Lobster raccoglie dati:
   ```
   - Progetti in ~/Desktop
   - Processi in esecuzione
   - Porte occupate
   - Container Docker e loro stato
   - File di log recenti (ultimi 100 righe)
   ```

2. **Analysis Phase** — Passa questi dati a Ollama con un prompt context-specific:
   ```
   Sei un assistente tecnico che spiega in italiano semplice cosa sta succedendo 
   nel laboratorio di sviluppo di Lorenzo.
   
   State attuale:
   - Urban Leaf: 8 container, 7 healthy, 1 stopped (database)
   - Port 3000: used by LobsterCode (safe)
   - Port 8000: used by Urban Leaf (safe)
   - CPU: 65%, RAM: 12GB/16GB (85%)
   - Ultimo log error: "PostgreSQL connection timeout"
   
   Domanda: "Perché il mio progetto non funziona?"
   
   Rispondi in italiano, in 1-2 frasi semplici con suggerimenti specifici.
   ```

3. **Response Phase** — Ollama risponde:
   ```
   "Il database di Urban Leaf non è disponibile. Il container PostgreSQL 
   si è fermato. Vuoi che lo riavvii? Ci vorranno ~10 secondi."
   ```

4. **Action Suggestion** — Basato sulla risposta, Lobster suggerisce un'azione:
   ```
   [🔴 Problema Rilevato]
   Il database di Urban Leaf non è disponibile.
   
   Suggerimento: Il container PostgreSQL si è fermato.
   
   [Riavvia il Database] ← One-click action
   ```

#### Quando Ollama NON è Disponibile

Se Ollama non gira, Lobster usa **fallback logic** built-in:
- Database crash? Pattern matching su "exited with code 137" → "Memoria insufficiente"
- Port already in use? Suggeri di killare il processo che la occupa
- API timeout? Suggeri di riavviare il container

Meno intelligente, ma still helpful.

#### Ollama Integration Tecnica — Modelli Reali dal Tuo Ecosistema

Lobster Utility sfrutta gli stessi modelli Ollama **già configurati e testati** nei tuoi progetti
(Burryllama, Super-Sapiens-LLM). Nessun modello nuovo da scaricare: usi ciò che hai già.

**Strategia Multi-Modello (ispirata al tuo Burryllama):**

| Ruolo in Lobster          | Modello Ollama        | Perché questo modello                                           | Timeout |
|---------------------------|-----------------------|-----------------------------------------------------------------|---------|
| **Router/Triage veloce**  | `mistral-small`       | Già usato come router in Burryllama. Velocissimo (~2-5s su Metal Apple Silicon). Classifica il tipo di problema e decide se serve analisi più profonda. | 15s     |
| **Analisi e spiegazioni** | `qwen3:30b`           | Già presente nel tuo stack. Ottimo per spiegare errori in linguaggio naturale italiano, generare suggerimenti dettagliati. Buon bilanciamento velocità/qualità. | 45s     |
| **Troubleshooting complesso** | `deepseek-r1:32b` | Il tuo modello di "escalation" in Burryllama. Ragionamento chain-of-thought per problemi complessi: conflitti Docker multi-container, dependency chain rotte, errori criptici. | 90s     |
| **Fallback leggero (dev)**| `mistral:7b`          | Presente nel tuo Super-Sapiens-LLM. Usato se i modelli grandi non sono caricati. Meno preciso ma sempre disponibile. | 10s     |

**Flusso di Routing Intelligente (come Burryllama ma per infrastruttura):**

```
Utente vede 🔴 su Urban Leaf
     │
     ▼
Lobster raccoglie contesto (logs, ports, container status)
     │
     ▼
mistral-small (TRIAGE: 2-5 secondi)
├── Problema semplice? (porta occupata, container stopped)
│   └── Risponde direttamente con fix one-click
│       "Il container 'db' si è fermato. Vuoi riavviarlo?"
│
├── Problema medio? (errore nei log, health check fallito)
│   └── Scala a qwen3:30b (ANALISI: 10-20 secondi)
│       "Il database non riesce a connettersi perché la porta 5432
│        è già occupata da un altro progetto. Ti suggerisco di..."
│
└── Problema complesso? (cascade failure, errori multipli correlati)
    └── Scala a deepseek-r1:32b (DEEP ANALYSIS: 30-60 secondi)
        "Ho analizzato la catena di errori. Il problema parte da...
         La soluzione richiede questi 3 passaggi nell'ordine..."
```

**Nota Apple Silicon:** Sul tuo Mac M-series, Ollama gira nativamente con Metal GPU
acceleration. I modelli da 7B rispondono in 2-5 secondi, i 30B in 10-30 secondi.
Nessun bisogno di NVIDIA GPU — il tuo hardware è perfetto per questo.

```typescript
// OllamaService.ts — Configurazione Multi-Modello Reale
interface OllamaModelConfig {
  name: string;
  role: 'triage' | 'analysis' | 'deep_analysis' | 'fallback';
  timeoutMs: number;
  maxTokens: number;
}

const LOBSTER_MODELS: OllamaModelConfig[] = [
  { name: 'mistral-small',   role: 'triage',        timeoutMs: 15000,  maxTokens: 512  },
  { name: 'qwen3:30b',       role: 'analysis',      timeoutMs: 45000,  maxTokens: 1024 },
  { name: 'deepseek-r1:32b', role: 'deep_analysis', timeoutMs: 90000,  maxTokens: 2048 },
  { name: 'mistral:7b',      role: 'fallback',      timeoutMs: 10000,  maxTokens: 512  },
];

class OllamaService {
  private baseUrl = 'http://localhost:11434';
  private availableModels: string[] = [];

  // All'avvio: verifica quali modelli sono già caricati
  async discoverModels(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    this.availableModels = data.models.map((m: any) => m.name);
    // Log: "Trovati modelli: mistral-small, qwen3:30b, deepseek-r1:32b"
  }

  // Seleziona il modello migliore disponibile per il ruolo richiesto
  private selectModel(role: OllamaModelConfig['role']): OllamaModelConfig {
    const preferred = LOBSTER_MODELS.find(
      m => m.role === role && this.availableModels.includes(m.name)
    );
    if (preferred) return preferred;
    
    // Fallback chain: triage → fallback → qualsiasi modello disponibile
    const fallback = LOBSTER_MODELS.find(
      m => m.role === 'fallback' && this.availableModels.includes(m.name)
    );
    return fallback || LOBSTER_MODELS[0]; // worst case: prova mistral-small
  }

  async analyzeError(context: SystemContext): Promise<HumanReadableExplanation> {
    // Step 1: Triage veloce con mistral-small
    const triageModel = this.selectModel('triage');
    const triageResult = await this.query(triageModel, buildTriagePrompt(context));
    
    // Step 2: Se il problema è complesso, scala al modello appropriato
    if (triageResult.complexity === 'simple') {
      return formatForHuman(triageResult);
    } else if (triageResult.complexity === 'medium') {
      const analysisModel = this.selectModel('analysis');
      const analysis = await this.query(analysisModel, buildAnalysisPrompt(context, triageResult));
      return formatForHuman(analysis);
    } else {
      const deepModel = this.selectModel('deep_analysis');
      const deepAnalysis = await this.query(deepModel, buildDeepPrompt(context, triageResult));
      return formatForHuman(deepAnalysis);
    }
  }

  private async query(model: OllamaModelConfig, prompt: string): Promise<any> {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), model.timeoutMs);
    
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      body: JSON.stringify({
        model: model.name,
        prompt: prompt,
        stream: false,
        options: { num_predict: model.maxTokens }
      })
    });
    return response.json();
  }

  async healthCheck(): Promise<{ available: boolean; models: string[] }> {
    try {
      await this.discoverModels();
      return { available: true, models: this.availableModels };
    } catch {
      return { available: false, models: [] };
    }
  }
}
```

### 6.4 Core Services Architecture

```
┌─────────────────────────────────────────────────────┐
│           ELECTRON MAIN PROCESS                      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌────────────────┐  ┌────────────────┐           │
│  │ ProjectDiscovery│  │ PortScanner    │           │
│  │ Service        │  │ Service        │           │
│  └────────────────┘  └────────────────┘           │
│         │                    │                     │
│  ┌────────────────┐  ┌────────────────┐           │
│  │ DockerMonitor  │  │ TerminalSession│           │
│  │ Service        │  │ Manager        │           │
│  └────────────────┘  └────────────────┘           │
│         │                    │                     │
│  ┌────────────────────────────────────────┐       │
│  │  OllamaService (AI Layer)              │       │
│  └────────────────────────────────────────┘       │
│         │                                         │
│  ┌────────────────┐  ┌────────────────┐           │
│  │ Notification   │  │ Data Formatter │           │
│  │ Service        │  │ (Human-Readable)          │
│  └────────────────┘  └────────────────┘           │
│                                                     │
└─────────────────────────────────────────────────────┘
                    ↓ (IPC)
┌─────────────────────────────────────────────────────┐
│           REACT RENDERER PROCESS                     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌────────────────────────────────────────┐       │
│  │  Dashboard (Project Cards Grid)        │       │
│  └────────────────────────────────────────┘       │
│                                                     │
│  ┌────────────────────────────────────────┐       │
│  │  Project Detail (Ports, Containers,    │       │
│  │              Terminal, History)        │       │
│  └────────────────────────────────────────┘       │
│                                                     │
│  ┌────────────────────────────────────────┐       │
│  │  AI Assistant ("Chiedi a Lobster")     │       │
│  └────────────────────────────────────────┘       │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### ProjectDiscoveryService
- Scansiona `~/Desktop`, `~/Documents`, `~/Code`
- Rileva: `docker-compose.yml`, `package.json`, `requirements.txt`, `.git`, `Makefile`
- Auto-classi: Python/Node/Electron/Static
- Auto-assegna icone (Python icon, React icon, etc.)
- Output: `Project[]` con metadati

#### PortScannerService
- Esegui `lsof -iTCP -sTCP:LISTEN` ogni 2 secondi
- Parse output: porta → PID → process name
- Correlazione: port → Project (basato su process name e working directory)
- Rilevazione conflitti: due progetti sulla stessa porta
- Output: `PortInfo[]` human-readable

#### DockerMonitorService
- Connessione a Docker daemon
- Polling stato di ogni container ogni 3 secondi
- Raggruppamento per docker-compose project
- Rilevamento platform mismatches (arm64 vs amd64)
- Estrazione di resource usage (CPU, memory)
- Lettura log per errori
- Output: `ContainerStatus[]`

#### TerminalSessionManager
- Una sessione per progetto
- Rendering xterm.js per UX nativa
- Persistenza su file (se session 'Urban Leaf' viene salvata)
- Command history per progetto, searchable
- Color-coding per progetto (es. Urban Leaf = blu, LobsterCode = verde)
- Output: `TerminalSession[]`

#### OllamaService
- Verifica disponibilità Ollama
- Build prompt intelligente con contesto
- Fallback a logica built-in se Ollama unavailable
- Cache risposte (stesso problema → stessa spiegazione)
- Output: `HumanReadableExplanation[]`

#### NotificationService
- macOS native notifications
- In-app notifications (toast-style)
- Prioritizzazione (🔴 Urgente, 🟡 Attenzione, 🟢 Info)
- Grouping smart (non spam quando 8 container si avviano contemporaneamente)
- Azioni cliccabili ("Riavvia il database")

---

## 7. Feature Specification: Pensata per Non-Tecnici

### 7.1 Dashboard "Il Mio Mondo"

#### Layout
```
┌─ Lobster Utility ──────────────────────────────────────┐
│                                                        │
│  [🔍 Ricerca] [⚙️ Settings] [❓ Help] [Ask Lobster 🦞] │
│                                                        │
│  System Status Bar:                                   │
│  🟢 Mac in forma | 65% CPU | 85% RAM (12GB/16GB)     │
│                                                        │
│  ────────────────────────────────────────────────────  │
│                                                        │
│  Il Mio Mondo:                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │🟢 Urban Leaf │  │🟡 LobsterCode│  │🟢 Decision  ││
│  │              │  │              │  │    Lab       ││
│  │8 container OK│  │Dev server OK │  │Ollama busy  ││
│  │API on :8000  │  │on :5173      │  │on :5000     ││
│  │DB healthy    │  │⚠️ Low memory │  │             ││
│  │              │  │              │  │             ││
│  │▶️ ⏹ 🔄 📂 💻│  │▶️ ⏹ 🔄 📂 💻│  │▶️ ⏹ 🔄 📂 💻││
│  │~2h ago ↑     │  │~30m ago ↑    │  │~1h ago ↑    ││
│  └──────────────┘  └──────────────┘  └──────────────┘│
│                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│
│  │🟢 Super-SAP  │  │🟡 DAMM       │  │🟢 Content   ││
│  │   LLM        │  │ Framework    │  │  Projects   ││
│  │Training idle │  │TBD discovery │  │(4 projects) ││
│  │Port ?        │  │              │  │No ports     ││
│  │              │  │              │  │             ││
│  │▶️ ⏹ 🔄 📂 💻│  │▶️ ⏹ 🔄 📂 💻│  │▶️ ⏹ 🔄 📂 💻││
│  │~6h ago ↑     │  │Never ↑       │  │~1d ago ↑    ││
│  └──────────────┘  └──────────────┘  └──────────────┘│
│                                                        │
└────────────────────────────────────────────────────────┘
```

#### Significato dei Colori
- **🟢 Verde:** Progetto online, tutti i servizi sani, nessun warning
- **🟡 Giallo:** Progetto online ma c'è una situazione che merita attenzione (RAM alta, container rallentato, ecc.)
- **🔴 Rosso:** Problema critico (container crashato, port conflict, error nel log)
- **⚪ Grigio:** Progetto offline (non sta girando)

#### Icone Quick-Action
- **▶️ Start** — Avvia il progetto (esegui docker-compose up o npm run dev)
- **⏹ Stop** — Ferma il progetto
- **🔄 Restart** — Riavvia senza perdere stato
- **📂 Open Folder** — Apri la cartella del progetto in Finder
- **💻 Terminal** — Apri un terminale nella cartella del progetto

#### Info Nella Card
Ogni card mostra:
1. **Nome e Icona:** Leggibile, colorato
2. **Semaforo:** 🟢 🟡 🔴 ⚪
3. **Status in Plain English:** "Running fine" / "Low memory warning" / "Database crashed"
4. **One-liner tecnico-human:** "8 container sani, API su porta 8000, memoria OK"
5. **Timestamp:** "2h ago" oppure "running now"

Non mostra numeri grezzi, raw data, o gergo tecnico.

### 7.2 Vista Progetto (Project Detail)

Quando clicchi su una card del progetto, apri una vista dettagliata:

```
┌─ Urban Leaf ───────────────────────────────────────────┐
│ [← Back] [🟢 Healthy] [⚙️ Project Settings]            │
│                                                        │
│ COSA STA GIRANDO:                                      │
│ ┌────────────────────────────────────────────────┐    │
│ │ 🟢 API Server          Port 8000               │    │
│ │    Process: python -m uvicorn               │    │
│ │    Memory: 512 MB                             │    │
│ │                                                │    │
│ │ 🟢 Database (PostgreSQL)  Port 5432           │    │
│ │    Container: urban_leaf_db                   │    │
│ │    Memory: 256 MB                             │    │
│ │                                                │    │
│ │ 🟢 Cache (Redis)         Port 6379            │    │
│ │    Container: urban_leaf_redis                │    │
│ │    Memory: 128 MB                             │    │
│ │                                                │    │
│ │ 🟢 Worker (Celery)                             │    │
│ │    Container: urban_leaf_worker_1             │    │
│ │    Memory: 384 MB                             │    │
│ │    Last task: ~2 minutes ago                  │    │
│ │                                                │    │
│ │ [Show more containers] (5 more)               │    │
│ └────────────────────────────────────────────────┘    │
│                                                        │
│ SALUTE DEL PROGETTO:                                  │
│ ├─ CPU:    [████░░░░] 65%                            │
│ ├─ Memory: [██████░░] 85% (12GB/16GB)                │
│ ├─ Disk:   [███░░░░░] 30% (~300GB free)              │
│ ├─ Network: ✓ OK                                     │
│ └─ Last activity: 2 minutes ago                      │
│                                                        │
│ TERMINALE:                                            │
│ ┌────────────────────────────────────────────────┐    │
│ │ [urban-leaf] $ docker-compose logs -f          │    │
│ │                                                │    │
│ │ api_1       | INFO: Started server process   │    │
│ │ db_1        | LOG: Connection accepted      │    │
│ │ [AI Analysis: Everything looks good]          │    │
│ │                                                │    │
│ │ $ _                                            │    │
│ └────────────────────────────────────────────────┘    │
│                                                        │
│ AZIONI RAPIDE:                                        │
│ [▶️ Start Project] [⏹ Stop] [🔄 Restart All]          │
│ [🗑️ Clean Volumes] [📋 View Full Logs]               │
│                                                        │
│ CRONOLOGIA (Ultimi 10 eventi):                        │
│ • 2 min:   Worker processed task #1234               │
│ • 5 min:   Database health check OK                  │
│ • 1 hour:  Restarted after crash (memory issue)      │
│ • 3 hours: Project started                           │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Sezioni Principali:

#### "Cosa Sta Girando"
Mostra ogni servizio/container del progetto con:
- Nome leggibile (non container ID)
- Porta (se applicabile)
- Stato (🟢 running, 🟡 warning, 🔴 stopped/unhealthy)
- Memoria usata
- Timestamp di quando è stato avviato

#### "Salute"
Grafici semplici di CPU, Memory, Disk:
```
CPU:    [████░░░░] 65%
Memory: [██████░░] 85%
Disk:   [███░░░░░] 30%
```

Non mostra numeri puri, ma percentuali con bar visuale + color feedback (verde = ok, giallo = attention, rosso = problem).

#### "Terminale"
Un tab di terminale integrato xterm.js che mostra:
- Ultimi log del progetto (docker-compose logs o app logs)
- Prompt ready per digitare comandi se necessario
- AI analysis: Lobster analizza il log e dice "Everything looks good" o "There's an error on line X"

#### "Azioni Rapide"
Big buttons per:
- Start/Stop/Restart
- Clean volumes (per Docker)
- View full logs
- Open in code editor

#### "Cronologia"
Timeline di ultimi 10 eventi in linguaggio umano:
- "Project started"
- "Container crashed" (con motivo se noto)
- "Memory warning" (85% utilizzo)
- "Health check passed"
- "Port conflict detected"

### 7.3 Port Monitor — "Chi Usa Cosa"

Una vista separata che mostra tutte le porte occupate e chi le usa:

```
┌─ Port Monitor ─────────────────────────────────────────┐
│ [🔍 Search ports]                                      │
│                                                        │
│ PORTE IN USO:                                          │
│                                                        │
│ Port 3000 — ⚠️ CONFLICT                              │
│ ├─ LobsterCode (Frontend)  ← currently running        │
│ └─ Decision Lab (Web UI)   ← configured, not running  │
│                                                        │
│ [Risolvi Conflitto] ← Choose which to start            │
│                                                        │
│ ──────────────────────────────────────────────────     │
│                                                        │
│ Port 5173 — 🟢 SAFE                                   │
│ └─ LobsterCode (Vite Dev Server)                       │
│                                                        │
│ [Stop] [Inspect] [View Process]                        │
│                                                        │
│ ──────────────────────────────────────────────────     │
│                                                        │
│ Port 8000 — 🟢 SAFE                                   │
│ └─ Urban Leaf (FastAPI)                               │
│                                                        │
│ ──────────────────────────────────────────────────     │
│                                                        │
│ Port 8888 — 🟡 UNUSUAL                               │
│ └─ Decision Lab (Jupyter)                             │
│    Suggestion: This is fine if intentional            │
│                                                        │
│ ──────────────────────────────────────────────────     │
│                                                        │
│ Port 5432 — 🟢 SAFE (Container)                       │
│ └─ Urban Leaf (PostgreSQL)                            │
│    Status: Healthy, 256 MB RAM                        │
│                                                        │
│ ──────────────────────────────────────────────────     │
│                                                        │
│ [Free Port] buttons per ogni porta se serve           │
│ "Free this port" = kill process + optionally restart  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Logica:
- **Verde (🟢):** Porta occupata da un progetto solo, tutto OK
- **Giallo (🟡):** Porta occupata ma inusuale (es. Jupyter su 8888 è standard, ma non tutti ne hanno bisogno)
- **Rosso (🔴):** Conflitto — due progetti vogliono la stessa porta

AI Assistance:
- Quando c'è un conflitto, Lobster suggerisce "Quale vuoi avviare? Accorciamo il conflitto"
- Se una porta è occupata da un processo oscuro, Lobster dice "Questa porta è usata da [process name]. Se non la riconosci, clicca 'Free this port' per liberarla"

### 7.4 Docker Monitor — "I Tuoi Container"

Una vista dedicata ai container Docker:

```
┌─ Docker Monitor ──────────────────────────────────────┐
│ [🔍 Filter by project] [🔄 Refresh]                  │
│                                                        │
│ URBAN LEAF (8 container totali):                      │
│ ┌────────────────────────────────────────────────┐    │
│ │ 🟢 urban_leaf_api (Image: fastapi:latest)    │    │
│ │    Status: Running for 2 hours                │    │
│ │    CPU: 1%, Memory: 512 MB                    │    │
│ │    Ports: 8000 → 8000                         │    │
│ │    Actions: [⏹ Stop] [↻ Restart] [📋 Logs]   │    │
│ │                                                │    │
│ │ 🟢 urban_leaf_db (Image: postgres:15)        │    │
│ │    Status: Running for 2 hours                │    │
│ │    CPU: 2%, Memory: 256 MB                    │    │
│ │    Health: Healthy ✓                          │    │
│ │    Ports: 5432 → 5432                         │    │
│ │    Actions: [⏹ Stop] [↻ Restart] [📋 Logs]   │    │
│ │                                                │    │
│ │ 🟡 urban_leaf_worker_1 (Image: celery:latest)│    │
│ │    Status: Running but slow                   │    │
│ │    CPU: 45%, Memory: 892 MB ← HIGH            │    │
│ │    Last task: 30 seconds ago                  │    │
│ │    Suggestion: Memory usage is high. Check    │    │
│ │    for stuck tasks.                           │    │
│ │    Actions: [⏹ Stop] [↻ Restart] [📋 Logs]   │    │
│ │                                                │    │
│ │ [Show more: 5 container]                      │    │
│ └────────────────────────────────────────────────┘    │
│                                                        │
│ DECISION LAB (2 container totali):                    │
│ ┌────────────────────────────────────────────────┐    │
│ │ 🟢 ollama (Image: ollama:latest)              │    │
│ │    Status: Running for 1 hour                 │    │
│ │    CPU: 85%, Memory: 4000 MB (Model loaded)   │    │
│ │    Ports: None                                │    │
│ │                                                │    │
│ │ 🟢 jupyter (Image: jupyter/datascience)       │    │
│ │    Status: Running for 1 hour                 │    │
│ │    CPU: 2%, Memory: 256 MB                    │    │
│ │    Ports: 8888 → 8888                         │    │
│ │                                                │    │
│ └────────────────────────────────────────────────┘    │
│                                                        │
│ STOPPED CONTAINERS (5):                               │
│ • old_project_db (Last run: 3 days ago)              │
│ • test_env (Last run: 1 week ago)                    │
│ [Clean up stopped containers?]                       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Features:
- Raggruppamento per progetto (docker-compose project detection)
- Status icon: 🟢 (running healthy), 🟡 (running with warning), 🔴 (stopped/unhealthy)
- Resource display: CPU%, Memory in MB (con color warning se >80%)
- Quick actions: Stop, Restart, Logs
- AI Analysis: "High memory usage. Possible memory leak?" oppure "Everything normal"
- Platform warning detection: "⚠️ This image is linux/amd64 but your Mac is ARM64. It will run slower. Want to find an ARM version?"

### 7.5 Terminal — "Comandi per Progetto"

Un terminal manager integrato che raggruppa terminali per progetto:

```
┌─ Terminal Manager ─────────────────────────────────────┐
│ [Urban Leaf] [LobsterCode] [Decision Lab] [+New]      │
│                                                        │
│ ┌────────────────────────────────────────────────┐    │
│ │ [urban-leaf] $                                  │    │
│ │                                                │    │
│ │ Suggested commands:                            │    │
│ │ ┌──────────────────────────┐                  │    │
│ │ │ docker-compose up -d     │ ← Click to run   │    │
│ │ │ docker-compose logs -f   │                  │    │
│ │ │ docker ps                │                  │    │
│ │ │ alembic upgrade head     │                  │    │
│ │ └──────────────────────────┘                  │    │
│ │                                                │    │
│ │ Recent history:                                │    │
│ │ $ docker-compose up -d                        │    │
│ │ [AI: All 8 containers started successfully]  │    │
│ │                                                │    │
│ │ $ docker logs urban_leaf_api                  │    │
│ │ [error] Connection timeout                    │    │
│ │ [AI: The database container isn't responding.│    │
│ │  Try restarting it.]                         │    │
│ │                                                │    │
│ │ $ docker restart urban_leaf_db                │    │
│ │ [success] Container restarted                │    │
│ │                                                │    │
│ │ $ _                                            │    │
│ └────────────────────────────────────────────────┘    │
│                                                        │
│ [Clear] [Save Session] [Export Logs]                  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Features:
- **Tab per progetto:** Clicca sul nome del progetto per switchare terminale
- **Suggested commands:** Mostra i comandi più frequenti per quel progetto (pre-learned da usage)
- **Color-coded output:** Errori in rosso, successi in verde, info in grigio
- **AI Analysis:** Quando digiti un comando e vedi output, Lobster automaticamente lo analizza e dice se è un problema
- **Command history:** Searchable, aggregato per progetto
- **Persistent sessions:** Se chiudi la finestra, la prossima volta la sessione è ancora lì

### 7.6 "Chiedi a Lobster" — AI Assistant

Una finestra chat integrata dove puoi fare domande in italiano naturale:

```
┌─ Chiedi a Lobster 🦞 ───────────────────────────────┐
│ [Context: Urban Leaf running, Decision Lab stopped]  │
│                                                      │
│ Lobster: "Ciao! Come posso aiutarti?               │
│           Puoi chiedermi di qualsiasi progetto,    │
│           porta, container, errore..."             │
│                                                      │
│ ──────────────────────────────────────────────────   │
│                                                      │
│ You: "Perché il mio progetto è lentissimo?"       │
│                                                      │
│ Lobster: "Analizzando... 🔍                         │
│           Ho notato che:                           │
│           • Il worker di Urban Leaf usa il 45%    │
│             della CPU                             │
│           • La memoria disponibile è bassa         │
│             (solo 2GB free su 16GB)                │
│           • Il database ha 500+ query in coda     │
│                                                     │
│           Consiglio: Riavvia il worker per        │
│           svuotare la coda. Poi monitora la       │
│           memoria nei prossimi 10 minuti.         │
│                                                     │
│           [Riavvia Worker] [Vedi Dettagli]"       │
│                                                      │
│ ──────────────────────────────────────────────────   │
│                                                      │
│ You: "Come faccio ad avviare Decision Lab?"       │
│                                                      │
│ Lobster: "Decision Lab è configurato e pronto.     │
│           Ti basta un click:                       │
│                                                     │
│           [▶️ Start Decision Lab]                    │
│                                                      │
│           Ci vorranno ~30 secondi per caricarlo   │
│           (Ollama deve caricare il modello)."      │
│                                                      │
│ ──────────────────────────────────────────────────   │
│                                                      │
│ [Type your question...] [Send] [Clear Chat]        │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Features:
- **Natural language understanding:** Lobster capisce domande in italiano, anche vaghe
- **Context-aware:** Lobster sa cosa sta girando, quali errori ci sono stati, quale è lo stato
- **Actionable responses:** Non solo spiega il problema, ma suggerisce azioni one-click
- **Fallback intelligence:** Se Ollama non risponde, usa logica built-in per risposte comuni
- **Learning:** Lobster memorizza conversazioni frequenti e migliora i suggerimenti

Esempi di domande supportate:
- "Quali progetti sono accesi?"
- "Perché il database non risponde?"
- "Chi sta usando la porta 3000?"
- "Mostrami i log del worker"
- "Avvia Urban Leaf"
- "Libera la porta 8080"
- "Quanto spazio su disco mi rimane?"
- "Quale container sta usando più memoria?"
- "Come faccio a..."

### 7.7 Resource Monitor — "Come sta il mio Mac?"

Una vista dedicata che mostra **quanto ogni progetto sta consumando**, pensata per chi non sa 
leggere Activity Monitor. Niente numeri criptici: tutto visuale e immediato.

#### Vista Principale: Barra Risorse Globale (sempre visibile in dashboard)

```
┌───────────────────────────────────────────────────────────────┐
│  🖥️ IL TUO MAC                                               │
│                                                               │
│  CPU ████████░░░░░░░░░░░░  42%  "Tranquillo"                 │
│  RAM ██████████████░░░░░░  71%  "Occupata ma ok"              │
│  DISK ████████████████░░░░  82%  "⚠️ Si sta riempiendo"       │
│                                                               │
│  ▼ Chi sta consumando di più?                                 │
└───────────────────────────────────────────────────────────────┘
```

#### Vista Espansa: Consumo per Progetto

Cliccando "Chi sta consumando di più?" si espande:

```
┌───────────────────────────────────────────────────────────────┐
│  📊 RISORSE PER PROGETTO                                     │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  🍃 Urban Leaf                           CPU   RAM      │  │
│  │  ███████████████░░░░░  Container totali: 2.1GB  35%    │  │
│  │  ├── api server        ██░░  180MB   8%                │  │
│  │  ├── database (postgres) ████  850MB  12%               │  │
│  │  ├── redis             █░░░   45MB   1%                │  │
│  │  ├── worker            ███░  620MB  11%                │  │
│  │  └── altri 4 container █░░░  405MB   3%                │  │
│  │                                                         │  │
│  │  💡 "Urban Leaf usa il 35% delle tue risorse.           │  │
│  │      Il database e il worker sono i più pesanti."       │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  🦞 LobsterCode                         CPU   RAM      │  │
│  │  █████░░░░░░░░░░░░░░░  Dev server:     320MB  12%     │  │
│  │                                                         │  │
│  │  💡 "LobsterCode è leggero, usa poche risorse."        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  🧪 Decision Lab                        CPU   RAM      │  │
│  │  ████████████░░░░░░░░  Ollama model:   4.2GB  28%     │  │
│  │                                                         │  │
│  │  💡 "Decision Lab sta usando molto per il modello AI.   │  │
│  │      Puoi liberare 4GB fermandolo quando non lo usi."  │  │
│  │  [Metti in pausa Decision Lab]                          │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  🔄 Processi Non-Progetto               CPU   RAM      │  │
│  │  ████░░░░░░░░░░░░░░░░  Chrome, VS Code: 1.8GB  15%   │  │
│  │                                                         │  │
│  │  💡 "Chrome con 15 tab aperti usa 1.2GB da solo.       │  │
│  │      Vuoi che ti mostri quali tab pesano di più?"      │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─────────────────── PIE CHART ──────────────────────────┐  │
│  │                                                         │  │
│  │        🍃 Urban Leaf  35%                               │  │
│  │        🧪 Decision Lab 28%                              │  │
│  │        🦞 LobsterCode  12%                              │  │
│  │        🔧 Sistema/App  15%                              │  │
│  │        💚 Libero       10%                              │  │
│  │                                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  [🧹 Ottimizza: ferma i progetti non attivi]                  │
│  [📊 Cronologia risorse ultimi 30 min]                        │
└───────────────────────────────────────────────────────────────┘
```

#### Funzionalità Chiave:

**Linguaggio umano per ogni stato:**
- 0-30% → "Tranquillo, tutto leggero"
- 30-60% → "Occupata ma tutto ok"
- 60-80% → "Si sta riempiendo, tieni d'occhio"
- 80-90% → "⚠️ Attenzione: le cose potrebbero rallentare"
- 90%+ → "🔴 Critico: il Mac è in sofferenza. Ferma qualcosa!"

**Suggerimenti AI proattivi (via `mistral-small`):**
- "Hai 3 progetti attivi ma stai lavorando solo su Urban Leaf. Vuoi mettere in pausa gli altri?"
- "Il tuo Mac ha solo 800MB liberi. Decision Lab da solo usa 4.2GB. Fermarlo libererebbe spazio."
- "Negli ultimi 30 minuti il consumo è salito del 40%. Controlla il worker di Urban Leaf."

**Azione one-click "Ottimizza":**
Analizza quali progetti non stai usando attivamente e propone di fermarli:
```
┌──────────────────────────────────────────────┐
│ 🧹 Suggerimento Ottimizzazione               │
│                                              │
│ Non usi Decision Lab da 2 ore.               │
│ Fermandolo liberi 4.2GB di RAM.              │
│                                              │
│ [Ferma Decision Lab]  [Tieni attivo]         │
└──────────────────────────────────────────────┘
```

**Cronologia Risorse:**
Grafico timeline degli ultimi 30-60 minuti, mostra quando un progetto ha iniziato a consumare 
di più. Utile per capire: "Da quando ho avviato il secondo progetto, tutto rallenta".

### 7.8 Notifiche Intelligenti

Lobster invia notifiche in due canali:

#### macOS Native Notifications
Sfrutta il sistema notifiche nativo di macOS:
```
╔═════════════════════════════════════════════╗
║ Lobster Utility                             ║
╟─────────────────────────────────────────────╢
║ 🔴 Problema Rilevato                        ║
║                                             ║
║ Il database di Urban Leaf non risponde.     ║
║ Il container è crashato per mancanza di     ║
║ memoria.                                     ║
║                                             ║
║ [Riavvia Database] [Vedi Dettagli] [Close] ║
╚═════════════════════════════════════════════╝
```

#### In-App Notifications (Toast)
```
┌─────────────────────────────────────────────┐
│ 🟡 Memory Warning                          │
│ Memoria disponibile < 2GB. Alcuni container│
│ potrebbero rallentare.                      │
│ [Ottimizza] [Ignora] ✕                      │
└─────────────────────────────────────────────┘
```

#### Prioritizzazione

**🔴 URGENTE (Instant Notification + Sound)**
- Container crash
- Port conflict detected
- Disk full warning (>95%)
- Database connection lost

**🟡 ATTENZIONE (Notification + Subtle Alert)**
- Memory high (>80%)
- CPU sustained high (>90%)
- Slow response (API latency >2s)
- Platform mismatch warning

**🟢 INFO (In-app toast only)**
- Project started
- Health check passed
- New commit detected
- Session saved

#### Smart Grouping
Non spamma notifiche ripetute. Se 8 container di Urban Leaf si avviano:
- ❌ WRONG: 8 notifiche ("Container X started")
- ✅ RIGHT: 1 notifica ("Urban Leaf started with 8 containers")

### 7.9 Settings — Minimali e Intelligenti

```
┌─ Lobster Settings ─────────────────────────────┐
│                                                │
│ GENERALE:                                      │
│ ├─ [☑] Notifiche abilitate                   │
│ ├─ [☑] Sound alerts                          │
│ ├─ Theme: [Auto ▼] (Auto / Light / Dark)     │
│ └─ Language: [Italiano ▼]                    │
│                                                │
│ SCANSIONE PROGETTI:                           │
│ ├─ Auto-scan directories:                     │
│ │  • ~/Desktop                                │
│ │  • ~/Documents                              │
│ │  • ~/Code                                   │
│ │  [+ Add directory]                         │
│ │                                              │
│ └─ Auto-detect project types:                 │
│    ☑ Docker Compose                          │
│    ☑ Node.js (package.json)                  │
│    ☑ Python (requirements.txt)                │
│    ☑ Git repositories                        │
│                                                │
│ DOCKER:                                        │
│ ├─ Docker socket: /var/run/docker.sock        │
│ └─ [Test Connection] ✓ Connected              │
│                                                │
│ OLLAMA (AI Assistant):                        │
│ ├─ URL: http://localhost:11434               │
│ ├─ Status: ✓ Connected (Mistral loaded)      │
│ └─ [Test Connection]                         │
│                                                │
│ AVANZATE:                                      │
│ ├─ Polling interval: [2 seconds ▼]            │
│ ├─ Log buffer size: [1000 lines ▼]            │
│ └─ [Export Debug Log]                        │
│                                                │
│ [Reset to Defaults] [Save] [Close]            │
│                                                │
└────────────────────────────────────────────────┘
```

Niente di complesso. Settings di default sensati, customizzazione minima.

### 7.10 Quick Browser — "Apri nel Browser"

Ogni progetto che ha un server web mostra un bottone per aprirlo direttamente nel browser.
Niente più "qual era la porta di Urban Leaf? localhost:8000? 3000? 5173?"

```
┌──────────────────────────────────────┐
│  🍃 Urban Leaf                       │
│                                      │
│  🌐 API:     http://localhost:8000   │  [Apri ↗]
│  📖 Swagger: http://localhost:8001   │  [Apri ↗]
│  🗄️ pgAdmin: http://localhost:5050   │  [Apri ↗]
│                                      │
│  🦞 LobsterCode                     │
│  🌐 App:     http://localhost:5173   │  [Apri ↗]
└──────────────────────────────────────┘
```

Un click → si apre Chrome sulla pagina giusta. Auto-detected dalle porte monitorate.

### 7.11 Git Status — "I Tuoi Salvataggi"

Visione Git semplificata. Non "branch, merge, rebase" — ma "Hai salvato? Hai pubblicato?"

```
┌──────────────────────────────────────────────────────────┐
│  📋 SALVATAGGI (Git Status)                              │
│                                                          │
│  🍃 Urban Leaf         ✅ Tutto salvato e pubblicato     │
│     Branch: main · Ultimo push: 2 ore fa                 │
│                                                          │
│  🦞 LobsterCode        ⚠️ Modifiche non salvate (5 file)│
│     Branch: main · Ultimo push: ieri                     │
│     [💾 Salva e Pubblica]  [👁️ Vedi cosa è cambiato]    │
│                                                          │
│  🧪 Decision Lab       ⚠️ Mai pubblicato                 │
│     Branch: main · Solo locale                           │
│     [💾 Prima pubblicazione su GitHub]                    │
│                                                          │
│  📖 Il Romanzo Apocrifo  ℹ️ Non è un progetto Git       │
│     [Vuoi iniziare a tracciare le versioni?]             │
└──────────────────────────────────────────────────────────┘
```

**Azioni one-click:**
- **"Salva e Pubblica"** → esegue `git add -A && git commit -m "auto-save" && git push`
- **"Vedi cosa è cambiato"** → mostra file modificati in lista semplice
- **Notifica proattiva:** "Hai lavorato su LobsterCode per 2 ore senza salvare. Vuoi fare un salvataggio?"

### 7.12 Startup Sequences — "La Mia Routine"

Configura sequenze di avvio per la tua giornata tipo. Un click per avviare tutto.

```
┌──────────────────────────────────────────────────────────┐
│  🚀 LE MIE ROUTINE                                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  ☀️ Mattina Sviluppo                              │   │
│  │  Avvia: Urban Leaf + LobsterCode + Decision Lab  │   │
│  │  Apri: VS Code su Urban Leaf                      │   │
│  │  Browser: localhost:8000 (API) + :5173 (Frontend) │   │
│  │                                                    │   │
│  │  [▶️ Avvia Routine]  [✏️ Modifica]                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  🌙 Fine Giornata                                │   │
│  │  Salva tutti i progetti (git commit + push)       │   │
│  │  Ferma tutti i container Docker                   │   │
│  │  Chiudi terminali                                 │   │
│  │                                                    │   │
│  │  [▶️ Avvia Routine]  [✏️ Modifica]                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  📝 Sessione Scrittura                            │   │
│  │  Ferma progetti dev (libera RAM)                  │   │
│  │  Apri: Il Romanzo Apocrifo in VS Code             │   │
│  │                                                    │   │
│  │  [▶️ Avvia Routine]  [✏️ Modifica]                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [+ Crea Nuova Routine]                                  │
└──────────────────────────────────────────────────────────┘
```

### 7.13 Dependency Doctor — "Check-Up Progetto"

Quando apri un progetto o qualcosa non funziona, Lobster controlla automaticamente 
se mancano dipendenze, se serve un `npm install` o `pip install`, se Docker images 
devono essere scaricate.

```
┌──────────────────────────────────────────────────────────┐
│  🏥 CHECK-UP: Urban Leaf                                 │
│                                                          │
│  ✅ Docker Compose file trovato                          │
│  ✅ 8 container definiti, tutti scaricati                │
│  ⚠️ requirements.txt aggiornato da ieri                  │
│     → Potrebbe servire reinstallare le dipendenze        │
│     [🔄 Reinstalla dipendenze]                           │
│  ✅ Database migrations up to date                       │
│  ✅ .env file presente                                   │
│  ⚠️ .env.example ha 2 variabili nuove non nel tuo .env  │
│     → DB_POOL_SIZE e REDIS_MAX_CONNECTIONS               │
│     [📋 Aggiungi le variabili mancanti]                  │
│                                                          │
│  RISULTATO: 🟡 Quasi tutto ok, 2 cose da sistemare      │
│  [🔧 Sistema tutto automaticamente]                      │
└──────────────────────────────────────────────────────────┘
```

**Auto-detection:**
- `package.json` modificato? → Suggerisci `npm install`
- `requirements.txt` modificato? → Suggerisci `pip install -r requirements.txt`
- Docker images mancanti? → Suggerisci `docker compose pull`
- `.env.example` ha variabili nuove? → Mostra quali mancano nel `.env`
- Alembic migrations pending? → Suggerisci `alembic upgrade head`

### 7.14 Cleanup Manager — "Fai Spazio"

Docker e sviluppo generano TONNELLATE di file temporanei, immagini vecchie, volumi orfani.
Lobster ti aiuta a pulire senza rischiare di cancellare qualcosa di importante.

```
┌──────────────────────────────────────────────────────────┐
│  🧹 FAI SPAZIO SUL TUO MAC                              │
│                                                          │
│  Disco usato: ████████████████░░░░  82% (200GB / 245GB) │
│  Spazio liberabile: ~18GB                                │
│                                                          │
│  📦 Docker:                                              │
│  ├── Immagini non usate (30+ giorni): 8.2GB    [Pulisci]│
│  ├── Volumi orfani: 3.1GB                       [Pulisci]│
│  └── Cache di build: 2.4GB                     [Pulisci]│
│                                                          │
│  📁 node_modules non usati:                              │
│  ├── Super-Sapiens-LLM/node_modules: 1.8GB    [Rimuovi] │
│  └── DAMM Framework/node_modules: 1.2GB        [Rimuovi] │
│      💡 "Puoi rimuoverli. Se servono, basta fare         │
│          npm install di nuovo."                          │
│                                                          │
│  🗑️ Log e file temporanei: 1.1GB               [Pulisci]│
│                                                          │
│  [🧹 Pulisci Tutto (18GB)]  [Scegli cosa pulire]        │
└──────────────────────────────────────────────────────────┘
```

### 7.15 Project Archiver — "Metti in Pausa"

Progetti che non usi da tempo consumano spazio e a volte lasciano processi attivi.
Lobster ti suggerisce di archiviarli.

```
┌──────────────────────────────────────────────────────────┐
│  💤 PROGETTI INATTIVI                                    │
│                                                          │
│  Questi progetti non li usi da un po'. Vuoi metterli    │
│  in pausa per liberare risorse?                          │
│                                                          │
│  📖 Piccolo Champ          Ultimo uso: 45 giorni fa     │
│     [💤 Archivia]  [Tieni attivo]                       │
│                                                          │
│  🔬 Super Sapiens Q-Edge   Ultimo uso: 30 giorni fa     │
│     ⚠️ Ha 2 container Docker ancora attivi!              │
│     [⏹ Ferma e Archivia]  [Tieni attivo]                │
│                                                          │
│  💡 "Archiviare un progetto non lo cancella. Lo mette   │
│      in una sezione separata. Puoi riattivarlo           │
│      con un click quando vuoi."                          │
└──────────────────────────────────────────────────────────┘
```

### 7.16 Error Replay — "Cosa è Successo Mentre Non C'ero?"

Quando torni al Mac dopo una pausa, Lobster ti mostra un riassunto di tutto ciò che è 
successo in tua assenza.

```
┌──────────────────────────────────────────────────────────┐
│  📜 COSA È SUCCESSO (ultime 3 ore)                       │
│                                                          │
│  14:30  🟢 Urban Leaf avviato con successo               │
│  15:12  🟡 LobsterCode: dev server riavviato (hot reload)│
│  16:45  🔴 Urban Leaf: container 'worker' crashato       │
│         → Riavviato automaticamente dopo 10 secondi      │
│  17:02  🟢 Worker tornato operativo                      │
│  17:30  🟡 Memoria al 85% — suggerito di chiudere        │
│         Decision Lab (non in uso da 2 ore)               │
│                                                          │
│  STATO ATTUALE: 5 progetti attivi, 2 warnings            │
│                                                          │
│  [Vai alla Dashboard]                                    │
└──────────────────────────────────────────────────────────┘
```

### 7.17 Quick API Test — "Funziona?"

Per chi non conosce Postman o curl. Un bottone per testare se l'API risponde.

```
┌──────────────────────────────────────────────────────────┐
│  🧪 TEST RAPIDO — Urban Leaf API                         │
│                                                          │
│  http://localhost:8000/health    ✅ 200 OK (45ms)        │
│  http://localhost:8000/api/v1    ✅ 200 OK (120ms)       │
│  http://localhost:8000/docs      ✅ 200 OK (38ms)        │
│                                                          │
│  💡 "La tua API funziona perfettamente.                  │
│      Tutti gli endpoint rispondono in meno di 150ms."    │
│                                                          │
│  [🔄 Testa di nuovo]  [+ Aggiungi endpoint]             │
└──────────────────────────────────────────────────────────┘
```

Auto-detected da:
- `/health` endpoint (standard)
- Swagger/OpenAPI se presente
- URL definiti in `.lobster.json`

### 7.18 Env Manager — "Le Tue Variabili"

I file `.env` sono critici ma confusi per i non-tecnici. Lobster li presenta come 
un form semplice.

```
┌──────────────────────────────────────────────────────────┐
│  🔐 VARIABILI DI AMBIENTE — Urban Leaf                   │
│                                                          │
│  DATABASE:                                               │
│  ├── DB_HOST:     localhost                    [Modifica]│
│  ├── DB_PORT:     5432                         [Modifica]│
│  ├── DB_NAME:     urban_leaf                   [Modifica]│
│  └── DB_PASSWORD: ••••••••                     [Mostra]  │
│                                                          │
│  API:                                                    │
│  ├── API_KEY:     ••••••••                     [Mostra]  │
│  ├── DEBUG:       true                         [Modifica]│
│  └── LOG_LEVEL:   info                         [Modifica]│
│                                                          │
│  ⚠️ 2 variabili in .env.example mancano:                 │
│  ├── DB_POOL_SIZE  (suggerito: 10)             [Aggiungi]│
│  └── REDIS_URL     (suggerito: redis://...)    [Aggiungi]│
│                                                          │
│  [💾 Salva modifiche]                                    │
└──────────────────────────────────────────────────────────┘
```

### 7.19 🤖 UI Testing Agent — "Testa la Mia App"

**Feature killer.** Un agente integrato che prende il controllo del browser e testa 
la tua UI automaticamente — clicca bottoni, riempie form, naviga pagine — come farebbe 
un utente reale. Ispirato a come Claude usa computer-use, ma integrato in Lobster.

**Come funziona per un non-tecnico:**

```
┌──────────────────────────────────────────────────────────┐
│  🤖 TESTA LA MIA APP — LobsterCode                      │
│                                                          │
│  Cosa vuoi testare?                                      │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  [🏠 Test Navigazione]                          │    │
│  │  Naviga tutte le pagine, verifica che caricano  │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  [📝 Test Form e Input]                         │    │
│  │  Compila form, clicca bottoni, testa validazione│    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  [📱 Test Responsive]                           │    │
│  │  Verifica che l'app funziona su diverse misure  │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  [🔍 Test Completo]                             │    │
│  │  Naviga tutto, clicca tutto, segnala problemi   │    │
│  └─────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────┐    │
│  │  [💬 Descrivi cosa testare]                     │    │
│  │  "Prova a registrare un utente e poi fare login"│    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  [▶️ Avvia Test]                                         │
└──────────────────────────────────────────────────────────┘
```

**Durante il test — l'utente VEDE cosa succede:**

```
┌──────────────────────────────────────────────────────────┐
│  🤖 TEST IN CORSO — LobsterCode                         │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                   │    │
│  │           [Screenshot live del browser]           │    │
│  │           L'agente sta cliccando su              │    │
│  │           "Sign Up" button...                     │    │
│  │                                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  📋 LOG IN TEMPO REALE:                                  │
│  ✅ 14:30:01  Aperto http://localhost:5173               │
│  ✅ 14:30:02  Pagina caricata in 230ms                   │
│  ✅ 14:30:03  Cliccato "Sign Up"                         │
│  ✅ 14:30:04  Form registrazione visibile                │
│  ✅ 14:30:05  Compilato email: test@example.com          │
│  ✅ 14:30:06  Compilato password: ••••••••                │
│  🔴 14:30:07  ERRORE: Bottone "Submit" non cliccabile    │
│     → Il bottone è disabilitato anche con dati validi    │
│                                                          │
│  [⏸ Pausa]  [⏹ Ferma]  [📸 Screenshot]                 │
└──────────────────────────────────────────────────────────┘
```

**Report finale — comprensibile per un non-tecnico:**

```
┌──────────────────────────────────────────────────────────┐
│  📊 REPORT TEST — LobsterCode                           │
│                                                          │
│  Risultato: 🟡 Funziona quasi tutto (8/10 test OK)      │
│                                                          │
│  ✅ PASSATO:                                             │
│  ├── Homepage carica correttamente                       │
│  ├── Navigazione tra pagine funziona                     │
│  ├── Form login accetta credenziali valide               │
│  ├── Dashboard mostra dati dopo login                    │
│  ├── Menu laterale si apre/chiude                        │
│  ├── Pagina settings accessibile                         │
│  ├── Logout funziona                                     │
│  └── Pagina 404 mostrata per URL invalidi                │
│                                                          │
│  🔴 FALLITO:                                             │
│  ├── Bottone "Submit" nella registrazione è disabilitato │
│  │   anche con dati validi                               │
│  │   📸 [Vedi screenshot del problema]                   │
│  │   💡 "Probabilmente manca una validazione nel form.   │
│  │       Chiedi a Claude di controllare il componente    │
│  │       SignUp e la logica di validazione."              │
│  │                                                        │
│  └── Pagina "Profile" mostra errore 500                  │
│      📸 [Vedi screenshot del problema]                   │
│      💡 "L'API /api/profile restituisce errore 500.      │
│          Probabilmente il backend ha un bug in           │
│          quell'endpoint. Controlla i log del container." │
│                                                          │
│  [📋 Copia report per Claude]  [🔄 Ritesta]             │
│  [📤 Esporta report]                                     │
└──────────────────────────────────────────────────────────┘
```

**Tecnologia sotto il cofano:**
- **Playwright** (headless browser automation) per controllare Chrome/Chromium
- Ogni test produce screenshot + video (opzionale)
- L'agente AI (Ollama `qwen3:30b`) analizza gli screenshot per verificare se la UI "sembra giusta"
- Genera report in linguaggio umano
- Il bottone **"Copia report per Claude"** formatta il report come prompt da incollare 
  nella chat Claude per chiedere la fix — chiude il loop vibe-coding

**Flusso completo vibe-coding con Lobster:**
```
1. Sviluppi con Claude → Codice nuovo
2. Lobster rileva: "LobsterCode è cambiato, vuoi testare?"
3. Click "Testa"
4. L'agente naviga la tua app, trova un bug
5. Report: "Bottone rotto in pagina X"
6. Click "Copia report per Claude"  
7. Incolli in Claude: "Questo test ha trovato che..."
8. Claude fixa il bug
9. Torna al punto 2
```

**Questo chiude il loop.** Non devi più testare manualmente. 
L'agente testa, trova problemi, li descrive per Claude, Claude fixa.

### 7.20 Screenshot Differ — "Cosa è Cambiato nella UI?"

Ogni volta che fai una modifica e il dev server fa hot-reload, Lobster può fare 
screenshot prima e dopo e mostrarti visivamente cosa è cambiato.

```
┌──────────────────────────────────────────────────────────┐
│  📸 DIFFERENZE UI — LobsterCode                         │
│                                                          │
│  ┌─────────────────┐    ┌─────────────────┐             │
│  │     PRIMA        │    │     DOPO         │             │
│  │ [Screenshot]     │ →  │ [Screenshot]     │             │
│  │                  │    │                  │             │
│  └─────────────────┘    └─────────────────┘             │
│                                                          │
│  Cambiamenti rilevati:                                   │
│  🔵 Header: il colore è cambiato da blu a verde         │
│  🔵 Bottone "Login": testo cambiato in "Accedi"         │
│  🔵 Footer: aggiunta nuova riga di copyright            │
│                                                          │
│  Sembra giusto? [✅ OK] [❌ Annulla ultima modifica]     │
└──────────────────────────────────────────────────────────┘
```

### 7.21 🧠 Smart Advisor — "Consigli per il Tuo Progetto"

Un consulente intelligente che analizza i tuoi progetti e ti suggerisce miglioramenti 
architetturali, ottimizzazioni, e migrazioni — tutto con azioni one-click.

**Come funziona:** Lobster analizza ogni progetto (struttura file, porte usate, dipendenze, 
come comunica con la rete) e genera consigli personalizzati.

```
┌──────────────────────────────────────────────────────────┐
│  🧠 CONSIGLI PER I TUOI PROGETTI                        │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  🦞 LobsterCode                  CONSIGLIO NUOVO │   │
│  │                                                    │   │
│  │  💡 "Questo progetto fa chiamate API esterne      │   │
│  │      (verso GitHub, Ollama, e altri servizi).     │   │
│  │      Conviene metterlo su Docker per:             │   │
│  │      • Isolarlo dalla rete del Mac                │   │
│  │      • Renderlo portabile su qualsiasi server     │   │
│  │      • Avere un ambiente identico ovunque"        │   │
│  │                                                    │   │
│  │  Difficoltà: 🟢 Facile (Lobster può farlo per te)│   │
│  │                                                    │   │
│  │  [🐳 Dockerizza questo progetto]                  │   │
│  │  [📋 Mostrami come funziona prima]                │   │
│  │  [❌ Non ora]                                      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  🍃 Urban Leaf                    OTTIMIZZAZIONE  │   │
│  │                                                    │   │
│  │  💡 "Il container 'db' usa un'immagine per Intel  │   │
│  │      (linux/amd64). Esiste la versione ARM che    │   │
│  │      gira 3x più veloce sul tuo Mac M-chip."     │   │
│  │                                                    │   │
│  │  Difficoltà: 🟢 Un click                         │   │
│  │                                                    │   │
│  │  [⚡ Passa alla versione ARM]                      │   │
│  │  [📋 Cosa cambia?]                                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  🧪 Decision Lab                 SICUREZZA        │   │
│  │                                                    │   │
│  │  💡 "Questo progetto ha un file .env con API keys │   │
│  │      ma non ha un .gitignore che lo esclude.      │   │
│  │      Le tue chiavi potrebbero finire su GitHub!"   │   │
│  │                                                    │   │
│  │  Difficoltà: 🟢 Un click                         │   │
│  │                                                    │   │
│  │  [🔒 Proteggi le API keys]                        │   │
│  │  [📋 Cos'è .gitignore?]                           │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  📖 Il Romanzo Apocrifo           SUGGERIMENTO    │   │
│  │                                                    │   │
│  │  💡 "Questo progetto di scrittura non ha backup   │   │
│  │      automatico. Se il Mac si rompe, perdi tutto. │   │
│  │      Vuoi attivare il salvataggio su GitHub?"     │   │
│  │                                                    │   │
│  │  Difficoltà: 🟢 Facile                           │   │
│  │                                                    │   │
│  │  [💾 Attiva backup su GitHub]                     │   │
│  │  [📋 Come funziona?]                              │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Tipi di consigli che Lobster genera:**

**🐳 Dockerizzazione:**
- "Questo progetto Node.js fa chiamate API → conviene Docker per isolamento"
- "Hai 3 progetti Python con versioni diverse → Docker evita conflitti"
- Azione: genera automaticamente Dockerfile + docker-compose.yml

**⚡ Performance:**
- "Immagine Docker per Intel su Mac ARM → passa alla versione nativa"
- "node_modules pesa 2GB → usa volume Docker per non duplicare"
- "Il database non ha cache configurata → aggiungi Redis"

**🔒 Sicurezza:**
- ".env con API keys non in .gitignore → proteggilo"
- "Password in chiaro nel docker-compose → usa Docker secrets"
- "Porta esposta su 0.0.0.0 → limita a localhost"

**📦 Struttura:**
- "Progetto senza README → ne creo uno automatico"
- "Nessun .lobster.json → lo configuro per monitoraggio migliore"
- "Progetto contenuti senza Git → attiva versioning"

**🚀 Migrazione con un click:**
Quando Lobster suggerisce di dockerizzare un progetto, il flusso è:
```
1. Click "Dockerizza questo progetto"
2. Lobster analizza: linguaggio, dipendenze, porte usate
3. Genera: Dockerfile, docker-compose.yml, .dockerignore
4. Mostra preview: "Ecco cosa creerò. Va bene?"
5. Click "Conferma"
6. Lobster crea i file e fa il primo build
7. Il progetto appare nel Docker Monitor con semaforo verde
```

**Quando mostrare i consigli:**
- Al primo avvio: analisi completa di tutti i progetti
- Quando si aggiunge un nuovo progetto
- Periodicamente (1 volta a settimana) per nuovi suggerimenti
- Mai più di 3 consigli alla volta (non sovraccaricare)

---

## 8. Principi di Design UX/UI

### 8.0 Principio Zero: A Prova di Imbecille

Questo è il principio fondante che governa OGNI decisione di UI in Lobster Utility.

**Test dell'imbecille:** Se una persona che non ha mai aperto un terminale nella sua vita 
non riesce a capire cosa fare guardando lo schermo per 3 secondi, il design è SBAGLIATO.

Regole operative:
- **Mai più di 3 scelte contemporanee** su qualsiasi schermata
- **Mai testo più piccolo di 14px** — tutto deve essere leggibile senza avvicinarsi
- **Mai gergo tecnico senza traduzione** — ogni termine tecnico ha un tooltip in italiano semplice
- **Mai azioni senza conferma visiva** — se clicco "Riavvia", vedo immediatamente un feedback
- **Mai stati ambigui** — se non so se un progetto è acceso o spento, il design ha fallito
- **Icone GRANDI** — bottoni di almeno 44x44px (standard Apple Human Interface)
- **Colori semantici OVUNQUE** — verde=bene, giallo=attenzione, rosso=problema, grigio=spento
- **Zero configurazione necessaria** — funziona appena lo apri, i dettagli li aggiungi dopo se vuoi
- **Stato vuoto amichevole** — se non ci sono progetti, non mostra uno schermo vuoto ma una guida

**Anti-pattern da evitare:**
- ❌ Tabelle con 10+ colonne di dati
- ❌ Menu dropdown annidati
- ❌ Impostazioni con più di 2 livelli di profondità
- ❌ Messaggi di errore con stack trace
- ❌ Toggle o checkbox senza spiegazione di cosa fanno
- ❌ Terminologia in inglese quando esiste l'equivalente italiano
- ❌ Modale su modale (mai più di 1 overlay alla volta)

### 8.1 Traffic Light System
Ovunque usi il semaforo:
- **🟢 Verde:** OK, no action needed
- **🟡 Giallo:** Attenzione, qualcosa merita considerazione
- **🔴 Rosso:** Problema, action needed

Non usare altri colori. Non usare numeri grezzi. Non usare percentuali a meno che non siano accompagnate da una bar visuale.

### 8.2 Human Language Over Jargon
Regola assoluta: Se un non-tecnico non capisce una frase in 3 secondi, riscrivi.

| ❌ Wrong | ✅ Right |
|---------|---------|
| "TCP *:8000 LISTEN, PID 12345" | "Your Urban Leaf API is running on port 8000" |
| "Container exited with code 137" | "The database ran out of memory and stopped" |
| "SIGTERM received" | "The app received a stop command" |
| "docker-compose project 'proj' missing some images" | "Some Docker images for Urban Leaf need to be downloaded" |
| "Platform linux/amd64 not available for linux/arm64" | "This container was made for Intel Macs. It works on yours but might be slower" |

### 8.3 One-Click Principle
Ogni azione dovrebbe essere:
- Visibile (non nascosta in menu)
- Facile (un click, max due se c'è conferma)
- Reversibile (start/stop, non delete without warning)

One click per:
- Avviare un progetto
- Stopare un progetto
- Vedere i log
- Riavviare un container
- Liberare una porta
- Aprire una cartella

Due click (con conferma) solo per azioni distruttive:
- Cancellare una sessione salvata
- Cancellare database volumes

### 8.4 Progressive Disclosure
Inizia semplice, aggiungi dettagli su richiesta.

**Dashboard (Semplice):**
- Nome progetto, semaforo, una riga di status, timestamp
- Click → Dettagli

**Project Detail (Intermedio):**
- Cosa sta girando (lista semplice), salute (bar grafiche), quick actions
- [Show more details] → Avanzate

**Advanced Debugging (Esperto):**
- Raw logs, resource graphs, system metrics, command line
- Disponibile, ma nascosto per default

### 8.5 Familiar Patterns
UI che Lorenzo conosce già:
- **Card layout:** Come Trello, come macOS Finder
- **Notifications:** Come system alerts, come WhatsApp notifiche
- **Chat interface:** Come ChatGPT, come Messages
- **Terminal:** Come Terminal.app, ma integrato
- **Colors & Icons:** Familiari (disk icon per folder, gear per settings)

### 8.6 LLM: Solo Dove Serve Davvero

**Principio: L'AI NON deve appesantire l'app.** Ollama viene chiamata SOLO in 3 casi specifici,
dove la logica built-in non basta. Tutto il resto funziona con regole statiche, veloci, zero latenza.

**QUANDO SI USA Ollama (mistral-small per triage, qwen3:30b solo se necessario):**

1. **"Chiedi a Lobster"** — La chat libera. L'utente fa una domanda in linguaggio naturale.
   Qui l'LLM è indispensabile perché deve capire intent arbitrario.

2. **Errori complessi non classificabili** — Se il sistema di regole built-in NON riconosce 
   l'errore (non è nei pattern noti), allora lo passa a Ollama per una spiegazione.
   Ma solo allora. Il 80% degli errori sono pattern noti gestiti con regole.

3. **Suggerimenti di ottimizzazione** — Quando l'utente clicca "Ottimizza" nel Resource Monitor,
   l'LLM analizza il contesto complessivo per suggerimenti personalizzati.

**QUANDO NON SI USA Ollama (logica built-in, veloce, zero latenza):**

- Semafori 🟢🟡🔴 → Regole statiche: container running=verde, stopped=rosso, ecc.
- Port conflict → Regola: 2 processi stessa porta = conflitto, mostra nomi progetto
- Container status → Mapping diretto: running/stopped/unhealthy → messaggio predefinito
- Risorse sistema → Soglie: <60% verde, 60-80% giallo, >80% rosso
- Notifiche → Template predefiniti: "Il container X si è fermato. [Riavvia]"
- Azioni one-click → Comandi diretti: docker restart, kill process, ecc.

**Risultato:** L'app è VELOCE. Il 95% delle interazioni non tocca mai Ollama.
Solo la chat e gli errori sconosciuti usano l'LLM, e anche lì con timeout aggressivi.

**Fallback se Ollama non gira:** L'app funziona al 100% per monitoring, semafori, 
azioni, notifiche. Solo la chat "Chiedi a Lobster" mostra: "Ollama non attivo. 
Avvialo per abilitare l'assistente AI."

---

## 9. TypeScript Data Model

Core interfaces per il sistema:

```typescript
// Project Discovery
interface Project {
  id: string;                    // "urban-leaf"
  name: string;                  // "Urban Leaf"
  description?: string;
  path: string;                  // ~/Desktop/Urban Leaf
  type: 'docker-compose' | 'node' | 'python' | 'electron' | 'mixed';
  icon?: string;                 // emoji or path
  discovered_at: Date;
  last_activity: Date;
  config?: ProjectConfig;        // .lobster.json
}

interface ProjectConfig {
  name: string;
  description: string;
  ports: PortConfig[];
  containers: ContainerConfig[];
  quick_commands: QuickCommand[];
}

interface PortConfig {
  port: number;
  service: string;               // "API", "Database", "Cache"
  type: 'internal' | 'external'; // internal = only localhost, external = exposed
}

interface ContainerConfig {
  name: string;
  service: string;
  image?: string;
  critical: boolean;             // If critical, crash = red alert
}

interface QuickCommand {
  label: string;                 // "Start All"
  command: string;               // "docker-compose up -d"
}

// Port Scanning
interface PortInfo {
  port: number;
  pid: number;
  process_name: string;
  process_path: string;
  project_id?: string;           // If auto-mapped
  status: 'listening' | 'established';
  timestamp: Date;
}

interface PortConflict {
  port: number;
  projects: Project[];
  status: 'running' | 'configured';
}

// Docker Monitoring
interface ContainerStatus {
  id: string;
  name: string;
  image: string;
  state: 'running' | 'stopped' | 'exited' | 'paused' | 'dead';
  health: 'healthy' | 'unhealthy' | 'starting' | 'none';
  project_id?: string;
  ports: { internal: number; external?: number }[];
  cpu_percent: number;
  memory_usage: number;          // in MB
  memory_limit?: number;         // in MB
  created_at: Date;
  started_at?: Date;
  last_error?: string;
}

// System Health
interface SystemHealth {
  cpu_percent: number;
  memory_used: number;           // MB
  memory_available: number;      // MB
  disk_used: number;             // MB
  disk_available: number;        // MB
  network_status: 'ok' | 'warning' | 'error';
}

// Terminal
interface TerminalSession {
  id: string;
  project_id: string;
  cwd: string;
  history: TerminalCommand[];
  buffer: TerminalOutput[];
}

interface TerminalCommand {
  input: string;
  timestamp: Date;
  success: boolean;
}

interface TerminalOutput {
  text: string;
  type: 'stdout' | 'stderr' | 'ai_analysis';
  timestamp: Date;
  project_id: string;
}

// AI Layer
interface HumanReadableStatus {
  summary: string;               // "Running fine"
  details: string;               // Multi-line human explanation
  health: 'green' | 'yellow' | 'red';
  suggested_actions: SuggestedAction[];
}

interface SuggestedAction {
  label: string;                 // "Restart Database"
  action: string;                // Internal action ID
  params?: Record<string, any>;
  priority: 'immediate' | 'soon' | 'optional';
}

// Notifications
interface Notification {
  id: string;
  timestamp: Date;
  title: string;
  message: string;
  priority: 'urgent' | 'attention' | 'info';
  actions: NotificationAction[];
  dismissed: boolean;
}

interface NotificationAction {
  label: string;
  action: string;
}
```

---

## 10. Struttura del Progetto (Directory Tree)

```
lobster-utility/
├── src/
│   ├── main/                           # Electron main process
│   │   ├── index.ts                    # Entry point
│   │   ├── ipc-handlers.ts             # IPC message handlers
│   │   └── services/
│   │       ├── project-discovery.service.ts
│   │       ├── port-scanner.service.ts
│   │       ├── docker-monitor.service.ts
│   │       ├── terminal-session.service.ts
│   │       ├── ollama.service.ts       # AI integration
│   │       ├── notification.service.ts
│   │       └── data-formatter.service.ts  # Human-readable translations
│   │
│   ├── renderer/                       # React frontend
│   │   ├── index.tsx                   # Entry point
│   │   ├── App.tsx                     # Main component
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx           # Main dashboard with project cards
│   │   │   ├── ProjectDetail.tsx       # Single project detail view
│   │   │   ├── PortMonitor.tsx         # Port management view
│   │   │   ├── DockerMonitor.tsx       # Container management view
│   │   │   ├── TerminalManager.tsx     # Integrated terminal
│   │   │   ├── AiAssistant.tsx         # "Chiedi a Lobster" chat
│   │   │   └── Settings.tsx            # Settings page
│   │   │
│   │   ├── components/
│   │   │   ├── ProjectCard.tsx         # Dashboard card component
│   │   │   ├── StatusLight.tsx         # Traffic light component
│   │   │   ├── HealthBar.tsx           # CPU/Memory/Disk bar
│   │   │   ├── Terminal.tsx            # xterm.js wrapper
│   │   │   ├── Notification.tsx        # Toast notifications
│   │   │   └── ...
│   │   │
│   │   ├── hooks/
│   │   │   ├── useProjects.ts          # Fetch projects
│   │   │   ├── usePorts.ts             # Fetch port info
│   │   │   ├── useDocker.ts            # Fetch container info
│   │   │   └── useSystemHealth.ts      # System metrics
│   │   │
│   │   ├── styles/
│   │   │   ├── global.css              # Tailwind config
│   │   │   └── theme.css
│   │   │
│   │   └── utils/
│   │       ├── formatters.ts           # Human-readable output
│   │       ├── api.ts                  # Electron IPC client
│   │       └── constants.ts
│   │
│   └── shared/
│       ├── types.ts                    # Shared TypeScript types
│       ├── constants.ts                # Shared constants
│       └── ipc-channels.ts             # IPC channel names
│
├── docs/
│   ├── PROJECT-DOCUMENT.md             # This document
│   ├── ARCHITECTURE.md                 # Detailed architecture
│   ├── SETUP.md                        # Development setup
│   └── CONTRIBUTING.md                 # Contribution guidelines
│
├── electron-builder.config.js          # App packaging config
├── package.json
├── tsconfig.json
├── webpack.config.js                   # If using webpack
└── .lobster.json.example               # Example project config
```

---

## 11. Dipendenze Principali

```json
{
  "dependencies": {
    "electron": "^latest",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.0.0",
    "zustand": "^4.4.0",
    "tailwindcss": "^3.3.0",
    "xterm": "^5.2.0",
    "xterm-addon-fit": "^0.7.0",
    "docker-sdk": "^latest or use CLI wrapper",
    "ollama": "^0.5.0",              // SDK Ollama ufficiale per Node.js — connessione a mistral-small, qwen3:30b, deepseek-r1:32b
    "@anthropic-ai/sdk": "^latest (optional fallback)",
    "electron-store": "^8.5.0 (for persisting settings)",
    "date-fns": "^2.30.0"
  },
  "devDependencies": {
    "@electron/rebuild": "latest",
    "webpack": "^5.0.0",
    "webpack-cli": "^5.0.0",
    "ts-loader": "^9.4.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/parser": "^5.0.0"
  }
}
```

**Note Importanti su Dipendenze:**

1. **Electron:** Versione stabile, con support multi-platform (usiamo solo macOS per v1.0)
2. **Ollama SDK:** Leggero, basta una HTTP call al server Ollama locale
3. **Docker:** O usiamo il Docker CLI wrapper (più stabile) o il full SDK (più complesso)
4. **xterm.js:** Per terminal integrato (standard in app come VS Code)
5. **Zustand:** State management minimalista, non Redux-complexity
6. **Tailwind:** Per styling senza scrivere CSS custom (tema semplice: colori neutri + accent colors)

---

## 12. Piano di Sviluppo: Fasi Semplificate

### Phase 1: Core Foundation + Discovery (Weeks 1-2)
**Goal:** Dashboard funzionante con project discovery

- [x] Setup Electron + React + TypeScript scaffold
- [x] Project discovery service (scan ~/Desktop, parse docker-compose/package.json)
- [x] ProjectDiscoveryService che popola lista progetti
- [x] Basic Dashboard UI with project cards
- [x] Status light (green/yellow/red) basato su stato simple
- [x] IPC communication tra main e renderer

**Deliverable:** Apri app, vedi i tuoi 7 progetti con green lights

### Phase 2: Port + Docker Monitoring (Weeks 3-4)
**Goal:** Visibilità su porte e container

- [x] PortScannerService (lsof polling)
- [x] Port Monitor page con conflict detection
- [x] DockerMonitorService (docker daemon integration)
- [x] Docker Monitor page con container list
- [x] Resource usage display (CPU, Memory bars)
- [x] One-click actions: Stop/Start/Restart containers

**Deliverable:** Vedi quali porte sono occupate, quali container sono sani, quick actions funzionano

### Phase 3: Terminal + AI Layer (Weeks 5-6)
**Goal:** Integrated terminal e AI-powered assistance

- [x] TerminalSessionManager (xterm.js)
- [x] Terminal per progetto, color-coded
- [x] OllamaService connection (test local Ollama)
- [x] "Chiedi a Lobster" chat interface
- [x] AI error analysis (auto-explain log errors)
- [x] DataFormatterService (human-readable translations)

**Deliverable:** Puoi digitare comandi nel terminal integrato, fare domande in chat, ricevere risposte intelligenti

### Phase 4: Notifications + Polish (Weeks 7-8)
**Goal:** Notifiche intelligenti, settings, packaging

- [x] macOS native notifications
- [x] In-app toast notifications
- [x] Smart grouping (non spam)
- [x] Settings page (minimal, sensible defaults)
- [x] Dark/Light theme toggle
- [x] electron-builder per packaging .dmg/.app
- [x] Auto-update mechanism
- [x] First-run setup wizard

**Deliverable:** Fully polished app, pronto per distribution

### Phase 5: Advanced Features (Post-v1.0)
- Auto-restart on crash with backoff
- Git integration (show recent commits per project)
- Performance profiling (which container is slowest?)
- Custom `.lobster.json` editor UI
- Project templates for new projects
- Integration con Claude API per richer AI responses

---

## 13. Rischi e Mitigazioni

### Rischio 1: Ollama Non Disponibile
**Impatto:** AI features non funzionano
**Mitigazione:** 
- Health check all'avvio
- Fallback a logica built-in per problemi comuni
- Notify user: "Ollama non connesso. Funzionalità limitate ma app ancora usabile"

### Rischio 2: Docker Daemon Non Reachable
**Impatto:** Docker monitoring non funziona
**Mitigazione:**
- Health check all'avvio
- Graceful degradation: mostra "Docker non disponibile"
- Suggerisci "Apri Docker Desktop"
- App funziona comunque per i progetti non-Docker

### Rischio 3: Performance Degradation (Molti Container/Porte)
**Impatto:** UI lag se 50+ container o 100+ porte
**Mitigazione:**
- Polling intervals configurabili
- Lazy loading: mostra solo il progetto attivo in dettaglio
- Virtual scrolling per liste lunghe
- Cache aggressivo

### Rischio 4: User Configurazione Complessa
**Impatto:** Non-tecnici non sanno come configurare custom ports
**Mitigazione:**
- Zero-config per default (auto-discovery)
- Se auto-discovery fallisce, mostra wizard semplice (3 domande max)
- `.lobster.json` è opzionale, non obbligatorio

### Rischio 5: Data Loss (Se Session Viene Cancellata)
**Impatto:** Terminal history perso
**Mitigazione:**
- Salva sessions su file (electron-store)
- Backup automatico
- Explicit confirmation prima di delete

---

## 14. Prima vs Dopo: Quanto Cambia la Vita di Lorenzo

### Scenario Prima (Senza Lobster)

**Mattina: "Voglio iniziare a lavorare su Urban Leaf"**

1. Apri VS Code
2. Apri Terminal.app, crea una finestra
3. `cd ~/Desktop/Urban\ Leaf`
4. `docker-compose up -d`
5. Aspetta 20 secondi
6. Chiedi: "È tutto su?" Devi fare `docker ps` manualmente per vedere
7. Apri una seconda finestra terminal per continuare a lavorare
8. Dopo 1 ora: "Perché il server non risponde?" Apri Activity Monitor, vedi 50 processi, non capisci quale è il tuo
9. Scopri che il database ha crashato per memoria. Devi digitare `docker logs <container_id>` per trovare l'errore
10. Riavvii manualmente: `docker-compose restart db`
11. Torna al lavoro

**Tempo perso:** 10-15 minuti di setup + debug

### Scenario Dopo (Con Lobster)

**Mattina: "Voglio iniziare a lavorare su Urban Leaf"**

1. Apri Lobster Utility (è aperta sul secondary monitor, always-on)
2. Vedi la card Urban Leaf con 🟢
3. Click su Urban Leaf card
4. Vedi: "8 container sani, API on :8000, memoria OK"
5. Se qualcosa è giallo: Click su [Riavvia Database] se serve
6. Torna al lavoro. Se il database crasha: ricevi una notifica macOS "Database di Urban Leaf è crashato. Memoria insufficiente. [Riavvia]"
7. Click sulla notifica, database riparte

**Tempo perso:** 30 secondi di setup + 0 minuti di debug (Lobster ti avvisa)

**Gain:** 10+ minuti di productivity gain, peace of mind, niente sorprese

---

## 15. Appendice: Sample Configurations e Prompt Templates

### Sample `.lobster.json` (Nel Progetto Urban Leaf)

```json
{
  "name": "Urban Leaf",
  "description": "FastAPI backend with 8-container compose setup",
  "type": "docker-compose",
  "icon": "🍃",
  "ports": [
    {
      "port": 8000,
      "service": "API",
      "type": "external",
      "health_check_url": "http://localhost:8000/health"
    },
    {
      "port": 8001,
      "service": "Swagger UI",
      "type": "external"
    },
    {
      "port": 5432,
      "service": "PostgreSQL Database",
      "type": "internal"
    },
    {
      "port": 6379,
      "service": "Redis Cache",
      "type": "internal"
    }
  ],
  "containers": [
    {
      "name": "api",
      "service": "API Server",
      "image": "python:3.11-slim",
      "critical": true
    },
    {
      "name": "db",
      "service": "PostgreSQL",
      "image": "postgres:15",
      "critical": true
    },
    {
      "name": "redis",
      "service": "Cache",
      "image": "redis:7-alpine",
      "critical": false
    },
    {
      "name": "worker",
      "service": "Celery Worker",
      "image": "python:3.11-slim",
      "critical": false
    }
  ],
  "quick_commands": [
    {
      "label": "Start All",
      "command": "docker-compose up -d"
    },
    {
      "label": "Stop All",
      "command": "docker-compose down"
    },
    {
      "label": "View Logs",
      "command": "docker-compose logs -f"
    },
    {
      "label": "Database Migrate",
      "command": "docker-compose exec api alembic upgrade head"
    },
    {
      "label": "Restart Database",
      "command": "docker-compose restart db"
    }
  ]
}
```

### Prompt Templates per Modello (dal tuo ecosistema Ollama)

**I modelli usati sono quelli già nel tuo stack Burryllama/Super-Sapiens-LLM:**
- `mistral-small` → Triage (2-5s su Apple Silicon Metal)
- `qwen3:30b` → Analisi approfondita (10-20s su Apple Silicon Metal)
- `deepseek-r1:32b` → Troubleshooting complesso con chain-of-thought (30-60s)
- `mistral:7b` → Fallback leggero se i modelli grandi non sono caricati

#### Prompt 1: Triage Veloce (`mistral-small`)

```
[SYSTEM] Sei il modulo di triage di Lobster Utility. Classifica il problema in:
- "simple": porta occupata, container stopped, processo zombie
- "medium": errore nei log, health check fallito, performance degradata
- "complex": cascade failure, errori multipli correlati, configurazione rotta

Rispondi SOLO con JSON: {"complexity": "simple|medium|complex", "category": "port|docker|process|memory|disk|network", "summary": "una frase"}

[CONTEXT]
Container: {CONTAINER_STATUS_JSON}
Porte: {PORTS_JSON}
Errore: {ERROR_LOG}
Memoria: {AVAILABLE_MEMORY} / CPU: {CPU_PERCENT}%
```

#### Prompt 2: Analisi per Non-Tecnici (`qwen3:30b`)

```
[SYSTEM] Tu sei Lobster, un assistente amichevole che spiega problemi tecnici 
a persone che costruiscono software con l'AI ma NON sono ingegneri.

REGOLE FERREE:
- Rispondi SOLO in italiano naturale, massimo 3 frasi
- MAI menzionare: PID, socket, TCP, indirizzi IP, file descriptor, signal
- Spiega COSA è successo come se parlassi a un amico non-tecnico
- Suggerisci COME risolvere con un'azione semplice
- Se puoi automatizzare, indica: [ACTION: tipo:target]

[CONTEXT]
Progetto: {PROJECT_NAME} ({PROJECT_DESCRIPTION})
Tutti i progetti attivi: {ACTIVE_PROJECTS}
Stato container: {CONTAINER_STATUS_JSON}
Porte in uso: {PORTS_JSON}
Risorse: {AVAILABLE_MEMORY} RAM libera, CPU al {CPU_PERCENT}%

[TRIAGE PRECEDENTE]
{TRIAGE_RESULT}

[ERRORE/EVENTO]
{ERROR_LOG}

[DOMANDA UTENTE]
{USER_QUESTION}
```

#### Prompt 3: Deep Analysis (`deepseek-r1:32b`)

```
[SYSTEM] Sei un esperto di infrastruttura che deve spiegare problemi complessi 
a un creatore non-tecnico. Usa reasoning step-by-step interno, poi fornisci 
una spiegazione semplice.

Analizza la catena di causa-effetto. Identifica la ROOT CAUSE.
Proponi una soluzione ordinata per passi, dove ogni passo è un'azione cliccabile.

Formato risposta:
SPIEGAZIONE: (1-2 frasi in italiano semplice, nessun gergo)
CAUSA: (cosa ha causato il problema, in termini umani)
SOLUZIONE:
1. [ACTION: tipo:target] — Descrizione semplice
2. [ACTION: tipo:target] — Descrizione semplice
3. ...
PREVENZIONE: (come evitare che ricapiti, 1 frase)

[CONTEXT COMPLETO]
Progetto: {PROJECT_NAME}
Architettura: {PROJECT_ARCHITECTURE}
Container: {FULL_CONTAINER_STATUS}
Porte: {FULL_PORT_MAP}
Risorse sistema: RAM {TOTAL_RAM}/{AVAILABLE_RAM}, CPU {CPU_PERCENT}%, Disk {DISK_PERCENT}%
Log ultimi 5 minuti: {RECENT_LOGS}
Errori correlati: {CORRELATED_ERRORS}

[TRIAGE]
{TRIAGE_RESULT}
```

#### Prompt 4: "Chiedi a Lobster" — Chat Libera (`qwen3:30b` o `mistral-small` per domande semplici)

```
[SYSTEM] Sei Lobster, il tuo assistente per gestire i progetti sul Mac.
Conosci esattamente cosa sta girando in questo momento.
Rispondi come un collega amichevole, in italiano.
Se l'utente chiede di fare qualcosa, indica l'azione: [ACTION: tipo:target]

Stato attuale del Mac:
{FULL_SYSTEM_STATE}

Conversazione precedente:
{CHAT_HISTORY}

Utente: {USER_MESSAGE}
```

### Sample AI Responses

```
ERRORE: "Container exited with code 137"
RISPOSTA: "Il database di Urban Leaf si è fermato improvvisamente. 
Probabilmente è rimasto senza memoria. Il tuo Mac sta usando 15GB su 16GB.
[ACTION: restart_container:urban_leaf_db] Poi controlla se hai app pesanti aperte."

ERRORE: "Address already in use: 0.0.0.0:3000"
RISPOSTA: "Due progetti vogliono usare la porta 3000. 
LobsterCode e Decision Lab sono entrambi configurati su questa porta.
Quale di questi vuoi avviare? [ACTION: resolve_port_conflict:3000]"

DOMANDA: "Perché il mio progetto è lento?"
RISPOSTA: "Analizziamo...
Il worker di Urban Leaf sta usando il 40% della CPU. Questo è normale se sta elaborando task.
La memoria disponibile è bassa (solo 1GB free). Questo potrebbe causare rallentamenti.
Suggerimento: Chiudi app pesanti (Chrome con molti tab?) e riavvia il worker.
[ACTION: restart_container:urban_leaf_worker]"

DOMANDA: "Come avvio Decision Lab?"
RISPOSTA: "Decision Lab è pronto. Basta un click:
[ACTION: start_project:decision-lab]
Ci vorranno ~30 secondi perché Ollama carichi il modello di linguaggio."
```

---

## 16. Conclusione: Visione a Lungo Termine

Lobster Utility non è solo uno strumento per Lorenzo. È il pattern che emergerà come standard per vibe-coders nel 2026 e oltre.

Nel 2025, l'AI scrive il codice.  
Nel 2026, chi gestisce l'infrastruttura su cui quel codice gira?  

La risposta non sarà "sviluppatori senior e DevOps engineer".  
Sarà creatori come Lorenzo che usano AI per costruire, e strumenti come Lobster per gestire.

Lobster Utility è quel strumento. È il **cockpit amichevole** per il vibe-coder. È il **traduttore** tra la complessità tecnica e la visione umana.

Con Lobster:
- Lorenzo apre una finestra e **sa esattamente cosa sta girando**
- Se qualcosa va male, **capisce perché in italiano naturale**
- Se ha una domanda, **chiede a un assistente che conosce il contesto**
- Se vuole fare qualcosa, **un click, non 5 step in terminal**

Niente stress. Niente sorprese. Niente 10+ minuti persi ogni mattina.

Solo Lorenzo, il suo Mac, Lobster nel background, e il codice che funziona.

---

**Fine del Documento di Progetto**  
**Versione 2.0 — Completamente Riconsiderato per Vibe-Coders**  
**Data: 12 Aprile 2026**

