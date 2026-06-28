import secrets
import hmac
import hashlib
import time
import base64
import socket
import ipaddress
from urllib.parse import urlparse

from fastapi import Cookie, Header, HTTPException, status
from app.core.config import settings


def is_safe_url(url: str) -> bool:
    """Check if the URL is safe from SSRF (not local/private/multicast)."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        if not host:
            return False
        
        # Resolve hostname to IP
        ips = socket.getaddrinfo(host, None)
        for item in ips:
            ip_str = item[4][0]
            ip = ipaddress.ip_address(ip_str)
            if ip.is_loopback or ip.is_private or ip.is_multicast or ip.is_link_local:
                return False
            # Check metadata IP
            if ip_str == "169.254.169.254":
                return False
        return True
    except Exception:
        return False


def validate_url_ssrf(url: str) -> None:
    """Raise ValueError if the URL fails SSRF safety check in production-like environment."""
    if settings.app_env.lower() in {"development", "dev", "local", "test"}:
        return
    if not is_safe_url(url):
        raise ValueError("SSRF Protection: Loopback, private, multicast, or metadata address access is prohibited outside development.")


def verify_raw_access_token(token: str | None) -> bool:
    """Verify the raw application access code used only during login."""
    expected = settings.app_access_token or ""
    if not expected:
        return False
    return secrets.compare_digest(token or "", expected)


def generate_session_token() -> str:
    """Generate a signed session token valid for 7 days."""
    timestamp = str(int(time.time()))
    msg = timestamp.encode('utf-8')
    key = settings.app_access_token.encode('utf-8')
    sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
    token = f"{timestamp}:{sig}"
    return base64.b64encode(token.encode('utf-8')).decode('utf-8')


def verify_session_token(token: str | None) -> bool:
    """Verify if the token is a valid signed session token or matches the raw access token."""
    if not token:
        return False
    
    # 1. First, check if it matches the raw app_access_token directly (e.g. for simple API calls / legacy / dev)
    expected = settings.app_access_token or ""
    if expected and secrets.compare_digest(token, expected):
        return True
        
    # 2. Otherwise, check if it is a valid signed session token
    try:
        decoded = base64.b64decode(token.encode('utf-8')).decode('utf-8')
        parts = decoded.split(':')
        if len(parts) != 2:
            return False
        timestamp_str, sig = parts
        timestamp = int(timestamp_str)
        
        # Valid for 7 days
        if time.time() - timestamp > 7 * 24 * 3600:
            return False
            
        msg = timestamp_str.encode('utf-8')
        key = settings.app_access_token.encode('utf-8')
        expected_sig = hmac.new(key, msg, hashlib.sha256).hexdigest()
        return secrets.compare_digest(sig, expected_sig)
    except Exception:
        return False


async def require_access_token(
    x_access_token: str | None = Header(default=None),
    sub_pdf_access_token: str | None = Cookie(default=None),
) -> None:
    token = x_access_token or sub_pdf_access_token or ""
    if not verify_session_token(token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session or access token")
