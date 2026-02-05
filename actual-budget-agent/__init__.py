"""
Actual Budget Agent

Automated bookkeeping, budget insights, and tax advisory for the Coyne household.
Integrates with Actual Budget and provides Chicago/Illinois-specific advice.

Usage:
    from actual_budget_agent import BudgetAgent
    
    agent = BudgetAgent()
    
    # Health check
    status = agent.health_check()
    
    # Get current month summary
    summary = agent.get_monthly_summary()
    
    # Generate insights
    insights = agent.analyze_spending()
    
    # Get tax summary
    tax_report = agent.get_tax_summary(2026)
"""

from .client import ActualBudgetClient, ActualConfig, get_client
from .categorizer import TransactionCategorizer, get_categorizer
from .insights import InsightGenerator, SpendingSummary, BudgetInsight, get_insight_generator
from .tax import TaxAdvisor, TaxSummary, get_tax_advisor
from .reports import ReportGenerator, ReportConfig, get_report_generator

__version__ = "0.1.0"
__all__ = [
    "BudgetAgent",
    "ActualBudgetClient",
    "ActualConfig", 
    "TransactionCategorizer",
    "InsightGenerator",
    "TaxAdvisor",
    "ReportGenerator",
]


class BudgetAgent:
    """
    Main interface for the Actual Budget Agent.
    
    Combines all modules into a unified interface for:
    - Budget tracking and analysis
    - Spending insights
    - Tax advisory
    - Report generation
    """
    
    def __init__(self, household_size: int = 2, 
                 filing_status: str = "married_filing_jointly"):
        self.client = get_client()
        self.categorizer = get_categorizer()
        self.insight_gen = get_insight_generator(household_size)
        self.tax_advisor = get_tax_advisor(filing_status)
        self.report_gen = get_report_generator(ReportConfig(
            household_size=household_size,
            filing_status=filing_status,
        ))
    
    def health_check(self) -> dict:
        """Check connection to Actual Budget."""
        return self.client.health_check()
    
    def get_budgets(self) -> list:
        """List available budgets."""
        return self.client.list_budgets()
    
    # Note: Full implementation requires the actual-api npm package
    # or direct sync protocol implementation. The methods below are
    # placeholders for the integration points.
    
    def categorize_transaction(self, payee: str, amount: float = None):
        """
        Categorize a transaction by payee name.
        
        Returns (category, confidence) tuple.
        """
        return self.categorizer.categorize(payee, amount)
    
    def learn_category(self, payee: str, category: str):
        """Learn a new payee -> category mapping."""
        self.categorizer.learn(payee, category)
    
    def get_tax_tips(self, gross_income: float, property_tax: float = 0, 
                     tax_year: int = None) -> str:
        """
        Get tax planning tips based on income and deductions.
        """
        from datetime import date
        from decimal import Decimal
        
        tax_year = tax_year or date.today().year
        summary = self.tax_advisor.calculate_tax_summary(
            tax_year=tax_year,
            gross_income=Decimal(str(gross_income)),
            property_tax=Decimal(str(property_tax)),
        )
        tips = self.tax_advisor.generate_tax_tips(summary)
        return self.tax_advisor.format_tax_report(summary) + "\n\n" + "\n".join(tips)


def create_agent(household_size: int = 2, 
                 filing_status: str = "married_filing_jointly") -> BudgetAgent:
    """Create a configured budget agent."""
    return BudgetAgent(household_size, filing_status)
