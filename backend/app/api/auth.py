from fastapi import APIRouter, HTTPException, Response, status

from app.api.schemas import LoginIn, OkOut
from app.core.config import settings
from app.core.security import is_valid_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
COOKIE_NAME = "sub_pdf_access_token"


@router.post("/login", response_model=OkOut)
def login(payload: LoginIn, response: Response):
    if not is_valid_access_token(payload.token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
    response.set_cookie(
        COOKIE_NAME,
        payload.token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return {"ok": True}


@router.post("/logout", response_model=OkOut)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/", samesite="lax", secure=settings.cookie_secure, httponly=True)
    return {"ok": True}
