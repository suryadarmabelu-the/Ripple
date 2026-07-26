-- ============================================================
-- Ripple Chat — Supabase schema
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor
-- ============================================================

-- Pastikan extension uuid tersedia
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PROFILES
-- Satu baris per pengguna, dibuat otomatis saat mendaftar (dari sisi client)
-- ------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  username text unique not null,
  avatar_url text,
  status_message text default 'Halo! Saya pakai Ripple.',
  is_online boolean default false,
  last_seen timestamptz default now(),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Semua user login bisa lihat profil dasar"
  on profiles for select
  to authenticated
  using (true);

create policy "User bisa insert profil miliknya sendiri"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "User bisa update profil miliknya sendiri"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

-- ------------------------------------------------------------
-- 2. CONTACTS
-- Daftar kontak per user (searah, agar sederhana)
-- ------------------------------------------------------------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade not null,
  contact_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (owner_id, contact_id),
  check (owner_id <> contact_id)
);

alter table contacts enable row level security;

create policy "User kelola kontak miliknya sendiri"
  on contacts for all
  to authenticated
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Fungsi untuk menambah kontak dua arah sekaligus (agar A & B
-- sama-sama muncul di daftar kontak masing-masing) berdasarkan email.
create or replace function add_contact_mutual(target_email text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target profiles;
begin
  select * into target from profiles where email = target_email;

  if target.id is null then
    raise exception 'Pengguna dengan email tersebut tidak ditemukan';
  end if;

  if target.id = auth.uid() then
    raise exception 'Tidak bisa menambahkan diri sendiri sebagai kontak';
  end if;

  insert into contacts (owner_id, contact_id) values (auth.uid(), target.id)
  on conflict (owner_id, contact_id) do nothing;

  insert into contacts (owner_id, contact_id) values (target.id, auth.uid())
  on conflict (owner_id, contact_id) do nothing;

  return target;
end;
$$;

grant execute on function add_contact_mutual(text) to authenticated;

-- ------------------------------------------------------------
-- 3. CONVERSATIONS
-- Satu percakapan 1-on-1 antara dua profil (user_a selalu id lebih kecil)
-- ------------------------------------------------------------
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid references profiles(id) on delete cascade not null,
  user_b uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique (user_a, user_b),
  check (user_a <> user_b)
);

alter table conversations enable row level security;

create policy "Peserta percakapan bisa lihat"
  on conversations for select
  to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "Peserta percakapan bisa membuat"
  on conversations for insert
  to authenticated
  with check (auth.uid() = user_a or auth.uid() = user_b);

-- ------------------------------------------------------------
-- 4. MESSAGES
-- ------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete cascade not null,
  content text,
  file_url text,
  file_type text,
  file_name text,
  created_at timestamptz default now(),
  read_at timestamptz
);

alter table messages enable row level security;

create policy "Peserta percakapan bisa baca pesan"
  on messages for select
  to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "Peserta percakapan bisa kirim pesan"
  on messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from conversations c
      where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "Pengirim bisa update pesannya (mis. read_at)"
  on messages for update
  to authenticated
  using (
    exists (
      select 1 from conversations c
      where c.id = conversation_id
      and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Index untuk mempercepat query riwayat chat
create index if not exists idx_messages_conversation_created
  on messages (conversation_id, created_at);

-- ------------------------------------------------------------
-- 5. REALTIME
-- Aktifkan replication untuk tabel messages & profiles (status online)
-- ------------------------------------------------------------
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table profiles;

-- ------------------------------------------------------------
-- 6. STORAGE BUCKET untuk lampiran file & foto kamera
-- Jalankan bagian ini, lalu atur policy storage di bawah
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', true)
on conflict (id) do nothing;

-- Semua user login boleh upload ke folder bernama uid mereka sendiri
create policy "User upload ke folder miliknya sendiri"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Bucket bersifat public read (agar preview gambar/file mudah ditampilkan)
create policy "Siapa pun bisa baca file di bucket attachments"
  on storage.objects for select
  to public
  using (bucket_id = 'attachments');

create policy "User hapus file miliknya sendiri"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
