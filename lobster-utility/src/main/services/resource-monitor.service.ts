// ============================================================
// LOBSTER UTILITY — Resource Monitor Service
// Monitora CPU, RAM, disco del sistema
// ============================================================

import { EventEmitter } from 'events';
import { execSync } from 'child_process';
import type { SystemResources, MemoryConsumer } from '../../shared/types';

export class ResourceMonitorService extends EventEmitter {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastResources: SystemResources | null = null;

  /**
   * Legge le risorse di sistema (macOS)
   */
  async getSystemResources(): Promise<SystemResources> {
    try {
      const cpu = this.getCpuUsage();
      const memory = this.getMemoryUsage();
      const disk = this.getDiskUsage();

      const memoryConsumers = this.getTopMemoryConsumers(memory.totalGB, memory.usedGB);

      const resources: SystemResources = {
        cpuPercent: cpu.percent,
        cpuHumanLabel: this.getCpuLabel(cpu.percent),
        memoryUsedGB: memory.usedGB,
        memoryTotalGB: memory.totalGB,
        memoryPercent: memory.percent,
        memoryHumanLabel: this.getMemoryLabel(memory.percent),
        memoryTopConsumers: memoryConsumers,
        diskUsedGB: disk.usedGB,
        diskTotalGB: disk.totalGB,
        diskPercent: disk.percent,
        diskHumanLabel: this.getDiskLabel(disk.percent),
      };

      this.lastResources = resources;
      return resources;
    } catch (error) {
      console.error('[ResourceMonitor] Error getting resources:', error);
      // Return safe defaults
      return {
        cpuPercent: 0,
        cpuHumanLabel: 'Non disponibile',
        memoryUsedGB: 0,
        memoryTotalGB: 0,
        memoryPercent: 0,
        memoryHumanLabel: 'Non disponibile',
        memoryTopConsumers: [],
        diskUsedGB: 0,
        diskTotalGB: 0,
        diskPercent: 0,
        diskHumanLabel: 'Non disponibile',
      };
    }
  }

  /**
   * CPU usage via top -l 1 (macOS)
   */
  private getCpuUsage(): { percent: number } {
    try {
      const output = execSync(
        "top -l 1 -n 0 | grep 'CPU usage'",
        { encoding: 'utf-8', timeout: 5000 }
      );
      // Output: "CPU usage: 12.34% user, 5.67% sys, 81.99% idle"
      const idleMatch = output.match(/([\d.]+)%\s+idle/);
      if (idleMatch) {
        const idle = parseFloat(idleMatch[1]);
        return { percent: Math.round((100 - idle) * 10) / 10 };
      }
      return { percent: 0 };
    } catch {
      return { percent: 0 };
    }
  }

  /**
   * Memory usage via vm_stat + sysctl (macOS)
   */
  private getMemoryUsage(): { usedGB: number; totalGB: number; percent: number } {
    try {
      // Total RAM
      const totalOutput = execSync(
        'sysctl -n hw.memsize',
        { encoding: 'utf-8', timeout: 3000 }
      );
      const totalBytes = parseInt(totalOutput.trim(), 10);
      const totalGB = totalBytes / (1024 * 1024 * 1024);

      // Memory pressure (simpler approach)
      const vmOutput = execSync(
        'vm_stat',
        { encoding: 'utf-8', timeout: 3000 }
      );

      // Rileva page size dinamicamente da vm_stat (Apple Silicon=16384, Intel=4096)
      const pageSizeMatch = vmOutput.match(/page size of (\d+) bytes/);
      const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;
      const freeMatch = vmOutput.match(/Pages free:\s+(\d+)/);
      const inactiveMatch = vmOutput.match(/Pages inactive:\s+(\d+)/);
      const speculativeMatch = vmOutput.match(/Pages speculative:\s+(\d+)/);

      const freePages = parseInt(freeMatch?.[1] ?? '0', 10);
      const inactivePages = parseInt(inactiveMatch?.[1] ?? '0', 10);
      const speculativePages = parseInt(speculativeMatch?.[1] ?? '0', 10);

      const freeGB = (freePages + inactivePages + speculativePages) * pageSize / (1024 * 1024 * 1024);
      const usedGB = totalGB - freeGB;
      const percent = Math.round((usedGB / totalGB) * 1000) / 10;

      return { usedGB: Math.round(usedGB * 10) / 10, totalGB: Math.round(totalGB), percent };
    } catch {
      return { usedGB: 0, totalGB: 0, percent: 0 };
    }
  }

