// Load Balancer & Health Check Utilities
import { LoadBalancerConfig, ServerConfig, ServerHealth } from './types';

// Load Balancer implementation
export class LoadBalancer {
  private config: LoadBalancerConfig;
  private serverHealth: Map<string, ServerHealth>;
  private currentIndex: number;
  private connectionCounts: Map<string, number>;
  private healthCheckInterval: NodeJS.Timeout | null;

  constructor(config: LoadBalancerConfig) {
    this.config = config;
    this.serverHealth = new Map();
    this.currentIndex = 0;
    this.connectionCounts = new Map();
    this.healthCheckInterval = null;

    // Initialize health tracking
    for (const server of config.servers) {
      this.serverHealth.set(server.id, {
        serverId: server.id,
        healthy: server.healthy !== false,
        lastCheck: new Date(),
        consecutiveFailures: 0,
      });
      this.connectionCounts.set(server.id, 0);
    }
  }

  // Get next server based on algorithm
  getServer(): ServerConfig | null {
    const healthyServers = this.getHealthyServers();

    if (healthyServers.length === 0) {
      return null;
    }

    switch (this.config.algorithm) {
      case 'round-robin':
        return this.roundRobin(healthyServers);
      case 'least-connections':
        return this.leastConnections(healthyServers);
      case 'weighted':
        return this.weighted(healthyServers);
      case 'ip-hash':
        // Would need client IP; fall back to round-robin
        return this.roundRobin(healthyServers);
      default:
        return this.roundRobin(healthyServers);
    }
  }

  // Round-robin selection
  private roundRobin(servers: ServerConfig[]): ServerConfig {
    const server = servers[this.currentIndex % servers.length];
    this.currentIndex = (this.currentIndex + 1) % servers.length;
    return server;
  }

  // Least connections selection
  private leastConnections(servers: ServerConfig[]): ServerConfig {
    let minConnections = Infinity;
    let selectedServer = servers[0];

    for (const server of servers) {
      const connections = this.connectionCounts.get(server.id) || 0;
      if (connections < minConnections) {
        minConnections = connections;
        selectedServer = server;
      }
    }

    return selectedServer;
  }

  // Weighted selection
  private weighted(servers: ServerConfig[]): ServerConfig {
    const totalWeight = servers.reduce((sum, s) => sum + (s.weight || 1), 0);
    let random = Math.random() * totalWeight;

    for (const server of servers) {
      const weight = server.weight || 1;
      random -= weight;
      if (random <= 0) {
        return server;
      }
    }

    return servers[servers.length - 1];
  }

  // IP hash selection
  ipHash(clientIp: string): ServerConfig | null {
    const healthyServers = this.getHealthyServers();

    if (healthyServers.length === 0) {
      return null;
    }

    let hash = 0;
    for (let i = 0; i < clientIp.length; i++) {
      const char = clientIp.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    const index = Math.abs(hash) % healthyServers.length;
    return healthyServers[index];
  }

  // Get healthy servers
  getHealthyServers(): ServerConfig[] {
    return this.config.servers.filter((server) => {
      const health = this.serverHealth.get(server.id);
      return health?.healthy && this.hasCapacity(server);
    });
  }

  // Check if server has capacity
  private hasCapacity(server: ServerConfig): boolean {
    if (!server.maxConnections) {
      return true;
    }

    const currentConnections = this.connectionCounts.get(server.id) || 0;
    return currentConnections < server.maxConnections;
  }

  // Track connection
  acquireConnection(serverId: string): void {
    const current = this.connectionCounts.get(serverId) || 0;
    this.connectionCounts.set(serverId, current + 1);
  }

  // Release connection
  releaseConnection(serverId: string): void {
    const current = this.connectionCounts.get(serverId) || 0;
    this.connectionCounts.set(serverId, Math.max(0, current - 1));
  }

  // Start health checks
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return;
    }

    const checkHealth = async () => {
      for (const server of this.config.servers) {
        await this.checkServerHealth(server);
      }
    };

    this.healthCheckInterval = setInterval(
      checkHealth,
      this.config.healthCheck.interval
    );

