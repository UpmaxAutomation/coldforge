# Phase 2: Core Models & Database Client

## Phase Metadata

| Field | Value |
|-------|-------|
| **Phase Number** | 2 |
| **Phase Name** | Core Models & Database Client |
| **Duration** | 3 days |
| **Complexity** | Medium |
| **Dependencies** | Phase 1 |
| **Parallel With** | None |

## Objective

Build comprehensive Pydantic models for all database entities and create an async Supabase client wrapper with all CRUD operations.

## Context

These models and database client will be used throughout the entire application. They must be well-typed, validated, and efficient. The database client needs to handle connection pooling, retries, and common query patterns.

---

## Tasks

<task id="2.1" type="auto" priority="critical">
  <name>Create Core Entity Models</name>
  <files>
    - meta_agent/core/models.py
  </files>
  <context>
    Pydantic models matching the database schema for the main entities.
  </context>
  <action>
    Create models.py with:

    ```python
    from pydantic import BaseModel, Field, ConfigDict
    from typing import Optional, List, Dict, Any
    from uuid import UUID
    from datetime import datetime, date
    from decimal import Decimal
    from enum import Enum

    # Enums
    class AgentStatus(str, Enum):
        ACTIVE = "active"
        PAUSED = "paused"
        DEPRECATED = "deprecated"
        TESTING = "testing"
        IMPROVING = "improving"

    class AgentCategory(str, Enum):
        CLIENT_SUCCESS = "client_success"
        MARKETING = "marketing"
        SALES = "sales"
        OPERATIONS = "operations"
        INTERNAL = "internal"

    class ActionType(str, Enum):
        TOOL_CALL = "tool_call"
        LLM_INFERENCE = "llm_inference"
        HUMAN_APPROVAL_REQUEST = "human_approval_request"
        STATE_TRANSITION = "state_transition"
        EXECUTION_START = "execution_start"
        EXECUTION_END = "execution_end"

    class ExecutionStatus(str, Enum):
        SUCCESS = "success"
        FAILURE = "failure"
        PENDING = "pending"
        PENDING_APPROVAL = "pending_approval"
        TIMEOUT = "timeout"

    class HealthStatus(str, Enum):
        HEALTHY = "healthy"
        DEGRADED = "degraded"
        CRITICAL = "critical"
        OFFLINE = "offline"

    class CircuitState(str, Enum):
        CLOSED = "closed"
        OPEN = "open"
        HALF_OPEN = "half_open"

    class RiskLevel(str, Enum):
        LOW = "low"
        MEDIUM = "medium"
        HIGH = "high"
        CRITICAL = "critical"

    class ProposalStatus(str, Enum):
        PROPOSED = "proposed"
        APPROVED = "approved"
        REJECTED = "rejected"
        TESTING = "testing"
        DEPLOYED = "deployed"
        ROLLED_BACK = "rolled_back"

    class AlertSeverity(str, Enum):
        INFO = "info"
        WARNING = "warning"
        CRITICAL = "critical"
        EMERGENCY = "emergency"

    # Base model with common config
    class BaseDBModel(BaseModel):
        model_config = ConfigDict(from_attributes=True)

    # Agent Registry
    class AgentBase(BaseDBModel):
        agent_name: str
        display_name: str
        description: Optional[str] = None
        category: AgentCategory
        version: str = "1.0.0"
        status: AgentStatus = AgentStatus.ACTIVE
        owner_email: Optional[str] = None
        slack_channel: Optional[str] = None
        target_success_rate: Decimal = Decimal("95.00")
        target_avg_latency_ms: int = 5000
        target_cost_per_execution: Decimal = Decimal("0.10")
        metadata: Dict[str, Any] = Field(default_factory=dict)

    class AgentCreate(AgentBase):
        organization_id: UUID

    class AgentUpdate(BaseDBModel):
        display_name: Optional[str] = None
        description: Optional[str] = None
        status: Optional[AgentStatus] = None
        owner_email: Optional[str] = None
        slack_channel: Optional[str] = None
        target_success_rate: Optional[Decimal] = None
        target_avg_latency_ms: Optional[int] = None
        target_cost_per_execution: Optional[Decimal] = None
        metadata: Optional[Dict[str, Any]] = None

    class Agent(AgentBase):
        id: UUID
        organization_id: UUID
        current_health_score: Decimal = Decimal("100.00")
        last_health_check: Optional[datetime] = None
        consecutive_failures: int = 0
        created_at: datetime
        updated_at: datetime

    # Agent Prompts
    class AgentPromptBase(BaseDBModel):
        version: str
        system_prompt: str
        tool_definitions: Optional[Dict[str, Any]] = None
        few_shot_examples: Optional[List[Dict[str, Any]]] = None
        model_name: str = "claude-sonnet-4-20250514"
        temperature: Decimal = Decimal("0.7")
        max_tokens: int = 4096
        configuration: Dict[str, Any] = Field(default_factory=dict)

    class AgentPromptCreate(AgentPromptBase):
        agent_id: UUID
        organization_id: UUID
        created_by: Optional[str] = None
        change_reason: Optional[str] = None

    class AgentPrompt(AgentPromptBase):
        id: UUID
        agent_id: UUID
        organization_id: UUID
        is_active: bool = False
        is_baseline: bool = False
        parent_version_id: Optional[UUID] = None
        total_executions: int = 0
        successful_executions: int = 0
        avg_quality_score: Optional[Decimal] = None
        created_at: datetime
        created_by: Optional[str] = None
        change_reason: Optional[str] = None

    # Execution Logs
    class ExecutionLogBase(BaseDBModel):
        execution_id: UUID
        action_type: ActionType
        action_name: Optional[str] = None
        input_data: Optional[Dict[str, Any]] = None
        output_data: Optional[Dict[str, Any]] = None
        latency_ms: Optional[int] = None
        token_count_input: Optional[int] = None
        token_count_output: Optional[int] = None
        estimated_cost_usd: Optional[Decimal] = None
        status: ExecutionStatus = ExecutionStatus.SUCCESS
        error_message: Optional[str] = None
        error_type: Optional[str] = None
        error_stack_trace: Optional[str] = None
        related_entity_type: Optional[str] = None
        related_entity_id: Optional[UUID] = None
        user_id: Optional[UUID] = None
        metadata: Dict[str, Any] = Field(default_factory=dict)

    class ExecutionLogCreate(ExecutionLogBase):
        agent_id: UUID
        prompt_version_id: Optional[UUID] = None
        organization_id: UUID

    class ExecutionLog(ExecutionLogBase):
        id: UUID
        agent_id: UUID
        prompt_version_id: Optional[UUID] = None
        organization_id: UUID
        timestamp: datetime
        quality_score: Optional[Decimal] = None
        quality_feedback: Optional[str] = None
        reviewed_by: Optional[str] = None
        reviewed_at: Optional[datetime] = None

    # Performance Metrics
    class PerformanceMetrics(BaseDBModel):
        id: UUID
        agent_id: UUID
        prompt_version_id: Optional[UUID] = None
        organization_id: UUID
        date: date
        total_executions: int = 0
        successful_executions: int = 0
        failed_executions: int = 0
        timeout_executions: int = 0
        avg_latency_ms: Optional[Decimal] = None
        p50_latency_ms: Optional[Decimal] = None
        p95_latency_ms: Optional[Decimal] = None
        p99_latency_ms: Optional[Decimal] = None
        total_cost_usd: Decimal = Decimal("0")
        cost_per_execution: Optional[Decimal] = None
        total_tokens_input: int = 0
        total_tokens_output: int = 0
        avg_quality_score: Optional[Decimal] = None
        human_interventions: int = 0
        unique_error_types: int = 0
        most_common_error: Optional[str] = None
        error_distribution: Optional[Dict[str, int]] = None

    class PerformanceMetricsCreate(BaseDBModel):
        agent_id: UUID
        prompt_version_id: Optional[UUID] = None
        organization_id: UUID
        date: date
        total_executions: int
        successful_executions: int
        failed_executions: int
        timeout_executions: int
        avg_latency_ms: Optional[Decimal] = None
        p50_latency_ms: Optional[Decimal] = None
        p95_latency_ms: Optional[Decimal] = None
        p99_latency_ms: Optional[Decimal] = None
        total_cost_usd: Decimal
        total_tokens_input: int
        total_tokens_output: int
        avg_quality_score: Optional[Decimal] = None
        human_interventions: int
        unique_error_types: int
        most_common_error: Optional[str] = None
        error_distribution: Optional[Dict[str, int]] = None
    ```

    Continue with remaining models for:
    - AgentHealthRealtime
    - CircuitBreakerState
    - EvaluationReport
    - ImprovementProposal
    - ABTest
    - ShadowTest
    - CanaryDeployment
    - Alert
    - LearningLog
    - PromptLibraryComponent
    - AgentSLA
    - SLACompliance
    - CostBudget
    - ModelRoutingRule
    - AgentDependency
  </action>
  <verify>
    - All models validate correctly
    - Enums match database CHECK constraints
    - Type hints are complete
  </verify>
  <done>Core entity models created with full validation</done>
