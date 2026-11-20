create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  href text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists user_notifications_user_created_idx
  on public.user_notifications(user_id,created_at desc);
create index if not exists user_notifications_unread_idx
  on public.user_notifications(user_id,created_at desc)
  where read_at is null;

alter table public.user_notifications enable row level security;
revoke all on public.user_notifications from public,anon,authenticated;
grant select on public.user_notifications to authenticated;
grant update(read_at) on public.user_notifications to authenticated;

drop policy if exists user_notifications_owner_read on public.user_notifications;
create policy user_notifications_owner_read on public.user_notifications
for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists user_notifications_owner_mark_read on public.user_notifications;
create policy user_notifications_owner_mark_read on public.user_notifications
for update to authenticated using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

create or replace function private.notify_reporter_application_status()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.status is distinct from new.status and new.status in ('approved','rejected') then
    insert into public.user_notifications(user_id,title,body,href)
    values(
      new.user_id,
      case when new.status='approved' then 'প্রতিনিধি আবেদন অনুমোদিত' else 'প্রতিনিধি আবেদন বাতিল' end,
      case when new.status='approved' then 'আপনার প্রতিনিধি হওয়ার আবেদন অনুমোদিত হয়েছে। আপনার প্রতিনিধি ড্যাশবোর্ডে প্রবেশ করুন।' else 'আপনার প্রতিনিধি হওয়ার আবেদনটি অনুমোদিত হয়নি। প্রয়োজনে সম্পাদকের সঙ্গে যোগাযোগ করুন।' end,
      case when new.status='approved' then '/reporter/dashboard' else '/account' end
    );
  end if;
  return new;
end;
$$;
revoke all on function private.notify_reporter_application_status() from public,anon,authenticated;
drop trigger if exists reporter_application_notification on public.reporter_applications;
create trigger reporter_application_notification
after update of status on public.reporter_applications
for each row execute function private.notify_reporter_application_status();

create or replace function private.notify_news_author_status()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('published','rejected')
     and new.author_id is not null then
    insert into public.user_notifications(user_id,title,body,href)
    values(
      new.author_id,
      case when new.status='published' then 'আপনার প্রতিবেদন প্রকাশিত হয়েছে' else 'আপনার প্রতিবেদন সংশোধনের জন্য ফেরত এসেছে' end,
      case when new.status='published' then 'আপনার জমা দেওয়া প্রতিবেদন প্রকাশিত হয়েছে।' else 'আপনার জমা দেওয়া প্রতিবেদনটি সংশোধনের জন্য ফেরত এসেছে। প্রতিনিধি ড্যাশবোর্ডে বিস্তারিত দেখুন।' end,
      case when new.status='published' then '/post/'||new.slug else '/reporter/dashboard' end
    );
  end if;
  return new;
end;
$$;
revoke all on function private.notify_news_author_status() from public,anon,authenticated;
drop trigger if exists news_author_status_notification on public.news;
create trigger news_author_status_notification
after update of status on public.news
for each row execute function private.notify_news_author_status();
