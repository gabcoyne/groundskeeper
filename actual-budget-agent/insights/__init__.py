"""
Budget Insights

Analyzes spending patterns and provides actionable insights.
"""

from dataclasses import dataclass, field
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any
from decimal import Decimal
import json


@dataclass
class SpendingCategory:
    """Spending summary for a category."""
    name: str
    amount: Decimal
    transaction_count: int
    budget: Optional[Decimal] = None
    last_month: Optional[Decimal] = None
    
    @property
    def budget_remaining(self) -> Optional[Decimal]:
        if self.budget is None:
            return None
        return self.budget - self.amount
    
    @property
    def budget_percent(self) -> Optional[float]:
        if self.budget is None or self.budget == 0:
            return None
        return float(self.amount / self.budget * 100)
    
    @property
    def month_over_month_change(self) -> Optional[float]:
        if self.last_month is None or self.last_month == 0:
            return None
        return float((self.amount - self.last_month) / self.last_month * 100)


@dataclass
class SpendingSummary:
    """Summary of spending for a period."""
    period_start: date
    period_end: date
    total_income: Decimal = Decimal("0")
    total_spending: Decimal = Decimal("0")
    total_transfers: Decimal = Decimal("0")
    categories: List[SpendingCategory] = field(default_factory=list)
    transaction_count: int = 0
    
    @property
    def net_cash_flow(self) -> Decimal:
        return self.total_income - self.total_spending
    
    @property
    def savings_rate(self) -> Optional[float]:
        if self.total_income == 0:
            return None
        return float(self.net_cash_flow / self.total_income * 100)
    
    def top_categories(self, n: int = 5) -> List[SpendingCategory]:
        """Get top N spending categories."""
        return sorted(self.categories, key=lambda c: c.amount, reverse=True)[:n]
    
    def over_budget_categories(self) -> List[SpendingCategory]:
        """Get categories that are over budget."""
        return [c for c in self.categories if c.budget_remaining is not None and c.budget_remaining < 0]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "period": f"{self.period_start} to {self.period_end}",
            "total_income": float(self.total_income),
            "total_spending": float(self.total_spending),
            "net_cash_flow": float(self.net_cash_flow),
            "savings_rate": self.savings_rate,
            "transaction_count": self.transaction_count,
            "top_categories": [
                {"name": c.name, "amount": float(c.amount), "count": c.transaction_count}
                for c in self.top_categories()
            ],
        }


@dataclass 
class BudgetInsight:
    """A single actionable insight."""
    type: str  # "warning", "opportunity", "achievement", "info"
    title: str
    message: str
    category: Optional[str] = None
    amount: Optional[Decimal] = None
    priority: int = 5  # 1-10, higher = more important
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "title": self.title,
            "message": self.message,
            "category": self.category,
            "amount": float(self.amount) if self.amount else None,
            "priority": self.priority,
        }


