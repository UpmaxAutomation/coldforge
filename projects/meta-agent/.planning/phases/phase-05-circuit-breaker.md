# Phase 5: Circuit Breaker System

**Duration**: 3 days | **Complexity**: High | **Dependencies**: Phase 4

## Phase Overview

Implement the circuit breaker pattern to protect agents from cascading failures. When an agent fails repeatedly, the circuit opens to prevent further damage.

## Success Criteria

- [ ] Circuit breaker state machine (CLOSED/OPEN/HALF_OPEN)
- [ ] Configurable failure thresholds
- [ ] Cooldown period management
- [ ] Half-open testing logic
- [ ] Integration with AgentLogger
- [ ] Circuit state persistence
- [ ] Manual override capability
- [ ] Circuit opens within 10 seconds of threshold breach
- [ ] Automatic recovery when agent stabilizes

---

## Tasks

<task id="5.1" type="auto" priority="critical">
  <name>Circuit Breaker State Machine</name>
  <files>
    - src/meta_agent/circuit/breaker.py
    - src/meta_agent/circuit/__init__.py
  </files>
  <context>
    Circuit breaker has three states:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Failing, requests blocked
    - HALF_OPEN: Testing if recovery is possible
  </context>
  <action>
    Create circuit breaker core:

    ```python
    # src/meta_agent/circuit/breaker.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime, timedelta
    from typing import Optional, Callable, Awaitable, TypeVar, Generic
    import asyncio
    import logging

    logger = logging.getLogger(__name__)

    class CircuitState(str, Enum):
        CLOSED = "closed"      # Normal operation
        OPEN = "open"          # Failing, blocking requests
        HALF_OPEN = "half_open"  # Testing recovery

    @dataclass
    class CircuitBreakerConfig:
        # Failure thresholds
        failure_threshold: int = 5           # Failures to open circuit
        failure_rate_threshold: float = 0.5  # Or 50% failure rate
        min_requests_for_rate: int = 10      # Min requests before rate applies

        # Timing
        cooldown_seconds: int = 60           # Time in OPEN before trying HALF_OPEN
        half_open_max_requests: int = 3      # Requests to allow in HALF_OPEN
        success_threshold: int = 2           # Successes in HALF_OPEN to close

        # Monitoring window
        window_seconds: int = 60             # Time window for failure counting

    @dataclass
    class CircuitStats:
        total_requests: int = 0
        successful_requests: int = 0
        failed_requests: int = 0
        consecutive_failures: int = 0
        consecutive_successes: int = 0
        last_failure_time: Optional[datetime] = None
        last_success_time: Optional[datetime] = None
        window_start: datetime = field(default_factory=datetime.utcnow)

        def reset_window(self):
            self.total_requests = 0
            self.successful_requests = 0
            self.failed_requests = 0
            self.window_start = datetime.utcnow()

        @property
        def failure_rate(self) -> float:
            if self.total_requests == 0:
                return 0.0
            return self.failed_requests / self.total_requests

    T = TypeVar('T')

    class CircuitBreaker(Generic[T]):
        def __init__(
            self,
            name: str,
            config: Optional[CircuitBreakerConfig] = None,
            on_state_change: Optional[Callable[[str, CircuitState, CircuitState], Awaitable[None]]] = None,
        ):
            self.name = name
            self.config = config or CircuitBreakerConfig()
            self.on_state_change = on_state_change

            self._state = CircuitState.CLOSED
            self._stats = CircuitStats()
            self._opened_at: Optional[datetime] = None
            self._half_open_requests = 0
            self._lock = asyncio.Lock()

        @property
        def state(self) -> CircuitState:
            return self._state

        @property
        def is_closed(self) -> bool:
            return self._state == CircuitState.CLOSED

        @property
        def is_open(self) -> bool:
            return self._state == CircuitState.OPEN

        @property
        def is_half_open(self) -> bool:
            return self._state == CircuitState.HALF_OPEN

        async def can_execute(self) -> bool:
            """Check if a request can be executed."""
            async with self._lock:
                if self._state == CircuitState.CLOSED:
                    return True

                if self._state == CircuitState.OPEN:
                    # Check if cooldown has passed
                    if self._should_try_half_open():
                        await self._transition_to(CircuitState.HALF_OPEN)
                        self._half_open_requests = 0
                        return True
                    return False

                if self._state == CircuitState.HALF_OPEN:
                    # Allow limited requests in half-open
                    if self._half_open_requests < self.config.half_open_max_requests:
                        self._half_open_requests += 1
                        return True
                    return False

                return False

        async def record_success(self) -> None:
            """Record a successful execution."""
            async with self._lock:
                self._stats.total_requests += 1
                self._stats.successful_requests += 1
                self._stats.consecutive_successes += 1
                self._stats.consecutive_failures = 0
                self._stats.last_success_time = datetime.utcnow()

                if self._state == CircuitState.HALF_OPEN:
                    if self._stats.consecutive_successes >= self.config.success_threshold:
                        await self._transition_to(CircuitState.CLOSED)

        async def record_failure(self) -> None:
            """Record a failed execution."""
            async with self._lock:
                self._stats.total_requests += 1
                self._stats.failed_requests += 1
                self._stats.consecutive_failures += 1
                self._stats.consecutive_successes = 0
                self._stats.last_failure_time = datetime.utcnow()

                if self._state == CircuitState.HALF_OPEN:
                    # Any failure in half-open re-opens the circuit
                    await self._transition_to(CircuitState.OPEN)
                elif self._state == CircuitState.CLOSED:
                    # Check if we should open
                    if self._should_open():
                        await self._transition_to(CircuitState.OPEN)

        def _should_open(self) -> bool:
            """Determine if circuit should open."""
            # Check consecutive failures
            if self._stats.consecutive_failures >= self.config.failure_threshold:
                return True

            # Check failure rate (if enough requests)
            if self._stats.total_requests >= self.config.min_requests_for_rate:
                if self._stats.failure_rate >= self.config.failure_rate_threshold:
                    return True

            return False

        def _should_try_half_open(self) -> bool:
            """Check if we should transition to half-open."""
            if self._opened_at is None:
                return True

            cooldown = timedelta(seconds=self.config.cooldown_seconds)
            return datetime.utcnow() >= self._opened_at + cooldown

        async def _transition_to(self, new_state: CircuitState) -> None:
            """Transition to a new state."""
            old_state = self._state
            self._state = new_state

            logger.info(f"Circuit '{self.name}' transition: {old_state.value} -> {new_state.value}")

            if new_state == CircuitState.OPEN:
                self._opened_at = datetime.utcnow()
            elif new_state == CircuitState.CLOSED:
                self._stats.reset_window()
                self._opened_at = None

            if self.on_state_change:
                try:
                    await self.on_state_change(self.name, old_state, new_state)
                except Exception as e:
                    logger.error(f"State change callback error: {e}")

        async def force_open(self) -> None:
            """Manually open the circuit."""
            async with self._lock:
                if self._state != CircuitState.OPEN:
                    await self._transition_to(CircuitState.OPEN)

        async def force_close(self) -> None:
            """Manually close the circuit."""
            async with self._lock:
                if self._state != CircuitState.CLOSED:
                    await self._transition_to(CircuitState.CLOSED)

        async def reset(self) -> None:
            """Reset the circuit breaker."""
            async with self._lock:
                self._stats = CircuitStats()
                self._opened_at = None
                self._half_open_requests = 0
                await self._transition_to(CircuitState.CLOSED)

        def get_stats(self) -> dict:
            """Get current circuit breaker stats."""
            return {
                "name": self.name,
                "state": self._state.value,
                "stats": {
                    "total_requests": self._stats.total_requests,
                    "successful_requests": self._stats.successful_requests,
                    "failed_requests": self._stats.failed_requests,
                    "failure_rate": self._stats.failure_rate,
                    "consecutive_failures": self._stats.consecutive_failures,
                },
                "opened_at": self._opened_at.isoformat() if self._opened_at else None,
            }
    ```
  </action>
  <verify>
    - State transitions work correctly
    - Thresholds trigger opening
    - Cooldown respected
    - Half-open testing works
  </verify>
  <done>Circuit breaker state machine implemented</done>
