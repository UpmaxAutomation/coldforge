# Phase 6: Alerting System

**Duration**: 4 days | **Complexity**: Medium | **Dependencies**: Phase 4

## Phase Overview

Build multi-channel alerting with smart deduplication. Alerts are triggered by health changes, circuit breaker events, SLA breaches, and other anomalies.

## Success Criteria

- [ ] Alert detection engine (6+ alert types)
- [ ] Severity classification (info/warning/critical/emergency)
- [ ] Alert deduplication (1-hour window)
- [ ] Slack integration with rich formatting
- [ ] Email integration (SendGrid)
- [ ] ClickUp task creation for critical alerts
- [ ] Alert acknowledgment API
- [ ] Alert resolution tracking
- [ ] Daily alert digest
- [ ] Critical alerts delivered within 1 minute

---

## Tasks

<task id="6.1" type="auto" priority="critical">
  <name>Alert Detection Engine</name>
  <files>
    - src/meta_agent/alerting/detector.py
    - src/meta_agent/alerting/__init__.py
  </files>
  <context>
    Alert types:
    - HEALTH_DEGRADED: Agent health dropped
    - HEALTH_CRITICAL: Agent in critical state
    - CIRCUIT_OPENED: Circuit breaker opened
    - SLA_BREACH: SLA target missed
    - ERROR_SPIKE: Sudden increase in errors
    - COST_EXCEEDED: Cost budget exceeded
    - CONSECUTIVE_FAILURES: Multiple failures in a row
  </context>
  <action>
    Create alert detector:

    ```python
    # src/meta_agent/alerting/detector.py
    from enum import Enum
    from dataclasses import dataclass, field
    from datetime import datetime, timedelta
    from typing import Optional, List, Dict, Any
    from uuid import uuid4
    import logging

    logger = logging.getLogger(__name__)

    class AlertType(str, Enum):
        HEALTH_DEGRADED = "health_degraded"
        HEALTH_CRITICAL = "health_critical"
        CIRCUIT_OPENED = "circuit_opened"
        CIRCUIT_CLOSED = "circuit_closed"
        SLA_BREACH = "sla_breach"
        SLA_WARNING = "sla_warning"
        ERROR_SPIKE = "error_spike"
        COST_EXCEEDED = "cost_exceeded"
        COST_WARNING = "cost_warning"
        CONSECUTIVE_FAILURES = "consecutive_failures"
        AGENT_RECOVERED = "agent_recovered"

    class AlertSeverity(str, Enum):
        INFO = "info"
        WARNING = "warning"
        CRITICAL = "critical"
        EMERGENCY = "emergency"

    @dataclass
    class Alert:
        id: str = field(default_factory=lambda: str(uuid4()))
        organization_id: str = ""
        agent_id: str = ""
        alert_type: AlertType = AlertType.HEALTH_DEGRADED
        severity: AlertSeverity = AlertSeverity.WARNING
        title: str = ""
        message: str = ""
        details: Dict[str, Any] = field(default_factory=dict)
        created_at: datetime = field(default_factory=datetime.utcnow)
        acknowledged_at: Optional[datetime] = None
        acknowledged_by: Optional[str] = None
        resolved_at: Optional[datetime] = None
        resolved_by: Optional[str] = None
        dedup_key: str = ""

    class AlertDetector:
        # Severity mapping per alert type
        SEVERITY_MAP = {
            AlertType.HEALTH_CRITICAL: AlertSeverity.CRITICAL,
            AlertType.HEALTH_DEGRADED: AlertSeverity.WARNING,
            AlertType.CIRCUIT_OPENED: AlertSeverity.CRITICAL,
            AlertType.CIRCUIT_CLOSED: AlertSeverity.INFO,
            AlertType.SLA_BREACH: AlertSeverity.CRITICAL,
            AlertType.SLA_WARNING: AlertSeverity.WARNING,
            AlertType.ERROR_SPIKE: AlertSeverity.WARNING,
            AlertType.COST_EXCEEDED: AlertSeverity.CRITICAL,
            AlertType.COST_WARNING: AlertSeverity.WARNING,
            AlertType.CONSECUTIVE_FAILURES: AlertSeverity.WARNING,
            AlertType.AGENT_RECOVERED: AlertSeverity.INFO,
        }

        def __init__(self):
            self._alert_templates = self._load_templates()

        def _load_templates(self) -> Dict[AlertType, Dict[str, str]]:
            return {
                AlertType.HEALTH_CRITICAL: {
                    "title": "🚨 Critical: {agent_name} is failing",
                    "message": "Agent {agent_name} health score dropped to {score}%. Issues: {issues}",
                },
                AlertType.HEALTH_DEGRADED: {
                    "title": "⚠️ Warning: {agent_name} is degraded",
                    "message": "Agent {agent_name} health score dropped to {score}%. Success rate: {success_rate}%",
                },
                AlertType.CIRCUIT_OPENED: {
                    "title": "🔴 Circuit Opened: {agent_name}",
                    "message": "Circuit breaker opened for {agent_name} after {failures} consecutive failures",
                },
                AlertType.CIRCUIT_CLOSED: {
                    "title": "🟢 Circuit Closed: {agent_name}",
                    "message": "Circuit breaker closed for {agent_name} - agent has recovered",
                },
                AlertType.SLA_BREACH: {
                    "title": "❌ SLA Breach: {agent_name}",
                    "message": "{metric_name} at {actual_value} (target: {target_value})",
                },
                AlertType.SLA_WARNING: {
                    "title": "⚠️ SLA Warning: {agent_name}",
                    "message": "{metric_name} at {actual_value} (80% of target: {target_value})",
                },
                AlertType.ERROR_SPIKE: {
                    "title": "📈 Error Spike: {agent_name}",
                    "message": "Error rate increased by {increase_pct}% in the last {window_minutes} minutes",
                },
                AlertType.COST_EXCEEDED: {
                    "title": "💰 Budget Exceeded: {agent_name}",
                    "message": "Cost ${current_cost} exceeds budget ${budget}",
                },
                AlertType.COST_WARNING: {
                    "title": "💵 Cost Warning: {agent_name}",
                    "message": "Cost ${current_cost} is at {percent}% of budget ${budget}",
                },
                AlertType.CONSECUTIVE_FAILURES: {
                    "title": "🔁 Repeated Failures: {agent_name}",
                    "message": "Agent has failed {count} times consecutively. Last error: {last_error}",
                },
                AlertType.AGENT_RECOVERED: {
                    "title": "✅ Recovered: {agent_name}",
                    "message": "Agent {agent_name} has recovered. Health score: {score}%",
                },
            }

        def create_alert(
            self,
            alert_type: AlertType,
            organization_id: str,
            agent_id: str,
            agent_name: str,
            **kwargs,
        ) -> Alert:
            """Create an alert from template."""
            template = self._alert_templates.get(alert_type, {})

            # Format title and message
            format_data = {
                "agent_name": agent_name,
                "agent_id": agent_id,
                **kwargs,
            }

            title = template.get("title", str(alert_type)).format(**format_data)
            message = template.get("message", "").format(**format_data)

            # Generate dedup key
            dedup_key = f"{organization_id}:{agent_id}:{alert_type.value}"

            return Alert(
                organization_id=organization_id,
                agent_id=agent_id,
                alert_type=alert_type,
                severity=self.SEVERITY_MAP.get(alert_type, AlertSeverity.WARNING),
                title=title,
                message=message,
                details=kwargs,
                dedup_key=dedup_key,
            )

        def detect_from_health_transition(
            self,
            organization_id: str,
            agent_id: str,
            agent_name: str,
            transition: str,
            snapshot,  # HealthSnapshot
        ) -> Optional[Alert]:
            """Detect alerts from health transitions."""
            if transition in ("critical_from_healthy", "critical_from_degraded"):
                return self.create_alert(
                    AlertType.HEALTH_CRITICAL,
                    organization_id,
                    agent_id,
                    agent_name,
                    score=snapshot.score,
                    issues=", ".join(snapshot.issues),
                    success_rate=round(snapshot.success_rate_5min * 100, 1),
                )

            elif transition == "degrading":
                return self.create_alert(
                    AlertType.HEALTH_DEGRADED,
                    organization_id,
                    agent_id,
                    agent_name,
                    score=snapshot.score,
                    success_rate=round(snapshot.success_rate_5min * 100, 1),
                )

            elif transition in ("recovered", "recovered_from_critical"):
                return self.create_alert(
                    AlertType.AGENT_RECOVERED,
                    organization_id,
                    agent_id,
                    agent_name,
                    score=snapshot.score,
                )

            return None

        def detect_from_circuit_change(
            self,
            organization_id: str,
            agent_id: str,
            agent_name: str,
            old_state: str,
            new_state: str,
            consecutive_failures: int = 0,
        ) -> Optional[Alert]:
            """Detect alerts from circuit breaker changes."""
            if new_state == "open":
                return self.create_alert(
                    AlertType.CIRCUIT_OPENED,
                    organization_id,
                    agent_id,
                    agent_name,
                    failures=consecutive_failures,
                )
            elif old_state == "open" and new_state == "closed":
                return self.create_alert(
                    AlertType.CIRCUIT_CLOSED,
                    organization_id,
                    agent_id,
                    agent_name,
                )
            return None
    ```
  </action>
  <verify>
    - All alert types created correctly
    - Templates formatted properly
    - Dedup keys generated
    - Severity assigned correctly
  </verify>
  <done>Alert detection engine with templates</done>
