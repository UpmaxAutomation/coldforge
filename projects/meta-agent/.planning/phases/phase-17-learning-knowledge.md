# Phase 17: Learning & Knowledge Base

## Overview
Build a learning system that captures successful patterns, stores lessons learned, and builds an organizational knowledge base from agent execution data.

## Dependencies
- Phase 14: Problem Analyzer (problem patterns)
- Phase 15: Improvement Proposal Generator (approved improvements)
- Phase 13: Embedding & Similarity System (semantic search)

## Tasks

### Task 17.1: Knowledge Base Models and Storage

<task type="auto">
  <name>Create knowledge base data models and database schema</name>
  <files>src/meta_agent/learning/models.py, migrations/017_knowledge_base.sql</files>
  <action>
Define models for storing knowledge entries, patterns, and lessons learned.

```python
# src/meta_agent/learning/models.py
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional
import uuid


class KnowledgeType(str, Enum):
    """Types of knowledge entries."""
    PATTERN = "pattern"           # Successful execution patterns
    LESSON = "lesson"             # Lessons learned from failures
    BEST_PRACTICE = "best_practice"  # Recommended approaches
    ANTI_PATTERN = "anti_pattern"    # What to avoid
    CONFIGURATION = "configuration"  # Optimal settings
    PROMPT_TEMPLATE = "prompt_template"  # Effective prompts


class KnowledgeSource(str, Enum):
    """Sources of knowledge entries."""
    AUTOMATIC = "automatic"       # Extracted from executions
    MANUAL = "manual"             # Human-entered
    APPROVED_PROPOSAL = "approved_proposal"  # From improvement proposals
    IMPORTED = "imported"         # External import


class ConfidenceLevel(str, Enum):
    """Confidence levels for knowledge entries."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERIFIED = "verified"


@dataclass
class KnowledgeEntry:
    """A knowledge base entry."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    title: str = ""
    description: str = ""
    content: str = ""
    knowledge_type: KnowledgeType = KnowledgeType.PATTERN
    source: KnowledgeSource = KnowledgeSource.AUTOMATIC
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM

    # Categorization
    agent_id: Optional[str] = None  # Specific agent or None for general
    tags: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)

    # Evidence
    supporting_executions: list[str] = field(default_factory=list)
    success_rate: float = 0.0
    sample_size: int = 0

    # Embedding for similarity search
    embedding: Optional[list[float]] = None

    # Metadata
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None
    version: int = 1
    is_active: bool = True

    # Usage tracking
    times_applied: int = 0
    last_applied_at: Optional[datetime] = None


@dataclass
class PatternDefinition:
    """A reusable pattern definition."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""

    # Pattern matching criteria
    trigger_conditions: dict = field(default_factory=dict)
    context_requirements: list[str] = field(default_factory=list)

    # Pattern content
    template: str = ""
    variables: list[str] = field(default_factory=list)
    example_usage: str = ""

    # Performance
    avg_success_rate: float = 0.0
    avg_latency_ms: float = 0.0
    avg_cost: float = 0.0

    # Metadata
    knowledge_entry_id: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)
    is_active: bool = True


@dataclass
class LessonLearned:
    """A lesson learned from failures or successes."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    title: str = ""
    summary: str = ""

    # Context
    problem_description: str = ""
    root_cause: str = ""
    resolution: str = ""

    # Impact
    problem_ids: list[str] = field(default_factory=list)
    affected_agents: list[str] = field(default_factory=list)
    severity: str = "medium"

    # Recommendations
    recommendations: list[str] = field(default_factory=list)
    preventive_measures: list[str] = field(default_factory=list)

    # Metadata
    knowledge_entry_id: str = ""
    created_at: datetime = field(default_factory=datetime.utcnow)
    verified_at: Optional[datetime] = None
    verified_by: Optional[str] = None


@dataclass
class KnowledgeSearchResult:
    """Search result from knowledge base."""
    entry: KnowledgeEntry
    similarity_score: float
    relevance_explanation: str = ""


@dataclass
class KnowledgeStats:
    """Statistics about the knowledge base."""
    total_entries: int = 0
    entries_by_type: dict[str, int] = field(default_factory=dict)
    entries_by_source: dict[str, int] = field(default_factory=dict)
    entries_by_confidence: dict[str, int] = field(default_factory=dict)
    most_applied_entries: list[dict] = field(default_factory=list)
    recent_entries: list[dict] = field(default_factory=list)
    avg_success_rate: float = 0.0
```

```sql
-- migrations/017_knowledge_base.sql
-- Knowledge base tables

-- Main knowledge entries table
CREATE TABLE IF NOT EXISTS knowledge_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    knowledge_type VARCHAR(50) NOT NULL,
    source VARCHAR(50) NOT NULL,
    confidence VARCHAR(20) NOT NULL DEFAULT 'medium',

    -- Categorization
    agent_id UUID REFERENCES agents(id),
    tags TEXT[] DEFAULT '{}',
    categories TEXT[] DEFAULT '{}',

    -- Evidence
    supporting_executions UUID[] DEFAULT '{}',
    success_rate FLOAT DEFAULT 0.0,
    sample_size INTEGER DEFAULT 0,

    -- Embedding
    embedding vector(1536),

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,

    -- Usage
    times_applied INTEGER DEFAULT 0,
    last_applied_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for knowledge entries
CREATE INDEX idx_knowledge_type ON knowledge_entries(knowledge_type);
CREATE INDEX idx_knowledge_source ON knowledge_entries(source);
CREATE INDEX idx_knowledge_agent ON knowledge_entries(agent_id);
CREATE INDEX idx_knowledge_active ON knowledge_entries(is_active);
CREATE INDEX idx_knowledge_tags ON knowledge_entries USING GIN(tags);
CREATE INDEX idx_knowledge_categories ON knowledge_entries USING GIN(categories);
CREATE INDEX idx_knowledge_embedding ON knowledge_entries USING ivfflat (embedding vector_cosine_ops);

-- Pattern definitions
CREATE TABLE IF NOT EXISTS pattern_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Pattern matching
    trigger_conditions JSONB DEFAULT '{}',
    context_requirements TEXT[] DEFAULT '{}',

    -- Content
    template TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    example_usage TEXT,

    -- Performance
    avg_success_rate FLOAT DEFAULT 0.0,
    avg_latency_ms FLOAT DEFAULT 0.0,
    avg_cost FLOAT DEFAULT 0.0,

    -- Metadata
    knowledge_entry_id UUID REFERENCES knowledge_entries(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_pattern_knowledge ON pattern_definitions(knowledge_entry_id);
CREATE INDEX idx_pattern_active ON pattern_definitions(is_active);

-- Lessons learned
CREATE TABLE IF NOT EXISTS lessons_learned (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    summary TEXT,

    -- Context
    problem_description TEXT,
    root_cause TEXT,
    resolution TEXT,

    -- Impact
    problem_ids UUID[] DEFAULT '{}',
    affected_agents UUID[] DEFAULT '{}',
    severity VARCHAR(20) DEFAULT 'medium',

    -- Recommendations
    recommendations TEXT[] DEFAULT '{}',
    preventive_measures TEXT[] DEFAULT '{}',

    -- Metadata
    knowledge_entry_id UUID REFERENCES knowledge_entries(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE,
    verified_by VARCHAR(255)
);

CREATE INDEX idx_lesson_knowledge ON lessons_learned(knowledge_entry_id);
CREATE INDEX idx_lesson_severity ON lessons_learned(severity);

-- Knowledge entry versions (history)
CREATE TABLE IF NOT EXISTS knowledge_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_entry_id UUID REFERENCES knowledge_entries(id),
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    changed_by VARCHAR(255),
    change_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_version_entry ON knowledge_versions(knowledge_entry_id);

-- Knowledge application log
CREATE TABLE IF NOT EXISTS knowledge_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_entry_id UUID REFERENCES knowledge_entries(id),
    execution_id UUID REFERENCES executions(id),
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    was_successful BOOLEAN,
    feedback TEXT
);

CREATE INDEX idx_application_entry ON knowledge_applications(knowledge_entry_id);
CREATE INDEX idx_application_time ON knowledge_applications(applied_at);
```
  </action>
  <verify>
    - Models define all knowledge types and structures
    - Database schema includes all necessary tables and indexes
    - Embedding field uses pgvector type
  </verify>
  <done>Knowledge base models and database schema complete with full type support</done>
