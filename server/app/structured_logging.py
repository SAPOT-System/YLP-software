from typing import Any
from uuid import UUID


def log_context(
    user_id: UUID | str | None,
    action: str,
    entity_id: UUID | str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "user_id": str(user_id) if user_id else "ANONYMOUS",
        "action": action,
        "entity_id": str(entity_id) if entity_id else None,
        "metadata_json": metadata or {},
    }
