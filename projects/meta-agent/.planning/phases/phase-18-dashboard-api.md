# Phase 18: Dashboard API

## Overview
Build a comprehensive dashboard API that aggregates data from all system components to power monitoring dashboards and analytics interfaces.

## Dependencies
- Phase 5: Metrics Collection (execution metrics)
- Phase 6: Evaluation Engine (evaluation results)
- Phase 11: Canary Deployment (deployment status)
- Phase 14: Problem Analyzer (problem data)
- Phase 17: Knowledge Base (knowledge stats)

## Tasks

### Task 18.1: Dashboard Data Models

<task type="auto">
  <name>Create data models for dashboard aggregations and widgets</name>
  <files>src/meta_agent/dashboard/models.py</files>
  <action>
Define models for dashboard widgets, metrics, and aggregations.

```python
# src/meta_agent/dashboard/models.py
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Any


class TimeRange(str, Enum):
    """Time range options for dashboard queries."""
    LAST_HOUR = "1h"
    LAST_6_HOURS = "6h"
    LAST_24_HOURS = "24h"
    LAST_7_DAYS = "7d"
    LAST_30_DAYS = "30d"
    CUSTOM = "custom"


class WidgetType(str, Enum):
    """Types of dashboard widgets."""
    METRIC_CARD = "metric_card"
    LINE_CHART = "line_chart"
    BAR_CHART = "bar_chart"
    PIE_CHART = "pie_chart"
    TABLE = "table"
    HEATMAP = "heatmap"
    GAUGE = "gauge"
    ALERT_LIST = "alert_list"
    STATUS_BOARD = "status_board"


class MetricTrend(str, Enum):
    """Trend direction for metrics."""
    UP = "up"
    DOWN = "down"
    STABLE = "stable"


@dataclass
class TimeSeriesPoint:
    """A single point in a time series."""
    timestamp: datetime
    value: float
    label: Optional[str] = None


@dataclass
class TimeSeries:
    """Time series data for charts."""
    name: str
    points: list[TimeSeriesPoint] = field(default_factory=list)
    unit: str = ""
    color: Optional[str] = None


@dataclass
class MetricValue:
    """A metric value with metadata."""
    value: float
    unit: str = ""
    previous_value: Optional[float] = None
    change_percent: Optional[float] = None
    trend: MetricTrend = MetricTrend.STABLE
    sparkline: list[float] = field(default_factory=list)


@dataclass
class AgentSummary:
    """Summary of an agent's performance."""
    agent_id: str
    agent_name: str
    status: str  # healthy, warning, critical, inactive
    total_executions: int = 0
    success_rate: float = 0.0
    avg_latency_ms: float = 0.0
    avg_cost: float = 0.0
    error_count: int = 0
    last_execution: Optional[datetime] = None
    active_version: Optional[str] = None
    canary_status: Optional[str] = None


@dataclass
class SystemHealth:
    """Overall system health status."""
    status: str  # healthy, degraded, critical
    healthy_agents: int = 0
    warning_agents: int = 0
    critical_agents: int = 0
    total_agents: int = 0
    active_problems: int = 0
    pending_proposals: int = 0
    active_experiments: int = 0
    last_updated: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ExecutionSummary:
    """Summary of execution statistics."""
    total_executions: int = 0
    successful_executions: int = 0
    failed_executions: int = 0
    success_rate: float = 0.0
    avg_latency_ms: float = 0.0
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    p99_latency_ms: float = 0.0
    total_cost: float = 0.0
    avg_cost_per_execution: float = 0.0
    total_tokens: int = 0


@dataclass
class ErrorBreakdown:
    """Breakdown of errors by category."""
    category: str
    count: int
    percentage: float
    trend: MetricTrend = MetricTrend.STABLE
    example_message: Optional[str] = None


@dataclass
class CostBreakdown:
    """Cost breakdown by agent or category."""
    name: str
    cost: float
    percentage: float
    execution_count: int
    avg_cost_per_execution: float


@dataclass
class DashboardWidget:
    """A dashboard widget configuration and data."""
    id: str
    type: WidgetType
    title: str
    data: Any  # Type depends on widget type
    position: dict = field(default_factory=lambda: {"x": 0, "y": 0, "w": 4, "h": 2})
    refresh_interval_seconds: int = 60
    last_updated: datetime = field(default_factory=datetime.utcnow)


@dataclass
class Dashboard:
    """A complete dashboard configuration."""
    id: str
    name: str
    description: str = ""
    widgets: list[DashboardWidget] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    is_default: bool = False
    owner: Optional[str] = None


@dataclass
class AlertSummary:
    """Summary of an active alert."""
    id: str
    severity: str  # critical, high, medium, low
    title: str
    message: str
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    acknowledged: bool = False


@dataclass
class RecentActivity:
    """Recent activity item."""
    id: str
    activity_type: str  # execution, deployment, problem, proposal, experiment
    title: str
    description: str
    agent_id: Optional[str] = None
    status: str = ""
    timestamp: datetime = field(default_factory=datetime.utcnow)


def time_range_to_timedelta(time_range: TimeRange) -> timedelta:
    """Convert TimeRange enum to timedelta."""
    mapping = {
        TimeRange.LAST_HOUR: timedelta(hours=1),
        TimeRange.LAST_6_HOURS: timedelta(hours=6),
        TimeRange.LAST_24_HOURS: timedelta(hours=24),
        TimeRange.LAST_7_DAYS: timedelta(days=7),
        TimeRange.LAST_30_DAYS: timedelta(days=30),
    }
    return mapping.get(time_range, timedelta(hours=24))
```
  </action>
  <verify>
    - All dashboard widget types defined
    - Time series and metric models complete
    - Agent and system health summaries
    - Alert and activity models
    - Time range conversion utility
  </verify>
  <done>Dashboard data models for widgets, metrics, and aggregations complete</done>
</task>

### Task 18.2: Dashboard Data Aggregator

<task type="auto">
  <name>Build service to aggregate data from all system components</name>
  <files>src/meta_agent/dashboard/aggregator.py</files>
  <action>
Create a service that aggregates data from various system components for dashboard display.