</task>

<task id="2.2" type="auto" priority="critical">
  <name>Create LLM Interaction Models</name>
  <files>
    - meta_agent/core/models.py (append)
  </files>
  <context>
    Models for structured LLM output parsing.
  </context>
  <action>
    Add to models.py:

    ```python
    # LLM Request/Response Models

    class EvaluationScores(BaseModel):
        overall_score: Decimal = Field(..., ge=0, le=100)
        reliability_score: Decimal = Field(..., ge=0, le=100)
        efficiency_score: Decimal = Field(..., ge=0, le=100)
        cost_efficiency_score: Decimal = Field(..., ge=0, le=100)
        quality_score: Decimal = Field(..., ge=0, le=100)

    class EvaluationRecommendation(BaseModel):
        title: str
        description: str
        priority: str = Field(..., pattern="^(low|medium|high|critical)$")
        expected_impact: str
        implementation_effort: str = Field(..., pattern="^(low|medium|high)$")

    class EvaluationResponse(BaseModel):
        """Structured response from evaluation LLM call."""
        scores: EvaluationScores
        strengths: List[str] = Field(..., min_length=1, max_length=5)
        weaknesses: List[str] = Field(..., min_length=1, max_length=5)
        recommendations: List[EvaluationRecommendation] = Field(..., min_length=1, max_length=5)
        risk_level: RiskLevel
        executive_summary: str = Field(..., min_length=100, max_length=500)
        full_report: str = Field(..., min_length=500)

    class FailureAnalysisResult(BaseModel):
        """Structured response from failure analysis."""
        failure_patterns: List[Dict[str, Any]]
        root_causes: List[Dict[str, Any]]
        most_impactful_issue: str
        recommended_fixes: List[str]
        confidence: Decimal = Field(..., ge=0, le=1)

    class PromptImprovementResult(BaseModel):
        """Structured response from prompt optimization."""
        analysis: str
        changes_made: List[Dict[str, str]]  # {"section": str, "change": str, "reason": str}
        new_system_prompt: str
        expected_improvement: str
        risk_notes: str

    class QualityAssessmentResult(BaseModel):
        """Structured response from quality assessment."""
        quality_score: Decimal = Field(..., ge=0, le=100)
        assessment_reasoning: str
        issues_found: List[str]
        improvement_suggestions: List[str]

    # API Request/Response Models

    class AgentListResponse(BaseModel):
        agents: List[Agent]
        total: int
        page: int
        page_size: int

    class DashboardOverview(BaseModel):
        total_agents: int
        active_agents: int
        agents_needing_attention: int
        total_executions_24h: int
        success_rate_24h: Decimal
        total_cost_24h: Decimal
        total_cost_7d: Decimal
        active_ab_tests: int
        pending_proposals: int
        recent_alerts: List[Dict[str, Any]]
        health_trend: List[Dict[str, Any]]

    class AgentDetailResponse(BaseModel):
        agent: Agent
        current_prompt: Optional[AgentPrompt]
        metrics_30d: List[PerformanceMetrics]
        recent_evaluations: List[EvaluationReport]
        active_proposals: List[ImprovementProposal]
        running_tests: List[ABTest]
        applicable_learnings: List[LearningLog]
        health_realtime: Optional[AgentHealthRealtime]
    ```
  </action>
  <verify>
    - All LLM response models have proper validation
    - Field constraints match expected LLM output
    - Nested models work correctly
  </verify>
  <done>LLM interaction models created</done>
