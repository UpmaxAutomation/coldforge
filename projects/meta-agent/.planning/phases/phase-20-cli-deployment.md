# Phase 20: CLI & Deployment

## Overview
Build a command-line interface for MetaAgent operations and create production deployment configurations with Docker, Kubernetes, and infrastructure as code.

## Dependencies
- All previous phases (CLI provides interface to all features)
- Phase 18: Dashboard API (CLI commands use same endpoints)
- Phase 19: External Integrations (CLI can manage integrations)

## Tasks

### Task 20.1: CLI Framework and Core Commands

<task type="auto">
  <name>Create CLI framework with Click and core commands</name>
  <files>src/meta_agent/cli/__init__.py, src/meta_agent/cli/main.py, src/meta_agent/cli/config.py</files>
  <action>
Build the CLI framework using Click with configuration management.

```python
# src/meta_agent/cli/__init__.py
"""MetaAgent CLI - Command-line interface for AI agent governance."""

from .main import cli

__all__ = ["cli"]
```

```python
# src/meta_agent/cli/config.py
import os
import json
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class CLIConfig:
    """CLI configuration."""
    api_url: str = "http://localhost:8000"
    api_key: Optional[str] = None
    output_format: str = "table"  # table, json, yaml
    color: bool = True
    verbose: bool = False

    # Default paths
    config_dir: str = field(default_factory=lambda: str(Path.home() / ".metaagent"))

    def __post_init__(self):
        # Ensure config directory exists
        Path(self.config_dir).mkdir(parents=True, exist_ok=True)


def get_config_path() -> Path:
    """Get the config file path."""
    config_dir = os.environ.get("METAAGENT_CONFIG_DIR", str(Path.home() / ".metaagent"))
    return Path(config_dir) / "config.json"


def load_config() -> CLIConfig:
    """Load configuration from file and environment."""
    config = CLIConfig()
    config_path = get_config_path()

    # Load from file if exists
    if config_path.exists():
        with open(config_path) as f:
            data = json.load(f)
            for key, value in data.items():
                if hasattr(config, key):
                    setattr(config, key, value)

    # Override with environment variables
    if os.environ.get("METAAGENT_API_URL"):
        config.api_url = os.environ["METAAGENT_API_URL"]
    if os.environ.get("METAAGENT_API_KEY"):
        config.api_key = os.environ["METAAGENT_API_KEY"]
    if os.environ.get("METAAGENT_OUTPUT_FORMAT"):
        config.output_format = os.environ["METAAGENT_OUTPUT_FORMAT"]

    return config


def save_config(config: CLIConfig):
    """Save configuration to file."""
    config_path = get_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)

    with open(config_path, "w") as f:
        json.dump(asdict(config), f, indent=2)
```

