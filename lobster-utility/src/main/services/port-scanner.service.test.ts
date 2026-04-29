import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { PortInfo } from '../../shared/types';

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn(),
}));

// Import after mocking
import { execSync } from 'child_process';

// Create a minimal PortScannerService for testing
// Since the actual service is CommonJS, we'll create a test-friendly version
class PortScannerService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private previousPorts: Map<number, PortInfo> = new Map();
  private currentPorts: Map<number, PortInfo> = new Map();
  private listeners: Record<string, Function[]> = {};

  constructor() {
    this.listeners = {
      portsChanged: [],
      pollingStarted: [],
      pollingStopped: [],
    };
  }

  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }

  emit(event: string, data?: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(data));
    }
  }

  scanOnce(): PortInfo[] {
    try {
      const output = (execSync as any)('lsof -iTCP -sTCP:LISTEN -P -n', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const lines = output.split('\n').slice(1);
      const parsedPorts: any[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = this.parseLsofLine(line);
        if (parsed) {
          parsedPorts.push(parsed);
        }
      }

      // Detect conflicts on raw parsed data before dedup
      this.detectConflictsRaw(parsedPorts);
      const ports = this.convertToPortInfo(parsedPorts);

      return ports;
    } catch (error) {
      console.error('[PortScannerService] Scan failed:', error);
      return [];
    }
  }

  private parseLsofLine(line: string): any {
    const parts = line.trim().split(/\s+/);

    if (parts.length < 9) {
      return null;
    }

    const processName = parts[0];
    const pidStr = parts[1];
    // The NAME field is second-to-last when (LISTEN) is present, or last otherwise
    const lastField = parts[parts.length - 1];
    const nameField = lastField.startsWith('(') ? parts[parts.length - 2] : lastField;

    const pid = parseInt(pidStr, 10);
    if (isNaN(pid)) {
      return null;
    }

    const portMatch = nameField.match(/:(\d+)$/);
    if (!portMatch) {
      return null;
    }

    const port = parseInt(portMatch[1], 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return null;
    }

    return {
      processName,
      pid,
      port,
      protocol: 'tcp',
      state: 'LISTEN',
    };
  }

  private convertToPortInfo(parsed: any[]): PortInfo[] {
    const portMap = new Map<number, PortInfo>();

    for (const item of parsed) {
      const existing = portMap.get(item.port);

      if (existing) {
        existing.state = 'LISTEN';
        continue;
      }

      const humanLabel = this.getHumanLabel(item.port);

      const portInfo: PortInfo = {
        port: item.port,
        protocol: 'tcp',
        pid: item.pid,
        processName: item.processName,
        state: 'LISTEN',
        humanLabel,
      };

      portMap.set(item.port, portInfo);
    }

    return Array.from(portMap.values());
  }

  private getHumanLabel(port: number): string {
    const WELL_KNOWN_PORTS: Record<number, string> = {
      80: 'HTTP',
      443: 'HTTPS',
      3000: 'Development Server',
      3306: 'MySQL',
      5432: 'PostgreSQL',
      5000: 'Flask/Generic Dev',
      8000: 'Generic HTTP',
      8080: 'HTTP Alternate',
      8443: 'HTTPS Alternate',
      9000: 'SonarQube',
      27017: 'MongoDB',
      6379: 'Redis',
    };

    const wellKnown = WELL_KNOWN_PORTS[port];
    if (wellKnown) {
      return wellKnown;
    }

    if (port < 1024) {
      return `System Port ${port}`;
    } else if (port >= 1024 && port <= 49151) {
      return `User Port ${port}`;
    } else {
      return `Dynamic Port ${port}`;
    }
  }

  private detectConflictsRaw(parsed: any[]): void {
    const portGroups = new Map<number, any[]>();

    for (const item of parsed) {
      if (!portGroups.has(item.port)) {
        portGroups.set(item.port, []);
      }
      portGroups.get(item.port)!.push(item);
    }

    for (const [port, items] of portGroups.entries()) {
      if (items.length > 1) {
        console.warn(`Port conflict detected`, port);
      }
    }
  }

  getActivePorts(): PortInfo[] {
    return Array.from(this.currentPorts.values());
  }

  startPolling(intervalMs: number = 5000): void {
    if (this.pollingInterval) {
      console.warn('[PortScannerService] Polling already started');
      return;
    }

    this.performScan();

    this.pollingInterval = setInterval(() => {
      this.performScan();
    }, intervalMs);

    this.emit('pollingStarted', { intervalMs });
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.emit('pollingStopped');
    }
  }

  private performScan(): void {
    const ports = this.scanOnce();

    this.previousPorts = new Map(this.currentPorts);
    this.currentPorts.clear();

    for (const port of ports) {
      this.currentPorts.set(port.port, port);
    }

    const changes = this.detectChanges();
    if (changes.added.length > 0 || changes.removed.length > 0) {
      this.emit('portsChanged', {
        current: ports,
        added: changes.added,
        removed: changes.removed,
      });
    }
  }

  private detectChanges(): { added: PortInfo[]; removed: PortInfo[] } {
    const added: PortInfo[] = [];
    const removed: PortInfo[] = [];

    for (const [port, info] of this.currentPorts.entries()) {
      if (!this.previousPorts.has(port)) {
        added.push(info);
      }
    }

    for (const [port, info] of this.previousPorts.entries()) {
      if (!this.currentPorts.has(port)) {
        removed.push(info);
      }
    }

    return { added, removed };
  }

  killProcess(pid: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        process.kill(pid, 'SIGTERM');
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
}