</task>

### Task 17.2: Pattern Extractor

<task type="auto">
  <name>Build automatic pattern extraction from successful executions</name>
  <files>src/meta_agent/learning/pattern_extractor.py</files>
  <action>
Create a service that identifies and extracts successful patterns from execution data.

```python
# src/meta_agent/learning/pattern_extractor.py
import asyncio
import hashlib
import json
import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from ..database import Database
from ..llm import LLMClient
from .models import (
    KnowledgeEntry,
    KnowledgeType,
    KnowledgeSource,
    ConfidenceLevel,
    PatternDefinition,
)


@dataclass
class ExecutionFeatures:
    """Features extracted from an execution."""
    execution_id: str
    agent_id: str
    task_type: str = ""
    input_characteristics: dict = field(default_factory=dict)
    output_characteristics: dict = field(default_factory=dict)
    tool_sequence: list[str] = field(default_factory=list)
    prompt_structure: str = ""
    success: bool = False
    latency_ms: float = 0.0
    cost: float = 0.0


@dataclass
class PatternCandidate:
    """A candidate pattern identified from executions."""
    signature: str
    occurrences: int = 0
    success_count: int = 0
    success_rate: float = 0.0
    avg_latency_ms: float = 0.0
    avg_cost: float = 0.0
    execution_ids: list[str] = field(default_factory=list)
    features: dict = field(default_factory=dict)


class PatternExtractor:
    """Extracts successful patterns from execution data."""

    def __init__(
        self,
        db: Database,
        llm_client: LLMClient,
        min_occurrences: int = 5,
        min_success_rate: float = 0.8,
    ):
        self.db = db
        self.llm = llm_client
        self.min_occurrences = min_occurrences
        self.min_success_rate = min_success_rate

    async def extract_patterns(
        self,
        agent_id: Optional[str] = None,
        lookback_days: int = 30,
    ) -> list[KnowledgeEntry]:
        """Extract patterns from recent successful executions."""
        # Get successful executions
        executions = await self._get_successful_executions(agent_id, lookback_days)

        if len(executions) < self.min_occurrences:
            return []

        # Extract features from each execution
        features_list = await asyncio.gather(*[
            self._extract_features(ex) for ex in executions
        ])

        # Find common patterns
        candidates = self._identify_pattern_candidates(features_list)

        # Filter by quality
        quality_candidates = [
            c for c in candidates
            if c.occurrences >= self.min_occurrences
            and c.success_rate >= self.min_success_rate
        ]

        # Generate knowledge entries
        entries = []
        for candidate in quality_candidates:
            entry = await self._create_knowledge_entry(candidate)
            if entry:
                entries.append(entry)

        return entries

    async def _get_successful_executions(
        self,
        agent_id: Optional[str],
        lookback_days: int,
    ) -> list[dict]:
        """Get successful executions from database."""
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)

        query = """
            SELECT
                e.id, e.agent_id, e.input_data, e.output_data,
                e.tool_calls, e.prompt_tokens, e.completion_tokens,
                e.latency_ms, e.total_cost, e.started_at
            FROM executions e
            JOIN evaluations ev ON ev.execution_id = e.id
            WHERE e.started_at > $1
            AND ev.passed = true
            AND ev.overall_score >= 0.8
        """
        params = [cutoff]

        if agent_id:
            query += " AND e.agent_id = $2"
            params.append(agent_id)

        query += " ORDER BY e.started_at DESC LIMIT 1000"

        return await self.db.fetch_all(query, params)

    async def _extract_features(self, execution: dict) -> ExecutionFeatures:
        """Extract features from an execution."""
        input_data = execution.get("input_data") or {}
        output_data = execution.get("output_data") or {}
        tool_calls = execution.get("tool_calls") or []

        # Extract input characteristics
        input_chars = {
            "length": len(json.dumps(input_data)),
            "has_context": "context" in input_data,
            "has_examples": "examples" in input_data,
            "num_fields": len(input_data),
        }

        # Extract output characteristics
        output_chars = {
            "length": len(json.dumps(output_data)),
            "has_structured_output": isinstance(output_data, dict),
            "num_fields": len(output_data) if isinstance(output_data, dict) else 0,
        }

        # Extract tool sequence
        tool_sequence = [tc.get("tool_name", "") for tc in tool_calls]

        # Determine task type from input
        task_type = self._infer_task_type(input_data)

        return ExecutionFeatures(
            execution_id=str(execution["id"]),
            agent_id=str(execution["agent_id"]),
            task_type=task_type,
            input_characteristics=input_chars,
            output_characteristics=output_chars,
            tool_sequence=tool_sequence,
            success=True,
            latency_ms=execution.get("latency_ms", 0),
            cost=execution.get("total_cost", 0),
        )

    def _infer_task_type(self, input_data: dict) -> str:
        """Infer task type from input data."""
        input_str = json.dumps(input_data).lower()

        if any(kw in input_str for kw in ["analyze", "analysis", "evaluate"]):
            return "analysis"
        elif any(kw in input_str for kw in ["generate", "create", "write"]):
            return "generation"
        elif any(kw in input_str for kw in ["search", "find", "lookup"]):
            return "search"
        elif any(kw in input_str for kw in ["transform", "convert", "format"]):
            return "transformation"
        elif any(kw in input_str for kw in ["summarize", "summary"]):
            return "summarization"
        else:
            return "general"

    def _identify_pattern_candidates(
        self,
        features_list: list[ExecutionFeatures],
    ) -> list[PatternCandidate]:
        """Identify pattern candidates from features."""
        # Group by pattern signature
        pattern_groups: dict[str, list[ExecutionFeatures]] = defaultdict(list)

        for features in features_list:
            signature = self._compute_pattern_signature(features)
            pattern_groups[signature].append(features)

        # Create candidates
        candidates = []
        for signature, group in pattern_groups.items():
            successful = [f for f in group if f.success]

            candidate = PatternCandidate(
                signature=signature,
                occurrences=len(group),
                success_count=len(successful),
                success_rate=len(successful) / len(group) if group else 0,
                avg_latency_ms=sum(f.latency_ms for f in group) / len(group),
                avg_cost=sum(f.cost for f in group) / len(group),
                execution_ids=[f.execution_id for f in group[:10]],
                features={
                    "task_type": group[0].task_type,
                    "tool_sequence": group[0].tool_sequence,
                    "input_chars": group[0].input_characteristics,
                },
            )
            candidates.append(candidate)

        return sorted(candidates, key=lambda c: c.success_rate * c.occurrences, reverse=True)

    def _compute_pattern_signature(self, features: ExecutionFeatures) -> str:
        """Compute a signature for grouping similar executions."""
        sig_parts = [
            features.agent_id,
            features.task_type,
            "-".join(features.tool_sequence[:5]),  # First 5 tools
            str(features.input_characteristics.get("has_context", False)),
            str(features.input_characteristics.get("has_examples", False)),
        ]

        sig_str = "|".join(sig_parts)
        return hashlib.md5(sig_str.encode()).hexdigest()[:16]

    async def _create_knowledge_entry(
        self,
        candidate: PatternCandidate,
    ) -> Optional[KnowledgeEntry]:
        """Create a knowledge entry from a pattern candidate."""
        # Use LLM to generate description
        prompt = f"""
        Analyze this execution pattern and create a knowledge base entry.

        Pattern Features:
        - Task Type: {candidate.features.get('task_type')}
        - Tool Sequence: {candidate.features.get('tool_sequence')}
        - Input Characteristics: {candidate.features.get('input_chars')}
        - Occurrences: {candidate.occurrences}
        - Success Rate: {candidate.success_rate:.2%}
        - Avg Latency: {candidate.avg_latency_ms:.0f}ms
        - Avg Cost: ${candidate.avg_cost:.4f}

        Generate a JSON response with:
        {{
            "title": "Short descriptive title for this pattern",
            "description": "2-3 sentence description of what this pattern does",
            "content": "Detailed explanation of the pattern and when to use it",
            "tags": ["tag1", "tag2"],
            "categories": ["category1"]
        }}
        """

        try:
            response = await self.llm.generate(prompt, response_format="json")
            data = json.loads(response)

            # Determine confidence based on evidence
            if candidate.occurrences >= 20 and candidate.success_rate >= 0.95:
                confidence = ConfidenceLevel.HIGH
            elif candidate.occurrences >= 10 and candidate.success_rate >= 0.9:
                confidence = ConfidenceLevel.MEDIUM
            else:
                confidence = ConfidenceLevel.LOW

            return KnowledgeEntry(
                title=data.get("title", "Unnamed Pattern"),
                description=data.get("description", ""),
                content=data.get("content", ""),
                knowledge_type=KnowledgeType.PATTERN,
                source=KnowledgeSource.AUTOMATIC,
                confidence=confidence,
                tags=data.get("tags", []),
                categories=data.get("categories", []),
                supporting_executions=candidate.execution_ids,
                success_rate=candidate.success_rate,
                sample_size=candidate.occurrences,
            )
        except Exception as e:
            print(f"Failed to create knowledge entry: {e}")
            return None


class LessonExtractor:
    """Extracts lessons learned from failures and their resolutions."""

    def __init__(self, db: Database, llm_client: LLMClient):
        self.db = db
        self.llm = llm_client

    async def extract_lessons(
        self,
        lookback_days: int = 30,
    ) -> list[KnowledgeEntry]:
        """Extract lessons from resolved problems."""
        # Get resolved problems
        problems = await self._get_resolved_problems(lookback_days)

        lessons = []
        for problem in problems:
            lesson = await self._create_lesson_entry(problem)
            if lesson:
                lessons.append(lesson)

        return lessons

    async def _get_resolved_problems(self, lookback_days: int) -> list[dict]:
        """Get problems that have been resolved."""
        cutoff = datetime.utcnow() - timedelta(days=lookback_days)

        query = """
            SELECT
                p.id, p.agent_id, p.category, p.severity,
                p.description, p.root_cause, p.resolution,
                p.execution_ids, p.created_at, p.resolved_at
            FROM problems p
            WHERE p.status = 'resolved'
            AND p.resolved_at > $1
            AND p.root_cause IS NOT NULL
            AND p.resolution IS NOT NULL
        """

        return await self.db.fetch_all(query, [cutoff])

    async def _create_lesson_entry(self, problem: dict) -> Optional[KnowledgeEntry]:
        """Create a lesson learned entry from a resolved problem."""
        prompt = f"""
        Create a lesson learned entry from this resolved problem.

        Problem:
        - Category: {problem.get('category')}
        - Severity: {problem.get('severity')}
        - Description: {problem.get('description')}
        - Root Cause: {problem.get('root_cause')}
        - Resolution: {problem.get('resolution')}

        Generate a JSON response with:
        {{
            "title": "Short title for this lesson",
            "summary": "1-2 sentence summary",
            "content": "Detailed lesson learned with recommendations",
            "recommendations": ["recommendation 1", "recommendation 2"],
            "preventive_measures": ["measure 1", "measure 2"],
            "tags": ["tag1", "tag2"]
        }}
        """

        try:
            response = await self.llm.generate(prompt, response_format="json")
            data = json.loads(response)

            return KnowledgeEntry(
                title=data.get("title", "Lesson Learned"),
                description=data.get("summary", ""),
                content=data.get("content", ""),
                knowledge_type=KnowledgeType.LESSON,
                source=KnowledgeSource.AUTOMATIC,
                confidence=ConfidenceLevel.HIGH,  # Resolved problems are verified
                tags=data.get("tags", []),
                categories=[problem.get("category", "general")],
                supporting_executions=problem.get("execution_ids", []),
            )
        except Exception as e:
            print(f"Failed to create lesson entry: {e}")
            return None
```
  </action>
  <verify>
    - PatternExtractor identifies patterns from successful executions
    - LessonExtractor creates entries from resolved problems
    - Both use LLM to generate quality descriptions
    - Confidence levels calculated based on evidence strength
  </verify>
  <done>Pattern and lesson extraction with LLM-powered descriptions complete</done>
