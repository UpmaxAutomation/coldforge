# Phase 4: Real-Time Health Monitor

**Duration**: 4 days | **Complexity**: High | **Dependencies**: Phase 3

## Phase Overview

Build real-time health monitoring with sub-minute granularity. This system tracks agent health in real-time using Redis for counters and rolling window calculations.

## Success Criteria

- [ ] Redis integration for real-time counters
- [ ] 5-minute rolling window calculations
- [ ] 1-hour rolling window calculations
- [ ] Health status determination logic (healthy/degraded/critical)
- [ ] Status transition detection
- [ ] `agent_health_realtime` table updates
- [ ] Health check background worker
- [ ] WebSocket publisher for dashboard
- [ ] Handles 10K executions/minute without lag
- [ ] Health status updates within 30 seconds of issue

---

## Tasks

<task id="4.1" type="auto" priority="critical">
  <name>Redis Integration for Real-Time Counters</name>
  <files>
    - src/meta_agent/monitoring/redis_client.py
    - src/meta_agent/monitoring/__init__.py
  </files>
  <context>
    Redis is used for real-time counters because it's fast and supports
    atomic increments, TTL-based expiration, and sorted sets for time windows.
  </context>
  <action>
    Create Redis client wrapper:

    ```python
    # src/meta_agent/monitoring/redis_client.py
    import redis.asyncio as redis
    from datetime import datetime, timedelta
    from typing import Dict, List, Optional, Tuple
    import json

    class RealTimeMetrics:
        def __init__(self, redis_url: str = "redis://localhost:6379"):
            self.redis = redis.from_url(redis_url, decode_responses=True)
            self.KEY_PREFIX = "metaagent:"

        async def close(self):
            await self.redis.close()

        # --- Counter Operations ---

        async def increment_execution(
            self,
            agent_id: str,
            success: bool,
            latency_ms: int,
            cost_usd: float,
            timestamp: Optional[datetime] = None,
        ) -> None:
            """Record an execution in real-time counters."""
            ts = timestamp or datetime.utcnow()
            minute_bucket = ts.strftime("%Y%m%d%H%M")
            hour_bucket = ts.strftime("%Y%m%d%H")

            pipe = self.redis.pipeline()

            # Per-minute counters (TTL: 10 minutes)
            minute_key = f"{self.KEY_PREFIX}minute:{agent_id}:{minute_bucket}"
            pipe.hincrby(minute_key, "total", 1)
            pipe.hincrby(minute_key, "success" if success else "failure", 1)
            pipe.hincrbyfloat(minute_key, "latency_sum", latency_ms)
            pipe.hincrbyfloat(minute_key, "cost_sum", cost_usd)
            pipe.expire(minute_key, 600)  # 10 min TTL

            # Per-hour counters (TTL: 2 hours)
            hour_key = f"{self.KEY_PREFIX}hour:{agent_id}:{hour_bucket}"
            pipe.hincrby(hour_key, "total", 1)
            pipe.hincrby(hour_key, "success" if success else "failure", 1)
            pipe.hincrbyfloat(hour_key, "latency_sum", latency_ms)
            pipe.hincrbyfloat(hour_key, "cost_sum", cost_usd)
            pipe.expire(hour_key, 7200)  # 2 hour TTL

            # Track latency in sorted set for percentiles
            latency_key = f"{self.KEY_PREFIX}latency:{agent_id}:{minute_bucket}"
            pipe.zadd(latency_key, {str(ts.timestamp()): latency_ms})
            pipe.expire(latency_key, 600)

            await pipe.execute()

        async def get_minute_stats(
            self,
            agent_id: str,
            minutes_back: int = 5,
        ) -> Dict[str, float]:
            """Get aggregated stats for the last N minutes."""
            now = datetime.utcnow()
            pipe = self.redis.pipeline()

            for i in range(minutes_back):
                ts = now - timedelta(minutes=i)
                key = f"{self.KEY_PREFIX}minute:{agent_id}:{ts.strftime('%Y%m%d%H%M')}"
                pipe.hgetall(key)

            results = await pipe.execute()

            total = success = failure = 0
            latency_sum = cost_sum = 0.0

            for r in results:
                if r:
                    total += int(r.get("total", 0))
                    success += int(r.get("success", 0))
                    failure += int(r.get("failure", 0))
                    latency_sum += float(r.get("latency_sum", 0))
                    cost_sum += float(r.get("cost_sum", 0))

            return {
                "total": total,
                "success": success,
                "failure": failure,
                "success_rate": success / total if total > 0 else 1.0,
                "avg_latency_ms": latency_sum / total if total > 0 else 0,
                "total_cost": cost_sum,
            }

        async def get_hour_stats(
            self,
            agent_id: str,
        ) -> Dict[str, float]:
            """Get stats for the current hour."""
            now = datetime.utcnow()
            key = f"{self.KEY_PREFIX}hour:{agent_id}:{now.strftime('%Y%m%d%H')}"

            data = await self.redis.hgetall(key)
            if not data:
                return {"total": 0, "success_rate": 1.0, "avg_latency_ms": 0}

            total = int(data.get("total", 0))
            success = int(data.get("success", 0))
            latency_sum = float(data.get("latency_sum", 0))

            return {
                "total": total,
                "success": success,
                "failure": int(data.get("failure", 0)),
                "success_rate": success / total if total > 0 else 1.0,
                "avg_latency_ms": latency_sum / total if total > 0 else 0,
                "total_cost": float(data.get("cost_sum", 0)),
            }

        async def get_latency_percentile(
            self,
            agent_id: str,
            percentile: int = 95,
            minutes_back: int = 5,
        ) -> float:
            """Calculate latency percentile from recent data."""
            now = datetime.utcnow()
            all_latencies = []

            for i in range(minutes_back):
                ts = now - timedelta(minutes=i)
                key = f"{self.KEY_PREFIX}latency:{agent_id}:{ts.strftime('%Y%m%d%H%M')}"
                values = await self.redis.zrange(key, 0, -1, withscores=True)
                all_latencies.extend([score for _, score in values])

            if not all_latencies:
                return 0.0

            all_latencies.sort()
            idx = int(len(all_latencies) * percentile / 100)
            return all_latencies[min(idx, len(all_latencies) - 1)]
    ```
  </action>
  <verify>
    - Redis connection works
    - Counters increment correctly
    - TTL set on all keys
    - Stats aggregation accurate
  </verify>
  <done>Redis real-time metrics client implemented</done>