</task>

<task id="2.3" type="auto" priority="critical">
  <name>Create Async Database Client</name>
  <files>
    - meta_agent/core/database.py
  </files>
  <context>
    Async wrapper around Supabase client with connection management.
  </context>
  <action>
    Create database.py:

    ```python
    from supabase import create_client, Client
    from supabase.lib.client_options import ClientOptions
    from typing import Optional, List, Dict, Any, TypeVar, Generic
    from uuid import UUID
    from datetime import date, datetime, timedelta
    import asyncio
    from functools import wraps

    from tenacity import retry, stop_after_attempt, wait_exponential

    from meta_agent.config import settings
    from meta_agent.core.models import (
        Agent, AgentCreate, AgentUpdate,
        AgentPrompt, AgentPromptCreate,
        ExecutionLog, ExecutionLogCreate,
        PerformanceMetrics, PerformanceMetricsCreate,
        EvaluationReport, ImprovementProposal,
        ABTest, ShadowTest, CanaryDeployment,
        Alert, LearningLog, AgentHealthRealtime,
        CircuitBreakerState, AgentSLA, SLACompliance,
        CostBudget, ModelRoutingRule, AgentDependency
    )

    T = TypeVar('T')

    class Database:
        """Async database client for MetaAgent."""

        def __init__(self):
            self._client: Optional[Client] = None

        @property
        def client(self) -> Client:
            if self._client is None:
                self._client = create_client(
                    settings.supabase_url,
                    settings.supabase_service_key,
                    options=ClientOptions(
                        postgrest_client_timeout=30,
                        storage_client_timeout=30
                    )
                )
            return self._client

        # ==================== AGENTS ====================

        @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=10))
        async def get_all_active_agents(self, organization_id: UUID) -> List[Agent]:
            """Get all active agents for an organization."""
            result = self.client.table("agent_registry") \
                .select("*") \
                .eq("organization_id", str(organization_id)) \
                .eq("status", "active") \
                .execute()
            return [Agent(**row) for row in result.data]

        async def get_agent_by_id(self, agent_id: UUID) -> Optional[Agent]:
            """Get agent by ID."""
            result = self.client.table("agent_registry") \
                .select("*") \
                .eq("id", str(agent_id)) \
                .single() \
                .execute()
            return Agent(**result.data) if result.data else None

        async def get_agent_by_name(self, agent_name: str, organization_id: UUID) -> Optional[Agent]:
            """Get agent by name."""
            result = self.client.table("agent_registry") \
                .select("*") \
                .eq("agent_name", agent_name) \
                .eq("organization_id", str(organization_id)) \
                .single() \
                .execute()
            return Agent(**result.data) if result.data else None

        async def create_agent(self, agent: AgentCreate) -> Agent:
            """Create a new agent."""
            result = self.client.table("agent_registry") \
                .insert(agent.model_dump(mode="json")) \
                .execute()
            return Agent(**result.data[0])

        async def update_agent(self, agent_id: UUID, update: AgentUpdate) -> Agent:
            """Update an agent."""
            update_data = update.model_dump(exclude_unset=True, mode="json")
            update_data["updated_at"] = datetime.utcnow().isoformat()
            result = self.client.table("agent_registry") \
                .update(update_data) \
                .eq("id", str(agent_id)) \
                .execute()
            return Agent(**result.data[0])

        # ==================== PROMPTS ====================

        async def get_active_prompt(self, agent_id: UUID) -> Optional[AgentPrompt]:
            """Get currently active prompt for an agent."""
            result = self.client.table("agent_prompts") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .eq("is_active", True) \
                .single() \
                .execute()
            return AgentPrompt(**result.data) if result.data else None

        async def create_prompt(self, prompt: AgentPromptCreate) -> AgentPrompt:
            """Create a new prompt version."""
            result = self.client.table("agent_prompts") \
                .insert(prompt.model_dump(mode="json")) \
                .execute()
            return AgentPrompt(**result.data[0])

        async def activate_prompt(self, prompt_id: UUID, agent_id: UUID) -> None:
            """Activate a prompt version (deactivate others)."""
            # Deactivate all prompts for this agent
            self.client.table("agent_prompts") \
                .update({"is_active": False}) \
                .eq("agent_id", str(agent_id)) \
                .execute()
            # Activate the specified prompt
            self.client.table("agent_prompts") \
                .update({"is_active": True}) \
                .eq("id", str(prompt_id)) \
                .execute()

        # ==================== EXECUTION LOGS ====================

        async def create_execution_log(self, log: ExecutionLogCreate) -> ExecutionLog:
            """Create an execution log entry."""
            result = self.client.table("agent_execution_logs") \
                .insert(log.model_dump(mode="json")) \
                .execute()
            return ExecutionLog(**result.data[0])

        async def create_execution_logs_batch(self, logs: List[ExecutionLogCreate]) -> int:
            """Create multiple execution logs in batch."""
            data = [log.model_dump(mode="json") for log in logs]
            result = self.client.table("agent_execution_logs") \
                .insert(data) \
                .execute()
            return len(result.data)

        async def get_logs_for_date_range(
            self,
            agent_id: UUID,
            start_date: date,
            end_date: date,
            organization_id: UUID
        ) -> List[ExecutionLog]:
            """Get execution logs for a date range."""
            result = self.client.table("agent_execution_logs") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .eq("organization_id", str(organization_id)) \
                .gte("timestamp", start_date.isoformat()) \
                .lt("timestamp", (end_date + timedelta(days=1)).isoformat()) \
                .order("timestamp", desc=True) \
                .execute()
            return [ExecutionLog(**row) for row in result.data]

        async def get_logs_sample(
            self,
            agent_id: UUID,
            limit: int = 50,
            status_filter: Optional[str] = None
        ) -> List[ExecutionLog]:
            """Get a sample of recent logs."""
            query = self.client.table("agent_execution_logs") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .order("timestamp", desc=True) \
                .limit(limit)

            if status_filter:
                query = query.eq("status", status_filter)

            result = query.execute()
            return [ExecutionLog(**row) for row in result.data]

        # ==================== METRICS ====================

        async def upsert_daily_metrics(self, metrics: PerformanceMetricsCreate) -> PerformanceMetrics:
            """Upsert daily performance metrics."""
            data = metrics.model_dump(mode="json")
            # Calculate cost_per_execution
            if metrics.total_executions > 0:
                data["cost_per_execution"] = float(metrics.total_cost_usd) / metrics.total_executions

            result = self.client.table("agent_performance_metrics") \
                .upsert(data, on_conflict="agent_id,prompt_version_id,date") \
                .execute()
            return PerformanceMetrics(**result.data[0])

        async def get_metrics_for_period(
            self,
            agent_id: UUID,
            days: int = 7
        ) -> List[PerformanceMetrics]:
            """Get metrics for the last N days."""
            start_date = date.today() - timedelta(days=days)
            result = self.client.table("agent_performance_metrics") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .gte("date", start_date.isoformat()) \
                .order("date", desc=True) \
                .execute()
            return [PerformanceMetrics(**row) for row in result.data]

        # ==================== EVALUATIONS ====================

        async def create_evaluation_report(self, report: Dict[str, Any]) -> EvaluationReport:
            """Create an evaluation report."""
            result = self.client.table("evaluation_reports") \
                .insert(report) \
                .execute()
            return EvaluationReport(**result.data[0])

        async def get_previous_evaluation(self, agent_id: UUID) -> Optional[EvaluationReport]:
            """Get the most recent evaluation for comparison."""
            result = self.client.table("evaluation_reports") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .order("report_date", desc=True) \
                .limit(1) \
                .execute()
            return EvaluationReport(**result.data[0]) if result.data else None

        # ==================== ALERTS ====================

        async def create_alert(self, alert: Dict[str, Any]) -> Alert:
            """Create an alert."""
            result = self.client.table("alert_history") \
                .insert(alert) \
                .execute()
            return Alert(**result.data[0])

        async def get_recent_alerts(
            self,
            hours: int = 24,
            organization_id: Optional[UUID] = None
        ) -> List[Alert]:
            """Get recent alerts."""
            since = datetime.utcnow() - timedelta(hours=hours)
            query = self.client.table("alert_history") \
                .select("*") \
                .gte("created_at", since.isoformat()) \
                .order("created_at", desc=True)

            if organization_id:
                query = query.eq("organization_id", str(organization_id))

            result = query.execute()
            return [Alert(**row) for row in result.data]

        async def check_duplicate_alert(
            self,
            agent_id: UUID,
            alert_type: str,
            hours: int = 1
        ) -> bool:
            """Check if similar alert was sent recently."""
            since = datetime.utcnow() - timedelta(hours=hours)
            result = self.client.table("alert_history") \
                .select("id") \
                .eq("agent_id", str(agent_id)) \
                .eq("alert_type", alert_type) \
                .gte("created_at", since.isoformat()) \
                .execute()
            return len(result.data) > 0

        # ==================== HEALTH ====================

        async def update_realtime_health(
            self,
            agent_id: UUID,
            health_data: Dict[str, Any]
        ) -> AgentHealthRealtime:
            """Update real-time health data."""
            health_data["agent_id"] = str(agent_id)
            health_data["timestamp"] = datetime.utcnow().isoformat()

            result = self.client.table("agent_health_realtime") \
                .upsert(health_data, on_conflict="agent_id") \
                .execute()
            return AgentHealthRealtime(**result.data[0])

        async def get_realtime_health(self, agent_id: UUID) -> Optional[AgentHealthRealtime]:
            """Get real-time health for an agent."""
            result = self.client.table("agent_health_realtime") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .single() \
                .execute()
            return AgentHealthRealtime(**result.data) if result.data else None

        # ==================== CIRCUIT BREAKER ====================

        async def get_circuit_state(self, agent_id: UUID) -> Optional[CircuitBreakerState]:
            """Get circuit breaker state."""
            result = self.client.table("circuit_breaker_state") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .single() \
                .execute()
            return CircuitBreakerState(**result.data) if result.data else None

        async def update_circuit_state(
            self,
            agent_id: UUID,
            state_data: Dict[str, Any]
        ) -> CircuitBreakerState:
            """Update circuit breaker state."""
            state_data["agent_id"] = str(agent_id)
            result = self.client.table("circuit_breaker_state") \
                .upsert(state_data, on_conflict="agent_id") \
                .execute()
            return CircuitBreakerState(**result.data[0])


    # Singleton instance
    db = Database()
    ```
  </action>
  <verify>
    - All CRUD operations work
    - Retry logic triggers on failures
    - Connection is properly managed
    - Type hints match return values
  </verify>
  <done>Async database client created with all operations</done>
