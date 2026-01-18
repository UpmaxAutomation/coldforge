# Phase 9: AI Evaluation Report Generator

**Duration**: 5 days | **Complexity**: High | **Dependencies**: Phase 7

## Phase Overview

Generate comprehensive AI-powered evaluation reports using Claude. These reports analyze agent performance and provide actionable recommendations.

## Success Criteria

- [ ] LLM client with Claude API integration
- [ ] Evaluation prompt engineering (analyst persona)
- [ ] Structured output parsing
- [ ] Multi-dimensional scoring (reliability, efficiency, cost, quality)
- [ ] Strength/weakness identification
- [ ] Recommendation generation
- [ ] Period-over-period comparison
- [ ] Risk level assessment
- [ ] Reports generated in <2 minutes per agent

---

## Tasks

<task id="9.1" type="auto" priority="critical">
  <name>Claude LLM Client</name>
  <files>
    - src/meta_agent/llm/client.py
    - src/meta_agent/llm/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/llm/client.py
    import anthropic
    from typing import TypeVar, Type, Optional
    from pydantic import BaseModel
    import json
    import logging

    logger = logging.getLogger(__name__)

    T = TypeVar('T', bound=BaseModel)

    class ClaudeClient:
        def __init__(
            self,
            api_key: str,
            model: str = "claude-sonnet-4-20250514",
            max_tokens: int = 4096,
        ):
            self.client = anthropic.Anthropic(api_key=api_key)
            self.model = model
            self.max_tokens = max_tokens

        async def complete(
            self,
            system: str,
            prompt: str,
            temperature: float = 0.7,
        ) -> str:
            """Get a text completion from Claude."""
            response = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                temperature=temperature,
                system=system,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text

        async def complete_structured(
            self,
            system: str,
            prompt: str,
            response_model: Type[T],
            temperature: float = 0.3,
        ) -> T:
            """Get a structured response from Claude."""
            # Add JSON schema to prompt
            schema = response_model.model_json_schema()
            full_prompt = f"""
{prompt}

Respond with valid JSON matching this schema:
```json
{json.dumps(schema, indent=2)}
```

Return ONLY the JSON, no other text.
"""
            response = await self.complete(system, full_prompt, temperature)

            # Parse JSON from response
            try:
                # Handle markdown code blocks
                if "```json" in response:
                    response = response.split("```json")[1].split("```")[0]
                elif "```" in response:
                    response = response.split("```")[1].split("```")[0]

                data = json.loads(response.strip())
                return response_model(**data)
            except Exception as e:
                logger.error(f"Failed to parse structured response: {e}")
                raise

        async def analyze_with_tools(
            self,
            system: str,
            prompt: str,
            tools: list,
        ) -> dict:
            """Use Claude with tools for structured analysis."""
            response = self.client.messages.create(
                model=self.model,
                max_tokens=self.max_tokens,
                system=system,
                messages=[{"role": "user", "content": prompt}],
                tools=tools,
            )

            # Extract tool use results
            for block in response.content:
                if block.type == "tool_use":
                    return block.input

            return {}
    ```
  </action>
  <verify>
    - Claude API connection works
    - Text completion works
    - Structured output parsing works
    - Error handling robust
  </verify>
  <done>Claude LLM client with structured output</done>
</task>

<task id="9.2" type="auto" priority="critical">
  <name>Evaluation Response Models</name>
  <files>
    - src/meta_agent/evaluation/models.py
  </files>
  <action>
    ```python
    # src/meta_agent/evaluation/models.py
    from pydantic import BaseModel, Field
    from typing import List, Optional
    from enum import Enum
    from datetime import datetime

    class RiskLevel(str, Enum):
        LOW = "low"
        MEDIUM = "medium"
        HIGH = "high"
        CRITICAL = "critical"

    class TrendDirection(str, Enum):
        IMPROVING = "improving"
        STABLE = "stable"
        DECLINING = "declining"

    class DimensionScore(BaseModel):
        dimension: str
        score: float = Field(ge=0, le=100)
        trend: TrendDirection
        details: str

    class Strength(BaseModel):
        area: str
        description: str
        evidence: str

    class Weakness(BaseModel):
        area: str
        description: str
        impact: str
        severity: str

    class Recommendation(BaseModel):
        priority: int = Field(ge=1, le=5)
        category: str
        title: str
        description: str
        expected_impact: str
        effort: str  # low, medium, high

    class PeriodComparison(BaseModel):
        metric: str
        previous_value: float
        current_value: float
        change_pct: float
        assessment: str

    class EvaluationReport(BaseModel):
        agent_id: str
        agent_name: str
        evaluation_period: str
        generated_at: datetime

        # Overall assessment
        overall_score: float = Field(ge=0, le=100)
        risk_level: RiskLevel
        executive_summary: str

        # Dimensional scores
        reliability_score: DimensionScore
        efficiency_score: DimensionScore
        cost_score: DimensionScore
        quality_score: DimensionScore

        # Analysis
        strengths: List[Strength]
        weaknesses: List[Weakness]
        recommendations: List[Recommendation]

        # Comparisons
        period_comparisons: List[PeriodComparison]

        # Raw data references
        total_executions: int
        success_rate: float
        avg_latency_ms: int
        total_cost: float
    ```
  </action>
  <verify>
    - All models validate
    - Score constraints work
    - Enums comprehensive
  </verify>
  <done>Evaluation response models</done>
</task>

<task id="9.3" type="auto" priority="critical">
  <name>Evaluation Prompt Engineering</name>
  <files>
    - src/meta_agent/evaluation/prompts.py
  </files>
  <action>
    ```python
    # src/meta_agent/evaluation/prompts.py

    ANALYST_SYSTEM_PROMPT = """You are an expert AI Operations Analyst specializing in evaluating AI agent performance. Your role is to analyze metrics, identify patterns, and provide actionable recommendations.

You have deep expertise in:
- AI/ML system reliability and performance optimization
- Cost management for LLM-based systems
- Error pattern analysis and root cause identification
- Best practices for production AI systems

Your analysis should be:
- Data-driven: Base all conclusions on the provided metrics
- Actionable: Recommendations should be specific and implementable
- Balanced: Acknowledge both strengths and areas for improvement
- Risk-aware: Clearly identify and quantify risks

When scoring (0-100):
- 90-100: Exceptional, exceeds best practices
- 75-89: Good, meets expectations
- 60-74: Adequate, room for improvement
- 40-59: Concerning, needs attention
- 0-39: Critical, immediate action required"""

    def build_evaluation_prompt(
        agent_name: str,
        agent_description: str,
        current_metrics: dict,
        previous_metrics: dict,
        error_samples: list,
        sla_status: dict,
    ) -> str:
        return f"""
Analyze the following AI agent performance data and generate a comprehensive evaluation report.

## Agent Information
- **Name**: {agent_name}
- **Description**: {agent_description}

## Current Period Metrics (Last 7 days)
- Total Executions: {current_metrics['total_executions']}
- Successful: {current_metrics['successful']}
- Failed: {current_metrics['failed']}
- Success Rate: {current_metrics['success_rate']:.2%}
- Average Latency: {current_metrics['avg_latency_ms']}ms
- P95 Latency: {current_metrics['p95_latency_ms']}ms
- P99 Latency: {current_metrics['p99_latency_ms']}ms
- Total Cost: ${current_metrics['total_cost']:.2f}
- Cost per Execution: ${current_metrics['cost_per_execution']:.4f}
- Human Interventions: {current_metrics['human_interventions']}

## Previous Period Metrics (Prior 7 days)
- Total Executions: {previous_metrics['total_executions']}
- Success Rate: {previous_metrics['success_rate']:.2%}
- Average Latency: {previous_metrics['avg_latency_ms']}ms
- Total Cost: ${previous_metrics['total_cost']:.2f}

## Error Distribution
{_format_error_distribution(current_metrics.get('error_distribution', {}))}

## Sample Errors (Most Recent)
{_format_error_samples(error_samples)}

## SLA Status
{_format_sla_status(sla_status)}

## Instructions
1. Calculate dimensional scores for: Reliability, Efficiency, Cost, Quality
2. Identify the top 3 strengths with specific evidence
3. Identify the top 3 weaknesses with impact assessment
4. Provide 3-5 prioritized recommendations
5. Compare current vs previous period for key metrics
6. Determine overall risk level
7. Write an executive summary (2-3 sentences)

Ensure your analysis is specific to this agent's data, not generic advice.
"""

    def _format_error_distribution(errors: dict) -> str:
        if not errors:
            return "No errors in period"
        lines = [f"- {error}: {count}" for error, count in errors.items()]
        return "\n".join(lines)

    def _format_error_samples(samples: list) -> str:
        if not samples:
            return "No error samples available"
        lines = []
        for s in samples[:5]:
            lines.append(f"- [{s['timestamp']}] {s['error_type']}: {s['message'][:100]}")
        return "\n".join(lines)

    def _format_sla_status(status: dict) -> str:
        if not status:
            return "No SLAs defined"
        lines = []
        for sla, data in status.items():
            status_icon = "✅" if data['compliant'] else "❌"
            lines.append(f"- {status_icon} {sla}: {data['actual']} (target: {data['target']})")
        return "\n".join(lines)
    ```
  </action>
  <verify>
    - System prompt comprehensive
    - Evaluation prompt formatted correctly
    - All data included
  </verify>
  <done>Evaluation prompt engineering</done>
</task>

<task id="9.4" type="auto" priority="critical">
  <name>Report Generator Service</name>
  <files>
    - src/meta_agent/evaluation/generator.py
  </files>
  <action>
    ```python
    # src/meta_agent/evaluation/generator.py
    from datetime import datetime, date, timedelta
    from typing import Optional
    import logging

    from .models import EvaluationReport
    from .prompts import ANALYST_SYSTEM_PROMPT, build_evaluation_prompt
    from ..llm.client import ClaudeClient
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class ReportGenerator:
        def __init__(
            self,
            llm_client: ClaudeClient,
            database: Database,
        ):
            self.llm = llm_client
            self.db = database

        async def generate_report(
            self,
            agent_id: str,
            period_days: int = 7,
        ) -> EvaluationReport:
            """Generate a comprehensive evaluation report for an agent."""
            # Get agent info
            agent = await self.db.fetch_one(
                "SELECT * FROM agent_registry WHERE id = $1",
                agent_id
            )
            if not agent:
                raise ValueError(f"Agent not found: {agent_id}")

            # Get current period metrics
            end_date = date.today()
            start_date = end_date - timedelta(days=period_days)
            current_metrics = await self._get_period_metrics(agent_id, start_date, end_date)

            # Get previous period metrics
            prev_end = start_date
            prev_start = prev_end - timedelta(days=period_days)
            previous_metrics = await self._get_period_metrics(agent_id, prev_start, prev_end)

            # Get error samples
            error_samples = await self._get_error_samples(agent_id, start_date)

            # Get SLA status
            sla_status = await self._get_sla_status(agent_id)

            # Build prompt
            prompt = build_evaluation_prompt(
                agent_name=agent['name'],
                agent_description=agent.get('description', 'No description'),
                current_metrics=current_metrics,
                previous_metrics=previous_metrics,
                error_samples=error_samples,
                sla_status=sla_status,
            )

            # Generate report using Claude
            report = await self.llm.complete_structured(
                system=ANALYST_SYSTEM_PROMPT,
                prompt=prompt,
                response_model=EvaluationReport,
            )

            # Add metadata
            report.agent_id = agent_id
            report.agent_name = agent['name']
            report.evaluation_period = f"{start_date} to {end_date}"
            report.generated_at = datetime.utcnow()
            report.total_executions = current_metrics['total_executions']
            report.success_rate = current_metrics['success_rate']
            report.avg_latency_ms = current_metrics['avg_latency_ms']
            report.total_cost = current_metrics['total_cost']

            # Store report
            await self._store_report(report)

            return report

        async def _get_period_metrics(
            self,
            agent_id: str,
            start: date,
            end: date,
        ) -> dict:
            """Get aggregated metrics for a period."""
            row = await self.db.fetch_one("""
                SELECT
                    COALESCE(SUM(total_executions), 0) as total_executions,
                    COALESCE(SUM(successful_executions), 0) as successful,
                    COALESCE(SUM(failed_executions), 0) as failed,
                    COALESCE(AVG(success_rate), 1) as success_rate,
                    COALESCE(AVG(avg_latency_ms), 0)::int as avg_latency_ms,
                    COALESCE(AVG(p95_latency_ms), 0)::int as p95_latency_ms,
                    COALESCE(AVG(p99_latency_ms), 0)::int as p99_latency_ms,
                    COALESCE(SUM(total_cost_usd), 0) as total_cost,
                    COALESCE(SUM(human_interventions), 0) as human_interventions
                FROM agent_performance_metrics
                WHERE agent_id = $1 AND metric_date BETWEEN $2 AND $3
            """, agent_id, start, end)

            total = row['total_executions'] or 1
            return {
                **dict(row),
                'cost_per_execution': row['total_cost'] / total,
                'error_distribution': await self._get_error_distribution(agent_id, start, end),
            }

        async def _get_error_distribution(
            self,
            agent_id: str,
            start: date,
            end: date,
        ) -> dict:
            """Get error type distribution."""
            rows = await self.db.fetch_all("""
                SELECT
                    COALESCE(metadata->>'error_type', 'unknown') as error_type,
                    COUNT(*) as count
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND DATE(timestamp) BETWEEN $2 AND $3
                  AND status = 'failed'
                GROUP BY metadata->>'error_type'
                ORDER BY count DESC
                LIMIT 10
            """, agent_id, start, end)
            return {r['error_type']: r['count'] for r in rows}

        async def _get_error_samples(self, agent_id: str, since: date) -> list:
            """Get sample errors for analysis."""
            return await self.db.fetch_all("""
                SELECT
                    timestamp,
                    COALESCE(metadata->>'error_type', 'unknown') as error_type,
                    error_message as message
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND DATE(timestamp) >= $2
                  AND status = 'failed'
                ORDER BY timestamp DESC
                LIMIT 10
            """, agent_id, since)

        async def _get_sla_status(self, agent_id: str) -> dict:
            """Get current SLA compliance status."""
            rows = await self.db.fetch_all("""
                SELECT s.name, c.is_compliant as compliant,
                       c.actual_value as actual, s.target_value as target
                FROM agent_slas s
                LEFT JOIN sla_compliance c ON s.id = c.sla_id
                WHERE s.agent_id = $1 AND s.is_active = true
                ORDER BY c.calculated_at DESC
            """, agent_id)
            return {r['name']: dict(r) for r in rows}

        async def _store_report(self, report: EvaluationReport) -> None:
            """Store generated report."""
            await self.db.execute("""
                INSERT INTO evaluation_reports (
                    id, agent_id, report_type, period_start, period_end,
                    overall_score, risk_level, executive_summary,
                    dimension_scores, strengths, weaknesses,
                    recommendations, period_comparisons, raw_metrics,
                    generated_at
                ) VALUES (
                    gen_random_uuid(), $1, 'weekly', $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11, $12, NOW()
                )
            """,
                report.agent_id,
                # Parse dates from period string
                report.evaluation_period.split(' to ')[0],
                report.evaluation_period.split(' to ')[1],
                report.overall_score,
                report.risk_level.value,
                report.executive_summary,
                {
                    'reliability': report.reliability_score.dict(),
                    'efficiency': report.efficiency_score.dict(),
                    'cost': report.cost_score.dict(),
                    'quality': report.quality_score.dict(),
                },
                [s.dict() for s in report.strengths],
                [w.dict() for w in report.weaknesses],
                [r.dict() for r in report.recommendations],
                [c.dict() for c in report.period_comparisons],
                {
                    'total_executions': report.total_executions,
                    'success_rate': report.success_rate,
                    'avg_latency_ms': report.avg_latency_ms,
                    'total_cost': report.total_cost,
                },
            )
    ```
  </action>
  <verify>
    - Reports generate correctly
    - Metrics gathered accurately
    - Claude integration works
    - Reports stored properly
  </verify>
  <done>Report generator service</done>
</task>

<task id="9.5" type="auto" priority="medium">
  <name>Report API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/evaluation.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/evaluation.py
    from fastapi import APIRouter, Depends, BackgroundTasks
    from typing import List
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/v1/evaluations", tags=["evaluations"])

    @router.post("/{agent_id}/generate")
    async def generate_report(
        agent_id: str,
        period_days: int = 7,
        background_tasks: BackgroundTasks = None,
        generator = Depends(get_report_generator),
    ):
        """Generate a new evaluation report for an agent."""
        # Run in background for long reports
        report = await generator.generate_report(agent_id, period_days)
        return {"report_id": report.agent_id, "status": "generated"}

    @router.get("/{agent_id}/reports")
    async def list_reports(
        agent_id: str,
        limit: int = 10,
        db = Depends(get_database),
    ):
        """List evaluation reports for an agent."""
        return await db.fetch_all("""
            SELECT id, generated_at, overall_score, risk_level, executive_summary
            FROM evaluation_reports
            WHERE agent_id = $1
            ORDER BY generated_at DESC
            LIMIT $2
        """, agent_id, limit)

    @router.get("/reports/{report_id}")
    async def get_report(
        report_id: str,
        db = Depends(get_database),
    ):
        """Get a specific evaluation report."""
        return await db.fetch_one(
            "SELECT * FROM evaluation_reports WHERE id = $1",
            report_id
        )
    ```
  </action>
  <verify>
    - Generate endpoint works
    - List endpoint works
    - Get report works
  </verify>
  <done>Report API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] Claude API integration working
- [ ] Structured output parsing reliable
- [ ] Reports generated with all sections
- [ ] Dimensional scoring accurate
- [ ] Recommendations actionable
- [ ] Period comparisons working
- [ ] Reports stored in database
- [ ] Generation time <2 minutes

## Files Created

- `src/meta_agent/llm/__init__.py`
- `src/meta_agent/llm/client.py`
- `src/meta_agent/evaluation/__init__.py`
- `src/meta_agent/evaluation/models.py`
- `src/meta_agent/evaluation/prompts.py`
- `src/meta_agent/evaluation/generator.py`
- `src/meta_agent/api/routes/evaluation.py`