```python
# src/meta_agent/cli/main.py
import click
import json
import sys
from typing import Optional
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich import print as rprint

from .config import load_config, save_config, CLIConfig


console = Console()


class Context:
    """CLI context object."""

    def __init__(self):
        self.config = load_config()
        self.verbose = False

    def log(self, message: str):
        """Log verbose message."""
        if self.verbose:
            console.print(f"[dim]{message}[/dim]")

    def output(self, data, format: Optional[str] = None):
        """Output data in configured format."""
        fmt = format or self.config.output_format

        if fmt == "json":
            click.echo(json.dumps(data, indent=2, default=str))
        elif fmt == "yaml":
            import yaml
            click.echo(yaml.dump(data, default_flow_style=False))
        else:
            # Default to pretty print
            rprint(data)


pass_context = click.make_pass_decorator(Context, ensure=True)


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose output")
@click.option("--format", "-f", type=click.Choice(["table", "json", "yaml"]), help="Output format")
@click.option("--api-url", envvar="METAAGENT_API_URL", help="API server URL")
@click.version_option(version="0.1.0", prog_name="metaagent")
@pass_context
def cli(ctx: Context, verbose: bool, format: Optional[str], api_url: Optional[str]):
    """MetaAgent CLI - AI Agent Governance System.

    Manage, monitor, and improve AI agents from the command line.
    """
    ctx.verbose = verbose or ctx.config.verbose

    if format:
        ctx.config.output_format = format
    if api_url:
        ctx.config.api_url = api_url


# ==================== CONFIG COMMANDS ====================

@cli.group()
def config():
    """Manage CLI configuration."""
    pass


@config.command("show")
@pass_context
def config_show(ctx: Context):
    """Show current configuration."""
    table = Table(title="MetaAgent Configuration")
    table.add_column("Setting", style="cyan")
    table.add_column("Value", style="green")

    table.add_row("API URL", ctx.config.api_url)
    table.add_row("API Key", "***" if ctx.config.api_key else "Not set")
    table.add_row("Output Format", ctx.config.output_format)
    table.add_row("Color", str(ctx.config.color))
    table.add_row("Verbose", str(ctx.config.verbose))
    table.add_row("Config Dir", ctx.config.config_dir)

    console.print(table)


@config.command("set")
@click.argument("key")
@click.argument("value")
@pass_context
def config_set(ctx: Context, key: str, value: str):
    """Set a configuration value."""
    if not hasattr(ctx.config, key):
        raise click.ClickException(f"Unknown configuration key: {key}")

    # Type conversion
    if key in ("verbose", "color"):
        value = value.lower() in ("true", "1", "yes")

    setattr(ctx.config, key, value)
    save_config(ctx.config)
    console.print(f"[green]Set {key} = {value}[/green]")


@config.command("init")
@click.option("--api-url", prompt="API URL", default="http://localhost:8000")
@click.option("--api-key", prompt="API Key (optional)", default="", hide_input=True)
@pass_context
def config_init(ctx: Context, api_url: str, api_key: str):
    """Initialize CLI configuration interactively."""
    ctx.config.api_url = api_url
    if api_key:
        ctx.config.api_key = api_key

    save_config(ctx.config)
    console.print("[green]Configuration saved![/green]")


# ==================== STATUS COMMANDS ====================

@cli.command()
@pass_context
def status(ctx: Context):
    """Show system status and health."""
    from .api_client import APIClient

    client = APIClient(ctx.config)

    try:
        health = client.get("/dashboard/health")

        # Status panel
        status_color = {
            "healthy": "green",
            "degraded": "yellow",
            "critical": "red",
        }.get(health["status"], "white")

        panel = Panel(
            f"[bold {status_color}]{health['status'].upper()}[/bold {status_color}]",
            title="System Status",
        )
        console.print(panel)

        # Agent summary
        table = Table(title="Agent Summary")
        table.add_column("Status", style="cyan")
        table.add_column("Count", justify="right")

        table.add_row("Healthy", str(health["healthy_agents"]), style="green")
        table.add_row("Warning", str(health["warning_agents"]), style="yellow")
        table.add_row("Critical", str(health["critical_agents"]), style="red")
        table.add_row("Total", str(health["total_agents"]), style="bold")

        console.print(table)

        # Additional stats
        console.print(f"\nActive Problems: {health['active_problems']}")
        console.print(f"Pending Proposals: {health['pending_proposals']}")
        console.print(f"Active Experiments: {health['active_experiments']}")

    except Exception as e:
        console.print(f"[red]Error connecting to API: {e}[/red]")
        sys.exit(1)


# ==================== AGENT COMMANDS ====================

@cli.group()
def agent():
    """Manage agents."""
    pass


@agent.command("list")
@click.option("--status", type=click.Choice(["healthy", "warning", "critical", "inactive"]))
@pass_context
def agent_list(ctx: Context, status: Optional[str]):
    """List all agents."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    agents = client.get("/dashboard/agents/summary")

    if status:
        agents = [a for a in agents if a["status"] == status]

    if ctx.config.output_format == "json":
        ctx.output(agents)
        return

    table = Table(title="Agents")
    table.add_column("Name", style="cyan")
    table.add_column("Status")
    table.add_column("Executions", justify="right")
    table.add_column("Success Rate", justify="right")
    table.add_column("Avg Latency", justify="right")

    for a in agents:
        status_style = {
            "healthy": "green",
            "warning": "yellow",
            "critical": "red",
            "inactive": "dim",
        }.get(a["status"], "white")

        table.add_row(
            a["agent_name"],
            f"[{status_style}]{a['status']}[/{status_style}]",
            str(a["total_executions"]),
            f"{a['success_rate']*100:.1f}%",
            f"{a['avg_latency_ms']:.0f}ms",
        )

    console.print(table)


@agent.command("show")
@click.argument("agent_id")
@pass_context
def agent_show(ctx: Context, agent_id: str):
    """Show agent details."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    agent = client.get(f"/agents/{agent_id}")

    ctx.output(agent)


@agent.command("executions")
@click.argument("agent_id")
@click.option("--limit", default=20, help="Number of executions to show")
@pass_context
def agent_executions(ctx: Context, agent_id: str, limit: int):
    """Show recent executions for an agent."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    executions = client.get(f"/executions", params={"agent_id": agent_id, "limit": limit})

    if ctx.config.output_format == "json":
        ctx.output(executions)
        return

    table = Table(title=f"Recent Executions")
    table.add_column("ID", style="dim")
    table.add_column("Status")
    table.add_column("Latency", justify="right")
    table.add_column("Cost", justify="right")
    table.add_column("Time")

    for e in executions:
        status_style = "green" if e.get("passed") else "red"
        table.add_row(
            e["id"][:8],
            f"[{status_style}]{'pass' if e.get('passed') else 'fail'}[/{status_style}]",
            f"{e.get('latency_ms', 0):.0f}ms",
            f"${e.get('total_cost', 0):.4f}",
            e.get("started_at", "")[:19],
        )

    console.print(table)


# ==================== DEPLOYMENT COMMANDS ====================

@cli.group()
def deploy():
    """Manage deployments."""
    pass


@deploy.command("canary")
@click.argument("agent_id")
@click.argument("version_id")
@click.option("--initial-percent", default=5, help="Initial traffic percentage")
@pass_context
def deploy_canary(ctx: Context, agent_id: str, version_id: str, initial_percent: int):
    """Start a canary deployment."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    result = client.post(f"/deployments/canary", json={
        "agent_id": agent_id,
        "new_version_id": version_id,
        "initial_percentage": initial_percent,
    })

    console.print(f"[green]Canary deployment started: {result['id']}[/green]")
    ctx.output(result)


@deploy.command("status")
@click.argument("deployment_id")
@pass_context
def deploy_status(ctx: Context, deployment_id: str):
    """Show deployment status."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    status = client.get(f"/deployments/{deployment_id}")

    ctx.output(status)


@deploy.command("promote")
@click.argument("deployment_id")
@click.confirmation_option(prompt="Are you sure you want to promote to 100%?")
@pass_context
def deploy_promote(ctx: Context, deployment_id: str):
    """Promote a canary deployment to full traffic."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    result = client.post(f"/deployments/{deployment_id}/promote")

    console.print(f"[green]Deployment promoted![/green]")


@deploy.command("rollback")
@click.argument("deployment_id")
@click.option("--reason", required=True, help="Reason for rollback")
@pass_context
def deploy_rollback(ctx: Context, deployment_id: str, reason: str):
    """Rollback a deployment."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    result = client.post(f"/deployments/{deployment_id}/rollback", json={"reason": reason})

    console.print(f"[yellow]Deployment rolled back![/yellow]")


# ==================== KNOWLEDGE COMMANDS ====================

@cli.group()
def knowledge():
    """Manage knowledge base."""
    pass


@knowledge.command("search")
@click.argument("query")
@click.option("--limit", default=10)
@pass_context
def knowledge_search(ctx: Context, query: str, limit: int):
    """Search the knowledge base."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    results = client.post("/knowledge/search", json={
        "query": query,
        "limit": limit,
    })

    if ctx.config.output_format == "json":
        ctx.output(results)
        return

    for r in results:
        console.print(Panel(
            f"[bold]{r['entry']['title']}[/bold]\n\n{r['entry']['description']}\n\n"
            f"[dim]Type: {r['entry']['knowledge_type']} | Score: {r['similarity_score']:.2f}[/dim]",
        ))


@knowledge.command("extract")
@click.option("--agent-id", help="Extract for specific agent")
@click.option("--days", default=7, help="Lookback days")
@pass_context
def knowledge_extract(ctx: Context, agent_id: Optional[str], days: int):
    """Run knowledge extraction."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    result = client.post("/knowledge/extract", json={
        "agent_id": agent_id,
        "lookback_days": days,
    })

    console.print(f"[green]Extraction complete![/green]")
    console.print(f"Patterns extracted: {result['patterns_extracted']}")
    console.print(f"Lessons extracted: {result['lessons_extracted']}")


# ==================== INTEGRATION COMMANDS ====================

@cli.group()
def integration():
    """Manage integrations."""
    pass


@integration.command("list")
@pass_context
def integration_list(ctx: Context):
    """List all integrations."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    integrations = client.get("/integrations")

    if ctx.config.output_format == "json":
        ctx.output(integrations)
        return

    table = Table(title="Integrations")
    table.add_column("Name", style="cyan")
    table.add_column("Provider")
    table.add_column("Status")
    table.add_column("Events")

    for i in integrations:
        status_style = "green" if i["status"] == "active" else "yellow"
        table.add_row(
            i["name"],
            i["provider"],
            f"[{status_style}]{i['status']}[/{status_style}]",
            str(len(i["subscribed_events"])),
        )

    console.print(table)


@integration.command("test")
@click.argument("integration_id")
@pass_context
def integration_test(ctx: Context, integration_id: str):
    """Test an integration connection."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    result = client.post(f"/integrations/{integration_id}/test")

    if result["status"] == "success":
        console.print(f"[green]✓ Connection test successful[/green]")
    else:
        console.print(f"[red]✗ Connection test failed: {result.get('message')}[/red]")


# ==================== METRICS COMMANDS ====================

@cli.group()
def metrics():
    """View metrics and analytics."""
    pass


@metrics.command("summary")
@click.option("--time-range", default="24h", type=click.Choice(["1h", "6h", "24h", "7d", "30d"]))
@pass_context
def metrics_summary(ctx: Context, time_range: str):
    """Show execution metrics summary."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    summary = client.get("/dashboard/executions/summary", params={"time_range": time_range})

    if ctx.config.output_format == "json":
        ctx.output(summary)
        return

    table = Table(title=f"Execution Summary ({time_range})")
    table.add_column("Metric", style="cyan")
    table.add_column("Value", justify="right")

    table.add_row("Total Executions", str(summary["total_executions"]))
    table.add_row("Successful", str(summary["successful_executions"]))
    table.add_row("Failed", str(summary["failed_executions"]))
    table.add_row("Success Rate", f"{summary['success_rate']*100:.1f}%")
    table.add_row("Avg Latency", f"{summary['avg_latency_ms']:.0f}ms")
    table.add_row("P95 Latency", f"{summary['p95_latency_ms']:.0f}ms")
    table.add_row("Total Cost", f"${summary['total_cost']:.2f}")

    console.print(table)


@metrics.command("costs")
@click.option("--time-range", default="24h")
@click.option("--group-by", default="agent", type=click.Choice(["agent", "model"]))
@pass_context
def metrics_costs(ctx: Context, time_range: str, group_by: str):
    """Show cost breakdown."""
    from .api_client import APIClient

    client = APIClient(ctx.config)
    costs = client.get("/dashboard/costs/breakdown", params={
        "time_range": time_range,
        "group_by": group_by,
    })

    if ctx.config.output_format == "json":
        ctx.output(costs)
        return

    table = Table(title=f"Cost Breakdown by {group_by.title()}")
    table.add_column(group_by.title(), style="cyan")
    table.add_column("Cost", justify="right")
    table.add_column("%", justify="right")
    table.add_column("Executions", justify="right")

    for c in costs["breakdown"]:
        table.add_row(
            c["name"],
            f"${c['cost']:.2f}",
            f"{c['percentage']:.1f}%",
            str(c["execution_count"]),
        )

    console.print(table)


# Entry point
def main():
    cli()


if __name__ == "__main__":
    main()
```
  </action>
  <verify>
    - CLI framework with Click
    - Configuration management
    - Status, agent, deploy, knowledge, integration, metrics command groups
    - Rich output with tables and panels
    - JSON/YAML output formats
  </verify>
  <done>CLI framework with core commands and configuration management complete</done>