</task>

<task id="2.4" type="auto" priority="high">
  <name>Add Remaining Database Operations</name>
  <files>
    - meta_agent/core/database.py (append)
  </files>
  <context>
    Complete the database client with operations for proposals, tests, learning, etc.
  </context>
  <action>
    Add remaining operations:

    ```python
        # ==================== PROPOSALS ====================

        async def create_proposal(self, proposal: Dict[str, Any]) -> ImprovementProposal:
            """Create an improvement proposal."""
            result = self.client.table("improvement_proposals") \
                .insert(proposal) \
                .execute()
            return ImprovementProposal(**result.data[0])

        async def get_pending_proposals(
            self,
            agent_id: Optional[UUID] = None,
            organization_id: Optional[UUID] = None
        ) -> List[ImprovementProposal]:
            """Get pending proposals."""
            query = self.client.table("improvement_proposals") \
                .select("*") \
                .eq("status", "proposed") \
                .order("created_at", desc=True)

            if agent_id:
                query = query.eq("agent_id", str(agent_id))
            if organization_id:
                query = query.eq("organization_id", str(organization_id))

            result = query.execute()
            return [ImprovementProposal(**row) for row in result.data]

        async def update_proposal_status(
            self,
            proposal_id: UUID,
            status: str,
            **kwargs
        ) -> ImprovementProposal:
            """Update proposal status."""
            data = {"status": status, "updated_at": datetime.utcnow().isoformat()}
            data.update(kwargs)
            result = self.client.table("improvement_proposals") \
                .update(data) \
                .eq("id", str(proposal_id)) \
                .execute()
            return ImprovementProposal(**result.data[0])

        # ==================== A/B TESTS ====================

        async def create_ab_test(self, test: Dict[str, Any]) -> ABTest:
            """Create an A/B test."""
            result = self.client.table("ab_tests") \
                .insert(test) \
                .execute()
            return ABTest(**result.data[0])

        async def get_running_ab_tests(
            self,
            agent_id: Optional[UUID] = None
        ) -> List[ABTest]:
            """Get running A/B tests."""
            query = self.client.table("ab_tests") \
                .select("*") \
                .eq("status", "running")

            if agent_id:
                query = query.eq("agent_id", str(agent_id))

            result = query.execute()
            return [ABTest(**row) for row in result.data]

        async def update_ab_test(
            self,
            test_id: UUID,
            updates: Dict[str, Any]
        ) -> ABTest:
            """Update an A/B test."""
            updates["updated_at"] = datetime.utcnow().isoformat()
            result = self.client.table("ab_tests") \
                .update(updates) \
                .eq("id", str(test_id)) \
                .execute()
            return ABTest(**result.data[0])

        # ==================== SHADOW TESTS ====================

        async def create_shadow_test(self, test: Dict[str, Any]) -> ShadowTest:
            """Create a shadow test."""
            result = self.client.table("shadow_tests") \
                .insert(test) \
                .execute()
            return ShadowTest(**result.data[0])

        async def get_running_shadow_tests(
            self,
            agent_id: Optional[UUID] = None
        ) -> List[ShadowTest]:
            """Get running shadow tests."""
            query = self.client.table("shadow_tests") \
                .select("*") \
                .eq("status", "running")

            if agent_id:
                query = query.eq("agent_id", str(agent_id))

            result = query.execute()
            return [ShadowTest(**row) for row in result.data]

        # ==================== CANARY ====================

        async def create_canary_deployment(
            self,
            deployment: Dict[str, Any]
        ) -> CanaryDeployment:
            """Create a canary deployment."""
            result = self.client.table("canary_deployments") \
                .insert(deployment) \
                .execute()
            return CanaryDeployment(**result.data[0])

        async def get_running_canary(self, agent_id: UUID) -> Optional[CanaryDeployment]:
            """Get running canary for an agent."""
            result = self.client.table("canary_deployments") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .eq("status", "running") \
                .single() \
                .execute()
            return CanaryDeployment(**result.data) if result.data else None

        async def update_canary(
            self,
            deployment_id: UUID,
            updates: Dict[str, Any]
        ) -> CanaryDeployment:
            """Update a canary deployment."""
            result = self.client.table("canary_deployments") \
                .update(updates) \
                .eq("id", str(deployment_id)) \
                .execute()
            return CanaryDeployment(**result.data[0])

        # ==================== LEARNING ====================

        async def create_learning(self, learning: Dict[str, Any]) -> LearningLog:
            """Create a learning entry."""
            result = self.client.table("learning_log") \
                .insert(learning) \
                .execute()
            return LearningLog(**result.data[0])

        async def get_applicable_learnings(
            self,
            agent_name: str,
            category: str
        ) -> List[LearningLog]:
            """Get learnings applicable to an agent."""
            result = self.client.table("learning_log") \
                .select("*") \
                .eq("is_active", True) \
                .or_(f"applicable_to.cs.{{{agent_name}}},applicable_to.cs.{{{category}}}") \
                .order("created_at", desc=True) \
                .execute()
            return [LearningLog(**row) for row in result.data]

        # ==================== SLA ====================

        async def get_agent_sla(self, agent_id: UUID) -> Optional[AgentSLA]:
            """Get SLA definition for an agent."""
            result = self.client.table("agent_slas") \
                .select("*") \
                .eq("agent_id", str(agent_id)) \
                .eq("is_active", True) \
                .single() \
                .execute()
            return AgentSLA(**result.data) if result.data else None

        async def create_sla_compliance(
            self,
            compliance: Dict[str, Any]
        ) -> SLACompliance:
            """Create SLA compliance record."""
            result = self.client.table("sla_compliance") \
                .upsert(compliance, on_conflict="agent_id,period_start,period_end") \
                .execute()
            return SLACompliance(**result.data[0])

        # ==================== COST ====================

        async def get_cost_budget(
            self,
            agent_id: Optional[UUID] = None,
            organization_id: Optional[UUID] = None
        ) -> Optional[CostBudget]:
            """Get cost budget."""
            query = self.client.table("cost_budgets").select("*")

            if agent_id:
                query = query.eq("agent_id", str(agent_id))
            if organization_id:
                query = query.eq("organization_id", str(organization_id))

            result = query.single().execute()
            return CostBudget(**result.data) if result.data else None

        async def update_cost_spend(
            self,
            budget_id: UUID,
            daily_add: Decimal,
            weekly_add: Decimal,
            monthly_add: Decimal
        ) -> CostBudget:
            """Update cost spend amounts."""
            result = self.client.rpc(
                "increment_cost_spend",
                {
                    "budget_id": str(budget_id),
                    "daily_add": float(daily_add),
                    "weekly_add": float(weekly_add),
                    "monthly_add": float(monthly_add)
                }
            ).execute()
            return CostBudget(**result.data[0])

        # ==================== DEPENDENCIES ====================

        async def get_agent_dependencies(
            self,
            agent_id: UUID,
            direction: str = "downstream"
        ) -> List[AgentDependency]:
            """Get agent dependencies."""
            column = "upstream_agent_id" if direction == "downstream" else "downstream_agent_id"
            result = self.client.table("agent_dependencies") \
                .select("*") \
                .eq(column, str(agent_id)) \
                .execute()
            return [AgentDependency(**row) for row in result.data]
    ```
  </action>
  <verify>
    - All remaining operations work
    - Complex queries return correct data
    - RPC calls work (if using stored procedures)
  </verify>
  <done>All database operations implemented</done>
