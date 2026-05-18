from typing import Annotated
from fastapi import APIRouter, Depends
from sqlmodel import select
from app.db_operations.token import get_current_user_admin
from app.models.router import InterfaceTraffic
from app.models import RouterHealth
from app.db_operations.auth import SessionDep
from app.models.users import User 


router = APIRouter(prefix="/admin/router", tags=[ "router", "admin" ])

@router.get("/health/latest")
def latest_health(
        current_user: Annotated[User, Depends(get_current_user_admin)],
        session: SessionDep

        ):
        return session.exec(
            select(RouterHealth)
            .order_by(RouterHealth.created_at.desc())
            .limit(1)
        ).first()

@router.get("/health/history")
def health_history(session: SessionDep, current_user: Annotated[User, Depends(get_current_user_admin)] ,limit: int = 50):
        return session.exec(
            select(RouterHealth)
            .order_by(RouterHealth.created_at.desc())
            .limit(limit)
        ).all()

@router.get("/traffic/{interface}")
def traffic(session: SessionDep, current_user: Annotated[User, Depends(get_current_user_admin)], interface: str, limit: int = 100):
        return session.exec(
            select(InterfaceTraffic)
            .where(InterfaceTraffic.interface == interface)
            .order_by(InterfaceTraffic.created_at.desc())
            .limit(limit)
        ).all()


@router.get("/dashboard")
def dashboard(session: SessionDep, current_user: Annotated[User, Depends(get_current_user_admin)]):

        latest_health = session.exec(
            select(RouterHealth)
            .order_by(RouterHealth.created_at.desc())
        ).first()

        latest_traffic = session.exec(
            select(InterfaceTraffic)
            .order_by(InterfaceTraffic.created_at.desc())
        ).all()

        return {
            "health": latest_health,
            "traffic": latest_traffic
        }
