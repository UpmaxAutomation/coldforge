# Phase 1: Database Schema & Core Infrastructure

## Phase Metadata

| Field | Value |
|-------|-------|
| **Phase Number** | 1 |
| **Phase Name** | Database Schema & Core Infrastructure |
| **Duration** | 3 days |
| **Complexity** | Medium |
| **Dependencies** | None |
| **Parallel With** | None |

## Objective

Set up the complete database schema with all 21 tables, RLS policies, indexes, and establish the Python project structure with configuration management.

## Context

This is the foundation phase. Everything else depends on having the correct database schema and project structure in place. We're using Supabase (PostgreSQL) with pgvector for embeddings, and multi-tenant isolation via RLS.

## Pre-Requisites

- [ ] Supabase project created
- [ ] Supabase URL and anon key available
- [ ] Python 3.11+ installed
- [ ] Poetry or pip available

---

## Tasks

<task id="1.1" type="auto" priority="critical">
  <name>Create Core Governance Tables</name>
  <files>
    - supabase/migrations/001_core_governance.sql
  </files>
  <context>
    These are the foundational tables that everything else builds upon.
    Must include proper constraints, defaults, and foreign keys.
  </context>
  <action>
    Create SQL migration with these tables:

    1. `agent_registry` - Central catalog of all AI agents
       - id (UUID PK)
       - agent_name (TEXT UNIQUE NOT NULL)
       - display_name (TEXT NOT NULL)
       - description (TEXT)
       - category (TEXT NOT NULL) - 'client_success', 'marketing', 'sales', 'operations', 'internal'
       - version (TEXT DEFAULT '1.0.0')
       - status (TEXT DEFAULT 'active') - CHECK: active, paused, deprecated, testing, improving
       - owner_email (TEXT)
       - slack_channel (TEXT)
       - target_success_rate (DECIMAL DEFAULT 95.00)
       - target_avg_latency_ms (INTEGER DEFAULT 5000)
       - target_cost_per_execution (DECIMAL DEFAULT 0.10)
       - current_health_score (DECIMAL DEFAULT 100.00)
       - last_health_check (TIMESTAMPTZ)
       - consecutive_failures (INTEGER DEFAULT 0)
       - organization_id (UUID) - for multi-tenant
       - created_at, updated_at (TIMESTAMPTZ)
       - metadata (JSONB DEFAULT '{}')

    2. `agent_prompts` - Version-controlled prompt storage
       - id (UUID PK)
       - agent_id (UUID FK → agent_registry)
       - version (TEXT NOT NULL)
       - system_prompt (TEXT NOT NULL)
       - tool_definitions (JSONB)
       - few_shot_examples (JSONB)
       - model_name (TEXT DEFAULT 'claude-sonnet-4-20250514')
       - temperature (DECIMAL DEFAULT 0.7)
       - max_tokens (INTEGER DEFAULT 4096)
       - configuration (JSONB DEFAULT '{}')
       - is_active (BOOLEAN DEFAULT FALSE)
       - is_baseline (BOOLEAN DEFAULT FALSE)
       - parent_version_id (UUID FK self-reference)
       - total_executions (INTEGER DEFAULT 0)
       - successful_executions (INTEGER DEFAULT 0)
       - avg_quality_score (DECIMAL)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)
       - created_by (TEXT)
       - change_reason (TEXT)
       - UNIQUE(agent_id, version)

    3. `agent_execution_logs` - Detailed action logging
       - id (UUID PK)
       - agent_id (UUID FK)
       - prompt_version_id (UUID FK)
       - execution_id (UUID NOT NULL)
       - timestamp (TIMESTAMPTZ DEFAULT NOW())
       - action_type (TEXT NOT NULL)
       - action_name (TEXT)
       - input_data (JSONB)
       - output_data (JSONB)
       - latency_ms (INTEGER)
       - token_count_input (INTEGER)
       - token_count_output (INTEGER)
       - estimated_cost_usd (DECIMAL)
       - status (TEXT DEFAULT 'success')
       - error_message (TEXT)
       - error_type (TEXT)
       - error_stack_trace (TEXT)
       - related_entity_type (TEXT)
       - related_entity_id (UUID)
       - user_id (UUID)
       - quality_score (DECIMAL)
       - quality_feedback (TEXT)
       - reviewed_by (TEXT)
       - reviewed_at (TIMESTAMPTZ)
       - organization_id (UUID)
       - metadata (JSONB DEFAULT '{}')

    4. `agent_performance_metrics` - Daily aggregates
       - id (UUID PK)
       - agent_id (UUID FK)
       - prompt_version_id (UUID FK)
       - date (DATE NOT NULL)
       - total_executions, successful_executions, failed_executions, timeout_executions (INTEGER)
       - avg_latency_ms, p50_latency_ms, p95_latency_ms, p99_latency_ms (DECIMAL)
       - total_cost_usd, cost_per_execution (DECIMAL)
       - total_tokens_input, total_tokens_output (INTEGER)
       - avg_quality_score (DECIMAL)
       - human_interventions (INTEGER)
       - unique_error_types (INTEGER)
       - most_common_error (TEXT)
       - error_distribution (JSONB)
       - organization_id (UUID)
       - UNIQUE(agent_id, prompt_version_id, date)
  </action>
  <verify>
    - Run migration in Supabase
    - Verify all tables exist: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
    - Verify constraints: `SELECT * FROM information_schema.table_constraints WHERE table_schema = 'public';`
  </verify>
  <done>All 4 core tables created with proper constraints</done>
