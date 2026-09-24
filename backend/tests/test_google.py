import asyncio
import base64
import time
from urllib.parse import parse_qs, urlsplit
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient
from joserfc import jwt
from joserfc.jwk import RSAKey
from pydantic import SecretStr

from app.main import create_app
from app.api.routes import google as g
from app.services.gmail import decode_message


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    g.sessions.clear()
    g.flows.clear()
    monkeypatch.setattr(g.settings, "google_client_id", "client")
    monkeypatch.setattr(g.settings, "google_client_secret", SecretStr("secret"))
    monkeypatch.setattr(g.google, "client_id", "client")
    monkeypatch.setattr(g.google, "load_server_metadata", AsyncMock(return_value={
        "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
        "issuer": "https://accounts.google.com",
        "id_token_signing_alg_values_supported": ["RS256"],
    }))
    yield
    g.sessions.clear()
    g.flows.clear()


def client():
    return TestClient(create_app(), follow_redirects=False)


def signed_in(c, sid="one", token="access"):
    g.sessions[sid] = g.Session({"sub": sid, "email": sid + "@example.com", "picture": None},
        {"access_token": token, "expires_at": time.time() + 3600}, time.time() + g.TTL)
    c.cookies.set(g.COOKIE, sid)
    return g.sessions[sid]


def begin(c):
    response = c.get("/api/v1/auth/google/login")
    assert response.status_code == 302
    params = parse_qs(urlsplit(response.headers["location"]).query)
    assert params["code_challenge_method"] == ["S256"]
    assert params["nonce"] and params["state"]
    assert "HttpOnly" in response.headers["set-cookie"]
    return params


@pytest.mark.parametrize("bad_claim", [None, "nonce", "aud", "iss", "exp", "signature"])
def test_real_id_token_validation(monkeypatch, bad_claim):
    c = client()
    params = begin(c)
    key = RSAKey.generate_key(2048)
    claims = {"iss": "https://accounts.google.com", "sub": "alice", "aud": "client",
              "exp": int(time.time()) + 3600, "iat": int(time.time()),
              "nonce": params["nonce"][0], "email": "alice@example.com", "email_verified": True}
    if bad_claim and bad_claim != "signature":
        claims[bad_claim] = int(time.time()) - 3600 if bad_claim == "exp" else "wrong"
    token = jwt.encode({"alg": "RS256"}, claims, RSAKey.generate_key(2048) if bad_claim == "signature" else key)
    monkeypatch.setattr(g.google, "fetch_jwk_set", AsyncMock(return_value={"keys": [key.as_dict(private=False)]}))
    exchange = AsyncMock(return_value={"id_token": token, "access_token": "access", "scope": g.SCOPE, "expires_at": time.time() + 3600})
    monkeypatch.setattr(g.google, "fetch_access_token", exchange)
    response = c.get("/api/v1/auth/google/callback", params={"state": params["state"][0], "code": "code"})
    assert exchange.call_args.kwargs["code_verifier"]
    assert response.headers["cache-control"] == "no-store"
    if bad_claim:
        assert "auth_error=failed" in response.headers["location"]
        assert not g.sessions
    else:
        assert response.headers["location"] == "http://localhost:3000/"
        assert len(g.sessions) == 1
        assert c.get("/api/v1/auth/me").json()["user"]["picture"] is None
        cookie = response.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=lax" in cookie and "Max-Age=28800" in cookie
        assert "access" not in cookie
        assert not g.flows
        assert "invalid_state" in c.get("/api/v1/auth/google/callback", params={"state": params["state"][0], "code": "code"}).headers["location"]


def test_denied_invalid_and_missing_config(monkeypatch):
    c = client()
    params = begin(c)
    assert "cancelled" in c.get("/api/v1/auth/google/callback", params={"state": params["state"][0], "error": "access_denied"}).headers["location"]
    begin(c)
    assert "invalid_state" in c.get("/api/v1/auth/google/callback?state=wrong&code=code").headers["location"]
    monkeypatch.setattr(g.settings, "google_client_id", "")
    assert "configuration" in c.get("/api/v1/auth/google/login").headers["location"]


