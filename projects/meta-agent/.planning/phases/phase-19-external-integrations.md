# Phase 19: External Integrations

## Overview
Build integration layer for connecting MetaAgent with external systems including notification services, CI/CD pipelines, observability platforms, and webhooks.

## Dependencies
- Phase 14: Problem Analyzer (alert triggers)
- Phase 11: Canary Deployment (deployment events)
- Phase 18: Dashboard API (data access)

## Tasks

### Task 19.1: Integration Framework and Models

<task type="auto">
  <name>Create integration framework with plugin architecture</name>
  <files>src/meta_agent/integrations/models.py, src/meta_agent/integrations/base.py, migrations/019_integrations.sql</files>
  <action>
Define the base framework for external integrations with a plugin architecture.

```python
# src/meta_agent/integrations/models.py
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Any
import uuid


class IntegrationType(str, Enum):
    """Types of integrations."""
    NOTIFICATION = "notification"   # Slack, Discord, Email, PagerDuty
    CI_CD = "ci_cd"                # GitHub Actions, GitLab CI, Jenkins
    OBSERVABILITY = "observability" # Datadog, New Relic, Prometheus
    WEBHOOK = "webhook"            # Generic webhooks
    STORAGE = "storage"            # S3, GCS for exports
    TICKETING = "ticketing"        # Jira, Linear, GitHub Issues


class IntegrationStatus(str, Enum):
    """Status of an integration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    PENDING_SETUP = "pending_setup"


class EventType(str, Enum):
    """Types of events that can trigger integrations."""
    # Execution events
    EXECUTION_STARTED = "execution.started"
    EXECUTION_COMPLETED = "execution.completed"
    EXECUTION_FAILED = "execution.failed"

    # Alert events
    ALERT_CREATED = "alert.created"
    ALERT_RESOLVED = "alert.resolved"

    # Deployment events
    CANARY_STARTED = "canary.started"
    CANARY_PROMOTED = "canary.promoted"
    CANARY_ROLLED_BACK = "canary.rolled_back"

    # Problem events
    PROBLEM_DETECTED = "problem.detected"
    PROBLEM_RESOLVED = "problem.resolved"

    # Experiment events
    EXPERIMENT_STARTED = "experiment.started"
    EXPERIMENT_COMPLETED = "experiment.completed"

    # Proposal events
    PROPOSAL_CREATED = "proposal.created"
    PROPOSAL_APPROVED = "proposal.approved"

    # System events
    SYSTEM_DEGRADED = "system.degraded"
    SYSTEM_RECOVERED = "system.recovered"


@dataclass
class IntegrationConfig:
    """Configuration for an integration."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    type: IntegrationType = IntegrationType.WEBHOOK
    provider: str = ""  # slack, discord, github, datadog, etc.
    status: IntegrationStatus = IntegrationStatus.PENDING_SETUP

    # Configuration
    config: dict = field(default_factory=dict)  # Provider-specific config
    credentials: dict = field(default_factory=dict)  # Encrypted credentials

    # Event subscriptions
    subscribed_events: list[EventType] = field(default_factory=list)
    event_filters: dict = field(default_factory=dict)  # Filter by agent, severity, etc.

    # Rate limiting
    rate_limit_per_minute: int = 60
    batch_events: bool = False
    batch_window_seconds: int = 60

    # Metadata
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    last_triggered_at: Optional[datetime] = None
    error_message: Optional[str] = None


@dataclass
class IntegrationEvent:
    """An event to be sent to integrations."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    event_type: EventType = EventType.EXECUTION_COMPLETED
    payload: dict = field(default_factory=dict)
    metadata: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)

    # Source info
    agent_id: Optional[str] = None
    execution_id: Optional[str] = None


@dataclass
class IntegrationDelivery:
    """Record of an event delivery to an integration."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    integration_id: str = ""
    event_id: str = ""
    status: str = "pending"  # pending, success, failed, retrying
    attempts: int = 0
    last_attempt_at: Optional[datetime] = None
    response_code: Optional[int] = None
    response_body: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class WebhookPayload:
    """Standard webhook payload format."""
    event_type: str
    timestamp: str
    data: dict
    metadata: dict = field(default_factory=dict)
```

```python
# src/meta_agent/integrations/base.py
from abc import ABC, abstractmethod
from typing import Any, Optional
import asyncio
import aiohttp
from datetime import datetime

from .models import IntegrationConfig, IntegrationEvent, IntegrationDelivery


class BaseIntegration(ABC):
    """Base class for all integrations."""

    def __init__(self, config: IntegrationConfig):
        self.config = config
        self.session: Optional[aiohttp.ClientSession] = None

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return the provider name."""
        pass

    @abstractmethod
    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate the integration configuration."""
        pass

    @abstractmethod
    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send an event to the integration."""
        pass

    @abstractmethod
    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test the integration connection."""
        pass

    async def setup(self):
        """Set up the integration (create session, etc.)."""
        if not self.session:
            self.session = aiohttp.ClientSession()

    async def cleanup(self):
        """Clean up resources."""
        if self.session:
            await self.session.close()
            self.session = None

    def should_handle_event(self, event: IntegrationEvent) -> bool:
        """Check if this integration should handle the event."""
        # Check if subscribed to event type
        if event.event_type not in self.config.subscribed_events:
            return False

        # Apply filters
        filters = self.config.event_filters

        # Agent filter
        if "agent_ids" in filters and event.agent_id:
            if event.agent_id not in filters["agent_ids"]:
                return False

        # Severity filter
        if "min_severity" in filters:
            event_severity = event.payload.get("severity", "low")
            severity_order = ["low", "medium", "high", "critical"]
            min_severity = filters["min_severity"]
            if severity_order.index(event_severity) < severity_order.index(min_severity):
                return False

        return True

    async def _make_request(
        self,
        method: str,
        url: str,
        headers: Optional[dict] = None,
        json_data: Optional[dict] = None,
        timeout: int = 30,
    ) -> tuple[int, str]:
        """Make an HTTP request."""
        if not self.session:
            await self.setup()

        try:
            async with self.session.request(
                method,
                url,
                headers=headers,
                json=json_data,
                timeout=aiohttp.ClientTimeout(total=timeout),
            ) as response:
                body = await response.text()
                return response.status, body
        except asyncio.TimeoutError:
            return 0, "Request timed out"
        except Exception as e:
            return 0, str(e)


class IntegrationRegistry:
    """Registry for integration providers."""

    _providers: dict[str, type[BaseIntegration]] = {}

    @classmethod
    def register(cls, provider_name: str):
        """Decorator to register an integration provider."""
        def decorator(integration_class: type[BaseIntegration]):
            cls._providers[provider_name] = integration_class
            return integration_class
        return decorator

    @classmethod
    def get_provider(cls, provider_name: str) -> Optional[type[BaseIntegration]]:
        """Get an integration provider class."""
        return cls._providers.get(provider_name)

    @classmethod
    def list_providers(cls) -> list[str]:
        """List all registered providers."""
        return list(cls._providers.keys())

    @classmethod
    def create_integration(cls, config: IntegrationConfig) -> Optional[BaseIntegration]:
        """Create an integration instance from config."""
        provider_class = cls.get_provider(config.provider)
        if provider_class:
            return provider_class(config)
        return None
```