</task>

### Task 17.3: Knowledge Repository

<task type="auto">
  <name>Implement knowledge repository with CRUD and search</name>
  <files>src/meta_agent/learning/repository.py</files>
  <action>
Create a repository for managing knowledge entries with full CRUD and semantic search.

```python
# src/meta_agent/learning/repository.py
import json
from datetime import datetime
from typing import Optional

from ..database import Database
from ..embeddings import EmbeddingClient
from .models import (
    KnowledgeEntry,
    KnowledgeType,
    KnowledgeSource,
    ConfidenceLevel,
    PatternDefinition,
    LessonLearned,
    KnowledgeSearchResult,
    KnowledgeStats,
)


class KnowledgeRepository:
    """Repository for knowledge base operations."""

    def __init__(self, db: Database, embedding_client: EmbeddingClient):
        self.db = db
        self.embeddings = embedding_client

    # ==================== CREATE ====================

    async def create_entry(self, entry: KnowledgeEntry) -> KnowledgeEntry:
        """Create a new knowledge entry."""
        # Generate embedding for the entry
        text_for_embedding = f"{entry.title} {entry.description} {entry.content}"
        entry.embedding = await self.embeddings.embed(text_for_embedding)

        query = """
            INSERT INTO knowledge_entries (
                id, title, description, content, knowledge_type, source,
                confidence, agent_id, tags, categories, supporting_executions,
                success_rate, sample_size, embedding, created_at, updated_at,
                created_by, version, is_active
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                $15, $16, $17, $18, $19
            )
            RETURNING *
        """

        row = await self.db.fetch_one(query, [
            entry.id,
            entry.title,
            entry.description,
            entry.content,
            entry.knowledge_type.value,
            entry.source.value,
            entry.confidence.value,
            entry.agent_id,
            entry.tags,
            entry.categories,
            entry.supporting_executions,
            entry.success_rate,
            entry.sample_size,
            entry.embedding,
            entry.created_at,
            entry.updated_at,
            entry.created_by,
            entry.version,
            entry.is_active,
        ])

        return self._row_to_entry(row)

    async def create_pattern(self, pattern: PatternDefinition) -> PatternDefinition:
        """Create a pattern definition linked to a knowledge entry."""
        query = """
            INSERT INTO pattern_definitions (
                id, name, description, trigger_conditions, context_requirements,
                template, variables, example_usage, avg_success_rate,
                avg_latency_ms, avg_cost, knowledge_entry_id, created_at, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        """

        row = await self.db.fetch_one(query, [
            pattern.id,
            pattern.name,
            pattern.description,
            json.dumps(pattern.trigger_conditions),
            pattern.context_requirements,
            pattern.template,
            pattern.variables,
            pattern.example_usage,
            pattern.avg_success_rate,
            pattern.avg_latency_ms,
            pattern.avg_cost,
            pattern.knowledge_entry_id,
            pattern.created_at,
            pattern.is_active,
        ])

        return self._row_to_pattern(row)

    async def create_lesson(self, lesson: LessonLearned) -> LessonLearned:
        """Create a lesson learned entry."""
        query = """
            INSERT INTO lessons_learned (
                id, title, summary, problem_description, root_cause,
                resolution, problem_ids, affected_agents, severity,
                recommendations, preventive_measures, knowledge_entry_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        """

        row = await self.db.fetch_one(query, [
            lesson.id,
            lesson.title,
            lesson.summary,
            lesson.problem_description,
            lesson.root_cause,
            lesson.resolution,
            lesson.problem_ids,
            lesson.affected_agents,
            lesson.severity,
            lesson.recommendations,
            lesson.preventive_measures,
            lesson.knowledge_entry_id,
            lesson.created_at,
        ])

        return self._row_to_lesson(row)

    # ==================== READ ====================

    async def get_entry(self, entry_id: str) -> Optional[KnowledgeEntry]:
        """Get a knowledge entry by ID."""
        query = "SELECT * FROM knowledge_entries WHERE id = $1"
        row = await self.db.fetch_one(query, [entry_id])
        return self._row_to_entry(row) if row else None

    async def list_entries(
        self,
        knowledge_type: Optional[KnowledgeType] = None,
        agent_id: Optional[str] = None,
        tags: Optional[list[str]] = None,
        categories: Optional[list[str]] = None,
        is_active: bool = True,
        limit: int = 100,
        offset: int = 0,
    ) -> list[KnowledgeEntry]:
        """List knowledge entries with filters."""
        conditions = ["is_active = $1"]
        params = [is_active]
        param_idx = 2

        if knowledge_type:
            conditions.append(f"knowledge_type = ${param_idx}")
            params.append(knowledge_type.value)
            param_idx += 1

        if agent_id:
            conditions.append(f"(agent_id = ${param_idx} OR agent_id IS NULL)")
            params.append(agent_id)
            param_idx += 1

        if tags:
            conditions.append(f"tags && ${param_idx}")
            params.append(tags)
            param_idx += 1

        if categories:
            conditions.append(f"categories && ${param_idx}")
            params.append(categories)
            param_idx += 1

        query = f"""
            SELECT * FROM knowledge_entries
            WHERE {' AND '.join(conditions)}
            ORDER BY times_applied DESC, created_at DESC
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """
        params.extend([limit, offset])

        rows = await self.db.fetch_all(query, params)
        return [self._row_to_entry(row) for row in rows]

    async def search_entries(
        self,
        query_text: str,
        knowledge_type: Optional[KnowledgeType] = None,
        agent_id: Optional[str] = None,
        limit: int = 10,
        min_similarity: float = 0.5,
    ) -> list[KnowledgeSearchResult]:
        """Semantic search for knowledge entries."""
        # Generate embedding for query
        query_embedding = await self.embeddings.embed(query_text)

        # Build query
        conditions = ["is_active = true"]
        params = [query_embedding, min_similarity]
        param_idx = 3

        if knowledge_type:
            conditions.append(f"knowledge_type = ${param_idx}")
            params.append(knowledge_type.value)
            param_idx += 1

        if agent_id:
            conditions.append(f"(agent_id = ${param_idx} OR agent_id IS NULL)")
            params.append(agent_id)
            param_idx += 1

        query = f"""
            SELECT *, 1 - (embedding <=> $1) as similarity
            FROM knowledge_entries
            WHERE {' AND '.join(conditions)}
            AND 1 - (embedding <=> $1) > $2
            ORDER BY similarity DESC
            LIMIT ${param_idx}
        """
        params.append(limit)

        rows = await self.db.fetch_all(query, params)

        return [
            KnowledgeSearchResult(
                entry=self._row_to_entry(row),
                similarity_score=row["similarity"],
            )
            for row in rows
        ]

    async def get_similar_entries(
        self,
        entry_id: str,
        limit: int = 5,
    ) -> list[KnowledgeSearchResult]:
        """Find entries similar to a given entry."""
        entry = await self.get_entry(entry_id)
        if not entry or not entry.embedding:
            return []

        query = """
            SELECT *, 1 - (embedding <=> $1) as similarity
            FROM knowledge_entries
            WHERE id != $2 AND is_active = true
            ORDER BY similarity DESC
            LIMIT $3
        """

        rows = await self.db.fetch_all(query, [entry.embedding, entry_id, limit])

        return [
            KnowledgeSearchResult(
                entry=self._row_to_entry(row),
                similarity_score=row["similarity"],
            )
            for row in rows
        ]

    # ==================== UPDATE ====================

    async def update_entry(
        self,
        entry_id: str,
        updates: dict,
        change_reason: str = "",
    ) -> Optional[KnowledgeEntry]:
        """Update a knowledge entry and save version history."""
        # Get current version
        current = await self.get_entry(entry_id)
        if not current:
            return None

        # Save version history
        await self._save_version(current, change_reason)

        # Prepare update
        allowed_fields = {
            "title", "description", "content", "confidence",
            "tags", "categories", "is_active"
        }

        update_fields = {k: v for k, v in updates.items() if k in allowed_fields}
        update_fields["updated_at"] = datetime.utcnow()
        update_fields["version"] = current.version + 1

        # Regenerate embedding if content changed
        if any(k in updates for k in ["title", "description", "content"]):
            title = updates.get("title", current.title)
            description = updates.get("description", current.description)
            content = updates.get("content", current.content)
            update_fields["embedding"] = await self.embeddings.embed(
                f"{title} {description} {content}"
            )

        # Build update query
        set_clauses = [f"{k} = ${i+2}" for i, k in enumerate(update_fields.keys())]
        query = f"""
            UPDATE knowledge_entries
            SET {', '.join(set_clauses)}
            WHERE id = $1
            RETURNING *
        """

        row = await self.db.fetch_one(
            query,
            [entry_id] + list(update_fields.values())
        )

        return self._row_to_entry(row) if row else None

    async def _save_version(self, entry: KnowledgeEntry, change_reason: str):
        """Save entry version to history."""
        query = """
            INSERT INTO knowledge_versions (
                knowledge_entry_id, version, content, change_reason, created_at
            ) VALUES ($1, $2, $3, $4, $5)
        """

        await self.db.execute(query, [
            entry.id,
            entry.version,
            entry.content,
            change_reason,
            datetime.utcnow(),
        ])

    async def record_application(
        self,
        entry_id: str,
        execution_id: str,
        was_successful: bool,
        feedback: Optional[str] = None,
    ):
        """Record when a knowledge entry was applied."""
        # Update entry stats
        await self.db.execute("""
            UPDATE knowledge_entries
            SET times_applied = times_applied + 1,
                last_applied_at = NOW()
            WHERE id = $1
        """, [entry_id])

        # Log application
        await self.db.execute("""
            INSERT INTO knowledge_applications (
                knowledge_entry_id, execution_id, was_successful, feedback
            ) VALUES ($1, $2, $3, $4)
        """, [entry_id, execution_id, was_successful, feedback])

    # ==================== DELETE ====================

    async def delete_entry(self, entry_id: str, hard: bool = False) -> bool:
        """Delete a knowledge entry (soft or hard delete)."""
        if hard:
            await self.db.execute(
                "DELETE FROM knowledge_entries WHERE id = $1",
                [entry_id]
            )
        else:
            await self.db.execute(
                "UPDATE knowledge_entries SET is_active = false WHERE id = $1",
                [entry_id]
            )
        return True

    # ==================== STATS ====================

    async def get_stats(self) -> KnowledgeStats:
        """Get knowledge base statistics."""
        # Total entries
        total = await self.db.fetch_one(
            "SELECT COUNT(*) as count FROM knowledge_entries WHERE is_active = true"
        )

        # By type
        by_type = await self.db.fetch_all("""
            SELECT knowledge_type, COUNT(*) as count
            FROM knowledge_entries WHERE is_active = true
            GROUP BY knowledge_type
        """)

        # By source
        by_source = await self.db.fetch_all("""
            SELECT source, COUNT(*) as count
            FROM knowledge_entries WHERE is_active = true
            GROUP BY source
        """)

        # By confidence
        by_confidence = await self.db.fetch_all("""
            SELECT confidence, COUNT(*) as count
            FROM knowledge_entries WHERE is_active = true
            GROUP BY confidence
        """)

        # Most applied
        most_applied = await self.db.fetch_all("""
            SELECT id, title, times_applied
            FROM knowledge_entries WHERE is_active = true
            ORDER BY times_applied DESC
            LIMIT 10
        """)

        # Recent
        recent = await self.db.fetch_all("""
            SELECT id, title, created_at
            FROM knowledge_entries WHERE is_active = true
            ORDER BY created_at DESC
            LIMIT 10
        """)

        # Avg success rate
        avg_success = await self.db.fetch_one("""
            SELECT AVG(success_rate) as avg
            FROM knowledge_entries
            WHERE is_active = true AND sample_size > 0
        """)

        return KnowledgeStats(
            total_entries=total["count"] if total else 0,
            entries_by_type={r["knowledge_type"]: r["count"] for r in by_type},
            entries_by_source={r["source"]: r["count"] for r in by_source},
            entries_by_confidence={r["confidence"]: r["count"] for r in by_confidence},
            most_applied_entries=[dict(r) for r in most_applied],
            recent_entries=[dict(r) for r in recent],
            avg_success_rate=avg_success["avg"] if avg_success and avg_success["avg"] else 0.0,
        )

    # ==================== HELPERS ====================

    def _row_to_entry(self, row: dict) -> KnowledgeEntry:
        """Convert database row to KnowledgeEntry."""
        return KnowledgeEntry(
            id=str(row["id"]),
            title=row["title"],
            description=row.get("description", ""),
            content=row["content"],
            knowledge_type=KnowledgeType(row["knowledge_type"]),
            source=KnowledgeSource(row["source"]),
            confidence=ConfidenceLevel(row["confidence"]),
            agent_id=str(row["agent_id"]) if row.get("agent_id") else None,
            tags=row.get("tags", []),
            categories=row.get("categories", []),
            supporting_executions=row.get("supporting_executions", []),
            success_rate=row.get("success_rate", 0.0),
            sample_size=row.get("sample_size", 0),
            embedding=row.get("embedding"),
            created_at=row["created_at"],
            updated_at=row.get("updated_at"),
            created_by=row.get("created_by"),
            version=row.get("version", 1),
            is_active=row.get("is_active", True),
            times_applied=row.get("times_applied", 0),
            last_applied_at=row.get("last_applied_at"),
        )

    def _row_to_pattern(self, row: dict) -> PatternDefinition:
        """Convert database row to PatternDefinition."""
        return PatternDefinition(
            id=str(row["id"]),
            name=row["name"],
            description=row.get("description", ""),
            trigger_conditions=json.loads(row.get("trigger_conditions", "{}")),
            context_requirements=row.get("context_requirements", []),
            template=row["template"],
            variables=row.get("variables", []),
            example_usage=row.get("example_usage", ""),
            avg_success_rate=row.get("avg_success_rate", 0.0),
            avg_latency_ms=row.get("avg_latency_ms", 0.0),
            avg_cost=row.get("avg_cost", 0.0),
            knowledge_entry_id=str(row["knowledge_entry_id"]),
            created_at=row["created_at"],
            is_active=row.get("is_active", True),
        )

    def _row_to_lesson(self, row: dict) -> LessonLearned:
        """Convert database row to LessonLearned."""
        return LessonLearned(
            id=str(row["id"]),
            title=row["title"],
            summary=row.get("summary", ""),
            problem_description=row.get("problem_description", ""),
            root_cause=row.get("root_cause", ""),
            resolution=row.get("resolution", ""),
            problem_ids=row.get("problem_ids", []),
            affected_agents=row.get("affected_agents", []),
            severity=row.get("severity", "medium"),
            recommendations=row.get("recommendations", []),
            preventive_measures=row.get("preventive_measures", []),
            knowledge_entry_id=str(row["knowledge_entry_id"]),
            created_at=row["created_at"],
            verified_at=row.get("verified_at"),
            verified_by=row.get("verified_by"),
        )
```
  </action>
  <verify>
    - Full CRUD operations for knowledge entries
    - Semantic search using embeddings
    - Version history tracking
    - Application tracking for usage analytics
    - Statistics aggregation
  </verify>
  <done>Knowledge repository with CRUD, search, and analytics complete</done>
