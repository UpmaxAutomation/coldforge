# Phase 12: A/B Testing Framework

**Duration**: 4 days | **Complexity**: High | **Dependencies**: Phase 11

## Phase Overview

Compare agent variants with statistical rigor. Define experiments, assign traffic, collect metrics, and determine winners with confidence intervals.

## Success Criteria

- [ ] Experiment definition (variants, metrics, duration)
- [ ] Traffic assignment with randomization
- [ ] Metric collection per variant
- [ ] Statistical analysis (t-test, confidence intervals)
- [ ] Winner determination with significance
- [ ] Experiment lifecycle management
- [ ] Results visualization data

---

## Tasks

<task id="12.1" type="auto" priority="critical">
  <name>A/B Testing Models</name>
  <files>
    - src/meta_agent/ab_testing/models.py
    - src/meta_agent/ab_testing/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/ab_testing/models.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime, date
    from typing import Optional, List, Dict
    from decimal import Decimal

    class ExperimentStatus(str, Enum):
        DRAFT = "draft"
        RUNNING = "running"
        PAUSED = "paused"
        COMPLETED = "completed"
        CANCELLED = "cancelled"

    class MetricType(str, Enum):
        SUCCESS_RATE = "success_rate"
        LATENCY_P50 = "latency_p50"
        LATENCY_P95 = "latency_p95"
        COST_PER_EXECUTION = "cost_per_execution"
        USER_SATISFACTION = "user_satisfaction"
        TASK_COMPLETION_RATE = "task_completion_rate"

    class MetricGoal(str, Enum):
        MAXIMIZE = "maximize"  # Higher is better (success rate)
        MINIMIZE = "minimize"  # Lower is better (latency, cost)

    @dataclass
    class Variant:
        id: str
        experiment_id: str
        name: str
        description: str
        config: Dict  # Agent config overrides
        traffic_percentage: float
        is_control: bool = False

    @dataclass
    class Experiment:
        id: str
        organization_id: str
        agent_id: str
        name: str
        description: str
        hypothesis: str

        # Metrics
        primary_metric: MetricType
        primary_metric_goal: MetricGoal
        secondary_metrics: List[MetricType] = field(default_factory=list)

        # Configuration
        min_sample_size: int = 1000
        confidence_level: float = 0.95
        min_detectable_effect: float = 0.05  # 5% MDE

        # State
        status: ExperimentStatus = ExperimentStatus.DRAFT
        variants: List[Variant] = field(default_factory=list)
        created_at: datetime = field(default_factory=datetime.utcnow)
        started_at: Optional[datetime] = None
        ended_at: Optional[datetime] = None

    @dataclass
    class VariantMetrics:
        variant_id: str
        metric_date: date
        metric_type: MetricType

        sample_size: int
        sum_value: float
        sum_squared: float
        mean: float
        variance: float
        std_dev: float

    @dataclass
    class ExperimentResult:
        experiment_id: str
        calculated_at: datetime

        # Per variant
        variant_results: List[Dict]

        # Winner analysis
        winner_variant_id: Optional[str]
        is_significant: bool
        p_value: float
        confidence_interval_lower: float
        confidence_interval_upper: float
        relative_improvement: float

        # Recommendations
        recommendation: str
        should_ship: bool
    ```
  </action>
  <verify>
    - All models defined
    - Enums comprehensive
    - Statistical fields present
  </verify>
  <done>A/B testing models</done>
</task>

<task id="12.2" type="auto" priority="critical">
  <name>Traffic Assignment</name>
  <files>
    - src/meta_agent/ab_testing/assignment.py
  </files>
  <action>
    ```python
    # src/meta_agent/ab_testing/assignment.py
    import hashlib
    from typing import Optional, Tuple
    from datetime import datetime
    import logging

    from .models import Experiment, Variant, ExperimentStatus
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class TrafficAssigner:
        """Assign users to experiment variants."""

        def __init__(self, database: Database):
            self.db = database
            self._experiment_cache: Dict[str, Experiment] = {}
            self._cache_ttl = 60  # seconds

        async def get_assignment(
            self,
            agent_id: str,
            user_id: str,
            request_id: Optional[str] = None,
        ) -> Tuple[Optional[str], Optional[Variant]]:
            """
            Get variant assignment for a user.
            Returns (experiment_id, variant) or (None, None).
            """
            experiment = await self._get_active_experiment(agent_id)

            if not experiment:
                return None, None

            # Check for existing assignment
            existing = await self._get_existing_assignment(
                experiment.id, user_id
            )
            if existing:
                variant = self._get_variant_by_id(experiment, existing)
                return experiment.id, variant

            # New assignment
            variant = self._assign_variant(experiment, user_id)
            await self._store_assignment(experiment.id, user_id, variant.id)

            return experiment.id, variant

        async def _get_active_experiment(
            self,
            agent_id: str,
        ) -> Optional[Experiment]:
            """Get active experiment for agent."""
            cache_key = f"exp:{agent_id}"
            now = datetime.utcnow()

            # Check cache
            if cache_key in self._experiment_cache:
                exp = self._experiment_cache[cache_key]
                if exp.status == ExperimentStatus.RUNNING:
                    return exp

            # Fetch from database
            row = await self.db.fetch_one("""
                SELECT e.*,
                       array_agg(v.*) as variants
                FROM experiments e
                LEFT JOIN experiment_variants v ON v.experiment_id = e.id
                WHERE e.agent_id = $1 AND e.status = 'running'
                GROUP BY e.id
                ORDER BY e.started_at DESC
                LIMIT 1
            """, agent_id)

            if row:
                experiment = self._row_to_experiment(row)
                self._experiment_cache[cache_key] = experiment
                return experiment

            return None

        async def _get_existing_assignment(
            self,
            experiment_id: str,
            user_id: str,
        ) -> Optional[str]:
            """Check for existing assignment."""
            row = await self.db.fetch_one("""
                SELECT variant_id FROM experiment_assignments
                WHERE experiment_id = $1 AND user_id = $2
            """, experiment_id, user_id)
            return row['variant_id'] if row else None

        def _assign_variant(
            self,
            experiment: Experiment,
            user_id: str,
        ) -> Variant:
            """
            Assign user to variant using deterministic hashing.
            Ensures consistent assignment for same user.
            """
            # Create deterministic hash
            hash_input = f"{experiment.id}:{user_id}"
            hash_bytes = hashlib.sha256(hash_input.encode()).digest()
            hash_value = int.from_bytes(hash_bytes[:4], 'big')
            percentage = (hash_value % 10000) / 100  # 0.00 to 99.99

            # Find matching variant based on traffic split
            cumulative = 0.0
            for variant in experiment.variants:
                cumulative += variant.traffic_percentage
                if percentage < cumulative:
                    return variant

            # Fallback to last variant
            return experiment.variants[-1]

        async def _store_assignment(
            self,
            experiment_id: str,
            user_id: str,
            variant_id: str,
        ) -> None:
            """Store assignment in database."""
            await self.db.execute("""
                INSERT INTO experiment_assignments (
                    experiment_id, user_id, variant_id, assigned_at
                ) VALUES ($1, $2, $3, NOW())
                ON CONFLICT (experiment_id, user_id) DO NOTHING
            """, experiment_id, user_id, variant_id)

        def _get_variant_by_id(
            self,
            experiment: Experiment,
            variant_id: str,
        ) -> Variant:
            """Get variant by ID."""
            for v in experiment.variants:
                if v.id == variant_id:
                    return v
            raise ValueError(f"Variant {variant_id} not found")

        def _row_to_experiment(self, row: dict) -> Experiment:
            """Convert database row to Experiment."""
            variants = [
                Variant(**v) for v in row['variants']
                if v is not None
            ]
            return Experiment(
                id=row['id'],
                organization_id=row['organization_id'],
                agent_id=row['agent_id'],
                name=row['name'],
                description=row['description'],
                hypothesis=row['hypothesis'],
                primary_metric=MetricType(row['primary_metric']),
                primary_metric_goal=MetricGoal(row['primary_metric_goal']),
                secondary_metrics=[
                    MetricType(m) for m in row.get('secondary_metrics', [])
                ],
                min_sample_size=row['min_sample_size'],
                confidence_level=row['confidence_level'],
                min_detectable_effect=row['min_detectable_effect'],
                status=ExperimentStatus(row['status']),
                variants=variants,
                created_at=row['created_at'],
                started_at=row.get('started_at'),
                ended_at=row.get('ended_at'),
            )

        def invalidate_cache(self, agent_id: str) -> None:
            """Invalidate experiment cache."""
            self._experiment_cache.pop(f"exp:{agent_id}", None)
    ```
  </action>
  <verify>
    - Deterministic assignment works
    - Consistent for same user
    - Traffic split respected
  </verify>
  <done>Traffic assignment with deterministic hashing</done>
</task>

<task id="12.3" type="auto" priority="critical">
  <name>Metrics Collector</name>
  <files>
    - src/meta_agent/ab_testing/metrics.py
  </files>
  <action>
    ```python
    # src/meta_agent/ab_testing/metrics.py
    from datetime import datetime, date, timedelta
    from typing import Dict, List, Optional
    import logging
    import math

    from .models import (
        Experiment, Variant, VariantMetrics,
        MetricType, MetricGoal
    )
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class ExperimentMetricsCollector:
        """Collect and aggregate metrics per variant."""

        def __init__(self, database: Database):
            self.db = database

        async def record_metric(
            self,
            experiment_id: str,
            variant_id: str,
            user_id: str,
            metric_type: MetricType,
            value: float,
        ) -> None:
            """Record a single metric observation."""
            await self.db.execute("""
                INSERT INTO experiment_observations (
                    experiment_id, variant_id, user_id,
                    metric_type, value, observed_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
            """, experiment_id, variant_id, user_id, metric_type.value, value)

        async def aggregate_daily_metrics(
            self,
            experiment: Experiment,
            target_date: date,
        ) -> List[VariantMetrics]:
            """Aggregate metrics for all variants for a day."""
            results = []

            for variant in experiment.variants:
                for metric in [experiment.primary_metric] + experiment.secondary_metrics:
                    metrics = await self._aggregate_variant_metric(
                        experiment.id, variant.id, metric, target_date
                    )
                    if metrics:
                        results.append(metrics)

            return results

        async def _aggregate_variant_metric(
            self,
            experiment_id: str,
            variant_id: str,
            metric_type: MetricType,
            target_date: date,
        ) -> Optional[VariantMetrics]:
            """Aggregate single metric for variant."""
            row = await self.db.fetch_one("""
                SELECT
                    COUNT(*) as sample_size,
                    SUM(value) as sum_value,
                    SUM(value * value) as sum_squared,
                    AVG(value) as mean,
                    VARIANCE(value) as variance
                FROM experiment_observations
                WHERE experiment_id = $1
                  AND variant_id = $2
                  AND metric_type = $3
                  AND DATE(observed_at) = $4
            """, experiment_id, variant_id, metric_type.value, target_date)

            if not row or row['sample_size'] == 0:
                return None

            variance = row['variance'] or 0
            std_dev = math.sqrt(variance) if variance > 0 else 0

            return VariantMetrics(
                variant_id=variant_id,
                metric_date=target_date,
                metric_type=metric_type,
                sample_size=row['sample_size'],
                sum_value=row['sum_value'],
                sum_squared=row['sum_squared'],
                mean=row['mean'],
                variance=variance,
                std_dev=std_dev,
            )

        async def get_cumulative_metrics(
            self,
            experiment: Experiment,
        ) -> Dict[str, Dict[str, VariantMetrics]]:
            """Get cumulative metrics for all variants."""
            result = {}

            for variant in experiment.variants:
                result[variant.id] = {}

                for metric in [experiment.primary_metric] + experiment.secondary_metrics:
                    row = await self.db.fetch_one("""
                        SELECT
                            COUNT(*) as sample_size,
                            SUM(value) as sum_value,
                            SUM(value * value) as sum_squared,
                            AVG(value) as mean,
                            VARIANCE(value) as variance
                        FROM experiment_observations
                        WHERE experiment_id = $1
                          AND variant_id = $2
                          AND metric_type = $3
                    """, experiment.id, variant.id, metric.value)

                    if row and row['sample_size'] > 0:
                        variance = row['variance'] or 0
                        result[variant.id][metric.value] = VariantMetrics(
                            variant_id=variant.id,
                            metric_date=date.today(),
                            metric_type=metric,
                            sample_size=row['sample_size'],
                            sum_value=row['sum_value'],
                            sum_squared=row['sum_squared'],
                            mean=row['mean'],
                            variance=variance,
                            std_dev=math.sqrt(variance) if variance > 0 else 0,
                        )

            return result

        async def get_sample_sizes(
            self,
            experiment: Experiment,
        ) -> Dict[str, int]:
            """Get sample sizes per variant."""
            rows = await self.db.fetch_all("""
                SELECT variant_id, COUNT(DISTINCT user_id) as users
                FROM experiment_assignments
                WHERE experiment_id = $1
                GROUP BY variant_id
            """, experiment.id)

            return {row['variant_id']: row['users'] for row in rows}
    ```
  </action>
  <verify>
    - Metrics recorded correctly
    - Aggregation works
    - Variance calculated properly
  </verify>
  <done>Experiment metrics collector</done>
</task>

<task id="12.4" type="auto" priority="critical">
  <name>Statistical Analyzer</name>
  <files>
    - src/meta_agent/ab_testing/analyzer.py
  </files>
  <action>
    ```python
    # src/meta_agent/ab_testing/analyzer.py
    from datetime import datetime
    from typing import Dict, List, Optional, Tuple
    import math
    import logging

    from .models import (
        Experiment, Variant, VariantMetrics, ExperimentResult,
        MetricType, MetricGoal
    )
    from .metrics import ExperimentMetricsCollector

    logger = logging.getLogger(__name__)

    class StatisticalAnalyzer:
        """Perform statistical analysis on experiment results."""

        def __init__(self, metrics_collector: ExperimentMetricsCollector):
            self.metrics = metrics_collector

        async def analyze_experiment(
            self,
            experiment: Experiment,
        ) -> ExperimentResult:
            """Perform full statistical analysis."""
            cumulative = await self.metrics.get_cumulative_metrics(experiment)
            sample_sizes = await self.metrics.get_sample_sizes(experiment)

            # Find control variant
            control = next(
                (v for v in experiment.variants if v.is_control),
                experiment.variants[0]
            )

            # Calculate results for each variant
            variant_results = []
            best_variant = None
            best_improvement = float('-inf') if experiment.primary_metric_goal == MetricGoal.MAXIMIZE else float('inf')

            primary_metric = experiment.primary_metric.value

            for variant in experiment.variants:
                if variant.id not in cumulative:
                    continue

                variant_metrics = cumulative[variant.id].get(primary_metric)
                control_metrics = cumulative[control.id].get(primary_metric)

                if not variant_metrics or not control_metrics:
                    continue

                # Calculate comparison
                comparison = self._compare_variants(
                    control_metrics, variant_metrics,
                    experiment.confidence_level
                )

                variant_results.append({
                    "variant_id": variant.id,
                    "variant_name": variant.name,
                    "is_control": variant.is_control,
                    "sample_size": sample_sizes.get(variant.id, 0),
                    "mean": variant_metrics.mean,
                    "std_dev": variant_metrics.std_dev,
                    **comparison,
                })

                # Track best variant
                if not variant.is_control:
                    improvement = comparison['relative_improvement']
                    if experiment.primary_metric_goal == MetricGoal.MAXIMIZE:
                        if improvement > best_improvement:
                            best_improvement = improvement
                            best_variant = variant
                    else:  # MINIMIZE
                        if improvement < best_improvement:
                            best_improvement = improvement
                            best_variant = variant

            # Determine winner
            winner_id = None
            is_significant = False
            p_value = 1.0
            ci_lower = 0.0
            ci_upper = 0.0

            if best_variant:
                best_result = next(
                    (r for r in variant_results if r['variant_id'] == best_variant.id),
                    None
                )
                if best_result:
                    p_value = best_result['p_value']
                    is_significant = p_value < (1 - experiment.confidence_level)
                    ci_lower = best_result['ci_lower']
                    ci_upper = best_result['ci_upper']

                    if is_significant:
                        # Check if improvement meets MDE
                        if abs(best_improvement) >= experiment.min_detectable_effect:
                            winner_id = best_variant.id

            # Generate recommendation
            recommendation, should_ship = self._generate_recommendation(
                experiment, variant_results, winner_id, is_significant, best_improvement
            )

            return ExperimentResult(
                experiment_id=experiment.id,
                calculated_at=datetime.utcnow(),
                variant_results=variant_results,
                winner_variant_id=winner_id,
                is_significant=is_significant,
                p_value=p_value,
                confidence_interval_lower=ci_lower,
                confidence_interval_upper=ci_upper,
                relative_improvement=best_improvement if best_variant else 0.0,
                recommendation=recommendation,
                should_ship=should_ship,
            )

        def _compare_variants(
            self,
            control: VariantMetrics,
            treatment: VariantMetrics,
            confidence_level: float,
        ) -> Dict:
            """Compare two variants using Welch's t-test."""
            n1, n2 = control.sample_size, treatment.sample_size
            m1, m2 = control.mean, treatment.mean
            v1, v2 = control.variance, treatment.variance

            if n1 < 2 or n2 < 2:
                return {
                    "relative_improvement": 0.0,
                    "p_value": 1.0,
                    "ci_lower": 0.0,
                    "ci_upper": 0.0,
                    "t_statistic": 0.0,
                }

            # Welch's t-test
            se = math.sqrt((v1 / n1) + (v2 / n2))
            if se == 0:
                return {
                    "relative_improvement": 0.0,
                    "p_value": 1.0,
                    "ci_lower": 0.0,
                    "ci_upper": 0.0,
                    "t_statistic": 0.0,
                }

            t_stat = (m2 - m1) / se

            # Welch-Satterthwaite degrees of freedom
            df_num = ((v1/n1) + (v2/n2)) ** 2
            df_den = ((v1/n1)**2 / (n1-1)) + ((v2/n2)**2 / (n2-1))
            df = df_num / df_den if df_den > 0 else 1

            # Calculate p-value (two-tailed)
            p_value = self._t_to_p(abs(t_stat), df)

            # Confidence interval for difference
            t_critical = self._get_t_critical(confidence_level, df)
            margin = t_critical * se
            diff = m2 - m1

            # Relative improvement
            relative_improvement = (m2 - m1) / m1 if m1 != 0 else 0.0

            return {
                "relative_improvement": relative_improvement,
                "p_value": p_value,
                "ci_lower": diff - margin,
                "ci_upper": diff + margin,
                "t_statistic": t_stat,
            }

        def _t_to_p(self, t: float, df: float) -> float:
            """
            Convert t-statistic to p-value.
            Uses approximation for large df.
            """
            # Approximation using normal distribution for large df
            if df > 30:
                # Use normal approximation
                z = t
                p = 2 * (1 - self._normal_cdf(abs(z)))
                return p

            # For smaller df, use approximation
            x = df / (df + t * t)
            p = self._incomplete_beta(df/2, 0.5, x)
            return p

        def _normal_cdf(self, x: float) -> float:
            """Standard normal CDF approximation."""
            return 0.5 * (1 + math.erf(x / math.sqrt(2)))

        def _incomplete_beta(self, a: float, b: float, x: float) -> float:
            """Regularized incomplete beta function approximation."""
            # Simple approximation for common cases
            if x < 0 or x > 1:
                return 0.0
            if x < (a + 1) / (a + b + 2):
                return self._beta_cf(a, b, x) * (x**a) * ((1-x)**b) / (a * self._beta(a, b))
            else:
                return 1 - self._beta_cf(b, a, 1-x) * ((1-x)**b) * (x**a) / (b * self._beta(a, b))

        def _beta(self, a: float, b: float) -> float:
            """Beta function."""
            return math.gamma(a) * math.gamma(b) / math.gamma(a + b)

        def _beta_cf(self, a: float, b: float, x: float, max_iter: int = 100) -> float:
            """Continued fraction for beta function."""
            tiny = 1e-30
            c = 1.0
            d = 1.0 - (a + b) * x / (a + 1)
            if abs(d) < tiny:
                d = tiny
            d = 1.0 / d
            h = d

            for m in range(1, max_iter):
                m2 = 2 * m
                aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2))
                d = 1.0 + aa * d
                if abs(d) < tiny:
                    d = tiny
                c = 1.0 + aa / c
                if abs(c) < tiny:
                    c = tiny
                d = 1.0 / d
                h *= d * c

                aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1))
                d = 1.0 + aa * d
                if abs(d) < tiny:
                    d = tiny
                c = 1.0 + aa / c
                if abs(c) < tiny:
                    c = tiny
                d = 1.0 / d
                delta = d * c
                h *= delta

                if abs(delta - 1.0) < 1e-10:
                    break

            return h

        def _get_t_critical(self, confidence: float, df: float) -> float:
            """Get t-critical value for confidence level."""
            # Approximation for common confidence levels
            alpha = 1 - confidence
            if df > 30:
                # Normal approximation
                z_map = {0.90: 1.645, 0.95: 1.96, 0.99: 2.576}
                return z_map.get(confidence, 1.96)

            # T-distribution approximation
            t_map = {
                0.95: {10: 2.228, 20: 2.086, 30: 2.042},
                0.99: {10: 3.169, 20: 2.845, 30: 2.750},
            }
            return t_map.get(confidence, {}).get(int(df), 2.0)

        def _generate_recommendation(
            self,
            experiment: Experiment,
            variant_results: List[Dict],
            winner_id: Optional[str],
            is_significant: bool,
            improvement: float,
        ) -> Tuple[str, bool]:
            """Generate human-readable recommendation."""
            sample_sizes = {r['variant_id']: r['sample_size'] for r in variant_results}
            min_samples = experiment.min_sample_size

            # Check sample size
            total_samples = sum(sample_sizes.values())
            if total_samples < min_samples:
                return (
                    f"Need more data. Currently {total_samples} samples, "
                    f"need at least {min_samples}.",
                    False
                )

            if not is_significant:
                return (
                    "Results not statistically significant. "
                    "Continue experiment or accept null hypothesis.",
                    False
                )

            if winner_id:
                winner_name = next(
                    (r['variant_name'] for r in variant_results if r['variant_id'] == winner_id),
                    "Unknown"
                )
                direction = "improvement" if improvement > 0 else "decrease"
                return (
                    f"Variant '{winner_name}' shows significant {abs(improvement):.1%} "
                    f"{direction}. Recommend shipping.",
                    True
                )

            return (
                "Improvement detected but below minimum detectable effect. "
                "Consider if change is worth shipping.",
                False
            )
    ```
  </action>
  <verify>
    - T-test calculation works
    - P-value reasonable
    - Confidence intervals correct
  </verify>
  <done>Statistical analyzer with Welch's t-test</done>
</task>

<task id="12.5" type="auto" priority="high">
  <name>Experiment Controller</name>
  <files>
    - src/meta_agent/ab_testing/controller.py
  </files>
  <action>
    ```python
    # src/meta_agent/ab_testing/controller.py
    from datetime import datetime
    from typing import Optional, List
    import logging
    from uuid import uuid4

    from .models import (
        Experiment, Variant, ExperimentStatus, ExperimentResult
    )
    from .assignment import TrafficAssigner
    from .metrics import ExperimentMetricsCollector
    from .analyzer import StatisticalAnalyzer
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class ExperimentController:
        """Manage experiment lifecycle."""

        def __init__(
            self,
            database: Database,
            assigner: TrafficAssigner,
            metrics: ExperimentMetricsCollector,
            analyzer: StatisticalAnalyzer,
        ):
            self.db = database
            self.assigner = assigner
            self.metrics = metrics
            self.analyzer = analyzer

        async def create_experiment(
            self,
            organization_id: str,
            agent_id: str,
            name: str,
            description: str,
            hypothesis: str,
            primary_metric: str,
            primary_metric_goal: str,
            variants_config: List[dict],
            **kwargs,
        ) -> Experiment:
            """Create a new experiment."""
            experiment_id = str(uuid4())

            # Validate traffic split
            total_traffic = sum(v['traffic_percentage'] for v in variants_config)
            if abs(total_traffic - 100.0) > 0.01:
                raise ValueError(f"Traffic must sum to 100%, got {total_traffic}%")

            # Must have exactly one control
            controls = [v for v in variants_config if v.get('is_control', False)]
            if len(controls) != 1:
                raise ValueError("Must have exactly one control variant")

            # Create experiment
            await self.db.execute("""
                INSERT INTO experiments (
                    id, organization_id, agent_id, name, description,
                    hypothesis, primary_metric, primary_metric_goal,
                    secondary_metrics, min_sample_size, confidence_level,
                    min_detectable_effect, status, created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'draft', NOW()
                )
            """,
                experiment_id, organization_id, agent_id, name,
                description, hypothesis, primary_metric, primary_metric_goal,
                kwargs.get('secondary_metrics', []),
                kwargs.get('min_sample_size', 1000),
                kwargs.get('confidence_level', 0.95),
                kwargs.get('min_detectable_effect', 0.05),
            )

            # Create variants
            variants = []
            for vc in variants_config:
                variant_id = str(uuid4())
                await self.db.execute("""
                    INSERT INTO experiment_variants (
                        id, experiment_id, name, description,
                        config, traffic_percentage, is_control
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                    variant_id, experiment_id, vc['name'],
                    vc.get('description', ''), vc.get('config', {}),
                    vc['traffic_percentage'], vc.get('is_control', False)
                )
                variants.append(Variant(
                    id=variant_id,
                    experiment_id=experiment_id,
                    **vc
                ))

            return await self._get_experiment(experiment_id)

        async def start_experiment(self, experiment_id: str) -> Experiment:
            """Start an experiment."""
            experiment = await self._get_experiment(experiment_id)

            if experiment.status != ExperimentStatus.DRAFT:
                raise ValueError(f"Experiment must be in draft state")

            # Check for existing active experiment
            existing = await self.db.fetch_one("""
                SELECT id FROM experiments
                WHERE agent_id = $1 AND status = 'running'
            """, experiment.agent_id)

            if existing:
                raise ValueError(f"Agent already has active experiment: {existing['id']}")

            await self.db.execute("""
                UPDATE experiments
                SET status = 'running', started_at = NOW()
                WHERE id = $1
            """, experiment_id)

            self.assigner.invalidate_cache(experiment.agent_id)
            logger.info(f"Started experiment {experiment_id}")

            return await self._get_experiment(experiment_id)

        async def pause_experiment(self, experiment_id: str) -> Experiment:
            """Pause an experiment."""
            experiment = await self._get_experiment(experiment_id)

            if experiment.status != ExperimentStatus.RUNNING:
                raise ValueError("Can only pause running experiments")

            await self.db.execute("""
                UPDATE experiments SET status = 'paused'
                WHERE id = $1
            """, experiment_id)

            self.assigner.invalidate_cache(experiment.agent_id)
            return await self._get_experiment(experiment_id)

        async def resume_experiment(self, experiment_id: str) -> Experiment:
            """Resume a paused experiment."""
            experiment = await self._get_experiment(experiment_id)

            if experiment.status != ExperimentStatus.PAUSED:
                raise ValueError("Can only resume paused experiments")

            await self.db.execute("""
                UPDATE experiments SET status = 'running'
                WHERE id = $1
            """, experiment_id)

            self.assigner.invalidate_cache(experiment.agent_id)
            return await self._get_experiment(experiment_id)

        async def complete_experiment(
            self,
            experiment_id: str,
            ship_winner: bool = False,
        ) -> ExperimentResult:
            """Complete an experiment and optionally ship winner."""
            experiment = await self._get_experiment(experiment_id)

            # Get final analysis
            result = await self.analyzer.analyze_experiment(experiment)

            # Update status
            await self.db.execute("""
                UPDATE experiments
                SET status = 'completed', ended_at = NOW()
                WHERE id = $1
            """, experiment_id)

            # Store result
            await self.db.execute("""
                INSERT INTO experiment_results (
                    experiment_id, calculated_at, variant_results,
                    winner_variant_id, is_significant, p_value,
                    confidence_interval_lower, confidence_interval_upper,
                    relative_improvement, recommendation, should_ship
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """,
                experiment_id, result.calculated_at, result.variant_results,
                result.winner_variant_id, result.is_significant, result.p_value,
                result.confidence_interval_lower, result.confidence_interval_upper,
                result.relative_improvement, result.recommendation, result.should_ship
            )

            # Ship winner if requested
            if ship_winner and result.winner_variant_id:
                await self._ship_variant(experiment, result.winner_variant_id)

            self.assigner.invalidate_cache(experiment.agent_id)
            logger.info(f"Completed experiment {experiment_id}")

            return result

        async def _ship_variant(
            self,
            experiment: Experiment,
            variant_id: str,
        ) -> None:
            """Ship winning variant as new baseline."""
            variant = next(
                (v for v in experiment.variants if v.id == variant_id),
                None
            )
            if not variant:
                raise ValueError(f"Variant {variant_id} not found")

            # Update agent configuration with variant config
            await self.db.execute("""
                UPDATE agent_registry
                SET config = config || $1, updated_at = NOW()
                WHERE id = $2
            """, variant.config, experiment.agent_id)

            logger.info(f"Shipped variant {variant.name} for agent {experiment.agent_id}")

        async def _get_experiment(self, experiment_id: str) -> Experiment:
            """Fetch experiment with variants."""
            row = await self.db.fetch_one("""
                SELECT * FROM experiments WHERE id = $1
            """, experiment_id)

            if not row:
                raise ValueError(f"Experiment {experiment_id} not found")

            variant_rows = await self.db.fetch_all("""
                SELECT * FROM experiment_variants WHERE experiment_id = $1
            """, experiment_id)

            variants = [Variant(**dict(v)) for v in variant_rows]

            return Experiment(
                **dict(row),
                variants=variants,
            )

        async def get_experiment_status(
            self,
            experiment_id: str,
        ) -> dict:
            """Get current status with live analysis."""
            experiment = await self._get_experiment(experiment_id)
            sample_sizes = await self.metrics.get_sample_sizes(experiment)

            status = {
                "experiment_id": experiment_id,
                "status": experiment.status.value,
                "started_at": experiment.started_at.isoformat() if experiment.started_at else None,
                "variants": [
                    {
                        "id": v.id,
                        "name": v.name,
                        "is_control": v.is_control,
                        "traffic_percentage": v.traffic_percentage,
                        "sample_size": sample_sizes.get(v.id, 0),
                    }
                    for v in experiment.variants
                ],
                "total_samples": sum(sample_sizes.values()),
                "target_samples": experiment.min_sample_size,
            }

            # Add live analysis if running
            if experiment.status == ExperimentStatus.RUNNING:
                result = await self.analyzer.analyze_experiment(experiment)
                status["live_analysis"] = {
                    "is_significant": result.is_significant,
                    "p_value": result.p_value,
                    "relative_improvement": result.relative_improvement,
                    "recommendation": result.recommendation,
                }

            return status
    ```
  </action>
  <verify>
    - Lifecycle management works
    - Shipping winner updates agent
    - Validation prevents conflicts
  </verify>
  <done>Experiment controller with lifecycle management</done>
</task>

<task id="12.6" type="auto" priority="medium">
  <name>A/B Testing API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/ab_testing.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/ab_testing.py
    from fastapi import APIRouter, Depends, HTTPException
    from typing import List, Optional
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/v1/experiments", tags=["ab-testing"])

    class VariantConfig(BaseModel):
        name: str
        description: str = ""
        config: dict = {}
        traffic_percentage: float
        is_control: bool = False

    class ExperimentCreateRequest(BaseModel):
        agent_id: str
        name: str
        description: str
        hypothesis: str
        primary_metric: str
        primary_metric_goal: str = "maximize"
        secondary_metrics: List[str] = []
        variants: List[VariantConfig]
        min_sample_size: int = 1000
        confidence_level: float = 0.95
        min_detectable_effect: float = 0.05

    class ExperimentResponse(BaseModel):
        id: str
        agent_id: str
        name: str
        status: str
        variants: List[dict]

    class ExperimentStatusResponse(BaseModel):
        experiment_id: str
        status: str
        total_samples: int
        target_samples: int
        variants: List[dict]
        live_analysis: Optional[dict] = None

    @router.post("/", response_model=ExperimentResponse)
    async def create_experiment(
        request: ExperimentCreateRequest,
        controller = Depends(get_experiment_controller),
        user = Depends(get_current_user),
    ):
        """Create a new A/B experiment."""
        experiment = await controller.create_experiment(
            organization_id=user.organization_id,
            agent_id=request.agent_id,
            name=request.name,
            description=request.description,
            hypothesis=request.hypothesis,
            primary_metric=request.primary_metric,
            primary_metric_goal=request.primary_metric_goal,
            secondary_metrics=request.secondary_metrics,
            variants_config=[v.dict() for v in request.variants],
            min_sample_size=request.min_sample_size,
            confidence_level=request.confidence_level,
            min_detectable_effect=request.min_detectable_effect,
        )
        return experiment

    @router.post("/{experiment_id}/start", response_model=ExperimentResponse)
    async def start_experiment(
        experiment_id: str,
        controller = Depends(get_experiment_controller),
    ):
        """Start a draft experiment."""
        return await controller.start_experiment(experiment_id)

    @router.post("/{experiment_id}/pause", response_model=ExperimentResponse)
    async def pause_experiment(
        experiment_id: str,
        controller = Depends(get_experiment_controller),
    ):
        """Pause a running experiment."""
        return await controller.pause_experiment(experiment_id)

    @router.post("/{experiment_id}/resume", response_model=ExperimentResponse)
    async def resume_experiment(
        experiment_id: str,
        controller = Depends(get_experiment_controller),
    ):
        """Resume a paused experiment."""
        return await controller.resume_experiment(experiment_id)

    @router.post("/{experiment_id}/complete")
    async def complete_experiment(
        experiment_id: str,
        ship_winner: bool = False,
        controller = Depends(get_experiment_controller),
    ):
        """Complete an experiment and optionally ship winner."""
        result = await controller.complete_experiment(experiment_id, ship_winner)
        return {
            "status": "completed",
            "winner_variant_id": result.winner_variant_id,
            "is_significant": result.is_significant,
            "p_value": result.p_value,
            "relative_improvement": result.relative_improvement,
            "recommendation": result.recommendation,
            "should_ship": result.should_ship,
        }

    @router.get("/{experiment_id}/status", response_model=ExperimentStatusResponse)
    async def get_status(
        experiment_id: str,
        controller = Depends(get_experiment_controller),
    ):
        """Get current experiment status with live analysis."""
        return await controller.get_experiment_status(experiment_id)

    @router.get("/{agent_id}/active")
    async def get_active_experiment(
        agent_id: str,
        db = Depends(get_database),
    ):
        """Get active experiment for an agent."""
        row = await db.fetch_one("""
            SELECT * FROM experiments
            WHERE agent_id = $1 AND status = 'running'
        """, agent_id)
        return dict(row) if row else None

    @router.get("/")
    async def list_experiments(
        agent_id: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        db = Depends(get_database),
        user = Depends(get_current_user),
    ):
        """List experiments with optional filters."""
        query = """
            SELECT * FROM experiments
            WHERE organization_id = $1
        """
        params = [user.organization_id]

        if agent_id:
            params.append(agent_id)
            query += f" AND agent_id = ${len(params)}"

        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"

        query += " ORDER BY created_at DESC LIMIT $" + str(len(params) + 1)
        params.append(limit)

        rows = await db.fetch_all(query, *params)
        return [dict(r) for r in rows]
    ```
  </action>
  <verify>
    - Create experiment works
    - Lifecycle endpoints work
    - Status with live analysis works
  </verify>
  <done>A/B testing API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] Experiment CRUD working
- [ ] Deterministic traffic assignment
- [ ] Metrics collection per variant
- [ ] Statistical analysis (t-test, CI)
- [ ] Significance detection
- [ ] Winner determination
- [ ] Ship winner to production
- [ ] Live analysis during experiment

## Files Created

- `src/meta_agent/ab_testing/__init__.py`
- `src/meta_agent/ab_testing/models.py`
- `src/meta_agent/ab_testing/assignment.py`
- `src/meta_agent/ab_testing/metrics.py`
- `src/meta_agent/ab_testing/analyzer.py`
- `src/meta_agent/ab_testing/controller.py`
- `src/meta_agent/api/routes/ab_testing.py`
