"""Single-worker, memory-only Google sessions and read-only Gmail access."""
import asyncio
import secrets
import time
from dataclasses import dataclass, field
from urllib.parse import urlsplit

import httpx
from authlib.integrations.starlette_client import OAuth
from authlib.integrations.httpx_client import AsyncOAuth2Client
from fastapi import APIRouter, HTTPException, Request
from starlette.responses import JSONResponse, RedirectResponse

from app.core.config import settings
from app.services.gmail import decode_message

router = APIRouter()
COOKIE = "docuverify_session"
FLOW_COOKIE = "docuverify_oauth"
TTL = 8 * 60 * 60
SCOPE = "openid email profile https://www.googleapis.com/auth/gmail.readonly"
oauth = OAuth()
google = oauth.register(
    "google", client_id=settings.google_client_id,
    client_secret=settings.google_client_secret.get_secret_value(),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": SCOPE, "code_challenge_method": "S256", "timeout": 20},
)


@dataclass
class Session:
    user: dict
    token: dict
    expires: float
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


sessions: dict[str, Session] = {}
flows: dict[str, tuple[float, dict]] = {}


def configured():
    return bool(settings.google_client_id and settings.google_client_secret.get_secret_value())


def prune():
    now = time.time()
    for key, value in list(sessions.items()):
        if value.expires <= now:
            sessions.pop(key, None)
    for key, (expires, _) in list(flows.items()):
        if expires <= now:
            flows.pop(key, None)


def cookie(response, name, value, age):
    response.set_cookie(name, value, max_age=age, httponly=True, samesite="lax",
                        secure=urlsplit(settings.app_origin).hostname not in {"localhost", "127.0.0.1", "::1"}, path="/")


def safe_next(value):
    if not value or not value.startswith("/") or value.startswith("//") or "\\" in value or any(ord(c) < 32 for c in value):
        return "/"
    url = urlsplit(value)
    return value if not url.netloc and not url.scheme and url.path != "/login" else "/"


def redirect(error=None, next_path="/"):
    response = RedirectResponse(settings.app_origin + ("/login?auth_error=" + error if error else safe_next(next_path)), status_code=302)
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def get_session(request):
    prune()
    session = sessions.get(request.cookies.get(COOKIE, ""))
    if not session:
        raise HTTPException(401, "Sign in with Google to access Gmail.")
    return session


@router.get("/auth/google/login")
async def login(request: Request):
    prune()
    if not configured():
        return redirect("configuration")
    flows.pop(request.cookies.get(FLOW_COOKIE, ""), None)
    flow_id = secrets.token_urlsafe(32)
    request.scope["session"] = {"next_path": safe_next(request.query_params.get("next"))}
    try:
        response = await google.authorize_redirect(
            request, settings.app_origin + "/api/v1/auth/google/callback",
            access_type="offline", prompt="consent", nonce=secrets.token_urlsafe(32),
            code_verifier=secrets.token_urlsafe(64),
        )
    except Exception:
        return redirect("unavailable")
    flows[flow_id] = (time.time() + 600, request.session)
    cookie(response, FLOW_COOKIE, flow_id, 600)
    response.headers["Cache-Control"] = "no-store"
    return response


@router.get("/auth/google/callback")
async def callback(request: Request):
    prune()
    flow = flows.pop(request.cookies.get(FLOW_COOKIE, ""), None)
    response = redirect("invalid_state")
    if flow:
        request.scope["session"] = flow[1]
        state = request.query_params.get("state", "")
        # Validate even denied-consent callbacks before accepting their error.
        state_data = await google.framework.get_state_data(request.session, state)
        if state_data:
            if request.query_params.get("error"):
                response = redirect("cancelled" if request.query_params["error"] == "access_denied" else "failed")
            else:
                try:
                    token = await google.authorize_access_token(request)
                    user = token.get("userinfo")  # Authlib validates signature, issuer, audience, expiry and nonce.
                    if not user or not user.get("sub") or not user.get("email") or not user.get("email_verified"):
                        raise ValueError("Missing verified identity")
                    if "https://www.googleapis.com/auth/gmail.readonly" not in token.get("scope", "").split():
                        raise ValueError("Gmail consent required")
                    sessions.pop(request.cookies.get(COOKIE, ""), None)
                    sid = secrets.token_urlsafe(32)
                    sessions[sid] = Session({key: user.get(key) for key in ("sub", "name", "email", "picture")}, token, time.time() + TTL)
                    response = redirect(next_path=request.session.get("next_path", "/"))
                    cookie(response, COOKIE, sid, TTL)
                except Exception:
                    # Never expose provider responses, authorization codes or tokens.
                    response = redirect("failed")
    response.delete_cookie(FLOW_COOKIE, path="/")
    return response