```sql
-- migrations/019_integrations.sql
-- Integration configuration and delivery tables

CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    provider VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending_setup',

    -- Configuration (encrypted in production)
    config JSONB DEFAULT '{}',
    credentials JSONB DEFAULT '{}',

    -- Event subscriptions
    subscribed_events TEXT[] DEFAULT '{}',
    event_filters JSONB DEFAULT '{}',

    -- Rate limiting
    rate_limit_per_minute INTEGER DEFAULT 60,
    batch_events BOOLEAN DEFAULT false,
    batch_window_seconds INTEGER DEFAULT 60,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_triggered_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

CREATE INDEX idx_integration_type ON integrations(type);
CREATE INDEX idx_integration_provider ON integrations(provider);
CREATE INDEX idx_integration_status ON integrations(status);

-- Event delivery tracking
CREATE TABLE IF NOT EXISTS integration_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
    event_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,

    -- Delivery status
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMP WITH TIME ZONE,

    -- Response
    response_code INTEGER,
    response_body TEXT,
    error_message TEXT,

    -- Payload (for retry)
    payload JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_delivery_integration ON integration_deliveries(integration_id);
CREATE INDEX idx_delivery_status ON integration_deliveries(status);
CREATE INDEX idx_delivery_event ON integration_deliveries(event_id);
CREATE INDEX idx_delivery_created ON integration_deliveries(created_at);

-- Event batching queue
CREATE TABLE IF NOT EXISTS integration_event_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_queue_integration ON integration_event_queue(integration_id);
CREATE INDEX idx_queue_unprocessed ON integration_event_queue(integration_id, processed_at)
    WHERE processed_at IS NULL;
```
  </action>
  <verify>
    - Integration models with all configuration options
    - Base integration class with common functionality
    - Registry for plugin architecture
    - Database schema for integrations and deliveries
    - Event filtering logic
  </verify>
  <done>Integration framework with plugin architecture and database schema complete</done>
</task>

### Task 19.2: Notification Integrations

<task type="auto">
  <name>Implement Slack, Discord, Email, and PagerDuty integrations</name>
  <files>src/meta_agent/integrations/notifications.py</files>
  <action>
Build notification integrations for alerting and communication.

