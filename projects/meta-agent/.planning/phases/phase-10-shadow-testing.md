# Phase 10: Shadow Testing System

**Duration**: 4 days | **Complexity**: High | **Dependencies**: Phase 9

## Phase Overview

Enable risk-free prompt evaluation through parallel execution. Shadow tests run new prompts alongside production without affecting users.

## Success Criteria

- [ ] Shadow test configuration
- [ ] Traffic sampling logic
- [ ] Parallel execution orchestration
- [ ] Output comparison engine
- [ ] Quality scoring for shadow results
- [ ] Statistical analysis
- [ ] Recommendation generation (promote/keep/extend)
- [ ] Zero impact on production latency

---

## Tasks

<task id="10.1" type="auto" priority="critical">
  <name>Shadow Test Models</name>
  <files>
    - src/meta_agent/shadow/models.py
    - src/meta_agent/shadow/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/shadow/models.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime
    from typing import Optional, Dict, Any, List
    from uuid import uuid4

    class ShadowTestStatus(str, Enum):
        PENDING = "pending"
        RUNNING = "running"
        COMPLETED = "completed"
        FAILED = "failed"
        CANCELLED = "cancelled"

    class ShadowRecommendation(str, Enum):
        PROMOTE = "promote"           # Shadow is better, promote to production
        KEEP_CURRENT = "keep_current" # Production is better
        EXTEND = "extend"             # Need more data
        INCONCLUSIVE = "inconclusive" # Results too similar

    @dataclass
    class ShadowTestConfig:
        id: str = field(default_factory=lambda: str(uuid4()))
        agent_id: str = ""
        production_prompt_id: str = ""
        shadow_prompt_id: str = ""
        sample_rate: float = 0.1  # 10% of traffic
        min_samples: int = 100
        max_samples: int = 1000
        duration_hours: int = 24
        created_at: datetime = field(default_factory=datetime.utcnow)
        created_by: str = ""

    @dataclass
    class ShadowResult:
        id: str = field(default_factory=lambda: str(uuid4()))
        test_id: str = ""
        execution_id: str = ""
        timestamp: datetime = field(default_factory=datetime.utcnow)

        # Production results
        prod_output: Dict[str, Any] = field(default_factory=dict)
        prod_latency_ms: int = 0
        prod_tokens: int = 0
        prod_cost: float = 0.0
        prod_status: str = "success"

        # Shadow results
        shadow_output: Dict[str, Any] = field(default_factory=dict)
        shadow_latency_ms: int = 0
        shadow_tokens: int = 0
        shadow_cost: float = 0.0
        shadow_status: str = "success"

        # Comparison
        output_similarity: float = 0.0
        quality_comparison: str = ""  # "shadow_better", "equal", "prod_better"

    @dataclass
    class ShadowTestSummary:
        test_id: str
        status: ShadowTestStatus
        started_at: datetime
        completed_at: Optional[datetime]

        # Sample counts
        total_samples: int
        successful_comparisons: int

        # Production metrics
        prod_success_rate: float
        prod_avg_latency: float
        prod_avg_cost: float

        # Shadow metrics
        shadow_success_rate: float
        shadow_avg_latency: float
        shadow_avg_cost: float

        # Comparison results
        shadow_better_count: int
        equal_count: int
        prod_better_count: int
        avg_similarity: float

        # Recommendation
        recommendation: ShadowRecommendation
        confidence: float
        reasoning: str
    ```
  </action>
  <verify>
    - All models defined
    - Enums comprehensive
    - Comparison fields complete
  </verify>
  <done>Shadow test models</done>
</task>

<task id="10.2" type="auto" priority="critical">
  <name>Shadow Test Executor</name>
  <files>
    - src/meta_agent/shadow/executor.py
  </files>
  <action>
    ```python
    # src/meta_agent/shadow/executor.py
    import asyncio
    import random
    from datetime import datetime
    from typing import Optional, Callable, Awaitable, Dict, Any
    import logging

    from .models import ShadowTestConfig, ShadowResult
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class ShadowExecutor:
        def __init__(self, database: Database):
            self.db = database
            self._active_tests: Dict[str, ShadowTestConfig] = {}

        async def register_test(self, config: ShadowTestConfig) -> None:
            """Register a shadow test for an agent."""
            self._active_tests[config.agent_id] = config
            await self._store_test(config)
            logger.info(f"Registered shadow test for {config.agent_id}")

        async def should_shadow(self, agent_id: str) -> Optional[ShadowTestConfig]:
            """Check if request should be shadowed."""
            config = self._active_tests.get(agent_id)
            if not config:
                return None

            # Check sample rate
            if random.random() > config.sample_rate:
                return None

            # Check if test still valid
            samples = await self._get_sample_count(config.id)
            if samples >= config.max_samples:
                return None

            return config

        async def execute_shadow(
            self,
            config: ShadowTestConfig,
            input_data: Dict[str, Any],
            execute_fn: Callable[[str, Dict[str, Any]], Awaitable[Dict[str, Any]]],
        ) -> ShadowResult:
            """Execute both production and shadow prompts."""
            result = ShadowResult(
                test_id=config.id,
                execution_id=str(uuid4()),
            )

            # Execute production (this returns immediately to user)
            prod_start = datetime.utcnow()
            try:
                prod_result = await execute_fn(config.production_prompt_id, input_data)
                result.prod_output = prod_result.get('output', {})
                result.prod_status = "success"
                result.prod_tokens = prod_result.get('tokens', 0)
                result.prod_cost = prod_result.get('cost', 0.0)
            except Exception as e:
                result.prod_status = "failed"
                result.prod_output = {"error": str(e)}
            result.prod_latency_ms = int((datetime.utcnow() - prod_start).total_seconds() * 1000)

            # Execute shadow (async, doesn't block user)
            asyncio.create_task(self._execute_shadow_async(
                result, config, input_data, execute_fn
            ))

            return result

        async def _execute_shadow_async(
            self,
            result: ShadowResult,
            config: ShadowTestConfig,
            input_data: Dict[str, Any],
            execute_fn: Callable,
        ) -> None:
            """Execute shadow prompt asynchronously."""
            shadow_start = datetime.utcnow()
            try:
                shadow_result = await execute_fn(config.shadow_prompt_id, input_data)
                result.shadow_output = shadow_result.get('output', {})
                result.shadow_status = "success"
                result.shadow_tokens = shadow_result.get('tokens', 0)
                result.shadow_cost = shadow_result.get('cost', 0.0)
            except Exception as e:
                result.shadow_status = "failed"
                result.shadow_output = {"error": str(e)}
            result.shadow_latency_ms = int((datetime.utcnow() - shadow_start).total_seconds() * 1000)

            # Compare outputs
            result.output_similarity = await self._compare_outputs(
                result.prod_output, result.shadow_output
            )
            result.quality_comparison = self._determine_quality(result)

            # Store result
            await self._store_result(result)

        async def _compare_outputs(
            self,
            prod: Dict[str, Any],
            shadow: Dict[str, Any],
        ) -> float:
            """Compare two outputs and return similarity score (0-1)."""
            # Simple comparison - in production, use embeddings or LLM
            if prod == shadow:
                return 1.0

            # Compare key presence
            prod_keys = set(prod.keys()) if isinstance(prod, dict) else set()
            shadow_keys = set(shadow.keys()) if isinstance(shadow, dict) else set()

            if not prod_keys and not shadow_keys:
                return 1.0

            common = prod_keys & shadow_keys
            total = prod_keys | shadow_keys

            return len(common) / len(total) if total else 0.0

        def _determine_quality(self, result: ShadowResult) -> str:
            """Determine which output is better."""
            # Simple heuristic - in production, use LLM evaluation
            if result.prod_status == "failed" and result.shadow_status == "success":
                return "shadow_better"
            if result.prod_status == "success" and result.shadow_status == "failed":
                return "prod_better"

            # Compare latency (prefer faster)
            if result.shadow_latency_ms < result.prod_latency_ms * 0.8:
                return "shadow_better"
            if result.prod_latency_ms < result.shadow_latency_ms * 0.8:
                return "prod_better"

            return "equal"

        async def _store_test(self, config: ShadowTestConfig) -> None:
            await self.db.execute("""
                INSERT INTO shadow_tests (
                    id, agent_id, production_prompt_id, shadow_prompt_id,
                    sample_rate, min_samples, max_samples, duration_hours,
                    status, created_at, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'running', $9, $10)
            """, config.id, config.agent_id, config.production_prompt_id,
                config.shadow_prompt_id, config.sample_rate, config.min_samples,
                config.max_samples, config.duration_hours, config.created_at,
                config.created_by
            )

        async def _store_result(self, result: ShadowResult) -> None:
            await self.db.execute("""
                INSERT INTO shadow_test_results (
                    id, test_id, execution_id, timestamp,
                    prod_output, prod_latency_ms, prod_tokens, prod_cost, prod_status,
                    shadow_output, shadow_latency_ms, shadow_tokens, shadow_cost, shadow_status,
                    output_similarity, quality_comparison
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            """, result.id, result.test_id, result.execution_id, result.timestamp,
                result.prod_output, result.prod_latency_ms, result.prod_tokens,
                result.prod_cost, result.prod_status, result.shadow_output,
                result.shadow_latency_ms, result.shadow_tokens, result.shadow_cost,
                result.shadow_status, result.output_similarity, result.quality_comparison
            )

        async def _get_sample_count(self, test_id: str) -> int:
            row = await self.db.fetch_one(
                "SELECT COUNT(*) as count FROM shadow_test_results WHERE test_id = $1",
                test_id
            )
            return row['count'] if row else 0
    ```
  </action>
  <verify>
    - Shadow execution non-blocking
    - Results compared correctly
    - Storage working
    - Sample rate respected
  </verify>
  <done>Shadow test executor</done>
</task>

<task id="10.3" type="auto" priority="high">
  <name>Shadow Test Analyzer</name>
  <files>
    - src/meta_agent/shadow/analyzer.py
  </files>
  <action>
    ```python
    # src/meta_agent/shadow/analyzer.py
    from datetime import datetime
    from typing import Optional
    import math

    from .models import (
        ShadowTestSummary, ShadowTestStatus, ShadowRecommendation
    )
    from ..db.client import Database

    class ShadowAnalyzer:
        def __init__(self, database: Database):
            self.db = database

        async def analyze_test(self, test_id: str) -> ShadowTestSummary:
            """Analyze a shadow test and generate summary."""
            # Get test config
            test = await self.db.fetch_one(
                "SELECT * FROM shadow_tests WHERE id = $1", test_id
            )

            # Get aggregated results
            stats = await self.db.fetch_one("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE prod_status = 'success' AND shadow_status = 'success') as successful,

                    AVG(CASE WHEN prod_status = 'success' THEN 1 ELSE 0 END) as prod_success_rate,
                    AVG(prod_latency_ms) as prod_avg_latency,
                    AVG(prod_cost) as prod_avg_cost,

                    AVG(CASE WHEN shadow_status = 'success' THEN 1 ELSE 0 END) as shadow_success_rate,
                    AVG(shadow_latency_ms) as shadow_avg_latency,
                    AVG(shadow_cost) as shadow_avg_cost,

                    COUNT(*) FILTER (WHERE quality_comparison = 'shadow_better') as shadow_better,
                    COUNT(*) FILTER (WHERE quality_comparison = 'equal') as equal,
                    COUNT(*) FILTER (WHERE quality_comparison = 'prod_better') as prod_better,
                    AVG(output_similarity) as avg_similarity
                FROM shadow_test_results
                WHERE test_id = $1
            """, test_id)

            # Determine recommendation
            recommendation, confidence, reasoning = self._make_recommendation(
                stats, test['min_samples']
            )

            return ShadowTestSummary(
                test_id=test_id,
                status=ShadowTestStatus(test['status']),
                started_at=test['created_at'],
                completed_at=test.get('completed_at'),
                total_samples=stats['total'],
                successful_comparisons=stats['successful'],
                prod_success_rate=stats['prod_success_rate'] or 0,
                prod_avg_latency=stats['prod_avg_latency'] or 0,
                prod_avg_cost=stats['prod_avg_cost'] or 0,
                shadow_success_rate=stats['shadow_success_rate'] or 0,
                shadow_avg_latency=stats['shadow_avg_latency'] or 0,
                shadow_avg_cost=stats['shadow_avg_cost'] or 0,
                shadow_better_count=stats['shadow_better'] or 0,
                equal_count=stats['equal'] or 0,
                prod_better_count=stats['prod_better'] or 0,
                avg_similarity=stats['avg_similarity'] or 0,
                recommendation=recommendation,
                confidence=confidence,
                reasoning=reasoning,
            )

        def _make_recommendation(
            self,
            stats: dict,
            min_samples: int,
        ) -> tuple[ShadowRecommendation, float, str]:
            """Determine recommendation based on results."""
            total = stats['total'] or 0

            if total < min_samples:
                return (
                    ShadowRecommendation.EXTEND,
                    0.0,
                    f"Insufficient samples ({total}/{min_samples})"
                )

            shadow_better = stats['shadow_better'] or 0
            prod_better = stats['prod_better'] or 0
            equal = stats['equal'] or 0

            # Statistical significance check
            shadow_rate = shadow_better / total
            prod_rate = prod_better / total

            # Simple binomial confidence
            if shadow_rate > prod_rate + 0.1 and total >= 100:
                confidence = min(0.95, shadow_rate)
                return (
                    ShadowRecommendation.PROMOTE,
                    confidence,
                    f"Shadow outperformed in {shadow_rate:.1%} of cases"
                )

            if prod_rate > shadow_rate + 0.1 and total >= 100:
                confidence = min(0.95, prod_rate)
                return (
                    ShadowRecommendation.KEEP_CURRENT,
                    confidence,
                    f"Production outperformed in {prod_rate:.1%} of cases"
                )

            # Check success rate difference
            sr_diff = (stats['shadow_success_rate'] or 0) - (stats['prod_success_rate'] or 0)
            if abs(sr_diff) > 0.05:
                if sr_diff > 0:
                    return (
                        ShadowRecommendation.PROMOTE,
                        0.7,
                        f"Shadow has higher success rate (+{sr_diff:.1%})"
                    )
                else:
                    return (
                        ShadowRecommendation.KEEP_CURRENT,
                        0.7,
                        f"Production has higher success rate (+{-sr_diff:.1%})"
                    )

            return (
                ShadowRecommendation.INCONCLUSIVE,
                0.5,
                "Results too similar to determine winner"
            )
    ```
  </action>
  <verify>
    - Summary calculated correctly
    - Recommendations logical
    - Confidence scoring works
    - Statistical approach sound
  </verify>
  <done>Shadow test analyzer</done>
</task>

<task id="10.4" type="auto" priority="medium">
  <name>Shadow Test API</name>
  <files>
    - src/meta_agent/api/routes/shadow.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/shadow.py
    from fastapi import APIRouter, Depends
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/v1/shadow", tags=["shadow"])

    class CreateShadowTestRequest(BaseModel):
        agent_id: str
        production_prompt_id: str
        shadow_prompt_id: str
        sample_rate: float = 0.1
        min_samples: int = 100
        max_samples: int = 1000
        duration_hours: int = 24

    @router.post("/tests")
    async def create_shadow_test(
        request: CreateShadowTestRequest,
        executor = Depends(get_shadow_executor),
        user = Depends(get_current_user),
    ):
        """Create a new shadow test."""
        config = ShadowTestConfig(
            **request.dict(),
            created_by=user.id,
        )
        await executor.register_test(config)
        return {"test_id": config.id, "status": "running"}

    @router.get("/tests/{test_id}")
    async def get_shadow_test(
        test_id: str,
        analyzer = Depends(get_shadow_analyzer),
    ):
        """Get shadow test summary."""
        return await analyzer.analyze_test(test_id)

    @router.post("/tests/{test_id}/stop")
    async def stop_shadow_test(
        test_id: str,
        db = Depends(get_database),
    ):
        """Stop a running shadow test."""
        await db.execute(
            "UPDATE shadow_tests SET status = 'completed', completed_at = NOW() WHERE id = $1",
            test_id
        )
        return {"status": "stopped"}
    ```
  </action>
  <verify>
    - Create test works
    - Get summary works
    - Stop test works
  </verify>
  <done>Shadow test API</done>
</task>

---

## Phase Exit Criteria

- [ ] Shadow tests can be created
- [ ] Traffic sampling works correctly
- [ ] Parallel execution non-blocking
- [ ] Output comparison working
- [ ] Statistical analysis sound
- [ ] Recommendations generated
- [ ] API endpoints functional
- [ ] Zero production impact

## Files Created

- `src/meta_agent/shadow/__init__.py`
- `src/meta_agent/shadow/models.py`
- `src/meta_agent/shadow/executor.py`
- `src/meta_agent/shadow/analyzer.py`
- `src/meta_agent/api/routes/shadow.py`
