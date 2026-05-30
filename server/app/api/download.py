from fastapi.routing import APIRouter
from starlette.responses import FileResponse


router = APIRouter(
    prefix='/download',
    tags=['download'],
    responses={
        404: {'description': 'Not Found'}
    }
)


@router.get("/download-apk")
async def download_apk():
    return FileResponse(
        path="apks/sapot.apk",
        filename="sapot.apk",
        media_type="application/vnd.android.package-archive",
    )
