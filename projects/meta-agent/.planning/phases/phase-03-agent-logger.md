# Phase 3: Agent Logger SDK

**Duration**: 4 days | **Complexity**: Medium | **Dependencies**: Phase 2

## Phase Overview

Build the universal logging utility that all AI agents will use to report their actions to MetaAgent. This is the SDK that gets distributed to all agent implementations.

## Success Criteria

- [ ] AgentLogger class with context manager support
- [ ] Automatic execution ID generation
- [ ] Action logging methods (tool_call, llm_inference, decision, error)
- [ ] Batch logging for performance
- [ ] Async and sync interfaces
- [ ] LangGraph integration hooks
- [ ] Error capturing and sanitization
- [ ] PyPI-ready package structure
- [ ] Usage documentation
- [ ] Performance: Can log 1000 actions/second with <5ms overhead

---

## Tasks

<task id="3.1" type="auto" priority="critical">
  <name>Create AgentLogger Core Class</name>
  <files>
    - src/meta_agent/sdk/logger.py
    - src/meta_agent/sdk/__init__.py
  </files>
  <context>
    The AgentLogger is the primary interface for agents to report their activities.
    Must support both context manager and direct usage patterns.
  </context>
  <action>
    Create AgentLogger class with:

    ```python
    import uuid
    import asyncio
    from datetime import datetime
    from typing import Optional, Dict, Any, List
    from contextlib import asynccontextmanager, contextmanager
    from dataclasses import dataclass, field

    @dataclass
    class LogEntry:
        execution_id: str
        agent_id: str
        action_type: str
        action_name: str
        input_data: Optional[Dict[str, Any]] = None
        output_data: Optional[Dict[str, Any]] = None
        status: str = "success"
        error_message: Optional[str] = None
        latency_ms: Optional[int] = None
        token_count: Optional[int] = None
        cost_usd: Optional[float] = None
        metadata: Dict[str, Any] = field(default_factory=dict)
        timestamp: datetime = field(default_factory=datetime.utcnow)

    class AgentLogger:
        def __init__(
            self,
            agent_id: str,
            organization_id: str,
            execution_id: Optional[str] = None,
            batch_size: int = 50,
            flush_interval_seconds: float = 5.0,
            api_endpoint: Optional[str] = None,
        ):
            self.agent_id = agent_id
            self.organization_id = organization_id
            self.execution_id = execution_id or str(uuid.uuid4())
            self.batch_size = batch_size
            self.flush_interval = flush_interval_seconds
            self.api_endpoint = api_endpoint or "http://localhost:8000/api/v1/logs"

            self._buffer: List[LogEntry] = []
            self._lock = asyncio.Lock()
            self._flush_task: Optional[asyncio.Task] = None
            self._started_at: Optional[datetime] = None
            self._action_count = 0

        async def __aenter__(self) -> "AgentLogger":
            self._started_at = datetime.utcnow()
            await self._log_execution_start()
            self._flush_task = asyncio.create_task(self._periodic_flush())
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            if self._flush_task:
                self._flush_task.cancel()
            await self._log_execution_end(
                status="failed" if exc_type else "success",
                error=str(exc_val) if exc_val else None
            )
            await self.flush()

        def __enter__(self) -> "AgentLogger":
            self._started_at = datetime.utcnow()
            self._log_execution_start_sync()
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            self._log_execution_end_sync(
                status="failed" if exc_type else "success",
                error=str(exc_val) if exc_val else None
            )
            self._flush_sync()
    ```
  </action>
  <verify>
    - Class instantiates correctly
    - Context manager works in both sync and async
    - Execution ID generated if not provided
  </verify>
  <done>AgentLogger core class with context manager support</done>
</task>