```python
# src/meta_agent/dashboard/aggregator.py
import asyncio
from datetime import datetime, timedelta
from typing import Optional
from collections import defaultdict

from ..database import Database
from .models import (
    TimeRange,
    TimeSeriesPoint,
    TimeSeries,
    MetricValue,
    MetricTrend,
    AgentSummary,
    SystemHealth,
    ExecutionSummary,
    ErrorBreakdown,
    CostBreakdown,
    AlertSummary,
    RecentActivity,
    time_range_to_timedelta,
)


class DashboardAggregator:
    """Aggregates data from all system components for dashboards."""

    def __init__(self, db: Database):
        self.db = db

    # ==================== SYSTEM HEALTH ====================

    async def get_system_health(self) -> SystemHealth:
        """Get overall system health status."""
        # Get agent health counts
        agent_health = await self.db.fetch_all("""
            WITH agent_metrics AS (
                SELECT
                    a.id,
                    COALESCE(
                        (SELECT AVG(CASE WHEN ev.passed THEN 1.0 ELSE 0.0 END)
                         FROM executions e
                         JOIN evaluations ev ON ev.execution_id = e.id
                         WHERE e.agent_id = a.id
                         AND e.started_at > NOW() - INTERVAL '24 hours'),
                        0
                    ) as success_rate
                FROM agents a
                WHERE a.is_active = true
            )
            SELECT
                CASE
                    WHEN success_rate >= 0.9 THEN 'healthy'
                    WHEN success_rate >= 0.7 THEN 'warning'
                    ELSE 'critical'
                END as status,
                COUNT(*) as count
            FROM agent_metrics
            GROUP BY status
        """)

        health_counts = {row["status"]: row["count"] for row in agent_health}

        # Get active problem count
        problems = await self.db.fetch_one("""
            SELECT COUNT(*) as count FROM problems
            WHERE status IN ('open', 'investigating')
        """)

        # Get pending proposals
        proposals = await self.db.fetch_one("""
            SELECT COUNT(*) as count FROM improvement_proposals
            WHERE status = 'pending'
        """)

        # Get active experiments
        experiments = await self.db.fetch_one("""
            SELECT COUNT(*) as count FROM experiments
            WHERE status = 'running'
        """)

        healthy = health_counts.get("healthy", 0)
        warning = health_counts.get("warning", 0)
        critical = health_counts.get("critical", 0)
        total = healthy + warning + critical

        # Determine overall status
        if critical > 0 or (total > 0 and critical / total > 0.1):
            status = "critical"
        elif warning > 0 or (total > 0 and warning / total > 0.2):
            status = "degraded"
        else:
            status = "healthy"

        return SystemHealth(
            status=status,
            healthy_agents=healthy,
            warning_agents=warning,
            critical_agents=critical,
            total_agents=total,
            active_problems=problems["count"] if problems else 0,
            pending_proposals=proposals["count"] if proposals else 0,
            active_experiments=experiments["count"] if experiments else 0,
        )

    # ==================== EXECUTION METRICS ====================

    async def get_execution_summary(
        self,
        time_range: TimeRange = TimeRange.LAST_24_HOURS,
        agent_id: Optional[str] = None,
    ) -> ExecutionSummary:
        """Get execution summary for a time range."""
        delta = time_range_to_timedelta(time_range)
        cutoff = datetime.utcnow() - delta

        conditions = ["e.started_at > $1"]
        params = [cutoff]

        if agent_id:
            conditions.append("e.agent_id = $2")
            params.append(agent_id)

        where_clause = " AND ".join(conditions)

        result = await self.db.fetch_one(f"""
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE ev.passed = true) as successful,
                COUNT(*) FILTER (WHERE ev.passed = false) as failed,
                AVG(e.latency_ms) as avg_latency,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY e.latency_ms) as p50,
                PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY e.latency_ms) as p95,
                PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY e.latency_ms) as p99,
                SUM(e.total_cost) as total_cost,
                SUM(e.prompt_tokens + e.completion_tokens) as total_tokens
            FROM executions e
            LEFT JOIN evaluations ev ON ev.execution_id = e.id
            WHERE {where_clause}
        """, params)

        if not result or result["total"] == 0:
            return ExecutionSummary()

        total = result["total"]
        successful = result["successful"] or 0

        return ExecutionSummary(
            total_executions=total,
            successful_executions=successful,
            failed_executions=result["failed"] or 0,
            success_rate=successful / total if total > 0 else 0,
            avg_latency_ms=result["avg_latency"] or 0,
            p50_latency_ms=result["p50"] or 0,
            p95_latency_ms=result["p95"] or 0,
            p99_latency_ms=result["p99"] or 0,
            total_cost=result["total_cost"] or 0,
            avg_cost_per_execution=(result["total_cost"] or 0) / total if total > 0 else 0,
            total_tokens=result["total_tokens"] or 0,
        )

    async def get_execution_time_series(
        self,
        time_range: TimeRange = TimeRange.LAST_24_HOURS,
        agent_id: Optional[str] = None,
        interval: str = "1 hour",
    ) -> list[TimeSeries]:
        """Get execution metrics as time series."""
        delta = time_range_to_timedelta(time_range)
        cutoff = datetime.utcnow() - delta

        conditions = ["e.started_at > $1"]
        params = [cutoff]

        if agent_id:
            conditions.append("e.agent_id = $2")
            params.append(agent_id)

        where_clause = " AND ".join(conditions)

        rows = await self.db.fetch_all(f"""
            SELECT
                date_trunc($3, e.started_at) as bucket,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE ev.passed = true) as successful,
                AVG(e.latency_ms) as avg_latency,
                SUM(e.total_cost) as total_cost
            FROM executions e
            LEFT JOIN evaluations ev ON ev.execution_id = e.id
            WHERE {where_clause}
            GROUP BY bucket
            ORDER BY bucket
        """, params + [interval.split()[1]])  # Extract 'hour' from '1 hour'

        # Build time series
        executions_series = TimeSeries(name="Executions", unit="count", color="#3B82F6")
        success_rate_series = TimeSeries(name="Success Rate", unit="%", color="#10B981")
        latency_series = TimeSeries(name="Avg Latency", unit="ms", color="#F59E0B")
        cost_series = TimeSeries(name="Cost", unit="$", color="#8B5CF6")

        for row in rows:
            timestamp = row["bucket"]
            total = row["total"]
            successful = row["successful"] or 0

            executions_series.points.append(
                TimeSeriesPoint(timestamp=timestamp, value=total)
            )
            success_rate_series.points.append(
                TimeSeriesPoint(
                    timestamp=timestamp,
                    value=(successful / total * 100) if total > 0 else 0
                )
            )
            latency_series.points.append(
                TimeSeriesPoint(timestamp=timestamp, value=row["avg_latency"] or 0)
            )
            cost_series.points.append(
                TimeSeriesPoint(timestamp=timestamp, value=row["total_cost"] or 0)
            )

        return [executions_series, success_rate_series, latency_series, cost_series]

    # ==================== AGENT SUMMARIES ====================

    async def get_agent_summaries(
        self,
        time_range: TimeRange = TimeRange.LAST_24_HOURS,
    ) -> list[AgentSummary]:
        """Get summary for all agents."""
        delta = time_range_to_timedelta(time_range)
        cutoff = datetime.utcnow() - delta

        rows = await self.db.fetch_all("""
            SELECT
                a.id,
                a.name,
                a.is_active,
                COUNT(e.id) as total_executions,
                COUNT(e.id) FILTER (WHERE ev.passed = true) as successful,
                AVG(e.latency_ms) as avg_latency,
                AVG(e.total_cost) as avg_cost,
                COUNT(e.id) FILTER (WHERE ev.passed = false) as error_count,
                MAX(e.started_at) as last_execution,
                av.version as active_version,
                cd.status as canary_status
            FROM agents a
            LEFT JOIN executions e ON e.agent_id = a.id AND e.started_at > $1
            LEFT JOIN evaluations ev ON ev.execution_id = e.id
            LEFT JOIN agent_versions av ON av.agent_id = a.id AND av.is_active = true
            LEFT JOIN canary_deployments cd ON cd.agent_id = a.id
                AND cd.status IN ('in_progress', 'paused')
            WHERE a.is_active = true
            GROUP BY a.id, a.name, a.is_active, av.version, cd.status
            ORDER BY total_executions DESC
        """, [cutoff])

        summaries = []
        for row in rows:
            total = row["total_executions"]
            successful = row["successful"] or 0
            success_rate = (successful / total) if total > 0 else 0

            # Determine status
            if total == 0:
                status = "inactive"
            elif success_rate >= 0.9:
                status = "healthy"
            elif success_rate >= 0.7:
                status = "warning"
            else:
                status = "critical"

            summaries.append(AgentSummary(
                agent_id=str(row["id"]),
                agent_name=row["name"],
                status=status,
                total_executions=total,
                success_rate=success_rate,
                avg_latency_ms=row["avg_latency"] or 0,
                avg_cost=row["avg_cost"] or 0,
                error_count=row["error_count"] or 0,
                last_execution=row["last_execution"],
                active_version=row["active_version"],
                canary_status=row["canary_status"],
            ))

        return summaries

    # ==================== ERROR ANALYSIS ====================

    async def get_error_breakdown(
        self,
        time_range: TimeRange = TimeRange.LAST_24_HOURS,
        agent_id: Optional[str] = None,
    ) -> list[ErrorBreakdown]:
        """Get breakdown of errors by category."""
        delta = time_range_to_timedelta(time_range)
        cutoff = datetime.utcnow() - delta

        conditions = ["p.created_at > $1"]
        params = [cutoff]

        if agent_id:
            conditions.append("p.agent_id = $2")
            params.append(agent_id)

        where_clause = " AND ".join(conditions)

        rows = await self.db.fetch_all(f"""
            SELECT
                p.category,
                COUNT(*) as count,
                MIN(p.description) as example_message
            FROM problems p
            WHERE {where_clause}
            GROUP BY p.category
            ORDER BY count DESC
        """, params)

        total = sum(row["count"] for row in rows)

        return [
            ErrorBreakdown(
                category=row["category"],
                count=row["count"],
                percentage=(row["count"] / total * 100) if total > 0 else 0,
                example_message=row["example_message"],
            )
            for row in rows
        ]

    # ==================== COST ANALYSIS ====================

    async def get_cost_breakdown(
        self,
        time_range: TimeRange = TimeRange.LAST_24_HOURS,
        group_by: str = "agent",
    ) -> list[CostBreakdown]:
        """Get cost breakdown by agent or category."""
        delta = time_range_to_timedelta(time_range)
        cutoff = datetime.utcnow() - delta

        if group_by == "agent":
            rows = await self.db.fetch_all("""
                SELECT
                    a.name,
                    SUM(e.total_cost) as cost,
                    COUNT(e.id) as execution_count
                FROM executions e
                JOIN agents a ON a.id = e.agent_id
                WHERE e.started_at > $1
                GROUP BY a.id, a.name
                ORDER BY cost DESC
            """, [cutoff])
        else:  # group by model
            rows = await self.db.fetch_all("""
                SELECT
                    COALESCE(e.model, 'unknown') as name,
                    SUM(e.total_cost) as cost,
                    COUNT(e.id) as execution_count
                FROM executions e
                WHERE e.started_at > $1
                GROUP BY e.model
                ORDER BY cost DESC
            """, [cutoff])

        total_cost = sum(row["cost"] or 0 for row in rows)

        return [
            CostBreakdown(
                name=row["name"],
                cost=row["cost"] or 0,
                percentage=((row["cost"] or 0) / total_cost * 100) if total_cost > 0 else 0,
                execution_count=row["execution_count"],
                avg_cost_per_execution=(row["cost"] or 0) / row["execution_count"]
                    if row["execution_count"] > 0 else 0,
            )
            for row in rows
        ]

    # ==================== ALERTS ====================

    async def get_active_alerts(self, limit: int = 20) -> list[AlertSummary]:
        """Get active alerts."""
        rows = await self.db.fetch_all("""
            SELECT
                al.id,
                al.severity,
                al.title,
                al.message,
                al.agent_id,
                a.name as agent_name,
                al.created_at,
                al.acknowledged
            FROM alerts al
            LEFT JOIN agents a ON a.id = al.agent_id
            WHERE al.resolved_at IS NULL
            ORDER BY
                CASE al.severity
                    WHEN 'critical' THEN 1
                    WHEN 'high' THEN 2
                    WHEN 'medium' THEN 3
                    ELSE 4
                END,
                al.created_at DESC
            LIMIT $1
        """, [limit])

        return [
            AlertSummary(
                id=str(row["id"]),
                severity=row["severity"],
                title=row["title"],
                message=row["message"],
                agent_id=str(row["agent_id"]) if row["agent_id"] else None,
                agent_name=row["agent_name"],
                created_at=row["created_at"],
                acknowledged=row["acknowledged"],
            )
            for row in rows
        ]

    # ==================== RECENT ACTIVITY ====================

    async def get_recent_activity(self, limit: int = 20) -> list[RecentActivity]:
        """Get recent activity across the system."""
        # Combine multiple activity sources
        activities = []

        # Recent executions
        executions = await self.db.fetch_all("""
            SELECT
                e.id,
                'execution' as type,
                a.name as agent_name,
                ev.passed as success,
                e.started_at as timestamp
            FROM executions e
            JOIN agents a ON a.id = e.agent_id
            LEFT JOIN evaluations ev ON ev.execution_id = e.id
            ORDER BY e.started_at DESC
            LIMIT $1
        """, [limit])

        for row in executions:
            status = "success" if row["success"] else "failed"
            activities.append(RecentActivity(
                id=str(row["id"]),
                activity_type="execution",
                title=f"Execution: {row['agent_name']}",
                description=f"Agent execution completed",
                status=status,
                timestamp=row["timestamp"],
            ))

        # Recent deployments
        deployments = await self.db.fetch_all("""
            SELECT
                cd.id,
                a.name as agent_name,
                av.version,
                cd.status,
                cd.created_at as timestamp
            FROM canary_deployments cd
            JOIN agents a ON a.id = cd.agent_id
            JOIN agent_versions av ON av.id = cd.new_version_id
            ORDER BY cd.created_at DESC
            LIMIT $1
        """, [limit])

        for row in deployments:
            activities.append(RecentActivity(
                id=str(row["id"]),
                activity_type="deployment",
                title=f"Deployment: {row['agent_name']} v{row['version']}",
                description=f"Canary deployment {row['status']}",
                status=row["status"],
                timestamp=row["timestamp"],
            ))

        # Recent problems
        problems = await self.db.fetch_all("""
            SELECT
                p.id,
                a.name as agent_name,
                p.category,
                p.severity,
                p.status,
                p.created_at as timestamp
            FROM problems p
            LEFT JOIN agents a ON a.id = p.agent_id
            ORDER BY p.created_at DESC
            LIMIT $1
        """, [limit])

        for row in problems:
            activities.append(RecentActivity(
                id=str(row["id"]),
                activity_type="problem",
                title=f"Problem: {row['category']}",
                description=f"Severity: {row['severity']}",
                agent_id=row.get("agent_id"),
                status=row["status"],
                timestamp=row["timestamp"],
            ))

        # Sort by timestamp and limit
        activities.sort(key=lambda x: x.timestamp, reverse=True)
        return activities[:limit]

    # ==================== METRIC VALUES ====================

    async def get_metric_value(
        self,
        metric_name: str,
        time_range: TimeRange = TimeRange.LAST_24_HOURS,
        agent_id: Optional[str] = None,
    ) -> MetricValue:
        """Get a specific metric value with trend."""
        delta = time_range_to_timedelta(time_range)
        current_cutoff = datetime.utcnow() - delta
        previous_cutoff = current_cutoff - delta

        conditions = ["e.started_at > $1"]
        params = [current_cutoff]

        if agent_id:
            conditions.append("e.agent_id = $2")
            params.append(agent_id)

        where_clause = " AND ".join(conditions)

        # Get current value
        if metric_name == "success_rate":
            current = await self.db.fetch_one(f"""
                SELECT
                    COUNT(*) FILTER (WHERE ev.passed = true)::float /
                    NULLIF(COUNT(*), 0) * 100 as value
                FROM executions e
                LEFT JOIN evaluations ev ON ev.execution_id = e.id
                WHERE {where_clause}
            """, params)

            # Get previous value
            prev_params = [previous_cutoff, current_cutoff]
            if agent_id:
                prev_params.append(agent_id)
            prev_where = where_clause.replace("$1", "$1 AND e.started_at < $2")

            previous = await self.db.fetch_one(f"""
                SELECT
                    COUNT(*) FILTER (WHERE ev.passed = true)::float /
                    NULLIF(COUNT(*), 0) * 100 as value
                FROM executions e
                LEFT JOIN evaluations ev ON ev.execution_id = e.id
                WHERE e.started_at > $1 AND e.started_at < $2
                {"AND e.agent_id = $3" if agent_id else ""}
            """, prev_params)

        elif metric_name == "total_executions":
            current = await self.db.fetch_one(f"""
                SELECT COUNT(*) as value
                FROM executions e
                WHERE {where_clause}
            """, params)

            prev_params = [previous_cutoff, current_cutoff]
            if agent_id:
                prev_params.append(agent_id)

            previous = await self.db.fetch_one(f"""
                SELECT COUNT(*) as value
                FROM executions e
                WHERE e.started_at > $1 AND e.started_at < $2
                {"AND e.agent_id = $3" if agent_id else ""}
            """, prev_params)

        elif metric_name == "avg_latency":
            current = await self.db.fetch_one(f"""
                SELECT AVG(e.latency_ms) as value
                FROM executions e
                WHERE {where_clause}
            """, params)

            prev_params = [previous_cutoff, current_cutoff]
            if agent_id:
                prev_params.append(agent_id)

            previous = await self.db.fetch_one(f"""
                SELECT AVG(e.latency_ms) as value
                FROM executions e
                WHERE e.started_at > $1 AND e.started_at < $2
                {"AND e.agent_id = $3" if agent_id else ""}
            """, prev_params)

        elif metric_name == "total_cost":
            current = await self.db.fetch_one(f"""
                SELECT SUM(e.total_cost) as value
                FROM executions e
                WHERE {where_clause}
            """, params)

            prev_params = [previous_cutoff, current_cutoff]
            if agent_id:
                prev_params.append(agent_id)

            previous = await self.db.fetch_one(f"""
                SELECT SUM(e.total_cost) as value
                FROM executions e
                WHERE e.started_at > $1 AND e.started_at < $2
                {"AND e.agent_id = $3" if agent_id else ""}
            """, prev_params)

        else:
            return MetricValue(value=0)

        current_val = current["value"] if current and current["value"] else 0
        previous_val = previous["value"] if previous and previous["value"] else 0

        # Calculate change
        if previous_val > 0:
            change_percent = ((current_val - previous_val) / previous_val) * 100
        else:
            change_percent = 0

        # Determine trend
        if change_percent > 5:
            trend = MetricTrend.UP
        elif change_percent < -5:
            trend = MetricTrend.DOWN
        else:
            trend = MetricTrend.STABLE

        return MetricValue(
            value=current_val,
            previous_value=previous_val,
            change_percent=change_percent,
            trend=trend,
        )
```
  </action>
  <verify>
    - System health aggregation from all components
    - Execution metrics with time series
    - Agent summaries with status calculation
    - Error and cost breakdowns
    - Alert and activity feeds
    - Metric values with trend calculation
  </verify>
  <done>Dashboard aggregator with all data sources integrated complete</done>