```python
# src/meta_agent/integrations/notifications.py
import json
from datetime import datetime
from typing import Optional
import aiohttp

from .base import BaseIntegration, IntegrationRegistry
from .models import (
    IntegrationConfig,
    IntegrationEvent,
    IntegrationDelivery,
    EventType,
)


@IntegrationRegistry.register("slack")
class SlackIntegration(BaseIntegration):
    """Slack webhook integration."""

    @property
    def provider_name(self) -> str:
        return "slack"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate Slack configuration."""
        webhook_url = self.config.config.get("webhook_url")
        if not webhook_url:
            return False, "webhook_url is required"

        if not webhook_url.startswith("https://hooks.slack.com/"):
            return False, "Invalid Slack webhook URL"

        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test Slack connection by sending a test message."""
        webhook_url = self.config.config.get("webhook_url")

        status, body = await self._make_request(
            "POST",
            webhook_url,
            json_data={"text": "🔧 MetaAgent integration test - connection successful!"},
        )

        if status == 200:
            return True, None
        return False, f"Slack returned status {status}: {body}"

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send event to Slack."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        webhook_url = self.config.config.get("webhook_url")
        channel = self.config.config.get("channel")

        # Format message based on event type
        message = self._format_slack_message(event)

        payload = {"blocks": message["blocks"]}
        if channel:
            payload["channel"] = channel

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request("POST", webhook_url, json_data=payload)

        delivery.response_code = status
        delivery.response_body = body[:500] if body else None

        if status == 200:
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

        return delivery

    def _format_slack_message(self, event: IntegrationEvent) -> dict:
        """Format event as Slack message."""
        event_config = self._get_event_format(event.event_type)

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": f"{event_config['emoji']} {event_config['title']}",
                }
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": self._format_event_body(event),
                }
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": f"Event: `{event.event_type.value}` | Time: {event.created_at.isoformat()}"
                    }
                ]
            }
        ]

        return {"blocks": blocks}

    def _get_event_format(self, event_type: EventType) -> dict:
        """Get formatting config for event type."""
        formats = {
            EventType.EXECUTION_FAILED: {"emoji": "❌", "title": "Execution Failed"},
            EventType.ALERT_CREATED: {"emoji": "🚨", "title": "Alert Created"},
            EventType.ALERT_RESOLVED: {"emoji": "✅", "title": "Alert Resolved"},
            EventType.CANARY_STARTED: {"emoji": "🐤", "title": "Canary Deployment Started"},
            EventType.CANARY_PROMOTED: {"emoji": "🎉", "title": "Canary Promoted"},
            EventType.CANARY_ROLLED_BACK: {"emoji": "⚠️", "title": "Canary Rolled Back"},
            EventType.PROBLEM_DETECTED: {"emoji": "🔍", "title": "Problem Detected"},
            EventType.SYSTEM_DEGRADED: {"emoji": "🔴", "title": "System Degraded"},
            EventType.SYSTEM_RECOVERED: {"emoji": "🟢", "title": "System Recovered"},
        }
        return formats.get(event_type, {"emoji": "ℹ️", "title": event_type.value})

    def _format_event_body(self, event: IntegrationEvent) -> str:
        """Format event payload as Slack markdown."""
        lines = []

        payload = event.payload
        if "agent_name" in payload:
            lines.append(f"*Agent:* {payload['agent_name']}")
        if "message" in payload:
            lines.append(f"*Message:* {payload['message']}")
        if "severity" in payload:
            lines.append(f"*Severity:* {payload['severity']}")
        if "success_rate" in payload:
            lines.append(f"*Success Rate:* {payload['success_rate']:.1%}")
        if "error" in payload:
            lines.append(f"*Error:* ```{payload['error'][:200]}```")

        return "\n".join(lines) if lines else "No additional details"


@IntegrationRegistry.register("discord")
class DiscordIntegration(BaseIntegration):
    """Discord webhook integration."""

    @property
    def provider_name(self) -> str:
        return "discord"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate Discord configuration."""
        webhook_url = self.config.config.get("webhook_url")
        if not webhook_url:
            return False, "webhook_url is required"

        if not webhook_url.startswith("https://discord.com/api/webhooks/"):
            return False, "Invalid Discord webhook URL"

        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test Discord connection."""
        webhook_url = self.config.config.get("webhook_url")

        status, body = await self._make_request(
            "POST",
            webhook_url,
            json_data={"content": "🔧 MetaAgent integration test - connection successful!"},
        )

        if status in (200, 204):
            return True, None
        return False, f"Discord returned status {status}: {body}"

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send event to Discord."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        webhook_url = self.config.config.get("webhook_url")

        # Format as Discord embed
        embed = self._format_discord_embed(event)
        payload = {"embeds": [embed]}

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request("POST", webhook_url, json_data=payload)

        delivery.response_code = status
        delivery.response_body = body[:500] if body else None

        if status in (200, 204):
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

        return delivery

    def _format_discord_embed(self, event: IntegrationEvent) -> dict:
        """Format event as Discord embed."""
        event_colors = {
            EventType.EXECUTION_FAILED: 0xFF0000,  # Red
            EventType.ALERT_CREATED: 0xFF6600,     # Orange
            EventType.ALERT_RESOLVED: 0x00FF00,    # Green
            EventType.SYSTEM_DEGRADED: 0xFF0000,
            EventType.SYSTEM_RECOVERED: 0x00FF00,
        }

        color = event_colors.get(event.event_type, 0x0099FF)  # Default blue

        fields = []
        payload = event.payload

        if "agent_name" in payload:
            fields.append({"name": "Agent", "value": payload["agent_name"], "inline": True})
        if "severity" in payload:
            fields.append({"name": "Severity", "value": payload["severity"], "inline": True})
        if "message" in payload:
            fields.append({"name": "Message", "value": payload["message"][:1024], "inline": False})

        return {
            "title": event.event_type.value.replace(".", " ").title(),
            "color": color,
            "fields": fields,
            "timestamp": event.created_at.isoformat(),
            "footer": {"text": "MetaAgent"},
        }


@IntegrationRegistry.register("email")
class EmailIntegration(BaseIntegration):
    """Email integration via SMTP or API."""

    @property
    def provider_name(self) -> str:
        return "email"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate email configuration."""
        required = ["smtp_host", "smtp_port", "from_address", "to_addresses"]
        missing = [f for f in required if f not in self.config.config]

        if missing:
            return False, f"Missing required fields: {', '.join(missing)}"

        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test email connection."""
        # Would test SMTP connection
        return True, None

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send event via email."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        # In production, would use aiosmtplib or email API
        # Placeholder implementation
        try:
            subject = f"[MetaAgent] {event.event_type.value}"
            body = self._format_email_body(event)

            # TODO: Implement actual email sending
            # await self._send_email(subject, body)

            delivery.status = "success"
        except Exception as e:
            delivery.status = "failed"
            delivery.error_message = str(e)

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        return delivery

    def _format_email_body(self, event: IntegrationEvent) -> str:
        """Format event as email body."""
        lines = [
            f"Event: {event.event_type.value}",
            f"Time: {event.created_at.isoformat()}",
            "",
            "Details:",
        ]

        for key, value in event.payload.items():
            lines.append(f"  {key}: {value}")

        return "\n".join(lines)


@IntegrationRegistry.register("pagerduty")
class PagerDutyIntegration(BaseIntegration):
    """PagerDuty integration for incident management."""

    API_URL = "https://events.pagerduty.com/v2/enqueue"

    @property
    def provider_name(self) -> str:
        return "pagerduty"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate PagerDuty configuration."""
        if "routing_key" not in self.config.credentials:
            return False, "routing_key is required"
        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test PagerDuty connection."""
        # Would send a test event
        return True, None

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send event to PagerDuty."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        routing_key = self.config.credentials.get("routing_key")

        # Determine event action
        if event.event_type in (EventType.ALERT_RESOLVED, EventType.SYSTEM_RECOVERED):
            action = "resolve"
        elif event.event_type in (EventType.ALERT_CREATED, EventType.SYSTEM_DEGRADED):
            action = "trigger"
        else:
            action = "trigger"

        # Determine severity
        severity_map = {
            "critical": "critical",
            "high": "error",
            "medium": "warning",
            "low": "info",
        }
        event_severity = event.payload.get("severity", "medium")
        pd_severity = severity_map.get(event_severity, "warning")

        payload = {
            "routing_key": routing_key,
            "event_action": action,
            "dedup_key": f"metaagent-{event.agent_id or 'system'}-{event.event_type.value}",
            "payload": {
                "summary": event.payload.get("message", event.event_type.value),
                "source": "MetaAgent",
                "severity": pd_severity,
                "timestamp": event.created_at.isoformat(),
                "custom_details": event.payload,
            },
        }

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request("POST", self.API_URL, json_data=payload)

        delivery.response_code = status
        delivery.response_body = body[:500] if body else None

        if status == 202:
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

        return delivery


@IntegrationRegistry.register("webhook")
class GenericWebhookIntegration(BaseIntegration):
    """Generic webhook integration."""

    @property
    def provider_name(self) -> str:
        return "webhook"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate webhook configuration."""
        if "url" not in self.config.config:
            return False, "url is required"
        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test webhook endpoint."""
        url = self.config.config.get("url")
        method = self.config.config.get("method", "POST")

        test_payload = {
            "event_type": "test",
            "timestamp": datetime.utcnow().isoformat(),
            "message": "MetaAgent integration test",
        }

        status, body = await self._make_request(method, url, json_data=test_payload)

        if 200 <= status < 300:
            return True, None
        return False, f"Webhook returned status {status}"

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send event to webhook."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        url = self.config.config.get("url")
        method = self.config.config.get("method", "POST")
        headers = self.config.config.get("headers", {})

        # Add auth if configured
        if "auth_header" in self.config.credentials:
            headers["Authorization"] = self.config.credentials["auth_header"]

        payload = {
            "event_type": event.event_type.value,
            "timestamp": event.created_at.isoformat(),
            "data": event.payload,
            "metadata": {
                "agent_id": event.agent_id,
                "execution_id": event.execution_id,
            },
        }

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request(method, url, headers=headers, json_data=payload)

        delivery.response_code = status
        delivery.response_body = body[:500] if body else None

        if 200 <= status < 300:
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

        return delivery
```
  </action>
  <verify>
    - Slack integration with rich formatting
    - Discord integration with embeds
    - Email integration (placeholder)
    - PagerDuty integration for incidents
    - Generic webhook integration
    - All registered with IntegrationRegistry
  </verify>
  <done>Notification integrations for Slack, Discord, Email, PagerDuty, and webhooks complete</done>
</task>

### Task 19.3: CI/CD and Observability Integrations

<task type="auto">
  <name>Implement GitHub Actions, Datadog, and Prometheus integrations</name>
  <files>src/meta_agent/integrations/cicd.py, src/meta_agent/integrations/observability.py</files>
  <action>
Build integrations for CI/CD pipelines and observability platforms.