</task>

<task id="4.2" type="auto" priority="critical">
  <name>Health Status Calculator</name>
  <files>
    - src/meta_agent/monitoring/health_calculator.py
  </files>
  <context>
    Health status is determined by comparing metrics against thresholds.
    Status levels: HEALTHY, DEGRADED, CRITICAL
  </context>
  <action>
    Create health calculator:

    ```python
    # src/meta_agent/monitoring/health_calculator.py
    from dataclasses import dataclass
    from enum import Enum
    from typing import Dict, Optional
    from datetime import datetime

    class HealthStatus(str, Enum):
        HEALTHY = "healthy"
        DEGRADED = "degraded"
        CRITICAL = "critical"
        UNKNOWN = "unknown"

    @dataclass
    class HealthThresholds:
        # Success rate thresholds
        success_rate_healthy: float = 0.95  # Above this = healthy
        success_rate_critical: float = 0.80  # Below this = critical

        # Latency thresholds (P95 in ms)
        latency_p95_healthy: int = 3000  # Below this = healthy
        latency_p95_critical: int = 10000  # Above this = critical

        # Error rate thresholds (per hour)
        error_rate_healthy: int = 5  # Below this = healthy
        error_rate_critical: int = 20  # Above this = critical

        # Consecutive failures
        consecutive_failures_critical: int = 5

    @dataclass
    class HealthSnapshot:
        agent_id: str
        status: HealthStatus
        score: float  # 0-100
        success_rate_5min: float
        success_rate_1hr: float
        latency_p95_5min: float
        error_count_5min: int
        error_count_1hr: int
        executions_5min: int
        executions_1hr: int
        consecutive_failures: int
        last_success_at: Optional[datetime]
        calculated_at: datetime
        issues: list[str]

    class HealthCalculator:
        def __init__(self, thresholds: Optional[HealthThresholds] = None):
            self.thresholds = thresholds or HealthThresholds()

        def calculate_health(
            self,
            agent_id: str,
            stats_5min: Dict[str, float],
            stats_1hr: Dict[str, float],
            latency_p95: float,
            consecutive_failures: int,
            last_success_at: Optional[datetime],
        ) -> HealthSnapshot:
            """Calculate comprehensive health snapshot."""
            issues = []
            score = 100.0

            # Check success rate (5 min window - more sensitive)
            sr_5min = stats_5min.get("success_rate", 1.0)
            sr_1hr = stats_1hr.get("success_rate", 1.0)

            if sr_5min < self.thresholds.success_rate_critical:
                issues.append(f"Critical: Success rate at {sr_5min:.1%} (5min)")
                score -= 40
            elif sr_5min < self.thresholds.success_rate_healthy:
                issues.append(f"Degraded: Success rate at {sr_5min:.1%} (5min)")
                score -= 20

            # Check latency
            if latency_p95 > self.thresholds.latency_p95_critical:
                issues.append(f"Critical: P95 latency at {latency_p95:.0f}ms")
                score -= 30
            elif latency_p95 > self.thresholds.latency_p95_healthy:
                issues.append(f"Degraded: P95 latency at {latency_p95:.0f}ms")
                score -= 15

            # Check consecutive failures
            if consecutive_failures >= self.thresholds.consecutive_failures_critical:
                issues.append(f"Critical: {consecutive_failures} consecutive failures")
                score -= 35

            # Check error count
            error_5min = int(stats_5min.get("failure", 0))
            error_1hr = int(stats_1hr.get("failure", 0))

            if error_1hr > self.thresholds.error_rate_critical:
                issues.append(f"Critical: {error_1hr} errors in last hour")
                score -= 25
            elif error_1hr > self.thresholds.error_rate_healthy:
                issues.append(f"Elevated: {error_1hr} errors in last hour")
                score -= 10

            # Determine status
            score = max(0, score)
            if score >= 80:
                status = HealthStatus.HEALTHY
            elif score >= 50:
                status = HealthStatus.DEGRADED
            else:
                status = HealthStatus.CRITICAL

            return HealthSnapshot(
                agent_id=agent_id,
                status=status,
                score=score,
                success_rate_5min=sr_5min,
                success_rate_1hr=sr_1hr,
                latency_p95_5min=latency_p95,
                error_count_5min=error_5min,
                error_count_1hr=error_1hr,
                executions_5min=int(stats_5min.get("total", 0)),
                executions_1hr=int(stats_1hr.get("total", 0)),
                consecutive_failures=consecutive_failures,
                last_success_at=last_success_at,
                calculated_at=datetime.utcnow(),
                issues=issues,
            )

        def detect_transition(
            self,
            previous: Optional[HealthStatus],
            current: HealthStatus,
        ) -> Optional[str]:
            """Detect and describe health status transitions."""
            if previous is None:
                return None

            if previous == current:
                return None

            if previous == HealthStatus.HEALTHY and current == HealthStatus.DEGRADED:
                return "degrading"
            elif previous == HealthStatus.HEALTHY and current == HealthStatus.CRITICAL:
                return "critical_from_healthy"
            elif previous == HealthStatus.DEGRADED and current == HealthStatus.CRITICAL:
                return "critical_from_degraded"
            elif previous == HealthStatus.CRITICAL and current == HealthStatus.DEGRADED:
                return "recovering"
            elif previous == HealthStatus.DEGRADED and current == HealthStatus.HEALTHY:
                return "recovered"
            elif previous == HealthStatus.CRITICAL and current == HealthStatus.HEALTHY:
                return "recovered_from_critical"

            return "changed"
    ```
  </action>
  <verify>
    - Health score calculated correctly
    - Status thresholds work
    - Transitions detected
    - Edge cases handled
  </verify>
  <done>Health status calculator with transitions</done>
