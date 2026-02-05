"""
Transaction Categorizer

Auto-categorizes transactions based on payee patterns and learning.
"""

import re
import json
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field, asdict
from pathlib import Path


# Default category mappings based on common payee patterns
DEFAULT_PATTERNS = {
    # Groceries
    r"(?i)(whole foods|trader joe|jewel|mariano|aldi|costco|target|walmart.*grocery)": "Groceries",
    r"(?i)(safeway|kroger|publix|wegmans|sprouts|fresh market)": "Groceries",
    
    # Dining
    r"(?i)(uber\s*eats|doordash|grubhub|postmates|seamless)": "Dining:Delivery",
    r"(?i)(mcdonald|burger king|wendy|taco bell|chipotle|panera|subway)": "Dining:Fast Food",
    r"(?i)(starbucks|dunkin|peet|blue bottle|intelligentsia)": "Dining:Coffee",
    r"(?i)(restaurant|grill|bistro|cafe|diner|kitchen|tavern|bar\s|pub\s)": "Dining:Restaurants",
    
    # Transportation
    r"(?i)(uber(?!\s*eats)|lyft|via\s)": "Transportation:Rideshare",
    r"(?i)(shell|bp|exxon|mobil|chevron|speedway|gas)": "Transportation:Gas",
    r"(?i)(cta\s|metra|ventra|transit|parking)": "Transportation:Public Transit",
    r"(?i)(jiffy lube|valvoline|car wash|autozone|advance auto)": "Transportation:Auto Maintenance",
    
    # Utilities
    r"(?i)(comed|peoples gas|nicor|xcel energy|electric|gas\s*bill)": "Utilities:Electric & Gas",
    r"(?i)(comcast|xfinity|at&t|verizon|t-mobile|sprint|internet|phone)": "Utilities:Phone & Internet",
    r"(?i)(water|sewer|waste|garbage|recycling)": "Utilities:Water & Waste",
    
    # Subscriptions
    r"(?i)(netflix|hulu|disney|hbo|spotify|apple\s*(music|tv)|amazon\s*prime|youtube\s*premium)": "Subscriptions:Streaming",
    r"(?i)(gym|fitness|planet fitness|equinox|crossfit|peloton)": "Subscriptions:Fitness",
    r"(?i)(adobe|microsoft|google\s*(one|storage)|dropbox|icloud)": "Subscriptions:Software",
    r"(?i)(nytimes|wsj|washington post|substack|patreon|medium)": "Subscriptions:News & Media",
    
    # Shopping
    r"(?i)(amazon(?!\s*prime)|ebay|etsy|wayfair|overstock)": "Shopping:Online",
    r"(?i)(home depot|lowes|menards|ace hardware)": "Shopping:Home Improvement",
    r"(?i)(best buy|apple\s*store|micro center|b&h)": "Shopping:Electronics",
    r"(?i)(nordstrom|macy|gap|old navy|zara|h&m|uniqlo)": "Shopping:Clothing",
    r"(?i)(ikea|crate|barrel|pottery barn|cb2|west elm)": "Shopping:Home & Furniture",
    
    # Health
    r"(?i)(cvs|walgreens|rite aid|pharmacy|rx)": "Health:Pharmacy",
    r"(?i)(doctor|medical|clinic|hospital|urgent care|labcorp|quest)": "Health:Medical",
    r"(?i)(dentist|dental|orthodont)": "Health:Dental",
    r"(?i)(optom|eye|vision|glasses|contacts)": "Health:Vision",
    
    # Insurance
    r"(?i)(state farm|allstate|geico|progressive|liberty mutual|insurance)": "Insurance",
    
    # Financial
    r"(?i)(interest|dividend|yield)": "Income:Interest",
    r"(?i)(payroll|salary|direct deposit|employer)": "Income:Salary",
    r"(?i)(atm|withdrawal|cash)": "Cash & ATM",
    r"(?i)(transfer|zelle|venmo|paypal|cash\s*app)": "Transfers",
    
    # Chicago Specific
    r"(?i)(chicago\s*skyway|ipass|tollway)": "Transportation:Tolls",
    r"(?i)(chicago\s*park|cpd|field museum|art institute|shedd)": "Entertainment:Chicago",
}


@dataclass
class CategoryRule:
    """A rule for categorizing transactions."""
    pattern: str
    category: str
    confidence: float = 1.0
    learned: bool = False
    match_count: int = 0


