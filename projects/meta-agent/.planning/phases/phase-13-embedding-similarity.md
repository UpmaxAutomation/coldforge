# Phase 13: Embedding & Similarity System

**Duration**: 3 days | **Complexity**: Medium | **Dependencies**: Phase 3

## Phase Overview

Generate embeddings for agent logs and find similar execution patterns. Enable retrieval of similar successful/failed executions for analysis and learning.

## Success Criteria

- [ ] Embedding generation for logs
- [ ] Similarity search with pgvector
- [ ] Batch embedding processing
- [ ] Similarity threshold configuration
- [ ] Similar execution retrieval API
- [ ] Clustering for pattern discovery

---

## Tasks

<task id="13.1" type="auto" priority="critical">
  <name>Embedding Models & Client</name>
  <files>
    - src/meta_agent/embedding/models.py
    - src/meta_agent/embedding/client.py
    - src/meta_agent/embedding/__init__.py
  </files>
  <action>
    ```python
    # src/meta_agent/embedding/models.py
    from dataclasses import dataclass, field
    from datetime import datetime
    from typing import Optional, List
    import numpy as np

    @dataclass
    class EmbeddingConfig:
        model: str = "text-embedding-3-small"
        dimensions: int = 1536
        batch_size: int = 100
        similarity_threshold: float = 0.85

    @dataclass
    class LogEmbedding:
        id: str
        log_id: str
        agent_id: str
        embedding: List[float]
        text_hash: str  # To detect changes
        created_at: datetime = field(default_factory=datetime.utcnow)

    @dataclass
    class SimilarExecution:
        log_id: str
        agent_id: str
        similarity_score: float
        status: str
        input_summary: str
        output_summary: str
        timestamp: datetime
    ```

    ```python
    # src/meta_agent/embedding/client.py
    import httpx
    import hashlib
    from typing import List, Optional
    import logging
    from tenacity import retry, stop_after_attempt, wait_exponential

    logger = logging.getLogger(__name__)

    class EmbeddingClient:
        """Client for generating embeddings via OpenAI API."""

        def __init__(
            self,
            api_key: str,
            model: str = "text-embedding-3-small",
            dimensions: int = 1536,
        ):
            self.api_key = api_key
            self.model = model
            self.dimensions = dimensions
            self.base_url = "https://api.openai.com/v1"

        @retry(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=1, min=1, max=10),
        )
        async def embed_texts(
            self,
            texts: List[str],
        ) -> List[List[float]]:
            """Generate embeddings for multiple texts."""
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "input": texts,
                        "dimensions": self.dimensions,
                    },
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                # Sort by index to maintain order
                embeddings = sorted(data['data'], key=lambda x: x['index'])
                return [e['embedding'] for e in embeddings]

        async def embed_single(self, text: str) -> List[float]:
            """Generate embedding for single text."""
            result = await self.embed_texts([text])
            return result[0]

        def text_hash(self, text: str) -> str:
            """Generate hash for text to detect changes."""
            return hashlib.sha256(text.encode()).hexdigest()[:16]
    ```
  </action>
  <verify>
    - Models defined
    - Client works with OpenAI
    - Retry logic in place
  </verify>
  <done>Embedding models and client</done>
</task>