</task>

<task id="4.3" type="auto" priority="critical">
  <name>Health Monitor Background Worker</name>
  <files>
    - src/meta_agent/monitoring/health_worker.py
  </files>
  <context>
    Background worker runs every 30 seconds, calculates health for all agents,
    updates database, and emits events on status changes.
  </context>
  <action>
    Create background worker:

    ```python
    # src/meta_agent/monitoring/health_worker.py
    import asyncio
    from datetime import datetime
    from typing import List, Optional, Callable, Awaitable
    import logging

    from .redis_client import RealTimeMetrics
    from .health_calculator import HealthCalculator, HealthSnapshot, HealthStatus
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class HealthMonitorWorker:
        def __init__(
            self,
            redis: RealTimeMetrics,
            database: Database,
            calculator: Optional[HealthCalculator] = None,
            check_interval: int = 30,  # seconds
        ):
            self.redis = redis
            self.db = database
            self.calculator = calculator or HealthCalculator()
            self.check_interval = check_interval
            self._running = False
            self._task: Optional[asyncio.Task] = None
            self._on_transition_callbacks: List[Callable[[str, str, HealthSnapshot], Awaitable[None]]] = []
            self._previous_states: dict[str, HealthStatus] = {}

        def on_transition(
            self,
            callback: Callable[[str, str, HealthSnapshot], Awaitable[None]]
        ) -> None:
            """Register callback for health status transitions."""
            self._on_transition_callbacks.append(callback)

        async def start(self) -> None:
            """Start the health monitoring loop."""
            self._running = True
            self._task = asyncio.create_task(self._run_loop())
            logger.info("Health monitor started")

        async def stop(self) -> None:
            """Stop the health monitoring loop."""
            self._running = False
            if self._task:
                self._task.cancel()
                try:
                    await self._task
                except asyncio.CancelledError:
                    pass
            logger.info("Health monitor stopped")

        async def _run_loop(self) -> None:
            """Main monitoring loop."""
            while self._running:
                try:
                    await self._check_all_agents()
                except Exception as e:
                    logger.error(f"Health check error: {e}")

                await asyncio.sleep(self.check_interval)

        async def _check_all_agents(self) -> None:
            """Check health of all registered agents."""
            # Get all active agents
            agents = await self.db.agents.list_active()

            # Check each agent
            for agent in agents:
                try:
                    snapshot = await self._check_agent(agent.id)
                    await self._update_health_record(snapshot)
                    await self._check_transition(agent.id, snapshot)
                except Exception as e:
                    logger.error(f"Error checking agent {agent.id}: {e}")

        async def _check_agent(self, agent_id: str) -> HealthSnapshot:
            """Calculate health for a single agent."""
            # Get real-time stats from Redis
            stats_5min = await self.redis.get_minute_stats(agent_id, minutes_back=5)
            stats_1hr = await self.redis.get_hour_stats(agent_id)
            latency_p95 = await self.redis.get_latency_percentile(agent_id)

            # Get consecutive failures from DB
            agent = await self.db.agents.get(agent_id)
            consecutive_failures = agent.consecutive_failures if agent else 0
            last_success = agent.last_success_at if agent else None

            # Calculate health
            return self.calculator.calculate_health(
                agent_id=agent_id,
                stats_5min=stats_5min,
                stats_1hr=stats_1hr,
                latency_p95=latency_p95,
                consecutive_failures=consecutive_failures,
                last_success_at=last_success,
            )

        async def _update_health_record(self, snapshot: HealthSnapshot) -> None:
            """Update agent_health_realtime table."""
            await self.db.execute(
                """
                INSERT INTO agent_health_realtime (
                    agent_id, status, health_score,
                    success_rate_5min, success_rate_1hr,
                    latency_p95_5min, error_count_5min, error_count_1hr,
                    executions_5min, executions_1hr,
                    consecutive_failures, issues, calculated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                )
                ON CONFLICT (agent_id) DO UPDATE SET
                    status = EXCLUDED.status,
                    health_score = EXCLUDED.health_score,
                    success_rate_5min = EXCLUDED.success_rate_5min,
                    success_rate_1hr = EXCLUDED.success_rate_1hr,
                    latency_p95_5min = EXCLUDED.latency_p95_5min,
                    error_count_5min = EXCLUDED.error_count_5min,
                    error_count_1hr = EXCLUDED.error_count_1hr,
                    executions_5min = EXCLUDED.executions_5min,
                    executions_1hr = EXCLUDED.executions_1hr,
                    consecutive_failures = EXCLUDED.consecutive_failures,
                    issues = EXCLUDED.issues,
                    calculated_at = EXCLUDED.calculated_at
                """,
                snapshot.agent_id,
                snapshot.status.value,
                snapshot.score,
                snapshot.success_rate_5min,
                snapshot.success_rate_1hr,
                snapshot.latency_p95_5min,
                snapshot.error_count_5min,
                snapshot.error_count_1hr,
                snapshot.executions_5min,
                snapshot.executions_1hr,
                snapshot.consecutive_failures,
                snapshot.issues,
                snapshot.calculated_at,
            )

        async def _check_transition(
            self,
            agent_id: str,
            snapshot: HealthSnapshot,
        ) -> None:
            """Check for status transitions and trigger callbacks."""
            previous = self._previous_states.get(agent_id)
            transition = self.calculator.detect_transition(previous, snapshot.status)

            if transition:
                logger.info(f"Agent {agent_id} transition: {transition}")
                for callback in self._on_transition_callbacks:
                    try:
                        await callback(agent_id, transition, snapshot)
                    except Exception as e:
                        logger.error(f"Transition callback error: {e}")

            self._previous_states[agent_id] = snapshot.status
    ```
  </action>
  <verify>
    - Worker starts and stops cleanly
    - Checks all agents periodically
    - Updates database correctly
    - Triggers transition callbacks
  </verify>
  <done>Health monitor background worker implemented</done>
