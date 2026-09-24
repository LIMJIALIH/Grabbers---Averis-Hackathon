create table if not exists public.gmail_accounts (
    google_sub text primary key,
    email text not null,
    display_name text,
    picture_url text,
    last_synced_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.gmail_messages (
    google_sub text not null references public.gmail_accounts(google_sub) on delete cascade,
    gmail_message_id text not null,
    thread_id text,
    sender text not null,
    to_recipients text[] not null default '{}',
    cc_recipients text[] not null default '{}',
    subject text not null,
    snippet text not null default '',
    body_text text not null default '',
    gmail_internal_date timestamptz not null,
    label_ids text[] not null default '{}',
    attachment_names text[] not null default '{}',
    synced_at timestamptz not null default now(),
    primary key (google_sub, gmail_message_id)
);

create index if not exists gmail_messages_account_date_idx
    on public.gmail_messages (google_sub, gmail_internal_date desc);

alter table public.gmail_accounts enable row level security;
alter table public.gmail_messages enable row level security;

revoke all on public.gmail_accounts from anon, authenticated;
revoke all on public.gmail_messages from anon, authenticated;
grant select, insert, update, delete on public.gmail_accounts to service_role;
grant select, insert, update, delete on public.gmail_messages to service_role;