</task>

<task id="1.2" type="auto" priority="critical">
  <name>Create Real-Time Monitoring Tables</name>
  <files>
    - supabase/migrations/002_realtime_monitoring.sql
  </files>
  <context>
    Tables for real-time health monitoring and circuit breaker state.
  </context>
  <action>
    Create SQL migration with:

    1. `agent_health_realtime` - Real-time health snapshots
       - id (UUID PK)
       - agent_id (UUID FK UNIQUE)
       - timestamp (TIMESTAMPTZ DEFAULT NOW())
       - executions_5m, failures_5m (INTEGER DEFAULT 0)
       - avg_latency_5m, error_rate_5m (DECIMAL)
       - executions_1h, failures_1h (INTEGER DEFAULT 0)
       - avg_latency_1h, error_rate_1h (DECIMAL)
       - status (TEXT DEFAULT 'healthy') - CHECK: healthy, degraded, critical, offline
       - last_successful_execution (TIMESTAMPTZ)
       - last_failed_execution (TIMESTAMPTZ)
       - circuit_state (TEXT DEFAULT 'closed') - CHECK: closed, open, half_open
       - circuit_opened_at (TIMESTAMPTZ)
       - organization_id (UUID)

    2. `circuit_breaker_state` - Circuit breaker tracking
       - id (UUID PK)
       - agent_id (UUID FK UNIQUE)
       - state (TEXT DEFAULT 'closed')
       - failure_count (INTEGER DEFAULT 0)
       - success_count (INTEGER DEFAULT 0)
       - last_failure_at (TIMESTAMPTZ)
       - last_success_at (TIMESTAMPTZ)
       - opened_at (TIMESTAMPTZ)
       - half_open_at (TIMESTAMPTZ)
       - failure_threshold (INTEGER DEFAULT 5)
       - success_threshold (INTEGER DEFAULT 3)
       - cooldown_seconds (INTEGER DEFAULT 60)
       - organization_id (UUID)
  </action>
  <verify>
    - Tables created
    - UNIQUE constraint on agent_id verified
  </verify>
  <done>Real-time monitoring tables created</done>
</task>