</task>

### Task 17.4: Knowledge Application Engine

<task type="auto">
  <name>Build engine to apply relevant knowledge to agent executions</name>
  <files>src/meta_agent/learning/application_engine.py</files>
  <action>
Create an engine that finds and applies relevant knowledge to enhance agent executions.

```python
# src/meta_agent/learning/application_engine.py
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .repository import KnowledgeRepository
from .models import (
    KnowledgeEntry,
    KnowledgeType,
    KnowledgeSearchResult,
    PatternDefinition,
)


@dataclass
class AppliedKnowledge:
    """Knowledge applied to an execution."""
    entry: KnowledgeEntry
    relevance_score: float
    application_type: str  # "prompt_enhancement", "parameter_suggestion", "warning"
    enhancement: str  # The actual enhancement/suggestion


@dataclass
class ExecutionContext:
    """Context for a pending execution."""
    agent_id: str
    task_description: str
    input_data: dict = field(default_factory=dict)
    current_prompt: str = ""
    tools_available: list[str] = field(default_factory=list)
    previous_attempts: int = 0
    error_history: list[str] = field(default_factory=list)


@dataclass
class KnowledgeEnhancement:
    """Enhancements from applied knowledge."""
    enhanced_prompt: Optional[str] = None
    suggested_parameters: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    relevant_patterns: list[PatternDefinition] = field(default_factory=list)
    applied_entries: list[AppliedKnowledge] = field(default_factory=list)


class KnowledgeApplicationEngine:
    """Applies relevant knowledge to enhance agent executions."""

    def __init__(
        self,
        repository: KnowledgeRepository,
        min_relevance: float = 0.6,
        max_entries_to_apply: int = 5,
    ):
        self.repo = repository
        self.min_relevance = min_relevance
        self.max_entries = max_entries_to_apply

    async def enhance_execution(
        self,
        context: ExecutionContext,
    ) -> KnowledgeEnhancement:
        """Find and apply relevant knowledge to enhance an execution."""
        enhancement = KnowledgeEnhancement()

        # Search for relevant knowledge
        relevant_entries = await self._find_relevant_knowledge(context)

        if not relevant_entries:
            return enhancement

        # Apply each type of knowledge
        for result in relevant_entries:
            applied = await self._apply_knowledge(result, context, enhancement)
            if applied:
                enhancement.applied_entries.append(applied)

        # Generate enhanced prompt if applicable
        if context.current_prompt and enhancement.applied_entries:
            enhancement.enhanced_prompt = await self._enhance_prompt(
                context.current_prompt,
                enhancement.applied_entries,
            )

        return enhancement

    async def _find_relevant_knowledge(
        self,
        context: ExecutionContext,
    ) -> list[KnowledgeSearchResult]:
        """Find knowledge entries relevant to the execution context."""
        # Build search query from context
        search_text = self._build_search_query(context)

        # Search for relevant entries
        results = await self.repo.search_entries(
            query_text=search_text,
            agent_id=context.agent_id,
            limit=self.max_entries * 2,  # Get extra to filter
            min_similarity=self.min_relevance,
        )

        # If we have error history, also search for relevant lessons
        if context.error_history:
            error_text = " ".join(context.error_history[-3:])
            lesson_results = await self.repo.search_entries(
                query_text=error_text,
                knowledge_type=KnowledgeType.LESSON,
                limit=3,
                min_similarity=self.min_relevance,
            )
            results.extend(lesson_results)

        # Sort by relevance and deduplicate
        seen_ids = set()
        unique_results = []
        for r in sorted(results, key=lambda x: x.similarity_score, reverse=True):
            if r.entry.id not in seen_ids:
                seen_ids.add(r.entry.id)
                unique_results.append(r)

        return unique_results[:self.max_entries]

    def _build_search_query(self, context: ExecutionContext) -> str:
        """Build search query from execution context."""
        parts = [context.task_description]

        if context.input_data:
            # Add key fields from input
            for key, value in context.input_data.items():
                if isinstance(value, str) and len(value) < 200:
                    parts.append(f"{key}: {value}")

        if context.tools_available:
            parts.append(f"tools: {', '.join(context.tools_available[:5])}")

        return " ".join(parts)

    async def _apply_knowledge(
        self,
        result: KnowledgeSearchResult,
        context: ExecutionContext,
        enhancement: KnowledgeEnhancement,
    ) -> Optional[AppliedKnowledge]:
        """Apply a knowledge entry to the enhancement."""
        entry = result.entry

        if entry.knowledge_type == KnowledgeType.PATTERN:
            return await self._apply_pattern(entry, result.similarity_score, enhancement)

        elif entry.knowledge_type == KnowledgeType.LESSON:
            return await self._apply_lesson(entry, result.similarity_score, enhancement)

        elif entry.knowledge_type == KnowledgeType.ANTI_PATTERN:
            return await self._apply_anti_pattern(entry, result.similarity_score, enhancement)

        elif entry.knowledge_type == KnowledgeType.BEST_PRACTICE:
            return await self._apply_best_practice(entry, result.similarity_score, enhancement)

        elif entry.knowledge_type == KnowledgeType.CONFIGURATION:
            return await self._apply_configuration(entry, result.similarity_score, enhancement)

        elif entry.knowledge_type == KnowledgeType.PROMPT_TEMPLATE:
            return await self._apply_prompt_template(entry, result.similarity_score, enhancement)

        return None

    async def _apply_pattern(
        self,
        entry: KnowledgeEntry,
        score: float,
        enhancement: KnowledgeEnhancement,
    ) -> AppliedKnowledge:
        """Apply a pattern entry."""
        return AppliedKnowledge(
            entry=entry,
            relevance_score=score,
            application_type="pattern_guidance",
            enhancement=f"Consider this pattern: {entry.description}\n{entry.content}",
        )

    async def _apply_lesson(
        self,
        entry: KnowledgeEntry,
        score: float,
        enhancement: KnowledgeEnhancement,
    ) -> AppliedKnowledge:
        """Apply a lesson learned entry."""
        enhancement.warnings.append(
            f"Lesson learned: {entry.title} - {entry.description}"
        )

        return AppliedKnowledge(
            entry=entry,
            relevance_score=score,
            application_type="warning",
            enhancement=entry.content,
        )

    async def _apply_anti_pattern(
        self,
        entry: KnowledgeEntry,
        score: float,
        enhancement: KnowledgeEnhancement,
    ) -> AppliedKnowledge:
        """Apply an anti-pattern entry as a warning."""
        enhancement.warnings.append(
            f"⚠️ Avoid: {entry.title}"
        )

        return AppliedKnowledge(
            entry=entry,
            relevance_score=score,
            application_type="warning",
            enhancement=f"Avoid this approach: {entry.content}",
        )

    async def _apply_best_practice(
        self,
        entry: KnowledgeEntry,
        score: float,
        enhancement: KnowledgeEnhancement,
    ) -> AppliedKnowledge:
        """Apply a best practice entry."""
        return AppliedKnowledge(
            entry=entry,
            relevance_score=score,
            application_type="prompt_enhancement",
            enhancement=f"Best practice: {entry.content}",
        )

    async def _apply_configuration(
        self,
        entry: KnowledgeEntry,
        score: float,
        enhancement: KnowledgeEnhancement,
    ) -> AppliedKnowledge:
        """Apply configuration suggestions."""
        # Parse configuration from content
        try:
            config = json.loads(entry.content)
            enhancement.suggested_parameters.update(config)
        except json.JSONDecodeError:
            pass

        return AppliedKnowledge(
            entry=entry,
            relevance_score=score,
            application_type="parameter_suggestion",
            enhancement=f"Suggested configuration: {entry.content}",
        )

    async def _apply_prompt_template(
        self,
        entry: KnowledgeEntry,
        score: float,
        enhancement: KnowledgeEnhancement,
    ) -> AppliedKnowledge:
        """Apply a prompt template."""
        return AppliedKnowledge(
            entry=entry,
            relevance_score=score,
            application_type="prompt_enhancement",
            enhancement=entry.content,
        )

    async def _enhance_prompt(
        self,
        original_prompt: str,
        applied_entries: list[AppliedKnowledge],
    ) -> str:
        """Enhance prompt with applied knowledge."""
        enhancements = []

        for applied in applied_entries:
            if applied.application_type in ["prompt_enhancement", "pattern_guidance"]:
                enhancements.append(applied.enhancement)

        if not enhancements:
            return original_prompt

        # Add enhancements as context
        enhancement_text = "\n".join([
            "# Relevant Knowledge:",
            *[f"- {e}" for e in enhancements[:3]],  # Limit to top 3
        ])

        return f"{enhancement_text}\n\n{original_prompt}"

    async def record_outcome(
        self,
        execution_id: str,
        applied_entries: list[AppliedKnowledge],
        was_successful: bool,
        feedback: Optional[str] = None,
    ):
        """Record the outcome of applied knowledge."""
        for applied in applied_entries:
            await self.repo.record_application(
                entry_id=applied.entry.id,
                execution_id=execution_id,
                was_successful=was_successful,
                feedback=feedback,
            )


class KnowledgeLearningLoop:
    """Continuous learning loop that extracts and applies knowledge."""

    def __init__(
        self,
        repository: KnowledgeRepository,
        pattern_extractor,  # PatternExtractor
        lesson_extractor,  # LessonExtractor
        application_engine: KnowledgeApplicationEngine,
    ):
        self.repo = repository
        self.pattern_extractor = pattern_extractor
        self.lesson_extractor = lesson_extractor
        self.engine = application_engine

    async def run_extraction_cycle(
        self,
        agent_id: Optional[str] = None,
        lookback_days: int = 7,
    ) -> dict:
        """Run a full extraction cycle."""
        results = {
            "patterns_extracted": 0,
            "lessons_extracted": 0,
            "entries_created": [],
        }

        # Extract patterns
        patterns = await self.pattern_extractor.extract_patterns(
            agent_id=agent_id,
            lookback_days=lookback_days,
        )

        for entry in patterns:
            # Check for duplicates
            existing = await self.repo.search_entries(
                query_text=entry.title,
                knowledge_type=KnowledgeType.PATTERN,
                limit=1,
                min_similarity=0.9,
            )

            if not existing:
                created = await self.repo.create_entry(entry)
                results["entries_created"].append(created.id)
                results["patterns_extracted"] += 1

        # Extract lessons
        lessons = await self.lesson_extractor.extract_lessons(
            lookback_days=lookback_days,
        )

        for entry in lessons:
            existing = await self.repo.search_entries(
                query_text=entry.title,
                knowledge_type=KnowledgeType.LESSON,
                limit=1,
                min_similarity=0.9,
            )

            if not existing:
                created = await self.repo.create_entry(entry)
                results["entries_created"].append(created.id)
                results["lessons_extracted"] += 1

        return results

    async def get_knowledge_for_execution(
        self,
        context: ExecutionContext,
    ) -> KnowledgeEnhancement:
        """Get knowledge enhancements for an execution."""
        return await self.engine.enhance_execution(context)
```
  </action>
  <verify>
    - Application engine finds relevant knowledge for executions
    - Different knowledge types are applied appropriately
    - Prompt enhancement with relevant knowledge
    - Outcome recording for feedback loop
    - Learning loop runs extraction cycles
  </verify>
  <done>Knowledge application engine with enhancement and learning loop complete</done>
