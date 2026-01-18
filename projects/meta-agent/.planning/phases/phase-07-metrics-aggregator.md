# Phase 7: Metrics Aggregator

**Duration**: 3 days | **Complexity**: Medium | **Dependencies**: Phase 3

## Phase Overview

Build daily metrics aggregation from execution logs. This runs as a scheduled job to calculate comprehensive metrics for each agent.

## Success Criteria

- [ ] Daily aggregation job (runs at 2 AM)
- [ ] Calculate all metrics (success rate, latency percentiles, cost)
- [ ] Error distribution analysis
- [ ] Human intervention counting
- [ ] Metrics upsert logic
- [ ] Historical data retention policy
- [ ] Aggregation performance optimization
- [ ] Aggregates 1M logs in <5 minutes

---

## Tasks

<task id="7.1" type="auto" priority="critical">
  <name>Metrics Calculation Engine</name>
  <files>
    - src/meta_agent/metrics/calculator.py
    - src/meta_agent/metrics/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/metrics/calculator.py
    from dataclasses import dataclass
    from datetime import datetime, date
    from typing import Dict, List, Any, Optional
    from decimal import Decimal

    @dataclass
    class DailyMetrics:
        agent_id: str
        metric_date: date
        total_executions: int
        successful_executions: int
        failed_executions: int
        success_rate: Decimal
        avg_latency_ms: int
        p50_latency_ms: int
        p95_latency_ms: int
        p99_latency_ms: int
        total_tokens: int
        total_cost_usd: Decimal
        avg_cost_per_execution: Decimal
        error_distribution: Dict[str, int]
        human_interventions: int
        unique_users: int

    class MetricsCalculator:
        async def calculate_daily_metrics(
            self,
            db,
            agent_id: str,
            target_date: date,
        ) -> DailyMetrics:
            """Calculate all metrics for an agent on a specific date."""
            # Get base stats
            base_stats = await db.fetch_one("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'success') as success,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    AVG(latency_ms)::int as avg_latency,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)::int as p50,
                    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::int as p95,
                    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms)::int as p99,
                    COALESCE(SUM(token_count), 0) as total_tokens,
                    COALESCE(SUM(cost_usd), 0) as total_cost,
                    COUNT(DISTINCT metadata->>'user_id') as unique_users
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND DATE(timestamp) = $2
            """, agent_id, target_date)

            # Get error distribution
            error_dist = await db.fetch_all("""
                SELECT error_type, COUNT(*) as count
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND DATE(timestamp) = $2
                  AND status = 'failed'
                GROUP BY error_type
            """, agent_id, target_date)

            # Get human interventions
            interventions = await db.fetch_one("""
                SELECT COUNT(*) as count
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND DATE(timestamp) = $2
                  AND metadata->>'human_intervention' = 'true'
            """, agent_id, target_date)

            total = base_stats['total'] or 0
            success = base_stats['success'] or 0

            return DailyMetrics(
                agent_id=agent_id,
                metric_date=target_date,
                total_executions=total,
                successful_executions=success,
                failed_executions=base_stats['failed'] or 0,
                success_rate=Decimal(str(success / total if total > 0 else 1)),
                avg_latency_ms=base_stats['avg_latency'] or 0,
                p50_latency_ms=base_stats['p50'] or 0,
                p95_latency_ms=base_stats['p95'] or 0,
                p99_latency_ms=base_stats['p99'] or 0,
                total_tokens=base_stats['total_tokens'],
                total_cost_usd=Decimal(str(base_stats['total_cost'])),
                avg_cost_per_execution=Decimal(str(
                    base_stats['total_cost'] / total if total > 0 else 0
                )),
                error_distribution={e['error_type']: e['count'] for e in error_dist},
                human_interventions=interventions['count'] or 0,
                unique_users=base_stats['unique_users'] or 0,
            )
    ```
  </action>
  <verify>
    - All metrics calculated correctly
    - Handles zero data gracefully
    - Performance acceptable
  </verify>
  <done>Metrics calculation engine implemented</done>
</task>

<task id="7.2" type="auto" priority="critical">
  <name>Daily Aggregation Job</name>
  <files>
    - src/meta_agent/metrics/aggregator.py
  </files>
  <action>
    ```python
    # src/meta_agent/metrics/aggregator.py
    from datetime import date, datetime, timedelta
    from typing import List
    import logging

    from .calculator import MetricsCalculator, DailyMetrics
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class MetricsAggregator:
        def __init__(self, database: Database):
            self.db = database
            self.calculator = MetricsCalculator()

        async def run_daily_aggregation(
            self,
            target_date: Optional[date] = None,
        ) -> int:
            """Run daily aggregation for all agents."""
            target = target_date or (datetime.utcnow().date() - timedelta(days=1))
            logger.info(f"Starting daily aggregation for {target}")

            # Get all active agents
            agents = await self.db.fetch_all(
                "SELECT id FROM agent_registry WHERE status = 'active'"
            )

            processed = 0
            for agent in agents:
                try:
                    metrics = await self.calculator.calculate_daily_metrics(
                        self.db, agent['id'], target
                    )
                    await self._upsert_metrics(metrics)
                    processed += 1
                except Exception as e:
                    logger.error(f"Failed to aggregate {agent['id']}: {e}")

            logger.info(f"Completed aggregation: {processed}/{len(agents)} agents")
            return processed

        async def _upsert_metrics(self, metrics: DailyMetrics) -> None:
            """Upsert daily metrics."""
            await self.db.execute("""
                INSERT INTO agent_performance_metrics (
                    agent_id, metric_date, total_executions, successful_executions,
                    failed_executions, success_rate, avg_latency_ms, p50_latency_ms,
                    p95_latency_ms, p99_latency_ms, total_tokens, total_cost_usd,
                    avg_cost_per_execution, error_distribution, human_interventions,
                    unique_users, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW()
                )
                ON CONFLICT (agent_id, metric_date) DO UPDATE SET
                    total_executions = EXCLUDED.total_executions,
                    successful_executions = EXCLUDED.successful_executions,
                    failed_executions = EXCLUDED.failed_executions,
                    success_rate = EXCLUDED.success_rate,
                    avg_latency_ms = EXCLUDED.avg_latency_ms,
                    p50_latency_ms = EXCLUDED.p50_latency_ms,
                    p95_latency_ms = EXCLUDED.p95_latency_ms,
                    p99_latency_ms = EXCLUDED.p99_latency_ms,
                    total_tokens = EXCLUDED.total_tokens,
                    total_cost_usd = EXCLUDED.total_cost_usd,
                    avg_cost_per_execution = EXCLUDED.avg_cost_per_execution,
                    error_distribution = EXCLUDED.error_distribution,
                    human_interventions = EXCLUDED.human_interventions,
                    unique_users = EXCLUDED.unique_users,
                    updated_at = NOW()
            """,
                metrics.agent_id, metrics.metric_date, metrics.total_executions,
                metrics.successful_executions, metrics.failed_executions,
                metrics.success_rate, metrics.avg_latency_ms, metrics.p50_latency_ms,
                metrics.p95_latency_ms, metrics.p99_latency_ms, metrics.total_tokens,
                metrics.total_cost_usd, metrics.avg_cost_per_execution,
                metrics.error_distribution, metrics.human_interventions,
                metrics.unique_users
            )

        async def backfill(
            self,
            start_date: date,
            end_date: date,
        ) -> int:
            """Backfill metrics for a date range."""
            current = start_date
            total = 0
            while current <= end_date:
                count = await self.run_daily_aggregation(current)
                total += count
                current += timedelta(days=1)
            return total
    ```
  </action>
  <verify>
    - Aggregation runs for all agents
    - Upsert works correctly
    - Backfill works
    - Performance acceptable
  </verify>
  <done>Daily aggregation job implemented</done>
</task>

<task id="7.3" type="auto" priority="high">
  <name>Scheduled Job Setup</name>
  <files>
    - src/meta_agent/metrics/scheduler.py
  </files>
  <action>
    ```python
    # src/meta_agent/metrics/scheduler.py
    import asyncio
    from datetime import datetime, time
    from typing import Optional
    import logging

    from .aggregator import MetricsAggregator

    logger = logging.getLogger(__name__)

    class MetricsScheduler:
        def __init__(
            self,
            aggregator: MetricsAggregator,
            run_time: time = time(2, 0),  # 2 AM
        ):
            self.aggregator = aggregator
            self.run_time = run_time
            self._running = False
            self._task: Optional[asyncio.Task] = None

        async def start(self) -> None:
            """Start the scheduler."""
            self._running = True
            self._task = asyncio.create_task(self._run_loop())
            logger.info(f"Metrics scheduler started, will run at {self.run_time}")

        async def stop(self) -> None:
            """Stop the scheduler."""
            self._running = False
            if self._task:
                self._task.cancel()

        async def _run_loop(self) -> None:
            """Main scheduler loop."""
            while self._running:
                now = datetime.utcnow()
                next_run = self._get_next_run_time(now)
                sleep_seconds = (next_run - now).total_seconds()

                logger.info(f"Next metrics aggregation at {next_run}")
                await asyncio.sleep(sleep_seconds)

                if self._running:
                    try:
                        await self.aggregator.run_daily_aggregation()
                    except Exception as e:
                        logger.error(f"Scheduled aggregation failed: {e}")

        def _get_next_run_time(self, now: datetime) -> datetime:
            """Calculate next run time."""
            today_run = now.replace(
                hour=self.run_time.hour,
                minute=self.run_time.minute,
                second=0,
                microsecond=0
            )
            if now >= today_run:
                return today_run + timedelta(days=1)
            return today_run
    ```
  </action>
  <verify>
    - Scheduler starts and stops
    - Runs at correct time
    - Handles errors gracefully
  </verify>
  <done>Scheduled job setup</done>
</task>

<task id="7.4" type="auto" priority="medium">
  <name>Data Retention Policy</name>
  <files>
    - src/meta_agent/metrics/retention.py
  </files>
  <action>
    ```python
    # src/meta_agent/metrics/retention.py
    from datetime import date, timedelta
    import logging

    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class RetentionPolicy:
        def __init__(
            self,
            database: Database,
            raw_logs_days: int = 30,
            metrics_days: int = 365,
            alerts_days: int = 90,
        ):
            self.db = database
            self.raw_logs_days = raw_logs_days
            self.metrics_days = metrics_days
            self.alerts_days = alerts_days

        async def apply(self) -> dict:
            """Apply retention policy to all tables."""
            results = {}

            # Raw logs - 30 days
            cutoff = date.today() - timedelta(days=self.raw_logs_days)
            deleted = await self.db.execute("""
                DELETE FROM agent_execution_logs
                WHERE DATE(timestamp) < $1
            """, cutoff)
            results['execution_logs'] = deleted

            # Metrics - 365 days
            cutoff = date.today() - timedelta(days=self.metrics_days)
            deleted = await self.db.execute("""
                DELETE FROM agent_performance_metrics
                WHERE metric_date < $1
            """, cutoff)
            results['metrics'] = deleted

            # Resolved alerts - 90 days
            cutoff = date.today() - timedelta(days=self.alerts_days)
            deleted = await self.db.execute("""
                DELETE FROM alert_history
                WHERE resolved_at IS NOT NULL
                  AND DATE(resolved_at) < $1
            """, cutoff)
            results['alerts'] = deleted

            logger.info(f"Retention applied: {results}")
            return results
    ```
  </action>
  <verify>
    - Old data deleted
    - Correct cutoff dates
    - Safe deletion (resolved alerts only)
  </verify>
  <done>Data retention policy</done>
</task>

<task id="7.5" type="auto" priority="medium">
  <name>Metrics API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/metrics.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/metrics.py
    from fastapi import APIRouter, Depends, Query
    from typing import List
    from datetime import date, timedelta
    from pydantic import BaseModel
    from decimal import Decimal

    router = APIRouter(prefix="/api/v1/metrics", tags=["metrics"])

    class MetricsResponse(BaseModel):
        agent_id: str
        metric_date: date
        total_executions: int
        success_rate: float
        avg_latency_ms: int
        p95_latency_ms: int
        total_cost_usd: float
        error_distribution: dict

    @router.get("/{agent_id}", response_model=List[MetricsResponse])
    async def get_agent_metrics(
        agent_id: str,
        start_date: date = Query(default_factory=lambda: date.today() - timedelta(days=30)),
        end_date: date = Query(default_factory=date.today),
        db = Depends(get_database),
    ):
        """Get metrics for an agent within a date range."""
        rows = await db.fetch_all("""
            SELECT * FROM agent_performance_metrics
            WHERE agent_id = $1
              AND metric_date BETWEEN $2 AND $3
            ORDER BY metric_date DESC
        """, agent_id, start_date, end_date)
        return rows

    @router.get("/{agent_id}/summary")
    async def get_agent_summary(
        agent_id: str,
        days: int = Query(30, le=365),
        db = Depends(get_database),
    ):
        """Get summary metrics for an agent."""
        cutoff = date.today() - timedelta(days=days)
        return await db.fetch_one("""
            SELECT
                AVG(success_rate) as avg_success_rate,
                AVG(avg_latency_ms) as avg_latency,
                SUM(total_executions) as total_executions,
                SUM(total_cost_usd) as total_cost
            FROM agent_performance_metrics
            WHERE agent_id = $1 AND metric_date >= $2
        """, agent_id, cutoff)

    @router.post("/aggregate/trigger")
    async def trigger_aggregation(
        target_date: date = Query(None),
        aggregator = Depends(get_aggregator),
    ):
        """Manually trigger aggregation."""
        count = await aggregator.run_daily_aggregation(target_date)
        return {"status": "completed", "agents_processed": count}
    ```
  </action>
  <verify>
    - Get metrics works
    - Summary works
    - Manual trigger works
  </verify>
  <done>Metrics API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] Daily aggregation working
- [ ] All metrics calculated correctly
- [ ] Scheduled job running at 2 AM
- [ ] Retention policy implemented
- [ ] Manual trigger available
- [ ] Backfill capability working
- [ ] Performance: <5 min for 1M logs

## Files Created

- `src/meta_agent/metrics/__init__.py`
- `src/meta_agent/metrics/calculator.py`
- `src/meta_agent/metrics/aggregator.py`
- `src/meta_agent/metrics/scheduler.py`
- `src/meta_agent/metrics/retention.py`
- `src/meta_agent/api/routes/metrics.py`