```python
# src/meta_agent/integrations/cicd.py
import json
from datetime import datetime
from typing import Optional

from .base import BaseIntegration, IntegrationRegistry
from .models import IntegrationConfig, IntegrationEvent, IntegrationDelivery, EventType


@IntegrationRegistry.register("github")
class GitHubIntegration(BaseIntegration):
    """GitHub integration for issues and workflows."""

    API_BASE = "https://api.github.com"

    @property
    def provider_name(self) -> str:
        return "github"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate GitHub configuration."""
        if "token" not in self.config.credentials:
            return False, "GitHub token is required"
        if "repo" not in self.config.config:
            return False, "Repository (owner/repo) is required"
        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test GitHub API connection."""
        token = self.config.credentials.get("token")
        repo = self.config.config.get("repo")

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }

        status, body = await self._make_request(
            "GET",
            f"{self.API_BASE}/repos/{repo}",
            headers=headers,
        )

        if status == 200:
            return True, None
        return False, f"GitHub API returned {status}: {body}"

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Handle event based on configuration."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        action = self.config.config.get("action", "create_issue")

        try:
            if action == "create_issue":
                await self._create_issue(event, delivery)
            elif action == "trigger_workflow":
                await self._trigger_workflow(event, delivery)
            elif action == "create_comment":
                await self._create_comment(event, delivery)
        except Exception as e:
            delivery.status = "failed"
            delivery.error_message = str(e)

        return delivery

    async def _create_issue(self, event: IntegrationEvent, delivery: IntegrationDelivery):
        """Create a GitHub issue."""
        token = self.config.credentials.get("token")
        repo = self.config.config.get("repo")

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }

        # Build issue body
        labels = self.config.config.get("labels", [])
        if event.payload.get("severity") == "critical":
            labels.append("critical")

        issue_data = {
            "title": f"[MetaAgent] {event.event_type.value}: {event.payload.get('message', 'No message')[:50]}",
            "body": self._format_issue_body(event),
            "labels": labels,
        }

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request(
            "POST",
            f"{self.API_BASE}/repos/{repo}/issues",
            headers=headers,
            json_data=issue_data,
        )

        delivery.response_code = status
        delivery.response_body = body[:500]

        if status == 201:
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

    async def _trigger_workflow(self, event: IntegrationEvent, delivery: IntegrationDelivery):
        """Trigger a GitHub Actions workflow."""
        token = self.config.credentials.get("token")
        repo = self.config.config.get("repo")
        workflow_id = self.config.config.get("workflow_id")
        ref = self.config.config.get("ref", "main")

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }

        workflow_data = {
            "ref": ref,
            "inputs": {
                "event_type": event.event_type.value,
                "agent_id": event.agent_id or "",
                "payload": json.dumps(event.payload),
            },
        }

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request(
            "POST",
            f"{self.API_BASE}/repos/{repo}/actions/workflows/{workflow_id}/dispatches",
            headers=headers,
            json_data=workflow_data,
        )

        delivery.response_code = status
        delivery.response_body = body[:500]

        if status == 204:
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

    async def _create_comment(self, event: IntegrationEvent, delivery: IntegrationDelivery):
        """Create a comment on an issue or PR."""
        token = self.config.credentials.get("token")
        repo = self.config.config.get("repo")
        issue_number = event.payload.get("issue_number") or self.config.config.get("issue_number")

        if not issue_number:
            delivery.status = "failed"
            delivery.error_message = "No issue number provided"
            return

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github.v3+json",
        }

        comment_data = {
            "body": self._format_issue_body(event),
        }

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request(
            "POST",
            f"{self.API_BASE}/repos/{repo}/issues/{issue_number}/comments",
            headers=headers,
            json_data=comment_data,
        )

        delivery.response_code = status
        delivery.response_body = body[:500]

        if status == 201:
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

    def _format_issue_body(self, event: IntegrationEvent) -> str:
        """Format event as GitHub issue/comment body."""
        lines = [
            f"## {event.event_type.value.replace('.', ' ').title()}",
            "",
            f"**Time:** {event.created_at.isoformat()}",
        ]

        if event.agent_id:
            lines.append(f"**Agent ID:** `{event.agent_id}`")

        lines.append("")
        lines.append("### Details")
        lines.append("")

        for key, value in event.payload.items():
            if isinstance(value, str) and len(value) > 200:
                lines.append(f"**{key}:**")
                lines.append(f"```\n{value[:500]}\n```")
            else:
                lines.append(f"**{key}:** {value}")

        lines.append("")
        lines.append("---")
        lines.append("*Generated by MetaAgent*")

        return "\n".join(lines)
```

```python
# src/meta_agent/integrations/observability.py
import json
from datetime import datetime
from typing import Optional

from .base import BaseIntegration, IntegrationRegistry
from .models import IntegrationConfig, IntegrationEvent, IntegrationDelivery, EventType


@IntegrationRegistry.register("datadog")
class DatadogIntegration(BaseIntegration):
    """Datadog integration for metrics and events."""

    @property
    def provider_name(self) -> str:
        return "datadog"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate Datadog configuration."""
        if "api_key" not in self.config.credentials:
            return False, "Datadog API key is required"
        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test Datadog API connection."""
        api_key = self.config.credentials.get("api_key")
        site = self.config.config.get("site", "datadoghq.com")

        headers = {
            "DD-API-KEY": api_key,
            "Content-Type": "application/json",
        }

        status, body = await self._make_request(
            "GET",
            f"https://api.{site}/api/v1/validate",
            headers=headers,
        )

        if status == 200:
            return True, None
        return False, f"Datadog API returned {status}"

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send event to Datadog."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        api_key = self.config.credentials.get("api_key")
        site = self.config.config.get("site", "datadoghq.com")
        action = self.config.config.get("action", "event")

        headers = {
            "DD-API-KEY": api_key,
            "Content-Type": "application/json",
        }

        try:
            if action == "event":
                await self._send_event(event, headers, site, delivery)
            elif action == "metric":
                await self._send_metric(event, headers, site, delivery)
        except Exception as e:
            delivery.status = "failed"
            delivery.error_message = str(e)

        return delivery

    async def _send_event(
        self,
        event: IntegrationEvent,
        headers: dict,
        site: str,
        delivery: IntegrationDelivery,
    ):
        """Send an event to Datadog."""
        # Map event types to Datadog alert types
        alert_type_map = {
            EventType.EXECUTION_FAILED: "error",
            EventType.ALERT_CREATED: "warning",
            EventType.SYSTEM_DEGRADED: "error",
            EventType.PROBLEM_DETECTED: "warning",
        }

        alert_type = alert_type_map.get(event.event_type, "info")

        dd_event = {
            "title": f"MetaAgent: {event.event_type.value}",
            "text": json.dumps(event.payload, indent=2),
            "alert_type": alert_type,
            "source_type_name": "metaagent",
            "tags": [
                f"event_type:{event.event_type.value}",
                f"agent_id:{event.agent_id or 'system'}",
            ],
        }

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request(
            "POST",
            f"https://api.{site}/api/v1/events",
            headers=headers,
            json_data=dd_event,
        )

        delivery.response_code = status
        delivery.response_body = body[:500]

        if status in (200, 202):
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

    async def _send_metric(
        self,
        event: IntegrationEvent,
        headers: dict,
        site: str,
        delivery: IntegrationDelivery,
    ):
        """Send a metric to Datadog."""
        metric_name = self.config.config.get("metric_name", "metaagent.event")
        tags = self.config.config.get("tags", [])

        tags.extend([
            f"event_type:{event.event_type.value}",
            f"agent_id:{event.agent_id or 'system'}",
        ])

        metric_data = {
            "series": [{
                "metric": metric_name,
                "points": [[int(datetime.utcnow().timestamp()), 1]],
                "type": "count",
                "tags": tags,
            }]
        }

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request(
            "POST",
            f"https://api.{site}/api/v1/series",
            headers=headers,
            json_data=metric_data,
        )

        delivery.response_code = status
        delivery.response_body = body[:500]

        if status in (200, 202):
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body


@IntegrationRegistry.register("prometheus")
class PrometheusIntegration(BaseIntegration):
    """Prometheus Pushgateway integration."""

    @property
    def provider_name(self) -> str:
        return "prometheus"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate Prometheus configuration."""
        if "pushgateway_url" not in self.config.config:
            return False, "Pushgateway URL is required"
        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test Pushgateway connection."""
        url = self.config.config.get("pushgateway_url")

        status, body = await self._make_request("GET", f"{url}/-/healthy")

        if status == 200:
            return True, None
        return False, f"Pushgateway returned {status}"

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send metrics to Prometheus Pushgateway."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        url = self.config.config.get("pushgateway_url")
        job = self.config.config.get("job", "metaagent")

        # Build Prometheus metrics
        metrics = self._build_metrics(event)

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        # Push to gateway
        headers = {"Content-Type": "text/plain"}

        status, body = await self._make_request(
            "POST",
            f"{url}/metrics/job/{job}",
            headers=headers,
            json_data=None,  # We need to send plain text
        )

        delivery.response_code = status
        delivery.response_body = body[:500]

        if status in (200, 202):
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

        return delivery

    def _build_metrics(self, event: IntegrationEvent) -> str:
        """Build Prometheus metrics from event."""
        lines = []

        # Event counter
        event_name = event.event_type.value.replace(".", "_")
        labels = f'agent_id="{event.agent_id or "system"}"'

        lines.append(f"# HELP metaagent_{event_name}_total Total count of {event_name} events")
        lines.append(f"# TYPE metaagent_{event_name}_total counter")
        lines.append(f"metaagent_{event_name}_total{{{labels}}} 1")

        return "\n".join(lines)


@IntegrationRegistry.register("newrelic")
class NewRelicIntegration(BaseIntegration):
    """New Relic integration for events and metrics."""

    @property
    def provider_name(self) -> str:
        return "newrelic"

    async def validate_config(self) -> tuple[bool, Optional[str]]:
        """Validate New Relic configuration."""
        if "api_key" not in self.config.credentials:
            return False, "New Relic API key (License key) is required"
        return True, None

    async def test_connection(self) -> tuple[bool, Optional[str]]:
        """Test New Relic connection."""
        # Would validate API key
        return True, None

    async def send_event(self, event: IntegrationEvent) -> IntegrationDelivery:
        """Send event to New Relic."""
        delivery = IntegrationDelivery(
            integration_id=self.config.id,
            event_id=event.id,
        )

        api_key = self.config.credentials.get("api_key")
        account_id = self.config.config.get("account_id")
        region = self.config.config.get("region", "us")

        if region == "eu":
            url = "https://insights-collector.eu01.nr-data.net/v1/accounts/{account_id}/events"
        else:
            url = f"https://insights-collector.newrelic.com/v1/accounts/{account_id}/events"

        headers = {
            "Api-Key": api_key,
            "Content-Type": "application/json",
        }

        nr_event = {
            "eventType": "MetaAgentEvent",
            "event_type": event.event_type.value,
            "agent_id": event.agent_id or "system",
            "timestamp": int(event.created_at.timestamp()),
            **{k: str(v)[:4096] for k, v in event.payload.items()},
        }

        delivery.attempts += 1
        delivery.last_attempt_at = datetime.utcnow()

        status, body = await self._make_request(
            "POST",
            url,
            headers=headers,
            json_data=[nr_event],
        )

        delivery.response_code = status
        delivery.response_body = body[:500]

        if status == 200:
            delivery.status = "success"
        else:
            delivery.status = "failed"
            delivery.error_message = body

        return delivery
```
  </action>
  <verify>
    - GitHub integration with issues and workflow dispatch
    - Datadog integration for events and metrics
    - Prometheus Pushgateway integration
    - New Relic integration for custom events
    - All registered with IntegrationRegistry
  </verify>
  <done>CI/CD and observability integrations for GitHub, Datadog, Prometheus, and New Relic complete</done>