</task>

<task id="2.5" type="auto" priority="medium">
  <name>Create Database Tests</name>
  <files>
    - tests/test_database.py
  </files>
  <context>
    Unit tests for database client operations.
  </context>
  <action>
    Create comprehensive tests:

    ```python
    import pytest
    from uuid import uuid4
    from datetime import date, datetime, timedelta
    from decimal import Decimal

    from meta_agent.core.database import db
    from meta_agent.core.models import (
        AgentCreate, AgentCategory, AgentStatus,
        AgentPromptCreate, ExecutionLogCreate,
        ActionType, ExecutionStatus
    )

    # Use a test organization ID
    TEST_ORG_ID = uuid4()

    @pytest.fixture
    async def test_agent():
        """Create a test agent."""
        agent = await db.create_agent(AgentCreate(
            agent_name=f"test_agent_{uuid4().hex[:8]}",
            display_name="Test Agent",
            description="Agent for testing",
            category=AgentCategory.INTERNAL,
            organization_id=TEST_ORG_ID
        ))
        yield agent
        # Cleanup: delete agent

    @pytest.mark.asyncio
    async def test_create_agent(test_agent):
        """Test agent creation."""
        assert test_agent.id is not None
        assert test_agent.status == AgentStatus.ACTIVE
        assert test_agent.current_health_score == Decimal("100.00")

    @pytest.mark.asyncio
    async def test_get_agent_by_name(test_agent):
        """Test fetching agent by name."""
        fetched = await db.get_agent_by_name(
            test_agent.agent_name,
            TEST_ORG_ID
        )
        assert fetched is not None
        assert fetched.id == test_agent.id

    @pytest.mark.asyncio
    async def test_create_execution_log(test_agent):
        """Test execution log creation."""
        log = await db.create_execution_log(ExecutionLogCreate(
            agent_id=test_agent.id,
            organization_id=TEST_ORG_ID,
            execution_id=uuid4(),
            action_type=ActionType.TOOL_CALL,
            action_name="test_tool",
            status=ExecutionStatus.SUCCESS,
            latency_ms=150
        ))
        assert log.id is not None
        assert log.latency_ms == 150

    @pytest.mark.asyncio
    async def test_metrics_upsert():
        """Test metrics upsert."""
        # Test implementation
        pass

    @pytest.mark.asyncio
    async def test_alert_deduplication():
        """Test alert deduplication."""
        # Test implementation
        pass
    ```
  </action>
  <verify>
    - All tests pass
    - Tests cover happy path and edge cases
    - Cleanup works correctly
  </verify>
  <done>Database client tests created</done>
</task>

---

## Acceptance Criteria

- [ ] All Pydantic models created with proper validation
- [ ] Enums match database constraints
- [ ] Async database client with all CRUD operations
- [ ] Retry logic for transient failures
- [ ] Type hints complete throughout
- [ ] Unit tests for critical operations
- [ ] Models serialize/deserialize correctly

## Notes

- Use `model_dump(mode="json")` for JSON serialization
- Keep database client stateless (singleton pattern)
- Add more specific error types as needed

---

*Phase 2 Plan Version: 1.0.0*
*Created: 2026-01-17*