<task id="1.3" type="auto" priority="critical">
  <name>Create Evaluation & Improvement Tables</name>
  <files>
    - supabase/migrations/003_evaluation_improvement.sql
  </files>
  <context>
    Tables for AI-generated evaluations and improvement tracking.
  </context>
  <action>
    Create SQL migration with:

    1. `evaluation_reports` - AI-generated evaluations
       - id (UUID PK)
       - agent_id (UUID FK)
       - report_date (DATE NOT NULL)
       - evaluation_period_start, evaluation_period_end (DATE NOT NULL)
       - overall_score, reliability_score, efficiency_score, cost_efficiency_score, quality_score (DECIMAL)
       - strengths, weaknesses (TEXT[])
       - risk_level (TEXT) - CHECK: low, medium, high, critical
       - recommendations (JSONB)
       - priority_actions (TEXT[])
       - score_change_vs_previous (DECIMAL)
       - comparison_details (JSONB)
       - executive_summary, full_report_text (TEXT)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)

    2. `improvement_proposals` - Suggested changes
       - id (UUID PK)
       - agent_id (UUID FK)
       - evaluation_report_id (UUID FK)
       - proposal_type (TEXT NOT NULL) - prompt_change, tool_addition, tool_removal, config_change, architecture_change
       - title, description, rationale (TEXT NOT NULL)
       - current_state, proposed_state (JSONB)
       - diff_summary (TEXT)
       - expected_improvement (TEXT)
       - expected_metrics_change (JSONB)
       - risk_assessment, rollback_plan (TEXT)
       - status (TEXT DEFAULT 'proposed') - CHECK: proposed, approved, rejected, testing, deployed, rolled_back
       - priority (TEXT DEFAULT 'medium') - CHECK: low, medium, high, critical
       - requires_human_approval (BOOLEAN DEFAULT TRUE)
       - approved_by (TEXT)
       - approved_at (TIMESTAMPTZ)
       - rejection_reason (TEXT)
       - deployed_at (TIMESTAMPTZ)
       - deployed_prompt_version_id (UUID FK)
       - organization_id (UUID)
       - created_at, updated_at (TIMESTAMPTZ)

    3. `ab_tests` - Controlled experiments
       - id (UUID PK)
       - agent_id (UUID FK)
       - improvement_proposal_id (UUID FK)
       - test_name, hypothesis (TEXT NOT NULL)
       - control_prompt_id, treatment_prompt_id (UUID FK NOT NULL)
       - traffic_split (DECIMAL DEFAULT 0.50)
       - start_date (TIMESTAMPTZ NOT NULL)
       - end_date (TIMESTAMPTZ)
       - min_sample_size (INTEGER DEFAULT 100)
       - status (TEXT DEFAULT 'running') - CHECK: pending, running, completed, stopped
       - control_executions, treatment_executions (INTEGER DEFAULT 0)
       - control_success_rate, treatment_success_rate (DECIMAL)
       - control_avg_quality, treatment_avg_quality (DECIMAL)
       - statistical_significance (DECIMAL)
       - winner (TEXT) - control, treatment, inconclusive
       - conclusion_summary (TEXT)
       - organization_id (UUID)
       - created_at, updated_at (TIMESTAMPTZ)
  </action>
  <verify>
    - All tables created
    - Foreign keys working
  </verify>
  <done>Evaluation and improvement tables created</done>
</task>

<task id="1.4" type="auto" priority="critical">
  <name>Create Safety & Testing Tables</name>
  <files>
    - supabase/migrations/004_safety_testing.sql
  </files>
  <context>
    Tables for shadow testing, canary deployments, and alerts.
  </context>
  <action>
    Create SQL migration with:

    1. `shadow_tests` - Risk-free parallel testing
       - id (UUID PK)
       - agent_id (UUID FK)
       - production_prompt_id, shadow_prompt_id (UUID FK)
       - sample_rate (DECIMAL DEFAULT 0.10)
       - start_date (TIMESTAMPTZ NOT NULL)
       - end_date (TIMESTAMPTZ)
       - min_sample_size (INTEGER DEFAULT 100)
       - status (TEXT DEFAULT 'running') - CHECK: pending, running, completed, stopped
       - production_success_rate, shadow_success_rate (DECIMAL)
       - production_avg_quality, shadow_avg_quality (DECIMAL)
       - output_similarity_score (DECIMAL)
       - recommendation (TEXT)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)

    2. `canary_deployments` - Gradual rollouts
       - id (UUID PK)
       - agent_id (UUID FK)
       - current_prompt_id, canary_prompt_id (UUID FK)
       - current_stage (INTEGER DEFAULT 1)
       - stages (JSONB NOT NULL)
       - rollback_on_error_rate (DECIMAL DEFAULT 0.10)
       - rollback_on_latency_increase (DECIMAL DEFAULT 0.50)
       - rollback_on_quality_decrease (DECIMAL DEFAULT 0.10)
       - status (TEXT DEFAULT 'running') - CHECK: pending, running, completed, rolled_back, paused
       - stage_metrics (JSONB)
       - started_at, completed_at, rolled_back_at (TIMESTAMPTZ)
       - rollback_reason (TEXT)
       - organization_id (UUID)

    3. `alert_history` - Alert tracking
       - id (UUID PK)
       - agent_id (UUID FK)
       - alert_type (TEXT NOT NULL)
       - severity (TEXT NOT NULL) - CHECK: info, warning, critical, emergency
       - title, message (TEXT NOT NULL)
       - details (JSONB)
       - slack_sent (BOOLEAN DEFAULT FALSE)
       - slack_sent_at (TIMESTAMPTZ)
       - email_sent (BOOLEAN DEFAULT FALSE)
       - email_sent_at (TIMESTAMPTZ)
       - clickup_task_id (TEXT)
       - acknowledged (BOOLEAN DEFAULT FALSE)
       - acknowledged_by (TEXT)
       - acknowledged_at (TIMESTAMPTZ)
       - resolved (BOOLEAN DEFAULT FALSE)
       - resolved_by (TEXT)
       - resolved_at (TIMESTAMPTZ)
       - resolution_notes (TEXT)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)
  </action>
  <verify>
    - All tables created
    - CHECK constraints working
  </verify>
  <done>Safety and testing tables created</done>