</task>

<task id="6.2" type="auto" priority="critical">
  <name>Alert Deduplication</name>
  <files>
    - src/meta_agent/alerting/deduplicator.py
  </files>
  <context>
    Prevent alert fatigue by deduplicating within a time window.
    Same alert type for same agent within 1 hour = deduplicated.
  </context>
  <action>
    Create deduplicator:

    ```python
    # src/meta_agent/alerting/deduplicator.py
    from datetime import datetime, timedelta
    from typing import Optional, Dict, Set
    import asyncio
    import logging

    from .detector import Alert

    logger = logging.getLogger(__name__)

    class AlertDeduplicator:
        def __init__(
            self,
            window_seconds: int = 3600,  # 1 hour default
            max_cache_size: int = 10000,
        ):
            self.window_seconds = window_seconds
            self.max_cache_size = max_cache_size
            self._seen: Dict[str, datetime] = {}
            self._lock = asyncio.Lock()

        async def should_send(self, alert: Alert) -> bool:
            """Check if alert should be sent (not a duplicate)."""
            async with self._lock:
                # Clean old entries periodically
                await self._cleanup()

                key = alert.dedup_key
                now = datetime.utcnow()

                if key in self._seen:
                    last_seen = self._seen[key]
                    if now - last_seen < timedelta(seconds=self.window_seconds):
                        logger.debug(f"Deduplicated alert: {key}")
                        return False

                # Record this alert
                self._seen[key] = now
                return True

        async def _cleanup(self) -> None:
            """Remove expired entries from cache."""
            now = datetime.utcnow()
            cutoff = now - timedelta(seconds=self.window_seconds)

            expired = [
                key for key, timestamp in self._seen.items()
                if timestamp < cutoff
            ]

            for key in expired:
                del self._seen[key]

            # If still too large, remove oldest
            if len(self._seen) > self.max_cache_size:
                sorted_keys = sorted(
                    self._seen.keys(),
                    key=lambda k: self._seen[k]
                )
                for key in sorted_keys[:len(self._seen) - self.max_cache_size]:
                    del self._seen[key]

        async def clear(self, dedup_key: Optional[str] = None) -> None:
            """Clear dedup cache."""
            async with self._lock:
                if dedup_key:
                    self._seen.pop(dedup_key, None)
                else:
                    self._seen.clear()

        async def get_suppressed_count(self) -> int:
            """Get count of currently suppressed alerts."""
            async with self._lock:
                return len(self._seen)
    ```
  </action>
  <verify>
    - Duplicate alerts blocked
    - Window respected
    - Cache cleaned up
    - Thread-safe
  </verify>
  <done>Alert deduplication with time window</done>