</task>

### Task 19.4: Event Dispatcher and Delivery Manager

<task type="auto">
  <name>Build event dispatcher with retry logic and batching</name>
  <files>src/meta_agent/integrations/dispatcher.py</files>
  <action>
Create the event dispatcher that routes events to integrations with retry and batching support.

```python
# src/meta_agent/integrations/dispatcher.py
import asyncio
import json
from datetime import datetime, timedelta
from typing import Optional
from collections import defaultdict

from ..database import Database
from .base import IntegrationRegistry, BaseIntegration
from .models import (
    IntegrationConfig,
    IntegrationEvent,
    IntegrationDelivery,
    EventType,
    IntegrationStatus,
)


class IntegrationRepository:
    """Repository for integration configurations."""

    def __init__(self, db: Database):
        self.db = db

    async def get_active_integrations(self) -> list[IntegrationConfig]:
        """Get all active integrations."""
        rows = await self.db.fetch_all("""
            SELECT * FROM integrations WHERE status = 'active'
        """)
        return [self._row_to_config(row) for row in rows]

    async def get_integrations_for_event(
        self,
        event_type: EventType,
    ) -> list[IntegrationConfig]:
        """Get integrations subscribed to an event type."""
        rows = await self.db.fetch_all("""
            SELECT * FROM integrations
            WHERE status = 'active'
            AND $1 = ANY(subscribed_events)
        """, [event_type.value])
        return [self._row_to_config(row) for row in rows]

    async def save_delivery(self, delivery: IntegrationDelivery):
        """Save a delivery record."""
        await self.db.execute("""
            INSERT INTO integration_deliveries (
                id, integration_id, event_id, event_type, status, attempts,
                last_attempt_at, response_code, response_body, error_message,
                payload, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (id) DO UPDATE SET
                status = $5, attempts = $6, last_attempt_at = $7,
                response_code = $8, response_body = $9, error_message = $10
        """, [
            delivery.id, delivery.integration_id, delivery.event_id,
            "", delivery.status, delivery.attempts, delivery.last_attempt_at,
            delivery.response_code, delivery.response_body, delivery.error_message,
            None, delivery.created_at,
        ])

    async def get_pending_deliveries(self, limit: int = 100) -> list[dict]:
        """Get deliveries pending retry."""
        rows = await self.db.fetch_all("""
            SELECT d.*, i.* FROM integration_deliveries d
            JOIN integrations i ON i.id = d.integration_id
            WHERE d.status IN ('pending', 'retrying')
            AND d.attempts < 5
            AND (d.last_attempt_at IS NULL OR d.last_attempt_at < NOW() - INTERVAL '5 minutes')
            ORDER BY d.created_at
            LIMIT $1
        """, [limit])
        return rows

    async def queue_event(self, integration_id: str, event: IntegrationEvent):
        """Queue an event for batching."""
        await self.db.execute("""
            INSERT INTO integration_event_queue (
                integration_id, event_type, payload, created_at
            ) VALUES ($1, $2, $3, $4)
        """, [
            integration_id, event.event_type.value,
            json.dumps(event.payload), datetime.utcnow(),
        ])

    async def get_queued_events(
        self,
        integration_id: str,
        limit: int = 100,
    ) -> list[dict]:
        """Get queued events for an integration."""
        rows = await self.db.fetch_all("""
            SELECT * FROM integration_event_queue
            WHERE integration_id = $1 AND processed_at IS NULL
            ORDER BY created_at
            LIMIT $2
        """, [integration_id, limit])
        return rows

    async def mark_events_processed(self, event_ids: list[str]):
        """Mark queued events as processed."""
        await self.db.execute("""
            UPDATE integration_event_queue
            SET processed_at = NOW()
            WHERE id = ANY($1)
        """, [event_ids])

    def _row_to_config(self, row: dict) -> IntegrationConfig:
        """Convert database row to IntegrationConfig."""
        return IntegrationConfig(
            id=str(row["id"]),
            name=row["name"],
            type=row["type"],
            provider=row["provider"],
            status=IntegrationStatus(row["status"]),
            config=row.get("config") or {},
            credentials=row.get("credentials") or {},
            subscribed_events=[EventType(e) for e in (row.get("subscribed_events") or [])],
            event_filters=row.get("event_filters") or {},
            rate_limit_per_minute=row.get("rate_limit_per_minute", 60),
            batch_events=row.get("batch_events", False),
            batch_window_seconds=row.get("batch_window_seconds", 60),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            last_triggered_at=row.get("last_triggered_at"),
            error_message=row.get("error_message"),
        )


class EventDispatcher:
    """Dispatches events to configured integrations."""

    def __init__(self, repository: IntegrationRepository):
        self.repo = repository
        self._integrations: dict[str, BaseIntegration] = {}
        self._rate_limits: dict[str, list[datetime]] = defaultdict(list)

    async def dispatch(self, event: IntegrationEvent) -> list[IntegrationDelivery]:
        """Dispatch an event to all subscribed integrations."""
        deliveries = []

        # Get integrations for this event type
        configs = await self.repo.get_integrations_for_event(event.event_type)

        for config in configs:
            # Get or create integration instance
            integration = await self._get_integration(config)
            if not integration:
                continue

            # Check if should handle (filters)
            if not integration.should_handle_event(event):
                continue

            # Check rate limits
            if not self._check_rate_limit(config):
                continue

            # Handle batching or immediate send
            if config.batch_events:
                await self.repo.queue_event(config.id, event)
            else:
                delivery = await self._send_event(integration, event)
                deliveries.append(delivery)

        return deliveries

    async def _get_integration(self, config: IntegrationConfig) -> Optional[BaseIntegration]:
        """Get or create an integration instance."""
        if config.id not in self._integrations:
            integration = IntegrationRegistry.create_integration(config)
            if integration:
                await integration.setup()
                self._integrations[config.id] = integration

        return self._integrations.get(config.id)

    def _check_rate_limit(self, config: IntegrationConfig) -> bool:
        """Check if rate limit allows sending."""
        now = datetime.utcnow()
        window_start = now - timedelta(minutes=1)

        # Clean old entries
        self._rate_limits[config.id] = [
            t for t in self._rate_limits[config.id]
            if t > window_start
        ]

        # Check limit
        if len(self._rate_limits[config.id]) >= config.rate_limit_per_minute:
            return False

        # Record this attempt
        self._rate_limits[config.id].append(now)
        return True

    async def _send_event(
        self,
        integration: BaseIntegration,
        event: IntegrationEvent,
    ) -> IntegrationDelivery:
        """Send an event to an integration."""
        try:
            delivery = await integration.send_event(event)
        except Exception as e:
            delivery = IntegrationDelivery(
                integration_id=integration.config.id,
                event_id=event.id,
                status="failed",
                error_message=str(e),
                attempts=1,
                last_attempt_at=datetime.utcnow(),
            )

        # Save delivery record
        await self.repo.save_delivery(delivery)

        return delivery

    async def process_batched_events(self):
        """Process batched events for all integrations."""
        configs = await self.repo.get_active_integrations()

        for config in configs:
            if not config.batch_events:
                continue

            # Get queued events
            queued = await self.repo.get_queued_events(config.id)
            if not queued:
                continue

            # Create batch event
            integration = await self._get_integration(config)
            if not integration:
                continue

            # Combine events into batch
            batch_event = IntegrationEvent(
                event_type=EventType.EXECUTION_COMPLETED,  # Generic type for batch
                payload={
                    "batch": True,
                    "event_count": len(queued),
                    "events": [
                        {
                            "type": q["event_type"],
                            "payload": json.loads(q["payload"]),
                            "timestamp": q["created_at"].isoformat(),
                        }
                        for q in queued
                    ],
                },
            )

            # Send batch
            await self._send_event(integration, batch_event)

            # Mark as processed
            await self.repo.mark_events_processed([str(q["id"]) for q in queued])

    async def retry_failed_deliveries(self):
        """Retry failed deliveries."""
        pending = await self.repo.get_pending_deliveries()

        for row in pending:
            config = self.repo._row_to_config(row)
            integration = await self._get_integration(config)

            if not integration:
                continue

            # Recreate event from stored payload
            event = IntegrationEvent(
                id=str(row["event_id"]),
                event_type=EventType(row["event_type"]) if row["event_type"] else EventType.EXECUTION_COMPLETED,
                payload=row.get("payload") or {},
            )

            # Retry with exponential backoff
            delivery = IntegrationDelivery(
                id=str(row["id"]),
                integration_id=config.id,
                event_id=event.id,
                attempts=row["attempts"],
            )

            try:
                new_delivery = await integration.send_event(event)
                delivery.status = new_delivery.status
                delivery.response_code = new_delivery.response_code
                delivery.response_body = new_delivery.response_body
                delivery.error_message = new_delivery.error_message
            except Exception as e:
                delivery.status = "retrying" if delivery.attempts < 4 else "failed"
                delivery.error_message = str(e)

            delivery.attempts += 1
            delivery.last_attempt_at = datetime.utcnow()

            await self.repo.save_delivery(delivery)

    async def cleanup(self):
        """Clean up integration resources."""
        for integration in self._integrations.values():
            await integration.cleanup()
        self._integrations.clear()


class EventEmitter:
    """High-level interface for emitting events."""

    def __init__(self, dispatcher: EventDispatcher):
        self.dispatcher = dispatcher

    async def emit(
        self,
        event_type: EventType,
        payload: dict,
        agent_id: Optional[str] = None,
        execution_id: Optional[str] = None,
    ) -> list[IntegrationDelivery]:
        """Emit an event to all subscribed integrations."""
        event = IntegrationEvent(
            event_type=event_type,
            payload=payload,
            agent_id=agent_id,
            execution_id=execution_id,
        )

        return await self.dispatcher.dispatch(event)

    # Convenience methods for common events
    async def execution_failed(
        self,
        agent_id: str,
        execution_id: str,
        error: str,
        **extra,
    ):
        """Emit execution failed event."""
        return await self.emit(
            EventType.EXECUTION_FAILED,
            {"error": error, "message": f"Execution failed: {error[:100]}", **extra},
            agent_id=agent_id,
            execution_id=execution_id,
        )

    async def alert_created(
        self,
        severity: str,
        title: str,
        message: str,
        agent_id: Optional[str] = None,
        **extra,
    ):
        """Emit alert created event."""
        return await self.emit(
            EventType.ALERT_CREATED,
            {"severity": severity, "title": title, "message": message, **extra},
            agent_id=agent_id,
        )

    async def canary_started(
        self,
        agent_id: str,
        version: str,
        **extra,
    ):
        """Emit canary started event."""
        return await self.emit(
            EventType.CANARY_STARTED,
            {"version": version, "message": f"Canary deployment started for version {version}", **extra},
            agent_id=agent_id,
        )

    async def canary_promoted(
        self,
        agent_id: str,
        version: str,
        **extra,
    ):
        """Emit canary promoted event."""
        return await self.emit(
            EventType.CANARY_PROMOTED,
            {"version": version, "message": f"Version {version} promoted to production", **extra},
            agent_id=agent_id,
        )

    async def canary_rolled_back(
        self,
        agent_id: str,
        version: str,
        reason: str,
        **extra,
    ):
        """Emit canary rolled back event."""
        return await self.emit(
            EventType.CANARY_ROLLED_BACK,
            {"version": version, "reason": reason, "message": f"Canary rolled back: {reason}", **extra},
            agent_id=agent_id,
        )

    async def system_degraded(
        self,
        reason: str,
        affected_agents: list[str] = None,
        **extra,
    ):
        """Emit system degraded event."""
        return await self.emit(
            EventType.SYSTEM_DEGRADED,
            {
                "severity": "critical",
                "reason": reason,
                "affected_agents": affected_agents or [],
                "message": f"System degraded: {reason}",
                **extra,
            },
        )

    async def system_recovered(self, **extra):
        """Emit system recovered event."""
        return await self.emit(
            EventType.SYSTEM_RECOVERED,
            {"message": "System has recovered to healthy state", **extra},
        )
```
  </action>
  <verify>
    - IntegrationRepository for database operations
    - EventDispatcher with rate limiting and batching
    - Retry logic with exponential backoff
    - EventEmitter with convenience methods
    - All event types have emit methods
  </verify>
  <done>Event dispatcher with retry, batching, and rate limiting complete</done>