  /**
   * Disk usage via df (macOS)
   */
  private getDiskUsage(): { usedGB: number; totalGB: number; percent: number } {
    try {
      const output = execSync(
        "df -g / | tail -1",
        { encoding: 'utf-8', timeout: 3000 }
      );
      const parts = output.trim().split(/\s+/);
      // df -g output: Filesystem 1G-blocks Used Available Capacity ...
      const totalGB = parseInt(parts[1], 10);
      const usedGB = parseInt(parts[2], 10);
      const percent = Math.round((usedGB / totalGB) * 100);

      return { usedGB, totalGB, percent };
    } catch {
      return { usedGB: 0, totalGB: 0, percent: 0 };
    }
  }

  /**
   * Top memory consumers via ps (macOS)
   * Groups by friendly app name and aggregates child processes
   */
  private getTopMemoryConsumers(totalGB: number, usedGB: number): MemoryConsumer[] {
    try {
      // ps -ax (NO -m: evita duplicati per thread) -o pid,rss,comm — rss in KB
      const output = execSync(
        'ps -ax -o pid=,rss=,comm= | sort -k2 -rn | head -100',
        { encoding: 'utf-8', timeout: 5000 }
      );

      // Group by process name (aggregate child processes)
      const grouped = new Map<string, { totalKB: number; pids: number[] }>();

      for (const line of output.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const match = trimmed.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
        if (!match) continue;

        const pid = parseInt(match[1], 10);
        const rssKB = parseInt(match[2], 10);
        let processPath = match[3].trim();

        if (rssKB < 10240) continue; // Skip processes < 10 MB

        // Extract friendly name from path
        const friendlyName = this.getFriendlyProcessName(processPath);

        const existing = grouped.get(friendlyName);
        if (existing) {
          existing.totalKB += rssKB;
          existing.pids.push(pid);
        } else {
          grouped.set(friendlyName, { totalKB: rssKB, pids: [pid] });
        }
      }

      // Sort by memory and take top 7 (leave room for "Altro" row)
      const sorted = Array.from(grouped.entries())
        .sort((a, b) => b[1].totalKB - a[1].totalKB)
        .slice(0, 7);

      const totalMB = totalGB * 1024;
      const usedMB = usedGB * 1024;

      // Sum of visible processes
      let visibleSumMB = 0;

      const results: MemoryConsumer[] = sorted.map(([name, data]) => {
        const memoryMB = Math.round(data.totalKB / 1024);
        visibleSumMB += memoryMB;
        const memoryPercent = Math.round((memoryMB / totalMB) * 1000) / 10;
        const memoryGB = memoryMB / 1024;

        let humanLabel: string;
        if (memoryGB >= 1) {
          humanLabel = `${name} usa ${memoryGB.toFixed(1)} GB`;
        } else {
          humanLabel = `${name} usa ${memoryMB} MB`;
        }

        return {
          name,
          pid: data.pids[0],
          memoryMB,
          memoryPercent,
          humanLabel,
        };
      });

      // Add "Altro (Sistema)" row for kernel/wired/cache/compressed not shown in ps
      const otherMB = Math.max(0, Math.round(usedMB - visibleSumMB));
      if (otherMB > 100) { // only show if > 100 MB
        const otherGB = otherMB / 1024;
        results.push({
          name: 'Altro (Sistema)',
          pid: 0,
          memoryMB: otherMB,
          memoryPercent: Math.round((otherMB / totalMB) * 1000) / 10,
          humanLabel: otherGB >= 1
            ? `Cache/kernel/compresso: ${otherGB.toFixed(1)} GB`
            : `Cache/kernel/compresso: ${otherMB} MB`,
        });
      }

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Maps process paths to friendly Italian names
   */
  private getFriendlyProcessName(processPath: string): string {
    const basename = processPath.split('/').pop() || processPath;

    // Known process name mappings
    const nameMap: Record<string, string> = {
      'Google Chrome': 'Google Chrome',
      'Google Chrome Helper': 'Google Chrome',
      'Google Chrome Helper (Renderer)': 'Google Chrome',
      'Google Chrome Helper (GPU)': 'Google Chrome',
      'com.docker.vmnetd': 'Docker',
      'Docker': 'Docker',
      'Docker Desktop': 'Docker',
      'com.docker.hyperkit': 'Docker',
      'com.docker.backend': 'Docker',
      'vpnkit-bridge': 'Docker',
      'node': 'Node.js',
      'electron': 'Electron',
      'Electron': 'Electron',
      'Code Helper': 'VS Code',
      'Code Helper (Renderer)': 'VS Code',
      'Electron Helper': 'Electron',
      'Slack': 'Slack',
      'Slack Helper': 'Slack',
      'Slack Helper (Renderer)': 'Slack',
      'Safari': 'Safari',
      'com.apple.WebKit': 'Safari',
      'Firefox': 'Firefox',
      'firefox': 'Firefox',
      'Finder': 'Finder',
      'WindowServer': 'macOS (Grafica)',
      'kernel_task': 'macOS (Sistema)',
      'mds': 'Spotlight',
      'mds_stores': 'Spotlight',
      'postgres': 'PostgreSQL',
      'redis-server': 'Redis',
      'mongod': 'MongoDB',
      'mysqld': 'MySQL',
      'java': 'Java',
      'python3': 'Python',
      'python': 'Python',
      'ruby': 'Ruby',
      'ollama': 'Ollama AI',
      'ollama_llama_server': 'Ollama AI',
      'Xcode': 'Xcode',
      'Terminal': 'Terminale',
      'iTerm2': 'iTerm',
      'Spotify': 'Spotify',
      'zoom.us': 'Zoom',
      'Figma': 'Figma',
      'Notion': 'Notion',
      'Discord': 'Discord',
    };

    // Try exact match first
    if (nameMap[basename]) return nameMap[basename];

    // Try partial match
    for (const [key, value] of Object.entries(nameMap)) {
      if (basename.includes(key) || processPath.includes(key)) {
        return value;
      }
    }

    // Clean up helper processes
    if (basename.includes('Helper')) {
      const appName = basename.replace(/ Helper.*$/, '').trim();
      return appName || basename;
    }

    return basename;
  }

  /**
   * Human labels in Italian
   */
  private getCpuLabel(percent: number): string {
    if (percent < 30) return 'Tranquillo';
    if (percent < 60) return 'Attivo';
    if (percent < 85) return 'Sotto pressione';
    return 'Sovraccarico!';
  }

  private getMemoryLabel(percent: number): string {
    if (percent < 50) return 'Tanta disponibile';
    if (percent < 70) return 'Occupata ma ok';
    if (percent < 85) return 'Quasi piena';
    return 'Memoria critica!';
  }

  private getDiskLabel(percent: number): string {
    if (percent < 50) return 'Tanto spazio';
    if (percent < 75) return 'Spazio ok';
    if (percent < 90) return 'Si sta riempiendo';
    return 'Disco quasi pieno!';
  }

  /**
   * Start polling
   */
  startPolling(intervalMs: number = 10000): void {
    if (this.pollingInterval) return;

    // Initial read
    this.getSystemResources().then((resources) => {
      this.emit('resourcesChanged', resources);
    });

    this.pollingInterval = setInterval(async () => {
      const resources = await this.getSystemResources();
      this.emit('resourcesChanged', resources);
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
