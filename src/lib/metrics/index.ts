// Metrics Collection System for InstantScale
// In-memory metrics store that can be exported to Prometheus format

export interface MetricPoint {
  value: number
  timestamp: number
  labels?: Record<string, string>
}

export interface HistogramStats {
  count: number
  sum: number
  avg: number
  min: number
  max: number
  p50: number
  p95: number
  p99: number
}

export interface MetricsSnapshot {
  counters: Record<string, { value: number; labels?: Record<string, string> }[]>
  gauges: Record<string, number>
  histograms: Record<string, HistogramStats>
  timestamp: number
}

interface LabeledCounter {
  value: number
  labels: Record<string, string>
}

/**
 * MetricsCollector - Collects and manages application metrics
 *
 * Supports three metric types:
 * - Counters: Monotonically increasing values (e.g., request count)
 * - Gauges: Point-in-time values that can go up or down (e.g., active connections)
 * - Histograms: Distribution of values (e.g., request latency)
 */
class MetricsCollector {
  private counters: Map<string, LabeledCounter[]>
  private gauges: Map<string, number>
  private histograms: Map<string, number[]>
  private maxHistogramSize: number

  constructor(maxHistogramSize: number = 10000) {
    this.counters = new Map()
    this.gauges = new Map()
    this.histograms = new Map()
    this.maxHistogramSize = maxHistogramSize
  }

  // ============= Counter Methods =============

  /**
   * Increment a counter metric
   * @param name - Metric name
   * @param labels - Optional labels for the metric
   * @param value - Amount to increment (default: 1)
   */
  increment(name: string, labels?: Record<string, string>, value: number = 1): void {
    const counters = this.counters.get(name) || []
    const labelKey = labels ? JSON.stringify(labels) : ''

    const existing = counters.find(c => JSON.stringify(c.labels) === labelKey)
    if (existing) {
      existing.value += value
    } else {
      counters.push({ value, labels: labels || {} })
    }

    this.counters.set(name, counters)
  }

  /**
   * Get counter value(s)
   * @param name - Metric name
   * @param labels - Optional labels to filter by
   * @returns Counter value or 0 if not found
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const counters = this.counters.get(name)
    if (!counters) return 0

    if (labels) {
      const labelKey = JSON.stringify(labels)
      const counter = counters.find(c => JSON.stringify(c.labels) === labelKey)
      return counter?.value || 0
    }

    // Return sum of all counters with this name
    return counters.reduce((sum, c) => sum + c.value, 0)
  }

  /**
   * Get all counters with their labels
   */
  getCounters(name: string): LabeledCounter[] {
    return this.counters.get(name) || []
  }

  // ============= Gauge Methods =============

  /**
   * Set a gauge value
   * @param name - Metric name
   * @param value - Value to set
   */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value)
  }

  /**
   * Increment a gauge value
   */
  incrementGauge(name: string, value: number = 1): void {
    const current = this.gauges.get(name) || 0
    this.gauges.set(name, current + value)
  }

  /**
   * Decrement a gauge value
   */
  decrementGauge(name: string, value: number = 1): void {
    const current = this.gauges.get(name) || 0
    this.gauges.set(name, current - value)
  }

  /**
   * Get gauge value
   * @param name - Metric name
   * @returns Gauge value or 0 if not found
   */
  getGauge(name: string): number {
    return this.gauges.get(name) || 0
  }

  // ============= Histogram Methods =============

  /**
   * Record a value in a histogram (for latencies, sizes, etc.)
   * @param name - Metric name
   * @param value - Value to record
   */
  recordHistogram(name: string, value: number): void {
    const values = this.histograms.get(name) || []
    values.push(value)

    // Limit histogram size by removing oldest values
    if (values.length > this.maxHistogramSize) {
      values.splice(0, values.length - this.maxHistogramSize)
    }

    this.histograms.set(name, values)
  }

  /**
   * Get histogram statistics
   * @param name - Metric name
   * @returns Histogram statistics including percentiles
   */
  getHistogramStats(name: string): HistogramStats {
    const values = this.histograms.get(name)

    if (!values || values.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 }
    }

    const sorted = [...values].sort((a, b) => a - b)
    const count = sorted.length
    const sum = sorted.reduce((acc, v) => acc + v, 0)
    const avg = sum / count

    return {
      count,
      sum,
      avg,
      min: sorted[0] ?? 0,
      max: sorted[count - 1] ?? 0,
      p50: this.percentile(sorted, 50),
      p95: this.percentile(sorted, 95),
      p99: this.percentile(sorted, 99),
    }
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0
  }

  // ============= Export Methods =============

  /**
   * Get all metrics as a snapshot
   */
  getAll(): MetricsSnapshot {
    const counters: Record<string, { value: number; labels?: Record<string, string> }[]> = {}
    this.counters.forEach((value, key) => {
      counters[key] = value
    })

    const gauges: Record<string, number> = {}
    this.gauges.forEach((value, key) => {
      gauges[key] = value
    })

    const histograms: Record<string, HistogramStats> = {}
    this.histograms.forEach((_, key) => {
      histograms[key] = this.getHistogramStats(key)
    })

    return {
      counters,
      gauges,
      histograms,
      timestamp: Date.now(),
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheusFormat(): string {
    const lines: string[] = []

    // Export counters
    this.counters.forEach((counters, name) => {
      lines.push(`# HELP ${name} Counter metric`)
      lines.push(`# TYPE ${name} counter`)

      counters.forEach(counter => {
        const labelStr = this.formatLabels(counter.labels)
        lines.push(`${name}${labelStr} ${counter.value}`)
      })
    })

    // Export gauges
    this.gauges.forEach((value, name) => {
      lines.push(`# HELP ${name} Gauge metric`)
      lines.push(`# TYPE ${name} gauge`)
      lines.push(`${name} ${value}`)
    })

    // Export histograms as summary with percentiles
    this.histograms.forEach((_, name) => {
      const stats = this.getHistogramStats(name)
      lines.push(`# HELP ${name} Histogram metric`)
      lines.push(`# TYPE ${name} summary`)
      lines.push(`${name}_count ${stats.count}`)
      lines.push(`${name}_sum ${stats.sum}`)
      lines.push(`${name}{quantile="0.5"} ${stats.p50}`)
      lines.push(`${name}{quantile="0.95"} ${stats.p95}`)
      lines.push(`${name}{quantile="0.99"} ${stats.p99}`)
    })

    return lines.join('\n')
  }

  /**
   * Format labels for Prometheus output
   */
  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels)
    if (entries.length === 0) return ''

    const labelStr = entries
      .map(([key, value]) => `${key}="${this.escapeLabel(value)}"`)
      .join(',')

    return `{${labelStr}}`
  }

  /**
   * Escape special characters in label values
   */
  private escapeLabel(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.counters.clear()
    this.gauges.clear()
    this.histograms.clear()
  }

  /**
   * Reset a specific metric
   */
  resetMetric(name: string): void {
    this.counters.delete(name)
    this.gauges.delete(name)
    this.histograms.delete(name)
  }
}

// Singleton instance for application-wide metrics
export const metrics = new MetricsCollector()

// Export class for testing or multiple instances
export { MetricsCollector }
