from fastapi.routing import APIRouter
from starlette.responses import FileResponse
from pathlib import Path

router = APIRouter(
    prefix='/download',
    tags=['download'],
    responses={
        404: {'description': 'Not Found'}
    }
)

APK_PATH = Path("apks/sapot.apk")

@router.get("/download-apk")
async def download_apk():
    return FileResponse(
        path=APK_PATH,
        filename="sapot.apk",
        media_type="application/vnd.android.package-archive",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        },
    )
