import { EventEmitter } from 'events';
import Dockerode from 'dockerode';
import { execSync } from 'child_process';
import type {
  ContainerState,
  ContainerHealth,
  HealthStatus,
  DockerContainer,
  DockerComposeProject,
} from '../../shared/types';

export class DockerMonitorService extends EventEmitter {
  private docker: Dockerode | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastContainers: Map<string, DockerContainer> = new Map();
  private isPolling = false;
  private socketPath: string = '/var/run/docker.sock';

  /**
   * Update socket path from settings
   */
  setSocketPath(socketPath: string): void {
    this.socketPath = socketPath;
  }

  /**
   * Attempts to connect to Docker daemon via socket
   */
  async connect(): Promise<boolean> {
    try {
      this.docker = new Dockerode({
        socketPath: this.socketPath,
      });

      // Test connection by listing containers
      await this.docker.listContainers({ all: true, limit: 1 });
      return true;
    } catch (error) {
      console.error('Docker connection failed:', error);
      this.docker = null;
      return false;
    }
  }

  /**
   * List all containers with enriched metadata
   */
  async getContainers(): Promise<DockerContainer[]> {
    if (!this.docker) {
      throw new Error('Docker not connected. Call connect() first.');
    }

    try {
      const dockerContainers = await this.docker.listContainers({ all: true });
      const enrichedContainers: DockerContainer[] = [];

      for (const containerInfo of dockerContainers) {
        try {
          const container = this.docker.getContainer(containerInfo.Id);
          const inspect = await container.inspect();
          const stats = await this.getContainerStats(containerInfo.Id);

          const enriched = await this.enrichContainer(inspect, stats, inspect);
          enrichedContainers.push(enriched);
        } catch (error) {
          console.error(
            `Error enriching container ${containerInfo.Id}:`,
            error
          );
        }
      }

      return enrichedContainers;
    } catch (error) {
      console.error('Failed to list containers:', error);
      throw error;
    }
  }

  /**
   * Get containers grouped by Docker Compose project
   */
  async getComposeProjects(): Promise<DockerComposeProject[]> {
    const containers = await this.getContainers();
    const projectsMap = new Map<string, DockerContainer[]>();

    // Group by compose project label
    for (const container of containers) {
      const projectName = container.composeProject || 'ungrouped';
      if (!projectsMap.has(projectName)) {
        projectsMap.set(projectName, []);
      }
      projectsMap.get(projectName)!.push(container);
    }

    // Transform to DockerComposeProject[] with aggregated health
    const projects: DockerComposeProject[] = [];

    for (const [projectName, projectContainers] of projectsMap.entries()) {
      const runningCount = projectContainers.filter(
        (c) => c.state === 'running'
      ).length;
      const healthyCount = projectContainers.filter(
        (c) => c.health === 'healthy' || c.health === 'none'
      ).length;

      let projectHealth: HealthStatus = 'healthy';
      if (projectContainers.some((c) => c.health === 'unhealthy')) {
        projectHealth = 'critical';
      } else if (projectContainers.some((c) => c.health === 'starting')) {
        projectHealth = 'warning';
      } else if (runningCount === 0) {
        projectHealth = 'offline';
      }

      const humanStatus = this.generateProjectHumanStatus(
        projectName,
        runningCount,
        projectContainers.length,
        projectHealth
      );

      projects.push({
        name: projectName,
        containers: projectContainers,
        totalContainers: projectContainers.length,
        runningContainers: runningCount,
        health: projectHealth,
        humanStatus,
      });
    }

    return projects;
  }

  /**
   * Start a container by ID
   */
  async startContainer(id: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Docker not connected');
    }

    try {
      const container = this.docker.getContainer(id);
      await container.start();
      this.emit('containerEvent', {
        id,
        event: 'start',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`Failed to start container ${id}:`, error);
      throw error;
    }
  }

  /**
   * Stop a container by ID
   */
  async stopContainer(id: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Docker not connected');
    }

