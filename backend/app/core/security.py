import secrets

from fastapi import Cookie, Header, HTTPException, status
from app.core.config import settings


def is_valid_access_token(token: str | None) -> bool:
    expected = settings.app_access_token or ""
    if not expected:
        return False
    return secrets.compare_digest(token or "", expected)


async def require_access_token(
    x_access_token: str | None = Header(default=None),
    sub_pdf_access_token: str | None = Cookie(default=None),
) -> None:
    token = x_access_token or sub_pdf_access_token or ""
    if not is_valid_access_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
