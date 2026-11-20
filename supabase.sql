-- Ejecuta esto una vez en el Editor SQL de Supabase (reemplaza la tabla dnd_items de la versión anterior)

create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Nueva partida',
  state jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

alter table campaigns enable row level security;

create policy "Usuarios pueden leer sus partidas" on campaigns for select using (auth.uid() = owner_id);
create policy "Usuarios pueden crear sus partidas" on campaigns for insert with check (auth.uid() = owner_id);
create policy "Usuarios pueden actualizar sus partidas" on campaigns for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Usuarios pueden borrar sus partidas" on campaigns for delete using (auth.uid() = owner_id);

-- IMPORTANTE: además de este SQL, en el panel de Supabase ve a
-- Authentication → Sign In / Providers → Anonymous sign-ins, y actívalo.
-- Si no lo activas, el botón "Guardar" fallará para quien no use correo.

-- Tabla vieja de la versión multijugador en vivo, ya no se usa:
-- drop table if exists dnd_items;