    try {
      const container = this.docker.getContainer(id);
      // Timeout di 10 secondi — se il container non risponde a SIGTERM, forza SIGKILL
      await container.stop({ t: 10 });
      this.emit('containerEvent', {
        id,
        event: 'stop',
        timestamp: new Date(),
      });
    } catch (error: any) {
      // Se il container è già fermo, non è un errore
      if (error?.statusCode === 304) {
        console.log(`[Docker] Container ${id} already stopped`);
        return;
      }
      console.error(`Failed to stop container ${id}:`, error);
      throw error;
    }
  }

  /**
   * Restart a container by ID
   */
  async restartContainer(id: string): Promise<void> {
    if (!this.docker) {
      throw new Error('Docker not connected');
    }

    try {
      const container = this.docker.getContainer(id);
      await container.restart();
      this.emit('containerEvent', {
        id,
        event: 'restart',
        timestamp: new Date(),
      });
    } catch (error) {
      console.error(`Failed to restart container ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get recent container logs
   */
  async getContainerLogs(id: string, tail: number = 100): Promise<string> {
    if (!this.docker) {
      throw new Error('Docker not connected');
    }

    try {
      const container = this.docker.getContainer(id);
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        follow: false,
      });

      return logs.toString();
    } catch (error) {
      console.error(`Failed to get logs for container ${id}:`, error);
      throw error;
    }
  }

  /**
   * Get CPU and memory stats for a container
   */
  async getContainerStats(id: string): Promise<{
    cpuPercent?: number;
    memoryMB?: number;
    memoryLimit?: number;
  }> {
    if (!this.docker) {
      return {};
    }

    try {
      const container = this.docker.getContainer(id);
      const stats = await container.stats({ stream: false });

      const cpuDelta =
        (stats as any).cpu_stats.cpu_usage.total_usage -
        (stats as any).precpu_stats.cpu_usage.total_usage;
      const systemDelta =
        (stats as any).cpu_stats.system_cpu_usage -
        (stats as any).precpu_stats.system_cpu_usage;
      const cpuCount = (stats as any).cpu_stats.online_cpus || 1;

      const cpuPercent =
        cpuCount > 0 ? (cpuDelta / systemDelta) * cpuCount * 100 : 0;

      const memoryBytes = (stats as any).memory_stats.usage || 0;
      const memoryLimitBytes = (stats as any).memory_stats.limit || 0;
      const memoryMB = Math.round(memoryBytes / 1024 / 1024);
      const memoryLimit = Math.round(memoryLimitBytes / 1024 / 1024);

      return {
        cpuPercent: Math.round(cpuPercent * 100) / 100,
        memoryMB,
        memoryLimit,
      };
    } catch (error) {
      // Stats not available for stopped containers
      return {};
    }
  }

  /**
   * Start periodic monitoring (emits containersChanged events)
   */
  startPolling(intervalMs: number = 5000): void {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    const poll = async () => {
      try {
        const currentContainers = await this.getContainers();
        // note: initial poll runs immediately below (after setInterval)

        // Check for ANY changes: new/removed containers OR state/health changes
        const currentIds = new Set(currentContainers.map((c) => c.id));
        const lastIds = new Set(this.lastContainers.keys());

        let changed =
          currentIds.size !== lastIds.size ||
          [...currentIds].some((id) => !lastIds.has(id));

        // Also detect state changes (running→exited, health changes, etc.)
        if (!changed) {
          for (const container of currentContainers) {
            const lastContainer = this.lastContainers.get(container.id);
            if (lastContainer && (
              lastContainer.state !== container.state ||
              lastContainer.health !== container.health
            )) {
              changed = true;
              break;
            }
          }
        }

        if (changed) {
          this.emit('containersChanged', currentContainers);
        }

        // Check for health changes PRIMA di aggiornare la cache
        for (const container of currentContainers) {
          const lastContainer = this.lastContainers.get(container.id);
          if (
            lastContainer &&
            lastContainer.health !== container.health &&
            container.health !== 'none'
          ) {
            this.emit('healthChanged', {
              id: container.id,
              health: container.health,
              timestamp: new Date(),
            });
          }
        }

        // Aggiorna la cache DOPO il check
        this.lastContainers = new Map(
          currentContainers.map((c) => [c.id, c])
        );
      } catch (error) {
        console.error('Error during polling:', error);
      }
    };

    // Run initial poll immediately (don't wait for first interval)
    poll().catch(() => {});
    this.pollingInterval = setInterval(poll, intervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.isPolling = false;
  }

  /**
   * Start all containers for a compose project by name.
   * Uses `docker compose` CLI with project name filter.
   */
  async startComposeProject(projectName: string): Promise<void> {
    if (!this.docker) throw new Error('Docker not connected');

    try {
      // Approach 1: Start each stopped container belonging to this compose project
      const containers = await this.getContainers();
      const projectContainers = containers.filter(
        (c) => c.composeProject === projectName && c.state !== 'running'
      );

      if (projectContainers.length === 0) {
        console.log(`[Docker] All containers for "${projectName}" are already running`);
        return;
      }

      console.log(`[Docker] Starting ${projectContainers.length} containers for "${projectName}"...`);

      for (const c of projectContainers) {
        try {
          const container = this.docker.getContainer(c.id);
          await container.start();
          console.log(`[Docker] Started: ${c.friendlyName}`);
        } catch (err: any) {
          // 304 = already running
          if (err?.statusCode === 304) continue;
          console.error(`[Docker] Failed to start ${c.friendlyName}:`, err?.message);
        }
      }

      this.emit('projectEvent', { name: projectName, event: 'up', timestamp: new Date() });
    } catch (error) {
      console.error(`[Docker] Failed to start compose project "${projectName}":`, error);
      throw error;
    }
  }

  /**
   * Stop all containers for a compose project by name.
   */
  async stopComposeProject(projectName: string): Promise<void> {
    if (!this.docker) throw new Error('Docker not connected');

    try {
      const containers = await this.getContainers();
      const projectContainers = containers.filter(
        (c) => c.composeProject === projectName && c.state === 'running'
      );

      if (projectContainers.length === 0) {
        console.log(`[Docker] All containers for "${projectName}" are already stopped`);
        return;
      }

      console.log(`[Docker] Stopping ${projectContainers.length} containers for "${projectName}"...`);

      for (const c of projectContainers) {
        try {
          const container = this.docker.getContainer(c.id);
          await container.stop({ t: 10 });
          console.log(`[Docker] Stopped: ${c.friendlyName}`);
        } catch (err: any) {
          if (err?.statusCode === 304) continue;
          console.error(`[Docker] Failed to stop ${c.friendlyName}:`, err?.message);
        }
      }

      this.emit('projectEvent', { name: projectName, event: 'down', timestamp: new Date() });
    } catch (error) {
      console.error(`[Docker] Failed to stop compose project "${projectName}":`, error);
      throw error;
    }
  }

  /**
   * PRIVATE: Enrich container data with human-readable info
   */
  private async enrichContainer(
    inspect: Dockerode.ContainerInspectInfo,
    stats: Awaited<ReturnType<typeof this.getContainerStats>>,
    originalInfo: Dockerode.ContainerInspectInfo
  ): Promise<DockerContainer> {
    const labels = inspect.Config?.Labels || {};
    const state = this.mapContainerState(inspect.State);
    const health = this.computeHealth(inspect.State);

    // Derive friendly name from compose service or container name
    const composeName =
      labels['com.docker.compose.service'] ||
      inspect.Name?.replace(/^\//, '') ||
      'container';
    const friendlyName = this.normalizeName(composeName);

    // Platform detection
    let platformWarning: string | undefined;
    const imageConfig = originalInfo.Config?.Image || '';
    if (
      process.arch === 'arm64' &&
      (imageConfig.includes('linux/amd64') || imageConfig.includes('amd64'))
    ) {
      platformWarning = 'Immagine linux/amd64 su Mac ARM: prestazioni ridotte';
    }

    const ports = this.extractPorts(inspect.NetworkSettings?.Ports || {});

    return {
      id: inspect.Id || '',
      name: inspect.Name?.replace(/^\//, '') || '',
      friendlyName,
      image: inspect.Config?.Image || '',
      state,
      health,
      status: inspect.State?.Status as string,
      humanStatus: this.generateHumanStatus(
        friendlyName,
        state,
        health,
        inspect.State
      ),
      projectId: labels['com.docker.compose.project'],
      composeProject: labels['com.docker.compose.project'],
      ports,
      cpuPercent: stats?.cpuPercent,
      memoryMB: stats?.memoryMB,
      memoryLimit: stats?.memoryLimit,
      createdAt: inspect.Created || new Date().toISOString(),
      startedAt: inspect.State?.StartedAt,
      platformWarning,
    };
  }

  /**
   * PRIVATE: Map Docker state to our ContainerState type
   */
  private mapContainerState(state: any): ContainerState {
    const status = state?.Status || 'created';
    switch (status) {
      case 'running':
        return 'running';
      case 'exited':
        return 'exited';
      case 'paused':
        return 'paused';
      case 'restarting':
        return 'restarting';
      case 'dead':
        return 'dead';
      default:
        return 'created';
    }
  }

  /**
   * PRIVATE: Compute health status from Docker health check or state
   */
  private computeHealth(state: any): ContainerHealth {
    const healthStatus = state?.Health?.Status;
    if (healthStatus === 'healthy') {
      return 'healthy';
    }
    if (healthStatus === 'unhealthy') {
      return 'unhealthy';
    }
    if (healthStatus === 'starting') {
      return 'starting';
    }

    // Fall back to state-based health
    if (state?.Running === true) {
      return 'none';
    }
    if (state?.Status === 'exited') {
      return 'none';
    }

    return 'none';
  }

  /**
   * PRIVATE: Extract ports from Docker port bindings
   */
  private extractPorts(
    portBindings: Record<string, any[] | null>
  ): DockerContainer['ports'] {
    const ports: DockerContainer['ports'] = [];

    for (const [containerPort, bindings] of Object.entries(portBindings)) {
      const [port, protocol] = containerPort.split('/');
      if (bindings && bindings.length > 0) {
        const hostPort = parseInt(bindings[0].HostPort, 10);
        ports.push({
          host: hostPort,
          container: parseInt(port, 10),
          protocol: protocol || 'tcp',
        });
      }
    }

    return ports;
  }

  /**
   * PRIVATE: Generate human-readable status in Italian
   */
  private generateHumanStatus(
    name: string,
    state: ContainerState,
    health: ContainerHealth,
    dockerState: any
  ): string {
    const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);

    if (state === 'running') {
      if (health === 'healthy') {
        return `${capitalizedName} è attivo e sano`;
      }
      if (health === 'unhealthy') {
        return `${capitalizedName} è in esecuzione ma non sano`;
      }
      if (health === 'starting') {
        return `${capitalizedName} sta partendo`;
      }
      return `${capitalizedName} è in esecuzione`;
    }

    if (state === 'exited') {
      const exitCode = dockerState?.ExitCode;
      return `${capitalizedName} è terminato (codice: ${exitCode || 'N/A'})`;
    }

    if (state === 'paused') {
      return `${capitalizedName} è in pausa`;
    }

    return `${capitalizedName} è ${state}`;
  }

  /**
   * PRIVATE: Generate project health status in Italian
   */
  private generateProjectHumanStatus(
    projectName: string,
    runningCount: number,
    totalCount: number,
    health: HealthStatus
  ): string {
    const capitalizedProject = projectName.charAt(0).toUpperCase() + projectName.slice(1);

    if (runningCount === 0) {
      return `${capitalizedProject} non è attivo`;
    }

    if (runningCount === totalCount) {
      if (health === 'healthy') {
        return `${capitalizedProject} è completamente attivo e sano`;
      }
      if (health === 'critical') {
        return `${capitalizedProject} è completamente attivo ma con problemi`;
      }
      if (health === 'warning') {
        return `${capitalizedProject} sta avviando tutti i servizi`;
      }
      return `${capitalizedProject} è completamente attivo`;
    }

    return `${capitalizedProject} è parzialmente attivo (${runningCount}/${totalCount})`;
  }

  /**
   * PRIVATE: Normalize container names for display
   */
  private normalizeName(name: string): string {
    return name
      .replace(/^\//, '')
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .trim();
  }
}
