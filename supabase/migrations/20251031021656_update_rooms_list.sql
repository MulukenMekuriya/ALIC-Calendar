-- Update rooms list to new church room structure

-- Delete rooms that are no longer needed
DELETE FROM public.rooms WHERE name IN (
  'Joy Class',
  'Redeemer Class',
  'Blossom Class'
);

-- Update existing rooms to match new naming convention
UPDATE public.rooms SET name = 'Shine class' WHERE name = 'Shine Class';
UPDATE public.rooms SET name = 'Fasika room' WHERE name = 'Fasika Room';
UPDATE public.rooms SET name = 'Youth/True Vine worship Room' WHERE name = 'Youth/True Vine Worship Room';
UPDATE public.rooms SET name = 'Other (if outside the church)' WHERE name = 'Other (Outside Church)';

-- Insert new rooms (only if they don't already exist)
INSERT INTO public.rooms (name, description, color)
SELECT * FROM (VALUES
  ('Shine class', 'Children and youth education', '#ec4899'),
  ('Fasika room', 'Multi-purpose meeting room', '#f59e0b'),
  ('Joy class A', 'Fellowship and community gathering', '#10b981'),
  ('Joy class B', 'Fellowship and community gathering', '#10b981'),
  ('Training Conference room A', 'First training and conference space', '#3b82f6'),
  ('Training Conference room B', 'Second training and conference space', '#3b82f6'),
  ('Blossom class A', 'Teaching and ministry activities', '#8b5cf6'),
  ('Blossom class B', 'Teaching and ministry activities', '#8b5cf6'),
  ('Youth/True Vine worship Room', 'Youth ministry and worship space', '#ef4444'),
  ('Main Auditorium', 'Primary worship and gathering space', '#6366f1'),
  ('Other (if outside the church)', 'Events held outside church premises', '#6b7280')
) AS new_rooms(name, description, color)
WHERE NOT EXISTS (
  SELECT 1 FROM public.rooms WHERE rooms.name = new_rooms.name
);