</task>

<task id="6.3" type="auto" priority="high">
  <name>Slack Integration</name>
  <files>
    - src/meta_agent/alerting/channels/slack.py
  </files>
  <context>
    Send alerts to Slack with rich formatting using blocks.
    Include action buttons for acknowledge/view.
  </context>
  <action>
    Create Slack channel:

    ```python
    # src/meta_agent/alerting/channels/slack.py
    import httpx
    from typing import Optional, List, Dict, Any
    import logging

    from ..detector import Alert, AlertSeverity

    logger = logging.getLogger(__name__)

    class SlackChannel:
        SEVERITY_COLORS = {
            AlertSeverity.INFO: "#36a64f",      # Green
            AlertSeverity.WARNING: "#ffcc00",    # Yellow
            AlertSeverity.CRITICAL: "#ff6600",   # Orange
            AlertSeverity.EMERGENCY: "#ff0000",  # Red
        }

        SEVERITY_EMOJI = {
            AlertSeverity.INFO: "ℹ️",
            AlertSeverity.WARNING: "⚠️",
            AlertSeverity.CRITICAL: "🚨",
            AlertSeverity.EMERGENCY: "🆘",
        }

        def __init__(
            self,
            webhook_url: str,
            channel: Optional[str] = None,
            dashboard_url: Optional[str] = None,
        ):
            self.webhook_url = webhook_url
            self.channel = channel
            self.dashboard_url = dashboard_url or "https://app.agency.ai"

        async def send(self, alert: Alert) -> bool:
            """Send alert to Slack."""
            try:
                payload = self._build_payload(alert)

                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        self.webhook_url,
                        json=payload,
                        timeout=10.0,
                    )
                    response.raise_for_status()

                logger.info(f"Sent Slack alert: {alert.id}")
                return True

            except Exception as e:
                logger.error(f"Failed to send Slack alert: {e}")
                return False

        def _build_payload(self, alert: Alert) -> Dict[str, Any]:
            """Build Slack message payload with blocks."""
            color = self.SEVERITY_COLORS.get(alert.severity, "#808080")
            emoji = self.SEVERITY_EMOJI.get(alert.severity, "🔔")

            blocks = [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"{emoji} {alert.title}",
                        "emoji": True,
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": alert.message,
                    }
                },
                {
                    "type": "context",
                    "elements": [
                        {
                            "type": "mrkdwn",
                            "text": f"*Agent:* {alert.agent_id} | *Severity:* {alert.severity.value.upper()} | *Time:* {alert.created_at.strftime('%Y-%m-%d %H:%M:%S')} UTC"
                        }
                    ]
                },
            ]

            # Add details section if present
            if alert.details:
                detail_text = "\n".join([
                    f"• *{k}:* {v}"
                    for k, v in alert.details.items()
                    if v is not None
                ][:5])  # Limit to 5 details

                blocks.append({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Details:*\n{detail_text}"
                    }
                })

            # Add action buttons
            blocks.append({
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View in Dashboard"},
                        "url": f"{self.dashboard_url}/agents/{alert.agent_id}",
                    },
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "Acknowledge"},
                        "style": "primary",
                        "action_id": f"ack_alert_{alert.id}",
                    }
                ]
            })

            payload = {
                "attachments": [{
                    "color": color,
                    "blocks": blocks,
                }]
            }

            if self.channel:
                payload["channel"] = self.channel

            return payload

        async def send_digest(
            self,
            alerts: List[Alert],
            period: str = "daily",
        ) -> bool:
            """Send alert digest to Slack."""
            if not alerts:
                return True

            by_severity = {}
            for alert in alerts:
                sev = alert.severity.value
                by_severity[sev] = by_severity.get(sev, 0) + 1

            summary = ", ".join([
                f"{count} {sev}"
                for sev, count in by_severity.items()
            ])

            blocks = [
                {
                    "type": "header",
                    "text": {
                        "type": "plain_text",
                        "text": f"📊 {period.title()} Alert Digest",
                    }
                },
                {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"*Total Alerts:* {len(alerts)}\n*Breakdown:* {summary}"
                    }
                },
                {"type": "divider"},
            ]

            # Top alerts by severity
            for alert in sorted(alerts, key=lambda a: a.severity.value)[:5]:
                blocks.append({
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": f"• {self.SEVERITY_EMOJI.get(alert.severity, '🔔')} {alert.title}"
                    }
                })

            payload = {"blocks": blocks}
            if self.channel:
                payload["channel"] = self.channel

            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(self.webhook_url, json=payload)
                    response.raise_for_status()
                return True
            except Exception as e:
                logger.error(f"Failed to send digest: {e}")
                return False
    ```
  </action>
  <verify>
    - Alerts sent to Slack
    - Rich formatting works
    - Buttons rendered
    - Digest works
  </verify>
  <done>Slack integration with rich formatting</done>