<task id="13.2" type="auto" priority="critical">
  <name>Log Text Extractor</name>
  <files>
    - src/meta_agent/embedding/extractor.py
  </files>
  <action>
    ```python
    # src/meta_agent/embedding/extractor.py
    from typing import Dict, Any, Optional
    import json
    import logging

    logger = logging.getLogger(__name__)

    class LogTextExtractor:
        """Extract embeddable text from execution logs."""

        def __init__(self, max_length: int = 8000):
            self.max_length = max_length

        def extract(self, log: Dict[str, Any]) -> str:
            """
            Extract text representation from execution log.
            Combines input, output, and context into embeddable text.
            """
            parts = []

            # Agent context
            if log.get('agent_name'):
                parts.append(f"Agent: {log['agent_name']}")

            if log.get('action_type'):
                parts.append(f"Action: {log['action_type']}")

            # Input
            input_text = self._extract_input(log.get('input', {}))
            if input_text:
                parts.append(f"Input: {input_text}")

            # Output (for successful executions)
            if log.get('status') == 'success' and log.get('output'):
                output_text = self._extract_output(log['output'])
                if output_text:
                    parts.append(f"Output: {output_text}")

            # Error (for failed executions)
            if log.get('status') == 'failed':
                if log.get('error_type'):
                    parts.append(f"Error Type: {log['error_type']}")
                if log.get('error_message'):
                    parts.append(f"Error: {log['error_message'][:500]}")

            # Tool calls
            if log.get('tool_calls'):
                tools = self._extract_tools(log['tool_calls'])
                if tools:
                    parts.append(f"Tools Used: {tools}")

            # Combine and truncate
            text = " | ".join(parts)
            return self._truncate(text)

        def _extract_input(self, input_data: Any) -> str:
            """Extract text from input data."""
            if isinstance(input_data, str):
                return input_data[:1000]

            if isinstance(input_data, dict):
                # Look for common input fields
                for key in ['query', 'prompt', 'message', 'text', 'content']:
                    if key in input_data:
                        return str(input_data[key])[:1000]

                # Fall back to JSON representation
                return json.dumps(input_data, default=str)[:1000]

            if isinstance(input_data, list):
                return json.dumps(input_data, default=str)[:1000]

            return str(input_data)[:1000]

        def _extract_output(self, output_data: Any) -> str:
            """Extract text from output data."""
            if isinstance(output_data, str):
                return output_data[:1000]

            if isinstance(output_data, dict):
                # Look for common output fields
                for key in ['result', 'response', 'content', 'text', 'message']:
                    if key in output_data:
                        return str(output_data[key])[:1000]

                return json.dumps(output_data, default=str)[:1000]

            return str(output_data)[:1000]

        def _extract_tools(self, tool_calls: list) -> str:
            """Extract tool names from tool calls."""
            if not tool_calls:
                return ""

            names = []
            for call in tool_calls[:10]:  # Limit to 10 tools
                if isinstance(call, dict):
                    name = call.get('name') or call.get('tool_name', 'unknown')
                    names.append(name)
                elif isinstance(call, str):
                    names.append(call)

            return ", ".join(names)

        def _truncate(self, text: str) -> str:
            """Truncate text to max length."""
            if len(text) <= self.max_length:
                return text

            return text[:self.max_length - 3] + "..."

        def create_search_text(
            self,
            query: Optional[str] = None,
            error_type: Optional[str] = None,
            action_type: Optional[str] = None,
            tool_name: Optional[str] = None,
        ) -> str:
            """Create search text from query parameters."""
            parts = []

            if query:
                parts.append(query)

            if error_type:
                parts.append(f"Error Type: {error_type}")

            if action_type:
                parts.append(f"Action: {action_type}")

            if tool_name:
                parts.append(f"Tool: {tool_name}")

            return " | ".join(parts) if parts else ""
    ```
  </action>
  <verify>
    - Extracts text from logs
    - Handles various input formats
    - Truncation works
  </verify>
  <done>Log text extractor</done>
</task>