@router.get("/auth/me")
async def me(request: Request):
    prune()
    session = sessions.get(request.cookies.get(COOKIE, ""))
    return JSONResponse({"user": session.user if session else None, "configured": configured(),
                         "expires_at": session.expires if session else None}, headers={"Cache-Control": "no-store"})


@router.post("/auth/logout")
async def logout(request: Request):
    if request.headers.get("origin") != settings.app_origin:
        raise HTTPException(403, "Same-origin logout required.")
    sessions.pop(request.cookies.get(COOKIE, ""), None)
    flows.pop(request.cookies.get(FLOW_COOKIE, ""), None)
    response = JSONResponse({"ok": True}, headers={"Cache-Control": "no-store"})
    response.delete_cookie(COOKIE, path="/")
    response.delete_cookie(FLOW_COOKIE, path="/")
    return response


async def access_token(request, session):
    async with session.lock:
        if session.token.get("expires_at", 0) <= time.time() + 60:
            try:
                refresh = session.token.get("refresh_token")
                if not refresh:
                    raise ValueError("No refresh token")
                async with AsyncOAuth2Client(settings.google_client_id, settings.google_client_secret.get_secret_value(), timeout=20) as client:
                    token = await client.refresh_token("https://oauth2.googleapis.com/token", refresh_token=refresh)
                session.token = {**token, "refresh_token": token.get("refresh_token", refresh)}
            except Exception:
                sessions.pop(request.cookies.get(COOKIE, ""), None)
                raise HTTPException(401, "Google access expired. Sign in again.") from None
        return session.token["access_token"]


@router.get("/gmail/messages")
async def messages(request: Request):
    session = get_session(request)
    token = await access_token(request, session)
    semaphore = asyncio.Semaphore(5)
    async with httpx.AsyncClient(base_url="https://gmail.googleapis.com/gmail/v1/users/me/", headers={"Authorization": f"Bearer {token}"}, timeout=20) as client:
        async def detail(item):
            async with semaphore:
                response = await client.get("messages/" + item["id"], params={"format": "full"})
                response.raise_for_status()
                return decode_message(response.json())
        try:
            async with asyncio.timeout(90):
                response = await client.get("messages", params={"labelIds": "INBOX", "maxResults": 50})
                response.raise_for_status()
                results = await asyncio.gather(*(detail(item) for item in response.json().get("messages", [])[:50]), return_exceptions=True)
        except httpx.HTTPStatusError as exc:
            raise provider_error(exc.response.status_code) from None
        except (httpx.HTTPError, TimeoutError, ValueError):
            raise HTTPException(502, "Gmail could not be reached. Try refreshing again.") from None
    # A logout during an in-flight request must invalidate its result too.
    if get_session(request) is not session:
        raise HTTPException(401, "Session changed. Sign in again.")
    errors = [result for result in results if isinstance(result, BaseException)]
    for error in errors:
        if isinstance(error, httpx.HTTPStatusError) and error.response.status_code in {401, 403, 429}:
            raise provider_error(error.response.status_code)
    if errors and len(errors) == len(results):
        raise HTTPException(502, "Messages could not be loaded. Try refreshing again.")
    items = [result for result in results if not isinstance(result, BaseException)]
    items.sort(key=lambda item: item["timestamp"], reverse=True)
    return JSONResponse({"messages": items, "failed_count": len(errors)}, headers={"Cache-Control": "no-store"})


def provider_error(status):
    if status == 401:
        return HTTPException(401, "Google access expired. Sign in again.")
    if status == 429:
        return HTTPException(429, "Gmail rate limit reached. Wait a moment before refreshing.")
    if status == 403:
        return HTTPException(403, "Gmail access was refused. Check API setup, consent, or quota.")
    return HTTPException(502, "Gmail could not load messages. Try again.")
