# Lobster Manager — Audit Report Completo

**Data:** 2026-04-22  
**Versione:** 0.1.0 (build appena completato)  
**Auditor:** Claude (CTO/Architect)

---

## Indice

1. [Bug Critici Trovati e Risolti (sessioni precedenti)](#bug-critici-trovati-e-risolti)
2. [AUDIT COMPLETO — Problemi Critici](#audit-completo--problemi-critici)
3. [AUDIT COMPLETO — Problemi Alti](#audit-completo--problemi-alti)
4. [AUDIT COMPLETO — Problemi Medi](#audit-completo--problemi-medi)
5. [AUDIT COMPLETO — Problemi Bassi](#audit-completo--problemi-bassi)
6. [Riepilogo Azioni Prioritarie](#riepilogo-azioni-prioritarie)

---

## Bug Critici Trovati e Risolti

Questi bug sono stati trovati e fixati nelle sessioni precedenti. Il build del 22/04 li include tutti.

### 1. Project Discovery — Scan solo primo livello
**File:** `src/main/services/project-discovery.service.ts`  
**Fix:** Ricorsione fino a profondità 2 (`scanDirectoryRecursive`).

### 2. Container Matching — Progetti Docker offline non rilevati (urban leaf)
**File:** `src/main/index.ts` (enrichProjects)  
**Fix:** Fallback matching per container name + directory name. Rimosso vincolo `project.type === 'docker-compose'`.

### 3. Nessun Rescan Manuale
**File:** `src/main/index.ts`, `preload.ts`, `types/index.ts`  
**Fix:** IPC `PROJECTS_RESCAN`, pulsante "Aggiorna" in Dashboard.

### 4. Streaming LobsterCode Broken
**File:** `src/main/services/lobstercode.service.ts`  
**Fix:** Riscritto con `http.request` nativo Node.js.

### 5. Permission Mode Mismatch
**File:** `src/renderer/components/LobsterCode/LobsterCode.tsx`  
**Fix:** Mapping bidirezionale frontend<->backend.

### 6. Flusso Consulente -> LobsterCode Non Funzionante
**File:** `src/renderer/components/LobsterCode/LobsterCode.tsx`  
**Fix:** useEffect dedicato per pendingFixPrompt.

### 7. Stop/Start Container dalla Dashboard
**File:** `src/renderer/components/Dashboard/Dashboard.tsx`  
**Fix:** Pulsanti Stop (Square) e Start (Play) per container, con loading spinner.

### 8. Settings Rescan — Cambio directory scansione
**File:** `src/main/index.ts`  
**Fix:** Rescan automatico quando cambiano le directory nelle impostazioni.

### 9. Port Ownership — Falsi positivi porte Urban Leaf
**File:** `src/main/index.ts` (enrichProjects)  
**Fix:** Verifica ownership via CWD mapping e container ports.

---

## AUDIT COMPLETO — Problemi Critici

### C1. electron-store ESM/CJS mismatch — SETTINGS PERSI AD OGNI RIAVVIO
**File:** `package.json` (electron-store ^8.2.0), `src/main/index.ts` (riga 40, 90-107)  
**Problema:** `electron-store` v8+ e' ESM-only, ma il main process usa CommonJS. L'import fallisce con `ERR_REQUIRE_ESM`. Il `try/catch` a riga 90-107 maschera l'errore e usa un fallback in-memory. Risultato: tutte le impostazioni vengono perse ad ogni riavvio dell'app.  
**Impatto:** CRITICO — l'utente configura directory, tema, Docker, ma tutto sparisce al restart.  
**Fix necessario:** Downgrade a `electron-store@6.x` (ultima versione CJS) oppure ristrutturare il main process per ESM.

### C2. LobsterCode abort() NON ferma la richiesta HTTP
**File:** `src/main/services/lobstercode.service.ts` (riga ~1276)  
**Problema:** `abort()` imposta solo `this.isGenerating = false` ma non distrugge la connessione HTTP attiva verso Ollama. La response continua a streamare e le tool calls (write_file, edit_file, bash) continuano ad eseguirsi.  
**Impatto:** CRITICO — rischio di modifica file dopo che l'utente ha premuto "Stop".  
**Fix necessario:** Salvare il riferimento a `http.ClientRequest` e chiamare `.destroy()` in `abort()`.

### C3. Sistema Notifiche completamente morto
**File:** `src/renderer/App.tsx` (righe 95-106), `src/renderer/store/index.ts`, `src/renderer/hooks/useLobster.ts`  
**Problema:** Il pulsante "Notifiche" nella sidebar NON ha click handler. Lo store ha `notifications`, `addNotification`, `markNotificationRead` ma nessun componente li usa. `useNotifications()` e' importato ma mai chiamato. `unreadCount` e' letto ma mai incrementato. Il badge mostra sempre 0.  
**Impatto:** CRITICO — l'utente vede un pulsante notifiche che non fa nulla. Le notifiche arrivano (il backend le genera e le invia via IPC) ma non vengono mai mostrate.  
**Fix necessario:** Creare un pannello NotificationPanel e collegarlo al pulsante + allo store.

### C4. fs.watch() handles mai chiusi — file descriptor leak
**File:** `src/main/services/project-discovery.service.ts` (righe 389-395)  
**Problema:** `startWatching()` crea `fs.watch()` handles ma salva solo metadata, non il `FSWatcher` oggetto. `stopWatching()` svuota la mappa metadata ma non chiama `watcher.close()`. Ogni cambio di settings che trigga stopWatching+startWatching leaka watchers.  
**Impatto:** CRITICO — esaurimento file descriptors nel tempo.  
**Fix necessario:** Salvare `FSWatcher` e chiamare `.close()` in `stopWatching()`.

### C5. Command injection in gitCommit()
**File:** `src/main/services/lobstercode.service.ts` (riga ~438)  
**Problema:** `exec(\`git add -A && git commit -m "${message.replace(/"/g, '\\"')}"\`)` — solo i doppi apici sono escaped. Backtick, `$()`, e singoli apici possono iniettare comandi shell.  
**Impatto:** CRITICO — sicurezza, esecuzione comandi arbitrari.  
**Fix necessario:** Usare `execFile` con argomenti array invece di `exec` con stringa.

### C6. window.d.ts manca mnemo, code e rescan
**File:** `src/renderer/types/window.d.ts`  
**Problema:** `window.lobster.mnemo` e `window.lobster.code` (decine di metodi) non sono dichiarati nel type. Anche `projects.rescan` manca. Tutti i componenti usano `(window as any).lobster` per aggirare il problema.  
**Impatto:** CRITICO per manutenibilita' — zero type safety su meta' delle API. Rinominare un metodo nel preload non genera errori di compilazione.  
**Fix necessario:** Aggiornare `window.d.ts` con tutti i metodi di preload.ts.

### C7. shortcuts:create-all — mismatch argomenti
**File:** `preload.ts` (riga 65): invia zero argomenti. `index.ts` (riga 751): handler aspetta `projects: Project[]`.  
**Problema:** `createAll()` viene sempre chiamato senza argomenti, l'handler riceve `undefined`, crash quando itera.  
**Impatto:** CRITICO — il pulsante "Crea tutti gli shortcut" crasherebbe.  
**Fix necessario:** L'handler deve recuperare i progetti internamente, non aspettarli come argomento.

---

## AUDIT COMPLETO — Problemi Alti

### H1. enrichProjects() — CWD matching troppo largo
**File:** `src/main/index.ts` (righe ~1193-1199)  
**Problema:** `projLower.startsWith(cwdLower)` fa match se il CWD e' una directory genitore (es. `/Users/user`). Processi di sistema con CWD nella home vengono attribuiti al primo progetto che matcha.  
**Fix:** Richiedere che il CWD sia DENTRO la directory del progetto, non il contrario.

### H2. settings:reset non propaga ai servizi
**File:** `src/main/index.ts` (righe 1102-1114)  
**Problema:** A differenza di `SETTINGS_UPDATE` che propaga a tutti i servizi, `settings:reset` sovrascrive solo lo store. Port scanner, Docker, MNEMO continuano con la vecchia config fino al riavvio.  
**Fix:** Propagare il reset a tutti i servizi come fa l'update.

### H3. LobsterCode pendingFixPrompt — stale closure
**File:** `src/renderer/components/LobsterCode/LobsterCode.tsx` (righe 261-282)  
**Problema:** Il useEffect dipende da `[pendingFixPrompt, status?.available, isGenerating]` ma chiama `handleSendMessage` che non e' nelle dipendenze. Closure stale possibile.  
**Fix:** Aggiungere `handleSendMessage` alle dipendenze o usare `useRef`.

### H4. Doppia creazione snapshot per write operations
**File:** `src/main/services/lobstercode.service.ts` (righe ~1209-1226)  
**Problema:** Ogni `write_file`/`edit_file` crea DUE snapshot — uno a riga 1211, un altro nel callback `onSnapshot`. Spreco memoria, rollback confuso.  
**Fix:** Rimuovere una delle due creazioni snapshot.

### H5. Kill process — nessun feedback errore
**File:** `src/renderer/components/PortMonitor/PortMonitor.tsx` (righe 203-213)  
**Problema:** Il catch chiude il modale con commento "notification will appear from backend" — ma le notifiche non vengono mai mostrate (vedi C3). L'utente non sa se il kill ha funzionato.  
**Fix:** Aggiungere feedback visivo diretto (toast o alert inline).

### H6. setInterval enrichProjects mai cleared
**File:** `src/main/index.ts` (riga ~1768)  
**Problema:** `setInterval(() => enrichProjects(), 15000)` — il return value non e' salvato, impossibile fermarlo al quit.  
**Fix:** Salvare il timer e cleararlo in `before-quit`.

### H7. DockerMonitor — nessun poll iniziale
**File:** `src/main/services/docker-monitor.service.ts` (riga ~332)  
**Problema:** `startPolling()` imposta solo `setInterval`, nessun poll immediato. I dati Docker arrivano solo dopo il primo intervallo (secondi).  
**Fix:** Chiamare `poll()` subito prima di `setInterval`.

---

## AUDIT COMPLETO — Problemi Medi

### M1. Tutti gli handler Dashboard senza try/catch
**File:** `src/renderer/components/Dashboard/Dashboard.tsx`  
`handleOpenFolder`, `handleOpenTerminal`, `handleOpenVSCode`, `handleOpenUrl` — nessun try/catch. Click falliti silenziosamente.

### M2. Container stop/start — solo console.error su fallimento
**File:** `src/renderer/components/Dashboard/Dashboard.tsx` (righe 172-199)  
L'utente vede lo spinner sparire senza sapere se l'operazione ha funzionato.

### M3. DockerMonitor — container actions falliscono silenziosamente
**File:** `src/renderer/components/DockerMonitor/DockerMonitor.tsx`  
`handleAction` e `handleComposeAction` loggano errori in console ma non mostrano nulla all'utente.

### M4. PortScanner usa execSync — blocca il main thread
**File:** `src/main/services/port-scanner.service.ts` (riga ~55)  
`lsof -iTCP -sTCP:LISTEN -P -n` gira in modo sincrono. Su sistemi con molte connessioni, causa UI jank.

### M5. ResourceMonitor — `top -l 1` blocca per ~1 secondo
**File:** `src/main/services/resource-monitor.service.ts` (riga ~65)  
Combinato con `vm_stat` e `ps` sincroni, ogni poll risorse impiega 2-3 secondi sul main thread.

### M6. enrichProjects() — execSync per git branch, per progetto, sequenziale
**File:** `src/main/index.ts` (righe ~1379-1387)  
Con 10+ progetti, lentezza significativa nell'enrichment ciclico.

### M7. SmartAdvisor.analyzeProject() — commento dice "never throws" ma puo' lanciare
**File:** `src/main/index.ts` (riga ~891), `smart-advisor.service.ts` (riga ~202-205)  
L'handler non ha try/catch, errori si propagano non gestiti al renderer.

### M8. Emoji regex troppo stretto in DesktopShortcutService
**File:** `src/main/services/desktop-shortcut.service.ts` (riga ~127)  
`(.)` matcha un solo char ma molti emoji sono multi-character. Shortcut con emoji complesse non vengono trovati da `getShortcuts()`.

### M9. Settings: nessuna conferma prima del reset
**File:** `src/renderer/components/Settings/Settings.tsx` (riga ~391)  
Un misclick cancella tutte le impostazioni senza `window.confirm()`.

### M10. Notifiche: rate limit condiviso tra eventi non correlati
**File:** `src/main/services/notification.service.ts` (riga ~88)  
CPU, RAM, disco e porte condividono la chiave `__global__`. Un alert CPU sopprime un alert disco entro 5 secondi.

### M11. Permission dropdown LobsterCode non si chiude su click esterno
**File:** `src/renderer/components/LobsterCode/LobsterCode.tsx` (righe ~598-634)  
Nessun click-outside handler.

### M12. Store: `selectedProjectId`, `selectProject`, `clearSelection` mai usati
**File:** `src/renderer/store/index.ts`  
Dead code — SmartAdvisor ha il suo state locale.

### M13. Mnemo config key flat vs nested
**File:** `src/renderer/components/Mnemo/Mnemo.tsx` (riga ~505)  
`updateConfig({ "compression.enabled": true })` — chiave flat, il backend potrebbe aspettarsi oggetto nested.

### M14. Dual notification state (hook vs store)
**File:** `src/renderer/hooks/useLobster.ts` (righe 85-90), `src/renderer/store/index.ts`  
`useNotifications` e lo store hanno stati separati mai sincronizzati.

---

## AUDIT COMPLETO — Problemi Bassi

### L1. Import inutilizzati
- `PortMonitor.tsx`: `Filter`
- `DockerMonitor.tsx`: `WifiOff`
- `LobsterCode.tsx`: `RefreshCw`, `Lock`
- `Dashboard.tsx`: `MoreHorizontal`
- `App.tsx`: `useNotifications` (importato, mai usato)

### L2. react-router-dom in dependencies ma mai usato
L'app usa state-based view switcher, non router. Dead weight nel bundle.

### L3. IPC channels definiti ma mai usati
`PORTS_SUBSCRIBE`, `DOCKER_SUBSCRIBE`, `PROJECTS_SUBSCRIBE`, `RESOURCES_SUBSCRIBE` — nessun handler, nessun invocazione.

### L4. Tipi definiti ma mai usati in shared/types
`TerminalSession`, `PortConflict`, `PortChangeEvent`, `DockerEvent`, `ProjectResources`, `QuickCommand`.

### L5. LobsterCode valori hardcoded
- Model default `gemma4:latest`
- `num_ctx: 8192`
- `MAX_TURNS = 10`
- bash timeout `30000ms`
- Max 20 snapshots

### L6. SmartAdvisor — fallback chain modelli hardcoded
`['mistral-small', 'mistral', 'llama3.2', 'llama3', 'qwen', 'gemma']` non configurabile.

### L7. Mnemo auto-start — solo 3 path hardcoded per `mnemo_server.py`

### L8. Docker container stats sequenziali (no parallelizzazione)
`inspect()` + `getContainerStats()` per container, uno alla volta. `Promise.all` sarebbe molto piu' veloce.

### L9. ToolCallCard args mostra sempre "..." anche se la stringa e' corta
**File:** `LobsterCode.tsx` (riga ~1415)

### L10. build-app.sh copia in /Applications senza conferma
`rm -rf "/Applications/$APP_NAME"` senza prompt.

### L11. postcss.config.js warning ESM
Risoluzione: aggiungere `"type": "module"` a package.json o rinominare in `.mjs`.

---

## Riepilogo Azioni Prioritarie

### Blocco 1 — DA FARE SUBITO (crash/data loss/sicurezza)

| # | Problema | Sforzo |
|---|---------|--------|
| C1 | Downgrade electron-store a v6 (settings persi) | 5 min |
| C2 | Abort HTTP reale in LobsterCode | 15 min |
| C3 | Creare NotificationPanel + collegare store | 1-2 ore |
| C4 | Fix fs.watch leak | 10 min |
| C5 | Fix command injection gitCommit | 10 min |
| C7 | Fix shortcuts:create-all argomenti | 5 min |

### Blocco 2 — ALTA PRIORITA' (UX rotta)

| # | Problema | Sforzo |
|---|---------|--------|
| H1 | Fix CWD matching troppo largo | 15 min |
| H2 | Propagare settings:reset ai servizi | 15 min |
| H5 | Feedback visivo kill process | 10 min |
| H7 | Poll Docker iniziale | 5 min |
| C6 | Aggiornare window.d.ts | 30 min |

### Blocco 3 — MEDIA PRIORITA' (performance/robustezza)

| # | Problema | Sforzo |
|---|---------|--------|
| M1-M3 | Toast/snackbar globale per errori | 1 ora |
| M4-M6 | Convertire exec sincroni in asincroni | 1 ora |
| M9 | Conferma prima di reset settings | 5 min |
| M10 | Rate limit separato per tipo notifica | 10 min |

### Blocco 4 — BASSA PRIORITA' (cleanup)

| # | Problema | Sforzo |
|---|---------|--------|
| L1-L4 | Rimuovere import/types/deps inutilizzati | 15 min |
| L5-L7 | Rendere configurabili i valori hardcoded | 30 min |
| L8 | Parallelizzare Docker stats | 15 min |

---

## Stato Build

**Build 22/04/2026 completato con successo:**
- Renderer: Vite 6.4.2, 1595 moduli, 287 KB JS
- Main: TypeScript compilato
- Icona: .icns generata
- Package: DMG arm64 creato
- Warning: postcss.config.js module type (non bloccante)

Tutti i fix delle sessioni precedenti (1-9) sono inclusi nel build. I problemi dell'audit completo (C1-C7, H1-H7, M1-M14, L1-L11) sono documentati e da risolvere.