</task>

### Task 20.2: API Client for CLI

<task type="auto">
  <name>Create HTTP client for CLI to communicate with API</name>
  <files>src/meta_agent/cli/api_client.py</files>
  <action>
Build an HTTP client wrapper for CLI commands.

```python
# src/meta_agent/cli/api_client.py
import httpx
from typing import Optional, Any
from urllib.parse import urljoin

from .config import CLIConfig


class APIError(Exception):
    """API request error."""

    def __init__(self, status_code: int, message: str, details: Optional[dict] = None):
        self.status_code = status_code
        self.message = message
        self.details = details or {}
        super().__init__(f"API Error {status_code}: {message}")


class APIClient:
    """HTTP client for MetaAgent API."""

    def __init__(self, config: CLIConfig, timeout: float = 30.0):
        self.base_url = config.api_url.rstrip("/")
        self.api_key = config.api_key
        self.timeout = timeout

        self._client = httpx.Client(timeout=timeout)

    def _get_headers(self) -> dict:
        """Get request headers."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        return headers

    def _build_url(self, path: str) -> str:
        """Build full URL from path."""
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base_url}/api/v1{path}"

    def _handle_response(self, response: httpx.Response) -> Any:
        """Handle API response."""
        if response.status_code >= 400:
            try:
                error_data = response.json()
                message = error_data.get("detail", error_data.get("message", "Unknown error"))
                details = error_data.get("errors", {})
            except Exception:
                message = response.text or f"HTTP {response.status_code}"
                details = {}

            raise APIError(response.status_code, message, details)

        if response.status_code == 204:
            return None

        try:
            return response.json()
        except Exception:
            return response.text

    def get(self, path: str, params: Optional[dict] = None) -> Any:
        """Make GET request."""
        response = self._client.get(
            self._build_url(path),
            headers=self._get_headers(),
            params=params,
        )
        return self._handle_response(response)

    def post(self, path: str, json: Optional[dict] = None, data: Optional[dict] = None) -> Any:
        """Make POST request."""
        response = self._client.post(
            self._build_url(path),
            headers=self._get_headers(),
            json=json,
            data=data,
        )
        return self._handle_response(response)

    def put(self, path: str, json: Optional[dict] = None) -> Any:
        """Make PUT request."""
        response = self._client.put(
            self._build_url(path),
            headers=self._get_headers(),
            json=json,
        )
        return self._handle_response(response)

    def patch(self, path: str, json: Optional[dict] = None) -> Any:
        """Make PATCH request."""
        response = self._client.patch(
            self._build_url(path),
            headers=self._get_headers(),
            json=json,
        )
        return self._handle_response(response)

    def delete(self, path: str) -> Any:
        """Make DELETE request."""
        response = self._client.delete(
            self._build_url(path),
            headers=self._get_headers(),
        )
        return self._handle_response(response)

    def close(self):
        """Close the client."""
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class AsyncAPIClient:
    """Async HTTP client for MetaAgent API."""

    def __init__(self, config: CLIConfig, timeout: float = 30.0):
        self.base_url = config.api_url.rstrip("/")
        self.api_key = config.api_key
        self.timeout = timeout

        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout)
        return self._client

    def _get_headers(self) -> dict:
        """Get request headers."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        return headers

    def _build_url(self, path: str) -> str:
        """Build full URL from path."""
        if not path.startswith("/"):
            path = "/" + path
        return f"{self.base_url}/api/v1{path}"

    def _handle_response(self, response: httpx.Response) -> Any:
        """Handle API response."""
        if response.status_code >= 400:
            try:
                error_data = response.json()
                message = error_data.get("detail", error_data.get("message", "Unknown error"))
                details = error_data.get("errors", {})
            except Exception:
                message = response.text or f"HTTP {response.status_code}"
                details = {}

            raise APIError(response.status_code, message, details)

        if response.status_code == 204:
            return None

        try:
            return response.json()
        except Exception:
            return response.text

    async def get(self, path: str, params: Optional[dict] = None) -> Any:
        """Make async GET request."""
        client = await self._get_client()
        response = await client.get(
            self._build_url(path),
            headers=self._get_headers(),
            params=params,
        )
        return self._handle_response(response)

    async def post(self, path: str, json: Optional[dict] = None) -> Any:
        """Make async POST request."""
        client = await self._get_client()
        response = await client.post(
            self._build_url(path),
            headers=self._get_headers(),
            json=json,
        )
        return self._handle_response(response)

    async def put(self, path: str, json: Optional[dict] = None) -> Any:
        """Make async PUT request."""
        client = await self._get_client()
        response = await client.put(
            self._build_url(path),
            headers=self._get_headers(),
            json=json,
        )
        return self._handle_response(response)

    async def delete(self, path: str) -> Any:
        """Make async DELETE request."""
        client = await self._get_client()
        response = await client.delete(
            self._build_url(path),
            headers=self._get_headers(),
        )
        return self._handle_response(response)

    async def close(self):
        """Close the client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
```
  </action>
  <verify>
    - Sync and async HTTP clients
    - Error handling with APIError
    - Bearer token authentication
    - All HTTP methods supported
    - Context manager support
  </verify>
  <done>API client for CLI with sync and async support complete</done>
