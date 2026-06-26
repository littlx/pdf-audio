import secrets

from fastapi import Cookie, Header, HTTPException, status
from app.core.config import settings


async def require_access_token(
    x_access_token: str | None = Header(default=None),
    sub_pdf_access_token: str | None = Cookie(default=None),
) -> None:
    if not settings.app_access_token:
        return
    token = x_access_token or sub_pdf_access_token or ""
    if not secrets.compare_digest(token, settings.app_access_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
