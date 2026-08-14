"""QA tooling mounted only in development and staging by `app.main`.

Every route re-checks the environment at request time, and state-changing routes require
a shared-secret header. See `SECURITY.md` and GH #271 through #276 for the rationale.
"""
import hmac
import os
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException

from app.api.admin import makeAdmin, makeRescuer
from app.db_operations.auth import SessionDep, get_user_by_username
from app.db_operations.qa_scenarios import SCENARIOS, apply_scenario, reset_database
from app.db_operations.token import create_token_pair, get_current_user
from app.env import IS_QA_ENABLED
from app.models.users import User, UserPublic

# Fail-fast, no default — mirrors JWT_SECRET_KEY/CORS_ALLOWED_ORIGINS (see SECURITY.md).
QA_API_TOKEN = os.environ.get("QA_API_TOKEN")
if IS_QA_ENABLED and not QA_API_TOKEN:
    raise RuntimeError(
        "QA_API_TOKEN environment variable is not set. Required whenever "
        "ENVIRONMENT=development or staging so state-changing /testing routes aren't a "
        "LAN-wide privilege bypass with no secret at all."
    )

# Fixture handles the scenario builders in qa_scenarios.py are known to create.
# /testing/login-as only ever mints tokens for one of these — never an arbitrary
# username — so it can't be used to log in as a real user's account.
FIXTURE_HANDLES = frozenset(
    {
        "qa_baseline",
        "qa_baseline_b",
        "qa_rescuer",
        "qa_admin",
        "qa_guest",
        "qa_empty",
        "qa_large",
        "qa_banned",
        "qa_locked",
        "qa_phone_verified",
        "qa_gps",
        "qa_map_user",
        "qa_map_user_2",
        "qa_map_rescuer",
        "qa_map_rescuer_2",
        "qa_map_admin",
        "qa_calls_a",
        "qa_calls_b",
        "admin",
        # First pair built by build_baseline (qa_scenarios.py) -- unlike "admin",
        # "test" is a ConversationParticipant with real seeded messages, which is
        # what makes a /sync/pull assertion against the baseline scenario meaningful.
        "test",
    }
)

def require_qa_env() -> None:
    """Layer 2 of the guard: even if this router somehow gets mounted, every route
    404s outside development/staging instead of behaving like a live endpoint."""
    if not IS_QA_ENABLED:
        raise HTTPException(404)


def require_qa_token(x_qa_token: Annotated[str | None, Header()] = None) -> None:
    """Layer 3: mutations require a shared secret so a LAN client cannot alter QA data
    or privileges unattended."""
    if (
        QA_API_TOKEN is None
        or x_qa_token is None
        or not hmac.compare_digest(x_qa_token, QA_API_TOKEN)
    ):
        raise HTTPException(404)


router = APIRouter(
    prefix="/testing",
    tags=["testing endpoint"],
    dependencies=[Depends(require_qa_env)],
    responses={404: {"description": "Not Found"}},
)


@router.get("/scenarios")
def list_scenarios():
    return {name: scenario.description for name, scenario in SCENARIOS.items()}


@router.post("/seed/{scenario}", dependencies=[Depends(require_qa_token)])
def seed_scenario(scenario: str, session: SessionDep):
    try:
        summary = apply_scenario(session, scenario)
    except KeyError:
        raise HTTPException(404, f"Unknown scenario {scenario!r}")
    return {"scenario": scenario, "result": summary}


@router.post(
    "/reset",
    dependencies=[Depends(require_qa_token)],
)
def reset(session: SessionDep):
    return reset_database(session)


@router.post(
    "/login-as/{handle}",
    dependencies=[Depends(require_qa_token)],
    response_model=UserPublic,
)
def login_as(handle: str, session: SessionDep):
    if handle not in FIXTURE_HANDLES:
        raise HTTPException(404, f"Unknown fixture handle {handle!r}")

    # get_user_by_username itself raises 404 when the fixture hasn't been seeded yet
    # (POST /testing/seed/roles first).
    user = get_user_by_username(session, handle)

    tokens = create_token_pair(user.id)
    return UserPublic(
        id=user.id,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name,
        phone_number=user.phone_number,
        email=user.email,
        detail="Logged in as fixture account",
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
    )


@router.post("/test-make-admin", dependencies=[Depends(require_qa_token)])
def make_user_admin(
    username: str,
    session: SessionDep,
    _: Annotated[User, Depends(get_current_user)],
):
    user = get_user_by_username(session, username)
    if not user:
        raise HTTPException(404, "User not found")
    makeAdmin(user, session)
    return {"status": "ok"}


@router.post("/test-make-rescuer", dependencies=[Depends(require_qa_token)])
def make_user_rescuer(
    username: str,
    session: SessionDep,
    _: Annotated[User, Depends(get_current_user)],
):
    user = get_user_by_username(session, username)
    if not user:
        raise HTTPException(404, "User not found")
    makeRescuer(user, session)
    return {"status": "ok"}