</task>

### Task 20.3: Docker Configuration

<task type="auto">
  <name>Create Docker and Docker Compose configurations</name>
  <files>Dockerfile, docker-compose.yml, docker-compose.prod.yml, .dockerignore</files>
  <action>
Create production-ready Docker configurations.

```dockerfile
# Dockerfile
# Multi-stage build for MetaAgent

# ==================== Builder Stage ====================
FROM python:3.11-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install poetry
RUN pip install poetry==1.7.1

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Export requirements
RUN poetry export -f requirements.txt --output requirements.txt --without-hashes

# Install dependencies
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /app/wheels -r requirements.txt


# ==================== Production Stage ====================
FROM python:3.11-slim as production

# Labels
LABEL org.opencontainers.image.source="https://github.com/org/meta-agent"
LABEL org.opencontainers.image.description="MetaAgent - AI Agent Governance System"
LABEL org.opencontainers.image.version="0.1.0"

# Environment
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    APP_ENV=production

WORKDIR /app

# Create non-root user
RUN groupadd --gid 1000 metaagent && \
    useradd --uid 1000 --gid 1000 --shell /bin/bash --create-home metaagent

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy wheels from builder
COPY --from=builder /app/wheels /wheels
COPY --from=builder /app/requirements.txt .

# Install dependencies
RUN pip install --no-cache /wheels/*

# Copy application code
COPY --chown=metaagent:metaagent src/ ./src/
COPY --chown=metaagent:metaagent migrations/ ./migrations/
COPY --chown=metaagent:metaagent alembic.ini ./

# Create necessary directories
RUN mkdir -p /app/logs /app/data && \
    chown -R metaagent:metaagent /app/logs /app/data

# Switch to non-root user
USER metaagent

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Default command
CMD ["uvicorn", "meta_agent.api.main:app", "--host", "0.0.0.0", "--port", "8000"]


# ==================== Development Stage ====================
FROM production as development

USER root

# Install development dependencies
RUN pip install pytest pytest-asyncio pytest-cov httpx black isort mypy

USER metaagent

# Development command with reload
CMD ["uvicorn", "meta_agent.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

```yaml
# docker-compose.yml
# Development environment

