const { execSync, exec } = require('child_process');
const { EventEmitter } = require('events');
const path = require('path');
const { WELL_KNOWN_PORTS } = require('../../shared/constants');

/**
 * PortInfo interface - describes a port listening on the system
 */
interface PortInfo {
  port: number;
  protocol: 'tcp' | 'udp';
  pid: number;
  processName: string;
  projectId?: string;
  projectName?: string;
  state: 'LISTEN' | 'ESTABLISHED' | 'CLOSE_WAIT' | 'TIME_WAIT';
  humanLabel: string;
  url?: string;
}

/**
 * ParsedLsofLine - internal interface for parsed lsof output
 */
interface ParsedLsofLine {
  processName: string;
  pid: number;
  port: number;
  protocol: string;
  state: string;
}

/**
 * PortScannerService - scans for listening TCP ports on macOS
 *
 * Usage:
 *   const scanner = new PortScannerService();
 *   scanner.on('portsChanged', (ports) => console.log(ports));
 *   scanner.startPolling(5000); // Poll every 5 seconds
 */
class PortScannerService extends EventEmitter {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private previousPorts: Map<number, PortInfo> = new Map();
  private currentPorts: Map<number, PortInfo> = new Map();

  constructor() {
    super();
  }

  /**
   * Scans for listening TCP ports using lsof
   * Runs synchronously and returns immediately
   */
  scanOnce(): PortInfo[] {
    try {
      const output = execSync('lsof -iTCP -sTCP:LISTEN -P -n', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const lines = output.split('\n').slice(1); // Skip header
      const parsedPorts: ParsedLsofLine[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = this.parseLsofLine(line);
        if (parsed) {
          parsedPorts.push(parsed);
        }
      }

      // Convert to PortInfo and check for conflicts
      const ports = this.convertToPortInfo(parsedPorts);
      this.detectConflicts(ports);

      return ports;
    } catch (error) {
      // lsof might fail due to permissions or command not found
      console.error('[PortScannerService] Scan failed:', error);
      return [];
    }
  }

  /**
   * Parses a single lsof output line
   * Format: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
   */
  private parseLsofLine(line: string): ParsedLsofLine | null {
    const parts = line.trim().split(/\s+/);

    // Minimum parts needed: COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
    if (parts.length < 9) {
      return null;
    }

    const processName = parts[0];
    const pidStr = parts[1];

    // Parse PID
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid)) {
      return null;
    }

    // On macOS, lsof output last field might be "(LISTEN)" — the NAME with port
    // is the second-to-last field in that case.
    // Format: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME (LISTEN)"
    // or:     "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME"
    let nameField = parts[parts.length - 1];

    // If last field is "(LISTEN)" or similar parenthesized state, use second-to-last
    if (nameField.startsWith('(')) {
      nameField = parts[parts.length - 2];
    }

    // Parse port from NAME field (format: IPv4/IPv6:port or similar)
    // Examples: *:3000, 127.0.0.1:3000, [::1]:8080, localhost:5000
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

  /**
   * Converts parsed lsof data to PortInfo objects
   */
  private convertToPortInfo(parsed: ParsedLsofLine[]): PortInfo[] {
    const portMap = new Map<number, PortInfo>();

    for (const item of parsed) {
      const existing = portMap.get(item.port);

      // If port already exists, create a conflict entry
      if (existing) {
        // Mark as conflict
        existing.state = 'LISTEN' as const;
        continue;
      }

      const humanLabel = this.getHumanLabel(item.port);

      // Build a localhost URL for HTTP-capable ports
      const nonHttpPorts = [5432, 3306, 27017, 6379, 5672, 9200, 11211];
      const url = nonHttpPorts.includes(item.port) ? undefined : `http://localhost:${item.port}`;

      const portInfo: PortInfo = {
        port: item.port,
        protocol: 'tcp',
        pid: item.pid,
        processName: item.processName,
        state: 'LISTEN',
        humanLabel,
        url,
      };

      portMap.set(item.port, portInfo);
    }

    return Array.from(portMap.values());
  }

  /**
   * Gets human-readable label for a port
   */
  private getHumanLabel(port: number): string {
    const wellKnown = WELL_KNOWN_PORTS[port];
    if (wellKnown) {
      return wellKnown;
    }

    // Categorize by port range
    if (port < 1024) {
      return `System Port ${port}`;
    } else if (port >= 1024 && port <= 49151) {
      return `User Port ${port}`;
    } else {
      return `Dynamic Port ${port}`;
    }
  }