<task id="3.2" type="auto" priority="critical">
  <name>Implement Action Logging Methods</name>
  <files>
    - src/meta_agent/sdk/logger.py
  </files>
  <context>
    Agents need specific methods for different action types:
    - tool_call: External tool/API invocations
    - llm_inference: LLM API calls
    - decision: Agent decisions/routing
    - error: Error occurrences
    - custom: Any other action type
  </context>
  <action>
    Add action logging methods to AgentLogger:

    ```python
    async def log_tool_call(
        self,
        tool_name: str,
        input_data: Dict[str, Any],
        output_data: Optional[Dict[str, Any]] = None,
        status: str = "success",
        error: Optional[str] = None,
        latency_ms: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        entry = LogEntry(
            execution_id=self.execution_id,
            agent_id=self.agent_id,
            action_type="tool_call",
            action_name=tool_name,
            input_data=self._sanitize(input_data),
            output_data=self._sanitize(output_data) if output_data else None,
            status=status,
            error_message=error,
            latency_ms=latency_ms,
            metadata=metadata or {},
        )
        await self._add_to_buffer(entry)

    async def log_llm_inference(
        self,
        model: str,
        prompt: str,
        response: Optional[str] = None,
        status: str = "success",
        error: Optional[str] = None,
        latency_ms: Optional[int] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        cost_usd: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        entry = LogEntry(
            execution_id=self.execution_id,
            agent_id=self.agent_id,
            action_type="llm_inference",
            action_name=model,
            input_data={"prompt": self._truncate(prompt, 1000)},
            output_data={"response": self._truncate(response, 1000)} if response else None,
            status=status,
            error_message=error,
            latency_ms=latency_ms,
            token_count=(input_tokens or 0) + (output_tokens or 0),
            cost_usd=cost_usd,
            metadata={
                **(metadata or {}),
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            },
        )
        await self._add_to_buffer(entry)

    async def log_decision(
        self,
        decision_type: str,
        options: List[str],
        chosen: str,
        reasoning: Optional[str] = None,
        confidence: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        entry = LogEntry(
            execution_id=self.execution_id,
            agent_id=self.agent_id,
            action_type="decision",
            action_name=decision_type,
            input_data={"options": options},
            output_data={"chosen": chosen, "reasoning": reasoning},
            metadata={
                **(metadata or {}),
                "confidence": confidence,
            },
        )
        await self._add_to_buffer(entry)

    async def log_error(
        self,
        error_type: str,
        error_message: str,
        stack_trace: Optional[str] = None,
        recoverable: bool = True,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        entry = LogEntry(
            execution_id=self.execution_id,
            agent_id=self.agent_id,
            action_type="error",
            action_name=error_type,
            status="error",
            error_message=error_message,
            metadata={
                **(metadata or {}),
                "stack_trace": self._sanitize_stack_trace(stack_trace),
                "recoverable": recoverable,
            },
        )
        await self._add_to_buffer(entry)

    async def log_custom(
        self,
        action_type: str,
        action_name: str,
        input_data: Optional[Dict[str, Any]] = None,
        output_data: Optional[Dict[str, Any]] = None,
        status: str = "success",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        entry = LogEntry(
            execution_id=self.execution_id,
            agent_id=self.agent_id,
            action_type=action_type,
            action_name=action_name,
            input_data=self._sanitize(input_data) if input_data else None,
            output_data=self._sanitize(output_data) if output_data else None,
            status=status,
            metadata=metadata or {},
        )
        await self._add_to_buffer(entry)
    ```
  </action>
  <verify>
    - All logging methods work correctly
    - Data is properly sanitized
    - Entries added to buffer
  </verify>
  <done>All action logging methods implemented</done>
</task>

