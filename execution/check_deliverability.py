#!/usr/bin/env python3
"""
Deliverability Check Script
Monitors and audits email deliverability.

Usage:
    python execution/check_deliverability.py --domain acmeleads.com --quick
"""

import argparse
import json
import subprocess
from pathlib import Path
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass

# Configuration
OUTPUT_DIR = Path(__file__).parent.parent / ".tmp" / "deliverability"


@dataclass
class DeliverabilityScore:
    """Deliverability score breakdown."""
    overall: float
    spf: float
    dkim: float
    dmarc: float
    reputation: float
    blacklist: float


class DeliverabilityChecker:
    """Check email deliverability for a domain."""

    def __init__(self, domain: str):
        self.domain = domain
        self.results = {}

    def check_spf(self) -> Dict:
        """Check SPF record."""
        try:
            result = subprocess.run(
                ["dig", "+short", "TXT", self.domain],
                capture_output=True, text=True, timeout=10
            )
            output = result.stdout

            has_spf = "v=spf1" in output
            valid = has_spf and ("~all" in output or "-all" in output)

            return {
                "exists": has_spf,
                "valid": valid,
                "record": output.strip() if has_spf else None,
                "score": 1.0 if valid else (0.5 if has_spf else 0.0),
            }
        except Exception as e:
            return {"exists": False, "valid": False, "error": str(e), "score": 0.0}

    def check_dkim(self, selector: str = "google") -> Dict:
        """Check DKIM record."""
        try:
            dkim_domain = f"{selector}._domainkey.{self.domain}"
            result = subprocess.run(
                ["dig", "+short", "TXT", dkim_domain],
                capture_output=True, text=True, timeout=10
            )
            output = result.stdout.strip()

            has_dkim = "v=DKIM1" in output or "p=" in output

            return {
                "exists": has_dkim,
                "selector": selector,
                "record": output if has_dkim else None,
                "score": 1.0 if has_dkim else 0.0,
            }
        except Exception as e:
            return {"exists": False, "error": str(e), "score": 0.0}

    def check_dmarc(self) -> Dict:
        """Check DMARC record."""
        try:
            dmarc_domain = f"_dmarc.{self.domain}"
            result = subprocess.run(
                ["dig", "+short", "TXT", dmarc_domain],
                capture_output=True, text=True, timeout=10
            )
            output = result.stdout.strip()

            has_dmarc = "v=DMARC1" in output
            policy = None
            if has_dmarc:
                if "p=reject" in output:
                    policy = "reject"
                elif "p=quarantine" in output:
                    policy = "quarantine"
                elif "p=none" in output:
                    policy = "none"

            score = 0.0
            if policy == "reject":
                score = 1.0
            elif policy == "quarantine":
                score = 0.8
            elif policy == "none":
                score = 0.5

            return {
                "exists": has_dmarc,
                "policy": policy,
                "record": output if has_dmarc else None,
                "score": score,
            }
        except Exception as e:
            return {"exists": False, "error": str(e), "score": 0.0}

    def check_mx(self) -> Dict:
        """Check MX records."""
        try:
            result = subprocess.run(
                ["dig", "+short", "MX", self.domain],
                capture_output=True, text=True, timeout=10
            )
            output = result.stdout.strip()

            records = [line.strip() for line in output.split("\n") if line.strip()]

            return {
                "exists": len(records) > 0,
                "count": len(records),
                "records": records,
                "score": 1.0 if records else 0.0,
            }
        except Exception as e:
            return {"exists": False, "error": str(e), "score": 0.0}

    def check_blacklists(self) -> Dict:
        """Check common blacklists."""
        # TODO: Implement actual blacklist checking via APIs
        blacklists = [
            "zen.spamhaus.org",
            "b.barracudacentral.org",
            "bl.spamcop.net",
            "dnsbl.sorbs.net",
        ]

        listed_on = []
        # Placeholder - actual implementation would query each DNSBL

        return {
            "checked": len(blacklists),
            "listed_on": listed_on,
            "clean": len(listed_on) == 0,
            "score": 1.0 if len(listed_on) == 0 else max(0.0, 1.0 - len(listed_on) * 0.25),
        }

    def quick_check(self) -> float:
        """Run quick deliverability check."""
        spf = self.check_spf()
        dkim = self.check_dkim()
        dmarc = self.check_dmarc()
        mx = self.check_mx()

        # Calculate weighted score
        weights = {"spf": 0.25, "dkim": 0.25, "dmarc": 0.25, "mx": 0.25}

        score = (
            spf["score"] * weights["spf"] +
            dkim["score"] * weights["dkim"] +
            dmarc["score"] * weights["dmarc"] +
            mx["score"] * weights["mx"]
        ) * 100

        self.results = {
            "domain": self.domain,
            "score": round(score, 1),
            "spf": spf,
            "dkim": dkim,
            "dmarc": dmarc,
            "mx": mx,
            "timestamp": datetime.now().isoformat(),
        }

        return score

    def full_audit(self) -> Dict:
        """Run full deliverability audit."""
        self.quick_check()
        self.results["blacklists"] = self.check_blacklists()

        # Recalculate with blacklist
        weights = {"spf": 0.2, "dkim": 0.2, "dmarc": 0.2, "mx": 0.2, "blacklists": 0.2}

        score = (
            self.results["spf"]["score"] * weights["spf"] +
            self.results["dkim"]["score"] * weights["dkim"] +
            self.results["dmarc"]["score"] * weights["dmarc"] +
            self.results["mx"]["score"] * weights["mx"] +
            self.results["blacklists"]["score"] * weights["blacklists"]
        ) * 100

        self.results["score"] = round(score, 1)

        # Save results
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        output_file = OUTPUT_DIR / f"{self.domain}_{datetime.now().strftime('%Y%m%d')}.json"
        with open(output_file, "w") as f:
            json.dump(self.results, f, indent=2)

        return self.results


def full_audit(domain: str, test_email: str = None, depth: str = "standard") -> Dict:
    """Run deliverability audit."""
    checker = DeliverabilityChecker(domain)

    if depth == "quick":
        checker.quick_check()
    else:
        checker.full_audit()

    return checker.results


def main():
    parser = argparse.ArgumentParser(description="Check email deliverability")
    parser.add_argument("--domain", required=True, help="Domain to check")
    parser.add_argument("--quick", action="store_true", help="Quick check only")
    parser.add_argument("--report", action="store_true", help="Generate report")

    args = parser.parse_args()

    checker = DeliverabilityChecker(args.domain)

    if args.quick:
        score = checker.quick_check()
        print(f"\nDeliverability Score: {score}/100")
    else:
        results = checker.full_audit()
        print(f"\nFull Audit for {args.domain}")
        print(f"="*50)
        print(f"Overall Score: {results['score']}/100")
        print(f"\nBreakdown:")
        print(f"  SPF:       {'✓' if results['spf']['exists'] else '✗'} ({results['spf']['score']*100:.0f}%)")
        print(f"  DKIM:      {'✓' if results['dkim']['exists'] else '✗'} ({results['dkim']['score']*100:.0f}%)")
        print(f"  DMARC:     {'✓' if results['dmarc']['exists'] else '✗'} ({results['dmarc']['score']*100:.0f}%)")
        print(f"  MX:        {'✓' if results['mx']['exists'] else '✗'} ({results['mx']['score']*100:.0f}%)")
        print(f"  Blacklist: {'Clean' if results['blacklists']['clean'] else 'LISTED'}")


if __name__ == "__main__":
    main()