</task>

<task id="4.4" type="auto" priority="high">
  <name>WebSocket Publisher for Dashboard</name>
  <files>
    - src/meta_agent/monitoring/websocket.py
  </files>
  <context>
    Dashboard needs real-time health updates via WebSocket.
    Publish health changes as they happen.
  </context>
  <action>
    Create WebSocket publisher:

    ```python
    # src/meta_agent/monitoring/websocket.py
    import asyncio
    import json
    from datetime import datetime
    from typing import Set, Dict, Any
    from fastapi import WebSocket, WebSocketDisconnect
    import logging

    from .health_calculator import HealthSnapshot

    logger = logging.getLogger(__name__)

    class HealthWebSocketManager:
        def __init__(self):
            self._connections: Set[WebSocket] = set()
            self._organization_connections: Dict[str, Set[WebSocket]] = {}
            self._lock = asyncio.Lock()

        async def connect(
            self,
            websocket: WebSocket,
            organization_id: str,
        ) -> None:
            """Accept a new WebSocket connection."""
            await websocket.accept()

            async with self._lock:
                self._connections.add(websocket)
                if organization_id not in self._organization_connections:
                    self._organization_connections[organization_id] = set()
                self._organization_connections[organization_id].add(websocket)

            logger.info(f"WebSocket connected for org {organization_id}")

        async def disconnect(
            self,
            websocket: WebSocket,
            organization_id: str,
        ) -> None:
            """Remove a WebSocket connection."""
            async with self._lock:
                self._connections.discard(websocket)
                if organization_id in self._organization_connections:
                    self._organization_connections[organization_id].discard(websocket)

            logger.info(f"WebSocket disconnected for org {organization_id}")

        async def broadcast_health_update(
            self,
            organization_id: str,
            snapshot: HealthSnapshot,
        ) -> None:
            """Broadcast health update to all connected clients for an org."""
            message = {
                "type": "health_update",
                "data": {
                    "agent_id": snapshot.agent_id,
                    "status": snapshot.status.value,
                    "score": snapshot.score,
                    "success_rate_5min": snapshot.success_rate_5min,
                    "latency_p95": snapshot.latency_p95_5min,
                    "executions_5min": snapshot.executions_5min,
                    "issues": snapshot.issues,
                    "timestamp": snapshot.calculated_at.isoformat(),
                }
            }

            await self._send_to_org(organization_id, message)

        async def broadcast_transition(
            self,
            organization_id: str,
            agent_id: str,
            transition: str,
            snapshot: HealthSnapshot,
        ) -> None:
            """Broadcast health transition event."""
            message = {
                "type": "health_transition",
                "data": {
                    "agent_id": agent_id,
                    "transition": transition,
                    "previous_status": None,  # Could track this
                    "new_status": snapshot.status.value,
                    "score": snapshot.score,
                    "issues": snapshot.issues,
                    "timestamp": datetime.utcnow().isoformat(),
                }
            }

            await self._send_to_org(organization_id, message)

        async def _send_to_org(
            self,
            organization_id: str,
            message: Dict[str, Any],
        ) -> None:
            """Send message to all connections for an organization."""
            connections = self._organization_connections.get(organization_id, set())
            dead_connections = set()

            for websocket in connections:
                try:
                    await websocket.send_json(message)
                except Exception as e:
                    logger.warning(f"Failed to send to websocket: {e}")
                    dead_connections.add(websocket)

            # Clean up dead connections
            if dead_connections:
                async with self._lock:
                    for ws in dead_connections:
                        connections.discard(ws)
                        self._connections.discard(ws)

    # FastAPI WebSocket endpoint
    ws_manager = HealthWebSocketManager()

    async def health_websocket_endpoint(
        websocket: WebSocket,
        organization_id: str,
    ):
        """WebSocket endpoint for real-time health updates."""
        await ws_manager.connect(websocket, organization_id)
        try:
            while True:
                # Keep connection alive, handle any client messages
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            await ws_manager.disconnect(websocket, organization_id)
    ```
  </action>
  <verify>
    - WebSocket connections work
    - Messages broadcast correctly
    - Dead connections cleaned up
    - Multi-tenant isolation works
  </verify>
  <done>WebSocket publisher for real-time updates</done>
