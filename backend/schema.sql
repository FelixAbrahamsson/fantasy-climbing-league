
-- Users table: Managed by Supabase Auth (auth.users), but we add a profile table
create table public.profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Leagues table
create table public.leagues (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  name text not null,
  admin_id uuid references public.profiles(id) not null,
  gender text check (gender in ('men', 'women')) not null,
  discipline text check (discipline in ('boulder', 'lead')) not null,
  invite_code text unique
);

-- League Members
create table public.league_members (
  id uuid default gen_random_uuid() primary key,
  league_id uuid references public.leagues(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  role text check (role in ('admin', 'member')) default 'member',
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(league_id, user_id)
);

-- Climbers (IFSC Data)
create table public.climbers (
  id integer primary key, -- IFSC ID
  name text not null,
  country text,
  gender text check (gender in ('men', 'women')),
  active boolean default true
);

-- Events
create table public.events (
  id integer primary key, -- IFSC ID
  name text not null,
  date timestamp with time zone not null,
  discipline text check (discipline in ('boulder', 'lead')),
  gender text check (gender in ('men', 'women')),
  status text check (status in ('upcoming', 'completed')) default 'upcoming'
);

-- League Events (junction table for which events are part of a league)
create table public.league_events (
  id uuid default gen_random_uuid() primary key,
  league_id uuid references public.leagues(id) on delete cascade not null,
  event_id integer references public.events(id) on delete cascade not null,
  unique(league_id, event_id)
);

-- Fantasy Teams
create table public.fantasy_teams (
  id uuid default gen_random_uuid() primary key,
  league_id uuid references public.leagues(id) on delete cascade not null,
  user_id uuid references public.profiles(id) not null,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(league_id, user_id) -- One team per league per user
);

-- Team Roster
create table public.team_roster (
  id uuid default gen_random_uuid() primary key,
  team_id uuid references public.fantasy_teams(id) on delete cascade not null,
  climber_id integer references public.climbers(id) not null,
  is_captain boolean default false,
  added_at timestamp with time zone default timezone('utc'::text, now()) not null,
  removed_at timestamp with time zone -- If null, currently in team
);

-- Results
create table public.event_results (
  id uuid default gen_random_uuid() primary key,
  event_id integer references public.events(id) not null,
  climber_id integer references public.climbers(id) not null,
  rank integer not null,
  score integer not null, -- Pre-calculated points
  unique(event_id, climber_id)
);

-- Enable RLS (Row Level Security) - Basic setup
alter table profiles enable row level security;
alter table leagues enable row level security;
alter table league_members enable row level security;
alter table fantasy_teams enable row level security;
alter table team_roster enable row level security;

-- Policies (Simplified for initial dev)
create policy "Public profiles are viewable by everyone." on profiles for select using (true);
create policy "Users can insert their own profile." on profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile." on profiles for update using (auth.uid() = id);

create policy "Leagues viewable by members" on leagues for select using (true); -- simplify to public for now
create policy "Authenticated users can create leagues" on leagues for insert with check (auth.role() = 'authenticated');

-- Function to handle new user signup (trigger)
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