version: '3.8'

services:
  api:
    build:
      context: .
      target: development
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://metaagent:metaagent@db:5432/metaagent
      - REDIS_URL=redis://redis:6379/0
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - LOG_LEVEL=DEBUG
      - APP_ENV=development
    volumes:
      - ./src:/app/src
      - ./tests:/app/tests
      - ./migrations:/app/migrations
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    networks:
      - metaagent-network

  db:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_USER=metaagent
      - POSTGRES_PASSWORD=metaagent
      - POSTGRES_DB=metaagent
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U metaagent"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - metaagent-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - metaagent-network

  # Background worker for async tasks
  worker:
    build:
      context: .
      target: development
    command: python -m meta_agent.worker
    environment:
      - DATABASE_URL=postgresql://metaagent:metaagent@db:5432/metaagent
      - REDIS_URL=redis://redis:6379/0
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./src:/app/src
    depends_on:
      - db
      - redis
    networks:
      - metaagent-network

volumes:
  postgres-data:
  redis-data:

networks:
  metaagent-network:
    driver: bridge
```

```yaml
# docker-compose.prod.yml
# Production environment

version: '3.8'

services:
  api:
    image: ghcr.io/org/meta-agent:${VERSION:-latest}
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
        reservations:
          cpus: '0.5'
          memory: 1G
      update_config:
        parallelism: 1
        delay: 10s
        failure_action: rollback
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - LOG_LEVEL=INFO
      - APP_ENV=production
      - SENTRY_DSN=${SENTRY_DSN}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - metaagent-network
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  worker:
    image: ghcr.io/org/meta-agent:${VERSION:-latest}
    command: python -m meta_agent.worker
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 2G
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - LOG_LEVEL=INFO
      - APP_ENV=production
    networks:
      - metaagent-network

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    networks:
      - metaagent-network

