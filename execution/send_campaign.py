#!/usr/bin/env python3
"""
Campaign Sending Script
Creates and manages cold email campaigns.

Usage:
    python execution/send_campaign.py --name "Q1 Outreach" --leads leads.csv
"""

import argparse
import csv
import json
import random
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
import time

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / ".tmp" / "campaigns"


@dataclass
class EmailTemplate:
    """Email template with subject and body."""
    subject: str
    body: str
    delay_days: int = 0


@dataclass
class Lead:
    """Lead data structure."""
    email: str
    first_name: str
    company_name: str
    extra: Dict = None


class Campaign:
    """Campaign manager for cold email outreach."""

    def __init__(
        self,
        name: str,
        leads_csv: str = None,
        mailboxes: List[str] = None,
        daily_limit: int = 50,
    ):
        self.id = f"campaign_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.name = name
        self.leads_csv = leads_csv
        self.mailboxes = mailboxes or []
        self.daily_limit = daily_limit
        self.sequence: List[EmailTemplate] = []
        self.status = "draft"
        self.created_at = datetime.now()
        self.leads: List[Lead] = []

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

        if leads_csv:
            self._load_leads(leads_csv)

    def _load_leads(self, csv_path: str):
        """Load leads from CSV file."""
        with open(csv_path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                lead = Lead(
                    email=row.get("email", ""),
                    first_name=row.get("first_name", ""),
                    company_name=row.get("company_name", ""),
                    extra=row,
                )
                self.leads.append(lead)
        print(f"Loaded {len(self.leads)} leads")

    def add_email(self, subject: str, body: str, delay_days: int = 0):
        """Add email to sequence."""
        template = EmailTemplate(
            subject=subject,
            body=body,
            delay_days=delay_days,
        )
        self.sequence.append(template)
        print(f"Added email {len(self.sequence)}: {subject[:50]}...")

    def personalize(self, template: str, lead: Lead) -> str:
        """Replace personalization variables."""
        result = template
        result = result.replace("{{first_name}}", lead.first_name)
        result = result.replace("{{company_name}}", lead.company_name)
        result = result.replace("{{email}}", lead.email)

        # Handle extra fields
        if lead.extra:
            for key, value in lead.extra.items():
                result = result.replace(f"{{{{{key}}}}}", str(value))

        return result

    def validate(self) -> List[str]:
        """Validate campaign before launch."""
        errors = []

        if not self.leads:
            errors.append("No leads loaded")

        if not self.sequence:
            errors.append("No emails in sequence")

        if not self.mailboxes:
            errors.append("No mailboxes configured")

        # Check for missing personalization
        for i, email in enumerate(self.sequence):
            for lead in self.leads[:5]:  # Check first 5
                personalized = self.personalize(email.body, lead)
                if "{{" in personalized:
                    errors.append(f"Email {i+1} has unresolved variables")
                    break

        return errors

    def start(self) -> Dict:
        """Start the campaign."""
        errors = self.validate()
        if errors:
            return {"status": "error", "errors": errors}

        self.status = "active"
        self.started_at = datetime.now()

        # Save campaign state
        self._save()

        print(f"Campaign '{self.name}' started")
        print(f"Leads: {len(self.leads)}")
        print(f"Emails in sequence: {len(self.sequence)}")
        print(f"Mailboxes: {len(self.mailboxes)}")

        return {"status": "started", "campaign_id": self.id}

    def pause(self):
        """Pause the campaign."""
        self.status = "paused"
        self._save()

    def resume(self):
        """Resume the campaign."""
        self.status = "active"
        self._save()

    def _save(self):
        """Save campaign state to file."""
        state = {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "started_at": getattr(self, "started_at", None),
            "leads_count": len(self.leads),
            "mailboxes": self.mailboxes,
            "daily_limit": self.daily_limit,
            "sequence": [asdict(e) for e in self.sequence],
        }

        with open(OUTPUT_DIR / f"{self.id}.json", "w") as f:
            json.dump(state, f, indent=2, default=str)

    @classmethod
    def load(cls, campaign_id: str) -> "Campaign":
        """Load campaign from file."""
        with open(OUTPUT_DIR / f"{campaign_id}.json") as f:
            state = json.load(f)

        campaign = cls(name=state["name"])
        campaign.id = state["id"]
        campaign.status = state["status"]
        campaign.mailboxes = state["mailboxes"]
        campaign.daily_limit = state["daily_limit"]
        campaign.sequence = [EmailTemplate(**e) for e in state["sequence"]]

        return campaign


def get_metrics(campaign_id: str) -> Dict:
    """Get campaign metrics."""
    # TODO: Implement actual metric tracking
    return {
        "campaign_id": campaign_id,
        "sent": 0,
        "delivered": 0,
        "opened": 0,
        "clicked": 0,
        "replied": 0,
        "bounced": 0,
        "open_rate": 0.0,
        "click_rate": 0.0,
        "reply_rate": 0.0,
        "bounce_rate": 0.0,
    }


def main():
    parser = argparse.ArgumentParser(description="Campaign management")
    parser.add_argument("--name", help="Campaign name")
    parser.add_argument("--leads", help="Leads CSV file")
    parser.add_argument("--sequence", help="Sequence JSON file")
    parser.add_argument("--mailboxes", help="Mailboxes JSON file")
    parser.add_argument("--campaign-id", help="Campaign ID for status/metrics")
    parser.add_argument("--action", default="create",
                       choices=["create", "start", "pause", "resume", "metrics"])

    args = parser.parse_args()

    if args.action == "create":
        if not args.name:
            parser.error("--name required for create")

        campaign = Campaign(
            name=args.name,
            leads_csv=args.leads,
        )

        # Load sequence if provided
        if args.sequence:
            with open(args.sequence) as f:
                sequence = json.load(f)
            for email in sequence:
                campaign.add_email(**email)

        # Load mailboxes if provided
        if args.mailboxes:
            with open(args.mailboxes) as f:
                campaign.mailboxes = json.load(f)

        campaign._save()
        print(f"Campaign created: {campaign.id}")

    elif args.action == "start":
        if not args.campaign_id:
            parser.error("--campaign-id required")
        campaign = Campaign.load(args.campaign_id)
        result = campaign.start()
        print(f"Result: {result}")

    elif args.action == "metrics":
        if not args.campaign_id:
            parser.error("--campaign-id required")
        metrics = get_metrics(args.campaign_id)
        print(f"\nCampaign Metrics:")
        for key, value in metrics.items():
            print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