<task id="3.3" type="auto" priority="critical">
  <name>Implement Batch Logging and Flush</name>
  <files>
    - src/meta_agent/sdk/logger.py
  </files>
  <context>
    For performance, logs are buffered and sent in batches.
    Automatic flushing on buffer full or periodic interval.
  </context>
  <action>
    Implement batching and flush logic:

    ```python
    import httpx
    from typing import List

    async def _add_to_buffer(self, entry: LogEntry) -> None:
        async with self._lock:
            self._buffer.append(entry)
            self._action_count += 1

            if len(self._buffer) >= self.batch_size:
                await self._flush_buffer()

    async def _flush_buffer(self) -> None:
        if not self._buffer:
            return

        entries_to_send = self._buffer.copy()
        self._buffer.clear()

        try:
            await self._send_logs(entries_to_send)
        except Exception as e:
            # On failure, add back to buffer for retry
            self._buffer = entries_to_send + self._buffer
            # Limit buffer size to prevent memory issues
            if len(self._buffer) > self.batch_size * 10:
                self._buffer = self._buffer[-self.batch_size * 5:]

    async def _send_logs(self, entries: List[LogEntry]) -> None:
        payload = {
            "organization_id": self.organization_id,
            "logs": [
                {
                    "execution_id": e.execution_id,
                    "agent_id": e.agent_id,
                    "action_type": e.action_type,
                    "action_name": e.action_name,
                    "input_summary": e.input_data,
                    "output_summary": e.output_data,
                    "status": e.status,
                    "error_message": e.error_message,
                    "latency_ms": e.latency_ms,
                    "token_count": e.token_count,
                    "cost_usd": str(e.cost_usd) if e.cost_usd else None,
                    "metadata": e.metadata,
                    "timestamp": e.timestamp.isoformat(),
                }
                for e in entries
            ]
        }

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.api_endpoint}/batch",
                json=payload,
                timeout=10.0,
            )
            response.raise_for_status()

    async def _periodic_flush(self) -> None:
        while True:
            await asyncio.sleep(self.flush_interval)
            async with self._lock:
                await self._flush_buffer()

    async def flush(self) -> None:
        """Manually flush all buffered logs."""
        async with self._lock:
            await self._flush_buffer()

    def _flush_sync(self) -> None:
        """Synchronous flush for sync context manager."""
        asyncio.get_event_loop().run_until_complete(self.flush())
    ```
  </action>
  <verify>
    - Batch size triggers flush
    - Periodic flush works
    - Failed sends retry properly
    - Memory bounded on failures
  </verify>
  <done>Batch logging with auto-flush implemented</done>
</task>

<task id="3.4" type="auto" priority="high">
  <name>Implement Data Sanitization</name>
  <files>
    - src/meta_agent/sdk/sanitizer.py
    - src/meta_agent/sdk/logger.py
  </files>
  <context>
    Logs must not contain sensitive data:
    - PII (emails, phone numbers, SSNs)
    - Secrets (API keys, passwords, tokens)
    - Large binary data
  </context>
  <action>
    Create sanitization module:

    ```python
    # src/meta_agent/sdk/sanitizer.py
    import re
    from typing import Any, Dict, List, Set

    # Patterns for sensitive data
    SENSITIVE_PATTERNS = {
        "email": re.compile(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'),
        "phone": re.compile(r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'),
        "ssn": re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
        "api_key": re.compile(r'(sk-|pk-|api[_-]?key)[a-zA-Z0-9]{20,}', re.I),
        "jwt": re.compile(r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+'),
        "password": re.compile(r'(password|passwd|pwd|secret)["\s:=]+[^\s,}]{3,}', re.I),
    }

    SENSITIVE_KEYS = {
        'password', 'passwd', 'pwd', 'secret', 'token', 'api_key', 'apikey',
        'authorization', 'auth', 'credentials', 'private_key', 'private',
        'ssn', 'social_security', 'credit_card', 'card_number', 'cvv', 'cvc',
    }

    def sanitize_string(value: str, max_length: int = 10000) -> str:
        """Sanitize a string value."""
        # Truncate
        if len(value) > max_length:
            value = value[:max_length] + f"... [truncated, total {len(value)} chars]"

        # Replace sensitive patterns
        for name, pattern in SENSITIVE_PATTERNS.items():
            value = pattern.sub(f"[REDACTED_{name.upper()}]", value)

        return value

    def sanitize_dict(data: Dict[str, Any], depth: int = 0, max_depth: int = 10) -> Dict[str, Any]:
        """Recursively sanitize a dictionary."""
        if depth > max_depth:
            return {"_error": "max depth exceeded"}

        result = {}
        for key, value in data.items():
            # Check if key is sensitive
            if key.lower() in SENSITIVE_KEYS:
                result[key] = "[REDACTED]"
            elif isinstance(value, str):
                result[key] = sanitize_string(value)
            elif isinstance(value, dict):
                result[key] = sanitize_dict(value, depth + 1, max_depth)
            elif isinstance(value, list):
                result[key] = sanitize_list(value, depth + 1, max_depth)
            elif isinstance(value, bytes):
                result[key] = f"[BINARY, {len(value)} bytes]"
            else:
                result[key] = value

        return result

    def sanitize_list(data: List[Any], depth: int = 0, max_depth: int = 10) -> List[Any]:
        """Recursively sanitize a list."""
        if depth > max_depth:
            return ["[max depth exceeded]"]

        result = []
        for item in data[:100]:  # Limit list size
            if isinstance(item, str):
                result.append(sanitize_string(item))
            elif isinstance(item, dict):
                result.append(sanitize_dict(item, depth + 1, max_depth))
            elif isinstance(item, list):
                result.append(sanitize_list(item, depth + 1, max_depth))
            else:
                result.append(item)

        if len(data) > 100:
            result.append(f"[{len(data) - 100} more items truncated]")

        return result

    def sanitize_stack_trace(trace: str) -> str:
        """Sanitize a stack trace."""
        if not trace:
            return None

        # Remove file paths that might contain usernames
        trace = re.sub(r'/Users/[^/]+/', '/Users/[USER]/', trace)
        trace = re.sub(r'/home/[^/]+/', '/home/[USER]/', trace)
        trace = re.sub(r'C:\\Users\\[^\\]+\\', 'C:\\Users\\[USER]\\', trace)

        return sanitize_string(trace, max_length=5000)
    ```

    Update logger.py to use sanitizer:

    ```python
    from .sanitizer import sanitize_dict, sanitize_string, sanitize_stack_trace

    def _sanitize(self, data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if data is None:
            return None
        return sanitize_dict(data)

    def _truncate(self, text: Optional[str], max_length: int) -> Optional[str]:
        if text is None:
            return None
        return sanitize_string(text, max_length)

    def _sanitize_stack_trace(self, trace: Optional[str]) -> Optional[str]:
        return sanitize_stack_trace(trace) if trace else None
    ```
  </action>
  <verify>
    - Emails redacted
    - API keys redacted
    - Passwords redacted
    - Large data truncated
    - Nested structures handled
  </verify>
  <done>Comprehensive data sanitization implemented</done>