<task id="13.3" type="auto" priority="critical">
  <name>Similarity Search Service</name>
  <files>
    - src/meta_agent/embedding/similarity.py
  </files>
  <action>
    ```python
    # src/meta_agent/embedding/similarity.py
    from datetime import datetime
    from typing import List, Optional, Dict, Any
    from uuid import uuid4
    import logging

    from .models import LogEmbedding, SimilarExecution, EmbeddingConfig
    from .client import EmbeddingClient
    from .extractor import LogTextExtractor
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class SimilarityService:
        """Find similar executions using vector similarity."""

        def __init__(
            self,
            database: Database,
            embedding_client: EmbeddingClient,
            config: Optional[EmbeddingConfig] = None,
        ):
            self.db = database
            self.embeddings = embedding_client
            self.extractor = LogTextExtractor()
            self.config = config or EmbeddingConfig()

        async def embed_log(
            self,
            log: Dict[str, Any],
        ) -> LogEmbedding:
            """Generate and store embedding for a log."""
            text = self.extractor.extract(log)
            text_hash = self.embeddings.text_hash(text)

            # Check if already embedded with same hash
            existing = await self.db.fetch_one("""
                SELECT id FROM log_embeddings
                WHERE log_id = $1 AND text_hash = $2
            """, log['id'], text_hash)

            if existing:
                logger.debug(f"Embedding already exists for log {log['id']}")
                row = await self.db.fetch_one(
                    "SELECT * FROM log_embeddings WHERE id = $1",
                    existing['id']
                )
                return LogEmbedding(**dict(row))

            # Generate embedding
            embedding = await self.embeddings.embed_single(text)

            # Store
            embedding_id = str(uuid4())
            await self.db.execute("""
                INSERT INTO log_embeddings (
                    id, log_id, agent_id, embedding, text_hash, created_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (log_id) DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    text_hash = EXCLUDED.text_hash,
                    created_at = NOW()
            """,
                embedding_id, log['id'], log['agent_id'],
                embedding, text_hash
            )

            return LogEmbedding(
                id=embedding_id,
                log_id=log['id'],
                agent_id=log['agent_id'],
                embedding=embedding,
                text_hash=text_hash,
            )

        async def find_similar(
            self,
            query_embedding: List[float],
            agent_id: Optional[str] = None,
            status_filter: Optional[str] = None,
            limit: int = 10,
            threshold: Optional[float] = None,
        ) -> List[SimilarExecution]:
            """Find similar executions using cosine similarity."""
            threshold = threshold or self.config.similarity_threshold

            # Build query with pgvector
            query = """
                SELECT
                    e.log_id,
                    l.agent_id,
                    1 - (e.embedding <=> $1::vector) as similarity_score,
                    l.status,
                    l.input as input_summary,
                    l.output as output_summary,
                    l.timestamp
                FROM log_embeddings e
                JOIN agent_execution_logs l ON l.id = e.log_id
                WHERE 1 - (e.embedding <=> $1::vector) >= $2
            """
            params = [query_embedding, threshold]

            if agent_id:
                params.append(agent_id)
                query += f" AND l.agent_id = ${len(params)}"

            if status_filter:
                params.append(status_filter)
                query += f" AND l.status = ${len(params)}"

            query += f" ORDER BY similarity_score DESC LIMIT ${len(params) + 1}"
            params.append(limit)

            rows = await self.db.fetch_all(query, *params)

            return [
                SimilarExecution(
                    log_id=row['log_id'],
                    agent_id=row['agent_id'],
                    similarity_score=row['similarity_score'],
                    status=row['status'],
                    input_summary=self._summarize(row['input_summary']),
                    output_summary=self._summarize(row['output_summary']),
                    timestamp=row['timestamp'],
                )
                for row in rows
            ]

        async def find_similar_to_log(
            self,
            log_id: str,
            **kwargs,
        ) -> List[SimilarExecution]:
            """Find executions similar to a specific log."""
            # Get embedding for the log
            row = await self.db.fetch_one(
                "SELECT embedding FROM log_embeddings WHERE log_id = $1",
                log_id
            )

            if not row:
                # Generate embedding if not exists
                log = await self.db.fetch_one(
                    "SELECT * FROM agent_execution_logs WHERE id = $1",
                    log_id
                )
                if not log:
                    raise ValueError(f"Log {log_id} not found")

                embedding = await self.embed_log(dict(log))
                query_embedding = embedding.embedding
            else:
                query_embedding = row['embedding']

            # Exclude the log itself from results
            results = await self.find_similar(query_embedding, **kwargs)
            return [r for r in results if r.log_id != log_id]

        async def find_similar_by_text(
            self,
            query_text: str,
            **kwargs,
        ) -> List[SimilarExecution]:
            """Find similar executions by text query."""
            embedding = await self.embeddings.embed_single(query_text)
            return await self.find_similar(embedding, **kwargs)

        async def find_similar_errors(
            self,
            error_type: str,
            agent_id: Optional[str] = None,
            limit: int = 10,
        ) -> List[SimilarExecution]:
            """Find similar error patterns."""
            search_text = self.extractor.create_search_text(
                error_type=error_type
            )
            return await self.find_similar_by_text(
                search_text,
                agent_id=agent_id,
                status_filter='failed',
                limit=limit,
            )

        async def find_successful_similar(
            self,
            failed_log_id: str,
            limit: int = 5,
        ) -> List[SimilarExecution]:
            """
            Find successful executions similar to a failed one.
            Useful for understanding what should have happened.
            """
            return await self.find_similar_to_log(
                failed_log_id,
                status_filter='success',
                limit=limit,
                threshold=0.7,  # Lower threshold for cross-status search
            )

        def _summarize(self, data: Any, max_length: int = 200) -> str:
            """Create short summary of data."""
            if data is None:
                return ""

            if isinstance(data, str):
                return data[:max_length]

            if isinstance(data, dict):
                # Get most relevant field
                for key in ['content', 'message', 'text', 'result']:
                    if key in data:
                        return str(data[key])[:max_length]

            return str(data)[:max_length]
    ```
  </action>
  <verify>
    - pgvector queries work
    - Similarity threshold filters
    - Cross-status search works
  </verify>
  <done>Similarity search service with pgvector</done>
