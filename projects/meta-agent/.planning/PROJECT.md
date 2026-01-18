# MetaAgent System - Project Specification

## Project Identity

| Field | Value |
|-------|-------|
| **Project Name** | MetaAgent - AI Governance System |
| **Codename** | Sentinel |
| **Version** | 1.0.0 |
| **Start Date** | 2026-01-17 |
| **Target Completion** | 2026-04-18 (14 weeks) |
| **Project Lead** | Sezar |
| **Repository** | `/Users/sezars/instantly-clone/projects/meta-agent/` |

---

## Executive Summary

MetaAgent is an autonomous AI governance layer that monitors, evaluates, and continuously improves all AI agents in the agency operating system. It is the "Agent of Agents" - the central nervous system that transforms static AI tools into a self-improving organism.

### The Problem
- AI agents degrade over time without monitoring
- No visibility into agent performance, costs, or failures
- Manual prompt optimization is slow and inconsistent
- No institutional learning - same mistakes repeated
- No safety net for deploying prompt changes

### The Solution
A comprehensive governance system that:
1. **Observes** every action taken by every AI agent
2. **Evaluates** agent performance against defined objectives
3. **Diagnoses** problems through root cause analysis
4. **Prescribes** specific improvements via AI-generated proposals
5. **Experiments** through A/B testing and canary deployments
6. **Evolves** the entire system through continuous learning

---

## Vision & Goals

### Vision Statement
> "Every AI agent in our system continuously improves itself, creating a compounding advantage that makes our agency operations 10x more efficient every year."

### Primary Goals

| Goal | Metric | Target |
|------|--------|--------|
| **Agent Reliability** | Average success rate across all agents | >98% |
| **Cost Efficiency** | Cost per successful execution | <$0.05 |
| **Response Time** | P95 latency for agent responses | <3 seconds |
| **Improvement Velocity** | Prompt improvements deployed per month | >10 |
| **Learning Retention** | Cross-agent pattern application rate | >80% |

### Success Criteria

1. **Real-time Visibility**: Dashboard showing health of all agents within 1 minute of issues
2. **Automated Evaluation**: Weekly AI-generated reports for every agent
3. **Self-Improvement**: System generates and tests prompt improvements autonomously
4. **Safe Deployment**: Zero production incidents from prompt changes (shadow → canary → full)
5. **Cost Control**: Stay within budget with automatic model routing
6. **Institutional Memory**: Learnings persist and propagate across agents

---

## Technical Architecture

### Tech Stack

| Layer | Technology | Justification |
|-------|------------|---------------|
| **Database** | Supabase (PostgreSQL + pgvector) | Multi-tenant, RLS, vector search |
| **Backend** | Python 3.11 + FastAPI | Async, type hints, fast development |
| **LLM** | Claude API (Opus 4 + Sonnet) | Best reasoning for evaluation/optimization |
| **Embeddings** | text-embedding-3-small | Cost-effective similarity search |
| **Queue** | Redis + Celery | Background jobs, real-time counters |
| **Monitoring** | Built-in + Sentry | Error tracking, performance monitoring |
| **Frontend** | Next.js 14 (integrate with Agency PM) | Consistent with existing stack |

### System Components

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         METAAGENT ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      INGESTION LAYER                            │   │
│  │  AgentLogger SDK │ Webhook Receivers │ LangGraph Hooks          │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      STORAGE LAYER                              │   │
│  │  Execution Logs │ Metrics │ Embeddings │ Prompts │ Learnings    │   │
│  │                      (Supabase + pgvector)                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      PROCESSING LAYER                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │   │
│  │  │Real-time │ │  Daily   │ │  Weekly  │ │Improvement│           │   │
│  │  │ Monitor  │ │Aggregator│ │Evaluator │ │ Pipeline │           │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ACTION LAYER                               │   │
│  │  Alerts │ Reports │ Proposals │ A/B Tests │ Deployments         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      PRESENTATION LAYER                         │   │
│  │  Dashboard API │ WebSocket Updates │ Slack/Email Notifications  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Database Schema Overview