</task>

<task id="6.4" type="auto" priority="high">
  <name>Email Integration</name>
  <files>
    - src/meta_agent/alerting/channels/email.py
  </files>
  <context>
    Send alerts via email using SendGrid or SMTP.
    HTML templates for professional appearance.
  </context>
  <action>
    Create email channel:

    ```python
    # src/meta_agent/alerting/channels/email.py
    import httpx
    from typing import List, Optional
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    import logging

    from ..detector import Alert, AlertSeverity

    logger = logging.getLogger(__name__)

    class EmailChannel:
        def __init__(
            self,
            sendgrid_api_key: Optional[str] = None,
            from_email: str = "alerts@agency.ai",
            from_name: str = "MetaAgent Alerts",
        ):
            self.api_key = sendgrid_api_key
            self.from_email = from_email
            self.from_name = from_name

        async def send(
            self,
            alert: Alert,
            recipients: List[str],
        ) -> bool:
            """Send alert email via SendGrid."""
            if not self.api_key:
                logger.warning("SendGrid API key not configured")
                return False

            try:
                html_content = self._build_html(alert)

                payload = {
                    "personalizations": [
                        {"to": [{"email": r} for r in recipients]}
                    ],
                    "from": {
                        "email": self.from_email,
                        "name": self.from_name,
                    },
                    "subject": alert.title,
                    "content": [
                        {"type": "text/html", "value": html_content}
                    ],
                }

                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        "https://api.sendgrid.com/v3/mail/send",
                        json=payload,
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json",
                        },
                        timeout=10.0,
                    )
                    response.raise_for_status()

                logger.info(f"Sent email alert: {alert.id} to {len(recipients)} recipients")
                return True

            except Exception as e:
                logger.error(f"Failed to send email: {e}")
                return False

        def _build_html(self, alert: Alert) -> str:
            """Build HTML email content."""
            severity_colors = {
                AlertSeverity.INFO: "#17a2b8",
                AlertSeverity.WARNING: "#ffc107",
                AlertSeverity.CRITICAL: "#fd7e14",
                AlertSeverity.EMERGENCY: "#dc3545",
            }

            color = severity_colors.get(alert.severity, "#6c757d")

            details_html = ""
            if alert.details:
                details_rows = "\n".join([
                    f"<tr><td style='padding: 8px; border-bottom: 1px solid #eee;'><strong>{k}</strong></td><td style='padding: 8px; border-bottom: 1px solid #eee;'>{v}</td></tr>"
                    for k, v in alert.details.items()
                    if v is not None
                ])
                details_html = f"""
                <h3 style="color: #333; margin-top: 20px;">Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    {details_rows}
                </table>
                """

            return f"""
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: {color}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 20px; border-radius: 0 0 8px 8px; }}
                    .badge {{ display: inline-block; padding: 4px 12px; background: {color}; color: white; border-radius: 4px; font-size: 12px; text-transform: uppercase; }}
                    .button {{ display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin-top: 20px; }}
                    .footer {{ margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0;">{alert.title}</h1>
                    </div>
                    <div class="content">
                        <span class="badge">{alert.severity.value.upper()}</span>
                        <p style="margin-top: 20px; font-size: 16px;">{alert.message}</p>

                        <p><strong>Agent:</strong> {alert.agent_id}</p>
                        <p><strong>Time:</strong> {alert.created_at.strftime('%Y-%m-%d %H:%M:%S')} UTC</p>

                        {details_html}

                        <a href="https://app.agency.ai/agents/{alert.agent_id}" class="button">View in Dashboard</a>

                        <div class="footer">
                            <p>This alert was generated by MetaAgent. <a href="https://app.agency.ai/settings/alerts">Manage alert preferences</a></p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
            """
    ```
  </action>
  <verify>
    - Emails sent via SendGrid
    - HTML renders correctly
    - Recipients configurable
    - Error handling works
  </verify>
  <done>Email channel with SendGrid and HTML templates</done>