</task>

<task id="13.4" type="auto" priority="high">
  <name>Batch Embedding Processor</name>
  <files>
    - src/meta_agent/embedding/batch.py
  </files>
  <action>
    ```python
    # src/meta_agent/embedding/batch.py
    from datetime import datetime, timedelta
    from typing import List, Optional
    import logging
    import asyncio

    from .models import EmbeddingConfig
    from .client import EmbeddingClient
    from .extractor import LogTextExtractor
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class BatchEmbeddingProcessor:
        """Process embeddings in batches for efficiency."""

        def __init__(
            self,
            database: Database,
            embedding_client: EmbeddingClient,
            config: Optional[EmbeddingConfig] = None,
        ):
            self.db = database
            self.embeddings = embedding_client
            self.extractor = LogTextExtractor()
            self.config = config or EmbeddingConfig()

        async def process_pending(
            self,
            max_logs: int = 1000,
        ) -> int:
            """Process logs that don't have embeddings yet."""
            # Find logs without embeddings
            rows = await self.db.fetch_all("""
                SELECT l.*
                FROM agent_execution_logs l
                LEFT JOIN log_embeddings e ON e.log_id = l.id
                WHERE e.id IS NULL
                ORDER BY l.timestamp DESC
                LIMIT $1
            """, max_logs)

            if not rows:
                logger.info("No pending logs to embed")
                return 0

            logger.info(f"Processing {len(rows)} logs for embedding")

            # Process in batches
            processed = 0
            batch_size = self.config.batch_size

            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                await self._process_batch(batch)
                processed += len(batch)
                logger.info(f"Processed {processed}/{len(rows)} logs")

            return processed

        async def _process_batch(self, logs: List[dict]) -> None:
            """Process a batch of logs."""
            # Extract texts
            texts = []
            valid_logs = []

            for log in logs:
                text = self.extractor.extract(dict(log))
                if text and len(text) > 10:  # Skip very short texts
                    texts.append(text)
                    valid_logs.append(log)

            if not texts:
                return

            # Generate embeddings
            embeddings = await self.embeddings.embed_texts(texts)

            # Store embeddings
            for log, embedding, text in zip(valid_logs, embeddings, texts):
                text_hash = self.embeddings.text_hash(text)
                await self.db.execute("""
                    INSERT INTO log_embeddings (
                        id, log_id, agent_id, embedding, text_hash, created_at
                    ) VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
                    ON CONFLICT (log_id) DO UPDATE SET
                        embedding = EXCLUDED.embedding,
                        text_hash = EXCLUDED.text_hash
                """, log['id'], log['agent_id'], embedding, text_hash)

        async def reprocess_agent(
            self,
            agent_id: str,
            since: Optional[datetime] = None,
        ) -> int:
            """Reprocess embeddings for an agent."""
            since = since or datetime.utcnow() - timedelta(days=30)

            # Delete existing embeddings
            await self.db.execute("""
                DELETE FROM log_embeddings
                WHERE agent_id = $1
                  AND created_at >= $2
            """, agent_id, since)

            # Find logs to reprocess
            rows = await self.db.fetch_all("""
                SELECT * FROM agent_execution_logs
                WHERE agent_id = $1 AND timestamp >= $2
                ORDER BY timestamp DESC
            """, agent_id, since)

            if not rows:
                return 0

            # Process in batches
            processed = 0
            for i in range(0, len(rows), self.config.batch_size):
                batch = rows[i:i + self.config.batch_size]
                await self._process_batch(batch)
                processed += len(batch)

            logger.info(f"Reprocessed {processed} embeddings for agent {agent_id}")
            return processed

        async def cleanup_orphaned(self) -> int:
            """Remove embeddings for deleted logs."""
            result = await self.db.execute("""
                DELETE FROM log_embeddings e
                WHERE NOT EXISTS (
                    SELECT 1 FROM agent_execution_logs l
                    WHERE l.id = e.log_id
                )
            """)
            count = result  # Assuming execute returns affected rows
            if count:
                logger.info(f"Cleaned up {count} orphaned embeddings")
            return count or 0
    ```
  </action>
  <verify>
    - Batch processing works
    - Rate limiting respected
    - Reprocessing works
  </verify>
  <done>Batch embedding processor</done>
