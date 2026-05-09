from typing import Annotated
from fastapi import Depends, HTTPException
from fastapi.routing import APIRouter
import time

from app.db_operations.token import get_current_user, get_current_user_admin, get_current_user_rescuer
from app.models.users import User
import httpx


router = APIRouter(
    prefix='/gsm',
    tags=['gsm'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get("/health")
async def gsm_health(
        current_user : Annotated[User, Depends(get_current_user)],
        ):
    async with httpx.AsyncClient() as client:
        response = await client.get( "http://localhost:8001/health")
    return response.json()


@router.get("/health/detailed")
async def gsm_health_detailed(
        current_user : Annotated[User, Depends(get_current_user_admin)],
        ):
    """Admin only"""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "http://localhost:8001/health/detailed",
        )

    return response.json()


@router.get("/sms/messages")
async def gsm_messages(
        current_user : Annotated[User, Depends(get_current_user_admin)],
        limit=50,
        direction=None,
        phone=None
        ):
    """Admin only"""
    url = f"http://localhost:8001/sms/messages?limit={limit}"
    if direction:
        url += f"&direction={direction}"

    if phone:
        url += f"&phone={phone}"

    async with httpx.AsyncClient() as client:
        response = await client.get(url)

    return response.json()

@router.post("/sms/send")
async def send_sms(
        current_user : Annotated[User, Depends(get_current_user)],
        phone_number: str, 
        message: str
        ):

    if current_user.banned:
        raise HTTPException(403)

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8001/sms/send",
            json={
                "to": phone_number,
                "message": message
            }
        )

    return response.json()
