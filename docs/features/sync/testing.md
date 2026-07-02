# Sync — Testing

## Strategy

| Layer       | Tooling                          | Scope                                                        |
|-------------|----------------------------------|--------------------------------------------------------------|
| Unit        | Jest                             | SyncService orchestration, guest hint remapping, back-off logic |
| Integration | pytest + SQLite test DB          | Pull scoping, push processing order, conflict detection, FK guards |
| E2E         | Jest + WatermelonDB memory adapter | Full pull → merge → push → re-pull cycle on mobile side    |

---

## Coverage Targets

| Area                             | Target |
|----------------------------------|--------|
| SyncService pull/push sequencing | 100%   |
| Pull scoping rules               | 100%   |
| Conflict (409) handling          | 100%   |
| FK guard rejection               | 100%   |
| Soft-delete propagation          | 100%   |
| Pagination cursor                | 90%+   |
| Overall sync feature coverage    | ≥ 80%  |

---

## Mocking Rules

- **Server tests** — use pytest fixtures with an in-memory SQLite database (swap MariaDB dialect for testing).
- **Mobile tests** — use WatermelonDB `@nozbe/watermelondb/adapters/memory`; never write to disk.
- **Network** — mock `fetch` / `axios` at the boundary; never make real HTTP calls.
- **AsyncStorage** — mock with a plain in-memory object.
- **Clock** — use Jest fake timers for `updated_at` / `pulled_at` comparisons.

---

## Test Cases

### Pull Endpoint — Integration (pytest)

| Scenario | Expected result |
|----------|-----------------|
| Pull with `last_pulled_at = 0` | All records owned by user returned; `has_more` reflects total count |
| Pull with `last_pulled_at = T` | Only records with `updated_at > T` returned |
| Pull includes soft-deleted rows | Rows with `is_deleted = true` present in response if `updated_at > last_pulled_at` |
| Pull excludes records from other users' private conversations | Response contains only rows in conversations the user is a member of |
| Pull with `limit = 2` and 5 matching rows | First response has 2 rows, `has_more: true`, `next_cursor` set |
| Subsequent pull with `cursor` | Returns next 2 rows; after final page `has_more: false`, `next_cursor: null` |
| Pull with invalid JWT | Returns 401 |
| Pull with expired JWT | Returns 401; app must refresh token and retry |

### Push Endpoint — Integration (pytest)

| Scenario | Expected result |
|----------|-----------------|
| Push new conversation row | Row inserted in `conversations` table; response 200 |
| Push new message row (parent conversation exists) | Row inserted in `messages`; 200 |
| Push message_receipt where message exists | Row inserted; 200 |
| Push message_receipt where message does NOT exist | Returns 422; receipt discarded; other rows in batch unaffected |
| Push call_participant where call does NOT exist | Returns 422; participant row discarded |
| Push row with `updated_at <= server.updated_at` and `last_pulled_at` is current | No conflict; row upserted; 200 |
| Push row where `server.updated_at > last_pulled_at` | Returns 409 with `{ conflict: rowId, table }` |
| 409 response rolls back entire push | None of the batch rows are persisted |
| Push soft-deleted row (`is_deleted = true`) | Server row updated to `is_deleted = true`; 200 |
| Push with no rows | Returns 200 immediately; no DB writes |

### Conflict Resolution — Integration

| Scenario | Expected result |
|----------|-----------------|
| App receives 409 on push | App re-pulls with current `lastPulledAt`; conflicting row fetched |
| After re-pull, app retries push | Server `updated_at` now <= `last_pulled_at`; push succeeds; 200 |
| Concurrent pushes from two devices for same row | Second device gets 409; after pull it sees first device's version; no data loss |

### Mobile SyncService — Unit (Jest)

| Scenario | Expected result |
|----------|-----------------|
| `runSync()` called | Pull executed first; `lastPulledAt` updated; push executed after; no interleaving |
| Pull returns `guest_hints` | Hint map applied before WatermelonDB write; local UUIDs remapped to server UUIDs |
| Sync fails during pull (network error) | Push is skipped; error event emitted; `lastPulledAt` not updated |
| Sync fails during push (409) | Re-pull triggered automatically; push retried once; success on retry |
| Concurrent `runSync()` calls | Second call is a no-op while first is in progress |
| Exponential back-off on repeated failure | Retry delays are 1 s, 2 s, 4 s, … capped at 60 s |

### WatermelonDB Local Availability — E2E (Jest + memory adapter)

| Scenario | Expected result |
|----------|-----------------|
| Complete sync cycle with 3 new messages | All 3 messages readable from WatermelonDB after `runSync()` completes |
| Soft-deleted message pulled | WatermelonDB record has `is_deleted = true`; query with `where('is_deleted', false)` excludes it |
| Push new local message | Message row appears in push payload; server mock receives correct body |
| Pull returns updated conversation name | WatermelonDB `conversation.name` updated to new value |
| `lastPulledAt` persisted across app restart | Next `runSync()` uses stored timestamp; does not re-fetch old records |

---

## Test File Locations

```
server/
  tests/
    test_sync_pull.py
    test_sync_push.py
    test_sync_conflicts.py

mobile-app/sapot-mobile-app/
  src/
    features/sync/
      __tests__/
        SyncService.test.ts
        syncOrchestration.integration.test.ts
        guestHints.test.ts
```