networks:
  metaagent-network:
    driver: overlay
    attachable: true
```

```text
# .dockerignore
# Git
.git
.gitignore

# Python
__pycache__
*.py[cod]
*$py.class
*.so
.Python
.venv
venv/
ENV/
.eggs/
*.egg-info/
.mypy_cache/
.pytest_cache/
.coverage
htmlcov/

# IDE
.idea/
.vscode/
*.swp
*.swo

# Docker
Dockerfile*
docker-compose*.yml
.docker/

# Documentation
docs/
*.md
!README.md

# Tests
tests/
.pytest_cache/

# Local config
.env
.env.*
*.local

# Build artifacts
dist/
build/
*.egg

# Logs
logs/
*.log

# Misc
.DS_Store
Thumbs.db
```
  </action>
  <verify>
    - Multi-stage Dockerfile with builder and production stages
    - Non-root user for security
    - Health checks configured
    - docker-compose.yml for development
    - docker-compose.prod.yml for production with scaling
    - .dockerignore for efficient builds
  </verify>
  <done>Docker and Docker Compose configurations for dev and prod complete</done>
</task>

### Task 20.4: Kubernetes Deployment

<task type="auto">
  <name>Create Kubernetes manifests for deployment</name>
  <files>k8s/namespace.yaml, k8s/deployment.yaml, k8s/service.yaml, k8s/configmap.yaml, k8s/secrets.yaml, k8s/ingress.yaml, k8s/hpa.yaml</files>
  <action>
Create Kubernetes deployment manifests.

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: metaagent
  labels:
    app: metaagent
    environment: production
```

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: metaagent-config
  namespace: metaagent
data:
  APP_ENV: "production"
  LOG_LEVEL: "INFO"
  LOG_FORMAT: "json"

  # API settings
  API_HOST: "0.0.0.0"
  API_PORT: "8000"
  API_WORKERS: "4"

  # Feature flags
  ENABLE_METRICS: "true"
  ENABLE_TRACING: "true"

  # Rate limiting
  RATE_LIMIT_PER_MINUTE: "100"
```

```yaml
# k8s/secrets.yaml
# NOTE: In production, use external secret management (Vault, AWS Secrets Manager, etc.)
apiVersion: v1
kind: Secret
metadata:
  name: metaagent-secrets
  namespace: metaagent
type: Opaque
stringData:
  DATABASE_URL: "postgresql://user:pass@host:5432/metaagent"
  REDIS_URL: "redis://redis:6379/0"
  OPENAI_API_KEY: "sk-..."
  ANTHROPIC_API_KEY: "sk-ant-..."
  SENTRY_DSN: "https://..."
```

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metaagent-api
  namespace: metaagent
  labels:
    app: metaagent
    component: api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: metaagent
      component: api
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: metaagent
        component: api
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8000"
        prometheus.io/path: "/metrics"
    spec:
      serviceAccountName: metaagent
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        fsGroup: 1000

      containers:
        - name: api
          image: ghcr.io/org/meta-agent:latest
          imagePullPolicy: Always

          ports:
            - name: http
              containerPort: 8000
              protocol: TCP

          envFrom:
            - configMapRef:
                name: metaagent-config
            - secretRef:
                name: metaagent-secrets

          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"

          livenessProbe:
            httpGet:
              path: /health
              port: http
            initialDelaySeconds: 30
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3

          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop:
                - ALL

          volumeMounts:
            - name: tmp
              mountPath: /tmp
            - name: logs
              mountPath: /app/logs

      volumes:
        - name: tmp
          emptyDir: {}
        - name: logs
          emptyDir: {}

      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                labelSelector:
                  matchExpressions:
                    - key: app
                      operator: In
                      values:
                        - metaagent
                topologyKey: kubernetes.io/hostname

      topologySpreadConstraints:
        - maxSkew: 1
          topologyKey: topology.kubernetes.io/zone
          whenUnsatisfiable: ScheduleAnyway
          labelSelector:
            matchLabels:
              app: metaagent

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: metaagent-worker
  namespace: metaagent
  labels:
    app: metaagent
    component: worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: metaagent
      component: worker
  template:
    metadata:
      labels:
        app: metaagent
        component: worker
    spec:
      serviceAccountName: metaagent
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000

      containers:
        - name: worker
          image: ghcr.io/org/meta-agent:latest
          command: ["python", "-m", "meta_agent.worker"]

          envFrom:
            - configMapRef:
                name: metaagent-config
            - secretRef:
                name: metaagent-secrets

          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "2Gi"

          livenessProbe:
            exec:
              command:
                - python
                - -c
                - "import sys; sys.exit(0)"
            initialDelaySeconds: 10
            periodSeconds: 30

          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
```

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: metaagent-api
  namespace: metaagent
  labels:
    app: metaagent
    component: api
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: 8000
      protocol: TCP
  selector:
    app: metaagent
    component: api
