# Phase 14: Problem Analyzer

**Duration**: 4 days | **Complexity**: High | **Dependencies**: Phase 9, Phase 13

## Phase Overview

Analyze agent failures to identify root causes and patterns. Use LLM analysis combined with historical data to provide actionable insights.

## Success Criteria

- [ ] Error pattern classification
- [ ] Root cause analysis with LLM
- [ ] Recurring issue detection
- [ ] Impact assessment
- [ ] Remediation suggestions
- [ ] Problem timeline tracking
- [ ] Cross-agent pattern analysis

---

## Tasks

<task id="14.1" type="auto" priority="critical">
  <name>Problem Analyzer Models</name>
  <files>
    - src/meta_agent/analysis/models.py
    - src/meta_agent/analysis/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/analysis/models.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime
    from typing import Optional, List, Dict
    from decimal import Decimal

    class ProblemCategory(str, Enum):
        PROMPT_ISSUE = "prompt_issue"
        TOOL_FAILURE = "tool_failure"
        CONTEXT_OVERFLOW = "context_overflow"
        HALLUCINATION = "hallucination"
        RATE_LIMIT = "rate_limit"
        TIMEOUT = "timeout"
        VALIDATION_ERROR = "validation_error"
        EXTERNAL_API = "external_api"
        DATA_QUALITY = "data_quality"
        LOGIC_ERROR = "logic_error"
        UNKNOWN = "unknown"

    class Severity(str, Enum):
        CRITICAL = "critical"   # System-wide impact
        HIGH = "high"           # Major functionality affected
        MEDIUM = "medium"       # Some impact, workarounds exist
        LOW = "low"             # Minor issues

    class ProblemStatus(str, Enum):
        NEW = "new"
        INVESTIGATING = "investigating"
        IDENTIFIED = "identified"
        FIXING = "fixing"
        RESOLVED = "resolved"
        WONT_FIX = "wont_fix"

    @dataclass
    class Problem:
        id: str
        organization_id: str
        agent_id: str
        category: ProblemCategory
        severity: Severity
        status: ProblemStatus

        # Details
        title: str
        description: str
        root_cause: Optional[str]
        affected_executions: int
        first_seen: datetime
        last_seen: datetime

        # Impact
        error_rate_impact: float  # % increase in errors
        latency_impact: float     # % increase in latency
        cost_impact: Decimal      # Additional cost

        # Analysis
        similar_problems: List[str] = field(default_factory=list)
        related_logs: List[str] = field(default_factory=list)
        suggested_fixes: List[str] = field(default_factory=list)

        created_at: datetime = field(default_factory=datetime.utcnow)
        updated_at: datetime = field(default_factory=datetime.utcnow)
        resolved_at: Optional[datetime] = None

    @dataclass
    class ProblemAnalysis:
        problem_id: str
        analyzed_at: datetime

        # LLM Analysis
        root_cause_analysis: str
        contributing_factors: List[str]
        pattern_description: str
        confidence_score: float

        # Recommendations
        immediate_actions: List[str]
        long_term_fixes: List[str]
        prevention_measures: List[str]

        # Supporting data
        sample_errors: List[Dict]
        similar_successful: List[Dict]
        timeline: List[Dict]

    @dataclass
    class ErrorCluster:
        cluster_id: str
        agent_id: str
        error_signature: str  # Normalized error pattern
        category: ProblemCategory

        error_count: int
        first_occurrence: datetime
        last_occurrence: datetime
        sample_log_ids: List[str]

        is_resolved: bool = False
        linked_problem_id: Optional[str] = None
    ```
  </action>
  <verify>
    - All models defined
    - Categories comprehensive
    - Severity levels clear
  </verify>
  <done>Problem analyzer models</done>
</task>

<task id="14.2" type="auto" priority="critical">
  <name>Error Classifier</name>
  <files>
    - src/meta_agent/analysis/classifier.py
  </files>
  <action>
    ```python
    # src/meta_agent/analysis/classifier.py
    import re
    from typing import Dict, Any, Tuple, List
    import logging

    from .models import ProblemCategory, Severity

    logger = logging.getLogger(__name__)

    class ErrorClassifier:
        """Classify errors into categories and severity levels."""

        # Error patterns for classification
        PATTERNS = {
            ProblemCategory.RATE_LIMIT: [
                r'rate.?limit',
                r'too.?many.?requests',
                r'429',
                r'throttl',
            ],
            ProblemCategory.TIMEOUT: [
                r'timeout',
                r'timed?.?out',
                r'deadline.?exceeded',
                r'connection.?timeout',
            ],
            ProblemCategory.CONTEXT_OVERFLOW: [
                r'context.?(length|limit|overflow)',
                r'token.?limit',
                r'maximum.?context',
                r'too.?long',
            ],
            ProblemCategory.TOOL_FAILURE: [
                r'tool.?(error|fail)',
                r'function.?call.?fail',
                r'action.?error',
            ],
            ProblemCategory.VALIDATION_ERROR: [
                r'validation.?(error|fail)',
                r'invalid.?(input|output|format)',
                r'schema.?error',
                r'type.?error',
            ],
            ProblemCategory.EXTERNAL_API: [
                r'api.?(error|fail)',
                r'external.?service',
                r'upstream.?error',
                r'connection.?refused',
                r'5\d{2}',  # 5xx errors
            ],
            ProblemCategory.HALLUCINATION: [
                r'hallucination',
                r'incorrect.?fact',
                r'made.?up',
                r'fabricat',
            ],
            ProblemCategory.PROMPT_ISSUE: [
                r'prompt.?(error|issue)',
                r'instruction.?(unclear|ambiguous)',
                r'parsing.?error',
            ],
            ProblemCategory.DATA_QUALITY: [
                r'data.?(quality|corrupt|missing)',
                r'null.?pointer',
                r'missing.?field',
            ],
            ProblemCategory.LOGIC_ERROR: [
                r'logic.?error',
                r'assertion.?fail',
                r'unexpected.?state',
            ],
        }

        # Severity indicators
        SEVERITY_PATTERNS = {
            Severity.CRITICAL: [
                r'critical',
                r'fatal',
                r'system.?down',
                r'data.?loss',
                r'security',
            ],
            Severity.HIGH: [
                r'error',
                r'fail(?:ed|ure)?',
                r'crash',
                r'corrupt',
            ],
            Severity.MEDIUM: [
                r'warning',
                r'degraded',
                r'slow',
                r'retry',
            ],
            Severity.LOW: [
                r'notice',
                r'info',
                r'minor',
            ],
        }

        def classify(
            self,
            error_type: str,
            error_message: str,
            metadata: Optional[Dict[str, Any]] = None,
        ) -> Tuple[ProblemCategory, Severity]:
            """Classify an error into category and severity."""
            combined = f"{error_type} {error_message}".lower()

            # Find category
            category = self._find_category(combined)

            # Find severity
            severity = self._find_severity(combined, metadata)

            return category, severity

        def _find_category(self, text: str) -> ProblemCategory:
            """Match text against category patterns."""
            for category, patterns in self.PATTERNS.items():
                for pattern in patterns:
                    if re.search(pattern, text, re.IGNORECASE):
                        return category

            return ProblemCategory.UNKNOWN

        def _find_severity(
            self,
            text: str,
            metadata: Optional[Dict] = None,
        ) -> Severity:
            """Determine severity from text and metadata."""
            # Check metadata hints first
            if metadata:
                if metadata.get('is_critical'):
                    return Severity.CRITICAL
                if metadata.get('retry_count', 0) > 3:
                    return Severity.HIGH

            # Check text patterns
            for severity, patterns in self.SEVERITY_PATTERNS.items():
                for pattern in patterns:
                    if re.search(pattern, text, re.IGNORECASE):
                        return severity

            return Severity.MEDIUM

        def create_error_signature(
            self,
            error_type: str,
            error_message: str,
        ) -> str:
            """
            Create normalized signature for error grouping.
            Removes variable parts like IDs, timestamps, etc.
            """
            # Normalize error type
            signature = error_type

            # Extract key parts from message
            message = error_message.lower()

            # Remove variable parts
            # Remove UUIDs
            message = re.sub(
                r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
                '<UUID>',
                message
            )
            # Remove numbers
            message = re.sub(r'\b\d+\b', '<N>', message)
            # Remove file paths
            message = re.sub(r'/[\w/\.-]+', '<PATH>', message)
            # Remove URLs
            message = re.sub(r'https?://\S+', '<URL>', message)
            # Remove quotes content
            message = re.sub(r'"[^"]*"', '"<STR>"', message)
            message = re.sub(r"'[^']*'", "'<STR>'", message)

            # Truncate to reasonable length
            message = message[:200]

            return f"{signature}::{message}"

        def batch_classify(
            self,
            errors: List[Dict[str, Any]],
        ) -> Dict[ProblemCategory, List[Dict]]:
            """Classify multiple errors and group by category."""
            grouped = {cat: [] for cat in ProblemCategory}

            for error in errors:
                category, severity = self.classify(
                    error.get('error_type', ''),
                    error.get('error_message', ''),
                    error.get('metadata'),
                )
                grouped[category].append({
                    **error,
                    'category': category,
                    'severity': severity,
                    'signature': self.create_error_signature(
                        error.get('error_type', ''),
                        error.get('error_message', ''),
                    ),
                })

            return grouped
    ```
  </action>
  <verify>
    - Pattern matching works
    - Signature normalization correct
    - Severity determination reasonable
  </verify>
  <done>Error classifier with pattern matching</done>
</task>

<task id="14.3" type="auto" priority="critical">
  <name>LLM Problem Analyzer</name>
  <files>
    - src/meta_agent/analysis/llm_analyzer.py
  </files>
  <action>
    ```python
    # src/meta_agent/analysis/llm_analyzer.py
    from datetime import datetime
    from typing import List, Dict, Any, Optional
    import json
    import logging

    from .models import Problem, ProblemAnalysis, ProblemCategory
    from ..llm.client import ClaudeClient
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class LLMProblemAnalyzer:
        """Use LLM to analyze problems and generate insights."""

        ANALYSIS_PROMPT = """You are an AI agent reliability expert. Analyze the following problem affecting an AI agent.

## Problem Summary
- Category: {category}
- Severity: {severity}
- Affected Executions: {affected_count}
- Error Rate Impact: {error_rate}%
- First Seen: {first_seen}
- Last Seen: {last_seen}

## Sample Errors
{sample_errors}

## Similar Successful Executions (for comparison)
{successful_samples}

## Historical Context
{historical_context}

Provide a comprehensive analysis in the following JSON format:
{{
  "root_cause_analysis": "Detailed explanation of what's causing this problem",
  "contributing_factors": ["Factor 1", "Factor 2"],
  "pattern_description": "Description of the pattern/trend observed",
  "confidence_score": 0.85,
  "immediate_actions": ["Action that can be taken right now"],
  "long_term_fixes": ["Structural fixes for permanent resolution"],
  "prevention_measures": ["How to prevent this in the future"]
}}

Be specific and actionable. Reference the actual error messages and patterns you see."""

        def __init__(
            self,
            llm_client: ClaudeClient,
            database: Database,
        ):
            self.llm = llm_client
            self.db = database

        async def analyze_problem(
            self,
            problem: Problem,
        ) -> ProblemAnalysis:
            """Generate comprehensive analysis for a problem."""
            # Gather context
            sample_errors = await self._get_sample_errors(problem)
            successful = await self._get_similar_successful(problem)
            history = await self._get_historical_context(problem)

            # Build prompt
            prompt = self.ANALYSIS_PROMPT.format(
                category=problem.category.value,
                severity=problem.severity.value,
                affected_count=problem.affected_executions,
                error_rate=round(problem.error_rate_impact * 100, 2),
                first_seen=problem.first_seen.isoformat(),
                last_seen=problem.last_seen.isoformat(),
                sample_errors=self._format_errors(sample_errors),
                successful_samples=self._format_successful(successful),
                historical_context=self._format_history(history),
            )

            # Get LLM analysis
            response = await self.llm.complete_structured(
                prompt,
                response_format={
                    "type": "json_object",
                },
            )

            # Parse response
            analysis_data = json.loads(response)

            # Build timeline
            timeline = await self._build_timeline(problem)

            return ProblemAnalysis(
                problem_id=problem.id,
                analyzed_at=datetime.utcnow(),
                root_cause_analysis=analysis_data.get('root_cause_analysis', ''),
                contributing_factors=analysis_data.get('contributing_factors', []),
                pattern_description=analysis_data.get('pattern_description', ''),
                confidence_score=analysis_data.get('confidence_score', 0.5),
                immediate_actions=analysis_data.get('immediate_actions', []),
                long_term_fixes=analysis_data.get('long_term_fixes', []),
                prevention_measures=analysis_data.get('prevention_measures', []),
                sample_errors=sample_errors,
                similar_successful=successful,
                timeline=timeline,
            )

        async def _get_sample_errors(
            self,
            problem: Problem,
            limit: int = 5,
        ) -> List[Dict]:
            """Get sample error logs for this problem."""
            rows = await self.db.fetch_all("""
                SELECT
                    id, timestamp, error_type, error_message,
                    input, output, metadata
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND status = 'failed'
                  AND timestamp BETWEEN $2 AND $3
                ORDER BY timestamp DESC
                LIMIT $4
            """, problem.agent_id, problem.first_seen, problem.last_seen, limit)

            return [dict(r) for r in rows]

        async def _get_similar_successful(
            self,
            problem: Problem,
            limit: int = 3,
        ) -> List[Dict]:
            """Get successful executions similar to failed ones."""
            # Get an error log ID from the problem
            error_log = await self.db.fetch_one("""
                SELECT id FROM agent_execution_logs
                WHERE agent_id = $1 AND status = 'failed'
                  AND timestamp BETWEEN $2 AND $3
                LIMIT 1
            """, problem.agent_id, problem.first_seen, problem.last_seen)

            if not error_log:
                return []

            # Use similarity search
            rows = await self.db.fetch_all("""
                SELECT
                    l.id, l.timestamp, l.input, l.output
                FROM log_embeddings e
                JOIN agent_execution_logs l ON l.id = e.log_id
                WHERE l.agent_id = $1
                  AND l.status = 'success'
                  AND e.log_id != $2
                ORDER BY e.embedding <=> (
                    SELECT embedding FROM log_embeddings WHERE log_id = $2
                )
                LIMIT $3
            """, problem.agent_id, error_log['id'], limit)

            return [dict(r) for r in rows]

        async def _get_historical_context(
            self,
            problem: Problem,
        ) -> List[Dict]:
            """Get historical problem patterns for this agent."""
            rows = await self.db.fetch_all("""
                SELECT
                    category, severity, title, description,
                    affected_executions, status, resolved_at
                FROM problems
                WHERE agent_id = $1
                  AND id != $2
                  AND created_at < $3
                ORDER BY created_at DESC
                LIMIT 5
            """, problem.agent_id, problem.id, problem.created_at)

            return [dict(r) for r in rows]

        async def _build_timeline(
            self,
            problem: Problem,
        ) -> List[Dict]:
            """Build timeline of error occurrences."""
            rows = await self.db.fetch_all("""
                SELECT
                    DATE_TRUNC('hour', timestamp) as hour,
                    COUNT(*) as error_count,
                    COUNT(DISTINCT error_type) as unique_errors
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND status = 'failed'
                  AND timestamp BETWEEN $2 AND $3
                GROUP BY DATE_TRUNC('hour', timestamp)
                ORDER BY hour
            """, problem.agent_id, problem.first_seen, problem.last_seen)

            return [
                {
                    "hour": r['hour'].isoformat(),
                    "error_count": r['error_count'],
                    "unique_errors": r['unique_errors'],
                }
                for r in rows
            ]

        def _format_errors(self, errors: List[Dict]) -> str:
            """Format error samples for prompt."""
            if not errors:
                return "No sample errors available"

            parts = []
            for i, err in enumerate(errors, 1):
                parts.append(f"""
Error {i}:
- Type: {err.get('error_type', 'Unknown')}
- Message: {err.get('error_message', 'No message')[:500]}
- Input: {str(err.get('input', ''))[:200]}
- Time: {err.get('timestamp')}
""")
            return "\n".join(parts)

        def _format_successful(self, successful: List[Dict]) -> str:
            """Format successful samples for prompt."""
            if not successful:
                return "No similar successful executions found"

            parts = []
            for i, s in enumerate(successful, 1):
                parts.append(f"""
Successful {i}:
- Input: {str(s.get('input', ''))[:200]}
- Output: {str(s.get('output', ''))[:200]}
- Time: {s.get('timestamp')}
""")
            return "\n".join(parts)

        def _format_history(self, history: List[Dict]) -> str:
            """Format historical context for prompt."""
            if not history:
                return "No previous problems recorded"

            parts = []
            for h in history:
                status = "Resolved" if h.get('resolved_at') else h.get('status')
                parts.append(
                    f"- [{h.get('severity')}] {h.get('title')} "
                    f"({h.get('affected_executions')} affected) - {status}"
                )
            return "\n".join(parts)
    ```
  </action>
  <verify>
    - LLM analysis generates insights
    - Context gathering works
    - Timeline built correctly
  </verify>
  <done>LLM problem analyzer</done>
</task>

<task id="14.4" type="auto" priority="high">
  <name>Problem Detector</name>
  <files>
    - src/meta_agent/analysis/detector.py
  </files>
  <action>
    ```python
    # src/meta_agent/analysis/detector.py
    from datetime import datetime, timedelta
    from typing import List, Optional, Dict
    from uuid import uuid4
    import logging
    from collections import defaultdict

    from .models import Problem, ProblemCategory, Severity, ProblemStatus, ErrorCluster
    from .classifier import ErrorClassifier
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class ProblemDetector:
        """Detect new problems from error patterns."""

        def __init__(
            self,
            database: Database,
            classifier: Optional[ErrorClassifier] = None,
        ):
            self.db = database
            self.classifier = classifier or ErrorClassifier()

        async def detect_problems(
            self,
            agent_id: str,
            lookback_hours: int = 24,
            min_occurrences: int = 5,
        ) -> List[Problem]:
            """Detect new problems from recent errors."""
            since = datetime.utcnow() - timedelta(hours=lookback_hours)

            # Get recent errors
            errors = await self.db.fetch_all("""
                SELECT
                    id, error_type, error_message, timestamp, metadata
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND status = 'failed'
                  AND timestamp >= $2
                ORDER BY timestamp DESC
            """, agent_id, since)

            if not errors:
                return []

            # Cluster errors by signature
            clusters = self._cluster_errors(agent_id, [dict(e) for e in errors])

            # Filter clusters meeting threshold
            significant = [
                c for c in clusters
                if c.error_count >= min_occurrences
            ]

            # Check for existing problems
            new_problems = []
            for cluster in significant:
                existing = await self._find_existing_problem(cluster)
                if existing:
                    # Update existing problem
                    await self._update_problem(existing, cluster)
                else:
                    # Create new problem
                    problem = await self._create_problem(agent_id, cluster)
                    new_problems.append(problem)

            return new_problems

        def _cluster_errors(
            self,
            agent_id: str,
            errors: List[Dict],
        ) -> List[ErrorCluster]:
            """Group errors by signature."""
            clusters_map: Dict[str, ErrorCluster] = {}

            for error in errors:
                signature = self.classifier.create_error_signature(
                    error.get('error_type', ''),
                    error.get('error_message', ''),
                )
                category, _ = self.classifier.classify(
                    error.get('error_type', ''),
                    error.get('error_message', ''),
                )

                if signature in clusters_map:
                    cluster = clusters_map[signature]
                    cluster.error_count += 1
                    cluster.last_occurrence = error['timestamp']
                    if len(cluster.sample_log_ids) < 10:
                        cluster.sample_log_ids.append(error['id'])
                else:
                    clusters_map[signature] = ErrorCluster(
                        cluster_id=str(uuid4()),
                        agent_id=agent_id,
                        error_signature=signature,
                        category=category,
                        error_count=1,
                        first_occurrence=error['timestamp'],
                        last_occurrence=error['timestamp'],
                        sample_log_ids=[error['id']],
                    )

            return list(clusters_map.values())

        async def _find_existing_problem(
            self,
            cluster: ErrorCluster,
        ) -> Optional[Problem]:
            """Find existing unresolved problem matching this cluster."""
            row = await self.db.fetch_one("""
                SELECT * FROM problems
                WHERE agent_id = $1
                  AND category = $2
                  AND status NOT IN ('resolved', 'wont_fix')
                  AND first_seen >= $3 - interval '7 days'
                ORDER BY last_seen DESC
                LIMIT 1
            """, cluster.agent_id, cluster.category.value, cluster.first_occurrence)

            if row:
                return Problem(**dict(row))
            return None

        async def _update_problem(
            self,
            problem: Problem,
            cluster: ErrorCluster,
        ) -> None:
            """Update existing problem with new occurrences."""
            await self.db.execute("""
                UPDATE problems SET
                    affected_executions = affected_executions + $2,
                    last_seen = $3,
                    updated_at = NOW()
                WHERE id = $1
            """, problem.id, cluster.error_count, cluster.last_occurrence)

        async def _create_problem(
            self,
            agent_id: str,
            cluster: ErrorCluster,
        ) -> Problem:
            """Create new problem from cluster."""
            # Get organization
            agent = await self.db.fetch_one(
                "SELECT organization_id FROM agent_registry WHERE id = $1",
                agent_id
            )
            org_id = agent['organization_id'] if agent else 'unknown'

            # Determine severity based on count and category
            severity = self._determine_severity(cluster)

            # Generate title
            title = self._generate_title(cluster)

            # Calculate impact
            impact = await self._calculate_impact(agent_id, cluster)

            problem_id = str(uuid4())
            problem = Problem(
                id=problem_id,
                organization_id=org_id,
                agent_id=agent_id,
                category=cluster.category,
                severity=severity,
                status=ProblemStatus.NEW,
                title=title,
                description=f"Detected {cluster.error_count} occurrences of this error pattern",
                root_cause=None,
                affected_executions=cluster.error_count,
                first_seen=cluster.first_occurrence,
                last_seen=cluster.last_occurrence,
                error_rate_impact=impact['error_rate'],
                latency_impact=impact['latency'],
                cost_impact=impact['cost'],
                related_logs=cluster.sample_log_ids,
            )

            # Store in database
            await self.db.execute("""
                INSERT INTO problems (
                    id, organization_id, agent_id, category, severity, status,
                    title, description, affected_executions, first_seen, last_seen,
                    error_rate_impact, latency_impact, cost_impact, related_logs,
                    created_at, updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                    NOW(), NOW()
                )
            """,
                problem.id, problem.organization_id, problem.agent_id,
                problem.category.value, problem.severity.value, problem.status.value,
                problem.title, problem.description, problem.affected_executions,
                problem.first_seen, problem.last_seen, problem.error_rate_impact,
                problem.latency_impact, problem.cost_impact, problem.related_logs,
            )

            # Store cluster reference
            await self.db.execute("""
                INSERT INTO error_clusters (
                    id, agent_id, error_signature, category, error_count,
                    first_occurrence, last_occurrence, sample_log_ids,
                    linked_problem_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
                cluster.cluster_id, cluster.agent_id, cluster.error_signature,
                cluster.category.value, cluster.error_count,
                cluster.first_occurrence, cluster.last_occurrence,
                cluster.sample_log_ids, problem.id,
            )

            logger.info(f"Created new problem: {title} ({problem_id})")
            return problem

        def _determine_severity(self, cluster: ErrorCluster) -> Severity:
            """Determine severity based on cluster characteristics."""
            # High count = higher severity
            if cluster.error_count > 100:
                return Severity.CRITICAL
            if cluster.error_count > 50:
                return Severity.HIGH
            if cluster.error_count > 20:
                return Severity.MEDIUM

            # Certain categories are higher severity
            if cluster.category in (
                ProblemCategory.HALLUCINATION,
                ProblemCategory.DATA_QUALITY,
            ):
                return Severity.HIGH

            return Severity.MEDIUM

        def _generate_title(self, cluster: ErrorCluster) -> str:
            """Generate human-readable title for problem."""
            category_names = {
                ProblemCategory.PROMPT_ISSUE: "Prompt Issue",
                ProblemCategory.TOOL_FAILURE: "Tool Failure",
                ProblemCategory.CONTEXT_OVERFLOW: "Context Overflow",
                ProblemCategory.HALLUCINATION: "Hallucination Detected",
                ProblemCategory.RATE_LIMIT: "Rate Limit Exceeded",
                ProblemCategory.TIMEOUT: "Request Timeout",
                ProblemCategory.VALIDATION_ERROR: "Validation Error",
                ProblemCategory.EXTERNAL_API: "External API Issue",
                ProblemCategory.DATA_QUALITY: "Data Quality Issue",
                ProblemCategory.LOGIC_ERROR: "Logic Error",
                ProblemCategory.UNKNOWN: "Unknown Error",
            }

            base = category_names.get(cluster.category, "Error")
            # Extract key part from signature
            sig_parts = cluster.error_signature.split("::")
            if len(sig_parts) > 1:
                detail = sig_parts[1][:50]
                return f"{base}: {detail}"

            return f"{base} ({cluster.error_count} occurrences)"

        async def _calculate_impact(
            self,
            agent_id: str,
            cluster: ErrorCluster,
        ) -> Dict:
            """Calculate the impact of this problem."""
            # Get baseline metrics
            baseline = await self.db.fetch_one("""
                SELECT
                    AVG(success_rate) as baseline_success,
                    AVG(avg_latency_ms) as baseline_latency
                FROM agent_performance_metrics
                WHERE agent_id = $1
                  AND metric_date >= $2 - interval '7 days'
                  AND metric_date < $2
            """, agent_id, cluster.first_occurrence.date())

            # Get current metrics
            current = await self.db.fetch_one("""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    AVG(latency_ms) as avg_latency,
                    SUM(cost_usd) as total_cost
                FROM agent_execution_logs
                WHERE agent_id = $1
                  AND timestamp BETWEEN $2 AND $3
            """, agent_id, cluster.first_occurrence, cluster.last_occurrence)

            total = current['total'] or 1
            failed = current['failed'] or 0
            current_error_rate = failed / total

            baseline_error_rate = 1 - (baseline['baseline_success'] or 0.95)
            baseline_latency = baseline['baseline_latency'] or 1000

            return {
                'error_rate': current_error_rate - baseline_error_rate,
                'latency': (
                    ((current['avg_latency'] or baseline_latency) - baseline_latency)
                    / baseline_latency
                ),
                'cost': current['total_cost'] or 0,
            }
    ```
  </action>
  <verify>
    - Clustering works correctly
    - Problem creation with impact
    - Existing problem updates
  </verify>
  <done>Problem detector with clustering</done>
</task>

<task id="14.5" type="auto" priority="medium">
  <name>Problem API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/problems.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/problems.py
    from fastapi import APIRouter, Depends, HTTPException
    from typing import List, Optional
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/v1/problems", tags=["problems"])

    class ProblemResponse(BaseModel):
        id: str
        agent_id: str
        category: str
        severity: str
        status: str
        title: str
        description: str
        affected_executions: int
        first_seen: str
        last_seen: str

    class ProblemAnalysisResponse(BaseModel):
        root_cause_analysis: str
        contributing_factors: List[str]
        confidence_score: float
        immediate_actions: List[str]
        long_term_fixes: List[str]
        prevention_measures: List[str]

    class ProblemUpdateRequest(BaseModel):
        status: Optional[str] = None
        root_cause: Optional[str] = None

    @router.get("/", response_model=List[ProblemResponse])
    async def list_problems(
        agent_id: Optional[str] = None,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 50,
        db = Depends(get_database),
        user = Depends(get_current_user),
    ):
        """List problems with optional filters."""
        query = "SELECT * FROM problems WHERE organization_id = $1"
        params = [user.organization_id]

        if agent_id:
            params.append(agent_id)
            query += f" AND agent_id = ${len(params)}"

        if status:
            params.append(status)
            query += f" AND status = ${len(params)}"

        if severity:
            params.append(severity)
            query += f" AND severity = ${len(params)}"

        query += f" ORDER BY last_seen DESC LIMIT ${len(params) + 1}"
        params.append(limit)

        rows = await db.fetch_all(query, *params)
        return [
            {
                **dict(r),
                "first_seen": r['first_seen'].isoformat(),
                "last_seen": r['last_seen'].isoformat(),
            }
            for r in rows
        ]

    @router.get("/{problem_id}", response_model=ProblemResponse)
    async def get_problem(
        problem_id: str,
        db = Depends(get_database),
    ):
        """Get problem details."""
        row = await db.fetch_one(
            "SELECT * FROM problems WHERE id = $1",
            problem_id
        )
        if not row:
            raise HTTPException(404, "Problem not found")
        return {
            **dict(row),
            "first_seen": row['first_seen'].isoformat(),
            "last_seen": row['last_seen'].isoformat(),
        }

    @router.post("/{problem_id}/analyze", response_model=ProblemAnalysisResponse)
    async def analyze_problem(
        problem_id: str,
        analyzer = Depends(get_llm_analyzer),
        db = Depends(get_database),
    ):
        """Run LLM analysis on a problem."""
        from ..analysis.models import Problem

        row = await db.fetch_one(
            "SELECT * FROM problems WHERE id = $1",
            problem_id
        )
        if not row:
            raise HTTPException(404, "Problem not found")

        problem = Problem(**dict(row))
        analysis = await analyzer.analyze_problem(problem)

        # Store analysis
        await db.execute("""
            INSERT INTO problem_analyses (
                problem_id, analyzed_at, root_cause_analysis,
                contributing_factors, pattern_description, confidence_score,
                immediate_actions, long_term_fixes, prevention_measures
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        """,
            problem_id, analysis.analyzed_at, analysis.root_cause_analysis,
            analysis.contributing_factors, analysis.pattern_description,
            analysis.confidence_score, analysis.immediate_actions,
            analysis.long_term_fixes, analysis.prevention_measures
        )

        return analysis

    @router.patch("/{problem_id}")
    async def update_problem(
        problem_id: str,
        request: ProblemUpdateRequest,
        db = Depends(get_database),
    ):
        """Update problem status or root cause."""
        updates = []
        params = [problem_id]

        if request.status:
            params.append(request.status)
            updates.append(f"status = ${len(params)}")
            if request.status == 'resolved':
                updates.append("resolved_at = NOW()")

        if request.root_cause:
            params.append(request.root_cause)
            updates.append(f"root_cause = ${len(params)}")

        if not updates:
            raise HTTPException(400, "No updates provided")

        updates.append("updated_at = NOW()")
        query = f"UPDATE problems SET {', '.join(updates)} WHERE id = $1"

        await db.execute(query, *params)
        return {"status": "updated"}

    @router.post("/detect/{agent_id}")
    async def detect_problems(
        agent_id: str,
        lookback_hours: int = 24,
        detector = Depends(get_problem_detector),
    ):
        """Run problem detection for an agent."""
        problems = await detector.detect_problems(
            agent_id,
            lookback_hours=lookback_hours,
        )
        return {
            "detected": len(problems),
            "problems": [p.id for p in problems],
        }

    @router.get("/{problem_id}/related-logs")
    async def get_related_logs(
        problem_id: str,
        limit: int = 20,
        db = Depends(get_database),
    ):
        """Get logs related to a problem."""
        problem = await db.fetch_one(
            "SELECT related_logs FROM problems WHERE id = $1",
            problem_id
        )
        if not problem:
            raise HTTPException(404, "Problem not found")

        log_ids = problem['related_logs'][:limit]
        if not log_ids:
            return []

        rows = await db.fetch_all("""
            SELECT id, timestamp, error_type, error_message, input
            FROM agent_execution_logs
            WHERE id = ANY($1)
            ORDER BY timestamp DESC
        """, log_ids)

        return [dict(r) for r in rows]
    ```
  </action>
  <verify>
    - List/get problems works
    - Analyze endpoint triggers LLM
    - Detection endpoint works
  </verify>
  <done>Problem API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] Error classification working
- [ ] Problem detection from patterns
- [ ] LLM root cause analysis
- [ ] Impact calculation accurate
- [ ] Problem lifecycle management
- [ ] Related log retrieval
- [ ] API endpoints functional

## Files Created

- `src/meta_agent/analysis/__init__.py`
- `src/meta_agent/analysis/models.py`
- `src/meta_agent/analysis/classifier.py`
- `src/meta_agent/analysis/llm_analyzer.py`
- `src/meta_agent/analysis/detector.py`
- `src/meta_agent/api/routes/problems.py`
