# Phase 11: Canary Deployment System

**Duration**: 4 days | **Complexity**: High | **Dependencies**: Phase 10

## Phase Overview

Deploy new agent versions to a subset of traffic before full rollout. Gradual percentage-based rollouts with automatic rollback on degradation.

## Success Criteria

- [ ] Canary configuration (percentage, duration, metrics)
- [ ] Traffic splitting logic
- [ ] Canary metrics collection
- [ ] Automatic promotion/rollback decisions
- [ ] Rollout history tracking
- [ ] Integration with circuit breaker
- [ ] Dashboard visibility

---

## Tasks

<task id="11.1" type="auto" priority="critical">
  <name>Canary Deployment Models</name>
  <files>
    - src/meta_agent/canary/models.py
    - src/meta_agent/canary/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/canary/models.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime
    from typing import Optional, Dict, List
    from decimal import Decimal

    class CanaryStatus(str, Enum):
        PENDING = "pending"
        RUNNING = "running"
        PROMOTED = "promoted"
        ROLLED_BACK = "rolled_back"
        PAUSED = "paused"

    class RolloutStage(str, Enum):
        INITIAL = "initial"       # 1-5%
        EARLY = "early"           # 10-25%
        MIDPOINT = "midpoint"     # 50%
        LATE = "late"             # 75%
        FULL = "full"             # 100%

    @dataclass
    class CanaryConfig:
        id: str
        organization_id: str
        agent_id: str
        baseline_version: str
        canary_version: str

        # Traffic settings
        initial_percentage: float = 5.0
        increment_percentage: float = 10.0
        max_percentage: float = 100.0
        current_percentage: float = 0.0

        # Timing
        stage_duration_minutes: int = 30
        min_sample_size: int = 100

        # Thresholds for auto-decision
        success_rate_threshold: float = 0.95  # Canary must be >= 95% of baseline
        latency_threshold_pct: float = 1.10   # Canary must be <= 110% of baseline
        error_rate_threshold: float = 0.02    # Max 2% error rate

        # State
        status: CanaryStatus = CanaryStatus.PENDING
        current_stage: RolloutStage = RolloutStage.INITIAL
        created_at: datetime = field(default_factory=datetime.utcnow)
        started_at: Optional[datetime] = None
        completed_at: Optional[datetime] = None

    @dataclass
    class CanaryMetrics:
        canary_id: str
        timestamp: datetime
        stage: RolloutStage

        # Baseline metrics
        baseline_requests: int
        baseline_success_rate: float
        baseline_latency_p95: int
        baseline_error_rate: float

        # Canary metrics
        canary_requests: int
        canary_success_rate: float
        canary_latency_p95: int
        canary_error_rate: float

        # Comparison
        success_rate_ratio: float  # canary / baseline
        latency_ratio: float       # canary / baseline
        is_healthy: bool

    @dataclass
    class CanaryDecision:
        canary_id: str
        timestamp: datetime
        decision: str  # "promote", "rollback", "continue", "pause"
        reason: str
        metrics_snapshot: Dict
        auto_generated: bool = True
    ```
  </action>
  <verify>
    - All models defined
    - Enums comprehensive
    - Thresholds configurable
  </verify>
  <done>Canary deployment models</done>
</task>

<task id="11.2" type="auto" priority="critical">
  <name>Traffic Router</name>
  <files>
    - src/meta_agent/canary/router.py
  </files>
  <action>
    ```python
    # src/meta_agent/canary/router.py
    import hashlib
    import random
    from typing import Optional, Tuple
    from datetime import datetime
    import logging

    from .models import CanaryConfig, CanaryStatus
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class TrafficRouter:
        """Route traffic between baseline and canary versions."""

        def __init__(self, database: Database):
            self.db = database
            self._cache: Dict[str, CanaryConfig] = {}
            self._cache_ttl = 30  # seconds
            self._last_cache_update: Dict[str, datetime] = {}

        async def get_version(
            self,
            agent_id: str,
            request_id: str,
            user_id: Optional[str] = None,
        ) -> Tuple[str, bool]:
            """
            Determine which version to route to.
            Returns (version, is_canary).
            """
            canary = await self._get_active_canary(agent_id)

            if not canary:
                # No active canary, use baseline
                baseline = await self._get_baseline_version(agent_id)
                return baseline, False

            # Determine routing based on percentage
            if self._should_route_to_canary(
                canary, request_id, user_id
            ):
                return canary.canary_version, True

            return canary.baseline_version, False

        async def _get_active_canary(
            self,
            agent_id: str,
        ) -> Optional[CanaryConfig]:
            """Get active canary for agent, with caching."""
            cache_key = f"canary:{agent_id}"

            # Check cache
            if cache_key in self._cache:
                last_update = self._last_cache_update.get(cache_key)
                if last_update and (datetime.utcnow() - last_update).seconds < self._cache_ttl:
                    return self._cache[cache_key]

            # Fetch from database
            row = await self.db.fetch_one("""
                SELECT * FROM canary_deployments
                WHERE agent_id = $1 AND status = 'running'
                ORDER BY created_at DESC LIMIT 1
            """, agent_id)

            if row:
                canary = CanaryConfig(**dict(row))
                self._cache[cache_key] = canary
                self._last_cache_update[cache_key] = datetime.utcnow()
                return canary

            return None

        async def _get_baseline_version(self, agent_id: str) -> str:
            """Get current baseline version for agent."""
            row = await self.db.fetch_one("""
                SELECT version FROM agent_registry
                WHERE id = $1
            """, agent_id)
            return row['version'] if row else "1.0.0"

        def _should_route_to_canary(
            self,
            canary: CanaryConfig,
            request_id: str,
            user_id: Optional[str] = None,
        ) -> bool:
            """
            Determine if request should go to canary.
            Uses consistent hashing for sticky sessions.
            """
            # Use user_id for sticky sessions if available
            hash_input = user_id or request_id

            # Consistent hash to get deterministic routing
            hash_bytes = hashlib.sha256(
                f"{canary.id}:{hash_input}".encode()
            ).digest()
            hash_value = int.from_bytes(hash_bytes[:4], 'big')
            percentage = (hash_value % 10000) / 100  # 0.00 to 99.99

            return percentage < canary.current_percentage

        def invalidate_cache(self, agent_id: str) -> None:
            """Invalidate cache for agent."""
            cache_key = f"canary:{agent_id}"
            self._cache.pop(cache_key, None)
            self._last_cache_update.pop(cache_key, None)
    ```
  </action>
  <verify>
    - Consistent hashing works
    - Cache invalidation works
    - Sticky sessions for users
  </verify>
  <done>Traffic router with consistent hashing</done>
</task>

<task id="11.3" type="auto" priority="critical">
  <name>Canary Metrics Collector</name>
  <files>
    - src/meta_agent/canary/metrics.py
  </files>
  <action>
    ```python
    # src/meta_agent/canary/metrics.py
    from datetime import datetime, timedelta
    from typing import Optional
    import logging

    from .models import CanaryConfig, CanaryMetrics, RolloutStage
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class CanaryMetricsCollector:
        """Collect and compare metrics for canary deployments."""

        def __init__(self, database: Database):
            self.db = database

        async def collect_metrics(
            self,
            canary: CanaryConfig,
            window_minutes: int = 10,
        ) -> CanaryMetrics:
            """Collect metrics for both baseline and canary."""
            now = datetime.utcnow()
            window_start = now - timedelta(minutes=window_minutes)

            # Get baseline metrics
            baseline = await self._get_version_metrics(
                canary.agent_id,
                canary.baseline_version,
                window_start,
                now,
            )

            # Get canary metrics
            canary_metrics = await self._get_version_metrics(
                canary.agent_id,
                canary.canary_version,
                window_start,
                now,
            )

            # Calculate ratios
            success_ratio = (
                canary_metrics['success_rate'] / baseline['success_rate']
                if baseline['success_rate'] > 0 else 1.0
            )
            latency_ratio = (
                canary_metrics['latency_p95'] / baseline['latency_p95']
                if baseline['latency_p95'] > 0 else 1.0
            )

            # Determine health
            is_healthy = (
                success_ratio >= canary.success_rate_threshold and
                latency_ratio <= canary.latency_threshold_pct and
                canary_metrics['error_rate'] <= canary.error_rate_threshold
            )

            return CanaryMetrics(
                canary_id=canary.id,
                timestamp=now,
                stage=canary.current_stage,
                baseline_requests=baseline['total'],
                baseline_success_rate=baseline['success_rate'],
                baseline_latency_p95=baseline['latency_p95'],
                baseline_error_rate=baseline['error_rate'],
                canary_requests=canary_metrics['total'],
                canary_success_rate=canary_metrics['success_rate'],
                canary_latency_p95=canary_metrics['latency_p95'],
                canary_error_rate=canary_metrics['error_rate'],
                success_rate_ratio=success_ratio,
                latency_ratio=latency_ratio,
                is_healthy=is_healthy,
            )

        async def _get_version_metrics(
            self,
            agent_id: str,
            version: str,
            start: datetime,
            end: datetime,
        ) -> dict:
            """Get aggregated metrics for a specific version."""
            row = await self.db.fetch_one("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'success') as success,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    COALESCE(
                        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms),
                        0
                    )::int as latency_p95
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND version = $2
                  AND timestamp BETWEEN $3 AND $4
            """, agent_id, version, start, end)

            total = row['total'] or 0
            success = row['success'] or 0
            failed = row['failed'] or 0

            return {
                'total': total,
                'success_rate': success / total if total > 0 else 1.0,
                'error_rate': failed / total if total > 0 else 0.0,
                'latency_p95': row['latency_p95'] or 0,
            }

        async def store_metrics(self, metrics: CanaryMetrics) -> None:
            """Store metrics snapshot."""
            await self.db.execute("""
                INSERT INTO canary_metrics (
                    canary_id, timestamp, stage,
                    baseline_requests, baseline_success_rate,
                    baseline_latency_p95, baseline_error_rate,
                    canary_requests, canary_success_rate,
                    canary_latency_p95, canary_error_rate,
                    success_rate_ratio, latency_ratio, is_healthy
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
                )
            """,
                metrics.canary_id, metrics.timestamp, metrics.stage.value,
                metrics.baseline_requests, metrics.baseline_success_rate,
                metrics.baseline_latency_p95, metrics.baseline_error_rate,
                metrics.canary_requests, metrics.canary_success_rate,
                metrics.canary_latency_p95, metrics.canary_error_rate,
                metrics.success_rate_ratio, metrics.latency_ratio,
                metrics.is_healthy
            )

        async def has_sufficient_samples(
            self,
            canary: CanaryConfig,
        ) -> bool:
            """Check if canary has enough samples for decision."""
            row = await self.db.fetch_one("""
                SELECT COUNT(*) as count
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND version = $2
                  AND timestamp >= $3
            """, canary.agent_id, canary.canary_version, canary.started_at)

            return (row['count'] or 0) >= canary.min_sample_size
    ```
  </action>
  <verify>
    - Metrics collected correctly
    - Ratios calculated properly
    - Health determination accurate
  </verify>
  <done>Canary metrics collector</done>
</task>

<task id="11.4" type="auto" priority="high">
  <name>Canary Controller</name>
  <files>
    - src/meta_agent/canary/controller.py
  </files>
  <action>
    ```python
    # src/meta_agent/canary/controller.py
    from datetime import datetime, timedelta
    from typing import Optional
    import logging
    import asyncio

    from .models import (
        CanaryConfig, CanaryStatus, CanaryMetrics,
        CanaryDecision, RolloutStage
    )
    from .metrics import CanaryMetricsCollector
    from .router import TrafficRouter
    from ..db.client import Database
    from ..alerting.manager import AlertManager

    logger = logging.getLogger(__name__)

    STAGE_PERCENTAGES = {
        RolloutStage.INITIAL: 5.0,
        RolloutStage.EARLY: 25.0,
        RolloutStage.MIDPOINT: 50.0,
        RolloutStage.LATE: 75.0,
        RolloutStage.FULL: 100.0,
    }

    class CanaryController:
        """Control canary deployment lifecycle."""

        def __init__(
            self,
            database: Database,
            metrics_collector: CanaryMetricsCollector,
            router: TrafficRouter,
            alert_manager: Optional[AlertManager] = None,
        ):
            self.db = database
            self.metrics = metrics_collector
            self.router = router
            self.alerts = alert_manager

        async def start_canary(self, canary_id: str) -> CanaryConfig:
            """Start a canary deployment."""
            canary = await self._get_canary(canary_id)

            if canary.status != CanaryStatus.PENDING:
                raise ValueError(f"Canary {canary_id} not in pending state")

            # Update state
            canary.status = CanaryStatus.RUNNING
            canary.started_at = datetime.utcnow()
            canary.current_percentage = canary.initial_percentage
            canary.current_stage = RolloutStage.INITIAL

            await self._update_canary(canary)
            self.router.invalidate_cache(canary.agent_id)

            logger.info(f"Started canary {canary_id} at {canary.initial_percentage}%")
            return canary

        async def evaluate_and_progress(
            self,
            canary_id: str,
        ) -> CanaryDecision:
            """Evaluate canary health and decide next action."""
            canary = await self._get_canary(canary_id)

            if canary.status != CanaryStatus.RUNNING:
                raise ValueError(f"Canary {canary_id} not running")

            # Collect current metrics
            metrics = await self.metrics.collect_metrics(canary)
            await self.metrics.store_metrics(metrics)

            # Check sample size
            has_samples = await self.metrics.has_sufficient_samples(canary)

            # Make decision
            decision = self._make_decision(canary, metrics, has_samples)
            await self._store_decision(decision)

            # Execute decision
            await self._execute_decision(canary, decision)

            return decision

        def _make_decision(
            self,
            canary: CanaryConfig,
            metrics: CanaryMetrics,
            has_samples: bool,
        ) -> CanaryDecision:
            """Determine what to do based on metrics."""
            now = datetime.utcnow()

            # Not enough samples yet
            if not has_samples:
                return CanaryDecision(
                    canary_id=canary.id,
                    timestamp=now,
                    decision="continue",
                    reason=f"Waiting for {canary.min_sample_size} samples",
                    metrics_snapshot=self._metrics_to_dict(metrics),
                )

            # Check if canary is unhealthy
            if not metrics.is_healthy:
                return CanaryDecision(
                    canary_id=canary.id,
                    timestamp=now,
                    decision="rollback",
                    reason=self._get_unhealthy_reason(canary, metrics),
                    metrics_snapshot=self._metrics_to_dict(metrics),
                )

            # Check if we can progress to next stage
            stage_start = canary.started_at
            if canary.current_stage != RolloutStage.INITIAL:
                # Get last stage transition time
                last_decision = asyncio.get_event_loop().run_until_complete(
                    self._get_last_promotion_decision(canary.id)
                )
                if last_decision:
                    stage_start = last_decision.timestamp

            stage_elapsed = (now - stage_start).total_seconds() / 60

            if stage_elapsed < canary.stage_duration_minutes:
                return CanaryDecision(
                    canary_id=canary.id,
                    timestamp=now,
                    decision="continue",
                    reason=f"Stage {canary.current_stage.value} in progress ({stage_elapsed:.0f}/{canary.stage_duration_minutes} min)",
                    metrics_snapshot=self._metrics_to_dict(metrics),
                )

            # Ready to progress
            if canary.current_stage == RolloutStage.FULL:
                return CanaryDecision(
                    canary_id=canary.id,
                    timestamp=now,
                    decision="promote",
                    reason="Full rollout successful, promoting canary",
                    metrics_snapshot=self._metrics_to_dict(metrics),
                )

            return CanaryDecision(
                canary_id=canary.id,
                timestamp=now,
                decision="progress",
                reason=f"Stage {canary.current_stage.value} healthy, progressing",
                metrics_snapshot=self._metrics_to_dict(metrics),
            )

        async def _execute_decision(
            self,
            canary: CanaryConfig,
            decision: CanaryDecision,
        ) -> None:
            """Execute the decision."""
            if decision.decision == "rollback":
                await self._rollback(canary, decision.reason)
            elif decision.decision == "promote":
                await self._promote(canary)
            elif decision.decision == "progress":
                await self._progress_stage(canary)
            # "continue" requires no action

        async def _rollback(
            self,
            canary: CanaryConfig,
            reason: str,
        ) -> None:
            """Rollback canary deployment."""
            canary.status = CanaryStatus.ROLLED_BACK
            canary.completed_at = datetime.utcnow()
            canary.current_percentage = 0.0

            await self._update_canary(canary)
            self.router.invalidate_cache(canary.agent_id)

            # Alert
            if self.alerts:
                await self.alerts.send_notification(
                    channel="slack",
                    message=f"🔴 Canary {canary.canary_version} rolled back: {reason}",
                    organization_id=canary.organization_id,
                )

            logger.warning(f"Rolled back canary {canary.id}: {reason}")

        async def _promote(self, canary: CanaryConfig) -> None:
            """Promote canary to baseline."""
            canary.status = CanaryStatus.PROMOTED
            canary.completed_at = datetime.utcnow()
            canary.current_percentage = 100.0

            # Update agent version
            await self.db.execute("""
                UPDATE agent_registry
                SET version = $1, updated_at = NOW()
                WHERE id = $2
            """, canary.canary_version, canary.agent_id)

            await self._update_canary(canary)
            self.router.invalidate_cache(canary.agent_id)

            if self.alerts:
                await self.alerts.send_notification(
                    channel="slack",
                    message=f"🟢 Canary {canary.canary_version} promoted to production",
                    organization_id=canary.organization_id,
                )

            logger.info(f"Promoted canary {canary.id}")

        async def _progress_stage(self, canary: CanaryConfig) -> None:
            """Progress to next stage."""
            stages = list(RolloutStage)
            current_idx = stages.index(canary.current_stage)

            if current_idx < len(stages) - 1:
                canary.current_stage = stages[current_idx + 1]
                canary.current_percentage = STAGE_PERCENTAGES[canary.current_stage]

                await self._update_canary(canary)
                self.router.invalidate_cache(canary.agent_id)

                logger.info(
                    f"Canary {canary.id} progressed to "
                    f"{canary.current_stage.value} ({canary.current_percentage}%)"
                )

        def _get_unhealthy_reason(
            self,
            canary: CanaryConfig,
            metrics: CanaryMetrics,
        ) -> str:
            """Generate reason for unhealthy canary."""
            reasons = []

            if metrics.success_rate_ratio < canary.success_rate_threshold:
                reasons.append(
                    f"Success rate too low ({metrics.success_rate_ratio:.2%} of baseline)"
                )

            if metrics.latency_ratio > canary.latency_threshold_pct:
                reasons.append(
                    f"Latency too high ({metrics.latency_ratio:.2%} of baseline)"
                )

            if metrics.canary_error_rate > canary.error_rate_threshold:
                reasons.append(
                    f"Error rate exceeded ({metrics.canary_error_rate:.2%})"
                )

            return "; ".join(reasons) or "Unknown health issue"

        def _metrics_to_dict(self, metrics: CanaryMetrics) -> dict:
            """Convert metrics to dict for storage."""
            return {
                "baseline_requests": metrics.baseline_requests,
                "baseline_success_rate": metrics.baseline_success_rate,
                "canary_requests": metrics.canary_requests,
                "canary_success_rate": metrics.canary_success_rate,
                "success_rate_ratio": metrics.success_rate_ratio,
                "latency_ratio": metrics.latency_ratio,
            }

        async def _get_canary(self, canary_id: str) -> CanaryConfig:
            """Fetch canary from database."""
            row = await self.db.fetch_one(
                "SELECT * FROM canary_deployments WHERE id = $1",
                canary_id
            )
            if not row:
                raise ValueError(f"Canary {canary_id} not found")
            return CanaryConfig(**dict(row))

        async def _update_canary(self, canary: CanaryConfig) -> None:
            """Update canary in database."""
            await self.db.execute("""
                UPDATE canary_deployments SET
                    status = $2, current_stage = $3, current_percentage = $4,
                    started_at = $5, completed_at = $6, updated_at = NOW()
                WHERE id = $1
            """,
                canary.id, canary.status.value, canary.current_stage.value,
                canary.current_percentage, canary.started_at, canary.completed_at
            )

        async def _store_decision(self, decision: CanaryDecision) -> None:
            """Store decision in database."""
            await self.db.execute("""
                INSERT INTO canary_decisions (
                    canary_id, timestamp, decision, reason,
                    metrics_snapshot, auto_generated
                ) VALUES ($1, $2, $3, $4, $5, $6)
            """,
                decision.canary_id, decision.timestamp, decision.decision,
                decision.reason, decision.metrics_snapshot, decision.auto_generated
            )

        async def _get_last_promotion_decision(
            self,
            canary_id: str,
        ) -> Optional[CanaryDecision]:
            """Get last progress/promote decision."""
            row = await self.db.fetch_one("""
                SELECT * FROM canary_decisions
                WHERE canary_id = $1 AND decision IN ('progress', 'promote')
                ORDER BY timestamp DESC LIMIT 1
            """, canary_id)
            return CanaryDecision(**dict(row)) if row else None
    ```
  </action>
  <verify>
    - Stage progression works
    - Rollback triggers correctly
    - Promotion updates agent version
  </verify>
  <done>Canary controller with lifecycle management</done>
</task>

<task id="11.5" type="auto" priority="medium">
  <name>Canary API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/canary.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/canary.py
    from fastapi import APIRouter, Depends, HTTPException
    from typing import List, Optional
    from pydantic import BaseModel
    from uuid import uuid4

    router = APIRouter(prefix="/api/v1/canary", tags=["canary"])

    class CanaryCreateRequest(BaseModel):
        agent_id: str
        canary_version: str
        initial_percentage: float = 5.0
        stage_duration_minutes: int = 30
        min_sample_size: int = 100
        success_rate_threshold: float = 0.95
        latency_threshold_pct: float = 1.10

    class CanaryResponse(BaseModel):
        id: str
        agent_id: str
        baseline_version: str
        canary_version: str
        status: str
        current_stage: str
        current_percentage: float

    class DecisionResponse(BaseModel):
        decision: str
        reason: str
        timestamp: str

    @router.post("/", response_model=CanaryResponse)
    async def create_canary(
        request: CanaryCreateRequest,
        db = Depends(get_database),
        user = Depends(get_current_user),
    ):
        """Create a new canary deployment."""
        # Get current baseline version
        agent = await db.fetch_one(
            "SELECT version FROM agent_registry WHERE id = $1",
            request.agent_id
        )
        if not agent:
            raise HTTPException(404, "Agent not found")

        canary_id = str(uuid4())
        await db.execute("""
            INSERT INTO canary_deployments (
                id, organization_id, agent_id, baseline_version,
                canary_version, initial_percentage, stage_duration_minutes,
                min_sample_size, success_rate_threshold, latency_threshold_pct,
                status, current_stage, current_percentage
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', 'initial', 0
            )
        """,
            canary_id, user.organization_id, request.agent_id,
            agent['version'], request.canary_version,
            request.initial_percentage, request.stage_duration_minutes,
            request.min_sample_size, request.success_rate_threshold,
            request.latency_threshold_pct
        )

        return {
            "id": canary_id,
            "agent_id": request.agent_id,
            "baseline_version": agent['version'],
            "canary_version": request.canary_version,
            "status": "pending",
            "current_stage": "initial",
            "current_percentage": 0,
        }

    @router.post("/{canary_id}/start", response_model=CanaryResponse)
    async def start_canary(
        canary_id: str,
        controller = Depends(get_canary_controller),
    ):
        """Start a pending canary deployment."""
        canary = await controller.start_canary(canary_id)
        return canary

    @router.post("/{canary_id}/evaluate", response_model=DecisionResponse)
    async def evaluate_canary(
        canary_id: str,
        controller = Depends(get_canary_controller),
    ):
        """Evaluate canary and potentially progress."""
        decision = await controller.evaluate_and_progress(canary_id)
        return {
            "decision": decision.decision,
            "reason": decision.reason,
            "timestamp": decision.timestamp.isoformat(),
        }

    @router.post("/{canary_id}/rollback")
    async def rollback_canary(
        canary_id: str,
        reason: str = "Manual rollback",
        controller = Depends(get_canary_controller),
    ):
        """Manually rollback a canary."""
        canary = await controller._get_canary(canary_id)
        await controller._rollback(canary, reason)
        return {"status": "rolled_back"}

    @router.get("/{agent_id}/active", response_model=Optional[CanaryResponse])
    async def get_active_canary(
        agent_id: str,
        db = Depends(get_database),
    ):
        """Get active canary for an agent."""
        row = await db.fetch_one("""
            SELECT * FROM canary_deployments
            WHERE agent_id = $1 AND status = 'running'
        """, agent_id)
        return dict(row) if row else None

    @router.get("/{canary_id}/history", response_model=List[DecisionResponse])
    async def get_canary_history(
        canary_id: str,
        db = Depends(get_database),
    ):
        """Get decision history for a canary."""
        rows = await db.fetch_all("""
            SELECT decision, reason, timestamp
            FROM canary_decisions
            WHERE canary_id = $1
            ORDER BY timestamp DESC
            LIMIT 50
        """, canary_id)
        return [dict(r) for r in rows]
    ```
  </action>
  <verify>
    - Create canary works
    - Start/evaluate works
    - Manual rollback works
  </verify>
  <done>Canary API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] Traffic routing with consistent hashing
- [ ] Stage-based progression (5% → 25% → 50% → 75% → 100%)
- [ ] Automatic rollback on degradation
- [ ] Automatic promotion on success
- [ ] Metrics comparison working
- [ ] Cache invalidation on state changes
- [ ] API endpoints functional

## Files Created

- `src/meta_agent/canary/__init__.py`
- `src/meta_agent/canary/models.py`
- `src/meta_agent/canary/router.py`
- `src/meta_agent/canary/metrics.py`
- `src/meta_agent/canary/controller.py`
- `src/meta_agent/api/routes/canary.py`