**Core Tables (21 total)**:
1. `agent_registry` - Catalog of all AI agents
2. `agent_prompts` - Version-controlled prompt storage
3. `agent_execution_logs` - Action-by-action logging
4. `agent_performance_metrics` - Daily aggregated metrics
5. `agent_health_realtime` - Real-time health snapshots
6. `evaluation_reports` - AI-generated evaluations
7. `improvement_proposals` - Suggested changes
8. `ab_tests` - Controlled experiments
9. `shadow_tests` - Risk-free parallel testing
10. `canary_deployments` - Gradual rollouts
11. `learning_log` - Institutional knowledge
12. `alert_history` - Alert tracking
13. `agent_slas` - SLA definitions
14. `sla_compliance` - Compliance tracking
15. `cost_budgets` - Cost management
16. `model_routing_rules` - Model selection rules
17. `agent_dependencies` - Dependency graph
18. `prompt_library` - Reusable components
19. `prompt_library_usage` - Usage tracking
20. `execution_embeddings` - Vector embeddings
21. `circuit_breaker_state` - Circuit breaker tracking

---

## Integration Points

### Upstream (Data Sources)

| System | Integration Type | Data Flowing In |
|--------|-----------------|-----------------|
| **ColdForge** | SDK + Webhooks | Email generation logs, deliverability results |
| **Agency PM** | SDK + Webhooks | Task execution logs, automation results |
| **LangGraph Agents** | Native hooks | All agent executions |
| **n8n Workflows** | Webhooks | Workflow execution logs |

### Downstream (Actions)

| System | Integration Type | Data Flowing Out |
|--------|-----------------|------------------|
| **Slack** | Webhook | Alerts, daily summaries |
| **ClickUp** | API | Tasks for critical issues |
| **Email** | SMTP/SendGrid | Weekly reports, critical alerts |
| **Agency PM Dashboard** | API | Health data, metrics |

---

## Security & Compliance

### Data Protection
- All tables have Row-Level Security (RLS) by `organization_id`
- API authentication via JWT tokens
- Secrets stored in environment variables
- No PII in logs (sanitization layer)

### Access Control
| Role | Permissions |
|------|-------------|
| **Admin** | Full access, approve proposals, manage agents |
| **Developer** | View all, create proposals, run tests |
| **Viewer** | View dashboards and reports only |

### Audit Trail
- All proposal approvals logged with user + timestamp
- All deployments tracked with rollback capability
- Alert acknowledgments recorded

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Over-optimization degrades prompts | Medium | High | Shadow → Canary → A/B pipeline |
| Alert fatigue | High | Medium | Smart grouping, severity levels |
| Cost spiral from LLM calls | Medium | Medium | Budget limits, model routing |
| False positive proposals | Medium | Low | Human approval gate |
| System complexity | High | Medium | Phased rollout, good docs |
| Single point of failure | Low | High | Circuit breakers, fallbacks |

---

## Non-Functional Requirements

### Performance
- Real-time health updates: <1 second latency
- Daily aggregation: <5 minutes for 1M logs
- Weekly evaluation: <30 minutes for all agents
- API response time: P95 <200ms

### Scalability
- Support 50+ agents
- Handle 10M+ daily log entries
- Scale to 100+ users on dashboard

### Availability
- 99.9% uptime for monitoring
- Graceful degradation if components fail
- No data loss on crashes

### Maintainability
- 80%+ test coverage
- Full API documentation
- Runbook for common operations

---

## Glossary

| Term | Definition |
|------|------------|
| **Agent** | An AI-powered component that performs tasks autonomously |
| **Execution** | A single run of an agent from start to finish |
| **Action** | A single step within an execution (tool call, LLM inference) |
| **Proposal** | A suggested improvement to an agent's prompt or config |
| **Shadow Test** | Running new prompt in parallel without affecting production |
| **Canary** | Gradual rollout of new prompt to increasing traffic % |
| **Circuit Breaker** | Pattern to stop calls to failing agent |
| **SLA** | Service Level Agreement - performance targets |

---

## References

- [Original MetaAgent Specification](#) - User-provided design document
- [ColdForge Architecture](/Users/sezars/instantly-clone/README.md)
- [Agency PM Project](/Users/sezars/projects/agency-ai-system/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)

---

*Document Version: 1.0.0*
*Last Updated: 2026-01-17*
*Status: APPROVED*
