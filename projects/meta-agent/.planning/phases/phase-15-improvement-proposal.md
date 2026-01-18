# Phase 15: Improvement Proposal Generator

**Duration**: 4 days | **Complexity**: High | **Dependencies**: Phase 14, Phase 9

## Phase Overview

Generate actionable improvement proposals based on problem analysis and performance data. Combine LLM insights with quantitative metrics to prioritize improvements.

## Success Criteria

- [ ] Proposal generation from problems
- [ ] Priority scoring algorithm
- [ ] Effort estimation
- [ ] Impact prediction
- [ ] Proposal lifecycle management
- [ ] Implementation tracking
- [ ] ROI calculation

---

## Tasks

<task id="15.1" type="auto" priority="critical">
  <name>Improvement Proposal Models</name>
  <files>
    - src/meta_agent/improvement/models.py
    - src/meta_agent/improvement/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/improvement/models.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime
    from typing import Optional, List, Dict
    from decimal import Decimal

    class ProposalType(str, Enum):
        PROMPT_OPTIMIZATION = "prompt_optimization"
        TOOL_IMPROVEMENT = "tool_improvement"
        ARCHITECTURE_CHANGE = "architecture_change"
        ERROR_HANDLING = "error_handling"
        PERFORMANCE_TUNING = "performance_tuning"
        COST_REDUCTION = "cost_reduction"
        QUALITY_IMPROVEMENT = "quality_improvement"
        NEW_CAPABILITY = "new_capability"

    class ProposalStatus(str, Enum):
        DRAFT = "draft"
        PROPOSED = "proposed"
        APPROVED = "approved"
        IN_PROGRESS = "in_progress"
        TESTING = "testing"
        COMPLETED = "completed"
        REJECTED = "rejected"

    class EffortLevel(str, Enum):
        TRIVIAL = "trivial"       # < 1 hour
        SMALL = "small"           # 1-4 hours
        MEDIUM = "medium"         # 1-2 days
        LARGE = "large"           # 3-5 days
        MAJOR = "major"           # 1+ weeks

    @dataclass
    class ImpactEstimate:
        success_rate_delta: float      # Expected change in success rate
        latency_delta_pct: float       # Expected change in latency (%)
        cost_delta_pct: float          # Expected change in cost (%)
        quality_score_delta: float     # Expected change in quality
        confidence: float              # Confidence in estimates (0-1)

    @dataclass
    class ImprovementProposal:
        id: str
        organization_id: str
        agent_id: str

        # Classification
        type: ProposalType
        status: ProposalStatus
        priority_score: float  # 0-100, higher = more important

        # Details
        title: str
        description: str
        rationale: str
        implementation_plan: List[str]
        success_criteria: List[str]

        # Effort & Impact
        effort: EffortLevel
        impact: ImpactEstimate
        estimated_hours: float

        # Source
        source_problem_id: Optional[str] = None
        source_analysis_id: Optional[str] = None
        related_proposals: List[str] = field(default_factory=list)

        # Metadata
        created_at: datetime = field(default_factory=datetime.utcnow)
        approved_at: Optional[datetime] = None
        completed_at: Optional[datetime] = None
        created_by: str = "system"

    @dataclass
    class ProposalResult:
        proposal_id: str
        measured_at: datetime

        # Actual impact
        actual_success_rate_delta: float
        actual_latency_delta_pct: float
        actual_cost_delta_pct: float

        # Comparison
        met_expectations: bool
        variance_explanation: str

        # Learnings
        lessons_learned: List[str]
        follow_up_actions: List[str]

    @dataclass
    class ImprovementRoadmap:
        agent_id: str
        generated_at: datetime
        proposals: List[ImprovementProposal]
        estimated_total_impact: ImpactEstimate
        estimated_total_hours: float
        priority_order: List[str]  # Proposal IDs in priority order
    ```
  </action>
  <verify>
    - All models defined
    - Enums comprehensive
    - Impact tracking complete
  </verify>
  <done>Improvement proposal models</done>
</task>

<task id="15.2" type="auto" priority="critical">
  <name>Proposal Generator</name>
  <files>
    - src/meta_agent/improvement/generator.py
  </files>
  <action>
    ```python
    # src/meta_agent/improvement/generator.py
    from datetime import datetime
    from typing import List, Dict, Optional
    from uuid import uuid4
    import json
    import logging

    from .models import (
        ImprovementProposal, ProposalType, ProposalStatus,
        EffortLevel, ImpactEstimate
    )
    from ..analysis.models import Problem, ProblemAnalysis, ProblemCategory
    from ..llm.client import ClaudeClient
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class ProposalGenerator:
        """Generate improvement proposals from problem analyses."""

        GENERATION_PROMPT = """You are an AI agent improvement expert. Based on the following problem analysis, generate specific, actionable improvement proposals.

## Problem
- Title: {title}
- Category: {category}
- Severity: {severity}
- Affected Executions: {affected_count}

## Root Cause Analysis
{root_cause}

## Contributing Factors
{factors}

## Suggested Fixes from Analysis
- Immediate: {immediate}
- Long-term: {long_term}
- Prevention: {prevention}

## Agent Context
- Agent Type: {agent_type}
- Current Performance: {current_performance}

Generate 1-3 improvement proposals in this JSON format:
{{
  "proposals": [
    {{
      "type": "prompt_optimization|tool_improvement|architecture_change|error_handling|performance_tuning|cost_reduction|quality_improvement|new_capability",
      "title": "Short, actionable title",
      "description": "Detailed description of the improvement",
      "rationale": "Why this improvement will help",
      "implementation_plan": ["Step 1", "Step 2", "Step 3"],
      "success_criteria": ["Measurable criterion 1", "Criterion 2"],
      "effort": "trivial|small|medium|large|major",
      "estimated_hours": 4,
      "impact": {{
        "success_rate_delta": 0.05,
        "latency_delta_pct": -10,
        "cost_delta_pct": -5,
        "quality_score_delta": 0.1,
        "confidence": 0.7
      }}
    }}
  ]
}}

Be specific and realistic. Focus on the highest-impact improvements first."""

        CATEGORY_TO_TYPE = {
            ProblemCategory.PROMPT_ISSUE: ProposalType.PROMPT_OPTIMIZATION,
            ProblemCategory.TOOL_FAILURE: ProposalType.TOOL_IMPROVEMENT,
            ProblemCategory.CONTEXT_OVERFLOW: ProposalType.ARCHITECTURE_CHANGE,
            ProblemCategory.HALLUCINATION: ProposalType.QUALITY_IMPROVEMENT,
            ProblemCategory.RATE_LIMIT: ProposalType.PERFORMANCE_TUNING,
            ProblemCategory.TIMEOUT: ProposalType.PERFORMANCE_TUNING,
            ProblemCategory.VALIDATION_ERROR: ProposalType.ERROR_HANDLING,
            ProblemCategory.EXTERNAL_API: ProposalType.ERROR_HANDLING,
            ProblemCategory.DATA_QUALITY: ProposalType.QUALITY_IMPROVEMENT,
            ProblemCategory.LOGIC_ERROR: ProposalType.ARCHITECTURE_CHANGE,
        }

        def __init__(
            self,
            llm_client: ClaudeClient,
            database: Database,
        ):
            self.llm = llm_client
            self.db = database

        async def generate_from_problem(
            self,
            problem: Problem,
            analysis: ProblemAnalysis,
        ) -> List[ImprovementProposal]:
            """Generate proposals from a problem and its analysis."""
            # Get agent context
            agent_context = await self._get_agent_context(problem.agent_id)

            # Build prompt
            prompt = self.GENERATION_PROMPT.format(
                title=problem.title,
                category=problem.category.value,
                severity=problem.severity.value,
                affected_count=problem.affected_executions,
                root_cause=analysis.root_cause_analysis,
                factors="\n".join(f"- {f}" for f in analysis.contributing_factors),
                immediate=", ".join(analysis.immediate_actions),
                long_term=", ".join(analysis.long_term_fixes),
                prevention=", ".join(analysis.prevention_measures),
                agent_type=agent_context.get('type', 'Unknown'),
                current_performance=self._format_performance(agent_context),
            )

            # Generate proposals
            response = await self.llm.complete_structured(
                prompt,
                response_format={"type": "json_object"},
            )

            data = json.loads(response)
            proposals = []

            for p in data.get('proposals', []):
                proposal = self._create_proposal(
                    problem, analysis, p
                )
                await self._store_proposal(proposal)
                proposals.append(proposal)

            logger.info(f"Generated {len(proposals)} proposals for problem {problem.id}")
            return proposals

        async def generate_proactive(
            self,
            agent_id: str,
        ) -> List[ImprovementProposal]:
            """Generate proactive improvements based on performance data."""
            # Get performance trends
            trends = await self._get_performance_trends(agent_id)

            if not trends:
                return []

            prompt = f"""You are an AI agent improvement expert. Based on the following performance trends, suggest proactive improvements.

## Performance Trends (Last 30 Days)
- Success Rate: {trends['success_rate']:.2%} (trend: {trends['success_trend']})
- Avg Latency: {trends['avg_latency']}ms (trend: {trends['latency_trend']})
- Avg Cost: ${trends['avg_cost']:.4f}/execution (trend: {trends['cost_trend']})
- Error Distribution: {trends['top_errors']}

## Current Bottlenecks
{trends['bottlenecks']}

Generate 1-2 proactive improvement proposals in JSON format:
{{
  "proposals": [...]
}}

Focus on preventing future problems and optimizing performance."""

            response = await self.llm.complete_structured(
                prompt,
                response_format={"type": "json_object"},
            )

            data = json.loads(response)
            proposals = []

            for p in data.get('proposals', []):
                proposal = self._create_proactive_proposal(agent_id, p)
                await self._store_proposal(proposal)
                proposals.append(proposal)

            return proposals

        def _create_proposal(
            self,
            problem: Problem,
            analysis: ProblemAnalysis,
            data: Dict,
        ) -> ImprovementProposal:
            """Create proposal from LLM output."""
            impact_data = data.get('impact', {})

            return ImprovementProposal(
                id=str(uuid4()),
                organization_id=problem.organization_id,
                agent_id=problem.agent_id,
                type=ProposalType(data.get('type', 'quality_improvement')),
                status=ProposalStatus.PROPOSED,
                priority_score=self._calculate_priority(problem, impact_data),
                title=data.get('title', 'Untitled Improvement'),
                description=data.get('description', ''),
                rationale=data.get('rationale', ''),
                implementation_plan=data.get('implementation_plan', []),
                success_criteria=data.get('success_criteria', []),
                effort=EffortLevel(data.get('effort', 'medium')),
                impact=ImpactEstimate(
                    success_rate_delta=impact_data.get('success_rate_delta', 0),
                    latency_delta_pct=impact_data.get('latency_delta_pct', 0),
                    cost_delta_pct=impact_data.get('cost_delta_pct', 0),
                    quality_score_delta=impact_data.get('quality_score_delta', 0),
                    confidence=impact_data.get('confidence', 0.5),
                ),
                estimated_hours=data.get('estimated_hours', 8),
                source_problem_id=problem.id,
                source_analysis_id=analysis.problem_id,
            )

        def _create_proactive_proposal(
            self,
            agent_id: str,
            data: Dict,
        ) -> ImprovementProposal:
            """Create proactive proposal."""
            impact_data = data.get('impact', {})

            return ImprovementProposal(
                id=str(uuid4()),
                organization_id='',  # Will be set from agent lookup
                agent_id=agent_id,
                type=ProposalType(data.get('type', 'performance_tuning')),
                status=ProposalStatus.PROPOSED,
                priority_score=50,  # Default for proactive
                title=data.get('title', 'Proactive Improvement'),
                description=data.get('description', ''),
                rationale=data.get('rationale', ''),
                implementation_plan=data.get('implementation_plan', []),
                success_criteria=data.get('success_criteria', []),
                effort=EffortLevel(data.get('effort', 'medium')),
                impact=ImpactEstimate(
                    success_rate_delta=impact_data.get('success_rate_delta', 0),
                    latency_delta_pct=impact_data.get('latency_delta_pct', 0),
                    cost_delta_pct=impact_data.get('cost_delta_pct', 0),
                    quality_score_delta=impact_data.get('quality_score_delta', 0),
                    confidence=impact_data.get('confidence', 0.5),
                ),
                estimated_hours=data.get('estimated_hours', 8),
                created_by="proactive_analyzer",
            )

        def _calculate_priority(
            self,
            problem: Problem,
            impact: Dict,
        ) -> float:
            """Calculate priority score (0-100)."""
            score = 0

            # Severity weight (0-30)
            severity_weights = {
                'critical': 30,
                'high': 22,
                'medium': 15,
                'low': 8,
            }
            score += severity_weights.get(problem.severity.value, 15)

            # Affected executions weight (0-25)
            if problem.affected_executions > 1000:
                score += 25
            elif problem.affected_executions > 100:
                score += 18
            elif problem.affected_executions > 10:
                score += 10
            else:
                score += 5

            # Impact weight (0-30)
            success_impact = abs(impact.get('success_rate_delta', 0)) * 100
            score += min(30, success_impact * 3)

            # Confidence weight (0-15)
            confidence = impact.get('confidence', 0.5)
            score += confidence * 15

            return min(100, max(0, score))

        async def _store_proposal(self, proposal: ImprovementProposal) -> None:
            """Store proposal in database."""
            await self.db.execute("""
                INSERT INTO improvement_proposals (
                    id, organization_id, agent_id, type, status, priority_score,
                    title, description, rationale, implementation_plan,
                    success_criteria, effort, estimated_hours,
                    impact_success_rate, impact_latency, impact_cost,
                    impact_quality, impact_confidence,
                    source_problem_id, source_analysis_id, created_at, created_by
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                    $14, $15, $16, $17, $18, $19, $20, NOW(), $21
                )
            """,
                proposal.id, proposal.organization_id, proposal.agent_id,
                proposal.type.value, proposal.status.value, proposal.priority_score,
                proposal.title, proposal.description, proposal.rationale,
                proposal.implementation_plan, proposal.success_criteria,
                proposal.effort.value, proposal.estimated_hours,
                proposal.impact.success_rate_delta, proposal.impact.latency_delta_pct,
                proposal.impact.cost_delta_pct, proposal.impact.quality_score_delta,
                proposal.impact.confidence, proposal.source_problem_id,
                proposal.source_analysis_id, proposal.created_by,
            )

        async def _get_agent_context(self, agent_id: str) -> Dict:
            """Get agent context for proposal generation."""
            agent = await self.db.fetch_one(
                "SELECT * FROM agent_registry WHERE id = $1",
                agent_id
            )

            metrics = await self.db.fetch_one("""
                SELECT
                    AVG(success_rate) as avg_success,
                    AVG(avg_latency_ms) as avg_latency,
                    AVG(avg_cost_per_execution) as avg_cost
                FROM agent_performance_metrics
                WHERE agent_id = $1
                  AND metric_date >= CURRENT_DATE - 7
            """, agent_id)

            return {
                'type': agent.get('type', 'Unknown') if agent else 'Unknown',
                'success_rate': metrics.get('avg_success', 0) if metrics else 0,
                'avg_latency': metrics.get('avg_latency', 0) if metrics else 0,
                'avg_cost': metrics.get('avg_cost', 0) if metrics else 0,
            }

        async def _get_performance_trends(self, agent_id: str) -> Optional[Dict]:
            """Get performance trends for proactive analysis."""
            rows = await self.db.fetch_all("""
                SELECT
                    metric_date,
                    success_rate,
                    avg_latency_ms,
                    avg_cost_per_execution,
                    error_distribution
                FROM agent_performance_metrics
                WHERE agent_id = $1
                  AND metric_date >= CURRENT_DATE - 30
                ORDER BY metric_date
            """, agent_id)

            if len(rows) < 7:
                return None

            # Calculate trends
            recent = rows[-7:]  # Last 7 days
            earlier = rows[:7]  # First 7 days

            def trend(recent_avg, earlier_avg):
                if earlier_avg == 0:
                    return "stable"
                diff = (recent_avg - earlier_avg) / earlier_avg
                if diff > 0.1:
                    return "increasing"
                elif diff < -0.1:
                    return "decreasing"
                return "stable"

            recent_success = sum(r['success_rate'] for r in recent) / len(recent)
            earlier_success = sum(r['success_rate'] for r in earlier) / len(earlier)

            recent_latency = sum(r['avg_latency_ms'] for r in recent) / len(recent)
            earlier_latency = sum(r['avg_latency_ms'] for r in earlier) / len(earlier)

            recent_cost = sum(float(r['avg_cost_per_execution'] or 0) for r in recent) / len(recent)
            earlier_cost = sum(float(r['avg_cost_per_execution'] or 0) for r in earlier) / len(earlier)

            # Aggregate errors
            all_errors = {}
            for r in rows:
                for err, count in (r['error_distribution'] or {}).items():
                    all_errors[err] = all_errors.get(err, 0) + count

            top_errors = sorted(all_errors.items(), key=lambda x: -x[1])[:5]

            # Identify bottlenecks
            bottlenecks = []
            if recent_success < 0.95:
                bottlenecks.append(f"Success rate below 95% ({recent_success:.1%})")
            if recent_latency > 2000:
                bottlenecks.append(f"High latency ({recent_latency:.0f}ms)")

            return {
                'success_rate': recent_success,
                'success_trend': trend(recent_success, earlier_success),
                'avg_latency': recent_latency,
                'latency_trend': trend(recent_latency, earlier_latency),
                'avg_cost': recent_cost,
                'cost_trend': trend(recent_cost, earlier_cost),
                'top_errors': ", ".join(f"{e[0]}: {e[1]}" for e in top_errors),
                'bottlenecks': "\n".join(f"- {b}" for b in bottlenecks) or "None identified",
            }

        def _format_performance(self, context: Dict) -> str:
            """Format performance context for prompt."""
            return (
                f"Success: {context.get('success_rate', 0):.1%}, "
                f"Latency: {context.get('avg_latency', 0):.0f}ms, "
                f"Cost: ${context.get('avg_cost', 0):.4f}/exec"
            )
    ```
  </action>
  <verify>
    - Proposal generation works
    - Priority calculation reasonable
    - Proactive analysis works
  </verify>
  <done>Proposal generator with LLM</done>
</task>

<task id="15.3" type="auto" priority="high">
  <name>Proposal Prioritizer</name>
  <files>
    - src/meta_agent/improvement/prioritizer.py
  </files>
  <action>
    ```python
    # src/meta_agent/improvement/prioritizer.py
    from typing import List, Dict, Tuple
    from datetime import datetime
    import logging

    from .models import (
        ImprovementProposal, ImprovementRoadmap, ImpactEstimate,
        EffortLevel, ProposalStatus
    )
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    EFFORT_HOURS = {
        EffortLevel.TRIVIAL: 0.5,
        EffortLevel.SMALL: 2,
        EffortLevel.MEDIUM: 12,
        EffortLevel.LARGE: 32,
        EffortLevel.MAJOR: 80,
    }

    class ProposalPrioritizer:
        """Prioritize and sequence improvement proposals."""

        def __init__(self, database: Database):
            self.db = database

        async def generate_roadmap(
            self,
            agent_id: str,
            time_budget_hours: float = 40,
        ) -> ImprovementRoadmap:
            """Generate prioritized improvement roadmap."""
            # Get all proposed improvements
            proposals = await self._get_pending_proposals(agent_id)

            if not proposals:
                return ImprovementRoadmap(
                    agent_id=agent_id,
                    generated_at=datetime.utcnow(),
                    proposals=[],
                    estimated_total_impact=ImpactEstimate(0, 0, 0, 0, 0),
                    estimated_total_hours=0,
                    priority_order=[],
                )

            # Score and rank proposals
            scored = self._score_proposals(proposals)

            # Select proposals within budget (knapsack-like)
            selected = self._select_within_budget(scored, time_budget_hours)

            # Calculate combined impact
            total_impact = self._combine_impacts([p for p, _ in selected])
            total_hours = sum(p.estimated_hours for p, _ in selected)

            return ImprovementRoadmap(
                agent_id=agent_id,
                generated_at=datetime.utcnow(),
                proposals=[p for p, _ in selected],
                estimated_total_impact=total_impact,
                estimated_total_hours=total_hours,
                priority_order=[p.id for p, _ in selected],
            )

        def _score_proposals(
            self,
            proposals: List[ImprovementProposal],
        ) -> List[Tuple[ImprovementProposal, float]]:
            """Score proposals by value/effort ratio."""
            scored = []

            for p in proposals:
                # Value = weighted sum of impacts
                value = (
                    p.impact.success_rate_delta * 100 * 2 +  # High weight
                    abs(p.impact.latency_delta_pct) * 0.5 +
                    abs(p.impact.cost_delta_pct) * 0.3 +
                    p.impact.quality_score_delta * 50
                ) * p.impact.confidence

                # Effort in hours
                effort = p.estimated_hours or EFFORT_HOURS.get(p.effort, 8)

                # Value per hour
                ratio = value / max(effort, 0.5)

                # Boost by existing priority
                final_score = ratio * (1 + p.priority_score / 100)

                scored.append((p, final_score))

            # Sort by score descending
            scored.sort(key=lambda x: -x[1])
            return scored

        def _select_within_budget(
            self,
            scored: List[Tuple[ImprovementProposal, float]],
            budget_hours: float,
        ) -> List[Tuple[ImprovementProposal, float]]:
            """Select proposals that fit within time budget."""
            selected = []
            remaining_budget = budget_hours

            for proposal, score in scored:
                hours = proposal.estimated_hours or EFFORT_HOURS.get(proposal.effort, 8)

                if hours <= remaining_budget:
                    selected.append((proposal, score))
                    remaining_budget -= hours

                if remaining_budget <= 0:
                    break

            return selected

        def _combine_impacts(
            self,
            proposals: List[ImprovementProposal],
        ) -> ImpactEstimate:
            """Combine impacts from multiple proposals."""
            if not proposals:
                return ImpactEstimate(0, 0, 0, 0, 0)

            # Simple summation with diminishing returns
            success = sum(p.impact.success_rate_delta for p in proposals)
            latency = sum(p.impact.latency_delta_pct for p in proposals)
            cost = sum(p.impact.cost_delta_pct for p in proposals)
            quality = sum(p.impact.quality_score_delta for p in proposals)

            # Apply diminishing returns (can't exceed 100%)
            success = min(0.5, success)
            latency = max(-50, min(50, latency))
            cost = max(-50, min(50, cost))
            quality = min(0.5, quality)

            # Average confidence
            avg_confidence = sum(p.impact.confidence for p in proposals) / len(proposals)

            return ImpactEstimate(
                success_rate_delta=success,
                latency_delta_pct=latency,
                cost_delta_pct=cost,
                quality_score_delta=quality,
                confidence=avg_confidence,
            )

        async def _get_pending_proposals(
            self,
            agent_id: str,
        ) -> List[ImprovementProposal]:
            """Get proposals that haven't been implemented yet."""
            rows = await self.db.fetch_all("""
                SELECT * FROM improvement_proposals
                WHERE agent_id = $1
                  AND status IN ('proposed', 'approved')
                ORDER BY priority_score DESC
            """, agent_id)

            return [self._row_to_proposal(r) for r in rows]

        def _row_to_proposal(self, row: dict) -> ImprovementProposal:
            """Convert database row to proposal."""
            return ImprovementProposal(
                id=row['id'],
                organization_id=row['organization_id'],
                agent_id=row['agent_id'],
                type=row['type'],
                status=ProposalStatus(row['status']),
                priority_score=row['priority_score'],
                title=row['title'],
                description=row['description'],
                rationale=row['rationale'],
                implementation_plan=row['implementation_plan'],
                success_criteria=row['success_criteria'],
                effort=EffortLevel(row['effort']),
                impact=ImpactEstimate(
                    success_rate_delta=row['impact_success_rate'],
                    latency_delta_pct=row['impact_latency'],
                    cost_delta_pct=row['impact_cost'],
                    quality_score_delta=row['impact_quality'],
                    confidence=row['impact_confidence'],
                ),
                estimated_hours=row['estimated_hours'],
                source_problem_id=row.get('source_problem_id'),
                created_at=row['created_at'],
            )

        async def reorder_by_dependencies(
            self,
            proposals: List[ImprovementProposal],
        ) -> List[ImprovementProposal]:
            """Reorder proposals respecting dependencies."""
            # Get dependencies from database
            dep_map = {}
            for p in proposals:
                deps = await self.db.fetch_all("""
                    SELECT depends_on_id FROM proposal_dependencies
                    WHERE proposal_id = $1
                """, p.id)
                dep_map[p.id] = [d['depends_on_id'] for d in deps]

            # Topological sort
            ordered = []
            visited = set()

            def visit(proposal_id: str):
                if proposal_id in visited:
                    return
                visited.add(proposal_id)
                for dep_id in dep_map.get(proposal_id, []):
                    visit(dep_id)
                proposal = next((p for p in proposals if p.id == proposal_id), None)
                if proposal:
                    ordered.append(proposal)

            for p in proposals:
                visit(p.id)

            return ordered
    ```
  </action>
  <verify>
    - Scoring algorithm reasonable
    - Budget constraint respected
    - Dependency ordering works
  </verify>
  <done>Proposal prioritizer with roadmap generation</done>
</task>

<task id="15.4" type="auto" priority="medium">
  <name>Proposal Tracker</name>
  <files>
    - src/meta_agent/improvement/tracker.py
  </files>
  <action>
    ```python
    # src/meta_agent/improvement/tracker.py
    from datetime import datetime, timedelta
    from typing import Optional, List, Dict
    import logging
    from decimal import Decimal

    from .models import (
        ImprovementProposal, ProposalResult, ProposalStatus
    )
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class ProposalTracker:
        """Track proposal implementation and measure results."""

        def __init__(self, database: Database):
            self.db = database

        async def start_implementation(
            self,
            proposal_id: str,
        ) -> ImprovementProposal:
            """Mark proposal as in progress."""
            await self.db.execute("""
                UPDATE improvement_proposals
                SET status = 'in_progress', updated_at = NOW()
                WHERE id = $1
            """, proposal_id)

            # Capture baseline metrics
            proposal = await self._get_proposal(proposal_id)
            baseline = await self._capture_baseline(proposal.agent_id)

            await self.db.execute("""
                INSERT INTO proposal_baselines (
                    proposal_id, captured_at,
                    baseline_success_rate, baseline_latency, baseline_cost
                ) VALUES ($1, NOW(), $2, $3, $4)
            """, proposal_id, baseline['success_rate'],
                baseline['latency'], baseline['cost'])

            return proposal

        async def mark_testing(
            self,
            proposal_id: str,
        ) -> ImprovementProposal:
            """Mark proposal as in testing phase."""
            await self.db.execute("""
                UPDATE improvement_proposals
                SET status = 'testing', updated_at = NOW()
                WHERE id = $1
            """, proposal_id)
            return await self._get_proposal(proposal_id)

        async def complete_implementation(
            self,
            proposal_id: str,
            wait_days: int = 7,
        ) -> ProposalResult:
            """
            Complete proposal and measure results.
            Waits for sufficient data before measuring.
            """
            proposal = await self._get_proposal(proposal_id)

            # Update status
            await self.db.execute("""
                UPDATE improvement_proposals
                SET status = 'completed', completed_at = NOW(), updated_at = NOW()
                WHERE id = $1
            """, proposal_id)

            # Get baseline
            baseline = await self.db.fetch_one("""
                SELECT * FROM proposal_baselines WHERE proposal_id = $1
            """, proposal_id)

            # Get current metrics (after implementation)
            current = await self._get_current_metrics(
                proposal.agent_id, wait_days
            )

            # Calculate deltas
            success_delta = current['success_rate'] - baseline['baseline_success_rate']
            latency_delta = (
                (current['latency'] - baseline['baseline_latency'])
                / baseline['baseline_latency'] * 100
                if baseline['baseline_latency'] > 0 else 0
            )
            cost_delta = (
                (current['cost'] - baseline['baseline_cost'])
                / baseline['baseline_cost'] * 100
                if baseline['baseline_cost'] > 0 else 0
            )

            # Check if met expectations
            expected = proposal.impact
            met_expectations = (
                success_delta >= expected.success_rate_delta * 0.7 and
                latency_delta <= expected.latency_delta_pct * 1.3
            )

            # Generate variance explanation
            variance = self._explain_variance(
                expected, success_delta, latency_delta, cost_delta
            )

            result = ProposalResult(
                proposal_id=proposal_id,
                measured_at=datetime.utcnow(),
                actual_success_rate_delta=success_delta,
                actual_latency_delta_pct=latency_delta,
                actual_cost_delta_pct=cost_delta,
                met_expectations=met_expectations,
                variance_explanation=variance,
                lessons_learned=[],
                follow_up_actions=[],
            )

            # Store result
            await self.db.execute("""
                INSERT INTO proposal_results (
                    proposal_id, measured_at,
                    actual_success_rate_delta, actual_latency_delta,
                    actual_cost_delta, met_expectations, variance_explanation
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            """,
                result.proposal_id, result.measured_at,
                result.actual_success_rate_delta, result.actual_latency_delta_pct,
                result.actual_cost_delta_pct, result.met_expectations,
                result.variance_explanation
            )

            logger.info(
                f"Proposal {proposal_id} completed. "
                f"Met expectations: {met_expectations}"
            )

            return result

        async def reject_proposal(
            self,
            proposal_id: str,
            reason: str,
        ) -> None:
            """Reject a proposal."""
            await self.db.execute("""
                UPDATE improvement_proposals
                SET status = 'rejected', rejection_reason = $2, updated_at = NOW()
                WHERE id = $1
            """, proposal_id, reason)

        async def get_implementation_progress(
            self,
            agent_id: str,
        ) -> Dict:
            """Get implementation progress for an agent."""
            stats = await self.db.fetch_one("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'completed') as completed,
                    COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
                    COUNT(*) FILTER (WHERE status = 'proposed') as proposed,
                    COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
                    SUM(estimated_hours) FILTER (WHERE status = 'completed') as hours_spent,
                    SUM(estimated_hours) FILTER (WHERE status IN ('proposed', 'approved')) as hours_remaining
                FROM improvement_proposals
                WHERE agent_id = $1
            """, agent_id)

            # Get success rate of completed proposals
            results = await self.db.fetch_one("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE met_expectations = true) as successful
                FROM proposal_results pr
                JOIN improvement_proposals ip ON ip.id = pr.proposal_id
                WHERE ip.agent_id = $1
            """, agent_id)

            success_rate = (
                results['successful'] / results['total']
                if results['total'] > 0 else 0
            )

            return {
                'completed': stats['completed'] or 0,
                'in_progress': stats['in_progress'] or 0,
                'proposed': stats['proposed'] or 0,
                'rejected': stats['rejected'] or 0,
                'hours_spent': stats['hours_spent'] or 0,
                'hours_remaining': stats['hours_remaining'] or 0,
                'success_rate': success_rate,
            }

        async def _capture_baseline(self, agent_id: str) -> Dict:
            """Capture current metrics as baseline."""
            row = await self.db.fetch_one("""
                SELECT
                    AVG(success_rate) as success_rate,
                    AVG(avg_latency_ms) as latency,
                    AVG(avg_cost_per_execution) as cost
                FROM agent_performance_metrics
                WHERE agent_id = $1
                  AND metric_date >= CURRENT_DATE - 7
            """, agent_id)

            return {
                'success_rate': float(row['success_rate'] or 0),
                'latency': float(row['latency'] or 0),
                'cost': float(row['cost'] or 0),
            }

        async def _get_current_metrics(
            self,
            agent_id: str,
            days: int,
        ) -> Dict:
            """Get metrics for recent period."""
            row = await self.db.fetch_one("""
                SELECT
                    AVG(success_rate) as success_rate,
                    AVG(avg_latency_ms) as latency,
                    AVG(avg_cost_per_execution) as cost
                FROM agent_performance_metrics
                WHERE agent_id = $1
                  AND metric_date >= CURRENT_DATE - $2
            """, agent_id, days)

            return {
                'success_rate': float(row['success_rate'] or 0),
                'latency': float(row['latency'] or 0),
                'cost': float(row['cost'] or 0),
            }

        async def _get_proposal(self, proposal_id: str) -> ImprovementProposal:
            """Fetch proposal from database."""
            row = await self.db.fetch_one(
                "SELECT * FROM improvement_proposals WHERE id = $1",
                proposal_id
            )
            if not row:
                raise ValueError(f"Proposal {proposal_id} not found")
            return self._row_to_proposal(dict(row))

        def _row_to_proposal(self, row: dict) -> ImprovementProposal:
            """Convert row to proposal."""
            from .models import ImpactEstimate, ProposalType, EffortLevel
            return ImprovementProposal(
                id=row['id'],
                organization_id=row['organization_id'],
                agent_id=row['agent_id'],
                type=ProposalType(row['type']),
                status=ProposalStatus(row['status']),
                priority_score=row['priority_score'],
                title=row['title'],
                description=row['description'],
                rationale=row['rationale'],
                implementation_plan=row['implementation_plan'],
                success_criteria=row['success_criteria'],
                effort=EffortLevel(row['effort']),
                impact=ImpactEstimate(
                    success_rate_delta=row['impact_success_rate'],
                    latency_delta_pct=row['impact_latency'],
                    cost_delta_pct=row['impact_cost'],
                    quality_score_delta=row['impact_quality'],
                    confidence=row['impact_confidence'],
                ),
                estimated_hours=row['estimated_hours'],
                created_at=row['created_at'],
            )

        def _explain_variance(
            self,
            expected,
            success_delta: float,
            latency_delta: float,
            cost_delta: float,
        ) -> str:
            """Explain variance between expected and actual."""
            parts = []

            success_var = success_delta - expected.success_rate_delta
            if abs(success_var) > 0.01:
                direction = "higher" if success_var > 0 else "lower"
                parts.append(
                    f"Success rate improvement {direction} than expected "
                    f"({success_delta:.2%} vs {expected.success_rate_delta:.2%})"
                )

            latency_var = latency_delta - expected.latency_delta_pct
            if abs(latency_var) > 5:
                direction = "better" if latency_var < 0 else "worse"
                parts.append(
                    f"Latency {direction} than expected "
                    f"({latency_delta:.1f}% vs {expected.latency_delta_pct:.1f}%)"
                )

            return "; ".join(parts) if parts else "Results matched expectations"
    ```
  </action>
  <verify>
    - Lifecycle tracking works
    - Result measurement accurate
    - Variance explanation helpful
  </verify>
  <done>Proposal tracker with result measurement</done>
</task>

<task id="15.5" type="auto" priority="medium">
  <name>Improvement API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/improvements.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/improvements.py
    from fastapi import APIRouter, Depends, HTTPException
    from typing import List, Optional
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/v1/improvements", tags=["improvements"])

    class ProposalResponse(BaseModel):
        id: str
        agent_id: str
        type: str
        status: str
        priority_score: float
        title: str
        description: str
        effort: str
        estimated_hours: float

    class RoadmapResponse(BaseModel):
        agent_id: str
        proposals: List[ProposalResponse]
        total_hours: float
        priority_order: List[str]

    class ProposalUpdateRequest(BaseModel):
        status: Optional[str] = None

    @router.get("/proposals", response_model=List[ProposalResponse])
    async def list_proposals(
        agent_id: Optional[str] = None,
        status: Optional[str] = None,
        type: Optional[str] = None,
        limit: int = 50,
        db = Depends(get_database),
        user = Depends(get_current_user),
    ):
        """List improvement proposals with filters."""
        query = "SELECT * FROM improvement_proposals WHERE organization_id = $1"
        params = [user.organization_id]

        if agent_id:
            params.append(agent_id)
            query += f" AND agent_id = ${len(params)}"

        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"

        if type:
            params.append(type)
            query += f" AND type = ${len(params)}"

        query += f" ORDER BY priority_score DESC LIMIT ${len(params) + 1}"
        params.append(limit)

        rows = await db.fetch_all(query, *params)
        return [dict(r) for r in rows]

    @router.get("/proposals/{proposal_id}", response_model=ProposalResponse)
    async def get_proposal(
        proposal_id: str,
        db = Depends(get_database),
    ):
        """Get proposal details."""
        row = await db.fetch_one(
            "SELECT * FROM improvement_proposals WHERE id = $1",
            proposal_id
        )
        if not row:
            raise HTTPException(404, "Proposal not found")
        return dict(row)

    @router.post("/proposals/{proposal_id}/approve")
    async def approve_proposal(
        proposal_id: str,
        db = Depends(get_database),
    ):
        """Approve a proposal for implementation."""
        await db.execute("""
            UPDATE improvement_proposals
            SET status = 'approved', approved_at = NOW()
            WHERE id = $1
        """, proposal_id)
        return {"status": "approved"}

    @router.post("/proposals/{proposal_id}/start")
    async def start_implementation(
        proposal_id: str,
        tracker = Depends(get_proposal_tracker),
    ):
        """Start implementing a proposal."""
        proposal = await tracker.start_implementation(proposal_id)
        return {"status": "in_progress", "proposal_id": proposal.id}

    @router.post("/proposals/{proposal_id}/complete")
    async def complete_proposal(
        proposal_id: str,
        wait_days: int = 7,
        tracker = Depends(get_proposal_tracker),
    ):
        """Complete proposal and measure results."""
        result = await tracker.complete_implementation(proposal_id, wait_days)
        return {
            "status": "completed",
            "met_expectations": result.met_expectations,
            "actual_success_delta": result.actual_success_rate_delta,
            "actual_latency_delta": result.actual_latency_delta_pct,
            "variance_explanation": result.variance_explanation,
        }

    @router.post("/proposals/{proposal_id}/reject")
    async def reject_proposal(
        proposal_id: str,
        reason: str,
        tracker = Depends(get_proposal_tracker),
    ):
        """Reject a proposal."""
        await tracker.reject_proposal(proposal_id, reason)
        return {"status": "rejected"}

    @router.get("/roadmap/{agent_id}", response_model=RoadmapResponse)
    async def get_roadmap(
        agent_id: str,
        budget_hours: float = 40,
        prioritizer = Depends(get_prioritizer),
    ):
        """Generate prioritized improvement roadmap."""
        roadmap = await prioritizer.generate_roadmap(agent_id, budget_hours)
        return {
            "agent_id": roadmap.agent_id,
            "proposals": [p.__dict__ for p in roadmap.proposals],
            "total_hours": roadmap.estimated_total_hours,
            "priority_order": roadmap.priority_order,
        }

    @router.get("/progress/{agent_id}")
    async def get_progress(
        agent_id: str,
        tracker = Depends(get_proposal_tracker),
    ):
        """Get implementation progress for an agent."""
        return await tracker.get_implementation_progress(agent_id)

    @router.post("/generate/{problem_id}")
    async def generate_from_problem(
        problem_id: str,
        generator = Depends(get_proposal_generator),
        db = Depends(get_database),
    ):
        """Generate proposals from a problem."""
        from ..analysis.models import Problem, ProblemAnalysis

        # Get problem and analysis
        problem_row = await db.fetch_one(
            "SELECT * FROM problems WHERE id = $1",
            problem_id
        )
        if not problem_row:
            raise HTTPException(404, "Problem not found")

        analysis_row = await db.fetch_one(
            "SELECT * FROM problem_analyses WHERE problem_id = $1 ORDER BY analyzed_at DESC LIMIT 1",
            problem_id
        )
        if not analysis_row:
            raise HTTPException(400, "Problem has not been analyzed yet")

        problem = Problem(**dict(problem_row))
        analysis = ProblemAnalysis(**dict(analysis_row))

        proposals = await generator.generate_from_problem(problem, analysis)
        return {
            "generated": len(proposals),
            "proposals": [p.id for p in proposals],
        }

    @router.post("/generate/proactive/{agent_id}")
    async def generate_proactive(
        agent_id: str,
        generator = Depends(get_proposal_generator),
    ):
        """Generate proactive improvement proposals."""
        proposals = await generator.generate_proactive(agent_id)
        return {
            "generated": len(proposals),
            "proposals": [p.id for p in proposals],
        }
    ```
  </action>
  <verify>
    - CRUD operations work
    - Roadmap generation works
    - Progress tracking works
  </verify>
  <done>Improvement API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] Proposal generation from problems
- [ ] Priority scoring algorithm
- [ ] Roadmap generation with budget
- [ ] Implementation tracking
- [ ] Result measurement
- [ ] ROI tracking
- [ ] API endpoints functional

## Files Created

- `src/meta_agent/improvement/__init__.py`
- `src/meta_agent/improvement/models.py`
- `src/meta_agent/improvement/generator.py`
- `src/meta_agent/improvement/prioritizer.py`
- `src/meta_agent/improvement/tracker.py`
- `src/meta_agent/api/routes/improvements.py`