</task>

<task id="5.2" type="auto" priority="critical">
  <name>Circuit Breaker Manager</name>
  <files>
    - src/meta_agent/circuit/manager.py
  </files>
  <context>
    Manager handles multiple circuit breakers (one per agent) and
    provides centralized control and monitoring.
  </context>
  <action>
    Create circuit breaker manager:

    ```python
    # src/meta_agent/circuit/manager.py
    from typing import Dict, Optional, Callable, Awaitable
    import asyncio
    import logging

    from .breaker import CircuitBreaker, CircuitBreakerConfig, CircuitState
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class CircuitBreakerManager:
        def __init__(
            self,
            database: Database,
            default_config: Optional[CircuitBreakerConfig] = None,
        ):
            self.db = database
            self.default_config = default_config or CircuitBreakerConfig()
            self._breakers: Dict[str, CircuitBreaker] = {}
            self._callbacks: list[Callable[[str, CircuitState, CircuitState], Awaitable[None]]] = []
            self._lock = asyncio.Lock()

        def on_state_change(
            self,
            callback: Callable[[str, CircuitState, CircuitState], Awaitable[None]],
        ) -> None:
            """Register callback for any circuit state change."""
            self._callbacks.append(callback)

        async def get_or_create(
            self,
            agent_id: str,
            config: Optional[CircuitBreakerConfig] = None,
        ) -> CircuitBreaker:
            """Get or create a circuit breaker for an agent."""
            async with self._lock:
                if agent_id not in self._breakers:
                    breaker = CircuitBreaker(
                        name=agent_id,
                        config=config or self.default_config,
                        on_state_change=self._handle_state_change,
                    )

                    # Load persisted state
                    await self._load_state(agent_id, breaker)

                    self._breakers[agent_id] = breaker

                return self._breakers[agent_id]

        async def _handle_state_change(
            self,
            name: str,
            old_state: CircuitState,
            new_state: CircuitState,
        ) -> None:
            """Handle state changes from any circuit breaker."""
            # Persist state
            await self._persist_state(name, new_state)

            # Notify all callbacks
            for callback in self._callbacks:
                try:
                    await callback(name, old_state, new_state)
                except Exception as e:
                    logger.error(f"Callback error: {e}")

        async def _persist_state(
            self,
            agent_id: str,
            state: CircuitState,
        ) -> None:
            """Persist circuit breaker state to database."""
            breaker = self._breakers.get(agent_id)
            if not breaker:
                return

            stats = breaker.get_stats()

            await self.db.execute(
                """
                INSERT INTO circuit_breaker_state (
                    agent_id, state, failure_count, success_count,
                    last_failure_at, last_state_change_at, metadata
                ) VALUES ($1, $2, $3, $4, $5, NOW(), $6)
                ON CONFLICT (agent_id) DO UPDATE SET
                    state = EXCLUDED.state,
                    failure_count = EXCLUDED.failure_count,
                    success_count = EXCLUDED.success_count,
                    last_failure_at = EXCLUDED.last_failure_at,
                    last_state_change_at = EXCLUDED.last_state_change_at,
                    metadata = EXCLUDED.metadata
                """,
                agent_id,
                state.value,
                stats["stats"]["failed_requests"],
                stats["stats"]["successful_requests"],
                breaker._stats.last_failure_time,
                stats,
            )

        async def _load_state(
            self,
            agent_id: str,
            breaker: CircuitBreaker,
        ) -> None:
            """Load persisted circuit breaker state."""
            row = await self.db.fetch_one(
                """
                SELECT state, failure_count, success_count,
                       last_failure_at, last_state_change_at
                FROM circuit_breaker_state
                WHERE agent_id = $1
                """,
                agent_id,
            )

            if row:
                # Restore state if circuit was open and cooldown hasn't passed
                if row["state"] == CircuitState.OPEN.value:
                    # Let the breaker determine if it should stay open
                    breaker._state = CircuitState.OPEN
                    breaker._opened_at = row["last_state_change_at"]
                    breaker._stats.failed_requests = row["failure_count"]
                    breaker._stats.successful_requests = row["success_count"]

        async def record_success(self, agent_id: str) -> None:
            """Record a successful execution for an agent."""
            breaker = await self.get_or_create(agent_id)
            await breaker.record_success()

        async def record_failure(self, agent_id: str) -> None:
            """Record a failed execution for an agent."""
            breaker = await self.get_or_create(agent_id)
            await breaker.record_failure()

        async def can_execute(self, agent_id: str) -> bool:
            """Check if an agent can execute (circuit allows)."""
            breaker = await self.get_or_create(agent_id)
            return await breaker.can_execute()

        async def get_state(self, agent_id: str) -> CircuitState:
            """Get the current state of an agent's circuit."""
            breaker = await self.get_or_create(agent_id)
            return breaker.state

        async def get_all_states(self) -> Dict[str, dict]:
            """Get states of all circuit breakers."""
            return {
                agent_id: breaker.get_stats()
                for agent_id, breaker in self._breakers.items()
            }

        async def force_open(self, agent_id: str) -> None:
            """Manually open an agent's circuit."""
            breaker = await self.get_or_create(agent_id)
            await breaker.force_open()

        async def force_close(self, agent_id: str) -> None:
            """Manually close an agent's circuit."""
            breaker = await self.get_or_create(agent_id)
            await breaker.force_close()

        async def reset(self, agent_id: str) -> None:
            """Reset an agent's circuit breaker."""
            breaker = await self.get_or_create(agent_id)
            await breaker.reset()
    ```
  </action>
  <verify>
    - Manager creates breakers correctly
    - State persisted to database
    - State loaded on restart
    - Callbacks triggered
  </verify>
  <done>Circuit breaker manager with persistence</done>