</task>

<task id="1.5" type="auto" priority="critical">
  <name>Create Learning & Cost Tables</name>
  <files>
    - supabase/migrations/005_learning_cost.sql
  </files>
  <context>
    Tables for institutional learning, cost management, and SLA tracking.
  </context>
  <action>
    Create SQL migration with:

    1. `learning_log` - Institutional knowledge
       - id (UUID PK)
       - agent_id (UUID FK nullable)
       - related_proposal_id (UUID FK nullable)
       - related_ab_test_id (UUID FK nullable)
       - learning_type (TEXT NOT NULL) - success_pattern, failure_pattern, optimization, anti_pattern
       - title, description (TEXT NOT NULL)
       - evidence (JSONB)
       - confidence_level (TEXT) - CHECK: low, medium, high, proven
       - applicable_to (TEXT[])
       - is_active (BOOLEAN DEFAULT TRUE)
       - superseded_by (UUID FK self-reference)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)

    2. `prompt_library` - Reusable components
       - id (UUID PK)
       - name (TEXT UNIQUE NOT NULL)
       - category (TEXT NOT NULL) - system_instruction, output_format, error_handling, tool_usage, persona
       - tags (TEXT[])
       - content (TEXT NOT NULL)
       - description (TEXT)
       - usage_examples (JSONB)
       - times_used (INTEGER DEFAULT 0)
       - avg_quality_when_used (DECIMAL)
       - version (TEXT DEFAULT '1.0.0')
       - is_active (BOOLEAN DEFAULT TRUE)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)
       - created_by (TEXT)

    3. `prompt_library_usage` - Track component usage
       - id (UUID PK)
       - prompt_id (UUID FK)
       - library_component_id (UUID FK)
       - UNIQUE(prompt_id, library_component_id)

    4. `agent_slas` - SLA definitions
       - id (UUID PK)
       - agent_id (UUID FK)
       - target_availability (DECIMAL DEFAULT 0.9990)
       - target_p50_latency_ms, target_p95_latency_ms, target_p99_latency_ms (INTEGER)
       - target_success_rate (DECIMAL DEFAULT 0.9500)
       - target_quality_score (DECIMAL DEFAULT 80.00)
       - measurement_window (TEXT DEFAULT 'rolling_30d')
       - is_active (BOOLEAN DEFAULT TRUE)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)

    5. `sla_compliance` - Compliance tracking
       - id (UUID PK)
       - agent_id (UUID FK)
       - sla_id (UUID FK)
       - period_start, period_end (DATE NOT NULL)
       - actual_availability (DECIMAL)
       - actual_p50_latency_ms, actual_p95_latency_ms, actual_p99_latency_ms (INTEGER)
       - actual_success_rate (DECIMAL)
       - actual_quality_score (DECIMAL)
       - availability_met, latency_met, success_rate_met, quality_met, overall_compliant (BOOLEAN)
       - breach_minutes (INTEGER DEFAULT 0)
       - breach_details (JSONB)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)
       - UNIQUE(agent_id, period_start, period_end)

    6. `cost_budgets` - Cost management
       - id (UUID PK)
       - organization_id (UUID)
       - agent_id (UUID FK nullable)
       - daily_budget_usd, weekly_budget_usd, monthly_budget_usd (DECIMAL)
       - current_daily_spend, current_weekly_spend, current_monthly_spend (DECIMAL DEFAULT 0)
       - on_daily_exceeded, on_weekly_exceeded, on_monthly_exceeded (TEXT) - alert, throttle, pause, downgrade_model
       - alert_at_percentage (DECIMAL DEFAULT 80.00)
       - updated_at (TIMESTAMPTZ)

    7. `model_routing_rules` - Model selection
       - id (UUID PK)
       - agent_id (UUID FK)
       - condition_type (TEXT NOT NULL)
       - condition_operator (TEXT NOT NULL)
       - condition_value (JSONB NOT NULL)
       - target_model (TEXT NOT NULL)
       - fallback_model (TEXT)
       - priority (INTEGER DEFAULT 100)
       - is_active (BOOLEAN DEFAULT TRUE)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)

    8. `agent_dependencies` - Dependency graph
       - id (UUID PK)
       - upstream_agent_id (UUID FK)
       - downstream_agent_id (UUID FK)
       - dependency_type (TEXT NOT NULL) - data, trigger, approval, context
       - is_critical (BOOLEAN DEFAULT FALSE)
       - organization_id (UUID)
       - created_at (TIMESTAMPTZ)
       - UNIQUE(upstream_agent_id, downstream_agent_id)
  </action>
  <verify>
    - All 8 tables created
    - Unique constraints working
  </verify>
  <done>Learning, cost, and SLA tables created</done>
