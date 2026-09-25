-- =====================================================
-- A grade for the youngest
-- =====================================================
--
-- Kidventure takes children aged one to three. It exists in production as an
-- active check-in classroom at sort_order 0, and it is the ONLY one of the
-- eleven with no school grade set — which is exactly what the Classrooms tab's
-- "no grade set" warning has been pointing at.
--
-- Nothing could be set, because the grade list starts at Pre-K.
-- church.school_grades was seeded with prek..g12 (20260320000300:281) on the
-- stated basis that "ALIC runs no nursery" (20260320002500:517), and
-- gradeForAge.ts has YOUNGEST_AGE = 4 and returns null below it. A three-year-
-- old therefore got no grade suggestion at all, and check-in fell through to
-- the age band.
--
-- ONE GRADE, NOT THREE. church.room_kids_config.school_grade_id is a single
-- column: a classroom teaches exactly one grade. Ages 1, 2 and 3 as separate
-- grades would need either three Kidventure rooms to be opened and staffed
-- every Sunday, or a new room-to-grades join table and a rewrite of
-- pick_room_for_child. One grade spanning the band is what the room actually
-- is, and it needs no schema change at all.
--
-- SORT ORDER 0. The seeded grades step by ten from Pre-K at 10, and
-- gradeForAge maps age to sort_order as (age - 3) * 10 — so age 4 is 10 and
-- age 3 is already 0. The arithmetic was always going to land here; only the
-- row was missing. Kidventure's own room sort_order is also 0, which is a
-- coincidence but a fitting one: it is the first room on the board.
--
-- The grade is NOT attached to Kidventure here. A kids admin picks it in the
-- Classrooms tab, which is the screen that exists for exactly this and keeps
-- the room's configuration a ministry decision rather than a migration's.

INSERT INTO church.school_grades (organization_id, code, display_name, sort_order)
SELECT o.id, v.code, v.display_name, v.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('age1_3', 'Ages 1-3', 0)
) AS v(code, display_name, sort_order)
ON CONFLICT (organization_id, code) DO NOTHING;

COMMENT ON TABLE church.school_grades IS
  'The school grades a classroom can teach. Seeded Pre-K through Grade 12, '
  'plus Ages 1-3 for the nursery-age room, which is below school age and has '
  'sort_order 0 so it sorts first. gradeForAge maps an age to sort_order as '
  '(age - 3) * 10, clamped at 0.';

NOTIFY pgrst, 'reload schema';