</task>

<task id="5.3" type="auto" priority="high">
  <name>Circuit Breaker Decorator</name>
  <files>
    - src/meta_agent/circuit/decorators.py
  </files>
  <context>
    Provide a decorator that agent code can use to wrap functions
    with circuit breaker protection.
  </context>
  <action>
    Create decorator:

    ```python
    # src/meta_agent/circuit/decorators.py
    from functools import wraps
    from typing import TypeVar, Callable, Optional, Any
    import asyncio

    from .breaker import CircuitBreaker, CircuitBreakerConfig
    from .manager import CircuitBreakerManager

    T = TypeVar('T')

    class CircuitOpenError(Exception):
        """Raised when circuit breaker is open."""
        def __init__(self, agent_id: str, message: str = "Circuit is open"):
            self.agent_id = agent_id
            super().__init__(f"Circuit for {agent_id}: {message}")

    def with_circuit_breaker(
        manager: CircuitBreakerManager,
        agent_id: str,
        fallback: Optional[Callable[..., T]] = None,
    ):
        """Decorator to wrap a function with circuit breaker protection."""
        def decorator(func: Callable[..., T]) -> Callable[..., T]:
            @wraps(func)
            async def async_wrapper(*args, **kwargs) -> T:
                # Check if circuit allows execution
                if not await manager.can_execute(agent_id):
                    if fallback:
                        return await fallback(*args, **kwargs) if asyncio.iscoroutinefunction(fallback) else fallback(*args, **kwargs)
                    raise CircuitOpenError(agent_id)

                try:
                    result = await func(*args, **kwargs)
                    await manager.record_success(agent_id)
                    return result
                except Exception as e:
                    await manager.record_failure(agent_id)
                    raise

            @wraps(func)
            def sync_wrapper(*args, **kwargs) -> T:
                loop = asyncio.get_event_loop()

                if not loop.run_until_complete(manager.can_execute(agent_id)):
                    if fallback:
                        return fallback(*args, **kwargs)
                    raise CircuitOpenError(agent_id)

                try:
                    result = func(*args, **kwargs)
                    loop.run_until_complete(manager.record_success(agent_id))
                    return result
                except Exception as e:
                    loop.run_until_complete(manager.record_failure(agent_id))
                    raise

            if asyncio.iscoroutinefunction(func):
                return async_wrapper
            return sync_wrapper

        return decorator

    class CircuitBreakerContext:
        """Context manager for circuit breaker protection."""

        def __init__(
            self,
            manager: CircuitBreakerManager,
            agent_id: str,
        ):
            self.manager = manager
            self.agent_id = agent_id
            self._allowed = False

        async def __aenter__(self) -> "CircuitBreakerContext":
            self._allowed = await self.manager.can_execute(self.agent_id)
            if not self._allowed:
                raise CircuitOpenError(self.agent_id)
            return self

        async def __aexit__(self, exc_type, exc_val, exc_tb):
            if exc_type is None:
                await self.manager.record_success(self.agent_id)
            else:
                await self.manager.record_failure(self.agent_id)
            return False  # Don't suppress exceptions
    ```
  </action>
  <verify>
    - Decorator protects async functions
    - Decorator protects sync functions
    - Fallback works when circuit open
    - Context manager works
  </verify>
  <done>Circuit breaker decorator and context manager</done>