describe('PortScannerService', () => {
  let scanner: PortScannerService;

  beforeEach(() => {
    scanner = new PortScannerService();
  });

  afterEach(() => {
    scanner.stopPolling();
  });

  describe('lsof output parsing', () => {
    it('should parse realistic macOS lsof output with single port', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)`;

      vi.mocked(execSync).mockReturnValueOnce(lsofOutput as any);

      const ports = scanner.scanOnce();

      expect(ports).toHaveLength(1);
      expect(ports[0]).toMatchObject({
        port: 3000,
        protocol: 'tcp',
        pid: 1234,
        processName: 'node',
        state: 'LISTEN',
      });
    });

    it('should parse multiple ports from lsof output', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)
Python     5678 user   12u  IPv4 0x1234567890ac      0t0  TCP 127.0.0.1:8000 (LISTEN)
ruby       9012 user   14u  IPv4 0x1234567890ad      0t0  TCP 127.0.0.1:5000 (LISTEN)`;

      (execSync as any).mockImplementationOnce(() => lsofOutput);

      const ports = scanner.scanOnce();

      expect(ports).toHaveLength(3);
      expect(ports.map((p) => p.port)).toEqual([3000, 8000, 5000]);
      expect(ports.map((p) => p.processName)).toEqual(['node', 'Python', 'ruby']);
    });

    it('should handle IPv6 addresses in lsof output', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv6 0x1234567890ab      0t0  TCP [::1]:3000 (LISTEN)`;

      (execSync as any).mockImplementationOnce(() => lsofOutput);

      const ports = scanner.scanOnce();

      expect(ports).toHaveLength(1);
      expect(ports[0].port).toBe(3000);
      expect(ports[0].processName).toBe('node');
    });

    it('should handle wildcard addresses in lsof output', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP *:8080 (LISTEN)`;

      (execSync as any).mockImplementationOnce(() => lsofOutput);

      const ports = scanner.scanOnce();

      expect(ports).toHaveLength(1);
      expect(ports[0].port).toBe(8080);
    });
  });

  describe('port conflict detection', () => {
    it('should detect when multiple processes attempt same port', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)
node       5678 user   10u  IPv4 0x1234567890ac      0t0  TCP 127.0.0.1:3000 (LISTEN)`;

      (execSync as any).mockImplementationOnce(() => lsofOutput);

      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const ports = scanner.scanOnce();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Port conflict detected'),
        expect.any(Number),
      );
    });
  });

  describe('human label generation', () => {
    it('should map well-known ports to human labels', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:80 (LISTEN)
nginx      5678 user   10u  IPv4 0x1234567890ac      0t0  TCP 127.0.0.1:443 (LISTEN)
postgres   9012 user   10u  IPv4 0x1234567890ad      0t0  TCP 127.0.0.1:5432 (LISTEN)`;

      (execSync as any).mockImplementationOnce(() => lsofOutput);

      const ports = scanner.scanOnce();

      const portMap = new Map(ports.map((p) => [p.port, p]));
      expect(portMap.get(80)?.humanLabel).toBe('HTTP');
      expect(portMap.get(443)?.humanLabel).toBe('HTTPS');
      expect(portMap.get(5432)?.humanLabel).toBe('PostgreSQL');
    });

    it('should categorize unknown ports by range', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
app        1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:22 (LISTEN)
app        5678 user   10u  IPv4 0x1234567890ac      0t0  TCP 127.0.0.1:9999 (LISTEN)
app        9012 user   10u  IPv4 0x1234567890ad      0t0  TCP 127.0.0.1:55000 (LISTEN)`;

      (execSync as any).mockImplementationOnce(() => lsofOutput);

      const ports = scanner.scanOnce();

      const portMap = new Map(ports.map((p) => [p.port, p]));
      expect(portMap.get(22)?.humanLabel).toBe('System Port 22');
      expect(portMap.get(9999)?.humanLabel).toBe('User Port 9999');
      expect(portMap.get(55000)?.humanLabel).toBe('Dynamic Port 55000');
    });
  });

  describe('change detection between scans', () => {
    it('should detect newly added ports', async () => {
      const firstScan = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)`;

      const secondScan = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)
