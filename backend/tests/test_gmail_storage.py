import asyncio

import httpx
from pydantic import SecretStr

from app.services import supabase_gmail as storage


def test_database_read_enforces_owner_order_and_limit(monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(storage.settings, 'supabase_url', 'https://example.supabase.co')
    monkeypatch.setattr(storage.settings, 'supabase_secret_key', SecretStr('test'))
    def handle(request):
        assert request.url.params['google_sub'] == 'eq.alice'
        if request.url.path.endswith('gmail_messages'):
            assert request.url.params['limit'] == '50'
            assert request.url.params['order'] == 'gmail_internal_date.desc,gmail_message_id.desc'
            assert request.url.params['in_latest_inbox'] == 'eq.true'
        return httpx.Response(200, json=[])
    monkeypatch.setattr(storage.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handle), **kw))
    assert asyncio.run(storage.read_messages('alice')) == {'messages': [], 'synced_at': None}


def test_empty_inbox_still_commits_snapshot(monkeypatch):
    original = httpx.AsyncClient
    monkeypatch.setattr(storage.settings, 'supabase_url', 'https://example.supabase.co')
    monkeypatch.setattr(storage.settings, 'supabase_secret_key', SecretStr('test'))
    requests = []
    def handle(request):
        requests.append(request)
        assert request.url.path == '/rest/v1/rpc/save_gmail_snapshot'
        return httpx.Response(204)
    monkeypatch.setattr(storage.httpx, 'AsyncClient', lambda **kw: original(transport=httpx.MockTransport(handle), **kw))
    assert asyncio.run(storage.sync_messages({'sub': 'alice', 'email': 'alice@example.com'}, [], []))
    assert len(requests) == 1