</task>

<task id="5.4" type="auto" priority="high">
  <name>Integration with Health Monitor</name>
  <files>
    - src/meta_agent/circuit/health_integration.py
  </files>
  <context>
    Circuit breaker should integrate with health monitoring:
    - Open circuit on critical health
    - Try half-open when health improves
    - Report circuit state in health dashboard
  </context>
  <action>
    Create health integration:

    ```python
    # src/meta_agent/circuit/health_integration.py
    from typing import Optional
    import logging

    from .manager import CircuitBreakerManager
    from .breaker import CircuitState
    from ..monitoring.health_calculator import HealthStatus, HealthSnapshot
    from ..monitoring.websocket import HealthWebSocketManager

    logger = logging.getLogger(__name__)

    class CircuitHealthIntegration:
        def __init__(
            self,
            circuit_manager: CircuitBreakerManager,
            ws_manager: Optional[HealthWebSocketManager] = None,
        ):
            self.circuit_manager = circuit_manager
            self.ws_manager = ws_manager

            # Register callback for health transitions
            # This will be called by the health monitor

        async def on_health_transition(
            self,
            agent_id: str,
            transition: str,
            snapshot: HealthSnapshot,
        ) -> None:
            """Handle health status transitions."""
            if transition in ("critical_from_healthy", "critical_from_degraded"):
                # Open circuit when agent becomes critical
                logger.warning(f"Opening circuit for {agent_id} due to critical health")
                await self.circuit_manager.force_open(agent_id)

            elif transition == "recovered_from_critical":
                # Consider allowing half-open testing
                logger.info(f"Agent {agent_id} recovered, circuit will test")
                # Circuit will naturally try half-open after cooldown

            # Broadcast circuit state
            if self.ws_manager:
                state = await self.circuit_manager.get_state(agent_id)
                await self._broadcast_circuit_state(agent_id, state)

        async def on_circuit_state_change(
            self,
            agent_id: str,
            old_state: CircuitState,
            new_state: CircuitState,
        ) -> None:
            """Handle circuit breaker state changes."""
            logger.info(f"Circuit {agent_id}: {old_state.value} -> {new_state.value}")

            if self.ws_manager:
                await self._broadcast_circuit_state(agent_id, new_state)

        async def _broadcast_circuit_state(
            self,
            agent_id: str,
            state: CircuitState,
        ) -> None:
            """Broadcast circuit state to dashboard."""
            if not self.ws_manager:
                return

            # Get organization for the agent
            # (would need to look this up from agent registry)
            stats = (await self.circuit_manager.get_or_create(agent_id)).get_stats()

            # Broadcast to all (in production, filter by org)
            message = {
                "type": "circuit_state",
                "data": {
                    "agent_id": agent_id,
                    "state": state.value,
                    "stats": stats["stats"],
                }
            }

            # Would call ws_manager.broadcast here

    async def setup_circuit_health_integration(
        circuit_manager: CircuitBreakerManager,
        health_worker,  # HealthMonitorWorker
        ws_manager: Optional[HealthWebSocketManager] = None,
    ) -> CircuitHealthIntegration:
        """Set up integration between circuit breaker and health monitor."""
        integration = CircuitHealthIntegration(circuit_manager, ws_manager)

        # Register health transition callback
        health_worker.on_transition(integration.on_health_transition)

        # Register circuit state change callback
        circuit_manager.on_state_change(integration.on_circuit_state_change)

        return integration
    ```
  </action>
  <verify>
    - Circuit opens on critical health
    - State changes broadcast via WebSocket
    - Integration setup works
  </verify>
  <done>Circuit breaker and health monitor integration</done>