</task>

### Task 18.3: Dashboard Configuration Manager

<task type="auto">
  <name>Build dashboard configuration storage and management</name>
  <files>src/meta_agent/dashboard/config_manager.py, migrations/018_dashboards.sql</files>
  <action>
Create a manager for storing and managing dashboard configurations.

```python
# src/meta_agent/dashboard/config_manager.py
import json
from datetime import datetime
from typing import Optional
import uuid

from ..database import Database
from .models import Dashboard, DashboardWidget, WidgetType


class DashboardConfigManager:
    """Manages dashboard configurations."""

    def __init__(self, db: Database):
        self.db = db

    async def create_dashboard(
        self,
        name: str,
        description: str = "",
        widgets: list[dict] = None,
        is_default: bool = False,
        owner: Optional[str] = None,
    ) -> Dashboard:
        """Create a new dashboard."""
        dashboard_id = str(uuid.uuid4())

        query = """
            INSERT INTO dashboards (id, name, description, is_default, owner, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $6)
            RETURNING *
        """

        now = datetime.utcnow()
        row = await self.db.fetch_one(query, [
            dashboard_id, name, description, is_default, owner, now
        ])

        # Create widgets if provided
        created_widgets = []
        if widgets:
            for widget_config in widgets:
                widget = await self.add_widget(dashboard_id, widget_config)
                created_widgets.append(widget)

        return Dashboard(
            id=dashboard_id,
            name=name,
            description=description,
            widgets=created_widgets,
            created_at=now,
            updated_at=now,
            is_default=is_default,
            owner=owner,
        )

    async def get_dashboard(self, dashboard_id: str) -> Optional[Dashboard]:
        """Get a dashboard by ID."""
        query = "SELECT * FROM dashboards WHERE id = $1"
        row = await self.db.fetch_one(query, [dashboard_id])

        if not row:
            return None

        widgets = await self._get_dashboard_widgets(dashboard_id)

        return Dashboard(
            id=str(row["id"]),
            name=row["name"],
            description=row.get("description", ""),
            widgets=widgets,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            is_default=row.get("is_default", False),
            owner=row.get("owner"),
        )

    async def get_default_dashboard(self) -> Optional[Dashboard]:
        """Get the default dashboard."""
        query = "SELECT id FROM dashboards WHERE is_default = true LIMIT 1"
        row = await self.db.fetch_one(query)

        if row:
            return await self.get_dashboard(str(row["id"]))

        return None

    async def list_dashboards(
        self,
        owner: Optional[str] = None,
        limit: int = 50,
    ) -> list[Dashboard]:
        """List all dashboards."""
        query = "SELECT * FROM dashboards"
        params = []

        if owner:
            query += " WHERE owner = $1"
            params.append(owner)

        query += " ORDER BY is_default DESC, name LIMIT $" + str(len(params) + 1)
        params.append(limit)

        rows = await self.db.fetch_all(query, params)

        dashboards = []
        for row in rows:
            widgets = await self._get_dashboard_widgets(str(row["id"]))
            dashboards.append(Dashboard(
                id=str(row["id"]),
                name=row["name"],
                description=row.get("description", ""),
                widgets=widgets,
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                is_default=row.get("is_default", False),
                owner=row.get("owner"),
            ))

        return dashboards

    async def update_dashboard(
        self,
        dashboard_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_default: Optional[bool] = None,
    ) -> Optional[Dashboard]:
        """Update dashboard properties."""
        updates = []
        params = []
        param_idx = 1

        if name is not None:
            updates.append(f"name = ${param_idx}")
            params.append(name)
            param_idx += 1

        if description is not None:
            updates.append(f"description = ${param_idx}")
            params.append(description)
            param_idx += 1

        if is_default is not None:
            # If setting as default, unset other defaults
            if is_default:
                await self.db.execute(
                    "UPDATE dashboards SET is_default = false WHERE is_default = true"
                )
            updates.append(f"is_default = ${param_idx}")
            params.append(is_default)
            param_idx += 1

        if not updates:
            return await self.get_dashboard(dashboard_id)

        updates.append(f"updated_at = ${param_idx}")
        params.append(datetime.utcnow())
        param_idx += 1

        params.append(dashboard_id)

        query = f"""
            UPDATE dashboards
            SET {', '.join(updates)}
            WHERE id = ${param_idx}
            RETURNING *
        """

        await self.db.execute(query, params)
        return await self.get_dashboard(dashboard_id)

    async def delete_dashboard(self, dashboard_id: str) -> bool:
        """Delete a dashboard and its widgets."""
        # Delete widgets first
        await self.db.execute(
            "DELETE FROM dashboard_widgets WHERE dashboard_id = $1",
            [dashboard_id]
        )

        # Delete dashboard
        result = await self.db.execute(
            "DELETE FROM dashboards WHERE id = $1",
            [dashboard_id]
        )

        return True

    async def add_widget(
        self,
        dashboard_id: str,
        widget_config: dict,
    ) -> DashboardWidget:
        """Add a widget to a dashboard."""
        widget_id = str(uuid.uuid4())

        query = """
            INSERT INTO dashboard_widgets (
                id, dashboard_id, type, title, config, position,
                refresh_interval_seconds, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        """

        now = datetime.utcnow()
        row = await self.db.fetch_one(query, [
            widget_id,
            dashboard_id,
            widget_config.get("type", "metric_card"),
            widget_config.get("title", "Untitled"),
            json.dumps(widget_config.get("config", {})),
            json.dumps(widget_config.get("position", {"x": 0, "y": 0, "w": 4, "h": 2})),
            widget_config.get("refresh_interval_seconds", 60),
            now,
        ])

        # Update dashboard updated_at
        await self.db.execute(
            "UPDATE dashboards SET updated_at = $1 WHERE id = $2",
            [now, dashboard_id]
        )

        return DashboardWidget(
            id=widget_id,
            type=WidgetType(row["type"]),
            title=row["title"],
            data=None,  # Data is fetched separately
            position=json.loads(row["position"]),
            refresh_interval_seconds=row["refresh_interval_seconds"],
            last_updated=now,
        )

    async def update_widget(
        self,
        widget_id: str,
        updates: dict,
    ) -> Optional[DashboardWidget]:
        """Update a widget."""
        allowed_fields = {"type", "title", "config", "position", "refresh_interval_seconds"}

        update_clauses = []
        params = []
        param_idx = 1

        for field, value in updates.items():
            if field in allowed_fields:
                if field in ("config", "position"):
                    value = json.dumps(value)
                update_clauses.append(f"{field} = ${param_idx}")
                params.append(value)
                param_idx += 1

        if not update_clauses:
            return None

        params.append(widget_id)

        query = f"""
            UPDATE dashboard_widgets
            SET {', '.join(update_clauses)}
            WHERE id = ${param_idx}
            RETURNING *
        """

        row = await self.db.fetch_one(query, params)

        if not row:
            return None

        return DashboardWidget(
            id=str(row["id"]),
            type=WidgetType(row["type"]),
            title=row["title"],
            data=None,
            position=json.loads(row["position"]),
            refresh_interval_seconds=row["refresh_interval_seconds"],
        )

    async def remove_widget(self, widget_id: str) -> bool:
        """Remove a widget from a dashboard."""
        await self.db.execute(
            "DELETE FROM dashboard_widgets WHERE id = $1",
            [widget_id]
        )
        return True

    async def update_widget_positions(
        self,
        dashboard_id: str,
        positions: dict[str, dict],
    ):
        """Update positions for multiple widgets."""
        for widget_id, position in positions.items():
            await self.db.execute(
                "UPDATE dashboard_widgets SET position = $1 WHERE id = $2 AND dashboard_id = $3",
                [json.dumps(position), widget_id, dashboard_id]
            )

        await self.db.execute(
            "UPDATE dashboards SET updated_at = $1 WHERE id = $2",
            [datetime.utcnow(), dashboard_id]
        )

    async def _get_dashboard_widgets(self, dashboard_id: str) -> list[DashboardWidget]:
        """Get all widgets for a dashboard."""
        query = """
            SELECT * FROM dashboard_widgets
            WHERE dashboard_id = $1
            ORDER BY (position->>'y')::int, (position->>'x')::int
        """

        rows = await self.db.fetch_all(query, [dashboard_id])

        return [
            DashboardWidget(
                id=str(row["id"]),
                type=WidgetType(row["type"]),
                title=row["title"],
                data=None,  # Data fetched separately
                position=json.loads(row["position"]),
                refresh_interval_seconds=row["refresh_interval_seconds"],
                last_updated=row.get("last_data_fetch"),
            )
            for row in rows
        ]

    async def create_default_dashboard(self) -> Dashboard:
        """Create the default system dashboard."""
        widgets = [
            {
                "type": "metric_card",
                "title": "Success Rate",
                "config": {"metric": "success_rate", "time_range": "24h"},
                "position": {"x": 0, "y": 0, "w": 3, "h": 2},
            },
            {
                "type": "metric_card",
                "title": "Total Executions",
                "config": {"metric": "total_executions", "time_range": "24h"},
                "position": {"x": 3, "y": 0, "w": 3, "h": 2},
            },
            {
                "type": "metric_card",
                "title": "Avg Latency",
                "config": {"metric": "avg_latency", "time_range": "24h"},
                "position": {"x": 6, "y": 0, "w": 3, "h": 2},
            },
            {
                "type": "metric_card",
                "title": "Total Cost",
                "config": {"metric": "total_cost", "time_range": "24h"},
                "position": {"x": 9, "y": 0, "w": 3, "h": 2},
            },
            {
                "type": "line_chart",
                "title": "Execution Metrics",
                "config": {"metrics": ["executions", "success_rate"], "time_range": "24h"},
                "position": {"x": 0, "y": 2, "w": 8, "h": 4},
            },
            {
                "type": "status_board",
                "title": "Agent Status",
                "config": {},
                "position": {"x": 8, "y": 2, "w": 4, "h": 4},
            },
            {
                "type": "pie_chart",
                "title": "Error Breakdown",
                "config": {"time_range": "24h"},
                "position": {"x": 0, "y": 6, "w": 4, "h": 4},
            },
            {
                "type": "bar_chart",
                "title": "Cost by Agent",
                "config": {"group_by": "agent", "time_range": "24h"},
                "position": {"x": 4, "y": 6, "w": 4, "h": 4},
            },
            {
                "type": "alert_list",
                "title": "Active Alerts",
                "config": {"limit": 10},
                "position": {"x": 8, "y": 6, "w": 4, "h": 4},
            },
            {
                "type": "table",
                "title": "Recent Activity",
                "config": {"limit": 10},
                "position": {"x": 0, "y": 10, "w": 12, "h": 4},
            },
        ]

        return await self.create_dashboard(
            name="System Overview",
            description="Default system monitoring dashboard",
            widgets=widgets,
            is_default=True,
        )
```

