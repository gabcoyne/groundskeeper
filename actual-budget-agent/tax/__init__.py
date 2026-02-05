"""
Tax Advisory Module

Illinois and Chicago-specific tax tracking, deduction identification,
and tax planning assistance.
"""

from dataclasses import dataclass, field
from datetime import datetime, date
from decimal import Decimal
from typing import Dict, List, Optional, Any
from enum import Enum


class DeductionType(Enum):
    """Types of tax deductions."""
    CHARITABLE = "charitable"
    MEDICAL = "medical"
    STATE_LOCAL_TAX = "salt"  # SALT deduction
    MORTGAGE_INTEREST = "mortgage_interest"
    PROPERTY_TAX = "property_tax"
    BUSINESS = "business"
    EDUCATION = "education"
    HOME_OFFICE = "home_office"
    INVESTMENT_LOSSES = "investment_losses"


@dataclass
class TaxDeduction:
    """A tracked tax deduction."""
    type: DeductionType
    description: str
    amount: Decimal
    date: date
    category: Optional[str] = None
    receipt_path: Optional[str] = None
    verified: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type.value,
            "description": self.description,
            "amount": float(self.amount),
            "date": self.date.isoformat(),
            "category": self.category,
            "verified": self.verified,
        }


@dataclass
class IllinoisTaxInfo:
    """Illinois-specific tax information (2025-2026)."""
    
    # Illinois flat income tax rate
    STATE_INCOME_TAX_RATE = Decimal("0.0495")  # 4.95%
    
    # Chicago area sales tax (varies slightly by location)
    CHICAGO_SALES_TAX = Decimal("0.1025")  # 10.25%
    
    # Cook County specific
    COOK_COUNTY_SALES_TAX = Decimal("0.0175")  # Included in Chicago rate
    
    # Property tax (Cook County average effective rate)
    COOK_COUNTY_PROPERTY_TAX_RATE = Decimal("0.0196")  # ~1.96%
    
    # Federal SALT deduction cap (married filing jointly)
    SALT_CAP_MFJ = Decimal("10000")
    SALT_CAP_SINGLE = Decimal("10000")
    
    # Standard deductions (2025)
    STANDARD_DEDUCTION_MFJ = Decimal("29200")
    STANDARD_DEDUCTION_SINGLE = Decimal("14600")
    
    # Illinois has no standard deduction - flat tax on federal AGI


@dataclass
class TaxSummary:
    """Summary of tax-relevant information for a year."""
    tax_year: int
    
    # Income
    gross_income: Decimal = Decimal("0")
    w2_income: Decimal = Decimal("0")
    investment_income: Decimal = Decimal("0")
    other_income: Decimal = Decimal("0")
    
    # Deductions by type
    deductions: Dict[DeductionType, Decimal] = field(default_factory=dict)
    
    # Totals
    total_deductions: Decimal = Decimal("0")
    itemize_recommended: bool = False
    
    # Estimated taxes
    estimated_federal_tax: Decimal = Decimal("0")
    estimated_state_tax: Decimal = Decimal("0")
    estimated_total_tax: Decimal = Decimal("0")
    
    # Payments
    federal_withholding: Decimal = Decimal("0")
    state_withholding: Decimal = Decimal("0")
    estimated_payments: Decimal = Decimal("0")
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "tax_year": self.tax_year,
            "gross_income": float(self.gross_income),
            "total_deductions": float(self.total_deductions),
            "itemize_recommended": self.itemize_recommended,
            "estimated_federal_tax": float(self.estimated_federal_tax),
            "estimated_state_tax": float(self.estimated_state_tax),
            "federal_withholding": float(self.federal_withholding),
            "state_withholding": float(self.state_withholding),
        }


# Categories that may be tax-deductible
DEDUCTIBLE_CATEGORIES = {
    # Charitable
    "Charitable": DeductionType.CHARITABLE,
    "Donations": DeductionType.CHARITABLE,
    "Charity": DeductionType.CHARITABLE,
    
    # Medical
    "Health:Medical": DeductionType.MEDICAL,
    "Health:Dental": DeductionType.MEDICAL,
    "Health:Vision": DeductionType.MEDICAL,
    "Health:Pharmacy": DeductionType.MEDICAL,
    "Medical": DeductionType.MEDICAL,
    
    # Property/SALT
    "Property Tax": DeductionType.PROPERTY_TAX,
    "Taxes:Property": DeductionType.PROPERTY_TAX,
    
    # Home Office (if applicable)
    "Home Office": DeductionType.HOME_OFFICE,
    "Business:Supplies": DeductionType.BUSINESS,
    
    # Education
    "Education": DeductionType.EDUCATION,
    "Education:Tuition": DeductionType.EDUCATION,
}


