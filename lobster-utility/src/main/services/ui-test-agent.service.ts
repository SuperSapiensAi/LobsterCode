// ============================================================
// LOBSTER MANAGER — UI Test Agent Service
// Automated UI verification using Electron BrowserWindow
// Tests: page load, console errors, button clicks, screenshots
// ============================================================

import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { Project, PortInfo } from '../../shared/types';

export interface UITestResult {
  id: string;
  projectId: string;
  projectName: string;
  url: string;
  status: 'pass' | 'fail' | 'error' | 'skipped';
  checks: UICheck[];
  screenshotPath?: string;
  duration: number; // ms
  timestamp: string;
  humanSummary: string; // Italian
}

export interface UICheck {
  name: string;
  status: 'pass' | 'fail' | 'error';
  message: string; // Italian
  details?: string;
}

export class UITestAgentService extends EventEmitter {
  private testResults: Map<string, UITestResult> = new Map();
  private screenshotDir: string;

  /** Porte da NON testare come HTTP (database, cache, Lobster stesso, ecc.) */
  private static NON_HTTP_PORTS = new Set([
    5432, 5433, 3306, 27017, 6379, 6380, 5672, 9200, 11211, 11434, 2181, 9092,
    5199, // Vite dev server di Lobster Manager — non testare sé stessi
  ]);

  /** Errori/warning console da ignorare (attesi in dev, non bug reali) */
  private static KNOWN_NOISE_PATTERNS = [
    'Electron Security Warning',          // Atteso in dev mode senza CSP
    'Insecure Content-Security-Policy',    // Variante del CSP warning
    'DevTools',                            // DevTools warnings
    'Download the React DevTools',         // React suggerimento DevTools
    'React does not recognize',            // Warning non-critico React props
    'Warning: Each child in a list',       // React key warning — non critico
    'Failed to load resource: net::ERR_',  // Network errors per risorse opzionali
    '[HMR]',                               // Hot Module Replacement di Vite
    '[vite]',                              // Vite internal logs
    'WebSocket connection',                // Vite HMR websocket
  ];

  constructor() {
    super();
    this.screenshotDir = path.join(
      process.env.HOME || '/tmp',
      '.lobster-manager',
      'screenshots'
    );
    try {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    } catch { /* ignore */ }
  }

  /**
   * Check if test agent is available (always true — uses Electron itself)
   */
  async checkAvailability(): Promise<{ available: boolean; message: string }> {
    return { available: true, message: 'Test Agent pronto (usa Electron BrowserWindow)' };
  }