</task>

<task id="5.5" type="auto" priority="medium">
  <name>Circuit Breaker API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/circuit.py
  </files>
  <context>
    API endpoints for viewing and controlling circuit breakers.
  </context>
  <action>
    Create API endpoints:

    ```python
    # src/meta_agent/api/routes/circuit.py
    from fastapi import APIRouter, Depends, HTTPException
    from typing import Dict, List
    from pydantic import BaseModel

    from ...circuit.manager import CircuitBreakerManager
    from ...circuit.breaker import CircuitState
    from ..deps import get_circuit_manager, get_current_user

    router = APIRouter(prefix="/api/v1/circuits", tags=["circuits"])

    class CircuitStateResponse(BaseModel):
        agent_id: str
        state: str
        failure_count: int
        success_count: int
        failure_rate: float
        consecutive_failures: int
        opened_at: str | None

    class CircuitActionRequest(BaseModel):
        action: str  # "open", "close", "reset"

    @router.get("/", response_model=Dict[str, CircuitStateResponse])
    async def list_circuits(
        circuit_manager: CircuitBreakerManager = Depends(get_circuit_manager),
        user = Depends(get_current_user),
    ):
        """Get all circuit breaker states."""
        states = await circuit_manager.get_all_states()
        return {
            agent_id: CircuitStateResponse(
                agent_id=agent_id,
                state=stats["state"],
                failure_count=stats["stats"]["failed_requests"],
                success_count=stats["stats"]["successful_requests"],
                failure_rate=stats["stats"]["failure_rate"],
                consecutive_failures=stats["stats"]["consecutive_failures"],
                opened_at=stats.get("opened_at"),
            )
            for agent_id, stats in states.items()
        }

    @router.get("/{agent_id}", response_model=CircuitStateResponse)
    async def get_circuit(
        agent_id: str,
        circuit_manager: CircuitBreakerManager = Depends(get_circuit_manager),
        user = Depends(get_current_user),
    ):
        """Get circuit breaker state for an agent."""
        stats = (await circuit_manager.get_or_create(agent_id)).get_stats()
        return CircuitStateResponse(
            agent_id=agent_id,
            state=stats["state"],
            failure_count=stats["stats"]["failed_requests"],
            success_count=stats["stats"]["successful_requests"],
            failure_rate=stats["stats"]["failure_rate"],
            consecutive_failures=stats["stats"]["consecutive_failures"],
            opened_at=stats.get("opened_at"),
        )

    @router.post("/{agent_id}/action")
    async def circuit_action(
        agent_id: str,
        request: CircuitActionRequest,
        circuit_manager: CircuitBreakerManager = Depends(get_circuit_manager),
        user = Depends(get_current_user),
    ):
        """Perform action on a circuit breaker."""
        if request.action == "open":
            await circuit_manager.force_open(agent_id)
            return {"status": "opened", "agent_id": agent_id}
        elif request.action == "close":
            await circuit_manager.force_close(agent_id)
            return {"status": "closed", "agent_id": agent_id}
        elif request.action == "reset":
            await circuit_manager.reset(agent_id)
            return {"status": "reset", "agent_id": agent_id}
        else:
            raise HTTPException(400, f"Unknown action: {request.action}")
    ```
  </action>
  <verify>
    - List endpoint works
    - Get single circuit works
    - Actions work (open, close, reset)
    - Authentication required
  </verify>
  <done>Circuit breaker API endpoints</done>