</task>

<task id="6.5" type="auto" priority="medium">
  <name>ClickUp Task Creation</name>
  <files>
    - src/meta_agent/alerting/channels/clickup.py
  </files>
  <context>
    Create ClickUp tasks for critical/emergency alerts
    so they can be tracked and assigned.
  </context>
  <action>
    Create ClickUp channel:

    ```python
    # src/meta_agent/alerting/channels/clickup.py
    import httpx
    from typing import Optional
    import logging

    from ..detector import Alert, AlertSeverity

    logger = logging.getLogger(__name__)

    class ClickUpChannel:
        def __init__(
            self,
            api_token: str,
            list_id: str,  # ClickUp list to create tasks in
        ):
            self.api_token = api_token
            self.list_id = list_id
            self.base_url = "https://api.clickup.com/api/v2"

        async def create_task(self, alert: Alert) -> Optional[str]:
            """Create a ClickUp task for an alert."""
            # Only create tasks for critical/emergency
            if alert.severity not in (AlertSeverity.CRITICAL, AlertSeverity.EMERGENCY):
                return None

            try:
                priority_map = {
                    AlertSeverity.EMERGENCY: 1,  # Urgent
                    AlertSeverity.CRITICAL: 2,   # High
                }

                payload = {
                    "name": alert.title,
                    "description": self._build_description(alert),
                    "priority": priority_map.get(alert.severity, 3),
                    "tags": ["metaagent", "alert", alert.alert_type.value],
                    "custom_fields": [
                        # Add custom fields if configured
                    ],
                }

                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{self.base_url}/list/{self.list_id}/task",
                        json=payload,
                        headers={
                            "Authorization": self.api_token,
                            "Content-Type": "application/json",
                        },
                        timeout=10.0,
                    )
                    response.raise_for_status()

                    task_data = response.json()
                    task_id = task_data.get("id")

                logger.info(f"Created ClickUp task {task_id} for alert {alert.id}")
                return task_id

            except Exception as e:
                logger.error(f"Failed to create ClickUp task: {e}")
                return None

        def _build_description(self, alert: Alert) -> str:
            """Build task description from alert."""
            details = "\n".join([
                f"- **{k}**: {v}"
                for k, v in alert.details.items()
                if v is not None
            ])

            return f"""
## Alert Details

{alert.message}

**Agent ID:** {alert.agent_id}
**Alert Type:** {alert.alert_type.value}
**Severity:** {alert.severity.value}
**Time:** {alert.created_at.isoformat()}

### Additional Details
{details}

---
*Auto-created by MetaAgent*
[View in Dashboard](https://app.agency.ai/agents/{alert.agent_id})
            """
    ```
  </action>
  <verify>
    - Tasks created in ClickUp
    - Priority set correctly
    - Description formatted
    - Only critical/emergency creates tasks
  </verify>
  <done>ClickUp integration for task creation</done>