</task>

<task id="1.6" type="auto" priority="critical">
  <name>Create Embedding Table with pgvector</name>
  <files>
    - supabase/migrations/006_embeddings.sql
  </files>
  <context>
    Enable pgvector extension and create embedding storage table.
  </context>
  <action>
    Create SQL migration:

    -- Enable pgvector extension
    CREATE EXTENSION IF NOT EXISTS vector;

    -- Execution embeddings table
    CREATE TABLE execution_embeddings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      execution_log_id UUID REFERENCES agent_execution_logs(id) ON DELETE CASCADE,
      input_embedding vector(1536),
      output_embedding vector(1536),
      error_embedding vector(1536),
      organization_id UUID,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Create IVFFlat indexes for similarity search
    CREATE INDEX idx_input_embedding ON execution_embeddings
    USING ivfflat (input_embedding vector_cosine_ops) WITH (lists = 100);

    CREATE INDEX idx_error_embedding ON execution_embeddings
    USING ivfflat (error_embedding vector_cosine_ops) WITH (lists = 100);
  </action>
  <verify>
    - pgvector extension enabled
    - Vector column accepts 1536-dimensional vectors
    - IVFFlat indexes created
  </verify>
  <done>Embedding table and vector indexes created</done>
</task>

<task id="1.7" type="auto" priority="high">
  <name>Create All Database Indexes</name>
  <files>
    - supabase/migrations/007_indexes.sql
  </files>
  <context>
    Performance indexes for common query patterns.
  </context>
  <action>
    Create SQL migration with all indexes:

    -- Agent prompts
    CREATE INDEX idx_prompts_agent_active ON agent_prompts(agent_id, is_active) WHERE is_active = TRUE;

    -- Execution logs (most critical for performance)
    CREATE INDEX idx_logs_agent_timestamp ON agent_execution_logs(agent_id, timestamp DESC);
    CREATE INDEX idx_logs_execution ON agent_execution_logs(execution_id);
    CREATE INDEX idx_logs_status_failure ON agent_execution_logs(status) WHERE status = 'failure';
    CREATE INDEX idx_logs_quality ON agent_execution_logs(agent_id, quality_score) WHERE quality_score IS NOT NULL;
    CREATE INDEX idx_logs_org_timestamp ON agent_execution_logs(organization_id, timestamp DESC);

    -- Performance metrics
    CREATE INDEX idx_metrics_agent_date ON agent_performance_metrics(agent_id, date DESC);

    -- Evaluation reports
    CREATE INDEX idx_reports_agent_date ON evaluation_reports(agent_id, report_date DESC);

    -- Improvement proposals
    CREATE INDEX idx_proposals_agent_status ON improvement_proposals(agent_id, status);
    CREATE INDEX idx_proposals_pending ON improvement_proposals(status) WHERE status = 'proposed';

    -- A/B tests
    CREATE INDEX idx_ab_tests_running ON ab_tests(status) WHERE status = 'running';

    -- Shadow tests
    CREATE INDEX idx_shadow_tests_running ON shadow_tests(status) WHERE status = 'running';

    -- Canary deployments
    CREATE INDEX idx_canary_running ON canary_deployments(status) WHERE status = 'running';

    -- Alerts
    CREATE INDEX idx_alerts_unresolved ON alert_history(resolved, created_at DESC) WHERE resolved = FALSE;
    CREATE INDEX idx_alerts_agent ON alert_history(agent_id, created_at DESC);

    -- Health realtime
    CREATE INDEX idx_health_realtime_agent ON agent_health_realtime(agent_id);

    -- SLA compliance
    CREATE INDEX idx_sla_compliance_period ON sla_compliance(agent_id, period_start DESC);

    -- Cost budgets
    CREATE INDEX idx_cost_budgets_org ON cost_budgets(organization_id);

    -- Learning log
    CREATE INDEX idx_learning_applicable ON learning_log USING GIN(applicable_to);
  </action>
  <verify>
    - All indexes created
    - EXPLAIN ANALYZE on common queries shows index usage
  </verify>
  <done>All performance indexes created</done>