```sql
-- migrations/018_dashboards.sql
-- Dashboard configuration tables

CREATE TABLE IF NOT EXISTS dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    owner VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_dashboard_default ON dashboards(is_default);
CREATE INDEX idx_dashboard_owner ON dashboards(owner);

CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID REFERENCES dashboards(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    config JSONB DEFAULT '{}',
    position JSONB DEFAULT '{"x": 0, "y": 0, "w": 4, "h": 2}',
    refresh_interval_seconds INTEGER DEFAULT 60,
    last_data_fetch TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_widget_dashboard ON dashboard_widgets(dashboard_id);
CREATE INDEX idx_widget_type ON dashboard_widgets(type);

-- Alerts table (if not exists from previous phases)
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    severity VARCHAR(20) NOT NULL,
    title VARCHAR(500) NOT NULL,
    message TEXT,
    agent_id UUID REFERENCES agents(id),
    execution_id UUID REFERENCES executions(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by VARCHAR(255),
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by VARCHAR(255)
);

CREATE INDEX idx_alert_severity ON alerts(severity);
CREATE INDEX idx_alert_resolved ON alerts(resolved_at);
CREATE INDEX idx_alert_agent ON alerts(agent_id);
```
  </action>
  <verify>
    - Dashboard CRUD operations
    - Widget management within dashboards
    - Position updates for drag-and-drop
    - Default dashboard creation
    - Database schema for dashboards and widgets
  </verify>
  <done>Dashboard configuration manager with widget management complete</done>
