#!/usr/bin/env python3
"""
Mailbox Creation Script
Creates email accounts on Google Workspace or Microsoft 365.

Usage:
    python execution/create_mailbox.py --domain acmeleads.com --first John --last Smith
"""

import argparse
import json
import secrets
import string
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime

# Configuration
GOOGLE_CONFIG = Path(__file__).parent.parent / "config" / "google_workspace.json"
MICROSOFT_CONFIG = Path(__file__).parent.parent / "config" / "microsoft.json"
OUTPUT_DIR = Path(__file__).parent.parent / ".tmp" / "mailboxes"


def generate_password(length: int = 16) -> str:
    """Generate a secure random password."""
    chars = string.ascii_letters + string.digits + "!@#$%"
    return ''.join(secrets.choice(chars) for _ in range(length))


def create_email_address(first: str, last: str, domain: str, pattern: str = "first.last") -> str:
    """Generate email address based on pattern."""
    patterns = {
        "first.last": f"{first.lower()}.{last.lower()}@{domain}",
        "f.last": f"{first[0].lower()}.{last.lower()}@{domain}",
        "first": f"{first.lower()}@{domain}",
        "firstl": f"{first.lower()}{last[0].lower()}@{domain}",
    }
    return patterns.get(pattern, patterns["first.last"])


def create_google_mailbox(
    email: str,
    first_name: str,
    last_name: str,
    password: str,
    config: Dict,
) -> Dict:
    """Create mailbox via Google Workspace Admin API."""
    # TODO: Implement Google Admin SDK call
    # https://developers.google.com/admin-sdk/directory/v1/guides/manage-users
    print(f"Creating Google Workspace mailbox: {email}")
    return {
        "email": email,
        "provider": "google",
        "status": "success",
        "created_at": datetime.now().isoformat(),
    }


def create_microsoft_mailbox(
    email: str,
    first_name: str,
    last_name: str,
    password: str,
    config: Dict,
) -> Dict:
    """Create mailbox via Microsoft Graph API."""
    # TODO: Implement Microsoft Graph API call
    # https://docs.microsoft.com/en-us/graph/api/user-post-users
    print(f"Creating Microsoft 365 mailbox: {email}")
    return {
        "email": email,
        "provider": "microsoft",
        "status": "success",
        "created_at": datetime.now().isoformat(),
    }


def test_smtp_connection(email: str, password: str, provider: str) -> bool:
    """Test SMTP connection for the mailbox."""
    import smtplib

    smtp_servers = {
        "google": ("smtp.gmail.com", 587),
        "microsoft": ("smtp.office365.com", 587),
    }

    server, port = smtp_servers.get(provider, smtp_servers["google"])

    try:
        with smtplib.SMTP(server, port) as smtp:
            smtp.starttls()
            smtp.login(email, password)
            return True
    except Exception as e:
        print(f"SMTP test failed: {e}")
        return False


def create_mailbox(
    domain: str,
    first_name: str,
    last_name: str,
    provider: str = "google",
    password: Optional[str] = None,
    pattern: str = "first.last",
) -> Dict:
    """
    Main function to create a mailbox.

    Args:
        domain: Domain for the email
        first_name: User's first name
        last_name: User's last name
        provider: "google" or "microsoft"
        password: Optional password (auto-generated if not provided)
        pattern: Email pattern to use

    Returns:
        Mailbox credentials and status
    """
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load config
    config_path = GOOGLE_CONFIG if provider == "google" else MICROSOFT_CONFIG
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    with open(config_path) as f:
        config = json.load(f)

    # Generate credentials
    email = create_email_address(first_name, last_name, domain, pattern)
    password = password or generate_password()

    # Create mailbox
    if provider == "google":
        result = create_google_mailbox(email, first_name, last_name, password, config)
    else:
        result = create_microsoft_mailbox(email, first_name, last_name, password, config)

    # Add credentials to result
    result["password"] = password
    result["smtp_server"] = "smtp.gmail.com" if provider == "google" else "smtp.office365.com"
    result["smtp_port"] = 587
    result["imap_server"] = "imap.gmail.com" if provider == "google" else "outlook.office365.com"
    result["imap_port"] = 993

    # Save credentials (securely!)
    creds_file = OUTPUT_DIR / f"{email.replace('@', '_at_')}.json"
    with open(creds_file, "w") as f:
        json.dump(result, f, indent=2)

    # Restrict file permissions
    creds_file.chmod(0o600)

    print(f"Credentials saved to: {creds_file}")
    return result


def bulk_create_from_csv(csv_path: str, provider: str = "google") -> List[Dict]:
    """Create multiple mailboxes from CSV file."""
    import csv

    results = []
    with open(csv_path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            result = create_mailbox(
                domain=row["domain"],
                first_name=row["first_name"],
                last_name=row["last_name"],
                provider=provider,
            )
            results.append(result)

    return results


def main():
    parser = argparse.ArgumentParser(description="Create email mailboxes")
    parser.add_argument("--domain", help="Domain for mailbox")
    parser.add_argument("--first", help="First name")
    parser.add_argument("--last", help="Last name")
    parser.add_argument("--provider", default="google", choices=["google", "microsoft"])
    parser.add_argument("--csv", help="CSV file for bulk creation")
    parser.add_argument("--pattern", default="first.last", help="Email pattern")

    args = parser.parse_args()

    if args.csv:
        results = bulk_create_from_csv(args.csv, args.provider)
        print(f"\nCreated {len(results)} mailboxes")
    else:
        if not all([args.domain, args.first, args.last]):
            parser.error("--domain, --first, and --last are required")

        result = create_mailbox(
            domain=args.domain,
            first_name=args.first,
            last_name=args.last,
            provider=args.provider,
            pattern=args.pattern,
        )
        print(f"\nMailbox created: {result['email']}")


if __name__ == "__main__":
    main()