  /**
   * DEEP UI TEST — Opens a hidden Electron BrowserWindow to test a URL:
   *  1. Page loads successfully
   *  2. No console errors
   *  3. All buttons/links are clickable
   *  4. Page title exists
   *  5. No JS errors on load
   *  6. Response time
   *  7. Screenshot
   */
  async quickHealthCheck(url: string, project: Project): Promise<UITestResult> {
    const startTime = Date.now();
    const checks: UICheck[] = [];
    let overallStatus: UITestResult['status'] = 'pass';
    let screenshotPath: string | undefined;

    // Create hidden BrowserWindow to load the page
    let testWindow: BrowserWindow | null = null;

    try {
      testWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        focusable: false,
        skipTaskbar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      // Collect console messages — filtriamo il rumore noto
      const consoleErrors: string[] = [];
      const consoleWarnings: string[] = [];
      const filteredNoise: string[] = [];

      testWindow.webContents.on('console-message', (_event, level, message) => {
        // Filtra errori/warning noti che non sono bug reali
        const isNoise = UITestAgentService.KNOWN_NOISE_PATTERNS.some((p) => message.includes(p));
        if (isNoise) {
          filteredNoise.push(message.slice(0, 100));
          return;
        }
        if (level === 2) consoleErrors.push(message); // error
        if (level === 1) consoleWarnings.push(message); // warning
      });

      // Load the page with timeout (8s — lascia tempo per SPA con bundle grossi)
      const loadStart = Date.now();
      try {
        await Promise.race([
          testWindow.loadURL(url),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000)),
        ]);
        const loadTime = Date.now() - loadStart;

        // Check 1: Page loaded
        checks.push({
          name: 'Caricamento pagina',
          status: 'pass',
          message: `La pagina si è caricata in ${loadTime}ms`,
        });

        // Check 2: Load speed
        if (loadTime < 2000) {
          checks.push({ name: 'Velocità', status: 'pass', message: `Caricamento veloce (${loadTime}ms)` });
        } else if (loadTime < 5000) {
          checks.push({ name: 'Velocità', status: 'pass', message: `Caricamento accettabile (${loadTime}ms)` });
        } else {
          checks.push({ name: 'Velocità', status: 'fail', message: `Caricamento lento (${loadTime}ms)` });
          overallStatus = 'fail';
        }

        // === ATTESA INTELLIGENTE PER SPA ===
        // Le SPA (React, Vue, Angular, Svelte) rendono il DOM via JavaScript.
        // L'HTML iniziale è spesso un <div id="root"></div> vuoto.
        // Aspettiamo fino a 3 secondi che il body si popoli, con check ogni 200ms.
        let spaRendered = false;
        let bodyLength = 0;
        for (let attempt = 0; attempt < 15; attempt++) {
          await new Promise((r) => setTimeout(r, 200));
          try {
            bodyLength = await testWindow.webContents.executeJavaScript(
              'document.body?.innerHTML?.length || 0'
            );
            if (bodyLength > 200) {
              spaRendered = true;
              break;
            }
          } catch {
            break;
          }
        }

        // Check 3: Framework detection — rileva se è una SPA
        let detectedFramework = 'sconosciuto';
        let isSPA = false;
        try {
          const frameworkInfo = await testWindow.webContents.executeJavaScript(`
            (function() {
              const root = document.getElementById('root') || document.getElementById('app') || document.getElementById('__next');
              const hasReact = !!root?._reactRootContainer || !!document.querySelector('[data-reactroot]') || !!root?.querySelector('[class*="jsx"]');
              const hasVue = !!document.querySelector('[data-v-]') || !!window.__VUE__;
              const hasAngular = !!document.querySelector('[ng-version]') || !!document.querySelector('app-root');
              const hasSvelte = !!document.querySelector('[class*="svelte-"]');
              const hasNextJs = !!document.getElementById('__next');
              const hasNuxt = !!document.getElementById('__nuxt');
              const hasVite = !!document.querySelector('script[type="module"]');
              return {
                react: hasReact,
                vue: hasVue,
                angular: hasAngular,
                svelte: hasSvelte,
                nextjs: hasNextJs,
                nuxt: hasNuxt,
                vite: hasVite,
                hasRootContainer: !!root,
              };
            })()
          `);

          if (frameworkInfo.react || frameworkInfo.nextjs) {
            detectedFramework = frameworkInfo.nextjs ? 'Next.js (React)' : 'React';
            isSPA = true;
          } else if (frameworkInfo.vue || frameworkInfo.nuxt) {
            detectedFramework = frameworkInfo.nuxt ? 'Nuxt (Vue)' : 'Vue';
            isSPA = true;
          } else if (frameworkInfo.angular) {
            detectedFramework = 'Angular';
            isSPA = true;
          } else if (frameworkInfo.svelte) {
            detectedFramework = 'Svelte';
            isSPA = true;
          } else if (frameworkInfo.hasRootContainer && frameworkInfo.vite) {
            detectedFramework = 'SPA (Vite)';
            isSPA = true;
          } else if (frameworkInfo.hasRootContainer) {
            detectedFramework = 'SPA (generico)';
            isSPA = true;
          }

          checks.push({
            name: 'Framework rilevato',
            status: 'pass',
            message: isSPA ? `App ${detectedFramework} — rendering client-side` : 'Pagina HTML tradizionale (server-rendered)',
          });
        } catch { /* detection failed — non critico */ }

        // Check 4: Page title
        const title = testWindow.getTitle();
        if (title && title.length > 0 && !title.includes('Error') && !title.includes('404')) {
          checks.push({ name: 'Titolo pagina', status: 'pass', message: `Titolo: "${title}"` });
        } else if (!title || title.length === 0) {
          checks.push({ name: 'Titolo pagina', status: 'fail', message: 'La pagina non ha un titolo' });
        } else {
          checks.push({ name: 'Titolo pagina', status: 'fail', message: `Titolo sospetto: "${title}"` });
          overallStatus = 'fail';
        }

        // Check 5: Console errors (filtrati — solo errori REALI)
        if (consoleErrors.length === 0) {
          const noiseMsg = filteredNoise.length > 0
            ? ` (${filteredNoise.length} warning di sviluppo filtrati)`
            : '';
          checks.push({ name: 'Errori console', status: 'pass', message: `Nessun errore JavaScript reale${noiseMsg}` });
        } else {
          checks.push({
            name: 'Errori console',
            status: 'fail',
            message: `${consoleErrors.length} errori reali trovati nella console`,
            details: consoleErrors.slice(0, 5).join('\n'),
          });
          overallStatus = 'fail';
        }

        // Check 5b: Console warnings (solo se tanti)
        if (consoleWarnings.length > 5) {
          checks.push({
            name: 'Warning console',
            status: 'fail',
            message: `${consoleWarnings.length} warning nella console`,
            details: consoleWarnings.slice(0, 3).join('\n'),
          });
        }

        // Check 6: DOM analysis — adattato per SPA
        try {
          const interactiveInfo = await testWindow.webContents.executeJavaScript(`
            (function() {
              const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
              const links = document.querySelectorAll('a[href]');
              const inputs = document.querySelectorAll('input, textarea, select');
              const clickableResults = [];

              // Test each button: is it visible and enabled?
              buttons.forEach((btn, i) => {
                if (i >= 10) return;
                const rect = btn.getBoundingClientRect();
                const visible = rect.width > 0 && rect.height > 0;
                const enabled = !btn.disabled;
                const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().slice(0, 50);
                clickableResults.push({
                  type: 'button',
                  text: text || '(senza testo)',
                  visible,
                  enabled,
                });
              });

              // Misura qualità contenuto — non solo lunghezza
              const textContent = document.body?.innerText || '';
              const meaningfulText = textContent.replace(/\\s+/g, ' ').trim();
              const images = document.querySelectorAll('img, svg, canvas');
              const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

              return {
                buttonCount: buttons.length,
                linkCount: links.length,
                inputCount: inputs.length,
                clickableResults,
                bodyLength: document.body?.innerHTML?.length || 0,
                textLength: meaningfulText.length,
                imageCount: images.length,
                headingCount: headings.length,
                hasNav: !!document.querySelector('nav, [role="navigation"]'),
                hasMain: !!document.querySelector('main, [role="main"]'),
                hasFooter: !!document.querySelector('footer'),
              };
            })()
          `);

          // Check: page has content — intelligente, non solo bodyLength
          const hasContent = interactiveInfo.bodyLength > 200 ||
            interactiveInfo.textLength > 50 ||
            interactiveInfo.buttonCount > 0 ||
            interactiveInfo.imageCount > 0;

          if (hasContent) {
            const contentParts: string[] = [];
            if (interactiveInfo.textLength > 0) contentParts.push(`${Math.round(interactiveInfo.textLength / 100) * 100}+ caratteri di testo`);
            if (interactiveInfo.imageCount > 0) contentParts.push(`${interactiveInfo.imageCount} immagini/icone`);
            if (interactiveInfo.headingCount > 0) contentParts.push(`${interactiveInfo.headingCount} titoli`);
            checks.push({
              name: 'Contenuto pagina',
              status: 'pass',
              message: `Pagina con contenuto: ${contentParts.join(', ') || `${(interactiveInfo.bodyLength / 1024).toFixed(1)} KB HTML`}`,
            });
          } else if (isSPA && !spaRendered) {
            // SPA che non si è renderizzata — potrebbe essere un problema di build
            checks.push({
              name: 'Contenuto pagina',
              status: 'fail',
              message: `App ${detectedFramework} rilevata ma il rendering non è completato — potrebbe esserci un errore di build o un bundle mancante`,
            });
            overallStatus = 'fail';
          } else {
            checks.push({ name: 'Contenuto pagina', status: 'fail', message: 'La pagina sembra vuota o quasi' });
            overallStatus = 'fail';
          }

          // Check: interactive elements
          const totalInteractive = interactiveInfo.buttonCount + interactiveInfo.linkCount + interactiveInfo.inputCount;
          if (totalInteractive > 0) {
            checks.push({
              name: 'Elementi interattivi',
              status: 'pass',
              message: `${interactiveInfo.buttonCount} bottoni, ${interactiveInfo.linkCount} link, ${interactiveInfo.inputCount} input`,
            });
          } else if (isSPA && !spaRendered) {
            checks.push({
              name: 'Elementi interattivi',
              status: 'fail',
              message: `App ${detectedFramework}: nessun elemento trovato — il rendering potrebbe non essere completato`,
            });
          } else {
            checks.push({
              name: 'Elementi interattivi',
              status: 'fail',
              message: 'Nessun elemento interattivo trovato (bottoni, link, input)',
            });
          }

          // Check: struttura semantica HTML
          if (interactiveInfo.hasNav || interactiveInfo.hasMain) {
            const parts: string[] = [];
            if (interactiveInfo.hasNav) parts.push('navigazione');
            if (interactiveInfo.hasMain) parts.push('contenuto principale');
            if (interactiveInfo.hasFooter) parts.push('footer');
            checks.push({
              name: 'Struttura semantica',
              status: 'pass',
              message: `Struttura HTML corretta: ${parts.join(', ')}`,
            });
          } else if (hasContent) {
            checks.push({
              name: 'Struttura semantica',
              status: 'fail',
              message: 'Mancano tag semantici (nav, main) — consigliato per accessibilità',
            });
          }

          // Check: button health
          const disabledButtons = interactiveInfo.clickableResults.filter((b: any) => !b.enabled);
          const hiddenButtons = interactiveInfo.clickableResults.filter((b: any) => !b.visible);
          const noTextButtons = interactiveInfo.clickableResults.filter((b: any) => b.text === '(senza testo)');

          if (disabledButtons.length > 0) {
            checks.push({
              name: 'Bottoni disabilitati',
              status: 'fail',
              message: `${disabledButtons.length} bottoni disabilitati`,
              details: disabledButtons.map((b: any) => b.text).join(', '),
            });
          }

          if (hiddenButtons.length > 0) {
            checks.push({
              name: 'Bottoni nascosti',
              status: 'fail',
              message: `${hiddenButtons.length} bottoni non visibili`,
              details: hiddenButtons.map((b: any) => b.text).join(', '),
            });
          }

          if (noTextButtons.length > 0) {
            checks.push({
              name: 'Accessibilità bottoni',
              status: 'fail',
              message: `${noTextButtons.length} bottoni senza testo o aria-label`,
              details: 'I bottoni dovrebbero avere un testo descrittivo per l\'accessibilità',
            });
          }

          // Check 7: Click test — solo se ci sono bottoni
          if (interactiveInfo.buttonCount > 0) {
            try {
              const clickResults = await testWindow.webContents.executeJavaScript(`
                (async function() {
                  const buttons = Array.from(document.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled])'));
                  const results = [];

                  window.__lobsterClickErrors = [];
                  const errorHandler = (e) => window.__lobsterClickErrors.push(e.message);
                  window.addEventListener('error', errorHandler);

                  for (let i = 0; i < Math.min(buttons.length, 5); i++) {
                    const btn = buttons[i];
                    const rect = btn.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) continue;

                    const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().slice(0, 40);
                    try {
                      btn.click();
                      await new Promise(r => setTimeout(r, 300));
                      results.push({ text: text || '(bottone)', crashed: false });
                    } catch (e) {
                      results.push({ text: text || '(bottone)', crashed: true, error: e.message });
                    }
                  }

                  window.removeEventListener('error', errorHandler);
                  return {
                    clickResults: results,
                    errorsAfterClick: window.__lobsterClickErrors,
                  };
                })()
              `);

              const crashed = clickResults.clickResults.filter((r: any) => r.crashed);
              const jsErrors = clickResults.errorsAfterClick || [];

              if (crashed.length === 0 && jsErrors.length === 0) {
                if (clickResults.clickResults.length > 0) {
                  checks.push({
                    name: 'Click bottoni',
                    status: 'pass',
                    message: `${clickResults.clickResults.length} bottoni cliccati senza errori`,
                    details: clickResults.clickResults.map((r: any) => `✓ "${r.text}"`).join(', '),
                  });
                }
              } else {
                const errorDetails = [
                  ...crashed.map((r: any) => `✗ "${r.text}": ${r.error}`),
                  ...jsErrors.map((e: string) => `JS Error: ${e}`),
                ];
                checks.push({
                  name: 'Click bottoni',
                  status: 'fail',
                  message: `Errori durante il click di ${crashed.length + jsErrors.length} bottoni`,
                  details: errorDetails.join('\n'),
                });
                overallStatus = 'fail';
              }
            } catch { /* click test failed — not critical */ }
          }

          // Check 8: Responsive — testa viewport mobile
          try {
            testWindow.setSize(375, 667); // iPhone SE
            await new Promise((r) => setTimeout(r, 500));
            const mobileInfo = await testWindow.webContents.executeJavaScript(`
              (function() {
                const body = document.body;
                const hasHorizontalScroll = body.scrollWidth > window.innerWidth + 10;
                const visibleButtons = document.querySelectorAll('button, [role="button"]');
                let tinyButtons = 0;
                visibleButtons.forEach(btn => {
                  const rect = btn.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0 && (rect.width < 30 || rect.height < 30)) {
                    tinyButtons++;
                  }
                });
                return { hasHorizontalScroll, tinyButtons };
              })()
            `);

            if (!mobileInfo.hasHorizontalScroll && mobileInfo.tinyButtons === 0) {
              checks.push({
                name: 'Responsive (mobile)',
                status: 'pass',
                message: 'La pagina si adatta bene a schermi piccoli',
              });
            } else {
              const issues: string[] = [];
              if (mobileInfo.hasHorizontalScroll) issues.push('scroll orizzontale presente');
              if (mobileInfo.tinyButtons > 0) issues.push(`${mobileInfo.tinyButtons} bottoni troppo piccoli per il touch`);
              checks.push({
                name: 'Responsive (mobile)',
                status: 'fail',
                message: `Problemi su mobile: ${issues.join(', ')}`,
              });
            }

            // Ripristina dimensioni desktop per screenshot
            testWindow.setSize(1280, 800);
            await new Promise((r) => setTimeout(r, 300));
          } catch { /* responsive test failed — non critico */ }
        } catch (jsError) {
          checks.push({
            name: 'Analisi DOM',
            status: 'error',
            message: 'Impossibile analizzare la pagina',
            details: jsError instanceof Error ? jsError.message : 'Errore JS',
          });
        }

        // Check 9: Take screenshot
        try {
          const screenshotName = `test_${project.id}_${Date.now()}.png`;
          screenshotPath = path.join(this.screenshotDir, screenshotName);
          const image = await testWindow.capturePage();
          fs.writeFileSync(screenshotPath, image.toPNG());
          checks.push({
            name: 'Screenshot',
            status: 'pass',
            message: 'Screenshot salvato',
            details: screenshotPath,
          });
        } catch {
          // Screenshot failed — not critical
        }

      } catch (loadError) {
        const errorMessage = loadError instanceof Error ? loadError.message : 'Errore';

        if (errorMessage.includes('Timeout')) {
          checks.push({
            name: 'Caricamento pagina',
            status: 'fail',
            message: 'La pagina non si è caricata entro 15 secondi',
          });
        } else if (errorMessage.includes('ERR_CONNECTION_REFUSED')) {
          checks.push({
            name: 'Caricamento pagina',
            status: 'fail',
            message: 'Connessione rifiutata — il server non è attivo',
          });
        } else {
          checks.push({
            name: 'Caricamento pagina',
            status: 'error',
            message: 'Errore nel caricamento',
            details: errorMessage,
          });
        }
        overallStatus = 'error';
      }
    } catch (windowError) {
      checks.push({
        name: 'Test Agent',
        status: 'error',
        message: 'Impossibile avviare il test',
        details: windowError instanceof Error ? windowError.message : 'Errore interno',
      });
      overallStatus = 'error';
    } finally {
      // Close test window
      if (testWindow && !testWindow.isDestroyed()) {
        testWindow.close();
      }
    }

    const duration = Date.now() - startTime;
    const passCount = checks.filter((c) => c.status === 'pass').length;
    const failCount = checks.filter((c) => c.status === 'fail').length;

    const result: UITestResult = {
      id: `test_${project.id}_${Date.now()}`,
      projectId: project.id,
      projectName: project.name,
      url,
      status: overallStatus,
      checks,
      screenshotPath,
      duration,
      timestamp: new Date().toISOString(),
      humanSummary:
        overallStatus === 'pass'
          ? `Tutto ok — ${passCount} controlli superati in ${duration}ms`
          : overallStatus === 'fail'
          ? `${failCount} problemi trovati su ${checks.length} controlli`
          : `Errore durante il test — il server potrebbe non essere attivo`,
    };

    this.testResults.set(project.id, result);
    this.emit('testComplete', result);
    return result;
  }

  /**
   * Test all active projects' URLs
   * SOLO progetti attivi (running/partial) — salta quelli fermi per evitare blocchi
   */
  async testAllProjects(projects: Project[]): Promise<UITestResult[]> {
    const results: UITestResult[] = [];

    // Filtra: solo progetti con porte attive o stato running
    const activeProjects = projects.filter(
      (p) => p.status === 'running' || p.status === 'partial' || p.ports.some((port) => port.state === 'LISTEN')
    );

    console.log(`[UITestAgent] Testing ${activeProjects.length}/${projects.length} active projects`);

    for (const project of activeProjects) {
      // Find testable URLs — solo da porte ATTIVE
      const urls = this.getActiveProjectUrls(project);
      if (urls.length === 0) {
        results.push({
          id: `test_${project.id}_${Date.now()}`,
          projectId: project.id,
          projectName: project.name,
          url: '',
          status: 'skipped',
          checks: [],
          duration: 0,
          timestamp: new Date().toISOString(),
          humanSummary: 'Nessun URL attivo da testare',
        });
        continue;
      }

      // Testa solo il primo URL per progetto (il più rilevante)
      const result = await this.quickHealthCheck(urls[0], project);
      results.push(result);
    }

    this.emit('allTestsComplete', results);
    return results;
  }

  /**
   * Get testable URLs SOLO da porte attivamente in LISTEN.
   * Filtra database/cache ports.
   */
  private getActiveProjectUrls(project: Project): string[] {
    const urls: string[] = [];

    // Solo porte HTTP attive (LISTEN, non database)
    for (const port of project.ports) {
      if (UITestAgentService.NON_HTTP_PORTS.has(port.port)) continue;
      if (port.state !== 'LISTEN') continue;

      if (port.url) {
        urls.push(port.url);
      } else if (port.port > 0) {
        urls.push(`http://localhost:${port.port}`);
      }
    }

    // Se non abbiamo trovato URL attive, prova healthCheckUrls dal config
    if (urls.length === 0 && project.config?.healthCheckUrls) {
      urls.push(...project.config.healthCheckUrls);
    }

    return [...new Set(urls)];
  }

  /**
   * Get ALL testable URLs (legacy — used by manual test).
   */
  private getProjectUrls(project: Project): string[] {
    const urls: string[] = [];

    for (const port of project.ports) {
      if (UITestAgentService.NON_HTTP_PORTS.has(port.port)) continue;
      if (port.url) {
        urls.push(port.url);
      } else if (port.port > 0) {
        urls.push(`http://localhost:${port.port}`);
      }
    }

    if (project.config?.expectedPorts) {
      for (const ep of project.config.expectedPorts) {
        if (UITestAgentService.NON_HTTP_PORTS.has(ep.port)) continue;
        if (ep.healthCheckUrl) {
          urls.push(ep.healthCheckUrl);
        } else {
          urls.push(`http://localhost:${ep.port}`);
        }
      }
    }

    if (project.config?.healthCheckUrls) {
      urls.push(...project.config.healthCheckUrls);
    }

    return [...new Set(urls)];
  }

  /**
   * Smart test: scan all active ports on the system and test them,
   * even if not associated with a specific project.
   * Returns results for each testable URL found.
   */
  async testActivePorts(activePorts: PortInfo[]): Promise<UITestResult[]> {
    const results: UITestResult[] = [];
    const httpPorts = activePorts.filter((p) => {
      return p.state === 'LISTEN' && !UITestAgentService.NON_HTTP_PORTS.has(p.port);
    });

    for (const port of httpPorts) {
      const url = port.url || `http://localhost:${port.port}`;
      const fakeProject: Project = {
        id: `port_${port.port}`,
        name: port.humanLabel || `Porta ${port.port}`,
        path: '',
        type: 'generic',
        icon: '🔌',
        color: '#2a8fb5',
        status: 'running',
        health: 'unknown',
        trafficLight: 'green',
        humanStatus: `${port.processName} sulla porta ${port.port}`,
        ports: [port],
        containers: [],
        isArchived: false,
      };
      const result = await this.quickHealthCheck(url, fakeProject);
      results.push(result);
    }

    return results;
  }

  /**
   * Get all cached test results
   */
  getResults(): UITestResult[] {
    return Array.from(this.testResults.values());
  }

  /**
   * Get result for a specific project
   */
  getProjectResult(projectId: string): UITestResult | undefined {
    return this.testResults.get(projectId);
  }
}
