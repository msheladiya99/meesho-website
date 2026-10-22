/**
 * Frontend Automatic Health-Check Ping Service
 *
 * Requirements satisfied:
 * 1. Pings the lightweight `GET /health` endpoint at the configured Render backend.
 * 2. Runs every 5 minutes (configurable) while the website tab is open.
 * 3. Prevents overlapping requests with an active ping guard (`isPinging`).
 * 4. Uses a short timeout (8s) via AbortController.
 * 5. Handles network or server errors silently without crashing or showing UI alerts.
 * 6. Avoids duplicate intervals on React re-renders or StrictMode remounts.
 * 7. Configurable via `VITE_ENABLE_HEALTH_PING=true`.
 */

export interface HealthPingConfig {
  enabled?: boolean;
  intervalMs?: number;
  timeoutMs?: number;
}

class HealthPingService {
  private timerId: ReturnType<typeof setInterval> | null = null;
  private isPinging = false;
  private lastPingTime: number | null = null;
  private lastStatus: 'ok' | 'error' | 'disabled' | 'idle' = 'idle';

  /**
   * Determine the target health check URL based on VITE_API_URL.
   * Strips any trailing `/api` or `/` and appends `/health`.
   */
  public getHealthUrl(): string {
    const rawApiUrl = (import.meta.env.VITE_API_URL as string) || 'https://meesho-website.onrender.com/api';
    const baseUrl = rawApiUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    return `${baseUrl}/health`;
  }

  /**
   * Check whether health ping is enabled via environment variable.
   */
  public isEnabled(): boolean {
    const envVal = import.meta.env.VITE_ENABLE_HEALTH_PING;
    return envVal === 'true' || envVal === '1';
  }

  /**
   * Execute a single health check request safely.
   * - Does NOT throw.
   * - Does NOT show UI notifications.
   * - Skips if another ping request is currently in-flight.
   */
  public async pingNow(timeoutMs = 8000): Promise<boolean> {
    if (this.isPinging) {
      if (import.meta.env.DEV) {
        console.debug('[HealthPing] Previous ping still in flight, skipping cycle');
      }
      return false;
    }

    this.isPinging = true;
    const url = this.getHealthUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
        cache: 'no-store',
      });

      this.lastPingTime = Date.now();
      if (response.ok) {
        this.lastStatus = 'ok';
        if (import.meta.env.DEV) {
          console.debug(`[HealthPing] Healthy: ${response.status} from ${url}`);
        }
        return true;
      } else {
        this.lastStatus = 'error';
        if (import.meta.env.DEV) {
          console.debug(`[HealthPing] Non-200 status: ${response.status} from ${url}`);
        }
        return false;
      }
    } catch (err: any) {
      this.lastStatus = 'error';
      // Suppress routine network errors so user activity is never interrupted
      if (import.meta.env.DEV) {
        console.debug(`[HealthPing] Request error (${err?.name || 'Error'}): ${err?.message}`);
      }
      return false;
    } finally {
      clearTimeout(timeout);
      this.isPinging = false;
    }
  }

  /**
   * Start recurring ping interval (every 5 minutes by default).
   * Safe against multiple calls / React rerenders.
   */
  public start(config?: HealthPingConfig): void {
    if (this.timerId !== null) {
      // Already running; avoid multiple timers
      return;
    }

    const enabled = config?.enabled ?? this.isEnabled();
    if (!enabled) {
      this.lastStatus = 'disabled';
      if (import.meta.env.DEV) {
        console.debug('[HealthPing] Disabled via VITE_ENABLE_HEALTH_PING');
      }
      return;
    }

    const intervalMs =
      config?.intervalMs ||
      Number(import.meta.env.VITE_HEALTH_PING_INTERVAL_MS) ||
      5 * 60 * 1000; // 5 minutes (300,000 ms)

    const timeoutMs = config?.timeoutMs || 8000; // 8 seconds timeout

    if (import.meta.env.DEV) {
      console.debug(`[HealthPing] Starting health ping every ${intervalMs / 1000}s targeting ${this.getHealthUrl()}`);
    }

    // Run first ping after short initial delay (10s) to verify backend on startup without blocking page load
    setTimeout(() => {
      if (this.timerId !== null) {
        this.pingNow(timeoutMs);
      }
    }, 10000);

    // Schedule recurring interval
    this.timerId = setInterval(() => {
      this.pingNow(timeoutMs);
    }, intervalMs);
  }

  /**
   * Stop recurring ping interval and clean up timers.
   */
  public stop(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
      if (import.meta.env.DEV) {
        console.debug('[HealthPing] Stopped');
      }
    }
  }

  /**
   * Status inspection helper for debugging
   */
  public getStatus() {
    return {
      running: this.timerId !== null,
      lastStatus: this.lastStatus,
      lastPingTime: this.lastPingTime ? new Date(this.lastPingTime).toISOString() : null,
      url: this.getHealthUrl(),
      enabled: this.isEnabled(),
    };
  }
}

export const healthPingService = new HealthPingService();
export default healthPingService;
