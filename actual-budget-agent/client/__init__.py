"""
Actual Budget API Client

Provides authenticated access to Actual Budget's sync API.
"""

import requests
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from datetime import datetime, date
import os


@dataclass
class ActualConfig:
    """Configuration for Actual Budget connection."""
    base_url: str = "http://actual-budget:5006"
    password: str = ""
    file_id: str = ""
    sync_id: str = ""
    
    @classmethod
    def from_env(cls) -> "ActualConfig":
        return cls(
            base_url=os.getenv("ACTUAL_URL", "http://actual-budget:5006"),
            password=os.getenv("ACTUAL_PASSWORD", ""),
            file_id=os.getenv("ACTUAL_FILE_ID", ""),
            sync_id=os.getenv("ACTUAL_SYNC_ID", ""),
        )
    
    @classmethod
    def default(cls) -> "ActualConfig":
        """Default config for Coyne household."""
        return cls(
            base_url="http://actual-budget:5006",
            password="RGR!vwy*hay.vgm0dpg",
            file_id="51b5bac4-bacd-4fa6-9043-1b5c459164eb",
            sync_id="9b174808-0fe7-4d4d-9b09-7573d3caf074",
        )


class ActualBudgetClient:
    """
    Client for Actual Budget API.
    
    Handles authentication, token management, and API calls.
    """
    
    def __init__(self, config: Optional[ActualConfig] = None):
        self.config = config or ActualConfig.default()
        self._token: Optional[str] = None
        self._token_expires: Optional[datetime] = None
    
    @property
    def token(self) -> str:
        """Get or refresh authentication token."""
        if self._token is None:
            self._authenticate()
        return self._token
    
    def _authenticate(self) -> None:
        """Authenticate and get access token."""
        response = requests.post(
            f"{self.config.base_url}/account/login",
            json={"password": self.config.password},
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
        
        if data.get("status") != "ok":
            raise Exception(f"Authentication failed: {data}")
        
        self._token = data["data"]["token"]
    
    def _headers(self) -> Dict[str, str]:
        """Get headers with authentication."""
        return {
            "x-actual-token": self.token,
            "Content-Type": "application/json",
        }
    
    def _get(self, endpoint: str, params: Optional[Dict] = None) -> Any:
        """Make authenticated GET request."""
        response = requests.get(
            f"{self.config.base_url}{endpoint}",
            headers=self._headers(),
            params=params,
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
    
    def _post(self, endpoint: str, data: Optional[Dict] = None) -> Any:
        """Make authenticated POST request."""
        response = requests.post(
            f"{self.config.base_url}{endpoint}",
            headers=self._headers(),
            json=data or {},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()
    
    # ========== Budget Files ==========
    
    def list_budgets(self) -> List[Dict]:
        """List all available budget files."""
        result = self._get("/sync/list-user-files")
        if result.get("status") == "ok":
            return result.get("data", [])
        return []
    
    def get_budget_info(self) -> Optional[Dict]:
        """Get info for configured budget."""
        budgets = self.list_budgets()
        for budget in budgets:
            if budget.get("fileId") == self.config.file_id:
                return budget
        return None
    
    # ========== Sync Operations ==========
    
    def download_budget(self) -> Dict:
        """Download/sync budget data."""
        return self._post("/sync/download-user-file", {
            "fileId": self.config.file_id,
            "token": self.token,
        })
    
    # ========== Query API ==========
    
    def query(self, query_text: str) -> Any:
        """
        Run an ActualQL query.
        
        Note: Requires the budget to be loaded. This is a simplified
        wrapper - for complex queries, use the full sync protocol.
        """
        return self._post("/api/query", {"query": query_text})
    
    # ========== Health Check ==========
    
    def health_check(self) -> Dict[str, Any]:
        """Check connection and authentication."""
        try:
            budgets = self.list_budgets()
            budget = self.get_budget_info()
            return {
                "status": "ok",
                "connected": True,
                "budget_count": len(budgets),
                "target_budget": budget.get("name") if budget else None,
                "budget_found": budget is not None,
            }
        except Exception as e:
            return {
                "status": "error",
                "connected": False,
                "error": str(e),
            }


# Convenience function
def get_client() -> ActualBudgetClient:
    """Get a configured Actual Budget client."""
    return ActualBudgetClient(ActualConfig.default())
