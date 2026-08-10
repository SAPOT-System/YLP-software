# MikroTik Telemetry API

Machine-readable spec: [`openapi/mikrotik-telemetry.yaml`](openapi/mikrotik-telemetry.yaml) (generated from the live FastAPI app).

The MikroTik telemetry endpoints (router in `server/app/api/mikrotik.py`, prefix `/api/admin/router`) expose router health and network interface traffic data collected by the background `collect_metrics_loop` thread. All endpoints require admin auth (`get_current_user_admin`).

---

## Endpoints at a glance

| Method | Path | Auth | Summary |
|---|---|---|---|
| GET | `/api/admin/router/health/latest` | Admin | Return the single most recent `RouterHealth` snapshot. |
| GET | `/api/admin/router/health/history` | Admin | Return recent `RouterHealth` snapshots, most recent first. Query param: `limit` (default 50). |
| GET | `/api/admin/router/traffic/{interface}` | Admin | Return `InterfaceTraffic` history for a specific interface, most recent first. Query param: `limit` (default 100). |
| GET | `/api/admin/router/dashboard` | Admin | Return the latest health snapshot plus all traffic rows, combined. |

---

None of these routes declare a `response_model`, so the generated YAML's `200` response schema is empty (`{}`) for all four — the shapes below are the only documented response structure.

| Endpoint | Response 200 |
|---|---|
| `GET /api/admin/router/health/latest` | A single `RouterHealth` object, or `null` if no snapshot has been collected yet (not a `404`). |
| `GET /api/admin/router/health/history` | Array of `RouterHealth` objects, most recent first (`limit` query param, default `50`). |
| `GET /api/admin/router/traffic/{interface}` | Array of `InterfaceTraffic` objects for the given interface (path param, e.g. `ether1`), most recent first (`limit` query param, default `100`). |
| `GET /api/admin/router/dashboard` | `{ "health": <RouterHealth>, "traffic": [<InterfaceTraffic>] }` — the latest health snapshot plus all traffic rows, combined. |

---

## Background collection

Metrics are collected by `db_operations/router_metrics_collector.py` (`collect_metrics_loop`), which runs as a daemon thread started at server startup (see `lifespan` in `server/app/main.py`). It polls the MikroTik router via the `RouterOS-api` Python library and writes snapshots to the `RouterHealth` and `InterfaceTraffic` tables.

Router connection parameters (IP, username, password) are configured via environment variables. See [environment-config.md](../deployment/environment-config.md).

For full request/response schemas, see [`openapi/mikrotik-telemetry.yaml`](openapi/mikrotik-telemetry.yaml) or the live server's `/docs` / `/openapi.json`.