</task>

### Task 18.4: Widget Data Provider

<task type="auto">
  <name>Create service to fetch data for each widget type</name>
  <files>src/meta_agent/dashboard/widget_provider.py</files>
  <action>
Build a provider that fetches the appropriate data for each widget type.

```python
# src/meta_agent/dashboard/widget_provider.py
from datetime import datetime
from typing import Any, Optional

from .aggregator import DashboardAggregator
from .models import (
    TimeRange,
    DashboardWidget,
    WidgetType,
    MetricValue,
    TimeSeries,
)


class WidgetDataProvider:
    """Provides data for dashboard widgets based on their configuration."""

    def __init__(self, aggregator: DashboardAggregator):
        self.aggregator = aggregator

    async def get_widget_data(
        self,
        widget: DashboardWidget,
        config: Optional[dict] = None,
    ) -> Any:
        """Get data for a widget based on its type and configuration."""
        cfg = config or {}

        if widget.type == WidgetType.METRIC_CARD:
            return await self._get_metric_card_data(cfg)

        elif widget.type == WidgetType.LINE_CHART:
            return await self._get_line_chart_data(cfg)

        elif widget.type == WidgetType.BAR_CHART:
            return await self._get_bar_chart_data(cfg)

        elif widget.type == WidgetType.PIE_CHART:
            return await self._get_pie_chart_data(cfg)

        elif widget.type == WidgetType.TABLE:
            return await self._get_table_data(cfg)

        elif widget.type == WidgetType.HEATMAP:
            return await self._get_heatmap_data(cfg)

        elif widget.type == WidgetType.GAUGE:
            return await self._get_gauge_data(cfg)

        elif widget.type == WidgetType.ALERT_LIST:
            return await self._get_alert_list_data(cfg)

        elif widget.type == WidgetType.STATUS_BOARD:
            return await self._get_status_board_data(cfg)

        return None

    async def _get_metric_card_data(self, config: dict) -> dict:
        """Get data for a metric card widget."""
        metric_name = config.get("metric", "success_rate")
        time_range = TimeRange(config.get("time_range", "24h"))
        agent_id = config.get("agent_id")

        metric = await self.aggregator.get_metric_value(
            metric_name=metric_name,
            time_range=time_range,
            agent_id=agent_id,
        )

        # Get sparkline data
        series = await self.aggregator.get_execution_time_series(
            time_range=time_range,
            agent_id=agent_id,
        )

        sparkline = []
        if series:
            # Find the relevant series
            for s in series:
                if metric_name == "success_rate" and s.name == "Success Rate":
                    sparkline = [p.value for p in s.points[-20:]]
                    break
                elif metric_name == "total_executions" and s.name == "Executions":
                    sparkline = [p.value for p in s.points[-20:]]
                    break
                elif metric_name == "avg_latency" and s.name == "Avg Latency":
                    sparkline = [p.value for p in s.points[-20:]]
                    break
                elif metric_name == "total_cost" and s.name == "Cost":
                    sparkline = [p.value for p in s.points[-20:]]
                    break

        # Format value based on metric type
        if metric_name == "success_rate":
            formatted_value = f"{metric.value:.1f}%"
            unit = "%"
        elif metric_name == "avg_latency":
            formatted_value = f"{metric.value:.0f}ms"
            unit = "ms"
        elif metric_name == "total_cost":
            formatted_value = f"${metric.value:.2f}"
            unit = "$"
        else:
            formatted_value = f"{metric.value:,.0f}"
            unit = ""

        return {
            "value": metric.value,
            "formatted_value": formatted_value,
            "unit": unit,
            "previous_value": metric.previous_value,
            "change_percent": metric.change_percent,
            "trend": metric.trend.value,
            "sparkline": sparkline,
        }

    async def _get_line_chart_data(self, config: dict) -> dict:
        """Get data for a line chart widget."""
        time_range = TimeRange(config.get("time_range", "24h"))
        agent_id = config.get("agent_id")
        metrics = config.get("metrics", ["executions", "success_rate"])

        series = await self.aggregator.get_execution_time_series(
            time_range=time_range,
            agent_id=agent_id,
        )

        # Filter to requested metrics
        metric_map = {
            "executions": "Executions",
            "success_rate": "Success Rate",
            "latency": "Avg Latency",
            "cost": "Cost",
        }

        filtered_series = []
        for s in series:
            for metric_key, metric_name in metric_map.items():
                if metric_key in metrics and s.name == metric_name:
                    filtered_series.append({
                        "name": s.name,
                        "unit": s.unit,
                        "color": s.color,
                        "data": [
                            {"timestamp": p.timestamp.isoformat(), "value": p.value}
                            for p in s.points
                        ],
                    })

        return {
            "series": filtered_series,
            "time_range": time_range.value,
        }

    async def _get_bar_chart_data(self, config: dict) -> dict:
        """Get data for a bar chart widget."""
        time_range = TimeRange(config.get("time_range", "24h"))
        group_by = config.get("group_by", "agent")

        breakdown = await self.aggregator.get_cost_breakdown(
            time_range=time_range,
            group_by=group_by,
        )

        return {
            "categories": [b.name for b in breakdown[:10]],
            "values": [b.cost for b in breakdown[:10]],
            "percentages": [b.percentage for b in breakdown[:10]],
            "group_by": group_by,
        }

    async def _get_pie_chart_data(self, config: dict) -> dict:
        """Get data for a pie chart widget."""
        time_range = TimeRange(config.get("time_range", "24h"))
        agent_id = config.get("agent_id")

        breakdown = await self.aggregator.get_error_breakdown(
            time_range=time_range,
            agent_id=agent_id,
        )

        return {
            "segments": [
                {
                    "name": b.category,
                    "value": b.count,
                    "percentage": b.percentage,
                }
                for b in breakdown[:8]  # Limit for readability
            ],
        }

    async def _get_table_data(self, config: dict) -> dict:
        """Get data for a table widget."""
        table_type = config.get("type", "recent_activity")
        limit = config.get("limit", 10)

        if table_type == "recent_activity":
            activities = await self.aggregator.get_recent_activity(limit=limit)
            return {
                "columns": ["Type", "Title", "Status", "Time"],
                "rows": [
                    {
                        "type": a.activity_type,
                        "title": a.title,
                        "status": a.status,
                        "timestamp": a.timestamp.isoformat(),
                    }
                    for a in activities
                ],
            }

        elif table_type == "agent_summary":
            summaries = await self.aggregator.get_agent_summaries()
            return {
                "columns": ["Agent", "Status", "Executions", "Success Rate", "Avg Latency"],
                "rows": [
                    {
                        "agent_id": s.agent_id,
                        "agent_name": s.agent_name,
                        "status": s.status,
                        "executions": s.total_executions,
                        "success_rate": f"{s.success_rate * 100:.1f}%",
                        "avg_latency": f"{s.avg_latency_ms:.0f}ms",
                    }
                    for s in summaries[:limit]
                ],
            }

        return {"columns": [], "rows": []}

    async def _get_heatmap_data(self, config: dict) -> dict:
        """Get data for a heatmap widget."""
        # Heatmap showing execution volume by hour/day
        time_range = TimeRange(config.get("time_range", "7d"))

        # This would need a more complex query to get hourly data by day
        # Simplified version:
        return {
            "x_labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "y_labels": [f"{h}:00" for h in range(24)],
            "data": [],  # Would be a 24x7 matrix
        }

    async def _get_gauge_data(self, config: dict) -> dict:
        """Get data for a gauge widget."""
        metric_name = config.get("metric", "success_rate")
        time_range = TimeRange(config.get("time_range", "24h"))
        agent_id = config.get("agent_id")

        metric = await self.aggregator.get_metric_value(
            metric_name=metric_name,
            time_range=time_range,
            agent_id=agent_id,
        )

        # Define thresholds
        thresholds = config.get("thresholds", {
            "critical": 70,
            "warning": 85,
            "good": 95,
        })

        # Determine status based on thresholds
        if metric.value >= thresholds.get("good", 95):
            status = "good"
        elif metric.value >= thresholds.get("warning", 85):
            status = "warning"
        else:
            status = "critical"

        return {
            "value": metric.value,
            "min": 0,
            "max": 100,
            "status": status,
            "thresholds": thresholds,
        }

    async def _get_alert_list_data(self, config: dict) -> dict:
        """Get data for an alert list widget."""
        limit = config.get("limit", 10)

        alerts = await self.aggregator.get_active_alerts(limit=limit)

        return {
            "alerts": [
                {
                    "id": a.id,
                    "severity": a.severity,
                    "title": a.title,
                    "message": a.message,
                    "agent_name": a.agent_name,
                    "created_at": a.created_at.isoformat(),
                    "acknowledged": a.acknowledged,
                }
                for a in alerts
            ],
            "total_count": len(alerts),
        }

    async def _get_status_board_data(self, config: dict) -> dict:
        """Get data for a status board widget."""
        time_range = TimeRange(config.get("time_range", "24h"))

        summaries = await self.aggregator.get_agent_summaries(time_range=time_range)
        health = await self.aggregator.get_system_health()

        return {
            "system_status": health.status,
            "agents": [
                {
                    "id": s.agent_id,
                    "name": s.agent_name,
                    "status": s.status,
                    "success_rate": s.success_rate,
                    "canary_status": s.canary_status,
                }
                for s in summaries
            ],
            "summary": {
                "healthy": health.healthy_agents,
                "warning": health.warning_agents,
                "critical": health.critical_agents,
                "total": health.total_agents,
            },
        }

    async def refresh_widget(
        self,
        widget: DashboardWidget,
        config: dict,
    ) -> DashboardWidget:
        """Refresh a widget's data."""
        data = await self.get_widget_data(widget, config)

        widget.data = data
        widget.last_updated = datetime.utcnow()

        return widget

    async def refresh_dashboard(
        self,
        widgets: list[DashboardWidget],
        widget_configs: dict[str, dict],
    ) -> list[DashboardWidget]:
        """Refresh all widgets in a dashboard."""
        import asyncio

        async def refresh_one(widget: DashboardWidget) -> DashboardWidget:
            config = widget_configs.get(widget.id, {})
            return await self.refresh_widget(widget, config)

        return await asyncio.gather(*[refresh_one(w) for w in widgets])
```
  </action>
  <verify>
    - Data provider for all widget types
    - Metric card with sparkline
    - Line/bar/pie charts
    - Tables with different data sources
    - Gauge with thresholds
    - Alert list and status board
    - Parallel widget refresh
  </verify>
  <done>Widget data provider for all dashboard widget types complete</done>
