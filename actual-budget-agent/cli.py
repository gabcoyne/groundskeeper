#!/usr/bin/env python3
"""
Actual Budget Agent CLI

Quick commands for testing and manual operations.
"""

import sys
import json
from decimal import Decimal


def health_check():
    """Check connection to Actual Budget."""
    from client import get_client
    client = get_client()
    result = client.health_check()
    print(json.dumps(result, indent=2))
    return 0 if result.get("status") == "ok" else 1


def list_budgets():
    """List available budgets."""
    from client import get_client
    client = get_client()
    budgets = client.list_budgets()
    for b in budgets:
        print(f"• {b.get('name')} (ID: {b.get('fileId')})")
    return 0


def categorize(payee: str):
    """Test transaction categorization."""
    from categorizer import get_categorizer
    cat = get_categorizer()
    category, confidence = cat.categorize(payee)
    if category:
        print(f"Category: {category}")
        print(f"Confidence: {confidence:.0%}")
    else:
        print("No category match found")
        suggestions = cat.suggest_category(payee)
        if suggestions:
            print("Suggestions:")
            for cat, conf in suggestions:
                print(f"  • {cat} ({conf:.0%})")
    return 0


def tax_estimate(gross_income: float, property_tax: float = 0):
    """Get tax estimate."""
    from tax import get_tax_advisor
    from datetime import date
    
    advisor = get_tax_advisor()
    summary = advisor.calculate_tax_summary(
        tax_year=date.today().year,
        gross_income=Decimal(str(gross_income)),
        property_tax=Decimal(str(property_tax)),
    )
    print(advisor.format_tax_report(summary))
    print()
    for tip in advisor.generate_tax_tips(summary):
        print(tip)
    return 0


def main():
    if len(sys.argv) < 2:
        print("Usage: cli.py <command> [args]")
        print()
        print("Commands:")
        print("  health      - Check Actual Budget connection")
        print("  budgets     - List available budgets")
        print("  categorize <payee> - Test transaction categorization")
        print("  tax <income> [property_tax] - Get tax estimate")
        return 1
    
    command = sys.argv[1]
    
    if command == "health":
        return health_check()
    elif command == "budgets":
        return list_budgets()
    elif command == "categorize":
        if len(sys.argv) < 3:
            print("Usage: cli.py categorize <payee>")
            return 1
        return categorize(" ".join(sys.argv[2:]))
    elif command == "tax":
        if len(sys.argv) < 3:
            print("Usage: cli.py tax <gross_income> [property_tax]")
            return 1
        income = float(sys.argv[2])
        prop_tax = float(sys.argv[3]) if len(sys.argv) > 3 else 0
        return tax_estimate(income, prop_tax)
    else:
        print(f"Unknown command: {command}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