</task>

<task id="6.6" type="auto" priority="high">
  <name>Alert Manager and Router</name>
  <files>
    - src/meta_agent/alerting/manager.py
  </files>
  <context>
    Central manager that coordinates alert detection, deduplication,
    and routing to appropriate channels.
  </context>
  <action>
    Create alert manager:

    ```python
    # src/meta_agent/alerting/manager.py
    from typing import Optional, List, Dict, Any
    from datetime import datetime, timedelta
    import logging

    from .detector import Alert, AlertDetector, AlertType, AlertSeverity
    from .deduplicator import AlertDeduplicator
    from .channels.slack import SlackChannel
    from .channels.email import EmailChannel
    from .channels.clickup import ClickUpChannel
    from ..db.client import Database

    logger = logging.getLogger(__name__)

    class AlertManager:
        def __init__(
            self,
            database: Database,
            slack: Optional[SlackChannel] = None,
            email: Optional[EmailChannel] = None,
            clickup: Optional[ClickUpChannel] = None,
            dedup_window_seconds: int = 3600,
        ):
            self.db = database
            self.detector = AlertDetector()
            self.deduplicator = AlertDeduplicator(dedup_window_seconds)

            self.slack = slack
            self.email = email
            self.clickup = clickup

        async def process_alert(
            self,
            alert: Alert,
            email_recipients: Optional[List[str]] = None,
        ) -> bool:
            """Process and route an alert."""
            # Check deduplication
            if not await self.deduplicator.should_send(alert):
                logger.debug(f"Alert deduplicated: {alert.dedup_key}")
                return False

            # Store in database
            await self._store_alert(alert)

            # Route to channels based on severity
            success = True

            # Always send critical+ to Slack
            if self.slack and alert.severity in (
                AlertSeverity.WARNING,
                AlertSeverity.CRITICAL,
                AlertSeverity.EMERGENCY,
            ):
                if not await self.slack.send(alert):
                    success = False

            # Email for critical+
            if self.email and email_recipients and alert.severity in (
                AlertSeverity.CRITICAL,
                AlertSeverity.EMERGENCY,
            ):
                if not await self.email.send(alert, email_recipients):
                    success = False

            # ClickUp for critical+
            if self.clickup and alert.severity in (
                AlertSeverity.CRITICAL,
                AlertSeverity.EMERGENCY,
            ):
                task_id = await self.clickup.create_task(alert)
                if task_id:
                    await self._update_alert_metadata(alert.id, {"clickup_task_id": task_id})

            return success

        async def _store_alert(self, alert: Alert) -> None:
            """Store alert in database."""
            await self.db.execute(
                """
                INSERT INTO alert_history (
                    id, organization_id, agent_id, alert_type, severity,
                    title, message, details, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                alert.id,
                alert.organization_id,
                alert.agent_id,
                alert.alert_type.value,
                alert.severity.value,
                alert.title,
                alert.message,
                alert.details,
                alert.created_at,
            )

        async def _update_alert_metadata(
            self,
            alert_id: str,
            metadata: Dict[str, Any],
        ) -> None:
            """Update alert metadata."""
            await self.db.execute(
                """
                UPDATE alert_history
                SET metadata = metadata || $2
                WHERE id = $1
                """,
                alert_id,
                metadata,
            )

        async def acknowledge(
            self,
            alert_id: str,
            user_id: str,
        ) -> bool:
            """Acknowledge an alert."""
            result = await self.db.execute(
                """
                UPDATE alert_history
                SET acknowledged_at = NOW(),
                    acknowledged_by = $2
                WHERE id = $1 AND acknowledged_at IS NULL
                RETURNING id
                """,
                alert_id,
                user_id,
            )
            return result is not None

        async def resolve(
            self,
            alert_id: str,
            user_id: str,
            resolution_note: Optional[str] = None,
        ) -> bool:
            """Resolve an alert."""
            result = await self.db.execute(
                """
                UPDATE alert_history
                SET resolved_at = NOW(),
                    resolved_by = $2,
                    resolution_note = $3
                WHERE id = $1 AND resolved_at IS NULL
                RETURNING id
                """,
                alert_id,
                user_id,
                resolution_note,
            )
            return result is not None

        async def get_active_alerts(
            self,
            organization_id: str,
            limit: int = 100,
        ) -> List[Dict[str, Any]]:
            """Get unresolved alerts for an organization."""
            return await self.db.fetch_all(
                """
                SELECT * FROM alert_history
                WHERE organization_id = $1
                  AND resolved_at IS NULL
                ORDER BY created_at DESC
                LIMIT $2
                """,
                organization_id,
                limit,
            )

        async def send_daily_digest(
            self,
            organization_id: str,
            email_recipients: List[str],
        ) -> None:
            """Send daily alert digest."""
            # Get alerts from last 24 hours
            yesterday = datetime.utcnow() - timedelta(days=1)

            alerts = await self.db.fetch_all(
                """
                SELECT * FROM alert_history
                WHERE organization_id = $1
                  AND created_at >= $2
                ORDER BY severity DESC, created_at DESC
                """,
                organization_id,
                yesterday,
            )

            if not alerts:
                logger.info(f"No alerts for digest: {organization_id}")
                return

            # Convert to Alert objects
            alert_objs = [
                Alert(
                    id=a["id"],
                    organization_id=a["organization_id"],
                    agent_id=a["agent_id"],
                    alert_type=AlertType(a["alert_type"]),
                    severity=AlertSeverity(a["severity"]),
                    title=a["title"],
                    message=a["message"],
                    details=a["details"] or {},
                    created_at=a["created_at"],
                )
                for a in alerts
            ]

            # Send via Slack
            if self.slack:
                await self.slack.send_digest(alert_objs, "daily")
    ```
  </action>
  <verify>
    - Alerts routed correctly
    - Deduplication works
    - Database storage works
    - Acknowledge/resolve works
    - Digest works
  </verify>
  <done>Alert manager with routing and persistence</done>
