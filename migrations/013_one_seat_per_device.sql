-- A person may own two phones.
--
-- Migration 011 made identity per browser and kept the old rule that a name is
-- unique within a room. Those two things together are a bug: the installed
-- home screen app and the browser tab are separate storage on iOS, so the same
-- person arriving from their second device found their own name taken and was
-- renamed to "Jason (2)".
--
-- The rule it was enforcing, that nobody can take your name, was protecting
-- against name squatting inside a private group of friends. That is not a
-- threat anyone has. Before identities existed ANY device could use ANY name,
-- so there was never protection to lose. Meanwhile it broke the ordinary case.
--
-- So: a membership is one row PER IDENTITY, and the name is a label on it. Two
-- rows in a room may carry the same name, because they may be the same person.

-- --------------------------------------------------- the message trigger
--
-- Rewritten first, because it upserts `on conflict (room_id, name)` and that
-- key is about to go. It no longer needs to create anything either: joining is
-- join_room's job now, and a row it invented would have no owner.
create or replace function ensure_member() returns trigger as $$
begin
  update members set last_seen = new.created_at
  where room_id = new.room_id and user_id = auth.uid();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ------------------------------------------------------------- the key

alter table members add column if not exists id uuid not null default gen_random_uuid();

do $$ begin
  if exists (select 1 from pg_constraint
             where conrelid = 'members'::regclass and contype = 'p'
               and conname = 'members_pkey') then
    alter table members drop constraint members_pkey;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid = 'members'::regclass and contype = 'p') then
    alter table members add primary key (id);
  end if;
end $$;

-- One seat per identity per room, which is the rule that actually matters.
-- Partial, because rows that predate identities have no owner yet and several
-- of them legitimately sit in the same room.
create unique index if not exists members_one_seat_per_identity
  on members (room_id, user_id) where user_id is not null;

-- --------------------------------------------------------- joining again
--
-- No disambiguation. If this identity already has a seat it is renamed and
-- touched; otherwise it claims an unowned row with that name, or takes a new
-- seat under the name as given.
create or replace function public.join_room(p_code text, p_name text)
returns rooms
language plpgsql security definer set search_path = public as $$
declare
  r rooms;
  v_name text := nullif(btrim(p_name), '');
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if v_name is null then
    raise exception 'a name is required';
  end if;

  select * into r from rooms where join_code = upper(btrim(p_code));
  if not found then
    return null;
  end if;

  -- Already have a seat here: a rename and a heartbeat.
  update members set name = v_name, last_seen = now()
  where room_id = r.id and user_id = auth.uid();
  if found then
    return r;
  end if;

  -- Claim an unowned row with this name. The upgrade path for anyone who was
  -- in a group before identities existed.
  update members set user_id = auth.uid(), last_seen = now()
  where room_id = r.id and name = v_name and user_id is null;
  if found then
    return r;
  end if;

  -- Otherwise take a seat. The name may already be in use, and that is fine:
  -- it is usually the same person on another device.
  insert into members (room_id, name, user_id) values (r.id, v_name, auth.uid());
  return r;
end; $$;

revoke all on function public.join_room(text, text) from public;
grant execute on function public.join_room(text, text) to authenticated;

-- ---------------------------------------------------------- repair the one
--
-- A real person was renamed by the bug above, in the real group, on
-- 2026-11-12. Put it back. Safe only now that two rows may share a name.
update members m
set name = 'Jason'
from rooms r
where r.id = m.room_id and r.name = 'Pure Empathy' and m.name = 'Jason (2)';