    // Run initial check
    checkHealth();
  }

  // Stop health checks
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  // Check individual server health
  private async checkServerHealth(server: ServerConfig): Promise<void> {
    const url = `http://${server.host}:${server.port}${this.config.healthCheck.path}`;
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.healthCheck.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const responseTime = Date.now() - startTime;
      const health = this.serverHealth.get(server.id)!;

      if (response.ok) {
        health.healthy = true;
        health.consecutiveFailures = 0;
        health.responseTime = responseTime;
      } else {
        health.consecutiveFailures++;
        if (health.consecutiveFailures >= this.config.healthCheck.unhealthyThreshold) {
          health.healthy = false;
          console.warn(`Server ${server.id} marked unhealthy after ${health.consecutiveFailures} failures`);
        }
      }

      health.lastCheck = new Date();
    } catch (error) {
      const health = this.serverHealth.get(server.id)!;
      health.consecutiveFailures++;
      health.lastCheck = new Date();

      if (health.consecutiveFailures >= this.config.healthCheck.unhealthyThreshold) {
        health.healthy = false;
        console.warn(`Server ${server.id} marked unhealthy: ${error}`);
      }
    }
  }

  // Get server health status
  getServerHealth(serverId: string): ServerHealth | undefined {
    return this.serverHealth.get(serverId);
  }

  // Get all server health
  getAllServerHealth(): ServerHealth[] {
    return Array.from(this.serverHealth.values());
  }

  // Mark server as unhealthy
  markUnhealthy(serverId: string): void {
    const health = this.serverHealth.get(serverId);
    if (health) {
      health.healthy = false;
      health.consecutiveFailures = this.config.healthCheck.unhealthyThreshold;
    }
  }

  // Mark server as healthy
  markHealthy(serverId: string): void {
    const health = this.serverHealth.get(serverId);
    if (health) {
      health.healthy = true;
      health.consecutiveFailures = 0;
    }
  }

  // Add server
  addServer(server: ServerConfig): void {
    this.config.servers.push(server);
    this.serverHealth.set(server.id, {
      serverId: server.id,
      healthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    });
    this.connectionCounts.set(server.id, 0);
  }

  // Remove server
  removeServer(serverId: string): void {
    this.config.servers = this.config.servers.filter((s) => s.id !== serverId);
    this.serverHealth.delete(serverId);
    this.connectionCounts.delete(serverId);
  }

  // Get stats
  getStats(): {
    totalServers: number;
    healthyServers: number;
    unhealthyServers: number;
    totalConnections: number;
    serverStats: Array<{
      id: string;
      host: string;
      port: number;
      healthy: boolean;
      connections: number;
      responseTime?: number;
    }>;
  } {
    const healthyServers = this.getHealthyServers();
    const totalConnections = Array.from(this.connectionCounts.values()).reduce((a, b) => a + b, 0);

    const serverStats = this.config.servers.map((server) => {
      const health = this.serverHealth.get(server.id)!;
      return {
        id: server.id,
        host: server.host,
        port: server.port,
        healthy: health.healthy,
        connections: this.connectionCounts.get(server.id) || 0,
        responseTime: health.responseTime,
      };
    });

    return {
      totalServers: this.config.servers.length,
      healthyServers: healthyServers.length,
      unhealthyServers: this.config.servers.length - healthyServers.length,
      totalConnections,
      serverStats,
    };
  }
}

// Service registry for microservices
export class ServiceRegistry {
  private services: Map<string, ServerConfig[]>;
  private loadBalancers: Map<string, LoadBalancer>;

  constructor() {
    this.services = new Map();
    this.loadBalancers = new Map();
  }

  // Register a service instance
  register(serviceName: string, instance: ServerConfig): void {
    let instances = this.services.get(serviceName);

    if (!instances) {
      instances = [];
      this.services.set(serviceName, instances);
    }

    // Check for existing
    const existing = instances.find((i) => i.id === instance.id);
    if (!existing) {
      instances.push(instance);
      this.refreshLoadBalancer(serviceName);
    }
  }

  // Deregister a service instance
  deregister(serviceName: string, instanceId: string): void {
    const instances = this.services.get(serviceName);

    if (instances) {
      const index = instances.findIndex((i) => i.id === instanceId);
      if (index !== -1) {
        instances.splice(index, 1);
        this.refreshLoadBalancer(serviceName);
      }
    }
  }

  // Get load balancer for a service
  getLoadBalancer(serviceName: string): LoadBalancer | undefined {
    return this.loadBalancers.get(serviceName);
  }

  // Get service instance
  getInstance(serviceName: string): ServerConfig | null {
    const lb = this.loadBalancers.get(serviceName);
    return lb ? lb.getServer() : null;
  }

  // Refresh load balancer for a service
  private refreshLoadBalancer(serviceName: string): void {
    const instances = this.services.get(serviceName) || [];

    if (instances.length === 0) {
      this.loadBalancers.delete(serviceName);
      return;
    }

    const lb = new LoadBalancer({
      algorithm: 'least-connections',
      healthCheck: {
        path: '/health',
        interval: 10000,
        timeout: 5000,
        unhealthyThreshold: 3,
      },
      servers: instances,
    });

    this.loadBalancers.set(serviceName, lb);
    lb.startHealthChecks();
  }