@dataclass
class CategorizerConfig:
    """Configuration for the categorizer."""
    rules: List[CategoryRule] = field(default_factory=list)
    custom_mappings: Dict[str, str] = field(default_factory=dict)  # payee -> category
    
    def save(self, path: Path) -> None:
        """Save configuration to file."""
        data = {
            "rules": [asdict(r) for r in self.rules],
            "custom_mappings": self.custom_mappings,
        }
        path.write_text(json.dumps(data, indent=2))
    
    @classmethod
    def load(cls, path: Path) -> "CategorizerConfig":
        """Load configuration from file."""
        if not path.exists():
            return cls.default()
        data = json.loads(path.read_text())
        rules = [CategoryRule(**r) for r in data.get("rules", [])]
        return cls(
            rules=rules,
            custom_mappings=data.get("custom_mappings", {}),
        )
    
    @classmethod
    def default(cls) -> "CategorizerConfig":
        """Create default configuration with standard patterns."""
        rules = [
            CategoryRule(pattern=pattern, category=category)
            for pattern, category in DEFAULT_PATTERNS.items()
        ]
        return cls(rules=rules)


class TransactionCategorizer:
    """
    Categorizes transactions based on payee name and patterns.
    
    Features:
    - Pattern matching with regex
    - Learning from user corrections
    - Confidence scoring
    """
    
    def __init__(self, config: Optional[CategorizerConfig] = None, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or Path(__file__).parent.parent / "data"
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.config_path = self.data_dir / "categorizer_config.json"
        self.config = config or CategorizerConfig.load(self.config_path)
        
        # Initialize with defaults if empty
        if not self.config.rules:
            self.config = CategorizerConfig.default()
    
    def categorize(self, payee: str, amount: Optional[float] = None) -> Tuple[Optional[str], float]:
        """
        Categorize a transaction by payee name.
        
        Returns:
            Tuple of (category, confidence) where confidence is 0.0-1.0
        """
        payee_lower = payee.lower().strip()
        
        # Check custom mappings first (exact match, highest confidence)
        if payee_lower in self.config.custom_mappings:
            return self.config.custom_mappings[payee_lower], 1.0
        
        # Check pattern rules
        best_match: Optional[CategoryRule] = None
        best_confidence = 0.0
        
        for rule in self.config.rules:
            try:
                if re.search(rule.pattern, payee, re.IGNORECASE):
                    # Prefer learned rules, then by confidence
                    effective_confidence = rule.confidence
                    if rule.learned:
                        effective_confidence += 0.1  # Bonus for learned rules
                    
                    if effective_confidence > best_confidence:
                        best_match = rule
                        best_confidence = effective_confidence
            except re.error:
                continue
        
        if best_match:
            best_match.match_count += 1
            return best_match.category, min(best_confidence, 1.0)
        
        return None, 0.0
    
    def learn(self, payee: str, category: str) -> None:
        """Learn a new payee -> category mapping from user correction."""
        payee_lower = payee.lower().strip()
        self.config.custom_mappings[payee_lower] = category
        self.save()
    
    def add_pattern(self, pattern: str, category: str, confidence: float = 0.9) -> None:
        """Add a new pattern rule."""
        rule = CategoryRule(
            pattern=pattern,
            category=category,
            confidence=confidence,
            learned=True,
        )
        self.config.rules.append(rule)
        self.save()
    
    def save(self) -> None:
        """Save current configuration."""
        self.config.save(self.config_path)
    
    def get_categories(self) -> List[str]:
        """Get all known categories."""
        categories = set()
        for rule in self.config.rules:
            categories.add(rule.category)
        for category in self.config.custom_mappings.values():
            categories.add(category)
        return sorted(categories)
    
    def suggest_category(self, payee: str) -> List[Tuple[str, float]]:
        """
        Get multiple category suggestions with confidence scores.
        
        Returns top 3 suggestions.
        """
        suggestions = []
        payee_clean = payee.lower().strip()
        
        for rule in self.config.rules:
            try:
                if re.search(rule.pattern, payee, re.IGNORECASE):
                    suggestions.append((rule.category, rule.confidence))
            except re.error:
                continue
        
        # Sort by confidence, dedupe, return top 3
        seen = set()
        unique = []
        for cat, conf in sorted(suggestions, key=lambda x: -x[1]):
            if cat not in seen:
                seen.add(cat)
                unique.append((cat, conf))
        
        return unique[:3]


# Convenience function
def get_categorizer() -> TransactionCategorizer:
    """Get a configured categorizer instance."""
    return TransactionCategorizer()