</task>

<task id="1.8" type="auto" priority="high">
  <name>Create RLS Policies</name>
  <files>
    - supabase/migrations/008_rls_policies.sql
  </files>
  <context>
    Row-Level Security for multi-tenant isolation.
  </context>
  <action>
    Create SQL migration enabling RLS on all tables:

    -- Enable RLS on all tables
    ALTER TABLE agent_registry ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_execution_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_performance_metrics ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_health_realtime ENABLE ROW LEVEL SECURITY;
    ALTER TABLE circuit_breaker_state ENABLE ROW LEVEL SECURITY;
    ALTER TABLE evaluation_reports ENABLE ROW LEVEL SECURITY;
    ALTER TABLE improvement_proposals ENABLE ROW LEVEL SECURITY;
    ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE shadow_tests ENABLE ROW LEVEL SECURITY;
    ALTER TABLE canary_deployments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE alert_history ENABLE ROW LEVEL SECURITY;
    ALTER TABLE learning_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE prompt_library ENABLE ROW LEVEL SECURITY;
    ALTER TABLE prompt_library_usage ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_slas ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sla_compliance ENABLE ROW LEVEL SECURITY;
    ALTER TABLE cost_budgets ENABLE ROW LEVEL SECURITY;
    ALTER TABLE model_routing_rules ENABLE ROW LEVEL SECURITY;
    ALTER TABLE agent_dependencies ENABLE ROW LEVEL SECURITY;
    ALTER TABLE execution_embeddings ENABLE ROW LEVEL SECURITY;

    -- Create policies for each table (SELECT example)
    CREATE POLICY "Users see own org agents" ON agent_registry
      FOR SELECT USING (organization_id = auth.jwt() ->> 'organization_id');

    CREATE POLICY "Users see own org logs" ON agent_execution_logs
      FOR SELECT USING (organization_id = auth.jwt() ->> 'organization_id');

    -- (Repeat for all tables with INSERT, UPDATE, DELETE policies)

    -- Service role bypass for backend operations
    CREATE POLICY "Service role full access" ON agent_registry
      FOR ALL USING (auth.role() = 'service_role');
  </action>
  <verify>
    - RLS enabled on all tables
    - Policies allow access with correct org_id
    - Policies deny access with wrong org_id
    - Service role has full access
  </verify>
  <done>RLS policies created for all tables</done>
</task>