</task>

<task id="3.5" type="auto" priority="high">
  <name>Implement LangGraph Integration Hooks</name>
  <files>
    - src/meta_agent/sdk/langgraph.py
  </files>
  <context>
    LangGraph is the primary agent framework. Need hooks that automatically
    log all node executions, tool calls, and state transitions.
  </context>
  <action>
    Create LangGraph integration:

    ```python
    # src/meta_agent/sdk/langgraph.py
    import time
    from functools import wraps
    from typing import Any, Callable, Dict, Optional, TypeVar
    from langgraph.graph import StateGraph
    from langgraph.checkpoint.base import BaseCheckpointSaver

    from .logger import AgentLogger

    T = TypeVar('T')

    def with_logging(logger: AgentLogger):
        """Decorator factory for logging LangGraph node executions."""
        def decorator(func: Callable[..., T]) -> Callable[..., T]:
            @wraps(func)
            async def async_wrapper(*args, **kwargs) -> T:
                start_time = time.time()
                node_name = func.__name__

                try:
                    result = await func(*args, **kwargs)
                    latency_ms = int((time.time() - start_time) * 1000)

                    await logger.log_custom(
                        action_type="node_execution",
                        action_name=node_name,
                        input_data=_extract_state_summary(args, kwargs),
                        output_data=_extract_result_summary(result),
                        status="success",
                        metadata={"latency_ms": latency_ms},
                    )
                    return result
                except Exception as e:
                    latency_ms = int((time.time() - start_time) * 1000)
                    await logger.log_error(
                        error_type="node_execution_error",
                        error_message=str(e),
                        metadata={
                            "node_name": node_name,
                            "latency_ms": latency_ms,
                        },
                    )
                    raise

            @wraps(func)
            def sync_wrapper(*args, **kwargs) -> T:
                start_time = time.time()
                node_name = func.__name__

                try:
                    result = func(*args, **kwargs)
                    latency_ms = int((time.time() - start_time) * 1000)

                    # Queue for async logging
                    logger._sync_log_custom(
                        action_type="node_execution",
                        action_name=node_name,
                        input_data=_extract_state_summary(args, kwargs),
                        output_data=_extract_result_summary(result),
                        status="success",
                        metadata={"latency_ms": latency_ms},
                    )
                    return result
                except Exception as e:
                    logger._sync_log_error(
                        error_type="node_execution_error",
                        error_message=str(e),
                    )
                    raise

            import asyncio
            if asyncio.iscoroutinefunction(func):
                return async_wrapper
            return sync_wrapper

        return decorator

    def _extract_state_summary(args: tuple, kwargs: dict) -> Dict[str, Any]:
        """Extract relevant state info for logging."""
        summary = {}

        # Handle state object (usually first argument)
        if args and hasattr(args[0], '__dict__'):
            state = args[0]
            summary['state_keys'] = list(state.__dict__.keys())[:10]
            if hasattr(state, 'messages'):
                summary['message_count'] = len(state.messages)

        return summary

    def _extract_result_summary(result: Any) -> Dict[str, Any]:
        """Extract result summary for logging."""
        if result is None:
            return {"result": None}

        if isinstance(result, dict):
            return {
                "keys_returned": list(result.keys())[:10],
                "has_messages": "messages" in result,
            }

        return {"result_type": type(result).__name__}

    class LoggingCheckpointer(BaseCheckpointSaver):
        """Checkpointer wrapper that logs state transitions."""

        def __init__(self, inner: BaseCheckpointSaver, logger: AgentLogger):
            self.inner = inner
            self.logger = logger

        async def aget(self, config: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            result = await self.inner.aget(config)
            await self.logger.log_custom(
                action_type="checkpoint",
                action_name="load",
                metadata={"thread_id": config.get("thread_id")},
            )
            return result

        async def aput(self, config: Dict[str, Any], checkpoint: Dict[str, Any]) -> None:
            await self.inner.aput(config, checkpoint)
            await self.logger.log_custom(
                action_type="checkpoint",
                action_name="save",
                metadata={"thread_id": config.get("thread_id")},
            )

    def instrument_graph(graph: StateGraph, logger: AgentLogger) -> StateGraph:
        """Instrument a StateGraph with logging on all nodes."""
        # This is a helper that wraps all node functions with logging
        # Implementation depends on LangGraph internals
        return graph
    ```
  </action>
  <verify>
    - Decorator logs node executions
    - State transitions captured
    - Works with async and sync nodes
    - Minimal overhead (<5ms)
  </verify>
  <done>LangGraph integration hooks implemented</done>