</task>

<task id="5.6" type="auto" priority="medium">
  <name>Circuit Breaker Tests</name>
  <files>
    - tests/circuit/test_breaker.py
    - tests/circuit/test_manager.py
  </files>
  <context>
    Comprehensive tests for circuit breaker functionality.
  </context>
  <action>
    Create test files:

    ```python
    # tests/circuit/test_breaker.py
    import pytest
    import asyncio
    from meta_agent.circuit.breaker import (
        CircuitBreaker, CircuitBreakerConfig, CircuitState
    )

    @pytest.fixture
    def config():
        return CircuitBreakerConfig(
            failure_threshold=3,
            cooldown_seconds=1,
            half_open_max_requests=2,
            success_threshold=2,
        )

    @pytest.fixture
    def breaker(config):
        return CircuitBreaker("test-agent", config)

    @pytest.mark.asyncio
    async def test_starts_closed(breaker):
        assert breaker.state == CircuitState.CLOSED
        assert breaker.is_closed

    @pytest.mark.asyncio
    async def test_stays_closed_on_success(breaker):
        for _ in range(10):
            await breaker.record_success()
        assert breaker.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_opens_on_consecutive_failures(breaker):
        for _ in range(3):
            await breaker.record_failure()
        assert breaker.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_blocks_when_open(breaker):
        # Open the circuit
        for _ in range(3):
            await breaker.record_failure()

        assert not await breaker.can_execute()

    @pytest.mark.asyncio
    async def test_half_open_after_cooldown(breaker):
        # Open the circuit
        for _ in range(3):
            await breaker.record_failure()

        # Wait for cooldown
        await asyncio.sleep(1.1)

        # Should transition to half-open
        assert await breaker.can_execute()
        assert breaker.state == CircuitState.HALF_OPEN

    @pytest.mark.asyncio
    async def test_closes_on_half_open_success(breaker):
        # Open and wait for cooldown
        for _ in range(3):
            await breaker.record_failure()
        await asyncio.sleep(1.1)
        await breaker.can_execute()

        # Record successes in half-open
        await breaker.record_success()
        await breaker.record_success()

        assert breaker.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_reopens_on_half_open_failure(breaker):
        # Open and wait for cooldown
        for _ in range(3):
            await breaker.record_failure()
        await asyncio.sleep(1.1)
        await breaker.can_execute()

        # Failure in half-open reopens
        await breaker.record_failure()

        assert breaker.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_force_open(breaker):
        await breaker.force_open()
        assert breaker.state == CircuitState.OPEN

    @pytest.mark.asyncio
    async def test_force_close(breaker):
        await breaker.force_open()
        await breaker.force_close()
        assert breaker.state == CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_state_change_callback():
        transitions = []

        async def callback(name, old, new):
            transitions.append((name, old, new))

        breaker = CircuitBreaker(
            "test",
            CircuitBreakerConfig(failure_threshold=2),
            on_state_change=callback,
        )

        await breaker.record_failure()
        await breaker.record_failure()

        assert len(transitions) == 1
        assert transitions[0] == ("test", CircuitState.CLOSED, CircuitState.OPEN)
    ```
  </action>
  <verify>
    - All tests pass
    - State transitions tested
    - Edge cases covered
    - Callbacks tested
  </verify>
  <done>Comprehensive circuit breaker tests</done>
</task>

---

## Phase Exit Criteria

- [ ] State machine fully implemented
- [ ] Manager with persistence working
- [ ] Decorator and context manager ready
- [ ] Health monitor integration complete
- [ ] API endpoints functional
- [ ] All tests passing
- [ ] Circuit opens within 10 seconds
- [ ] Auto-recovery works

## Files Created

- `src/meta_agent/circuit/__init__.py`
- `src/meta_agent/circuit/breaker.py`
- `src/meta_agent/circuit/manager.py`
- `src/meta_agent/circuit/decorators.py`
- `src/meta_agent/circuit/health_integration.py`
- `src/meta_agent/api/routes/circuit.py`
- `tests/circuit/test_breaker.py`
- `tests/circuit/test_manager.py`