</task>

### Task 19.5: Integration API Endpoints

<task type="auto">
  <name>Create REST API for integration management</name>
  <files>src/meta_agent/api/routes/integrations.py</files>
  <action>
Implement API endpoints for managing integrations.

```python
# src/meta_agent/api/routes/integrations.py
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from ...integrations.models import (
    IntegrationType,
    IntegrationStatus,
    EventType,
)
from ...integrations.base import IntegrationRegistry
from ...integrations.dispatcher import IntegrationRepository, EventDispatcher, EventEmitter
from ..dependencies import get_integration_repo, get_dispatcher, get_emitter


router = APIRouter(prefix="/integrations", tags=["integrations"])


# ==================== REQUEST/RESPONSE MODELS ====================

class CreateIntegrationRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    type: IntegrationType
    provider: str = Field(..., min_length=1)
    config: dict = {}
    credentials: dict = {}
    subscribed_events: list[str] = []
    event_filters: dict = {}
    rate_limit_per_minute: int = Field(default=60, ge=1, le=1000)
    batch_events: bool = False
    batch_window_seconds: int = Field(default=60, ge=10, le=3600)


class UpdateIntegrationRequest(BaseModel):
    name: Optional[str] = None
    config: Optional[dict] = None
    credentials: Optional[dict] = None
    subscribed_events: Optional[list[str]] = None
    event_filters: Optional[dict] = None
    rate_limit_per_minute: Optional[int] = None
    batch_events: Optional[bool] = None
    batch_window_seconds: Optional[int] = None
    status: Optional[IntegrationStatus] = None


class TestEventRequest(BaseModel):
    event_type: EventType
    payload: dict = {}
    agent_id: Optional[str] = None


class IntegrationResponse(BaseModel):
    id: str
    name: str
    type: str
    provider: str
    status: str
    config: dict
    subscribed_events: list[str]
    event_filters: dict
    rate_limit_per_minute: int
    batch_events: bool
    batch_window_seconds: int
    created_at: datetime
    updated_at: datetime
    last_triggered_at: Optional[datetime]
    error_message: Optional[str]


class DeliveryResponse(BaseModel):
    id: str
    integration_id: str
    event_id: str
    status: str
    attempts: int
    last_attempt_at: Optional[datetime]
    response_code: Optional[int]
    error_message: Optional[str]
    created_at: datetime


class ProviderInfo(BaseModel):
    name: str
    type: str
    description: str
    required_config: list[str]
    required_credentials: list[str]


# ==================== ENDPOINTS ====================

@router.get("/providers", response_model=list[ProviderInfo])
async def list_providers():
    """List available integration providers."""
    providers = IntegrationRegistry.list_providers()

    # Provider metadata (would be more dynamic in production)
    provider_info = {
        "slack": {
            "type": "notification",
            "description": "Send notifications to Slack channels",
            "required_config": ["webhook_url"],
            "required_credentials": [],
        },
        "discord": {
            "type": "notification",
            "description": "Send notifications to Discord channels",
            "required_config": ["webhook_url"],
            "required_credentials": [],
        },
        "pagerduty": {
            "type": "notification",
            "description": "Create incidents in PagerDuty",
            "required_config": [],
            "required_credentials": ["routing_key"],
        },
        "github": {
            "type": "ci_cd",
            "description": "Create issues or trigger workflows in GitHub",
            "required_config": ["repo", "action"],
            "required_credentials": ["token"],
        },
        "datadog": {
            "type": "observability",
            "description": "Send events and metrics to Datadog",
            "required_config": ["site"],
            "required_credentials": ["api_key"],
        },
        "prometheus": {
            "type": "observability",
            "description": "Push metrics to Prometheus Pushgateway",
            "required_config": ["pushgateway_url"],
            "required_credentials": [],
        },
        "webhook": {
            "type": "webhook",
            "description": "Send events to a custom webhook URL",
            "required_config": ["url"],
            "required_credentials": [],
        },
    }

    return [
        ProviderInfo(
            name=p,
            type=provider_info.get(p, {}).get("type", "unknown"),
            description=provider_info.get(p, {}).get("description", ""),
            required_config=provider_info.get(p, {}).get("required_config", []),
            required_credentials=provider_info.get(p, {}).get("required_credentials", []),
        )
        for p in providers
    ]


@router.get("/event-types")
async def list_event_types():
    """List available event types."""
    return {
        "event_types": [
            {"value": e.value, "name": e.name}
            for e in EventType
        ]
    }


@router.post("/", response_model=IntegrationResponse)
async def create_integration(
    request: CreateIntegrationRequest,
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """Create a new integration."""
    # Validate provider exists
    if request.provider not in IntegrationRegistry.list_providers():
        raise HTTPException(status_code=400, detail=f"Unknown provider: {request.provider}")

    # Create integration config
    from ...integrations.models import IntegrationConfig
    config = IntegrationConfig(
        name=request.name,
        type=request.type,
        provider=request.provider,
        status=IntegrationStatus.PENDING_SETUP,
        config=request.config,
        credentials=request.credentials,
        subscribed_events=[EventType(e) for e in request.subscribed_events],
        event_filters=request.event_filters,
        rate_limit_per_minute=request.rate_limit_per_minute,
        batch_events=request.batch_events,
        batch_window_seconds=request.batch_window_seconds,
    )

    # Validate config
    integration = IntegrationRegistry.create_integration(config)
    if integration:
        valid, error = await integration.validate_config()
        if not valid:
            raise HTTPException(status_code=400, detail=f"Invalid configuration: {error}")

    # Save to database
    await repo.db.execute("""
        INSERT INTO integrations (
            id, name, type, provider, status, config, credentials,
            subscribed_events, event_filters, rate_limit_per_minute,
            batch_events, batch_window_seconds, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
    """, [
        config.id, config.name, config.type.value, config.provider,
        config.status.value, config.config, config.credentials,
        [e.value for e in config.subscribed_events], config.event_filters,
        config.rate_limit_per_minute, config.batch_events,
        config.batch_window_seconds, datetime.utcnow(),
    ])

    return _config_to_response(config)


@router.get("/", response_model=list[IntegrationResponse])
async def list_integrations(
    type: Optional[IntegrationType] = None,
    status: Optional[IntegrationStatus] = None,
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """List all integrations."""
    query = "SELECT * FROM integrations WHERE 1=1"
    params = []

    if type:
        params.append(type.value)
        query += f" AND type = ${len(params)}"

    if status:
        params.append(status.value)
        query += f" AND status = ${len(params)}"

    query += " ORDER BY name"

    rows = await repo.db.fetch_all(query, params)
    configs = [repo._row_to_config(row) for row in rows]
    return [_config_to_response(c) for c in configs]


@router.get("/{integration_id}", response_model=IntegrationResponse)
async def get_integration(
    integration_id: str,
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """Get a specific integration."""
    row = await repo.db.fetch_one(
        "SELECT * FROM integrations WHERE id = $1",
        [integration_id]
    )

    if not row:
        raise HTTPException(status_code=404, detail="Integration not found")

    config = repo._row_to_config(row)
    return _config_to_response(config)


@router.put("/{integration_id}", response_model=IntegrationResponse)
async def update_integration(
    integration_id: str,
    request: UpdateIntegrationRequest,
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """Update an integration."""
    # Get current config
    row = await repo.db.fetch_one(
        "SELECT * FROM integrations WHERE id = $1",
        [integration_id]
    )

    if not row:
        raise HTTPException(status_code=404, detail="Integration not found")

    # Build update
    updates = []
    params = []
    param_idx = 1

    update_fields = request.dict(exclude_unset=True)
    for field, value in update_fields.items():
        if field == "subscribed_events":
            value = [e for e in value]
        elif field == "status":
            value = value.value

        updates.append(f"{field} = ${param_idx}")
        params.append(value)
        param_idx += 1

    if not updates:
        config = repo._row_to_config(row)
        return _config_to_response(config)

    updates.append(f"updated_at = ${param_idx}")
    params.append(datetime.utcnow())
    param_idx += 1

    params.append(integration_id)

    await repo.db.execute(f"""
        UPDATE integrations
        SET {', '.join(updates)}
        WHERE id = ${param_idx}
    """, params)

    # Fetch updated
    row = await repo.db.fetch_one(
        "SELECT * FROM integrations WHERE id = $1",
        [integration_id]
    )
    config = repo._row_to_config(row)
    return _config_to_response(config)


@router.delete("/{integration_id}")
async def delete_integration(
    integration_id: str,
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """Delete an integration."""
    await repo.db.execute(
        "DELETE FROM integrations WHERE id = $1",
        [integration_id]
    )
    return {"status": "deleted", "integration_id": integration_id}


@router.post("/{integration_id}/test")
async def test_integration(
    integration_id: str,
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """Test an integration's connection."""
    row = await repo.db.fetch_one(
        "SELECT * FROM integrations WHERE id = $1",
        [integration_id]
    )

    if not row:
        raise HTTPException(status_code=404, detail="Integration not found")

    config = repo._row_to_config(row)
    integration = IntegrationRegistry.create_integration(config)

    if not integration:
        raise HTTPException(status_code=400, detail="Unknown provider")

    await integration.setup()

    try:
        success, error = await integration.test_connection()
    finally:
        await integration.cleanup()

    if success:
        # Update status to active
        await repo.db.execute(
            "UPDATE integrations SET status = 'active', error_message = NULL WHERE id = $1",
            [integration_id]
        )
        return {"status": "success", "message": "Connection test successful"}
    else:
        await repo.db.execute(
            "UPDATE integrations SET status = 'error', error_message = $1 WHERE id = $2",
            [error, integration_id]
        )
        return {"status": "failed", "message": error}


@router.post("/{integration_id}/activate")
async def activate_integration(
    integration_id: str,
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """Activate an integration."""
    await repo.db.execute(
        "UPDATE integrations SET status = 'active' WHERE id = $1",
        [integration_id]
    )
    return {"status": "activated"}


@router.post("/{integration_id}/deactivate")
async def deactivate_integration(
    integration_id: str,
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """Deactivate an integration."""
    await repo.db.execute(
        "UPDATE integrations SET status = 'inactive' WHERE id = $1",
        [integration_id]
    )
    return {"status": "deactivated"}


@router.get("/{integration_id}/deliveries", response_model=list[DeliveryResponse])
async def get_deliveries(
    integration_id: str,
    status: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    repo: IntegrationRepository = Depends(get_integration_repo),
):
    """Get delivery history for an integration."""
    query = "SELECT * FROM integration_deliveries WHERE integration_id = $1"
    params = [integration_id]

    if status:
        params.append(status)
        query += f" AND status = ${len(params)}"

    query += " ORDER BY created_at DESC LIMIT $" + str(len(params) + 1)
    params.append(limit)

    rows = await repo.db.fetch_all(query, params)

    return [
        DeliveryResponse(
            id=str(row["id"]),
            integration_id=str(row["integration_id"]),
            event_id=str(row["event_id"]),
            status=row["status"],
            attempts=row["attempts"],
            last_attempt_at=row.get("last_attempt_at"),
            response_code=row.get("response_code"),
            error_message=row.get("error_message"),
            created_at=row["created_at"],
        )
        for row in rows
    ]


@router.post("/emit", response_model=list[DeliveryResponse])
async def emit_event(
    request: TestEventRequest,
    emitter: EventEmitter = Depends(get_emitter),
):
    """Manually emit an event (for testing)."""
    deliveries = await emitter.emit(
        event_type=request.event_type,
        payload=request.payload,
        agent_id=request.agent_id,
    )

    return [
        DeliveryResponse(
            id=d.id,
            integration_id=d.integration_id,
            event_id=d.event_id,
            status=d.status,
            attempts=d.attempts,
            last_attempt_at=d.last_attempt_at,
            response_code=d.response_code,
            error_message=d.error_message,
            created_at=d.created_at,
        )
        for d in deliveries
    ]


# ==================== HELPERS ====================

def _config_to_response(config) -> IntegrationResponse:
    """Convert IntegrationConfig to response model."""
    return IntegrationResponse(
        id=config.id,
        name=config.name,
        type=config.type.value if hasattr(config.type, 'value') else config.type,
        provider=config.provider,
        status=config.status.value if hasattr(config.status, 'value') else config.status,
        config=config.config,
        subscribed_events=[e.value if hasattr(e, 'value') else e for e in config.subscribed_events],
        event_filters=config.event_filters,
        rate_limit_per_minute=config.rate_limit_per_minute,
        batch_events=config.batch_events,
        batch_window_seconds=config.batch_window_seconds,
        created_at=config.created_at,
        updated_at=config.updated_at,
        last_triggered_at=config.last_triggered_at,
        error_message=config.error_message,
    )
```
  </action>
  <verify>
    - List available providers endpoint
    - List event types endpoint
    - Integration CRUD endpoints
    - Test connection endpoint
    - Activate/deactivate endpoints
    - Delivery history endpoint
    - Manual event emit endpoint
  </verify>
  <done>Integration REST API with full management and testing endpoints complete</done>
</task>

## Phase Completion Criteria

- [ ] Integration framework with plugin architecture
- [ ] Notification integrations (Slack, Discord, Email, PagerDuty)
- [ ] CI/CD integrations (GitHub)
- [ ] Observability integrations (Datadog, Prometheus, New Relic)
- [ ] Generic webhook integration
- [ ] Event dispatcher with retry and batching
- [ ] Rate limiting for integrations
- [ ] REST API for integration management
- [ ] Connection testing capability
- [ ] Delivery tracking and history