class TaxAdvisor:
    """
    Provides tax advice and deduction tracking for Illinois/Chicago residents.
    
    Tracks deductible expenses, estimates tax liability, and provides
    actionable tax planning advice.
    """
    
    def __init__(self, filing_status: str = "married_filing_jointly"):
        self.filing_status = filing_status
        self.tax_info = IllinoisTaxInfo()
        self._deductions: List[TaxDeduction] = []
    
    @property
    def standard_deduction(self) -> Decimal:
        if self.filing_status == "married_filing_jointly":
            return self.tax_info.STANDARD_DEDUCTION_MFJ
        return self.tax_info.STANDARD_DEDUCTION_SINGLE
    
    @property
    def salt_cap(self) -> Decimal:
        if self.filing_status == "married_filing_jointly":
            return self.tax_info.SALT_CAP_MFJ
        return self.tax_info.SALT_CAP_SINGLE
    
    def add_deduction(self, deduction: TaxDeduction) -> None:
        """Add a tracked deduction."""
        self._deductions.append(deduction)
    
    def identify_deductible(self, category: str, amount: Decimal, 
                           description: str, txn_date: date) -> Optional[TaxDeduction]:
        """
        Check if a transaction category is potentially deductible.
        
        Returns a TaxDeduction if applicable, None otherwise.
        """
        deduction_type = DEDUCTIBLE_CATEGORIES.get(category)
        if deduction_type is None:
            # Check partial matches
            for cat_pattern, dtype in DEDUCTIBLE_CATEGORIES.items():
                if cat_pattern.lower() in category.lower():
                    deduction_type = dtype
                    break
        
        if deduction_type:
            return TaxDeduction(
                type=deduction_type,
                description=description,
                amount=amount,
                date=txn_date,
                category=category,
            )
        return None
    
    def get_deductions_by_type(self, tax_year: int) -> Dict[DeductionType, Decimal]:
        """Get total deductions grouped by type for a tax year."""
        totals: Dict[DeductionType, Decimal] = {}
        
        for d in self._deductions:
            if d.date.year == tax_year:
                current = totals.get(d.type, Decimal("0"))
                totals[d.type] = current + d.amount
        
        return totals
    
    def calculate_tax_summary(self, tax_year: int, gross_income: Decimal,
                              property_tax: Decimal = Decimal("0")) -> TaxSummary:
        """
        Calculate estimated tax summary for the year.
        
        Note: This is an estimate for planning purposes only.
        Consult a tax professional for actual filing.
        """
        summary = TaxSummary(tax_year=tax_year)
        summary.gross_income = gross_income
        
        # Get deductions
        deductions = self.get_deductions_by_type(tax_year)
        summary.deductions = deductions
        
        # Calculate totals
        charitable = deductions.get(DeductionType.CHARITABLE, Decimal("0"))
        medical = deductions.get(DeductionType.MEDICAL, Decimal("0"))
        
        # SALT (capped)
        salt_total = property_tax + deductions.get(DeductionType.STATE_LOCAL_TAX, Decimal("0"))
        salt_deductible = min(salt_total, self.salt_cap)
        
        # Medical (only amount exceeding 7.5% of AGI)
        medical_floor = gross_income * Decimal("0.075")
        medical_deductible = max(Decimal("0"), medical - medical_floor)
        
        # Total itemized deductions
        total_itemized = charitable + medical_deductible + salt_deductible
        summary.total_deductions = total_itemized
        
        # Should we itemize?
        summary.itemize_recommended = total_itemized > self.standard_deduction
        
        effective_deduction = max(total_itemized, self.standard_deduction)
        
        # Federal taxable income (simplified)
        federal_taxable = max(Decimal("0"), gross_income - effective_deduction)
        
        # Estimate federal tax (simplified 2025 brackets for MFJ)
        summary.estimated_federal_tax = self._estimate_federal_tax(federal_taxable)
        
        # Illinois state tax (flat rate on federal AGI)
        summary.estimated_state_tax = gross_income * self.tax_info.STATE_INCOME_TAX_RATE
        
        summary.estimated_total_tax = summary.estimated_federal_tax + summary.estimated_state_tax
        
        return summary
    
    def _estimate_federal_tax(self, taxable_income: Decimal) -> Decimal:
        """
        Estimate federal tax using 2025 brackets (MFJ).
        
        Simplified calculation - actual tax depends on many factors.
        """
        # 2025 MFJ brackets (approximate)
        brackets = [
            (Decimal("23200"), Decimal("0.10")),
            (Decimal("94300"), Decimal("0.12")),
            (Decimal("201050"), Decimal("0.22")),
            (Decimal("383900"), Decimal("0.24")),
            (Decimal("487450"), Decimal("0.32")),
            (Decimal("731200"), Decimal("0.35")),
            (None, Decimal("0.37")),
        ]
        
        tax = Decimal("0")
        remaining = taxable_income
        prev_limit = Decimal("0")
        
        for limit, rate in brackets:
            if limit is None:
                tax += remaining * rate
                break
            
            bracket_income = min(remaining, limit - prev_limit)
            if bracket_income <= 0:
                break
            
            tax += bracket_income * rate
            remaining -= bracket_income
            prev_limit = limit
        
        return tax
    
    def get_quarterly_estimate_dates(self, tax_year: int) -> List[date]:
        """Get quarterly estimated tax payment due dates."""
        return [
            date(tax_year, 4, 15),      # Q1
            date(tax_year, 6, 15),      # Q2
            date(tax_year, 9, 15),      # Q3
            date(tax_year + 1, 1, 15),  # Q4
        ]
    
    def generate_tax_tips(self, summary: TaxSummary) -> List[str]:
        """Generate actionable tax planning tips."""
        tips = []
        
        # Itemization recommendation
        if summary.itemize_recommended:
            tips.append(
                f"📋 **Itemize Deductions**: Your deductions (${float(summary.total_deductions):,.0f}) "
                f"exceed the standard deduction (${float(self.standard_deduction):,.0f}). Keep receipts!"
            )
        else:
            shortfall = self.standard_deduction - summary.total_deductions
            tips.append(
                f"📋 **Standard Deduction Better**: You're ${float(shortfall):,.0f} short of itemizing. "
                f"Consider bunching charitable donations or medical expenses."
            )
        
        # SALT cap warning
        salt = summary.deductions.get(DeductionType.PROPERTY_TAX, Decimal("0"))
        if salt >= self.salt_cap * Decimal("0.8"):
            tips.append(
                f"⚠️ **SALT Cap Alert**: Property/state taxes near the ${float(self.salt_cap):,.0f} cap. "
                f"Additional property taxes won't increase federal deductions."
            )
        
        # Medical expense threshold
        medical = summary.deductions.get(DeductionType.MEDICAL, Decimal("0"))
        medical_floor = summary.gross_income * Decimal("0.075")
        if medical > Decimal("0") and medical < medical_floor:
            tips.append(
                f"💊 **Medical Expense Threshold**: Only medical expenses over 7.5% of income "
                f"(${float(medical_floor):,.0f}) are deductible. Consider HSA contributions instead."
            )
        
        # Illinois-specific
        tips.append(
            f"🏛️ **Illinois Flat Tax**: IL taxes all income at 4.95% with no deductions. "
            f"Your estimated IL tax is ${float(summary.estimated_state_tax):,.0f}."
        )
        
        # Chicago sales tax reminder
        tips.append(
            f"🏙️ **Chicago Sales Tax**: At 10.25%, consider major purchases outside Cook County "
            f"when practical (saves ~2-3%)."
        )
        
        return tips
    
    def format_tax_report(self, summary: TaxSummary) -> str:
        """Format a human-readable tax summary report."""
        lines = []
        
        lines.append(f"🧾 **Tax Summary - {summary.tax_year}**")
        lines.append("")
        
        lines.append("**Income**")
        lines.append(f"• Gross Income: ${float(summary.gross_income):,.2f}")
        lines.append("")
        
        lines.append("**Deductions**")
        for dtype, amount in summary.deductions.items():
            lines.append(f"• {dtype.value.replace('_', ' ').title()}: ${float(amount):,.2f}")
        lines.append(f"• **Total Itemized**: ${float(summary.total_deductions):,.2f}")
        lines.append(f"• Standard Deduction: ${float(self.standard_deduction):,.2f}")
        lines.append(f"• **Recommendation**: {'Itemize' if summary.itemize_recommended else 'Standard Deduction'}")
        lines.append("")
        
        lines.append("**Estimated Taxes**")
        lines.append(f"• Federal: ${float(summary.estimated_federal_tax):,.2f}")
        lines.append(f"• Illinois (4.95%): ${float(summary.estimated_state_tax):,.2f}")
        lines.append(f"• **Total**: ${float(summary.estimated_total_tax):,.2f}")
        lines.append("")
        
        lines.append("*Note: Estimates for planning only. Consult a tax professional.*")
        
        return "\n".join(lines)


# Convenience function
def get_tax_advisor(filing_status: str = "married_filing_jointly") -> TaxAdvisor:
    """Get a configured tax advisor."""
    return TaxAdvisor(filing_status=filing_status)
