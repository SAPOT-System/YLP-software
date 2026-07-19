import random
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException

from app.api.admin import makeAdmin, makeRescuer
from app.db_operations.auth import SessionDep, get_user_by_username
from app.db_operations.token import get_current_user, get_current_user_admin
from app.db_operations.push_notifications import send_admin_alert
from app.models.users import User
from app.models.router import RouterHealth, InterfaceTraffic

router = APIRouter(
    prefix="/testing", tags=["testing endpoint"], responses={404: {"description": "Not Found"}}
)

@router.post("/test-make-admin")
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


@router.post("/test-make-rescuer")
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


@router.post("/test-push-notification")
def test_push_notification(
    _: Annotated[User, Depends(get_current_user_admin)],
    title: str = "Test Alert",
    body: str = "This is a test notification from the testing endpoint.",
):
    send_admin_alert(title, body)
    return {"status": "ok", "message": "Alert sent"}


@router.post("/test-seed-router-data")
def seed_router_data(
    session: SessionDep,
    _: Annotated[User, Depends(get_current_user_admin)],
    samples: int = 10,
    interfaces: str = "ether1,ether2,ether3,ether4,ether5",
):
    iface_list = [i.strip() for i in interfaces.split(",") if i.strip()]

    health_rows = []
    traffic_rows = []
    total_memory = 512 * 1024 * 1024
    for _ in range(samples):
        health_rows.append(
            RouterHealth(
                cpu_load=round(random.uniform(0, 100), 2),
                free_memory=random.randint(0, total_memory),
                total_memory=total_memory,
                uptime=f"{random.randint(0, 30)}d{random.randint(0, 23)}h{random.randint(0, 59)}m",
            )
        )
        for iface in iface_list:
            traffic_rows.append(
                InterfaceTraffic(
                    interface=iface,
                    rx_bps=random.randint(0, 100_000_000),
                    tx_bps=random.randint(0, 100_000_000),
                )
            )

    session.add_all(health_rows)
    session.add_all(traffic_rows)
    session.commit()

    return {
        "status": "ok",
        "health_rows_created": len(health_rows),
        "traffic_rows_created": len(traffic_rows),
    }