def test_sessions_logout_expiration():
    c = client()
    assert c.get("/api/v1/gmail/messages").status_code == 401
    session = signed_in(c)
    assert c.post("/api/v1/auth/logout", headers={"Origin": "https://evil.test"}).status_code == 403
    assert c.get("/api/v1/auth/me").json()["user"]["sub"] == "one"
    response = c.post("/api/v1/auth/logout", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200 and not g.sessions
    assert c.get("/api/v1/auth/me").json()["user"] is None
    session = signed_in(c)
    session.expires = time.time() - 1
    assert c.get("/api/v1/gmail/messages").status_code == 401
    assert c.get("/api/v1/gmail/messages").headers["cache-control"] == "no-store"


@pytest.mark.parametrize("path", ["https://evil.test", "//evil.test", "/\\evil.test", "/login", "/\nevil.test"])
def test_return_path_rejects_external_redirects(path):
    assert g.safe_next(path) == "/"


def test_return_path_preserved():
    c = client()
    c.get("/api/v1/auth/google/login", params={"next": "/audit?filter=open"})
    assert next(iter(g.flows.values()))[1]["next_path"] == "/audit?filter=open"
    assert g.redirect(next_path="/audit?filter=open").headers["location"] == "http://localhost:3000/audit?filter=open"


def mime(text, kind="text/plain", **extra):
    return {"mimeType": kind, "body": {"data": base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")}, **extra}


def test_mime():
    payload = {"mimeType": "multipart/mixed", "parts": [
        {"mimeType": "multipart/alternative", "parts": [mime("plain ✓"), mime("<p>html</p>", "text/html")]},
        mime("private attachment", filename="invoice.txt"),
        {"mimeType": "application/pdf", "filename": "document.pdf", "body": {"attachmentId": "never-fetch"}},
    ]}
    result = decode_message({"id": "m", "payload": payload})
    assert result["body"] == "plain ✓"
    assert result["attachments"] == ["invoice.txt", "document.pdf"]
    result = decode_message({"id": "m", "payload": mime("<style>hide</style><script>secret()</script><p>Hello &amp; world</p>", "text/html")})
    assert result["body"] == "Hello & world"
    assert "could not" in decode_message({"id": "m", "payload": {"mimeType": "text/plain", "body": {"data": "!"}}})["body"]


@pytest.mark.parametrize("count,status,failed", [(0, 200, 0), (60, 200, 0), (3, 200, 1), (3, 429, 0), (3, 403, 0)])
def test_gmail_limits_errors_and_isolation(monkeypatch, count, status, failed):
    monkeypatch.setattr(g, 'persist_messages', AsyncMock(return_value='2026-09-24T00:00:00+00:00'))
    original = httpx.AsyncClient
    requests = []
    running = 0
    peak = 0
    async def handle(request):
        nonlocal running, peak
        requests.append(request)
        if request.url.path.endswith("/messages"):
            assert request.url.params["maxResults"] == "50" and request.url.params["labelIds"] == "INBOX"
            return httpx.Response(status, json={"messages": [{"id": str(i)} for i in range(count)]})
        running += 1
        peak = max(peak, running)
        await asyncio.sleep(0.001)
        running -= 1
        index = request.url.path.split("/")[-1]
        if failed and index == "1":
            return httpx.Response(500)
        return httpx.Response(200, json={"id": index, "internalDate": str(int(index) * 1000), "payload": mime(request.headers["authorization"])})
    monkeypatch.setattr(g.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handle), **kwargs))
    a, b = client(), client()
    signed_in(a, "a", "token-a")
    signed_in(b, "b", "token-b")
    for c, own, other in [(a, "token-a", "token-b"), (b, "token-b", "token-a")]:
        response = c.post("/api/v1/gmail/sync", headers={'Origin': 'http://localhost:3000'})
        assert response.status_code == status
        if status == 200:
            data = response.json()
            assert len(data["messages"]) == min(count, 50) - failed
            assert data["failed_count"] == failed
            assert all(own in m["body"] and other not in m["body"] for m in data["messages"])
    assert peak <= 5
    assert all("attachments" not in str(r.url) for r in requests)


@pytest.mark.parametrize("success", [True, False])
def test_refresh(monkeypatch, success):
    c = client()
    session = signed_in(c)
    session.token.update(expires_at=0, refresh_token="refresh")
    refresh = AsyncMock(return_value={"access_token": "new", "expires_at": time.time() + 3600})
    if not success:
        refresh.side_effect = RuntimeError("provider failure")
    monkeypatch.setattr(g.AsyncOAuth2Client, "refresh_token", refresh)
    request = type("Request", (), {"cookies": {g.COOKIE: "one"}})()
    if success:
        assert asyncio.run(g.access_token(request, session)) == "new"
        assert session.token["refresh_token"] == "refresh"
    else:
        with pytest.raises(g.HTTPException) as error:
            asyncio.run(g.access_token(request, session))
        assert error.value.status_code == 401
        assert not g.sessions


def test_sync_requires_same_origin(monkeypatch):
    c = client()
    signed_in(c)
    monkeypatch.setattr(g, "fetch_messages", AsyncMock(return_value=([], 0)))
    assert c.post("/api/v1/gmail/sync", headers={"Origin": "https://evil.test"}).status_code == 403


def test_sync_persists_current_account(monkeypatch):
    c = client()
    signed_in(c, "alice")
    messages = [{"id": "m1", "timestamp": 1000}]
    monkeypatch.setattr(g, "fetch_messages", AsyncMock(return_value=(messages, 1, ['m1', 'm2'])))
    persist = AsyncMock(return_value="2026-09-24T00:00:00+00:00")
    monkeypatch.setattr(g, "persist_messages", persist)
    response = c.post("/api/v1/gmail/sync", headers={"Origin": "http://localhost:3000"})
    assert response.status_code == 200
    assert response.json()["synced_count"] == 1
    assert response.json()["failed_count"] == 1
    assert persist.await_args.args == (g.sessions["alice"].user, messages, ['m1', 'm2'])


def test_saved_messages_are_account_scoped_without_gmail(monkeypatch):
    read = AsyncMock(return_value={'messages': [], 'synced_at': None})
    fetch = AsyncMock(side_effect=AssertionError('Database reads must not call Gmail'))
    monkeypatch.setattr(g, 'read_messages', read)
    monkeypatch.setattr(g, 'fetch_messages', fetch)
    c = client()
    assert c.get('/api/v1/gmail/messages').status_code == 401
    for owner in ['alice', 'bob']:
        signed_in(c, owner)
        assert c.get('/api/v1/gmail/messages').json()['messages'] == []
        assert read.await_args.args == (owner,)
    fetch.assert_not_awaited()