  /**
   * Detects port conflicts (multiple processes on same port)
   * This is a placeholder for conflict detection logic
   */
  private detectConflicts(ports: PortInfo[]): void {
    // In a real scenario, we'd group by port and detect duplicates
    // For now, we rely on lsof to show only one process per port
    const portGroups = new Map<number, PortInfo[]>();

    for (const port of ports) {
      if (!portGroups.has(port.port)) {
        portGroups.set(port.port, []);
      }
      portGroups.get(port.port)!.push(port);
    }

    for (const [port, items] of portGroups.entries()) {
      if (items.length > 1) {
        console.warn(`[PortScannerService] Port conflict detected on ${port}:`, items);
      }
    }
  }

  /**
   * Resolve the working directory of a process by PID
   * Used for reverse-lookup: port → process → CWD → project
   */
  getProcessCwd(pid: number): string | null {
    try {
      const output = execSync(`lsof -p ${pid} -a -d cwd -Fn 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 3000,
      });
      // Output format: "p<pid>\nn<path>"
      const match = output.match(/^n(.+)$/m);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Batch-resolve CWDs for multiple PIDs at once (faster than one-by-one)
   */
  getProcessCwds(pids: number[]): Map<number, string> {
    const result = new Map<number, string>();
    if (pids.length === 0) return result;

    try {
      // lsof accepts multiple -p arguments joined with comma
      const pidList = [...new Set(pids)].join(',');
      const output = execSync(`lsof -p ${pidList} -a -d cwd -Fn 2>/dev/null`, {
        encoding: 'utf-8',
        timeout: 5000,
      });

      // Parse output: alternating "p<pid>" and "n<path>" lines
      let currentPid: number | null = null;
      for (const line of output.split('\n')) {
        if (line.startsWith('p')) {
          currentPid = parseInt(line.slice(1), 10);
        } else if (line.startsWith('n') && currentPid !== null) {
          result.set(currentPid, line.slice(1));
          currentPid = null;
        }
      }
    } catch {
      // Fallback: try one by one
      for (const pid of pids) {
        const cwd = this.getProcessCwd(pid);
        if (cwd) result.set(pid, cwd);
      }
    }

    return result;
  }

  /**
   * Gets currently active ports from last scan
   */
  getActivePorts(): PortInfo[] {
    return Array.from(this.currentPorts.values());
  }

  /**
   * Starts polling for port changes at specified interval
   */
  startPolling(intervalMs: number = 5000): void {
    if (this.pollingInterval) {
      console.warn('[PortScannerService] Polling already started');
      return;
    }

    // Run initial scan
    this.performScan();

    // Set up recurring scan
    this.pollingInterval = setInterval(() => {
      this.performScan();
    }, intervalMs);

    this.emit('pollingStarted', { intervalMs });
  }

  /**
   * Stops polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.emit('pollingStopped');
    }
  }

  /**
   * Performs a scan and detects changes
   */
  private performScan(): void {
    const ports = this.scanOnce();

    // Store current state
    this.previousPorts = new Map(this.currentPorts);
    this.currentPorts.clear();

    for (const port of ports) {
      this.currentPorts.set(port.port, port);
    }

    // Detect changes
    const changes = this.detectChanges();
    if (changes.added.length > 0 || changes.removed.length > 0) {
      this.emit('portsChanged', {
        current: ports,
        added: changes.added,
        removed: changes.removed,
      });
    }
  }

  /**
   * Detects added/removed ports since last scan
   */
  private detectChanges(): {
    added: PortInfo[];
    removed: PortInfo[];
  } {
    const added: PortInfo[] = [];
    const removed: PortInfo[] = [];

    // Find added ports
    for (const [port, info] of this.currentPorts.entries()) {
      if (!this.previousPorts.has(port)) {
        added.push(info);
      }
    }

    // Find removed ports
    for (const [port, info] of this.previousPorts.entries()) {
      if (!this.currentPorts.has(port)) {
        removed.push(info);
      }
    }

    return { added, removed };
  }

  /**
   * Kills a process by PID using SIGTERM
   */
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

// Export for both CommonJS and ES modules
module.exports = PortScannerService;
module.exports.PortScannerService = PortScannerService;