</task>

<task id="6.7" type="auto" priority="medium">
  <name>Alert API Endpoints</name>
  <files>
    - src/meta_agent/api/routes/alerts.py
  </files>
  <context>
    API endpoints for viewing and managing alerts.
  </context>
  <action>
    Create API endpoints:

    ```python
    # src/meta_agent/api/routes/alerts.py
    from fastapi import APIRouter, Depends, Query
    from typing import List, Optional
    from pydantic import BaseModel
    from datetime import datetime

    from ...alerting.manager import AlertManager
    from ..deps import get_alert_manager, get_current_user

    router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])

    class AlertResponse(BaseModel):
        id: str
        agent_id: str
        alert_type: str
        severity: str
        title: str
        message: str
        created_at: datetime
        acknowledged_at: Optional[datetime]
        acknowledged_by: Optional[str]
        resolved_at: Optional[datetime]

    class AcknowledgeRequest(BaseModel):
        pass  # Empty, user from auth

    class ResolveRequest(BaseModel):
        note: Optional[str] = None

    @router.get("/", response_model=List[AlertResponse])
    async def list_alerts(
        resolved: bool = Query(False, description="Include resolved alerts"),
        severity: Optional[str] = Query(None, description="Filter by severity"),
        agent_id: Optional[str] = Query(None, description="Filter by agent"),
        limit: int = Query(100, le=500),
        manager: AlertManager = Depends(get_alert_manager),
        user = Depends(get_current_user),
    ):
        """List alerts for the organization."""
        alerts = await manager.get_active_alerts(
            user.organization_id,
            limit=limit,
        )
        return alerts

    @router.post("/{alert_id}/acknowledge")
    async def acknowledge_alert(
        alert_id: str,
        manager: AlertManager = Depends(get_alert_manager),
        user = Depends(get_current_user),
    ):
        """Acknowledge an alert."""
        success = await manager.acknowledge(alert_id, user.id)
        if not success:
            return {"error": "Alert not found or already acknowledged"}
        return {"status": "acknowledged", "alert_id": alert_id}

    @router.post("/{alert_id}/resolve")
    async def resolve_alert(
        alert_id: str,
        request: ResolveRequest,
        manager: AlertManager = Depends(get_alert_manager),
        user = Depends(get_current_user),
    ):
        """Resolve an alert."""
        success = await manager.resolve(alert_id, user.id, request.note)
        if not success:
            return {"error": "Alert not found or already resolved"}
        return {"status": "resolved", "alert_id": alert_id}

    @router.get("/stats")
    async def get_alert_stats(
        manager: AlertManager = Depends(get_alert_manager),
        user = Depends(get_current_user),
    ):
        """Get alert statistics."""
        # Would implement stats queries
        return {
            "total_active": 0,
            "by_severity": {},
            "by_type": {},
        }
    ```
  </action>
  <verify>
    - List endpoint works
    - Acknowledge endpoint works
    - Resolve endpoint works
    - Stats endpoint works
  </verify>
  <done>Alert API endpoints</done>
</task>

---

## Phase Exit Criteria

- [ ] All alert types detected
- [ ] Deduplication working (1 hour window)
- [ ] Slack alerts with rich formatting
- [ ] Email alerts with HTML
- [ ] ClickUp tasks for critical
- [ ] Acknowledge/resolve API working
- [ ] Daily digest working
- [ ] Critical alerts < 1 minute delivery
- [ ] Tests passing

## Files Created

- `src/meta_agent/alerting/__init__.py`
- `src/meta_agent/alerting/detector.py`
- `src/meta_agent/alerting/deduplicator.py`
- `src/meta_agent/alerting/manager.py`
- `src/meta_agent/alerting/channels/slack.py`
- `src/meta_agent/alerting/channels/email.py`
- `src/meta_agent/alerting/channels/clickup.py`
- `src/meta_agent/api/routes/alerts.py`