</task>

<task id="3.6" type="auto" priority="medium">
  <name>Create PyPI Package Structure</name>
  <files>
    - src/meta_agent/sdk/pyproject.toml
    - src/meta_agent/sdk/README.md
    - src/meta_agent/sdk/__init__.py
  </files>
  <context>
    Package should be installable via pip for easy distribution
    to all agent projects.
  </context>
  <action>
    Create package structure:

    ```toml
    # pyproject.toml
    [build-system]
    requires = ["hatchling"]
    build-backend = "hatchling.build"

    [project]
    name = "metaagent-logger"
    version = "0.1.0"
    description = "Universal logging SDK for MetaAgent AI governance system"
    readme = "README.md"
    requires-python = ">=3.9"
    license = "MIT"
    authors = [
        { name = "Agency AI System", email = "dev@agency.ai" }
    ]
    classifiers = [
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ]
    dependencies = [
        "httpx>=0.24.0",
        "pydantic>=2.0.0",
    ]

    [project.optional-dependencies]
    langgraph = ["langgraph>=0.1.0"]
    dev = [
        "pytest>=7.0.0",
        "pytest-asyncio>=0.21.0",
        "pytest-cov>=4.0.0",
    ]

    [project.urls]
    Homepage = "https://github.com/agency-ai/metaagent"
    Documentation = "https://docs.agency.ai/metaagent"
    Repository = "https://github.com/agency-ai/metaagent"

    [tool.hatch.build.targets.wheel]
    packages = ["src/meta_agent/sdk"]
    ```

    Create __init__.py with public API:

    ```python
    # src/meta_agent/sdk/__init__.py
    from .logger import AgentLogger, LogEntry
    from .sanitizer import sanitize_dict, sanitize_string

    __all__ = [
        "AgentLogger",
        "LogEntry",
        "sanitize_dict",
        "sanitize_string",
    ]

    __version__ = "0.1.0"
    ```

    Create README with usage examples.
  </action>
  <verify>
    - Package builds with `pip install -e .`
    - Imports work: `from metaagent_logger import AgentLogger`
    - README contains usage examples
  </verify>
  <done>PyPI-ready package structure created</done>
</task>

