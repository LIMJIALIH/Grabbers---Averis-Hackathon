alter table public.gmail_messages add column if not exists in_latest_inbox boolean not null default false;

create or replace function public.save_gmail_snapshot(account_data jsonb, message_data jsonb, inbox_ids text[])
returns void language plpgsql security invoker set search_path = public as $$
declare owner_id text := account_data->>'google_sub';
begin
  insert into gmail_accounts(google_sub,email,display_name,picture_url)
  values(owner_id,account_data->>'email',account_data->>'display_name',account_data->>'picture_url')
  on conflict(google_sub) do update set email=excluded.email, display_name=excluded.display_name,picture_url=excluded.picture_url;
  perform 1 from gmail_accounts where google_sub=owner_id for update;
  insert into gmail_messages(google_sub,gmail_message_id,thread_id,sender,to_recipients,cc_recipients,subject,snippet,body_text,gmail_internal_date,label_ids,attachment_names,synced_at)
  select owner_id,x.gmail_message_id,x.thread_id,x.sender,x.to_recipients,x.cc_recipients,x.subject,x.snippet,x.body_text,x.gmail_internal_date,x.label_ids,x.attachment_names,x.synced_at
  from jsonb_populate_recordset(null::gmail_messages,message_data) x
  on conflict(google_sub,gmail_message_id) do update set
    thread_id=excluded.thread_id,sender=excluded.sender,to_recipients=excluded.to_recipients,
    cc_recipients=excluded.cc_recipients,subject=excluded.subject,snippet=excluded.snippet,
    body_text=excluded.body_text,gmail_internal_date=excluded.gmail_internal_date,
    label_ids=excluded.label_ids,attachment_names=excluded.attachment_names,synced_at=excluded.synced_at;
  update gmail_messages set in_latest_inbox=(gmail_message_id=any(inbox_ids)) where google_sub=owner_id;
  update gmail_accounts set last_synced_at=(account_data->>'last_synced_at')::timestamptz,
    updated_at=(account_data->>'updated_at')::timestamptz where google_sub=owner_id;
end $$;
revoke all on function public.save_gmail_snapshot(jsonb,jsonb,text[]) from public,anon,authenticated;
grant execute on function public.save_gmail_snapshot(jsonb,jsonb,text[]) to service_role;
