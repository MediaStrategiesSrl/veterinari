ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS created_via text NOT NULL DEFAULT 'app';