```

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: metaagent-ingress
  namespace: metaagent
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/rate-limit-window: "1m"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
spec:
  tls:
    - hosts:
        - metaagent.example.com
      secretName: metaagent-tls
  rules:
    - host: metaagent.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: metaagent-api
                port:
                  number: 80
```

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: metaagent-api-hpa
  namespace: metaagent
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: metaagent-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
        - type: Percent
          value: 100
          periodSeconds: 60
      selectPolicy: Max

---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: metaagent-worker-hpa
  namespace: metaagent
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: metaagent-worker
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
```
  </action>
  <verify>
    - Namespace with labels
    - ConfigMap for non-sensitive configuration
    - Secrets for sensitive data
    - Deployment with security contexts and probes
    - Service for internal networking
    - Ingress with TLS and rate limiting
    - HPA for auto-scaling
    - Pod anti-affinity for high availability
  </verify>
  <done>Kubernetes manifests for production deployment complete</done>
</task>

### Task 20.5: CI/CD Pipeline and Deployment Scripts

<task type="auto">
  <name>Create GitHub Actions CI/CD pipeline and deployment scripts</name>
  <files>.github/workflows/ci.yml, .github/workflows/deploy.yml, scripts/deploy.sh, scripts/migrate.sh</files>
  <action>
Create CI/CD pipelines and deployment scripts.

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  PYTHON_VERSION: "3.11"
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: pgvector/pgvector:pg16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: ${{ env.PYTHON_VERSION }}

      - name: Install Poetry
        uses: snok/install-poetry@v1
        with:
          version: 1.7.1

      - name: Cache dependencies
        uses: actions/cache@v4
        with:
          path: ~/.cache/pypoetry
          key: ${{ runner.os }}-poetry-${{ hashFiles('**/poetry.lock') }}

      - name: Install dependencies
        run: poetry install --with dev

      - name: Run linting
        run: |
          poetry run black --check src tests
          poetry run isort --check-only src tests
          poetry run mypy src

      - name: Run tests
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379/0
        run: |
          poetry run pytest tests/ -v --cov=src --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage.xml

  build:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=ref,event=branch
            type=ref,event=pr
            type=sha,prefix=
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          target: production

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          scan-type: 'fs'
          scan-ref: '.'
          format: 'sarif'
          output: 'trivy-results.sarif'

      - name: Upload Trivy scan results
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: 'trivy-results.sarif'
```

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        type: choice
        options:
          - staging
          - production
      version:
        description: 'Image version/tag to deploy'
        required: true
        type: string

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}

    steps:
      - uses: actions/checkout@v4

      - name: Set up kubectl
        uses: azure/setup-kubectl@v4

      - name: Configure Kubernetes context
        uses: azure/k8s-set-context@v4
        with:
          kubeconfig: ${{ secrets.KUBECONFIG }}

      - name: Update image tag
        run: |
          sed -i "s|image: .*meta-agent:.*|image: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.event.inputs.version }}|g" k8s/deployment.yaml

      - name: Apply Kubernetes manifests
        run: |
          kubectl apply -f k8s/namespace.yaml
          kubectl apply -f k8s/configmap.yaml
          kubectl apply -f k8s/deployment.yaml
          kubectl apply -f k8s/service.yaml
          kubectl apply -f k8s/ingress.yaml
          kubectl apply -f k8s/hpa.yaml

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/metaagent-api -n metaagent --timeout=300s
          kubectl rollout status deployment/metaagent-worker -n metaagent --timeout=300s

      - name: Run smoke tests
        run: |
          API_URL=$(kubectl get ingress metaagent-ingress -n metaagent -o jsonpath='{.spec.rules[0].host}')
          curl -f https://$API_URL/health || exit 1

      - name: Notify on success
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Deployed ${{ github.event.inputs.version }} to ${{ github.event.inputs.environment }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

      - name: Notify on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "❌ Deployment of ${{ github.event.inputs.version }} to ${{ github.event.inputs.environment }} failed"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

```bash
#!/bin/bash
# scripts/deploy.sh
# Deployment script for MetaAgent

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
ENVIRONMENT="${1:-staging}"
VERSION="${2:-latest}"
NAMESPACE="metaagent"
TIMEOUT="300s"

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Pre-flight checks
preflight() {
    log_info "Running pre-flight checks..."

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi

    # Check cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi

    # Check namespace exists
    if ! kubectl get namespace "$NAMESPACE" &> /dev/null; then
        log_info "Creating namespace $NAMESPACE..."
        kubectl apply -f k8s/namespace.yaml
    fi

    log_info "Pre-flight checks passed"
}

# Run database migrations
migrate() {
    log_info "Running database migrations..."

    kubectl run --rm -i --tty migration-job \
        --namespace="$NAMESPACE" \
        --image="ghcr.io/org/meta-agent:$VERSION" \
        --restart=Never \
        --command -- python -m alembic upgrade head

    log_info "Migrations complete"
}

# Deploy application
deploy() {
    log_info "Deploying MetaAgent $VERSION to $ENVIRONMENT..."

    # Update image tag in manifests
    sed -i.bak "s|image: .*meta-agent:.*|image: ghcr.io/org/meta-agent:$VERSION|g" k8s/deployment.yaml

    # Apply manifests
    kubectl apply -f k8s/configmap.yaml --namespace="$NAMESPACE"
    kubectl apply -f k8s/deployment.yaml --namespace="$NAMESPACE"
    kubectl apply -f k8s/service.yaml --namespace="$NAMESPACE"
    kubectl apply -f k8s/ingress.yaml --namespace="$NAMESPACE"
    kubectl apply -f k8s/hpa.yaml --namespace="$NAMESPACE"

    # Wait for rollout
    log_info "Waiting for rollout to complete..."
    kubectl rollout status deployment/metaagent-api --namespace="$NAMESPACE" --timeout="$TIMEOUT"
    kubectl rollout status deployment/metaagent-worker --namespace="$NAMESPACE" --timeout="$TIMEOUT"

    # Restore original manifest
    mv k8s/deployment.yaml.bak k8s/deployment.yaml

    log_info "Deployment complete"
}

# Health check
healthcheck() {
    log_info "Running health checks..."

    # Get API endpoint
    API_HOST=$(kubectl get ingress metaagent-ingress --namespace="$NAMESPACE" -o jsonpath='{.spec.rules[0].host}')

    # Check health endpoint
    for i in {1..10}; do
        if curl -sf "https://$API_HOST/health" > /dev/null; then
            log_info "Health check passed"
            return 0
        fi
        log_warn "Health check attempt $i failed, retrying..."
        sleep 5
    done

    log_error "Health check failed after 10 attempts"
    return 1
}

# Rollback
rollback() {
    log_warn "Rolling back deployment..."
    kubectl rollout undo deployment/metaagent-api --namespace="$NAMESPACE"
    kubectl rollout undo deployment/metaagent-worker --namespace="$NAMESPACE"
    log_info "Rollback complete"
}

# Main
main() {
    log_info "Starting deployment to $ENVIRONMENT with version $VERSION"

    preflight

    # Run migrations (if not skipped)
    if [[ "${SKIP_MIGRATIONS:-false}" != "true" ]]; then
        migrate
    fi

    # Deploy
    if ! deploy; then
        log_error "Deployment failed"
        rollback
        exit 1
    fi

    # Health check
    if ! healthcheck; then
        log_error "Health check failed"
        rollback
        exit 1
    fi

    log_info "✅ Deployment successful!"
}

main
```

```bash
#!/bin/bash
# scripts/migrate.sh
# Database migration script

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-}"

if [[ -z "$DATABASE_URL" ]]; then
    echo "ERROR: DATABASE_URL environment variable is required"
    exit 1
fi

echo "Running database migrations..."

# Run Alembic migrations
python -m alembic upgrade head

echo "Migrations complete!"

# Verify migration
echo "Verifying migration..."
python -c "
from meta_agent.database import Database
import asyncio

async def verify():
    db = Database('$DATABASE_URL')
    await db.connect()

    # Check if key tables exist
    tables = await db.fetch_all(\"\"\"
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
    \"\"\")

    required_tables = ['agents', 'executions', 'evaluations', 'problems']
    existing = [t['tablename'] for t in tables]

    for table in required_tables:
        if table not in existing:
            raise Exception(f'Missing required table: {table}')

    print(f'Verified {len(existing)} tables')
    await db.disconnect()

asyncio.run(verify())
"

echo "Migration verification passed!"
```
  </action>
  <verify>
    - GitHub Actions CI workflow with testing, linting, security scanning
    - Build workflow with Docker image push
    - Deploy workflow with manual trigger
    - Deployment script with rollback capability
    - Migration script with verification
  </verify>
  <done>CI/CD pipeline and deployment scripts complete</done>
</task>

## Phase Completion Criteria

- [ ] CLI framework with Click and Rich
- [ ] Core CLI commands (status, agent, deploy, knowledge, integration, metrics)
- [ ] API client for CLI communication
- [ ] Docker multi-stage build
- [ ] docker-compose for development and production
- [ ] Kubernetes manifests (deployment, service, ingress, HPA)
- [ ] GitHub Actions CI/CD pipeline
- [ ] Deployment scripts with rollback
- [ ] Database migration scripts
- [ ] Security scanning in CI
- [ ] Auto-scaling configuration