</task>

<task id="4.5" type="auto" priority="high">
  <name>Integration with AgentLogger SDK</name>
  <files>
    - src/meta_agent/monitoring/log_processor.py
  </files>
  <context>
    When AgentLogger SDK sends logs, we need to update Redis counters
    and track consecutive failures.
  </context>
  <action>
    Create log processor:

    ```python
    # src/meta_agent/monitoring/log_processor.py
    from datetime import datetime
    from typing import List, Dict, Any
    import logging

    from .redis_client import RealTimeMetrics
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class LogProcessor:
        def __init__(
            self,
            redis: RealTimeMetrics,
            database: Database,
        ):
            self.redis = redis
            self.db = database

        async def process_log_batch(
            self,
            organization_id: str,
            logs: List[Dict[str, Any]],
        ) -> int:
            """Process a batch of logs from AgentLogger SDK."""
            processed = 0

            for log in logs:
                try:
                    await self._process_single_log(organization_id, log)
                    processed += 1
                except Exception as e:
                    logger.error(f"Error processing log: {e}")

            return processed

        async def _process_single_log(
            self,
            organization_id: str,
            log: Dict[str, Any],
        ) -> None:
            """Process a single log entry."""
            agent_id = log["agent_id"]
            action_type = log["action_type"]
            status = log.get("status", "success")
            latency_ms = log.get("latency_ms", 0)
            cost_usd = float(log.get("cost_usd", 0) or 0)
            timestamp = datetime.fromisoformat(log["timestamp"])

            # Update Redis counters
            is_success = status == "success"
            await self.redis.increment_execution(
                agent_id=agent_id,
                success=is_success,
                latency_ms=latency_ms,
                cost_usd=cost_usd,
                timestamp=timestamp,
            )

            # Update consecutive failures in DB
            if is_success:
                await self.db.execute(
                    """
                    UPDATE agent_registry
                    SET consecutive_failures = 0,
                        last_success_at = $2,
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    agent_id,
                    timestamp,
                )
            else:
                await self.db.execute(
                    """
                    UPDATE agent_registry
                    SET consecutive_failures = consecutive_failures + 1,
                        updated_at = NOW()
                    WHERE id = $1
                    """,
                    agent_id,
                )

            # Store log in database
            await self.db.execute(
                """
                INSERT INTO agent_execution_logs (
                    id, organization_id, agent_id, execution_id,
                    action_type, action_name, input_summary, output_summary,
                    status, error_message, latency_ms, token_count,
                    cost_usd, metadata, timestamp
                ) VALUES (
                    gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, $12, $13, $14
                )
                """,
                organization_id,
                agent_id,
                log["execution_id"],
                action_type,
                log.get("action_name"),
                log.get("input_summary"),
                log.get("output_summary"),
                status,
                log.get("error_message"),
                latency_ms,
                log.get("token_count"),
                cost_usd,
                log.get("metadata", {}),
                timestamp,
            )
    ```
  </action>
  <verify>
    - Logs processed correctly
    - Redis updated
    - Consecutive failures tracked
    - Database records created
  </verify>
  <done>Log processor with Redis integration</done>
