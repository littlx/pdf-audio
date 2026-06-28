import time
from fastapi import APIRouter, HTTPException, Response, status, Request

from app.api.schemas import LoginIn, LoginOut, OkOut
from app.core.config import settings
from app.core.security import verify_raw_access_token, generate_session_token

router = APIRouter(prefix="/api/auth", tags=["auth"])
COOKIE_NAME = "sub_pdf_access_token"

# Simple in-memory storage for failed attempts mapping ip -> (attempts_count, block_until_timestamp)
FAILED_ATTEMPTS = {}


@router.post("/login", response_model=LoginOut)
def login(payload: LoginIn, response: Response, request: Request):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    
    # Check if IP is currently blocked
    if ip in FAILED_ATTEMPTS:
        count, block_until = FAILED_ATTEMPTS[ip]
        if block_until > now:
            remaining = int(block_until - now)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts. Please try again in {remaining} seconds."
            )
            
    # Verify raw token (password)
    is_valid = verify_raw_access_token(payload.token)
    
    if not is_valid:
        # Failure delay: sleep 1.5 seconds to slow down brute force
        time.sleep(1.5)
        
        # Record failed attempt
        if ip not in FAILED_ATTEMPTS:
            FAILED_ATTEMPTS[ip] = (1, 0.0)
        else:
            count, block_until = FAILED_ATTEMPTS[ip]
            new_count = count + 1
            if new_count >= 5:
                # Block for 15 minutes
                FAILED_ATTEMPTS[ip] = (0, now + 15 * 60)
            else:
                FAILED_ATTEMPTS[ip] = (new_count, 0.0)
                
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid access token")
        
    # Success: clear failed attempts for this IP
    FAILED_ATTEMPTS.pop(ip, None)
    
    # Generate signed session token
    session_token = generate_session_token()
    
    response.set_cookie(
        COOKIE_NAME,
        session_token,
        httponly=True,
        secure=settings.is_cookie_secure,
        samesite="lax",
        path="/",
    )
    return {"ok": True, "token": session_token}


@router.post("/logout", response_model=OkOut)
def logout(response: Response):
    response.delete_cookie(
        COOKIE_NAME,
        path="/",
        samesite="lax",
        secure=settings.is_cookie_secure,
        httponly=True
    )
    return {"ok": True}
