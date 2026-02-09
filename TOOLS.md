# TOOLS.md - Coyne Home Credentials & References

## UniFi API Access

**Controller**: `https://10.6.66.1` (UDM Pro)
**API Key**: `rt8ZeU70yqJPtt5ybvbd_QVBg5JYkFU3`

### Request Format

```bash
curl -k -X GET 'https://10.6.66.1/proxy/network/integration/v1/<endpoint>' \
  -H 'X-API-KEY: rt8ZeU70yqJPtt5ybvbd_QVBg5JYkFU3' \
  -H 'Accept: application/json'
```

Note: `-k` flag required (self-signed cert)

### Common Endpoints

**Sites & Devices**
- `GET /sites` — List all sites
- `GET /sites/{siteId}/devices` — List devices at site
- `GET /sites/{siteId}/devices/{deviceId}` — Device details

**Clients**
- `GET /sites/{siteId}/clients` — Connected clients
- `GET /sites/{siteId}/clients/{clientId}` — Client details

**Networks**
- `GET /sites/{siteId}/networks` — Network/VLAN configs
- `GET /sites/{siteId}/networks/{networkId}` — Network details

**WiFi**
- `GET /sites/{siteId}/wifi/accesspoints` — AP status
- `GET /sites/{siteId}/wifi/networks` — WLAN configs

**System**
- `GET /sites/{siteId}/system/status` — System health
- `GET /sites/{siteId}/system/alerts` — Active alerts

### Helper Function

For convenience, use this pattern in exec:

```bash
unifi() {
  curl -sk -X "${2:-GET}" "https://10.6.66.1/proxy/network/integration/v1$1" \
    -H 'X-API-KEY: rt8ZeU70yqJPtt5ybvbd_QVBg5JYkFU3' \
    -H 'Accept: application/json' \
    -H 'Content-Type: application/json' \
    ${3:+-d "$3"}
}
# Usage: unifi /sites
# Usage: unifi /sites/default/clients
```

## Network Context

- **Environment**: Home network + homelab + production services
- **Primary gateway**: 10.6.66.1 (UDM Pro)
- **Site ID**: `88f7af54-98f8-306a-a1c7-c9349722b1f6` (Default)
- **Optimization window**: 2 AM daily (low traffic)

### Discovered Devices (Feb 5, 2026)

| Name | Model | IP | State |
|------|-------|-----|-------|
| Dream Machine Pro | UDM Pro | 104.51.29.34 | ONLINE |
| US 24 | US 24 | 10.6.66.119 | ONLINE |
| USW-Lite-8-PoE | USW-Lite-8-PoE | 10.6.66.65 | ONLINE |
| First Floor | U6 LR | 10.6.66.7 | ONLINE |
| Second Floor | U6 Pro | 10.6.66.16 | ONLINE |
| Attic | U6 Pro | 10.6.66.20 | ONLINE |
| Basement | U6 Pro | 10.6.66.101 | ONLINE |
| Garage | U6 LR | 10.6.66.175 | ⚠️ OFFLINE |
| Garage LR | U6 LR | 10.6.66.183 | ⚠️ OFFLINE |

---

## Actual Budget

**Internal URL**: `http://actual-budget:5006`
**External URL**: `https://actual.coyne.sh` (requires Tailscale)

**Budget Name**: My Finances
**File ID**: `51b5bac4-bacd-4fa6-9043-1b5c459164eb`
**Sync ID**: `9b174808-0fe7-4d4d-9b09-7573d3caf074`
**Password**: `RGR!vwy*hay.vgm0dpg`

### Direct SQLite Access (Preferred for Reads)

**Database Path** (after budget download):
```
actual-budget-agent/scripts/actual-data/My-Finances-5da68fc/db.sqlite
```

**Use SQLite for:** Large queries, reports, analytics, bulk reads
**Use API for:** Writes, syncing changes to server

```javascript
const Database = require('better-sqlite3');
const db = new Database('./actual-data/My-Finances-5da68fc/db.sqlite', { readonly: true });

const txns = db.prepare(`
  SELECT t.*, c.name as category, p.name as payee
  FROM transactions t
  LEFT JOIN categories c ON t.category = c.id
  LEFT JOIN payees p ON t.payee = p.id
  WHERE t.tombstone = 0
`).all();

db.close();
```

**Key Tables:** `transactions`, `categories`, `category_groups`, `zero_budgets`, `payees`, `accounts`
**Note:** Amounts are in cents (divide by 100)

### API Usage

```bash
# 1. Get token
TOKEN=$(curl -s -X POST http://actual-budget:5006/account/login \
  -H "Content-Type: application/json" \
  -d '{"password": "RGR!vwy*hay.vgm0dpg"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 2. List budgets
curl -s http://actual-budget:5006/sync/list-user-files \
  -H "x-actual-token: $TOKEN"
```

API docs: https://actualbudget.org/docs/api/

---

## Gmail API (Receipt Fetching)

**Credentials Location**: `/home/node/.openclaw/workspace/gmail-calendar-agent/`
**Tokens Path**: `auth/tokens.json`
**Project ID**: `coyne-home`

Credentials stored externally at the location above (not in repo for security).
Refresh token already obtained.

### Scopes Available
- `gmail.modify` — Read/label emails
- `gmail.labels` — Manage labels
- `calendar` — Full calendar access
- `calendar.events` — Event management

### Existing Tools
- `receipt_extractor.py` — Basic receipt extraction (needs improvement)
- Integration with Actual Budget: TBD

---

## Home Automation

*(To be configured)*

**Platform**: TBD (Home Assistant / Hubitat / SmartThings)
**API Endpoint**: 
**API Token**: 

### Devices
*(Add smart home devices here)*

---

## Household Accounting

*(To be configured)*

### Recurring Bills
| Bill | Amount | Due Date | Auto-Pay |
|------|--------|----------|----------|
| | | | |

### Subscriptions
| Service | Cost | Billing Cycle |
|---------|------|---------------|
| | | |

---

## Home Maintenance

### Appliances
| Appliance | Brand/Model | Purchase Date | Warranty Expires |
|-----------|-------------|---------------|------------------|
| | | | |

### Service Contacts
| Service | Provider | Phone | Notes |
|---------|----------|-------|-------|
| HVAC | | | |
| Plumbing | | | |
| Electric | | | |

### Maintenance Schedule
| Task | Frequency | Last Done | Next Due |
|------|-----------|-----------|----------|
| HVAC filter | Monthly | | |
| | | | |

---

## Change Log

Document all configuration changes here with date and reason.

- **2026-02-05**: Agent expanded from network-admin to full home agent
