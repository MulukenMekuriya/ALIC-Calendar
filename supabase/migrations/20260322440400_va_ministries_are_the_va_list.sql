-- =====================================================
-- VA's ministries are the list VA gave us, by name and by login
-- =====================================================
--
-- VA sent its ministry list on 24 October 2026: 23 ministries, each named
-- "<Ministry> VA" and each with its own <ministry>.va@alic.org login. The
-- logins already existed and their profiles already carried those names, but
-- budget.ministries still held the old "ALIC VA <Ministry>" names, led by the
-- old alicva.*@gmail.com accounts. The finance forms find a user's ministry by
-- matching profiles.ministry_name to budget.ministries.name, so none of the new
-- logins could see its ministry, and every one of them sat in
-- church.ministry_name_review_queue instead.
--
-- The user, 24 October 2026: names must be exactly what VA asked for.
--
--   - The 17 that exist are RENAMED, not replaced, so their budgets, requests
--     and allocations stay with them (everything hangs off the id).
--   - The 6 that do not exist are added.
--   - Each is led by its new @alic.org login.
--   - The 6 VA rows that are not ministries (Admin twice, Finance, IT Team, IT2,
--     TREASURE: accounts the old profile sync turned into "ministries") are
--     deactivated, not deleted. Checked: none has a request, allocation,
--     assignment, group, course or flag.
--   - Two profiles had a tab inside the name ("Bible Study<TAB>VA",
--     "Building<TAB>VA"); they are normalised so they match.
--   - Review-queue rows that now match a ministry are cleared.

DO $va$
DECLARE
  _va CONSTANT UUID := 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
  _n INTEGER;
BEGIN
  -- 1. Renames: old name -> the name VA asked for.
  CREATE TEMP TABLE va_renames (old_name TEXT, new_name TEXT) ON COMMIT DROP;
  INSERT INTO va_renames VALUES
    ('ALIC VA Bible Study',  'Bible Study VA'),
    ('ALIC VA Children',     'Children VA'),
    ('ALIC VA Choir',        'Choir VA'),
    ('ALIC VA Coordination', 'Coordination VA'),
    ('ALIC VA Deacons',      'Deacons VA'),
    ('ALIC VA Discipleship', 'Discipleship VA'),
    ('ALIC VA Evangelism',   'Evangelism VA'),
    ('ALIC VA Family',       'Family VA'),
    ('ALIC VA Holistic',     'Holistic VA'),
    ('ALIC VA Leaders',      'Leaders VA'),
    ('ALIC VA Media',        'Media VA'),
    ('ALIC VA Men',          'Mens VA'),
    ('ALIC VA Prayer',       'Prayer VA'),
    ('ALIC VA Welcome',      'Welcome VA'),
    ('ALIC VA Women',        'Womens VA'),
    ('ALIC VA Young Adult',  'Young Adult VA'),
    ('ALIC VA Youth',        'Youth VA');

  UPDATE budget.ministries m
  SET name = r.new_name, updated_at = now()
  FROM va_renames r
  WHERE m.organization_id = _va AND m.name = r.old_name;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 17 THEN
    RAISE EXCEPTION 'Expected to rename 17 VA ministries, renamed %', _n;
  END IF;

  -- 2. The six VA did not have.
  INSERT INTO budget.ministries (organization_id, name, is_active)
  VALUES
    (_va, 'Building VA', true),
    (_va, 'Kids Connect VA', true),
    (_va, 'Nethinim VA', true),
    (_va, 'Next Gen VA', true),
    (_va, 'Social Media VA', true),
    (_va, 'Tech VA', true);

  -- 3. Each ministry is led by its own login.
  CREATE TEMP TABLE va_leaders (name TEXT, email TEXT) ON COMMIT DROP;
  INSERT INTO va_leaders VALUES
    ('Bible Study VA',  'biblestudy.va@alic.org'),
    ('Building VA',     'building.va@alic.org'),
    ('Children VA',     'children.va@alic.org'),
    ('Choir VA',        'choir.va@alic.org'),
    ('Coordination VA', 'coordination.va@alic.org'),
    ('Deacons VA',      'deacons.va@alic.org'),
    ('Discipleship VA', 'discipleship.va@alic.org'),
    ('Evangelism VA',   'evangelism.va@alic.org'),
    ('Family VA',       'family.va@alic.org'),
    ('Holistic VA',     'holistic.va@alic.org'),
    ('Kids Connect VA', 'kidsconnect.va@alic.org'),
    ('Leaders VA',      'leaders.va@alic.org'),
    ('Media VA',        'media.va@alic.org'),
    ('Mens VA',         'mens.va@alic.org'),
    ('Nethinim VA',     'nethinim.va@alic.org'),
    ('Next Gen VA',     'nextgen.va@alic.org'),
    ('Prayer VA',       'prayer.va@alic.org'),
    ('Social Media VA', 'socialmedia.va@alic.org'),
    ('Tech VA',         'tech.va@alic.org'),
    ('Welcome VA',      'welcome.va@alic.org'),
    ('Womens VA',       'womens.va@alic.org'),
    ('Young Adult VA',  'youngadult.va@alic.org'),
    ('Youth VA',        'youth.va@alic.org');

  UPDATE budget.ministries m
  SET leader_id = u.id, updated_at = now()
  FROM va_leaders l
  JOIN auth.users u ON lower(u.email) = l.email
  WHERE m.organization_id = _va AND m.name = l.name;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 23 THEN
    RAISE EXCEPTION 'Expected to set 23 VA leaders, set %', _n;
  END IF;

  -- 4. VA rows that are accounts, not ministries.
  UPDATE budget.ministries
  SET is_active = false, updated_at = now()
  WHERE organization_id = _va
    AND btrim(name) IN ('Admin', 'ALIC VA Admin', 'ALIC VA Finance',
                        'ALIC VA IT Team', 'ALIC VA IT2', 'ALIC VA TREASURE');
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n <> 6 THEN
    RAISE EXCEPTION 'Expected to deactivate 6 VA rows, deactivated %', _n;
  END IF;

  SELECT count(*) INTO _n FROM budget.ministries WHERE organization_id = _va AND is_active;
  IF _n <> 23 THEN
    RAISE EXCEPTION 'VA should have 23 active ministries, has %', _n;
  END IF;

  -- 5. The two profiles with a tab in the name.
  UPDATE public.profiles p
  SET ministry_name = regexp_replace(p.ministry_name, '\s+', ' ', 'g')
  FROM auth.users u
  WHERE u.id = p.id
    AND lower(u.email) IN ('biblestudy.va@alic.org', 'building.va@alic.org')
    AND p.ministry_name ~ '\t';

  -- 6. Queue rows that now name a real ministry.
  DELETE FROM church.ministry_name_review_queue q
  USING budget.ministries m
  WHERE q.organization_id = _va
    AND m.organization_id = _va AND m.is_active
    AND lower(btrim(regexp_replace(q.raw_name, '\s+', ' ', 'g'))) = lower(m.name);
END
$va$;