</task>

### Task 17.5: Knowledge API Endpoints

<task type="auto">
  <name>Create REST API for knowledge base management</name>
  <files>src/meta_agent/api/routes/knowledge.py</files>
  <action>
Implement API endpoints for managing the knowledge base.

```python
# src/meta_agent/api/routes/knowledge.py
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ...learning.models import (
    KnowledgeType,
    KnowledgeSource,
    ConfidenceLevel,
)
from ...learning.repository import KnowledgeRepository
from ...learning.application_engine import (
    KnowledgeApplicationEngine,
    KnowledgeLearningLoop,
    ExecutionContext,
)
from ..dependencies import get_knowledge_repo, get_learning_loop


router = APIRouter(prefix="/knowledge", tags=["knowledge"])


# ==================== REQUEST/RESPONSE MODELS ====================

class CreateEntryRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: str = ""
    content: str = Field(..., min_length=1)
    knowledge_type: KnowledgeType = KnowledgeType.PATTERN
    confidence: ConfidenceLevel = ConfidenceLevel.MEDIUM
    agent_id: Optional[str] = None
    tags: list[str] = []
    categories: list[str] = []


class UpdateEntryRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    confidence: Optional[ConfidenceLevel] = None
    tags: Optional[list[str]] = None
    categories: Optional[list[str]] = None
    is_active: Optional[bool] = None
    change_reason: str = ""


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    knowledge_type: Optional[KnowledgeType] = None
    agent_id: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=50)
    min_similarity: float = Field(default=0.5, ge=0, le=1)


class ApplyKnowledgeRequest(BaseModel):
    agent_id: str
    task_description: str
    input_data: dict = {}
    current_prompt: str = ""
    tools_available: list[str] = []
    error_history: list[str] = []


class RunExtractionRequest(BaseModel):
    agent_id: Optional[str] = None
    lookback_days: int = Field(default=7, ge=1, le=90)


class EntryResponse(BaseModel):
    id: str
    title: str
    description: str
    content: str
    knowledge_type: str
    source: str
    confidence: str
    agent_id: Optional[str]
    tags: list[str]
    categories: list[str]
    success_rate: float
    sample_size: int
    times_applied: int
    created_at: datetime
    updated_at: Optional[datetime]
    is_active: bool


class SearchResultResponse(BaseModel):
    entry: EntryResponse
    similarity_score: float


class StatsResponse(BaseModel):
    total_entries: int
    entries_by_type: dict
    entries_by_source: dict
    entries_by_confidence: dict
    most_applied_entries: list
    recent_entries: list
    avg_success_rate: float


class AppliedKnowledgeResponse(BaseModel):
    entry_id: str
    entry_title: str
    relevance_score: float
    application_type: str
    enhancement: str


class EnhancementResponse(BaseModel):
    enhanced_prompt: Optional[str]
    suggested_parameters: dict
    warnings: list[str]
    applied_entries: list[AppliedKnowledgeResponse]


class ExtractionResultResponse(BaseModel):
    patterns_extracted: int
    lessons_extracted: int
    entries_created: list[str]


# ==================== ENDPOINTS ====================

@router.post("/entries", response_model=EntryResponse)
async def create_entry(
    request: CreateEntryRequest,
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """Create a new knowledge entry."""
    from ...learning.models import KnowledgeEntry

    entry = KnowledgeEntry(
        title=request.title,
        description=request.description,
        content=request.content,
        knowledge_type=request.knowledge_type,
        source=KnowledgeSource.MANUAL,
        confidence=request.confidence,
        agent_id=request.agent_id,
        tags=request.tags,
        categories=request.categories,
    )

    created = await repo.create_entry(entry)
    return _entry_to_response(created)


@router.get("/entries", response_model=list[EntryResponse])
async def list_entries(
    knowledge_type: Optional[KnowledgeType] = None,
    agent_id: Optional[str] = None,
    tags: Optional[str] = Query(None, description="Comma-separated tags"),
    categories: Optional[str] = Query(None, description="Comma-separated categories"),
    is_active: bool = True,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """List knowledge entries with filters."""
    tag_list = tags.split(",") if tags else None
    category_list = categories.split(",") if categories else None

    entries = await repo.list_entries(
        knowledge_type=knowledge_type,
        agent_id=agent_id,
        tags=tag_list,
        categories=category_list,
        is_active=is_active,
        limit=limit,
        offset=offset,
    )

    return [_entry_to_response(e) for e in entries]


@router.get("/entries/{entry_id}", response_model=EntryResponse)
async def get_entry(
    entry_id: str,
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """Get a specific knowledge entry."""
    entry = await repo.get_entry(entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return _entry_to_response(entry)


@router.put("/entries/{entry_id}", response_model=EntryResponse)
async def update_entry(
    entry_id: str,
    request: UpdateEntryRequest,
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """Update a knowledge entry."""
    updates = {k: v for k, v in request.dict().items() if v is not None and k != "change_reason"}

    updated = await repo.update_entry(
        entry_id=entry_id,
        updates=updates,
        change_reason=request.change_reason,
    )

    if not updated:
        raise HTTPException(status_code=404, detail="Entry not found")

    return _entry_to_response(updated)


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    hard: bool = False,
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """Delete a knowledge entry."""
    await repo.delete_entry(entry_id, hard=hard)
    return {"status": "deleted", "entry_id": entry_id}


@router.post("/search", response_model=list[SearchResultResponse])
async def search_entries(
    request: SearchRequest,
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """Search knowledge entries semantically."""
    results = await repo.search_entries(
        query_text=request.query,
        knowledge_type=request.knowledge_type,
        agent_id=request.agent_id,
        limit=request.limit,
        min_similarity=request.min_similarity,
    )

    return [
        SearchResultResponse(
            entry=_entry_to_response(r.entry),
            similarity_score=r.similarity_score,
        )
        for r in results
    ]


@router.get("/entries/{entry_id}/similar", response_model=list[SearchResultResponse])
async def get_similar_entries(
    entry_id: str,
    limit: int = Query(default=5, ge=1, le=20),
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """Find entries similar to a given entry."""
    results = await repo.get_similar_entries(entry_id, limit=limit)

    return [
        SearchResultResponse(
            entry=_entry_to_response(r.entry),
            similarity_score=r.similarity_score,
        )
        for r in results
    ]


@router.get("/stats", response_model=StatsResponse)
async def get_stats(
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """Get knowledge base statistics."""
    stats = await repo.get_stats()
    return StatsResponse(
        total_entries=stats.total_entries,
        entries_by_type=stats.entries_by_type,
        entries_by_source=stats.entries_by_source,
        entries_by_confidence=stats.entries_by_confidence,
        most_applied_entries=stats.most_applied_entries,
        recent_entries=stats.recent_entries,
        avg_success_rate=stats.avg_success_rate,
    )


@router.post("/apply", response_model=EnhancementResponse)
async def apply_knowledge(
    request: ApplyKnowledgeRequest,
    loop: KnowledgeLearningLoop = Depends(get_learning_loop),
):
    """Apply relevant knowledge to an execution context."""
    context = ExecutionContext(
        agent_id=request.agent_id,
        task_description=request.task_description,
        input_data=request.input_data,
        current_prompt=request.current_prompt,
        tools_available=request.tools_available,
        error_history=request.error_history,
    )

    enhancement = await loop.get_knowledge_for_execution(context)

    return EnhancementResponse(
        enhanced_prompt=enhancement.enhanced_prompt,
        suggested_parameters=enhancement.suggested_parameters,
        warnings=enhancement.warnings,
        applied_entries=[
            AppliedKnowledgeResponse(
                entry_id=a.entry.id,
                entry_title=a.entry.title,
                relevance_score=a.relevance_score,
                application_type=a.application_type,
                enhancement=a.enhancement,
            )
            for a in enhancement.applied_entries
        ],
    )


@router.post("/extract", response_model=ExtractionResultResponse)
async def run_extraction(
    request: RunExtractionRequest,
    loop: KnowledgeLearningLoop = Depends(get_learning_loop),
):
    """Run knowledge extraction cycle."""
    results = await loop.run_extraction_cycle(
        agent_id=request.agent_id,
        lookback_days=request.lookback_days,
    )

    return ExtractionResultResponse(
        patterns_extracted=results["patterns_extracted"],
        lessons_extracted=results["lessons_extracted"],
        entries_created=results["entries_created"],
    )


@router.post("/entries/{entry_id}/record-application")
async def record_application(
    entry_id: str,
    execution_id: str,
    was_successful: bool,
    feedback: Optional[str] = None,
    repo: KnowledgeRepository = Depends(get_knowledge_repo),
):
    """Record when knowledge was applied and its outcome."""
    await repo.record_application(
        entry_id=entry_id,
        execution_id=execution_id,
        was_successful=was_successful,
        feedback=feedback,
    )
    return {"status": "recorded"}


# ==================== HELPERS ====================

def _entry_to_response(entry) -> EntryResponse:
    """Convert KnowledgeEntry to response model."""
    return EntryResponse(
        id=entry.id,
        title=entry.title,
        description=entry.description,
        content=entry.content,
        knowledge_type=entry.knowledge_type.value,
        source=entry.source.value,
        confidence=entry.confidence.value,
        agent_id=entry.agent_id,
        tags=entry.tags,
        categories=entry.categories,
        success_rate=entry.success_rate,
        sample_size=entry.sample_size,
        times_applied=entry.times_applied,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
        is_active=entry.is_active,
    )
```
  </action>
  <verify>
    - CRUD endpoints for knowledge entries
    - Semantic search endpoint
    - Similar entries endpoint
    - Knowledge application endpoint
    - Extraction trigger endpoint
    - Statistics endpoint
  </verify>
  <done>Knowledge base REST API with all management and application endpoints complete</done>
</task>

## Phase Completion Criteria

- [ ] Knowledge base models and database schema defined
- [ ] Pattern extraction from successful executions working
- [ ] Lesson extraction from resolved problems working
- [ ] Knowledge repository with full CRUD and search
- [ ] Knowledge application engine enhancing executions
- [ ] REST API for knowledge management
- [ ] Learning loop running extraction cycles
- [ ] Integration with embedding system for semantic search