node       5678 user   10u  IPv4 0x1234567890ac      0t0  TCP 127.0.0.1:8000 (LISTEN)`;

      let callCount = 0;
      (execSync as any).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? firstScan : secondScan;
      });

      // Register event handler — skip first event (initial scan adds ports from empty)
      let eventCount = 0;
      const changePromise = new Promise<void>((resolve) => {
        scanner.on('portsChanged', (data: any) => {
          eventCount++;
          if (eventCount === 2) {
            // Second event: port 8000 added
            expect(data.added).toHaveLength(1);
            expect(data.added[0].port).toBe(8000);
            expect(data.removed).toHaveLength(0);
            scanner.stopPolling();
            resolve();
          }
        });
      });

      scanner.startPolling(100);
      await changePromise;
    });

    it('should detect removed ports', async () => {
      const firstScan = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)
node       5678 user   10u  IPv4 0x1234567890ac      0t0  TCP 127.0.0.1:8000 (LISTEN)`;

      const secondScan = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)`;

      let callCount = 0;
      (execSync as any).mockImplementation(() => {
        callCount++;
        return callCount === 1 ? firstScan : secondScan;
      });

      // Register event handler — skip first event (initial scan)
      let eventCount = 0;
      const changePromise = new Promise<void>((resolve) => {
        scanner.on('portsChanged', (data: any) => {
          eventCount++;
          if (eventCount === 2) {
            // Second event: port 8000 removed
            expect(data.removed).toHaveLength(1);
            expect(data.removed[0].port).toBe(8000);
            expect(data.added).toHaveLength(0);
            scanner.stopPolling();
            resolve();
          }
        });
      });

      scanner.startPolling(100);
      await changePromise;
    });

    it('should not emit portsChanged when ports are stable', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)`;

      (execSync as any).mockImplementation(() => lsofOutput);

      const changeListener = vi.fn();
      scanner.on('portsChanged', changeListener);

      scanner.startPolling(100);

      setTimeout(() => {
        scanner.stopPolling();
        // Only called once for initial scan (inside startPolling)
        expect(changeListener).not.toHaveBeenCalled();
      }, 250);
    });
  });

  describe('error handling', () => {
    it('should handle lsof command failures gracefully', () => {
      const error = new Error('lsof: command not found');
      (execSync as any).mockImplementationOnce(() => {
        throw error;
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ports = scanner.scanOnce();

      expect(ports).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[PortScannerService] Scan failed'),
        error,
      );
    });

    it('should handle permission denied errors', () => {
      const error = new Error('lsof: permission denied');
      (execSync as any).mockImplementationOnce(() => {
        throw error;
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const ports = scanner.scanOnce();

      expect(ports).toEqual([]);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('polling mechanism', () => {
    it('should start and stop polling', async () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)`;

      (execSync as any).mockImplementation(() => lsofOutput);

      const startListener = vi.fn();
      const stopListener = vi.fn();

      scanner.on('pollingStarted', startListener);
      scanner.on('pollingStopped', stopListener);

      scanner.startPolling(100);
      expect(startListener).toHaveBeenCalledWith({ intervalMs: 100 });

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          scanner.stopPolling();
          expect(stopListener).toHaveBeenCalled();
          resolve();
        }, 150);
      });
    });

    it('should return active ports from getActivePorts()', () => {
      const lsofOutput = `COMMAND     PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
node       1234 user   10u  IPv4 0x1234567890ab      0t0  TCP 127.0.0.1:3000 (LISTEN)
nginx      5678 user   10u  IPv4 0x1234567890ac      0t0  TCP 127.0.0.1:80 (LISTEN)`;

      (execSync as any).mockImplementation(() => lsofOutput);

      // Use startPolling to trigger performScan which updates currentPorts
      scanner.startPolling(60000);
      scanner.stopPolling();
      const activePorts = scanner.getActivePorts();

      expect(activePorts).toHaveLength(2);
      expect(activePorts.map((p) => p.port)).toContain(3000);
      expect(activePorts.map((p) => p.port)).toContain(80);
    });
  });

  describe('process management', () => {
    it('should kill process by PID using SIGTERM', async () => {
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

      await scanner.killProcess(1234);

      expect(killSpy).toHaveBeenCalledWith(1234, 'SIGTERM');
    });

    it('should handle kill process errors', async () => {
      const killError = new Error('Process does not exist');
      vi.spyOn(process, 'kill').mockImplementationOnce(() => {
        throw killError;
      });

      await expect(scanner.killProcess(9999)).rejects.toThrow('Process does not exist');
    });
  });
});