</task>

<task id="13.5" type="auto" priority="medium">
  <name>Embedding API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/embedding.py
  </files>
  <action>
    ```python
    # src/meta_agent/api/routes/embedding.py
    from fastapi import APIRouter, Depends, HTTPException
    from typing import List, Optional
    from pydantic import BaseModel

    router = APIRouter(prefix="/api/v1/similarity", tags=["similarity"])

    class SimilarExecutionResponse(BaseModel):
        log_id: str
        agent_id: str
        similarity_score: float
        status: str
        input_summary: str
        output_summary: str
        timestamp: str

    class TextSearchRequest(BaseModel):
        query: str
        agent_id: Optional[str] = None
        status: Optional[str] = None
        limit: int = 10
        threshold: float = 0.85

    @router.post("/search", response_model=List[SimilarExecutionResponse])
    async def search_similar(
        request: TextSearchRequest,
        similarity_service = Depends(get_similarity_service),
    ):
        """Search for similar executions by text query."""
        results = await similarity_service.find_similar_by_text(
            request.query,
            agent_id=request.agent_id,
            status_filter=request.status,
            limit=request.limit,
            threshold=request.threshold,
        )
        return [
            {
                **r.__dict__,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in results
        ]

    @router.get("/log/{log_id}", response_model=List[SimilarExecutionResponse])
    async def find_similar_to_log(
        log_id: str,
        status: Optional[str] = None,
        limit: int = 10,
        similarity_service = Depends(get_similarity_service),
    ):
        """Find executions similar to a specific log."""
        results = await similarity_service.find_similar_to_log(
            log_id,
            status_filter=status,
            limit=limit,
        )
        return [
            {
                **r.__dict__,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in results
        ]

    @router.get("/errors/{error_type}", response_model=List[SimilarExecutionResponse])
    async def find_similar_errors(
        error_type: str,
        agent_id: Optional[str] = None,
        limit: int = 10,
        similarity_service = Depends(get_similarity_service),
    ):
        """Find similar error patterns."""
        results = await similarity_service.find_similar_errors(
            error_type,
            agent_id=agent_id,
            limit=limit,
        )
        return [
            {
                **r.__dict__,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in results
        ]

    @router.get("/successful-match/{failed_log_id}", response_model=List[SimilarExecutionResponse])
    async def find_successful_match(
        failed_log_id: str,
        limit: int = 5,
        similarity_service = Depends(get_similarity_service),
    ):
        """Find successful executions similar to a failed one."""
        results = await similarity_service.find_successful_similar(
            failed_log_id,
            limit=limit,
        )
        return [
            {
                **r.__dict__,
                "timestamp": r.timestamp.isoformat(),
            }
            for r in results
        ]

    @router.post("/embed/batch")
    async def trigger_batch_embedding(
        max_logs: int = 1000,
        batch_processor = Depends(get_batch_processor),
    ):
        """Trigger batch embedding processing."""
        count = await batch_processor.process_pending(max_logs)
        return {"processed": count}

    @router.post("/embed/agent/{agent_id}")
    async def reprocess_agent_embeddings(
        agent_id: str,
        days: int = 30,
        batch_processor = Depends(get_batch_processor),
    ):
        """Reprocess embeddings for an agent."""
        from datetime import datetime, timedelta
        since = datetime.utcnow() - timedelta(days=days)
        count = await batch_processor.reprocess_agent(agent_id, since)
        return {"reprocessed": count}
    ```
  </action>
  <verify>
    - Search endpoints work
    - Batch processing triggers
    - Error pattern search works
  </verify>
  <done>Embedding API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] Embeddings generated for logs
- [ ] pgvector similarity search working
- [ ] Batch processing implemented
- [ ] Similar error detection
- [ ] Success pattern matching for failures
- [ ] API endpoints functional

## Files Created

- `src/meta_agent/embedding/__init__.py`
- `src/meta_agent/embedding/models.py`
- `src/meta_agent/embedding/client.py`
- `src/meta_agent/embedding/extractor.py`
- `src/meta_agent/embedding/similarity.py`
- `src/meta_agent/embedding/batch.py`
- `src/meta_agent/api/routes/embedding.py`
