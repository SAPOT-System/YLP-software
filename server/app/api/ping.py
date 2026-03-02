
from fastapi.routing import APIRouter
import time


router = APIRouter(
    prefix='/ping',
    tags=['ping', 'connectivity test'],
    responses={
        404: {'description': 'Not Found'}
    }
)

@router.get("")
def ping_testing():
    return {
        "status": "ok",
        "timestamp": time.time()
    }
