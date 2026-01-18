# Phase 16: Prompt Optimizer

**Duration**: 4 days | **Complexity**: High | **Dependencies**: Phase 13, Phase 14

## Phase Overview

Automatically optimize agent prompts using performance data and LLM analysis. Generate prompt variants, test them, and recommend improvements.

## Success Criteria

- [ ] Prompt extraction from agents
- [ ] Variant generation with LLM
- [ ] Prompt testing framework
- [ ] Performance comparison
- [ ] Automatic recommendations
- [ ] Version history tracking
- [ ] Rollback capability

---

## Tasks

<task id="16.1" type="auto" priority="critical">
  <name>Prompt Optimizer Models</name>
  <files>
    - src/meta_agent/prompt/models.py
    - src/meta_agent/prompt/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/prompt/models.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime
    from typing import Optional, List, Dict

    class PromptType(str, Enum):
        SYSTEM = "system"
        USER_TEMPLATE = "user_template"
        ASSISTANT_TEMPLATE = "assistant_template"
        TOOL_DESCRIPTION = "tool_description"
        FEW_SHOT = "few_shot"

    class OptimizationGoal(str, Enum):
        ACCURACY = "accuracy"           # Improve correctness
        CONCISENESS = "conciseness"     # Reduce token usage
        CLARITY = "clarity"             # Clearer outputs
        SAFETY = "safety"               # Reduce harmful outputs
        SPEED = "speed"                 # Faster processing

    class VariantStatus(str, Enum):
        DRAFT = "draft"
        TESTING = "testing"
        APPROVED = "approved"
        DEPLOYED = "deployed"
        ARCHIVED = "archived"

    @dataclass
    class PromptVersion:
        id: str
        agent_id: str
        prompt_type: PromptType
        version: int
        content: str
        metadata: Dict = field(default_factory=dict)

        # Metrics
        token_count: int = 0
        avg_success_rate: float = 0.0
        avg_latency_ms: int = 0
        sample_size: int = 0

        is_active: bool = False
        created_at: datetime = field(default_factory=datetime.utcnow)
        created_by: str = "system"

    @dataclass
    class PromptVariant:
        id: str
        base_version_id: str
        agent_id: str
        prompt_type: PromptType

        # Variant details
        content: str
        changes_description: str
        optimization_goal: OptimizationGoal
        hypothesis: str

        # Status
        status: VariantStatus = VariantStatus.DRAFT
        created_at: datetime = field(default_factory=datetime.utcnow)

    @dataclass
    class VariantTestResult:
        variant_id: str
        tested_at: datetime
        sample_size: int

        # Performance
        success_rate: float
        avg_latency_ms: int
        token_usage: int
        error_rate: float

        # Comparison to baseline
        success_rate_delta: float
        latency_delta_pct: float
        token_delta_pct: float

        is_improvement: bool
        confidence: float

    @dataclass
    class OptimizationSession:
        id: str
        agent_id: str
        prompt_type: PromptType
        goal: OptimizationGoal

        # Progress
        variants_generated: int
        variants_tested: int
        best_variant_id: Optional[str]
        improvement_pct: float

        status: str  # running, completed, failed
        started_at: datetime
        completed_at: Optional[datetime] = None
    ```
  </action>
  <verify>
    - All models defined
    - Enums comprehensive
    - Version tracking complete
  </verify>
  <done>Prompt optimizer models</done>
</task>

<task id="16.2" type="auto" priority="critical">
  <name>Prompt Analyzer</name>
  <files>
    - src/meta_agent/prompt/analyzer.py
  </files>
  <action>
    ```python
    # src/meta_agent/prompt/analyzer.py
    from typing import Dict, List, Optional
    import json
    import logging
    import tiktoken

    from .models import PromptVersion, PromptType
    from ..llm.client import ClaudeClient
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class PromptAnalyzer:
        """Analyze prompts for optimization opportunities."""

        ANALYSIS_PROMPT = """Analyze this AI agent prompt for optimization opportunities.

## Prompt
```
{prompt_content}
```

## Prompt Type: {prompt_type}
## Current Performance
- Success Rate: {success_rate:.1%}
- Avg Latency: {latency}ms
- Token Count: {tokens}

## Recent Issues
{issues}

Provide analysis in this JSON format:
{{
  "overall_quality": 0.8,
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Weakness 1", "Weakness 2"],
  "optimization_opportunities": [
    {{
      "area": "clarity|conciseness|accuracy|safety|structure",
      "description": "What could be improved",
      "potential_impact": "high|medium|low",
      "suggested_change": "Specific suggestion"
    }}
  ],
  "token_reduction_suggestions": ["Suggestion 1"],
  "safety_concerns": ["Any safety issues"],
  "recommended_priority": "clarity|conciseness|accuracy|safety"
}}"""

        def __init__(
            self,
            llm_client: ClaudeClient,
            database: Database,
        ):
            self.llm = llm_client
            self.db = database
            self.tokenizer = tiktoken.get_encoding("cl100k_base")

        async def analyze_prompt(
            self,
            version: PromptVersion,
        ) -> Dict:
            """Analyze a prompt version for optimization opportunities."""
            # Get recent issues
            issues = await self._get_recent_issues(version.agent_id)

            prompt = self.ANALYSIS_PROMPT.format(
                prompt_content=version.content,
                prompt_type=version.prompt_type.value,
                success_rate=version.avg_success_rate,
                latency=version.avg_latency_ms,
                tokens=version.token_count,
                issues=self._format_issues(issues),
            )

            response = await self.llm.complete_structured(
                prompt,
                response_format={"type": "json_object"},
            )

            analysis = json.loads(response)
            return analysis

        async def get_current_prompts(
            self,
            agent_id: str,
        ) -> List[PromptVersion]:
            """Get current active prompts for an agent."""
            rows = await self.db.fetch_all("""
                SELECT * FROM prompt_versions
                WHERE agent_id = $1 AND is_active = true
            """, agent_id)

            return [self._row_to_version(r) for r in rows]

        async def extract_prompts_from_config(
            self,
            agent_id: str,
            config: Dict,
        ) -> List[PromptVersion]:
            """Extract and store prompts from agent configuration."""
            prompts = []
            version_num = await self._get_next_version(agent_id)

            # Extract system prompt
            if 'system_prompt' in config:
                prompts.append(await self._create_version(
                    agent_id,
                    PromptType.SYSTEM,
                    config['system_prompt'],
                    version_num,
                ))

            # Extract tool descriptions
            for tool in config.get('tools', []):
                if 'description' in tool:
                    prompts.append(await self._create_version(
                        agent_id,
                        PromptType.TOOL_DESCRIPTION,
                        tool['description'],
                        version_num,
                        {"tool_name": tool.get('name', 'unknown')},
                    ))

            # Extract few-shot examples
            for i, example in enumerate(config.get('examples', [])):
                prompts.append(await self._create_version(
                    agent_id,
                    PromptType.FEW_SHOT,
                    json.dumps(example),
                    version_num,
                    {"example_index": i},
                ))

            return prompts

        def count_tokens(self, text: str) -> int:
            """Count tokens in text."""
            return len(self.tokenizer.encode(text))

        async def _get_recent_issues(
            self,
            agent_id: str,
            limit: int = 5,
        ) -> List[Dict]:
            """Get recent issues related to the agent."""
            rows = await self.db.fetch_all("""
                SELECT error_type, error_message, COUNT(*) as count
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND status = 'failed'
                  AND timestamp >= NOW() - INTERVAL '7 days'
                GROUP BY error_type, error_message
                ORDER BY count DESC
                LIMIT $2
            """, agent_id, limit)

            return [dict(r) for r in rows]

        def _format_issues(self, issues: List[Dict]) -> str:
            """Format issues for prompt."""
            if not issues:
                return "No recent issues"

            return "\n".join([
                f"- {i['error_type']}: {i['error_message'][:100]} ({i['count']} occurrences)"
                for i in issues
            ])

        async def _create_version(
            self,
            agent_id: str,
            prompt_type: PromptType,
            content: str,
            version: int,
            metadata: Optional[Dict] = None,
        ) -> PromptVersion:
            """Create and store a prompt version."""
            from uuid import uuid4

            version_id = str(uuid4())
            token_count = self.count_tokens(content)

            await self.db.execute("""
                INSERT INTO prompt_versions (
                    id, agent_id, prompt_type, version, content,
                    metadata, token_count, is_active, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
            """,
                version_id, agent_id, prompt_type.value, version,
                content, metadata or {}, token_count
            )

            return PromptVersion(
                id=version_id,
                agent_id=agent_id,
                prompt_type=prompt_type,
                version=version,
                content=content,
                metadata=metadata or {},
                token_count=token_count,
                is_active=True,
            )

        async def _get_next_version(self, agent_id: str) -> int:
            """Get next version number for agent."""
            row = await self.db.fetch_one("""
                SELECT MAX(version) as max_version
                FROM prompt_versions
                WHERE agent_id = $1
            """, agent_id)

            return (row['max_version'] or 0) + 1

        def _row_to_version(self, row: dict) -> PromptVersion:
            """Convert database row to PromptVersion."""
            return PromptVersion(
                id=row['id'],
                agent_id=row['agent_id'],
                prompt_type=PromptType(row['prompt_type']),
                version=row['version'],
                content=row['content'],
                metadata=row.get('metadata', {}),
                token_count=row['token_count'],
                avg_success_rate=row.get('avg_success_rate', 0),
                avg_latency_ms=row.get('avg_latency_ms', 0),
                sample_size=row.get('sample_size', 0),
                is_active=row['is_active'],
                created_at=row['created_at'],
            )
    ```
  </action>
  <verify>
    - Prompt extraction works
    - Token counting accurate
    - Analysis returns useful insights
  </verify>
  <done>Prompt analyzer</done>
</task>

<task id="16.3" type="auto" priority="critical">
  <name>Variant Generator</name>
  <files>
    - src/meta_agent/prompt/generator.py
  </files>
  <action>
    ```python
    # src/meta_agent/prompt/generator.py
    from typing import List, Dict
    from uuid import uuid4
    import json
    import logging

    from .models import (
        PromptVersion, PromptVariant, OptimizationGoal, VariantStatus
    )
    from .analyzer import PromptAnalyzer
    from ..llm.client import ClaudeClient
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class VariantGenerator:
        """Generate optimized prompt variants."""

        VARIANT_PROMPT = """You are an expert prompt engineer. Generate an improved version of this prompt.

## Original Prompt
```
{original}
```

## Optimization Goal: {goal}

## Analysis Insights
{insights}

## Constraints
- Maintain the core functionality
- Keep similar structure where possible
- Preserve any critical instructions or safety measures

Generate an improved variant in this JSON format:
{{
  "improved_prompt": "The full improved prompt text",
  "changes_description": "Summary of changes made",
  "hypothesis": "Why this variant should perform better",
  "expected_improvement": {{
    "success_rate": 0.05,
    "latency_reduction_pct": -5,
    "token_reduction_pct": -10
  }}
}}

Be creative but grounded. Make meaningful improvements, not just rewording."""

        GOAL_INSTRUCTIONS = {
            OptimizationGoal.ACCURACY: """
Focus on:
- Clearer task definitions
- More specific instructions
- Better error handling guidance
- Explicit success criteria
""",
            OptimizationGoal.CONCISENESS: """
Focus on:
- Removing redundant text
- Consolidating repeated instructions
- Using more efficient phrasing
- Eliminating unnecessary examples
Target: Reduce tokens by 20-40% while maintaining functionality
""",
            OptimizationGoal.CLARITY: """
Focus on:
- Simpler language
- Better structure and organization
- Clearer step-by-step instructions
- Explicit rather than implicit requirements
""",
            OptimizationGoal.SAFETY: """
Focus on:
- Adding appropriate guardrails
- Clarifying boundaries and limitations
- Handling edge cases
- Preventing harmful or unintended outputs
""",
            OptimizationGoal.SPEED: """
Focus on:
- Reducing complexity
- Shortening instructions
- Removing unnecessary processing steps
- Streamlining decision paths
""",
        }

        def __init__(
            self,
            llm_client: ClaudeClient,
            analyzer: PromptAnalyzer,
            database: Database,
        ):
            self.llm = llm_client
            self.analyzer = analyzer
            self.db = database

        async def generate_variants(
            self,
            version: PromptVersion,
            goal: OptimizationGoal,
            count: int = 3,
        ) -> List[PromptVariant]:
            """Generate multiple variants for a prompt version."""
            # Get analysis insights
            analysis = await self.analyzer.analyze_prompt(version)

            variants = []
            for i in range(count):
                # Add slight randomization to get different variants
                variant = await self._generate_single_variant(
                    version, goal, analysis, i
                )
                if variant:
                    variants.append(variant)

            logger.info(
                f"Generated {len(variants)} variants for prompt {version.id}"
            )
            return variants

        async def _generate_single_variant(
            self,
            version: PromptVersion,
            goal: OptimizationGoal,
            analysis: Dict,
            attempt: int,
        ) -> PromptVariant:
            """Generate a single variant."""
            # Build insights from analysis
            insights = self._format_insights(analysis, goal)

            # Add variation instruction based on attempt
            variation_hints = [
                "Create a significantly restructured version.",
                "Focus on subtle refinements while preserving structure.",
                "Try a more creative approach to achieve the goal.",
            ]

            prompt = self.VARIANT_PROMPT.format(
                original=version.content,
                goal=f"{goal.value}\n{self.GOAL_INSTRUCTIONS[goal]}\n{variation_hints[attempt % len(variation_hints)]}",
                insights=insights,
            )

            response = await self.llm.complete_structured(
                prompt,
                response_format={"type": "json_object"},
            )

            data = json.loads(response)

            # Create variant
            variant = PromptVariant(
                id=str(uuid4()),
                base_version_id=version.id,
                agent_id=version.agent_id,
                prompt_type=version.prompt_type,
                content=data['improved_prompt'],
                changes_description=data['changes_description'],
                optimization_goal=goal,
                hypothesis=data['hypothesis'],
                status=VariantStatus.DRAFT,
            )

            # Store variant
            await self._store_variant(variant)

            return variant

        async def generate_ab_variants(
            self,
            version: PromptVersion,
        ) -> List[PromptVariant]:
            """Generate variants for A/B testing across multiple goals."""
            variants = []

            for goal in [
                OptimizationGoal.ACCURACY,
                OptimizationGoal.CONCISENESS,
            ]:
                goal_variants = await self.generate_variants(
                    version, goal, count=1
                )
                variants.extend(goal_variants)

            return variants

        def _format_insights(
            self,
            analysis: Dict,
            goal: OptimizationGoal,
        ) -> str:
            """Format analysis insights for prompt."""
            parts = []

            # Relevant weaknesses
            weaknesses = analysis.get('weaknesses', [])
            if weaknesses:
                parts.append("Weaknesses to address:")
                for w in weaknesses:
                    parts.append(f"  - {w}")

            # Relevant opportunities
            opportunities = [
                o for o in analysis.get('optimization_opportunities', [])
                if o.get('area', '').lower() in goal.value.lower() or
                   o.get('potential_impact') == 'high'
            ]
            if opportunities:
                parts.append("\nRelevant optimization opportunities:")
                for o in opportunities:
                    parts.append(f"  - {o['description']}")
                    if o.get('suggested_change'):
                        parts.append(f"    Suggestion: {o['suggested_change']}")

            # Token suggestions for conciseness goal
            if goal == OptimizationGoal.CONCISENESS:
                suggestions = analysis.get('token_reduction_suggestions', [])
                if suggestions:
                    parts.append("\nToken reduction suggestions:")
                    for s in suggestions:
                        parts.append(f"  - {s}")

            return "\n".join(parts) if parts else "No specific insights available"

        async def _store_variant(self, variant: PromptVariant) -> None:
            """Store variant in database."""
            await self.db.execute("""
                INSERT INTO prompt_variants (
                    id, base_version_id, agent_id, prompt_type,
                    content, changes_description, optimization_goal,
                    hypothesis, status, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            """,
                variant.id, variant.base_version_id, variant.agent_id,
                variant.prompt_type.value, variant.content,
                variant.changes_description, variant.optimization_goal.value,
                variant.hypothesis, variant.status.value,
            )
    ```
  </action>
  <verify>
    - Variant generation works
    - Multiple goals supported
    - Variants stored correctly
  </verify>
  <done>Variant generator with LLM</done>
</task>

<task id="16.4" type="auto" priority="high">
  <name>Prompt Tester</name>
  <files>
    - src/meta_agent/prompt/tester.py
  </files>
  <action>
    ```python
    # src/meta_agent/prompt/tester.py
    from datetime import datetime, timedelta
    from typing import List, Optional, Dict
    import logging
    import asyncio

    from .models import (
        PromptVariant, VariantTestResult, PromptVersion, VariantStatus
    )
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class PromptTester:
        """Test prompt variants against baseline."""

        def __init__(self, database: Database):
            self.db = database

        async def run_test(
            self,
            variant: PromptVariant,
            test_duration_hours: int = 24,
            min_samples: int = 100,
        ) -> VariantTestResult:
            """
            Run A/B test for a variant.
            Uses shadow testing approach - variant runs alongside baseline.
            """
            # Update variant status
            await self._update_status(variant.id, VariantStatus.TESTING)

            # Get baseline metrics
            baseline = await self._get_version(variant.base_version_id)
            baseline_metrics = await self._get_baseline_metrics(baseline)

            # Wait for test period or min samples
            await self._wait_for_samples(
                variant.id,
                min_samples,
                timedelta(hours=test_duration_hours),
            )

            # Collect variant metrics
            variant_metrics = await self._collect_variant_metrics(variant.id)

            # Calculate comparison
            result = self._compare_metrics(
                baseline_metrics, variant_metrics, variant.id
            )

            # Store result
            await self._store_result(result)

            # Update status based on result
            new_status = (
                VariantStatus.APPROVED if result.is_improvement
                else VariantStatus.ARCHIVED
            )
            await self._update_status(variant.id, new_status)

            return result

        async def quick_test(
            self,
            variant: PromptVariant,
            test_cases: List[Dict],
        ) -> Dict:
            """
            Quick evaluation using predefined test cases.
            Doesn't require live traffic.
            """
            baseline = await self._get_version(variant.base_version_id)

            results = {
                'baseline': {'successes': 0, 'failures': 0, 'total_tokens': 0},
                'variant': {'successes': 0, 'failures': 0, 'total_tokens': 0},
            }

            for test_case in test_cases:
                # Test baseline
                baseline_result = await self._evaluate_prompt(
                    baseline.content, test_case
                )
                results['baseline']['successes'] += int(baseline_result['success'])
                results['baseline']['failures'] += int(not baseline_result['success'])
                results['baseline']['total_tokens'] += baseline_result['tokens']

                # Test variant
                variant_result = await self._evaluate_prompt(
                    variant.content, test_case
                )
                results['variant']['successes'] += int(variant_result['success'])
                results['variant']['failures'] += int(not variant_result['success'])
                results['variant']['total_tokens'] += variant_result['tokens']

            # Calculate summary
            total = len(test_cases)
            return {
                'baseline_success_rate': results['baseline']['successes'] / total,
                'variant_success_rate': results['variant']['successes'] / total,
                'baseline_avg_tokens': results['baseline']['total_tokens'] / total,
                'variant_avg_tokens': results['variant']['total_tokens'] / total,
                'is_improvement': (
                    results['variant']['successes'] > results['baseline']['successes']
                ),
            }

        async def _get_baseline_metrics(
            self,
            version: PromptVersion,
        ) -> Dict:
            """Get baseline metrics from historical data."""
            row = await self.db.fetch_one("""
                SELECT
                    COUNT(*) as sample_size,
                    AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_rate,
                    AVG(latency_ms) as avg_latency,
                    AVG(token_count) as avg_tokens,
                    AVG(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as error_rate
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND prompt_version_id = $2
                  AND timestamp >= NOW() - INTERVAL '7 days'
            """, version.agent_id, version.id)

            return {
                'sample_size': row['sample_size'] or 0,
                'success_rate': row['success_rate'] or 0,
                'avg_latency': row['avg_latency'] or 0,
                'avg_tokens': row['avg_tokens'] or 0,
                'error_rate': row['error_rate'] or 0,
            }

        async def _collect_variant_metrics(
            self,
            variant_id: str,
        ) -> Dict:
            """Collect metrics for a variant during testing."""
            row = await self.db.fetch_one("""
                SELECT
                    COUNT(*) as sample_size,
                    AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_rate,
                    AVG(latency_ms) as avg_latency,
                    AVG(token_count) as avg_tokens,
                    AVG(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as error_rate
                FROM agent_execution_logs
                WHERE prompt_variant_id = $1
            """, variant_id)

            return {
                'sample_size': row['sample_size'] or 0,
                'success_rate': row['success_rate'] or 0,
                'avg_latency': row['avg_latency'] or 0,
                'avg_tokens': row['avg_tokens'] or 0,
                'error_rate': row['error_rate'] or 0,
            }

        def _compare_metrics(
            self,
            baseline: Dict,
            variant: Dict,
            variant_id: str,
        ) -> VariantTestResult:
            """Compare variant metrics against baseline."""
            success_delta = variant['success_rate'] - baseline['success_rate']

            latency_delta = (
                (variant['avg_latency'] - baseline['avg_latency'])
                / baseline['avg_latency'] * 100
                if baseline['avg_latency'] > 0 else 0
            )

            token_delta = (
                (variant['avg_tokens'] - baseline['avg_tokens'])
                / baseline['avg_tokens'] * 100
                if baseline['avg_tokens'] > 0 else 0
            )

            # Determine if improvement
            # Improvement = better success rate OR
            # (same success rate AND lower latency/tokens)
            is_improvement = (
                success_delta > 0.02 or  # 2% success improvement
                (abs(success_delta) < 0.02 and latency_delta < -5) or
                (abs(success_delta) < 0.02 and token_delta < -10)
            )

            # Calculate confidence based on sample size
            min_samples = 100
            total_samples = variant['sample_size'] + baseline['sample_size']
            confidence = min(1.0, total_samples / (min_samples * 2))

            return VariantTestResult(
                variant_id=variant_id,
                tested_at=datetime.utcnow(),
                sample_size=variant['sample_size'],
                success_rate=variant['success_rate'],
                avg_latency_ms=int(variant['avg_latency']),
                token_usage=int(variant['avg_tokens']),
                error_rate=variant['error_rate'],
                success_rate_delta=success_delta,
                latency_delta_pct=latency_delta,
                token_delta_pct=token_delta,
                is_improvement=is_improvement,
                confidence=confidence,
            )

        async def _wait_for_samples(
            self,
            variant_id: str,
            min_samples: int,
            max_duration: timedelta,
        ) -> None:
            """Wait until we have enough samples or time runs out."""
            end_time = datetime.utcnow() + max_duration
            check_interval = 300  # 5 minutes

            while datetime.utcnow() < end_time:
                row = await self.db.fetch_one("""
                    SELECT COUNT(*) as count
                    FROM agent_execution_logs
                    WHERE prompt_variant_id = $1
                """, variant_id)

                if (row['count'] or 0) >= min_samples:
                    logger.info(
                        f"Variant {variant_id} reached {min_samples} samples"
                    )
                    return

                await asyncio.sleep(check_interval)

            logger.warning(
                f"Variant {variant_id} test timed out before reaching {min_samples} samples"
            )

        async def _evaluate_prompt(
            self,
            prompt: str,
            test_case: Dict,
        ) -> Dict:
            """Evaluate a prompt against a test case."""
            # This would call the LLM and evaluate the response
            # Simplified implementation
            return {
                'success': True,  # Would be determined by evaluation
                'tokens': len(prompt.split()),  # Simplified
            }

        async def _get_version(self, version_id: str) -> PromptVersion:
            """Get prompt version."""
            row = await self.db.fetch_one(
                "SELECT * FROM prompt_versions WHERE id = $1",
                version_id
            )
            from .analyzer import PromptAnalyzer
            return PromptVersion(**dict(row))

        async def _update_status(
            self,
            variant_id: str,
            status: VariantStatus,
        ) -> None:
            """Update variant status."""
            await self.db.execute("""
                UPDATE prompt_variants SET status = $2, updated_at = NOW()
                WHERE id = $1
            """, variant_id, status.value)

        async def _store_result(self, result: VariantTestResult) -> None:
            """Store test result."""
            await self.db.execute("""
                INSERT INTO variant_test_results (
                    variant_id, tested_at, sample_size, success_rate,
                    avg_latency_ms, token_usage, error_rate,
                    success_rate_delta, latency_delta_pct, token_delta_pct,
                    is_improvement, confidence
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
                )
            """,
                result.variant_id, result.tested_at, result.sample_size,
                result.success_rate, result.avg_latency_ms, result.token_usage,
                result.error_rate, result.success_rate_delta,
                result.latency_delta_pct, result.token_delta_pct,
                result.is_improvement, result.confidence,
            )
    ```
  </action>
  <verify>
    - Testing framework works
    - Metrics comparison accurate
    - Improvement detection reasonable
  </verify>
  <done>Prompt tester with A/B testing</done>
</task>

<task id="16.5" type="auto" priority="medium">
  <name>Prompt API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/prompts.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/prompts.py
    from fastapi import APIRouter, Depends, HTTPException
    from typing import List, Optional
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/v1/prompts", tags=["prompts"])

    class PromptVersionResponse(BaseModel):
        id: str
        agent_id: str
        prompt_type: str
        version: int
        content: str
        token_count: int
        is_active: bool

    class VariantResponse(BaseModel):
        id: str
        agent_id: str
        content: str
        changes_description: str
        optimization_goal: str
        hypothesis: str
        status: str

    class TestResultResponse(BaseModel):
        variant_id: str
        success_rate: float
        avg_latency_ms: int
        is_improvement: bool
        confidence: float

    class GenerateVariantsRequest(BaseModel):
        version_id: str
        goal: str = "accuracy"
        count: int = 3

    @router.get("/versions/{agent_id}", response_model=List[PromptVersionResponse])
    async def list_versions(
        agent_id: str,
        active_only: bool = True,
        db = Depends(get_database),
    ):
        """List prompt versions for an agent."""
        query = "SELECT * FROM prompt_versions WHERE agent_id = $1"
        if active_only:
            query += " AND is_active = true"
        query += " ORDER BY version DESC"

        rows = await db.fetch_all(query, agent_id)
        return [dict(r) for r in rows]

    @router.get("/versions/{version_id}/analyze")
    async def analyze_version(
        version_id: str,
        analyzer = Depends(get_prompt_analyzer),
        db = Depends(get_database),
    ):
        """Analyze a prompt version for optimization opportunities."""
        from ..prompt.models import PromptVersion

        row = await db.fetch_one(
            "SELECT * FROM prompt_versions WHERE id = $1",
            version_id
        )
        if not row:
            raise HTTPException(404, "Version not found")

        version = PromptVersion(**dict(row))
        analysis = await analyzer.analyze_prompt(version)
        return analysis

    @router.post("/variants/generate", response_model=List[VariantResponse])
    async def generate_variants(
        request: GenerateVariantsRequest,
        generator = Depends(get_variant_generator),
        db = Depends(get_database),
    ):
        """Generate optimized variants for a prompt."""
        from ..prompt.models import OptimizationGoal

        row = await db.fetch_one(
            "SELECT * FROM prompt_versions WHERE id = $1",
            request.version_id
        )
        if not row:
            raise HTTPException(404, "Version not found")

        from ..prompt.models import PromptVersion
        version = PromptVersion(**dict(row))

        goal = OptimizationGoal(request.goal)
        variants = await generator.generate_variants(
            version, goal, count=request.count
        )

        return [v.__dict__ for v in variants]

    @router.get("/variants/{agent_id}", response_model=List[VariantResponse])
    async def list_variants(
        agent_id: str,
        status: Optional[str] = None,
        db = Depends(get_database),
    ):
        """List variants for an agent."""
        query = "SELECT * FROM prompt_variants WHERE agent_id = $1"
        params = [agent_id]

        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"

        query += " ORDER BY created_at DESC"

        rows = await db.fetch_all(query, *params)
        return [dict(r) for r in rows]

    @router.post("/variants/{variant_id}/test", response_model=TestResultResponse)
    async def test_variant(
        variant_id: str,
        duration_hours: int = 24,
        min_samples: int = 100,
        tester = Depends(get_prompt_tester),
        db = Depends(get_database),
    ):
        """Run A/B test for a variant."""
        from ..prompt.models import PromptVariant

        row = await db.fetch_one(
            "SELECT * FROM prompt_variants WHERE id = $1",
            variant_id
        )
        if not row:
            raise HTTPException(404, "Variant not found")

        variant = PromptVariant(**dict(row))
        result = await tester.run_test(
            variant,
            test_duration_hours=duration_hours,
            min_samples=min_samples,
        )

        return {
            "variant_id": result.variant_id,
            "success_rate": result.success_rate,
            "avg_latency_ms": result.avg_latency_ms,
            "is_improvement": result.is_improvement,
            "confidence": result.confidence,
        }

    @router.post("/variants/{variant_id}/deploy")
    async def deploy_variant(
        variant_id: str,
        db = Depends(get_database),
    ):
        """Deploy a variant as the active prompt."""
        # Get variant
        variant = await db.fetch_one(
            "SELECT * FROM prompt_variants WHERE id = $1",
            variant_id
        )
        if not variant:
            raise HTTPException(404, "Variant not found")

        if variant['status'] != 'approved':
            raise HTTPException(400, "Can only deploy approved variants")

        # Deactivate current active version
        await db.execute("""
            UPDATE prompt_versions SET is_active = false
            WHERE agent_id = $1 AND prompt_type = $2 AND is_active = true
        """, variant['agent_id'], variant['prompt_type'])

        # Create new version from variant
        from uuid import uuid4
        new_version_id = str(uuid4())

        await db.execute("""
            INSERT INTO prompt_versions (
                id, agent_id, prompt_type, version, content,
                token_count, is_active, created_at, created_by
            )
            SELECT
                $1, agent_id, prompt_type,
                (SELECT COALESCE(MAX(version), 0) + 1 FROM prompt_versions WHERE agent_id = $2),
                content, LENGTH(content), true, NOW(), 'optimizer'
            FROM prompt_variants WHERE id = $3
        """, new_version_id, variant['agent_id'], variant_id)

        # Update variant status
        await db.execute("""
            UPDATE prompt_variants SET status = 'deployed' WHERE id = $1
        """, variant_id)

        return {"status": "deployed", "new_version_id": new_version_id}

    @router.get("/history/{agent_id}")
    async def get_prompt_history(
        agent_id: str,
        prompt_type: Optional[str] = None,
        limit: int = 20,
        db = Depends(get_database),
    ):
        """Get prompt version history for an agent."""
        query = """
            SELECT v.*, r.success_rate_delta, r.is_improvement
            FROM prompt_versions v
            LEFT JOIN variant_test_results r ON r.variant_id = (
                SELECT id FROM prompt_variants WHERE base_version_id = v.id
                ORDER BY created_at DESC LIMIT 1
            )
            WHERE v.agent_id = $1
        """
        params = [agent_id]

        if prompt_type:
            params.append(prompt_type)
            query += f" AND v.prompt_type = ${len(params)}"

        query += f" ORDER BY v.version DESC LIMIT ${len(params) + 1}"
        params.append(limit)

        rows = await db.fetch_all(query, *params)
        return [dict(r) for r in rows]
    ```
  </action>
  <verify>
    - Version listing works
    - Variant generation works
    - Testing and deployment works
  </verify>
  <done>Prompt API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] Prompt extraction from agents
- [ ] Analysis and optimization insights
- [ ] Variant generation working
- [ ] A/B testing framework
- [ ] Improvement detection
- [ ] Deployment workflow
- [ ] Version history tracking

## Files Created

- `src/meta_agent/prompt/__init__.py`
- `src/meta_agent/prompt/models.py`
- `src/meta_agent/prompt/analyzer.py`
- `src/meta_agent/prompt/generator.py`
- `src/meta_agent/prompt/tester.py`
- `src/meta_agent/api/routes/prompts.py`
