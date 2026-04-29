import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DockerMonitorService } from './docker-monitor.service';
import Dockerode from 'dockerode';
import { execSync } from 'child_process';

// Create mock instances that will be reused
let mockContainer: any;
let mockDocker: any;

// Mock dockerode
vi.mock('dockerode', () => {
  return {
    default: vi.fn(() => mockDocker),
  };
});

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

describe('DockerMonitorService', () => {
  let service: DockerMonitorService;

  beforeEach(() => {
    // Reset all mocks first
    vi.clearAllMocks();

    // Create fresh mock instances for this test
    mockContainer = {
      inspect: vi.fn(),
      stats: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      restart: vi.fn(),
      logs: vi.fn(),
    };

    mockDocker = {
      listContainers: vi.fn(),
      getContainer: vi.fn(() => mockContainer),
    };

    // Configure the Dockerode mock to return mockDocker
    const MockedDockerode = vi.mocked(Dockerode);
    MockedDockerode.mockReturnValue(mockDocker as any);

    // Create the service
    service = new DockerMonitorService();
  });

  afterEach(() => {
    if (service) {
      service.stopPolling();
    }
  });

  describe('connect()', () => {
    it('should return true when Docker daemon is accessible', async () => {
      mockDocker.listContainers.mockResolvedValue([]);

      const result = await service.connect();
      expect(result).toBe(true);
    });

    it('should return false when Docker daemon is not accessible', async () => {
      mockDocker.listContainers.mockRejectedValue(
        new Error('ENOENT: no such file or directory')
      );

      const result = await service.connect();
      expect(result).toBe(false);
    });

    it('should handle permission denied errors', async () => {
      mockDocker.listContainers.mockRejectedValue(
        new Error('permission denied while trying to connect to the Docker daemon socket')
      );

      const result = await service.connect();
      expect(result).toBe(false);
    });
  });

  describe('getContainers()', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should list all containers with enriched data', async () => {
      const containerListResponse = [
        {
          Id: 'abc123',
          Names: ['/my-app'],
          Image: 'node:18',
          State: 'running',
          Status: 'Up 2 hours',
          Labels: {
            'com.docker.compose.service': 'app',
            'com.docker.compose.project': 'my-project',
          },
        },
      ];

      const containerInspect = {
        Id: 'abc123',
        Name: '/my-app',
        Config: {
          Image: 'node:18',
          Labels: {
            'com.docker.compose.service': 'app',
            'com.docker.compose.project': 'my-project',
          },
        },
        State: {
          Status: 'running',
          Running: true,
          Health: {
            Status: 'healthy',
          },
        },
        NetworkSettings: {
          Ports: {
            '3000/tcp': [{ HostPort: '3000' }],
          },
        },
        Created: '2026-04-01T10:00:00Z',
        StartedAt: '2026-04-12T08:00:00Z',
      };

      mockDocker.listContainers.mockResolvedValue(containerListResponse);
      mockContainer.inspect.mockResolvedValue(containerInspect);
      mockContainer.stats.mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 1000000000 },
          online_cpus: 4,
          system_cpu_usage: 10000000000,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 900000000 },
          system_cpu_usage: 9000000000,
        },
        memory_stats: {
          usage: 268435456,
          limit: 2147483648,
        },
      });

      const containers = await service.getContainers();

      expect(containers).toHaveLength(1);
      expect(containers[0].id).toBe('abc123');
      expect(containers[0].friendlyName).toBe('app');
      expect(containers[0].state).toBe('running');
      expect(containers[0].health).toBe('healthy');
      expect(containers[0].humanStatus).toBe('App è attivo e sano');
      expect(containers[0].composeProject).toBe('my-project');
      expect(containers[0].memoryMB).toBe(256);
    });

    it('should handle empty container list', async () => {
mockDocker.listContainers.mockResolvedValue([]);

      const containers = await service.getContainers();

      expect(containers).toEqual([]);
    });

    it('should throw when Docker is not connected', async () => {
      service = new DockerMonitorService();

      await expect(service.getContainers()).rejects.toThrow(
        'Docker not connected'
      );
    });

    it('should compute container health correctly for exited state', async () => {
      mockDocker.listContainers.mockResolvedValue([
        {
          Id: 'exit123',
          Names: ['/stopped-app'],
          Image: 'node:18',
          State: 'exited',
          Status: 'Exited (0) 30 minutes ago',
          Labels: {},
        },
      ]);

      const containerInspect = {
        Id: 'exit123',
        Name: '/stopped-app',
        Config: {
          Image: 'node:18',
          Labels: {},
        },
        State: {
          Status: 'exited',
          Running: false,
          ExitCode: 0,
        },
        NetworkSettings: { Ports: {} },
        Created: '2026-04-01T10:00:00Z',
      };

      mockContainer.inspect.mockResolvedValue(containerInspect);
      mockContainer.stats.mockRejectedValue(new Error('stats not available'));

      const containers = await service.getContainers();

      expect(containers[0].health).toBe('none');
      expect(containers[0].humanStatus).toContain('è terminato');
    });

    it('should generate correct humanStatus for unhealthy container', async () => {
mockDocker.listContainers.mockResolvedValue([
        {
          Id: 'unhealthy123',
          Names: ['/bad-app'],
          Image: 'node:18',
          State: 'running',
          Status: 'Up 1 hour (unhealthy)',
          Labels: {},
        },
      ]);

      const containerInspect = {
        Id: 'unhealthy123',
        Name: '/bad-app',
        Config: {
          Image: 'node:18',
          Labels: {},
        },
        State: {
          Status: 'running',
          Running: true,
          Health: {
            Status: 'unhealthy',
          },
        },
        NetworkSettings: { Ports: {} },
        Created: '2026-04-01T10:00:00Z',
      };

      mockContainer.inspect.mockResolvedValue(containerInspect);
      mockContainer.stats.mockRejectedValue(new Error(''));

      const containers = await service.getContainers();

      expect(containers[0].health).toBe('unhealthy');
      expect(containers[0].humanStatus).toBe('Bad app è in esecuzione ma non sano');
    });

    it('should detect platform mismatch on ARM Mac', async () => {
      // Mock process.arch
      const originalArch = process.arch;
      Object.defineProperty(process, 'arch', {
        value: 'arm64',
        configurable: true,
      });

      try {
        mockDocker.listContainers.mockResolvedValue([
          {
            Id: 'amd64app',
            Names: ['/intel-app'],
            Image: 'intel/app:amd64',
            State: 'running',
            Labels: {},
          },
        ]);

        const containerInspect = {
          Id: 'amd64app',
          Name: '/intel-app',
          Config: {
            Image: 'intel/app:amd64',
            Labels: {},
          },
          State: {
            Status: 'running',
            Running: true,
          },
          NetworkSettings: { Ports: {} },
          Created: '2026-04-01T10:00:00Z',
        };

        mockContainer.inspect.mockResolvedValue(containerInspect);
        mockContainer.stats.mockRejectedValue(new Error(''));

        const containers = await service.getContainers();

        expect(containers[0].platformWarning).toBeDefined();
        expect(containers[0].platformWarning).toContain('linux/amd64');
      } finally {
        Object.defineProperty(process, 'arch', {
          value: originalArch,
          configurable: true,
        });
      }
    });

    it('should extract port bindings correctly', async () => {
mockDocker.listContainers.mockResolvedValue([
        {
          Id: 'portapp',
          Names: ['/web'],
          Image: 'nginx:latest',
          State: 'running',
          Labels: {},
        },
      ]);

      const containerInspect = {
        Id: 'portapp',
        Name: '/web',
        Config: {
          Image: 'nginx:latest',
          Labels: {},
        },
        State: {
          Status: 'running',
          Running: true,
        },
        NetworkSettings: {
          Ports: {
            '80/tcp': [{ HostPort: '8080' }],
            '443/tcp': [{ HostPort: '8443' }],
          },
        },
        Created: '2026-04-01T10:00:00Z',
      };

      mockContainer.inspect.mockResolvedValue(containerInspect);
      mockContainer.stats.mockRejectedValue(new Error(''));

      const containers = await service.getContainers();

      expect(containers[0].ports).toHaveLength(2);
      expect(containers[0].ports).toContainEqual({
        host: 8080,
        container: 80,
        protocol: 'tcp',
      });
      expect(containers[0].ports).toContainEqual({
        host: 8443,
        container: 443,
        protocol: 'tcp',
      });
    });
  });

  describe('getComposeProjects()', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should group containers by Docker Compose project', async () => {
      mockDocker.listContainers.mockResolvedValue([
        {
          Id: 'db1',
          Names: ['/my-project_db_1'],
          Image: 'postgres:14',
          State: 'running',
          Labels: {
            'com.docker.compose.project': 'my-project',
            'com.docker.compose.service': 'db',
          },
        },
        {
          Id: 'app1',
          Names: ['/my-project_app_1'],
          Image: 'node:18',
          State: 'running',
          Labels: {
            'com.docker.compose.project': 'my-project',
            'com.docker.compose.service': 'app',
          },
        },
        {
          Id: 'other1',
          Names: ['/other-app'],
          Image: 'nginx:latest',
          State: 'running',
          Labels: {},
        },
      ]);

      const inspectResponse = {
        db1: {
          Id: 'db1',
          Name: '/my-project_db_1',
          Config: {
            Image: 'postgres:14',
            Labels: {
              'com.docker.compose.project': 'my-project',
              'com.docker.compose.service': 'db',
            },
          },
          State: { Status: 'running', Running: true, Health: { Status: 'healthy' } },
          NetworkSettings: { Ports: {} },
          Created: '2026-04-01T10:00:00Z',
        },
        app1: {
          Id: 'app1',
          Name: '/my-project_app_1',
          Config: {
            Image: 'node:18',
            Labels: {
              'com.docker.compose.project': 'my-project',
              'com.docker.compose.service': 'app',
            },
          },
          State: { Status: 'running', Running: true, Health: { Status: 'healthy' } },
          NetworkSettings: { Ports: {} },
          Created: '2026-04-01T10:00:00Z',
        },
        other1: {
          Id: 'other1',
          Name: '/other-app',
          Config: {
            Image: 'nginx:latest',
            Labels: {},
          },
          State: { Status: 'running', Running: true },
          NetworkSettings: { Ports: {} },
          Created: '2026-04-01T10:00:00Z',
        },
      };

      // Setup getContainer to return a container object with the proper inspect method
      mockDocker.getContainer.mockImplementation((id: string) => ({
        inspect: vi.fn(() => Promise.resolve(inspectResponse[id as keyof typeof inspectResponse])),
        stats: vi.fn().mockRejectedValue(new Error('')),
      }));

      const projects = await service.getComposeProjects();

      expect(projects).toHaveLength(2);
      expect(projects.find((p) => p.name === 'my-project')).toBeDefined();
      expect(projects.find((p) => p.name === 'my-project')?.totalContainers).toBe(
        2
      );
      expect(projects.find((p) => p.name === 'ungrouped')).toBeDefined();
    });

    it('should calculate project health status correctly', async () => {
      mockDocker.listContainers.mockResolvedValue([
        {
          Id: 'healthy1',
          Names: ['/app_1'],
          Image: 'node:18',
          State: 'running',
          Labels: { 'com.docker.compose.project': 'app' },
        },
        {
          Id: 'unhealthy1',
          Names: ['/app_2'],
          Image: 'node:18',
          State: 'running',
          Labels: { 'com.docker.compose.project': 'app' },
        },
      ]);

      const inspectMap: Record<string, any> = {
        healthy1: {
          Id: 'healthy1',
          Name: '/app_1',
          Config: {
            Image: 'node:18',
            Labels: { 'com.docker.compose.project': 'app' },
          },
          State: {
            Status: 'running',
            Running: true,
            Health: { Status: 'healthy' },
          },
          NetworkSettings: { Ports: {} },
          Created: '2026-04-01T10:00:00Z',
        },
        unhealthy1: {
          Id: 'unhealthy1',
          Name: '/app_2',
          Config: {
            Image: 'node:18',
            Labels: { 'com.docker.compose.project': 'app' },
          },
          State: {
            Status: 'running',
            Running: true,
            Health: { Status: 'unhealthy' },
          },
          NetworkSettings: { Ports: {} },
          Created: '2026-04-01T10:00:00Z',
        },
      };

      mockDocker.getContainer.mockImplementation((id: string) => ({
        inspect: vi.fn(() => Promise.resolve(inspectMap[id])),
        stats: vi.fn().mockRejectedValue(new Error('')),
      }));

      const projects = await service.getComposeProjects();
      const appProject = projects.find((p) => p.name === 'app');

      expect(appProject?.health).toBe('critical');
      expect(appProject?.humanStatus).toContain('problemi');
    });

    it('should generate correct humanStatus for completely active project', async () => {
      mockDocker.listContainers.mockResolvedValue([
        {
          Id: 'c1',
          Names: ['/app_1'],
          Image: 'node:18',
          State: 'running',
          Labels: { 'com.docker.compose.project': 'app' },
        },
        {
          Id: 'c2',
          Names: ['/app_2'],
          Image: 'postgres:14',
          State: 'running',
          Labels: { 'com.docker.compose.project': 'app' },
        },
      ]);

      const inspectMap: Record<string, any> = {
        c1: {
          Id: 'c1',
          Name: '/app_1',
          Config: {
            Image: 'node:18',
            Labels: { 'com.docker.compose.project': 'app' },
          },
          State: {
            Status: 'running',
            Running: true,
            Health: { Status: 'healthy' },
          },
          NetworkSettings: { Ports: {} },
          Created: '2026-04-01T10:00:00Z',
        },
        c2: {
          Id: 'c2',
          Name: '/app_2',
          Config: {
            Image: 'postgres:14',
            Labels: { 'com.docker.compose.project': 'app' },
          },
          State: {
            Status: 'running',
            Running: true,
            Health: { Status: 'healthy' },
          },
          NetworkSettings: { Ports: {} },
          Created: '2026-04-01T10:00:00Z',
        },
      };

      mockDocker.getContainer.mockImplementation((id: string) => ({
        inspect: vi.fn(() => Promise.resolve(inspectMap[id])),
        stats: vi.fn().mockRejectedValue(new Error('')),
      }));

      const projects = await service.getComposeProjects();
      const appProject = projects.find((p) => p.name === 'app');

      expect(appProject?.humanStatus).toBe('App è completamente attivo e sano');
    });
  });

  describe('Container actions', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should start a container', async () => {
      await service.startContainer('abc123');
      expect(mockContainer.start).toHaveBeenCalledWith();
    });

    it('should stop a container', async () => {
      await service.stopContainer('abc123');
      expect(mockContainer.stop).toHaveBeenCalledWith();
    });

    it('should restart a container', async () => {
      await service.restartContainer('abc123');
      expect(mockContainer.restart).toHaveBeenCalledWith();
    });

    it('should get container logs', async () => {
      const logOutput = 'Starting application...\nServer running on port 3000\n';
      mockContainer.logs.mockResolvedValue(Buffer.from(logOutput));

      const logs = await service.getContainerLogs('abc123', 50);

      expect(logs).toBe(logOutput);
      expect(mockContainer.logs).toHaveBeenCalledWith({
        stdout: true,
        stderr: true,
        tail: 50,
        follow: false,
      });
    });

    it('should throw error when Docker is not connected for start', async () => {
      service = new DockerMonitorService();

      await expect(service.startContainer('abc123')).rejects.toThrow(
        'Docker not connected'
      );
    });
  });

  describe('getContainerStats()', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should calculate CPU and memory stats correctly', async () => {
      mockContainer.stats.mockResolvedValue({
        cpu_stats: {
          cpu_usage: { total_usage: 1000000000 },
          online_cpus: 4,
          system_cpu_usage: 10000000000,
        },
        precpu_stats: {
          cpu_usage: { total_usage: 900000000 },
          system_cpu_usage: 9000000000,
        },
        memory_stats: {
          usage: 536870912,
          limit: 2147483648,
        },
      });

      const stats = await service.getContainerStats('abc123');

      expect(stats.cpuPercent).toBeDefined();
      expect(stats.memoryMB).toBe(512);
      expect(stats.memoryLimit).toBe(2048);
    });

    it('should return empty object for stopped containers', async () => {
      mockContainer.stats.mockRejectedValue(
        new Error('Container not running')
      );

      const stats = await service.getContainerStats('abc123');

      expect(stats).toEqual({});
    });
  });

  describe('Polling', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should emit containersChanged event on container list change', async () => {
      const MockedDockerode = vi.mocked(require('dockerode').default);

      // First call returns 1 container, second call returns 2
      mockDocker.listContainers.mockResolvedValueOnce([
        {
          Id: 'c1',
          Names: ['/app'],
          Image: 'node:18',
          State: 'running',
          Labels: {},
        },
      ]);

      const containerInspect = {
        Id: 'c1',
        Name: '/app',
        Config: { Image: 'node:18', Labels: {} },
        State: { Status: 'running', Running: true },
        NetworkSettings: { Ports: {} },
        Created: '2026-04-01T10:00:00Z',
      };

      mockContainer.inspect.mockResolvedValue(containerInspect);
      mockContainer.stats.mockRejectedValue(new Error(''));

      await new Promise<void>((resolve) => {
        let eventCount = 0;
        service.on('containersChanged', () => {
          eventCount++;
          if (eventCount === 1) {
            service.stopPolling();
            resolve();
          }
        });

        service.startPolling(100);
      });
    });

    it('should stop polling correctly', () => {
      service.startPolling(100);
      expect(service['isPolling']).toBe(true);

      service.stopPolling();
      expect(service['isPolling']).toBe(false);
    });
  });

  describe('Compose operations', () => {
    it('should execute docker-compose up', async () => {
      const mockExecSync = vi.mocked(execSync);
      mockExecSync.mockReturnValue(Buffer.from(''));

      await service.startComposeProject('/path/to/project');

      expect(mockExecSync).toHaveBeenCalledWith(
        'cd "/path/to/project" && docker-compose up -d',
        { stdio: 'inherit' }
      );
    });

    it('should execute docker-compose down', async () => {
      const mockExecSync = vi.mocked(execSync);
      mockExecSync.mockReturnValue(Buffer.from(''));

      await service.stopComposeProject('/path/to/project');

      expect(mockExecSync).toHaveBeenCalledWith(
        'cd "/path/to/project" && docker-compose down',
        { stdio: 'inherit' }
      );
    });

    it('should emit projectEvent on successful up', async () => {
      const mockExecSync = vi.mocked(execSync);
      mockExecSync.mockReturnValue(Buffer.from(''));

      const eventHandler = vi.fn();
      service.on('projectEvent', eventHandler);

      await service.startComposeProject('/path/to/project');

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/path/to/project',
          event: 'up',
        })
      );
    });

    it('should throw error when docker-compose command fails', async () => {
      const mockExecSync = vi.mocked(execSync);
      mockExecSync.mockImplementation(() => {
        throw new Error('docker-compose not found');
      });

      await expect(
        service.startComposeProject('/path/to/project')
      ).rejects.toThrow();
    });
  });
});
