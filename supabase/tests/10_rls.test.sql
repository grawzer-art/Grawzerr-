-- Row Level Security checks. Run after the shim and the migration:
--   psql -v ON_ERROR_STOP=1 -f 00_supabase_shim.sql -f ../migrations/0001_jarvis_init.sql -f 10_rls.test.sql
\set ON_ERROR_STOP on

insert into auth.users values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a@example.com'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'b@example.com');

create or replace function pg_temp.assert(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'ASSERTION FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;

-- ── User A writes data ───────────────────────────────────────────
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into public.conversations (id, title) values ('c0000000-0000-4000-8000-00000000000a', 'A conv');
insert into public.messages (conversation_id, role, content) values ('c0000000-0000-4000-8000-00000000000a', 'user', 'hello');
insert into public.memories (content) values ('A likes tea');
insert into public.jarvis_settings (user_id, humor) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 80);
insert into public.usage_events (provider, model, input_tokens) values ('gemini', 'm', 10);
insert into public.action_log (action, status) values ('chat.reply', 'success');
select pg_temp.assert((select count(*) from public.memories) = 1, 'A sees own memory');
select pg_temp.assert((select user_id from public.memories limit 1) = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'user_id defaults to auth.uid()');

-- ── User B cannot see or touch A's data ──────────────────────────
set request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select pg_temp.assert((select count(*) from public.conversations) = 0, 'B cannot read A conversations');
select pg_temp.assert((select count(*) from public.messages) = 0, 'B cannot read A messages');
select pg_temp.assert((select count(*) from public.memories) = 0, 'B cannot read A memories');
select pg_temp.assert((select count(*) from public.jarvis_settings) = 0, 'B cannot read A settings');
select pg_temp.assert((select count(*) from public.usage_events) = 0, 'B cannot read A usage');
select pg_temp.assert((select count(*) from public.action_log) = 0, 'B cannot read A log');

with u as (update public.memories set content = 'hacked' returning 1) select pg_temp.assert((select count(*) from u) = 0, 'B cannot update A memories');
with d as (delete from public.conversations returning 1) select pg_temp.assert((select count(*) from d) = 0, 'B cannot delete A conversations');

do $$ begin
  insert into public.messages (conversation_id, role, content) values ('c0000000-0000-4000-8000-00000000000a', 'user', 'injected');
  raise exception 'ASSERTION FAILED: B inserted into A conversation';
exception when insufficient_privilege then raise notice 'ok - B cannot post into A conversation';
end $$;

do $$ begin
  insert into public.memories (user_id, content) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'forged');
  raise exception 'ASSERTION FAILED: B forged a memory for A';
exception when insufficient_privilege then raise notice 'ok - B cannot forge rows for A';
end $$;

-- ── Usage and log are append-only ────────────────────────────────
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
do $$ begin
  update public.usage_events set input_tokens = 0;
  raise exception 'ASSERTION FAILED: usage was editable';
exception when insufficient_privilege then raise notice 'ok - usage is not editable';
end $$;
do $$ begin
  delete from public.action_log;
  raise exception 'ASSERTION FAILED: log was deletable';
exception when insufficient_privilege then raise notice 'ok - log is not deletable';
end $$;

-- ── Anonymous role has no access ─────────────────────────────────
reset role;
set role anon;
do $$ begin
  perform 1 from public.memories;
  raise exception 'ASSERTION FAILED: anon read memories';
exception when insufficient_privilege then raise notice 'ok - anon cannot read memories';
end $$;
do $$ begin
  perform public.jarvis_delete_my_data();
  raise exception 'ASSERTION FAILED: anon ran delete function';
exception when insufficient_privilege then raise notice 'ok - anon cannot call delete function';
end $$;

-- ── Delete-everything only affects the caller ────────────────────
reset role;
set role authenticated;
set request.jwt.claim.sub = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
insert into public.memories (content) values ('B memory');
set request.jwt.claim.sub = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select public.jarvis_delete_my_data();
select pg_temp.assert((select count(*) from public.memories) = 0, 'A memories deleted');
select pg_temp.assert((select count(*) from public.conversations) = 0, 'A conversations deleted');
select pg_temp.assert((select count(*) from public.usage_events) = 0, 'A usage deleted');
select pg_temp.assert((select count(*) from public.action_log) = 0, 'A log deleted');
reset role;
select pg_temp.assert((select count(*) from public.memories where content = 'B memory') = 1, 'B data untouched');

\echo 'RLS TESTS PASSED'