<task id="3.7" type="auto" priority="medium">
  <name>Write Unit Tests for Logger</name>
  <files>
    - tests/sdk/test_logger.py
    - tests/sdk/test_sanitizer.py
  </files>
  <context>
    Comprehensive tests for the AgentLogger SDK.
  </context>
  <action>
    Create test files:

    ```python
    # tests/sdk/test_logger.py
    import pytest
    from unittest.mock import AsyncMock, patch
    from meta_agent.sdk import AgentLogger

    @pytest.fixture
    def logger():
        return AgentLogger(
            agent_id="test-agent",
            organization_id="test-org",
            batch_size=10,
        )

    @pytest.mark.asyncio
    async def test_context_manager():
        async with AgentLogger(
            agent_id="test-agent",
            organization_id="test-org"
        ) as logger:
            assert logger.execution_id is not None
            assert logger._started_at is not None

    @pytest.mark.asyncio
    async def test_log_tool_call(logger):
        await logger.log_tool_call(
            tool_name="search",
            input_data={"query": "test"},
            output_data={"results": []},
        )

        assert len(logger._buffer) == 1
        assert logger._buffer[0].action_type == "tool_call"
        assert logger._buffer[0].action_name == "search"

    @pytest.mark.asyncio
    async def test_log_llm_inference(logger):
        await logger.log_llm_inference(
            model="claude-3-opus",
            prompt="Hello",
            response="Hi there!",
            input_tokens=10,
            output_tokens=5,
            cost_usd=0.001,
        )

        assert len(logger._buffer) == 1
        assert logger._buffer[0].action_type == "llm_inference"
        assert logger._buffer[0].token_count == 15

    @pytest.mark.asyncio
    async def test_batch_flush(logger):
        with patch.object(logger, '_send_logs', new_callable=AsyncMock) as mock_send:
            # Fill buffer to trigger flush
            for i in range(15):
                await logger.log_custom(
                    action_type="test",
                    action_name=f"action_{i}",
                )

            # Should have flushed once (batch_size=10)
            assert mock_send.called

    @pytest.mark.asyncio
    async def test_error_logging(logger):
        await logger.log_error(
            error_type="ValidationError",
            error_message="Invalid input",
            recoverable=True,
        )

        assert logger._buffer[0].status == "error"
    ```

    ```python
    # tests/sdk/test_sanitizer.py
    import pytest
    from meta_agent.sdk.sanitizer import sanitize_dict, sanitize_string

    def test_sanitize_email():
        result = sanitize_string("Contact: john@example.com")
        assert "[REDACTED_EMAIL]" in result
        assert "john@example.com" not in result

    def test_sanitize_api_key():
        result = sanitize_string("key: sk-1234567890abcdefghijklmn")
        assert "[REDACTED_API_KEY]" in result

    def test_sanitize_password_in_dict():
        data = {"username": "john", "password": "secret123"}
        result = sanitize_dict(data)
        assert result["password"] == "[REDACTED]"
        assert result["username"] == "john"

    def test_truncate_long_string():
        long_string = "x" * 20000
        result = sanitize_string(long_string, max_length=1000)
        assert len(result) < 2000
        assert "truncated" in result

    def test_nested_dict_sanitization():
        data = {
            "user": {
                "email": "test@test.com",
                "settings": {
                    "api_key": "sk-secret123456789012345"
                }
            }
        }
        result = sanitize_dict(data)
        assert "[REDACTED_EMAIL]" in str(result)
        assert result["user"]["settings"]["api_key"] == "[REDACTED]"
    ```
  </action>
  <verify>
    - All tests pass: pytest tests/sdk/ -v
    - Coverage > 80%
  </verify>
  <done>Comprehensive unit tests for SDK</done>
</task>

---

## Phase Exit Criteria

- [ ] AgentLogger class fully implemented
- [ ] All action types supported
- [ ] Batch logging working
- [ ] Data sanitization comprehensive
- [ ] LangGraph hooks functional
- [ ] Package installable via pip
- [ ] Tests passing with >80% coverage
- [ ] Performance verified (<5ms overhead)

## Files Created

- `src/meta_agent/sdk/__init__.py`
- `src/meta_agent/sdk/logger.py`
- `src/meta_agent/sdk/sanitizer.py`
- `src/meta_agent/sdk/langgraph.py`
- `src/meta_agent/sdk/pyproject.toml`
- `src/meta_agent/sdk/README.md`
- `tests/sdk/test_logger.py`
- `tests/sdk/test_sanitizer.py`
