# Lobster Utility — Stato Implementazione

## Ultima modifica: 2026-04-12 (sessione 2)

## Architettura
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Zustand + Vite
- **Backend**: Electron main process + TypeScript + CommonJS
- **IPC Bridge**: contextBridge + ipcRenderer.invoke pattern
- **Dev**: `npm run dev` → concurrently Vite + tsc --watch + Electron

## Sezioni Implementate

### 1. Dashboard ("Il Mio Mondo") ✅
- Griglia progetti con traffic light (green/yellow/red/gray)
- SystemHealthBar (CPU/RAM/Disco con barre colorate)
- ActivePortsSummary (porte in ascolto)
- Quick stats (totali/attivi/fermi/errori)
- Project cards con 3 bottoni etichettati: Cartella, Terminale, VS Code + Apri browser
- Bottone Aggiorna

### 2. Port Monitor ("Porte") ✅
- Tabella porte con ricerca e ordinamento
- Kill process con modale conferma
- Copia URL, apri nel browser
- Empty state quando nessuna porta attiva

### 3. Docker Monitor ("Docker") ✅
- Container raggruppati per Compose project
- Avvia/Ferma/Riavvia singolo container
- Avvia/Ferma tutto per progetto Compose
- Viewer log inline
- Metriche CPU/RAM per container

### 4. Smart Advisor ("Consulente") ✅
- Backend: SmartAdvisorService con multi-model routing Ollama
  - Triage: mistral-small (rapido)
  - Analysis: qwen3:30b (dettaglio)
  - Deep: deepseek-r1:32b (ragionamento)
  - Fallback automatico su modelli disponibili
- UI: Pannello con stato Ollama, selezione progetto, analisi, suggerimenti
- Rilevamento automatico modelli installati
- Istruzioni di setup Ollama se non disponibile

### 5. UI Test Agent ("Test UI") ✅
- Backend: UITestAgentService con health check HTTP
  - Raggiungibilità URL
  - Tempo di risposta
  - Content type verification
  - Sicurezza (HTTPS check)
  - Error pattern detection nella pagina
- UI: Test manuale per URL, test singolo progetto, test tutti
- Result cards espandibili con dettaglio check

### 6. Impostazioni ⏳
- Placeholder — da implementare nella prossima fase

## Servizi Backend

| Servizio | File | Stato |
|----------|------|-------|
| ProjectDiscoveryService | project-discovery.service.ts | ✅ Wired |
| PortScannerService | port-scanner.service.ts | ✅ Wired + polling |
| DockerMonitorService | docker-monitor.service.ts | ✅ Wired + polling |
| ResourceMonitorService | resource-monitor.service.ts | ✅ Wired + polling |
| NotificationService | notification.service.ts | ✅ Wired |
| DesktopShortcutService | desktop-shortcut.service.ts | ✅ Wired |
| SmartAdvisorService | smart-advisor.service.ts | ✅ New |
| UITestAgentService | ui-test-agent.service.ts | ✅ New |

## Data Flow

```
Electron Main → IPC Handlers → Services (Port/Docker/Resource/Advisor/UITest)
      ↓ (events + polling)
contextBridge (preload.ts) → window.lobster API
      ↓
React Hooks (useLobster.ts) → usePorts, useProjects, useResources, useDocker
      ↓
UI Components → Dashboard, PortMonitor, DockerMonitor, SmartAdvisor, UITestAgent
```

## Project Enrichment
- Ogni 15 secondi + su eventi ports/docker
- Correla porte attive con progetti scoperti
- Correla Docker containers via label `com.docker.compose.project`
- Rileva branch Git
- Aggiorna traffic light: green (running), yellow (partial), red (error), gray (stopped)

## Sidebar Navigation (6 voci)
1. 🏠 Il Mio Mondo (dashboard)
2. 🔌 Porte (port monitor)
3. 🐳 Docker (docker monitor)
4. 🧠 Consulente (smart advisor)
5. 🧪 Test UI (ui test agent)
6. ⚙️ Impostazioni (settings)

## Build & Run
```bash
# Dev
npm run dev

# Build production
npm run build

# Package as DMG
npm run package

# Tests
npm test
```

## File chiave modificati in questa sessione
- `src/main/index.ts` — Wiring completo servizi, enrichment, IPC advisor/uitest
- `src/main/preload.ts` — API advisor + uitest
- `src/main/services/smart-advisor.service.ts` — NEW
- `src/main/services/ui-test-agent.service.ts` — NEW
- `src/renderer/App.tsx` — Aggiunta voci sidebar advisor/uitest
- `src/renderer/store/index.ts` — Nuovi view types
- `src/renderer/types/window.d.ts` — API advisor + uitest
- `src/renderer/components/Dashboard/Dashboard.tsx` — Fix bottoni, fix webUrl
- `src/renderer/components/SmartAdvisor/SmartAdvisor.tsx` — NEW
- `src/renderer/components/UITestAgent/UITestAgent.tsx` — NEW