  // Get all services
  getServices(): Map<string, ServerConfig[]> {
    return new Map(this.services);
  }

  // Heartbeat from a service instance
  heartbeat(serviceName: string, instanceId: string): void {
    const instances = this.services.get(serviceName);
    if (!instances) {
      return;
    }

    const instance = instances.find((i) => i.id === instanceId);
    if (instance) {
      const lb = this.loadBalancers.get(serviceName);
      if (lb) {
        lb.markHealthy(instanceId);
      }
    }
  }
}

// Health check endpoint handler
export function createHealthCheckHandler(checks: {
  database?: () => Promise<boolean>;
  redis?: () => Promise<boolean>;
  external?: () => Promise<boolean>;
}): () => Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, boolean>;
  timestamp: string;
}> {
  return async () => {
    const results: Record<string, boolean> = {};

    // Run all checks in parallel
    const checkPromises = Object.entries(checks).map(async ([name, check]) => {
      try {
        results[name] = await check();
      } catch {
        results[name] = false;
      }
    });

    await Promise.all(checkPromises);

    // Determine overall status
    const allPassing = Object.values(results).every((v) => v);
    const anyPassing = Object.values(results).some((v) => v);

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (allPassing) {
      status = 'healthy';
    } else if (anyPassing) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      checks: results,
      timestamp: new Date().toISOString(),
    };
  };
}

// Liveness probe - simple is-alive check
export function livenessProbe(): {
  status: 'ok';
  timestamp: string;
} {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
}

// Readiness probe - ready to serve traffic
export async function readinessProbe(checks: Array<() => Promise<boolean>>): Promise<{
  ready: boolean;
  timestamp: string;
}> {
  try {
    const results = await Promise.all(checks.map((check) => check()));
    const ready = results.every((r) => r);
    return { ready, timestamp: new Date().toISOString() };
  } catch {
    return { ready: false, timestamp: new Date().toISOString() };
  }
}

// Startup probe - has initialization completed
let startupComplete = false;

export function markStartupComplete(): void {
  startupComplete = true;
}

export function startupProbe(): {
  started: boolean;
  timestamp: string;
} {
  return {
    started: startupComplete,
    timestamp: new Date().toISOString(),
  };
}

// Pre-configured load balancers
export function createLoadBalancer(
  type: 'api' | 'smtp' | 'worker',
  servers: ServerConfig[]
): LoadBalancer {
  const configs: Record<string, Omit<LoadBalancerConfig, 'servers'>> = {
    api: {
      algorithm: 'least-connections',
      healthCheck: {
        path: '/health',
        interval: 5000,
        timeout: 3000,
        unhealthyThreshold: 2,
      },
    },
    smtp: {
      algorithm: 'round-robin',
      healthCheck: {
        path: '/health',
        interval: 10000,
        timeout: 5000,
        unhealthyThreshold: 3,
      },
    },
    worker: {
      algorithm: 'weighted',
      healthCheck: {
        path: '/health',
        interval: 15000,
        timeout: 5000,
        unhealthyThreshold: 3,
      },
    },
  };

  const config = configs[type];
  return new LoadBalancer({ ...config, servers });
}

// Singleton registry
export const serviceRegistry = new ServiceRegistry();

// Connection draining utility
export class ConnectionDrainer {
  private draining: boolean;
  private activeConnections: Set<string>;
  private drainTimeout: number;

  constructor(drainTimeoutMs: number = 30000) {
    this.draining = false;
    this.activeConnections = new Set();
    this.drainTimeout = drainTimeoutMs;
  }

  // Start tracking a connection
  trackConnection(id: string): void {
    if (!this.draining) {
      this.activeConnections.add(id);
    }
  }

  // Release a connection
  releaseConnection(id: string): void {
    this.activeConnections.delete(id);
  }

  // Start draining
  async drain(): Promise<void> {
    this.draining = true;
    const startTime = Date.now();

    console.log(`Starting connection drain with ${this.activeConnections.size} active connections`);

    while (this.activeConnections.size > 0) {
      if (Date.now() - startTime > this.drainTimeout) {
        console.warn(`Drain timeout reached with ${this.activeConnections.size} remaining connections`);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log('Connection drain complete');
  }

  // Check if draining
  isDraining(): boolean {
    return this.draining;
  }

  // Get active connection count
  getActiveCount(): number {
    return this.activeConnections.size;
  }
}

// Graceful shutdown handler
export async function gracefulShutdown(
  drainer: ConnectionDrainer,
  cleanup: () => Promise<void>
): Promise<void> {
  console.log('Initiating graceful shutdown...');

  // Start draining connections
  await drainer.drain();

  // Run cleanup
  await cleanup();

  console.log('Graceful shutdown complete');
}