class InsightGenerator:
    """
    Generates actionable insights from spending data.
    
    Lifestyle-aware: focuses on optimization opportunities
    rather than aggressive austerity.
    """
    
    # Chicago-specific thresholds (comfortable lifestyle)
    DINING_THRESHOLD_MONTHLY = Decimal("800")  # Flag if dining exceeds this
    SUBSCRIPTION_THRESHOLD = Decimal("300")  # Monthly subscription ceiling
    GROCERY_PER_PERSON = Decimal("400")  # Monthly per person
    
    def __init__(self, household_size: int = 2):
        self.household_size = household_size
    
    def analyze(self, summary: SpendingSummary, last_month: Optional[SpendingSummary] = None) -> List[BudgetInsight]:
        """Generate insights from spending summary."""
        insights = []
        
        # Overall cash flow
        insights.extend(self._analyze_cash_flow(summary))
        
        # Category-specific insights
        insights.extend(self._analyze_dining(summary, last_month))
        insights.extend(self._analyze_subscriptions(summary))
        insights.extend(self._analyze_groceries(summary, last_month))
        insights.extend(self._analyze_transportation(summary))
        
        # Budget alerts
        insights.extend(self._analyze_budget_status(summary))
        
        # Month-over-month changes
        if last_month:
            insights.extend(self._analyze_trends(summary, last_month))
        
        # Sort by priority
        insights.sort(key=lambda i: -i.priority)
        
        return insights
    
    def _analyze_cash_flow(self, summary: SpendingSummary) -> List[BudgetInsight]:
        insights = []
        
        if summary.savings_rate is not None:
            if summary.savings_rate >= 20:
                insights.append(BudgetInsight(
                    type="achievement",
                    title="Strong Savings Rate",
                    message=f"You're saving {summary.savings_rate:.1f}% of income this month. Nice work!",
                    priority=3,
                ))
            elif summary.savings_rate < 0:
                insights.append(BudgetInsight(
                    type="warning",
                    title="Spending Exceeds Income",
                    message=f"Spending is ${float(-summary.net_cash_flow):,.2f} more than income this period.",
                    amount=-summary.net_cash_flow,
                    priority=9,
                ))
            elif summary.savings_rate < 10:
                insights.append(BudgetInsight(
                    type="info",
                    title="Low Savings Rate",
                    message=f"Savings rate is {summary.savings_rate:.1f}%. Consider reviewing discretionary spending.",
                    priority=6,
                ))
        
        return insights
    
    def _analyze_dining(self, summary: SpendingSummary, last_month: Optional[SpendingSummary]) -> List[BudgetInsight]:
        insights = []
        
        # Find dining categories
        dining_total = Decimal("0")
        for cat in summary.categories:
            if cat.name.startswith("Dining"):
                dining_total += cat.amount
        
        if dining_total > self.DINING_THRESHOLD_MONTHLY:
            overage = dining_total - self.DINING_THRESHOLD_MONTHLY
            insights.append(BudgetInsight(
                type="opportunity",
                title="Dining Spending High",
                message=f"Dining out is ${float(dining_total):,.2f} this month. "
                        f"Cooking 2 more meals/week at home could save ~${float(overage):,.0f}/month.",
                category="Dining",
                amount=overage,
                priority=5,
            ))
        
        # Check delivery vs restaurant ratio
        delivery = sum(c.amount for c in summary.categories if "Delivery" in c.name)
        if delivery > Decimal("200"):
            insights.append(BudgetInsight(
                type="opportunity", 
                title="Delivery Fees Adding Up",
                message=f"Food delivery is ${float(delivery):,.2f}. Pickup saves ~15-20% on fees.",
                category="Dining:Delivery",
                amount=delivery * Decimal("0.15"),
                priority=4,
            ))
        
        return insights
    
    def _analyze_subscriptions(self, summary: SpendingSummary) -> List[BudgetInsight]:
        insights = []
        
        sub_total = Decimal("0")
        sub_categories = []
        for cat in summary.categories:
            if cat.name.startswith("Subscriptions"):
                sub_total += cat.amount
                sub_categories.append(cat)
        
        if sub_total > self.SUBSCRIPTION_THRESHOLD:
            insights.append(BudgetInsight(
                type="opportunity",
                title="Subscription Review Suggested",
                message=f"Total subscriptions are ${float(sub_total):,.2f}/month. "
                        f"Consider auditing for unused services.",
                category="Subscriptions",
                amount=sub_total - self.SUBSCRIPTION_THRESHOLD,
                priority=5,
            ))
        
        return insights
    
    def _analyze_groceries(self, summary: SpendingSummary, last_month: Optional[SpendingSummary]) -> List[BudgetInsight]:
        insights = []
        
        grocery_cat = next((c for c in summary.categories if c.name == "Groceries"), None)
        if not grocery_cat:
            return insights
        
        expected = self.GROCERY_PER_PERSON * self.household_size
        if grocery_cat.amount > expected * Decimal("1.3"):  # 30% over
            insights.append(BudgetInsight(
                type="info",
                title="Grocery Spending Above Average",
                message=f"Groceries at ${float(grocery_cat.amount):,.2f}. "
                        f"Chicago average for {self.household_size} is ~${float(expected):,.0f}. "
                        f"Meal planning could help optimize.",
                category="Groceries",
                priority=3,
            ))
        
        return insights
    
    def _analyze_transportation(self, summary: SpendingSummary) -> List[BudgetInsight]:
        insights = []
        
        rideshare = sum(c.amount for c in summary.categories if "Rideshare" in c.name)
        gas = sum(c.amount for c in summary.categories if "Gas" in c.name)
        transit = sum(c.amount for c in summary.categories if "Transit" in c.name)
        
        # If high rideshare + low transit, suggest CTA
        if rideshare > Decimal("200") and transit < Decimal("50"):
            insights.append(BudgetInsight(
                type="opportunity",
                title="Consider CTA Pass",
                message=f"Rideshare spending is ${float(rideshare):,.2f}. "
                        f"A CTA monthly pass is $75 - could save on regular routes.",
                category="Transportation",
                amount=rideshare - Decimal("75"),
                priority=4,
            ))
        
        return insights
    
    def _analyze_budget_status(self, summary: SpendingSummary) -> List[BudgetInsight]:
        insights = []
        
        for cat in summary.over_budget_categories():
            insights.append(BudgetInsight(
                type="warning",
                title=f"{cat.name} Over Budget",
                message=f"Over by ${float(-cat.budget_remaining):,.2f} "
                        f"({cat.budget_percent:.0f}% of budget used).",
                category=cat.name,
                amount=-cat.budget_remaining,
                priority=7,
            ))
        
        return insights
    
    def _analyze_trends(self, current: SpendingSummary, previous: SpendingSummary) -> List[BudgetInsight]:
        insights = []
        
        # Check for significant increases
        for cat in current.categories:
            prev_cat = next((c for c in previous.categories if c.name == cat.name), None)
            if prev_cat and prev_cat.amount > 0:
                change_pct = float((cat.amount - prev_cat.amount) / prev_cat.amount * 100)
                change_amt = cat.amount - prev_cat.amount
                
                if change_pct > 30 and change_amt > Decimal("50"):
                    insights.append(BudgetInsight(
                        type="info",
                        title=f"{cat.name} Up {change_pct:.0f}%",
                        message=f"Increased ${float(change_amt):,.2f} from last month.",
                        category=cat.name,
                        amount=change_amt,
                        priority=4,
                    ))
                elif change_pct < -20 and abs(change_amt) > Decimal("50"):
                    insights.append(BudgetInsight(
                        type="achievement",
                        title=f"{cat.name} Down {abs(change_pct):.0f}%",
                        message=f"Saved ${float(abs(change_amt)):,.2f} compared to last month!",
                        category=cat.name,
                        priority=2,
                    ))
        
        return insights
    
    def format_summary_report(self, summary: SpendingSummary, insights: List[BudgetInsight]) -> str:
        """Format a human-readable summary report."""
        lines = []
        
        # Header
        lines.append(f"📊 **Budget Summary**")
        lines.append(f"*{summary.period_start.strftime('%b %d')} - {summary.period_end.strftime('%b %d, %Y')}*")
        lines.append("")
        
        # Cash flow
        lines.append("**Cash Flow**")
        lines.append(f"• Income: ${float(summary.total_income):,.2f}")
        lines.append(f"• Spending: ${float(summary.total_spending):,.2f}")
        lines.append(f"• Net: ${float(summary.net_cash_flow):,.2f}")
        if summary.savings_rate is not None:
            lines.append(f"• Savings Rate: {summary.savings_rate:.1f}%")
        lines.append("")
        
        # Top categories
        lines.append("**Top Spending**")
        for cat in summary.top_categories(5):
            budget_str = ""
            if cat.budget_percent is not None:
                budget_str = f" ({cat.budget_percent:.0f}% of budget)"
            lines.append(f"• {cat.name}: ${float(cat.amount):,.2f}{budget_str}")
        lines.append("")
        
        # Insights
        if insights:
            lines.append("**Insights**")
            for insight in insights[:5]:  # Top 5 insights
                emoji = {"warning": "⚠️", "opportunity": "💡", "achievement": "✅", "info": "ℹ️"}.get(insight.type, "•")
                lines.append(f"{emoji} **{insight.title}**: {insight.message}")
        
        return "\n".join(lines)


# Convenience functions
def get_insight_generator(household_size: int = 2) -> InsightGenerator:
    """Get configured insight generator."""
    return InsightGenerator(household_size=household_size)
