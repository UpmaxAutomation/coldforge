# Phase 8: SLA Monitoring

**Duration**: 3 days | **Complexity**: Medium | **Dependencies**: Phase 7

## Phase Overview

Track SLA compliance for all agents. Define SLA targets, monitor compliance, detect breaches, and generate reports.

## Success Criteria

- [ ] SLA definition CRUD
- [ ] SLA compliance calculation
- [ ] Breach detection and alerting
- [ ] Compliance history tracking
- [ ] SLA reports (daily/weekly/monthly)
- [ ] Proactive breach warnings (80% threshold)
- [ ] Clear breach attribution

---

## Tasks

<task id="8.1" type="auto" priority="critical">
  <name>SLA Definition Models</name>
  <files>
    - src/meta_agent/sla/models.py
    - src/meta_agent/sla/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/sla/models.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime, date
    from typing import Optional, List
    from decimal import Decimal

    class SLAMetric(str, Enum):
        SUCCESS_RATE = "success_rate"
        LATENCY_P95 = "latency_p95"
        LATENCY_P99 = "latency_p99"
        LATENCY_AVG = "latency_avg"
        AVAILABILITY = "availability"
        COST_PER_EXECUTION = "cost_per_execution"
        ERROR_RATE = "error_rate"

    class SLAComparisonOp(str, Enum):
        GREATER_THAN = "gt"
        GREATER_EQUAL = "gte"
        LESS_THAN = "lt"
        LESS_EQUAL = "lte"
        EQUAL = "eq"

    class SLAPeriod(str, Enum):
        DAILY = "daily"
        WEEKLY = "weekly"
        MONTHLY = "monthly"

    @dataclass
    class SLADefinition:
        id: str
        organization_id: str
        agent_id: str
        name: str
        metric: SLAMetric
        comparison: SLAComparisonOp
        target_value: Decimal
        period: SLAPeriod
        warning_threshold_pct: float = 80.0  # Warn at 80% of target
        is_active: bool = True
        created_at: datetime = field(default_factory=datetime.utcnow)

    @dataclass
    class SLACompliance:
        id: str
        sla_id: str
        agent_id: str
        period_start: date
        period_end: date
        target_value: Decimal
        actual_value: Decimal
        is_compliant: bool
        compliance_pct: float
        breach_count: int
        breach_details: List[dict]
        calculated_at: datetime
    ```
  </action>
  <verify>
    - All models defined
    - Enums comprehensive
    - Compliance tracking complete
  </verify>
  <done>SLA definition models</done>
</task>

<task id="8.2" type="auto" priority="critical">
  <name>SLA Compliance Calculator</name>
  <files>
    - src/meta_agent/sla/calculator.py
  </files>
  <action>
    ```python
    # src/meta_agent/sla/calculator.py
    from datetime import date, timedelta
    from decimal import Decimal
    from typing import Optional

    from .models import (
        SLADefinition, SLACompliance, SLAMetric,
        SLAComparisonOp, SLAPeriod
    )
    from ..db.client import Database

    class SLACalculator:
        def __init__(self, database: Database):
            self.db = database

        async def calculate_compliance(
            self,
            sla: SLADefinition,
            period_start: date,
            period_end: date,
        ) -> SLACompliance:
            """Calculate SLA compliance for a period."""
            # Get actual value based on metric
            actual = await self._get_metric_value(
                sla.agent_id, sla.metric, period_start, period_end
            )

            # Check compliance
            is_compliant = self._check_compliance(
                actual, sla.target_value, sla.comparison
            )

            # Calculate compliance percentage
            compliance_pct = self._calculate_compliance_pct(
                actual, sla.target_value, sla.metric, sla.comparison
            )

            # Get breach details
            breach_details = await self._get_breach_details(
                sla.agent_id, sla.metric, sla.target_value,
                period_start, period_end
            )

            return SLACompliance(
                id=str(uuid4()),
                sla_id=sla.id,
                agent_id=sla.agent_id,
                period_start=period_start,
                period_end=period_end,
                target_value=sla.target_value,
                actual_value=Decimal(str(actual)),
                is_compliant=is_compliant,
                compliance_pct=compliance_pct,
                breach_count=len(breach_details),
                breach_details=breach_details,
                calculated_at=datetime.utcnow(),
            )

        async def _get_metric_value(
            self,
            agent_id: str,
            metric: SLAMetric,
            start: date,
            end: date,
        ) -> float:
            """Get metric value from aggregated data."""
            query_map = {
                SLAMetric.SUCCESS_RATE: """
                    SELECT AVG(success_rate) as value
                    FROM agent_performance_metrics
                    WHERE agent_id = $1 AND metric_date BETWEEN $2 AND $3
                """,
                SLAMetric.LATENCY_P95: """
                    SELECT AVG(p95_latency_ms) as value
                    FROM agent_performance_metrics
                    WHERE agent_id = $1 AND metric_date BETWEEN $2 AND $3
                """,
                SLAMetric.LATENCY_AVG: """
                    SELECT AVG(avg_latency_ms) as value
                    FROM agent_performance_metrics
                    WHERE agent_id = $1 AND metric_date BETWEEN $2 AND $3
                """,
                SLAMetric.COST_PER_EXECUTION: """
                    SELECT AVG(avg_cost_per_execution) as value
                    FROM agent_performance_metrics
                    WHERE agent_id = $1 AND metric_date BETWEEN $2 AND $3
                """,
            }

            query = query_map.get(metric)
            if not query:
                raise ValueError(f"Unsupported metric: {metric}")

            row = await self.db.fetch_one(query, agent_id, start, end)
            return row['value'] or 0.0

        def _check_compliance(
            self,
            actual: float,
            target: Decimal,
            comparison: SLAComparisonOp,
        ) -> bool:
            """Check if actual value meets target."""
            target_f = float(target)
            if comparison == SLAComparisonOp.GREATER_THAN:
                return actual > target_f
            elif comparison == SLAComparisonOp.GREATER_EQUAL:
                return actual >= target_f
            elif comparison == SLAComparisonOp.LESS_THAN:
                return actual < target_f
            elif comparison == SLAComparisonOp.LESS_EQUAL:
                return actual <= target_f
            elif comparison == SLAComparisonOp.EQUAL:
                return abs(actual - target_f) < 0.001
            return False

        def _calculate_compliance_pct(
            self,
            actual: float,
            target: Decimal,
            metric: SLAMetric,
            comparison: SLAComparisonOp,
        ) -> float:
            """Calculate how close to target (as percentage)."""
            target_f = float(target)
            if target_f == 0:
                return 100.0 if actual == 0 else 0.0

            # For "greater than" metrics, higher is better
            if comparison in (SLAComparisonOp.GREATER_THAN, SLAComparisonOp.GREATER_EQUAL):
                return min(100.0, (actual / target_f) * 100)

            # For "less than" metrics, lower is better
            if comparison in (SLAComparisonOp.LESS_THAN, SLAComparisonOp.LESS_EQUAL):
                if actual <= target_f:
                    return 100.0
                return max(0.0, (target_f / actual) * 100)

            return 100.0 if self._check_compliance(actual, target, comparison) else 0.0
    ```
  </action>
  <verify>
    - Metrics calculated correctly
    - Compliance check works
    - Percentage calculation correct
  </verify>
  <done>SLA compliance calculator</done>
</task>

<task id="8.3" type="auto" priority="high">
  <name>SLA Monitor Service</name>
  <files>
    - src/meta_agent/sla/monitor.py
  </files>
  <action>
    ```python
    # src/meta_agent/sla/monitor.py
    from datetime import date, timedelta
    from typing import List, Optional
    import logging

    from .models import SLADefinition, SLACompliance, SLAPeriod
    from .calculator import SLACalculator
    from ..alerting.manager import AlertManager
    from ..alerting.detector import AlertType
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class SLAMonitor:
        def __init__(
            self,
            database: Database,
            alert_manager: Optional[AlertManager] = None,
        ):
            self.db = database
            self.calculator = SLACalculator(database)
            self.alerts = alert_manager

        async def check_all_slas(self) -> List[SLACompliance]:
            """Check all active SLAs."""
            slas = await self._get_active_slas()
            results = []

            for sla in slas:
                try:
                    start, end = self._get_period_dates(sla.period)
                    compliance = await self.calculator.calculate_compliance(
                        sla, start, end
                    )
                    await self._store_compliance(compliance)
                    await self._check_alerts(sla, compliance)
                    results.append(compliance)
                except Exception as e:
                    logger.error(f"Failed to check SLA {sla.id}: {e}")

            return results

        async def _get_active_slas(self) -> List[SLADefinition]:
            """Get all active SLA definitions."""
            rows = await self.db.fetch_all(
                "SELECT * FROM agent_slas WHERE is_active = true"
            )
            return [SLADefinition(**r) for r in rows]

        def _get_period_dates(self, period: SLAPeriod) -> tuple[date, date]:
            """Get start and end dates for a period."""
            today = date.today()
            if period == SLAPeriod.DAILY:
                return today - timedelta(days=1), today - timedelta(days=1)
            elif period == SLAPeriod.WEEKLY:
                start = today - timedelta(days=today.weekday() + 7)
                end = start + timedelta(days=6)
                return start, end
            elif period == SLAPeriod.MONTHLY:
                first = today.replace(day=1) - timedelta(days=1)
                start = first.replace(day=1)
                return start, first
            return today, today

        async def _store_compliance(self, compliance: SLACompliance) -> None:
            """Store compliance record."""
            await self.db.execute("""
                INSERT INTO sla_compliance (
                    id, sla_id, agent_id, period_start, period_end,
                    target_value, actual_value, is_compliant, compliance_pct,
                    breach_count, breach_details, calculated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (sla_id, period_start) DO UPDATE SET
                    actual_value = EXCLUDED.actual_value,
                    is_compliant = EXCLUDED.is_compliant,
                    compliance_pct = EXCLUDED.compliance_pct,
                    breach_count = EXCLUDED.breach_count,
                    breach_details = EXCLUDED.breach_details,
                    calculated_at = EXCLUDED.calculated_at
            """, compliance.id, compliance.sla_id, compliance.agent_id,
                compliance.period_start, compliance.period_end,
                compliance.target_value, compliance.actual_value,
                compliance.is_compliant, compliance.compliance_pct,
                compliance.breach_count, compliance.breach_details,
                compliance.calculated_at
            )

        async def _check_alerts(
            self,
            sla: SLADefinition,
            compliance: SLACompliance,
        ) -> None:
            """Check if alerts should be triggered."""
            if not self.alerts:
                return

            agent = await self.db.fetch_one(
                "SELECT name FROM agent_registry WHERE id = $1",
                sla.agent_id
            )
            agent_name = agent['name'] if agent else sla.agent_id

            if not compliance.is_compliant:
                # SLA breach
                alert = self.alerts.detector.create_alert(
                    AlertType.SLA_BREACH,
                    sla.organization_id,
                    sla.agent_id,
                    agent_name,
                    metric_name=sla.metric.value,
                    actual_value=float(compliance.actual_value),
                    target_value=float(sla.target_value),
                )
                await self.alerts.process_alert(alert)

            elif compliance.compliance_pct < sla.warning_threshold_pct:
                # SLA warning (approaching breach)
                alert = self.alerts.detector.create_alert(
                    AlertType.SLA_WARNING,
                    sla.organization_id,
                    sla.agent_id,
                    agent_name,
                    metric_name=sla.metric.value,
                    actual_value=float(compliance.actual_value),
                    target_value=float(sla.target_value),
                    percent=compliance.compliance_pct,
                )
                await self.alerts.process_alert(alert)
    ```
  </action>
  <verify>
    - All SLAs checked
    - Compliance stored
    - Alerts triggered correctly
    - Warning threshold works
  </verify>
  <done>SLA monitor service</done>
</task>

<task id="8.4" type="auto" priority="medium">
  <name>SLA API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/sla.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/sla.py
    from fastapi import APIRouter, Depends
    from typing import List
    from pydantic import BaseModel
    from decimal import Decimal

    router = APIRouter(prefix="/api/v1/slas", tags=["sla"])

    class SLACreateRequest(BaseModel):
        agent_id: str
        name: str
        metric: str
        comparison: str
        target_value: float
        period: str = "daily"

    class SLAResponse(BaseModel):
        id: str
        agent_id: str
        name: str
        metric: str
        target_value: float
        is_active: bool

    class ComplianceResponse(BaseModel):
        sla_id: str
        is_compliant: bool
        compliance_pct: float
        actual_value: float
        target_value: float

    @router.post("/", response_model=SLAResponse)
    async def create_sla(
        request: SLACreateRequest,
        db = Depends(get_database),
        user = Depends(get_current_user),
    ):
        """Create a new SLA definition."""
        sla_id = str(uuid4())
        await db.execute("""
            INSERT INTO agent_slas (
                id, organization_id, agent_id, name, metric,
                comparison, target_value, period
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """, sla_id, user.organization_id, request.agent_id,
            request.name, request.metric, request.comparison,
            Decimal(str(request.target_value)), request.period
        )
        return {"id": sla_id, **request.dict()}

    @router.get("/{agent_id}", response_model=List[SLAResponse])
    async def get_agent_slas(
        agent_id: str,
        db = Depends(get_database),
    ):
        """Get SLAs for an agent."""
        return await db.fetch_all(
            "SELECT * FROM agent_slas WHERE agent_id = $1",
            agent_id
        )

    @router.get("/{agent_id}/compliance", response_model=List[ComplianceResponse])
    async def get_compliance_history(
        agent_id: str,
        limit: int = 30,
        db = Depends(get_database),
    ):
        """Get compliance history for an agent."""
        return await db.fetch_all("""
            SELECT * FROM sla_compliance
            WHERE agent_id = $1
            ORDER BY period_start DESC
            LIMIT $2
        """, agent_id, limit)
    ```
  </action>
  <verify>
    - Create SLA works
    - Get SLAs works
    - Compliance history works
  </verify>
  <done>SLA API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] SLA CRUD operations working
- [ ] Compliance calculation accurate
- [ ] Breach detection working
- [ ] Warning threshold working
- [ ] Alerts triggered on breach
- [ ] Compliance history tracked
- [ ] API endpoints functional

## Files Created

- `src/meta_agent/sla/__init__.py`
- `src/meta_agent/sla/models.py`
- `src/meta_agent/sla/calculator.py`
- `src/meta_agent/sla/monitor.py`
- `src/meta_agent/api/routes/sla.py`
