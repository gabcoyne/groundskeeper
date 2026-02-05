"""
Report Generator

Creates formatted reports for budget summaries, insights, and tax information.
Designed for delivery via Telegram/messaging.
"""

from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any
from dataclasses import dataclass

from ..insights import SpendingSummary, BudgetInsight, InsightGenerator
from ..tax import TaxSummary, TaxAdvisor


@dataclass
class ReportConfig:
    """Configuration for report generation."""
    household_size: int = 2
    filing_status: str = "married_filing_jointly"
    include_tax_tips: bool = True
    max_insights: int = 5
    currency_symbol: str = "$"


class ReportGenerator:
    """
    Generates formatted reports for various budget and tax summaries.
    """
    
    def __init__(self, config: Optional[ReportConfig] = None):
        self.config = config or ReportConfig()
    
    def weekly_summary(self, summary: SpendingSummary, 
                       insights: List[BudgetInsight]) -> str:
        """Generate weekly spending summary."""
        lines = []
        
        # Header
        week_start = summary.period_start.strftime("%b %d")
        week_end = summary.period_end.strftime("%b %d")
        lines.append(f"📊 **Weekly Summary** ({week_start} - {week_end})")
        lines.append("")
        
        # Quick stats
        lines.append(f"💰 Spent: **${float(summary.total_spending):,.2f}**")
        lines.append(f"📈 Income: ${float(summary.total_income):,.2f}")
        if summary.net_cash_flow >= 0:
            lines.append(f"✅ Net: +${float(summary.net_cash_flow):,.2f}")
        else:
            lines.append(f"⚠️ Net: -${float(abs(summary.net_cash_flow)):,.2f}")
        lines.append("")
        
        # Top spending
        lines.append("**Top Categories:**")
        for i, cat in enumerate(summary.top_categories(5), 1):
            pct_of_total = float(cat.amount / summary.total_spending * 100) if summary.total_spending > 0 else 0
            lines.append(f"{i}. {cat.name}: ${float(cat.amount):,.2f} ({pct_of_total:.0f}%)")
        lines.append("")
        
        # Key insights
        if insights:
            priority_insights = sorted(insights, key=lambda i: -i.priority)[:3]
            lines.append("**Key Insights:**")
            for insight in priority_insights:
                emoji = {"warning": "⚠️", "opportunity": "💡", "achievement": "✅", "info": "ℹ️"}.get(insight.type, "•")
                lines.append(f"{emoji} {insight.title}")
        
        return "\n".join(lines)
    
    def monthly_summary(self, summary: SpendingSummary,
                        insights: List[BudgetInsight],
                        last_month: Optional[SpendingSummary] = None) -> str:
        """Generate monthly spending summary."""
        lines = []
        
        # Header
        month_name = summary.period_start.strftime("%B %Y")
        lines.append(f"📅 **Monthly Report — {month_name}**")
        lines.append("")
        
        # Overview
        lines.append("**Overview**")
        lines.append(f"• Income: ${float(summary.total_income):,.2f}")
        lines.append(f"• Spending: ${float(summary.total_spending):,.2f}")
        lines.append(f"• Net: ${float(summary.net_cash_flow):,.2f}")
        if summary.savings_rate is not None:
            emoji = "✅" if summary.savings_rate >= 15 else "📊"
            lines.append(f"• Savings Rate: {emoji} {summary.savings_rate:.1f}%")
        lines.append("")
        
        # Month-over-month comparison
        if last_month:
            spending_change = summary.total_spending - last_month.total_spending
            pct_change = float(spending_change / last_month.total_spending * 100) if last_month.total_spending > 0 else 0
            
            if spending_change > 0:
                lines.append(f"📈 Spending up ${float(spending_change):,.2f} ({pct_change:+.1f}%) from last month")
            else:
                lines.append(f"📉 Spending down ${float(abs(spending_change)):,.2f} ({pct_change:.1f}%) from last month")
            lines.append("")
        
        # Category breakdown
        lines.append("**Category Breakdown**")
        for cat in summary.top_categories(8):
            budget_indicator = ""
            if cat.budget_percent is not None:
                if cat.budget_percent > 100:
                    budget_indicator = f" ⚠️ {cat.budget_percent:.0f}%"
                elif cat.budget_percent > 80:
                    budget_indicator = f" 🟡 {cat.budget_percent:.0f}%"
                else:
                    budget_indicator = f" 🟢 {cat.budget_percent:.0f}%"
            
            mom_indicator = ""
            if cat.month_over_month_change is not None:
                if abs(cat.month_over_month_change) > 20:
                    direction = "↑" if cat.month_over_month_change > 0 else "↓"
                    mom_indicator = f" {direction}{abs(cat.month_over_month_change):.0f}%"
            
            lines.append(f"• {cat.name}: ${float(cat.amount):,.2f}{budget_indicator}{mom_indicator}")
        lines.append("")
        
        # Insights
        if insights:
            lines.append("**Insights & Opportunities**")
            for insight in sorted(insights, key=lambda i: -i.priority)[:self.config.max_insights]:
                emoji = {"warning": "⚠️", "opportunity": "💡", "achievement": "✅", "info": "ℹ️"}.get(insight.type, "•")
                lines.append(f"{emoji} **{insight.title}**: {insight.message}")
            lines.append("")
        
        # Budget status
        over_budget = summary.over_budget_categories()
        if over_budget:
            lines.append("**⚠️ Over Budget**")
            for cat in over_budget:
                lines.append(f"• {cat.name}: ${float(abs(cat.budget_remaining)):,.2f} over")
            lines.append("")
        
        return "\n".join(lines)
    
    def year_end_tax_summary(self, tax_summary: TaxSummary, 
                              tax_tips: List[str]) -> str:
        """Generate year-end tax summary report."""
        lines = []
        
        lines.append(f"🧾 **{tax_summary.tax_year} Tax Summary**")
        lines.append("")
        
        # Income overview
        lines.append("**Income**")
        lines.append(f"• Gross: ${float(tax_summary.gross_income):,.2f}")
        lines.append("")
        
        # Deductions
        lines.append("**Deductions Tracked**")
        for dtype, amount in tax_summary.deductions.items():
            if amount > 0:
                lines.append(f"• {dtype.value.replace('_', ' ').title()}: ${float(amount):,.2f}")
        lines.append(f"• **Total**: ${float(tax_summary.total_deductions):,.2f}")
        lines.append("")
        
        # Recommendation
        if tax_summary.itemize_recommended:
            lines.append("📋 **Itemizing recommended** — deductions exceed standard deduction")
        else:
            lines.append("📋 **Standard deduction recommended**")
        lines.append("")
        
        # Estimated taxes
        lines.append("**Estimated Tax Liability**")
        lines.append(f"• Federal: ${float(tax_summary.estimated_federal_tax):,.2f}")
        lines.append(f"• Illinois: ${float(tax_summary.estimated_state_tax):,.2f}")
        lines.append(f"• **Total**: ${float(tax_summary.estimated_total_tax):,.2f}")
        lines.append("")
        
        # Tips
        if tax_tips and self.config.include_tax_tips:
            lines.append("**Tax Tips**")
            for tip in tax_tips[:4]:
                lines.append(tip)
            lines.append("")
        
        lines.append("_Estimates for planning only. Consult a tax professional._")
        
        return "\n".join(lines)
    
    def bills_reminder(self, upcoming_bills: List[Dict[str, Any]]) -> str:
        """Generate upcoming bills reminder."""
        lines = []
        
        lines.append("📬 **Upcoming Bills**")
        lines.append("")
        
        total = Decimal("0")
        for bill in sorted(upcoming_bills, key=lambda b: b.get("due_date", "")):
            due = bill.get("due_date", "")
            name = bill.get("name", "Unknown")
            amount = Decimal(str(bill.get("amount", 0)))
            auto_pay = bill.get("auto_pay", False)
            
            status = "✅ Auto-pay" if auto_pay else "📝 Manual"
            lines.append(f"• **{name}**: ${float(amount):,.2f} — {due} ({status})")
            total += amount
        
        lines.append("")
        lines.append(f"**Total Due**: ${float(total):,.2f}")
        
        return "\n".join(lines)
    
    def subscription_audit(self, subscriptions: List[Dict[str, Any]]) -> str:
        """Generate subscription audit report."""
        lines = []
        
        lines.append("📱 **Subscription Audit**")
        lines.append("")
        
        monthly_total = Decimal("0")
        annual_total = Decimal("0")
        
        # Group by category
        by_category: Dict[str, List] = {}
        for sub in subscriptions:
            cat = sub.get("category", "Other")
            if cat not in by_category:
                by_category[cat] = []
            by_category[cat].append(sub)
        
        for category, subs in sorted(by_category.items()):
            lines.append(f"**{category}**")
            for sub in subs:
                name = sub.get("name", "Unknown")
                amount = Decimal(str(sub.get("amount", 0)))
                frequency = sub.get("frequency", "monthly")
                
                if frequency == "annual":
                    monthly_equiv = amount / 12
                    lines.append(f"• {name}: ${float(amount):,.2f}/yr (${float(monthly_equiv):,.2f}/mo)")
                    annual_total += amount
                else:
                    lines.append(f"• {name}: ${float(amount):,.2f}/mo")
                    monthly_total += amount
            lines.append("")
        
        total_monthly = monthly_total + (annual_total / 12)
        lines.append(f"**Monthly Total**: ${float(total_monthly):,.2f}")
        lines.append(f"**Annual Total**: ${float(total_monthly * 12):,.2f}")
        lines.append("")
        lines.append("_Review for services you no longer use!_")
        
        return "\n".join(lines)


# Convenience function
def get_report_generator(config: Optional[ReportConfig] = None) -> ReportGenerator:
    """Get a configured report generator."""
    return ReportGenerator(config)
