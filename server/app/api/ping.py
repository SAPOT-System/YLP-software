
from typing import Annotated
from fastapi import Depends
from fastapi.routing import APIRouter
import time

from app.db_operations.token import get_current_user
from app.models.users import User


router = APIRouter(
    prefix='/ping',
    tags=['ping', 'connectivity test'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get("")
def ping_testing(
        current_user: Annotated[User, Depends(get_current_user)]
):
    return current_user.conversation_participants
