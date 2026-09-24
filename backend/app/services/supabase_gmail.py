"""Persist Gmail messages through Supabase's server-only Data API."""
from datetime import datetime, timezone

import httpx

from app.core.config import settings


class SupabaseNotConfigured(Exception):
    pass


class SupabaseWriteError(Exception):
    pass


def configured():
    return bool(settings.supabase_url and settings.supabase_secret_key.get_secret_value())


async def sync_messages(user, messages, inbox_ids):
    if not configured():
        raise SupabaseNotConfigured

    now = datetime.now(timezone.utc).isoformat()
    headers = {
        "apikey": settings.supabase_secret_key.get_secret_value(),
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    account = {
        "google_sub": user["sub"],
        "email": user["email"],
        "display_name": user.get("name"),
        "picture_url": user.get("picture"),
        "last_synced_at": now,
        "updated_at": now,
    }
    rows = [{
        "google_sub": user["sub"],
        "gmail_message_id": message["id"],
        "thread_id": message.get("thread_id") or None,
        "sender": message["sender"],
        "to_recipients": message.get("to", []),
        "cc_recipients": message.get("cc", []),
        "subject": message["subject"],
        "snippet": message.get("snippet", ""),
        "body_text": message["body"],
        "gmail_internal_date": datetime.fromtimestamp(message["timestamp"] / 1000, timezone.utc).isoformat(),
        "label_ids": message.get("labels", []),
        "attachment_names": message.get("attachments", []),
        "synced_at": now,
    } for message in messages]

    try:
        async with httpx.AsyncClient(base_url=settings.supabase_url, headers=headers, timeout=20) as client:
            response = await client.post('/rest/v1/rpc/save_gmail_snapshot', json={
                'account_data': account, 'message_data': rows, 'inbox_ids': inbox_ids,
            })
            response.raise_for_status()
    except (httpx.HTTPError, ValueError):
        raise SupabaseWriteError from None

    return now


async def read_messages(google_sub):
    if not configured():
        raise SupabaseNotConfigured
    try:
        async with httpx.AsyncClient(base_url=settings.supabase_url,
                headers={'apikey': settings.supabase_secret_key.get_secret_value()}, timeout=20) as client:
            response = await client.get('/rest/v1/gmail_messages', params={
                'google_sub': 'eq.' + google_sub, 'in_latest_inbox': 'eq.true',
                'order': 'gmail_internal_date.desc,gmail_message_id.desc', 'limit': '50',
            })
            response.raise_for_status()
            accounts = await client.get('/rest/v1/gmail_accounts', params={
                'google_sub': 'eq.' + google_sub, 'select': 'last_synced_at', 'limit': '1',
            })
            accounts.raise_for_status()
            account = accounts.json()
            messages = [{
                'id': row['gmail_message_id'], 'sender': row['sender'],
                'subject': row['subject'], 'body': row['body_text'],
                'to': row['to_recipients'], 'cc': row['cc_recipients'],
                'timestamp': int(datetime.fromisoformat(row['gmail_internal_date']).timestamp() * 1000),
                'attachments': row['attachment_names'],
            } for row in response.json()]
            return {'messages': messages, 'synced_at': account[0]['last_synced_at'] if account else None}
    except (httpx.HTTPError, ValueError, KeyError):
        raise SupabaseWriteError from None
