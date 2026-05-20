-- Link applications to a specific gathering row.
-- Apply in Supabase SQL editor or via CLI after review.

ALTER TABLE public.gathering_applications
  ADD COLUMN IF NOT EXISTS gathering_id UUID REFERENCES public.gatherings (id);

CREATE INDEX IF NOT EXISTS gathering_applications_gathering_id_idx
  ON public.gathering_applications (gathering_id);