<task id="1.9" type="auto" priority="high">
  <name>Create Python Project Structure</name>
  <files>
    - meta_agent/__init__.py
    - meta_agent/main.py
    - meta_agent/config.py
    - meta_agent/core/__init__.py
    - meta_agent/monitoring/__init__.py
    - meta_agent/evaluation/__init__.py
    - meta_agent/improvement/__init__.py
    - meta_agent/cost/__init__.py
    - meta_agent/learning/__init__.py
    - meta_agent/dependencies/__init__.py
    - meta_agent/integrations/__init__.py
    - meta_agent/api/__init__.py
    - meta_agent/api/routes/__init__.py
    - meta_agent/utils/__init__.py
    - pyproject.toml
    - requirements.txt
    - .env.example
  </files>
  <context>
    Establish the complete project structure following Python best practices.
  </context>
  <action>
    1. Create directory structure:
       ```
       meta_agent/
       ├── __init__.py
       ├── main.py
       ├── config.py
       ├── core/
       │   └── __init__.py
       ├── monitoring/
       │   └── __init__.py
       ├── evaluation/
       │   └── __init__.py
       ├── improvement/
       │   └── __init__.py
       ├── cost/
       │   └── __init__.py
       ├── learning/
       │   └── __init__.py
       ├── dependencies/
       │   └── __init__.py
       ├── integrations/
       │   └── __init__.py
       ├── api/
       │   ├── __init__.py
       │   └── routes/
       │       └── __init__.py
       └── utils/
           └── __init__.py
       ```

    2. Create pyproject.toml with:
       - Project metadata
       - Dependencies
       - Dev dependencies
       - Scripts entry points

    3. Create requirements.txt with pinned versions:
       - supabase>=2.0.0
       - openai>=1.0.0
       - pydantic>=2.0.0
       - pydantic-settings>=2.0.0
       - fastapi>=0.100.0
       - uvicorn>=0.23.0
       - click>=8.0.0
       - redis>=5.0.0
       - celery>=5.3.0
       - httpx>=0.25.0
       - structlog>=23.0.0
       - python-dotenv>=1.0.0
       - tenacity>=8.0.0
       - numpy>=1.24.0

    4. Create .env.example with all required variables
  </action>
  <verify>
    - `python -c "import meta_agent"` works
    - All __init__.py files exist
    - requirements.txt can be installed
  </verify>
  <done>Python project structure created</done>
</task>

<task id="1.10" type="auto" priority="high">
  <name>Create Configuration Management</name>
  <files>
    - meta_agent/config.py
  </files>
  <context>
    Centralized configuration using pydantic-settings.
  </context>
  <action>
    Create config.py with:

    ```python
    from pydantic_settings import BaseSettings
    from pydantic import Field
    from typing import Optional

    class Settings(BaseSettings):
        # Supabase
        supabase_url: str = Field(..., env="SUPABASE_URL")
        supabase_key: str = Field(..., env="SUPABASE_KEY")
        supabase_service_key: str = Field(..., env="SUPABASE_SERVICE_KEY")

        # OpenAI (Claude-compatible)
        openai_api_key: str = Field(..., env="OPENAI_API_KEY")
        openai_base_url: str = Field(
            default="https://api.anthropic.com/v1",
            env="OPENAI_BASE_URL"
        )
        default_model: str = Field(
            default="claude-sonnet-4-20250514",
            env="DEFAULT_MODEL"
        )
        evaluation_model: str = Field(
            default="claude-sonnet-4-20250514",
            env="EVALUATION_MODEL"
        )

        # Redis
        redis_url: str = Field(default="redis://localhost:6379", env="REDIS_URL")

        # Alerting
        slack_webhook_url: Optional[str] = Field(default=None, env="SLACK_WEBHOOK_URL")
        alert_email: Optional[str] = Field(default=None, env="ALERT_EMAIL")
        clickup_api_key: Optional[str] = Field(default=None, env="CLICKUP_API_KEY")

        # Thresholds
        failure_rate_threshold: float = Field(default=0.20)
        failure_count_threshold: int = Field(default=10)
        cost_spike_threshold: float = Field(default=1.50)
        latency_spike_threshold: float = Field(default=2.00)

        # Schedule
        evaluation_day: int = Field(default=0)  # Monday
        aggregation_hour: int = Field(default=2)  # 2 AM
        evaluation_hour: int = Field(default=3)  # 3 AM

        # Feature flags
        enable_shadow_testing: bool = Field(default=True)
        enable_canary_deployments: bool = Field(default=True)
        enable_auto_proposals: bool = Field(default=True)

        class Config:
            env_file = ".env"
            env_file_encoding = "utf-8"

    settings = Settings()
    ```
  </action>
  <verify>
    - Config loads from environment
    - Config loads from .env file
    - All fields have sensible defaults
    - Validation works for required fields
  </verify>
  <done>Configuration management created</done>
</task>

---

## Acceptance Criteria

- [ ] All 21 database tables created in Supabase
- [ ] All indexes created and verified
- [ ] RLS policies enabled and tested
- [ ] pgvector extension enabled
- [ ] Python project structure complete
- [ ] Configuration management working
- [ ] `python -m meta_agent --help` runs without error
- [ ] All migrations can be run idempotently

## Notes

- Run migrations in order (001 → 008)
- Test RLS with different organization_ids
- Verify indexes with EXPLAIN ANALYZE
- Keep .env.example updated

---

*Phase 1 Plan Version: 1.0.0*
*Created: 2026-01-17*