</task>

<task id="4.6" type="auto" priority="medium">
  <name>Write Health Monitor Tests</name>
  <files>
    - tests/monitoring/test_health_calculator.py
    - tests/monitoring/test_redis_client.py
  </files>
  <context>
    Comprehensive tests for health monitoring components.
  </context>
  <action>
    Create test files:

    ```python
    # tests/monitoring/test_health_calculator.py
    import pytest
    from datetime import datetime
    from meta_agent.monitoring.health_calculator import (
        HealthCalculator, HealthStatus, HealthThresholds
    )

    @pytest.fixture
    def calculator():
        return HealthCalculator()

    def test_healthy_status(calculator):
        snapshot = calculator.calculate_health(
            agent_id="test",
            stats_5min={"success_rate": 0.98, "total": 100, "failure": 2},
            stats_1hr={"success_rate": 0.97, "total": 500, "failure": 15},
            latency_p95=1500.0,
            consecutive_failures=0,
            last_success_at=datetime.utcnow(),
        )

        assert snapshot.status == HealthStatus.HEALTHY
        assert snapshot.score >= 80

    def test_degraded_status(calculator):
        snapshot = calculator.calculate_health(
            agent_id="test",
            stats_5min={"success_rate": 0.88, "total": 100, "failure": 12},
            stats_1hr={"success_rate": 0.90, "total": 500, "failure": 50},
            latency_p95=5000.0,
            consecutive_failures=2,
            last_success_at=datetime.utcnow(),
        )

        assert snapshot.status == HealthStatus.DEGRADED
        assert 50 <= snapshot.score < 80

    def test_critical_status(calculator):
        snapshot = calculator.calculate_health(
            agent_id="test",
            stats_5min={"success_rate": 0.60, "total": 100, "failure": 40},
            stats_1hr={"success_rate": 0.70, "total": 500, "failure": 150},
            latency_p95=15000.0,
            consecutive_failures=8,
            last_success_at=None,
        )

        assert snapshot.status == HealthStatus.CRITICAL
        assert snapshot.score < 50
        assert len(snapshot.issues) > 0

    def test_transition_detection(calculator):
        assert calculator.detect_transition(
            HealthStatus.HEALTHY, HealthStatus.DEGRADED
        ) == "degrading"

        assert calculator.detect_transition(
            HealthStatus.CRITICAL, HealthStatus.HEALTHY
        ) == "recovered_from_critical"

        assert calculator.detect_transition(
            HealthStatus.HEALTHY, HealthStatus.HEALTHY
        ) is None

    def test_custom_thresholds():
        thresholds = HealthThresholds(
            success_rate_healthy=0.99,
            success_rate_critical=0.90,
        )
        calculator = HealthCalculator(thresholds)

        snapshot = calculator.calculate_health(
            agent_id="test",
            stats_5min={"success_rate": 0.95, "total": 100, "failure": 5},
            stats_1hr={"success_rate": 0.95, "total": 500, "failure": 25},
            latency_p95=1000.0,
            consecutive_failures=0,
            last_success_at=datetime.utcnow(),
        )

        # With stricter thresholds, 95% is degraded
        assert snapshot.status == HealthStatus.DEGRADED
    ```
  </action>
  <verify>
    - All tests pass
    - Edge cases covered
    - Thresholds tested
  </verify>
  <done>Health monitor tests implemented</done>
</task>

---

## Phase Exit Criteria

- [ ] Redis client fully functional
- [ ] Rolling window calculations accurate
- [ ] Health status determination working
- [ ] Status transitions detected
- [ ] Background worker stable
- [ ] WebSocket updates working
- [ ] Integration with SDK complete
- [ ] Performance target met (10K/min)
- [ ] Tests passing

## Files Created

- `src/meta_agent/monitoring/__init__.py`
- `src/meta_agent/monitoring/redis_client.py`
- `src/meta_agent/monitoring/health_calculator.py`
- `src/meta_agent/monitoring/health_worker.py`
- `src/meta_agent/monitoring/websocket.py`
- `src/meta_agent/monitoring/log_processor.py`
- `tests/monitoring/test_health_calculator.py`
- `tests/monitoring/test_redis_client.py`