</task>

### Task 18.5: Dashboard API Endpoints

<task type="auto">
  <name>Create REST API for dashboard management and data</name>
  <files>src/meta_agent/api/routes/dashboard.py</files>
  <action>
Implement API endpoints for dashboard operations and data retrieval.

```python
# src/meta_agent/api/routes/dashboard.py
from datetime import datetime
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ...dashboard.models import TimeRange, WidgetType
from ...dashboard.aggregator import DashboardAggregator
from ...dashboard.config_manager import DashboardConfigManager
from ...dashboard.widget_provider import WidgetDataProvider
from ..dependencies import get_aggregator, get_dashboard_manager, get_widget_provider


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


# ==================== REQUEST/RESPONSE MODELS ====================

class CreateDashboardRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    widgets: list[dict] = []
    is_default: bool = False


class UpdateDashboardRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[bool] = None


class CreateWidgetRequest(BaseModel):
    type: WidgetType
    title: str = Field(..., min_length=1, max_length=255)
    config: dict = {}
    position: dict = Field(default={"x": 0, "y": 0, "w": 4, "h": 2})
    refresh_interval_seconds: int = Field(default=60, ge=10, le=3600)


class UpdateWidgetRequest(BaseModel):
    type: Optional[WidgetType] = None
    title: Optional[str] = None
    config: Optional[dict] = None
    position: Optional[dict] = None
    refresh_interval_seconds: Optional[int] = None


class UpdateWidgetPositionsRequest(BaseModel):
    positions: dict[str, dict]  # widget_id -> position


class WidgetResponse(BaseModel):
    id: str
    type: str
    title: str
    data: Any = None
    position: dict
    refresh_interval_seconds: int
    last_updated: Optional[datetime] = None


class DashboardResponse(BaseModel):
    id: str
    name: str
    description: str
    widgets: list[WidgetResponse]
    is_default: bool
    created_at: datetime
    updated_at: datetime


class SystemHealthResponse(BaseModel):
    status: str
    healthy_agents: int
    warning_agents: int
    critical_agents: int
    total_agents: int
    active_problems: int
    pending_proposals: int
    active_experiments: int
    last_updated: datetime


class ExecutionSummaryResponse(BaseModel):
    total_executions: int
    successful_executions: int
    failed_executions: int
    success_rate: float
    avg_latency_ms: float
    p50_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    total_cost: float
    avg_cost_per_execution: float
    total_tokens: int


class AgentSummaryResponse(BaseModel):
    agent_id: str
    agent_name: str
    status: str
    total_executions: int
    success_rate: float
    avg_latency_ms: float
    avg_cost: float
    error_count: int
    last_execution: Optional[datetime]
    active_version: Optional[str]
    canary_status: Optional[str]


class MetricValueResponse(BaseModel):
    value: float
    unit: str
    previous_value: Optional[float]
    change_percent: Optional[float]
    trend: str


# ==================== DASHBOARD CRUD ENDPOINTS ====================

@router.post("/dashboards", response_model=DashboardResponse)
async def create_dashboard(
    request: CreateDashboardRequest,
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
):
    """Create a new dashboard."""
    dashboard = await manager.create_dashboard(
        name=request.name,
        description=request.description,
        widgets=request.widgets,
        is_default=request.is_default,
    )

    return _dashboard_to_response(dashboard)


@router.get("/dashboards", response_model=list[DashboardResponse])
async def list_dashboards(
    owner: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=100),
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
):
    """List all dashboards."""
    dashboards = await manager.list_dashboards(owner=owner, limit=limit)
    return [_dashboard_to_response(d) for d in dashboards]


@router.get("/dashboards/default", response_model=DashboardResponse)
async def get_default_dashboard(
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
    provider: WidgetDataProvider = Depends(get_widget_provider),
):
    """Get the default dashboard with data."""
    dashboard = await manager.get_default_dashboard()

    if not dashboard:
        # Create default if doesn't exist
        dashboard = await manager.create_default_dashboard()

    # Fetch widget data
    await _populate_widget_data(dashboard, provider)

    return _dashboard_to_response(dashboard)


@router.get("/dashboards/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(
    dashboard_id: str,
    include_data: bool = Query(default=True),
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
    provider: WidgetDataProvider = Depends(get_widget_provider),
):
    """Get a specific dashboard."""
    dashboard = await manager.get_dashboard(dashboard_id)

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    if include_data:
        await _populate_widget_data(dashboard, provider)

    return _dashboard_to_response(dashboard)


@router.put("/dashboards/{dashboard_id}", response_model=DashboardResponse)
async def update_dashboard(
    dashboard_id: str,
    request: UpdateDashboardRequest,
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
):
    """Update a dashboard."""
    dashboard = await manager.update_dashboard(
        dashboard_id=dashboard_id,
        name=request.name,
        description=request.description,
        is_default=request.is_default,
    )

    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    return _dashboard_to_response(dashboard)


@router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: str,
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
):
    """Delete a dashboard."""
    await manager.delete_dashboard(dashboard_id)
    return {"status": "deleted", "dashboard_id": dashboard_id}


# ==================== WIDGET ENDPOINTS ====================

@router.post("/dashboards/{dashboard_id}/widgets", response_model=WidgetResponse)
async def add_widget(
    dashboard_id: str,
    request: CreateWidgetRequest,
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
):
    """Add a widget to a dashboard."""
    widget = await manager.add_widget(
        dashboard_id=dashboard_id,
        widget_config={
            "type": request.type.value,
            "title": request.title,
            "config": request.config,
            "position": request.position,
            "refresh_interval_seconds": request.refresh_interval_seconds,
        },
    )

    return _widget_to_response(widget)


@router.put("/dashboards/{dashboard_id}/widgets/{widget_id}", response_model=WidgetResponse)
async def update_widget(
    dashboard_id: str,
    widget_id: str,
    request: UpdateWidgetRequest,
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
):
    """Update a widget."""
    updates = {k: v for k, v in request.dict().items() if v is not None}
    if "type" in updates:
        updates["type"] = updates["type"].value

    widget = await manager.update_widget(widget_id, updates)

    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    return _widget_to_response(widget)


@router.delete("/dashboards/{dashboard_id}/widgets/{widget_id}")
async def remove_widget(
    dashboard_id: str,
    widget_id: str,
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
):
    """Remove a widget from a dashboard."""
    await manager.remove_widget(widget_id)
    return {"status": "deleted", "widget_id": widget_id}


@router.put("/dashboards/{dashboard_id}/widgets/positions")
async def update_widget_positions(
    dashboard_id: str,
    request: UpdateWidgetPositionsRequest,
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
):
    """Update positions for multiple widgets (for drag-and-drop)."""
    await manager.update_widget_positions(dashboard_id, request.positions)
    return {"status": "updated"}


@router.get("/dashboards/{dashboard_id}/widgets/{widget_id}/data")
async def get_widget_data(
    dashboard_id: str,
    widget_id: str,
    manager: DashboardConfigManager = Depends(get_dashboard_manager),
    provider: WidgetDataProvider = Depends(get_widget_provider),
):
    """Get data for a specific widget."""
    dashboard = await manager.get_dashboard(dashboard_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Dashboard not found")

    widget = next((w for w in dashboard.widgets if w.id == widget_id), None)
    if not widget:
        raise HTTPException(status_code=404, detail="Widget not found")

    # Get widget config from database
    config = {}  # Would fetch from widget_configs
    data = await provider.get_widget_data(widget, config)

    return {"widget_id": widget_id, "data": data, "refreshed_at": datetime.utcnow()}


# ==================== DATA ENDPOINTS ====================

@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health(
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get system health status."""
    health = await aggregator.get_system_health()
    return SystemHealthResponse(
        status=health.status,
        healthy_agents=health.healthy_agents,
        warning_agents=health.warning_agents,
        critical_agents=health.critical_agents,
        total_agents=health.total_agents,
        active_problems=health.active_problems,
        pending_proposals=health.pending_proposals,
        active_experiments=health.active_experiments,
        last_updated=health.last_updated,
    )


@router.get("/executions/summary", response_model=ExecutionSummaryResponse)
async def get_execution_summary(
    time_range: TimeRange = Query(default=TimeRange.LAST_24_HOURS),
    agent_id: Optional[str] = None,
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get execution summary metrics."""
    summary = await aggregator.get_execution_summary(
        time_range=time_range,
        agent_id=agent_id,
    )

    return ExecutionSummaryResponse(
        total_executions=summary.total_executions,
        successful_executions=summary.successful_executions,
        failed_executions=summary.failed_executions,
        success_rate=summary.success_rate,
        avg_latency_ms=summary.avg_latency_ms,
        p50_latency_ms=summary.p50_latency_ms,
        p95_latency_ms=summary.p95_latency_ms,
        p99_latency_ms=summary.p99_latency_ms,
        total_cost=summary.total_cost,
        avg_cost_per_execution=summary.avg_cost_per_execution,
        total_tokens=summary.total_tokens,
    )


@router.get("/executions/timeseries")
async def get_execution_timeseries(
    time_range: TimeRange = Query(default=TimeRange.LAST_24_HOURS),
    agent_id: Optional[str] = None,
    interval: str = Query(default="1 hour"),
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get execution metrics as time series."""
    series = await aggregator.get_execution_time_series(
        time_range=time_range,
        agent_id=agent_id,
        interval=interval,
    )

    return {
        "series": [
            {
                "name": s.name,
                "unit": s.unit,
                "color": s.color,
                "data": [
                    {"timestamp": p.timestamp.isoformat(), "value": p.value}
                    for p in s.points
                ],
            }
            for s in series
        ],
    }


@router.get("/agents/summary", response_model=list[AgentSummaryResponse])
async def get_agents_summary(
    time_range: TimeRange = Query(default=TimeRange.LAST_24_HOURS),
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get summary for all agents."""
    summaries = await aggregator.get_agent_summaries(time_range=time_range)

    return [
        AgentSummaryResponse(
            agent_id=s.agent_id,
            agent_name=s.agent_name,
            status=s.status,
            total_executions=s.total_executions,
            success_rate=s.success_rate,
            avg_latency_ms=s.avg_latency_ms,
            avg_cost=s.avg_cost,
            error_count=s.error_count,
            last_execution=s.last_execution,
            active_version=s.active_version,
            canary_status=s.canary_status,
        )
        for s in summaries
    ]


@router.get("/errors/breakdown")
async def get_error_breakdown(
    time_range: TimeRange = Query(default=TimeRange.LAST_24_HOURS),
    agent_id: Optional[str] = None,
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get error breakdown by category."""
    breakdown = await aggregator.get_error_breakdown(
        time_range=time_range,
        agent_id=agent_id,
    )

    return {
        "breakdown": [
            {
                "category": b.category,
                "count": b.count,
                "percentage": b.percentage,
                "trend": b.trend.value,
            }
            for b in breakdown
        ],
    }


@router.get("/costs/breakdown")
async def get_cost_breakdown(
    time_range: TimeRange = Query(default=TimeRange.LAST_24_HOURS),
    group_by: str = Query(default="agent"),
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get cost breakdown."""
    breakdown = await aggregator.get_cost_breakdown(
        time_range=time_range,
        group_by=group_by,
    )

    return {
        "breakdown": [
            {
                "name": b.name,
                "cost": b.cost,
                "percentage": b.percentage,
                "execution_count": b.execution_count,
                "avg_cost_per_execution": b.avg_cost_per_execution,
            }
            for b in breakdown
        ],
    }


@router.get("/alerts/active")
async def get_active_alerts(
    limit: int = Query(default=20, ge=1, le=100),
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get active alerts."""
    alerts = await aggregator.get_active_alerts(limit=limit)

    return {
        "alerts": [
            {
                "id": a.id,
                "severity": a.severity,
                "title": a.title,
                "message": a.message,
                "agent_id": a.agent_id,
                "agent_name": a.agent_name,
                "created_at": a.created_at.isoformat(),
                "acknowledged": a.acknowledged,
            }
            for a in alerts
        ],
    }


@router.get("/activity/recent")
async def get_recent_activity(
    limit: int = Query(default=20, ge=1, le=100),
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get recent activity."""
    activities = await aggregator.get_recent_activity(limit=limit)

    return {
        "activities": [
            {
                "id": a.id,
                "type": a.activity_type,
                "title": a.title,
                "description": a.description,
                "status": a.status,
                "timestamp": a.timestamp.isoformat(),
            }
            for a in activities
        ],
    }


@router.get("/metrics/{metric_name}", response_model=MetricValueResponse)
async def get_metric_value(
    metric_name: str,
    time_range: TimeRange = Query(default=TimeRange.LAST_24_HOURS),
    agent_id: Optional[str] = None,
    aggregator: DashboardAggregator = Depends(get_aggregator),
):
    """Get a specific metric value with trend."""
    metric = await aggregator.get_metric_value(
        metric_name=metric_name,
        time_range=time_range,
        agent_id=agent_id,
    )

    return MetricValueResponse(
        value=metric.value,
        unit=_get_metric_unit(metric_name),
        previous_value=metric.previous_value,
        change_percent=metric.change_percent,
        trend=metric.trend.value,
    )


# ==================== HELPERS ====================

def _dashboard_to_response(dashboard) -> DashboardResponse:
    """Convert Dashboard to response model."""
    return DashboardResponse(
        id=dashboard.id,
        name=dashboard.name,
        description=dashboard.description,
        widgets=[_widget_to_response(w) for w in dashboard.widgets],
        is_default=dashboard.is_default,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


def _widget_to_response(widget) -> WidgetResponse:
    """Convert Widget to response model."""
    return WidgetResponse(
        id=widget.id,
        type=widget.type.value,
        title=widget.title,
        data=widget.data,
        position=widget.position,
        refresh_interval_seconds=widget.refresh_interval_seconds,
        last_updated=widget.last_updated,
    )


async def _populate_widget_data(dashboard, provider: WidgetDataProvider):
    """Populate all widgets with data."""
    for widget in dashboard.widgets:
        config = {}  # Would get from widget config
        widget.data = await provider.get_widget_data(widget, config)
        widget.last_updated = datetime.utcnow()


def _get_metric_unit(metric_name: str) -> str:
    """Get unit for a metric."""
    units = {
        "success_rate": "%",
        "total_executions": "count",
        "avg_latency": "ms",
        "total_cost": "$",
    }
    return units.get(metric_name, "")
```
  </action>
  <verify>
    - Dashboard CRUD endpoints
    - Widget management endpoints
    - Position update for drag-and-drop
    - Widget data retrieval
    - System health endpoint
    - Execution metrics endpoints
    - Agent summary endpoint
    - Error and cost breakdown endpoints
    - Alert and activity feeds
    - Individual metric endpoint
  </verify>
  <done>Dashboard REST API with all management and data endpoints complete</done>
</task>

## Phase Completion Criteria

- [ ] Dashboard data models for widgets and aggregations
- [ ] Data aggregator collecting from all system components
- [ ] Dashboard configuration manager with CRUD
- [ ] Widget data provider for all widget types
- [ ] REST API for dashboard management
- [ ] System health endpoint
- [ ] Execution metrics with time series
- [ ] Agent summaries and status
- [ ] Error and cost breakdowns
- [ ] Alert and activity feeds
