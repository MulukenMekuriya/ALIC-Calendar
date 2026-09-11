-- =============================================================================
-- Serving and Bible study, out of the notes and into real records
-- =============================================================================
--
-- The Breeze import put "Serving in" and "Bible study" into church.people.notes
-- as free text, because guessing them into ministries and groups on import day
-- would have been guessing. This is that work done deliberately.
--
-- Until now both tabs on a member's profile were empty for everybody:
-- church.ministry_assignments and church.group_memberships each held 0 rows in
-- this branch. The screens were already built and already querying them — the
-- Serving tab reads ministry_assignments, the Groups tab reads
-- group_memberships — so nothing in the app needs changing. They populate the
-- moment these rows exist.
--
-- WHAT THIS WRITES
-- ----------------
--      8  budget.ministries          names the church uses that had no record
--     29  church.ministry_aliases    every spelling -> one ministry
--    264  church.ministry_assignments  across 178 people
--     28  church.groups              the Bible studies / home cells
--    195  church.group_memberships
--      4  church.training_courses    the class catalogue (see 5b)
--
-- Re-runnable: every write is guarded, and a second run changes nothing.
--
--
-- MINISTRY NAMES
-- --------------
-- The export uses 29 spellings. 21 map onto a ministry already on file — 17
-- matched exactly, and four needed a human to see them:
--
--     MD Home Cell_Bible Study        -> Alic MD Home Cell
--     MD Teaching                     -> Alic MD Teaching & Discipleship
--     MD Evangelism and Discipleship  -> Alic MD Evangelism
--     MD Serving (SMT)                -> ALIC MD Serving Ministry
--
-- The remaining 8 have no counterpart and are created under the name the
-- church wrote, rather than folded into a near neighbour:
--
--     MD Church Custodians (Cleaning)     MD Young Adult Worship
--     MD Maintenance                      MD Young Adult Usher
--     MD Grace                            MD Young Adult Welcome Team
--     MD Leaders                          MD True Vine Evangelism and Discipleship
--
-- The three Young Adult teams are kept apart on purpose. Nine people serve on
-- a specific one, and collapsing them into "Young Adult" would throw away a
-- distinction the church is currently keeping by hand.
--
-- MD Leaders is the one to look at: the database already holds "ALIC Board
-- Leaders" and "ALIC Leaders Council", and this may be either, or neither. It
-- is created separately rather than guessed into one of them. Merging two
-- ministries later is easy; working out which four people were put in the
-- wrong one is not.
--
-- Every spelling is recorded in church.ministry_aliases, which exists for
-- exactly this (20260320000500) — so the next import, and the profile-sync
-- trigger, resolve these names instead of creating ministries from typos.
--
--
-- START DATES
-- -----------
-- Dated 2026-08-27, the day the export was taken, because that is the day the
-- church last confirmed these facts. It is NOT when anyone began serving —
-- nobody knows that, and the export does not say. The profile reads "Since
-- 27 Aug 2026" for a deacon of fifteen years; that is the honest answer to
-- "since when do we know this", and an admin can correct any row.
-- =============================================================================

SET search_path = public, extensions;

BEGIN;

DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM church.people
                  WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
                    AND member_number LIKE 'BRZ-%') THEN
    RAISE EXCEPTION
      'The Breeze import has not been run on this database — there is nothing '
      'to attach ministries and Bible studies to.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- 1. Staged from the export
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _alias (alias TEXT PRIMARY KEY, ministry_name TEXT NOT NULL);
INSERT INTO _alias (alias, ministry_name) VALUES
  ('MD Admin','ALIC MD Admin'),
  ('MD Children','Alic MD Children'),
  ('MD Counseling & Marriage','Alic MD Counseling & Marriage'),
  ('MD Deacons','Alic MD Deacons'),
  ('MD Evangelism and Discipleship','Alic MD Evangelism'),
  ('MD HA Choir','Alic MD Ha Choir'),
  ('MD Holistic','Alic MD Holistic'),
  ('MD Home Cell_Bible Study','Alic MD Home Cell'),
  ('MD Media','Alic MD Media'),
  ('MD Men''s','Alic MD Men''s'),
  ('MD Prayer','Alic MD Prayer'),
  ('MD Senior''s','Alic MD Senior''s'),
  ('MD Serving (SMT)','ALIC MD Serving Ministry'),
  ('MD Teaching','Alic MD Teaching & Discipleship'),
  ('MD True Vine','Alic MD True Vine'),
  ('MD Welcome','Alic MD Welcome'),
  ('MD Women''s','Alic MD Women''s'),
  ('MD Worship','ALIC MD Worship'),
  ('MD Worship B (Aroma)','Alic MD Worship B (Aroma)'),
  ('MD Young Adult','Alic MD Young Adult'),
  ('MD Youth','Alic MD Youth');

CREATE TEMP TABLE _new_ministry (name TEXT PRIMARY KEY);
INSERT INTO _new_ministry (name) VALUES
  ('MD Church Custodians (Cleaning)'),
  ('MD Grace'),
  ('MD Leaders'),
  ('MD Maintenance'),
  ('MD True Vine Evangelism and Discipleship'),
  ('MD Young Adult Usher'),
  ('MD Young Adult Welcome Team'),
  ('MD Young Adult Worship');

CREATE TEMP TABLE _serving (breeze_id TEXT NOT NULL, raw_ministry TEXT NOT NULL);
INSERT INTO _serving (breeze_id, raw_ministry) VALUES
  ('51927644','MD Home Cell_Bible Study'),
  ('51927644','MD Counseling & Marriage'),
  ('51927645','MD Home Cell_Bible Study'),
  ('51927645','MD Worship'),
  ('51927647','MD Youth'),
  ('51927647','MD Church Custodians (Cleaning)'),
  ('51927650','MD Church Custodians (Cleaning)'),
  ('51927650','MD Worship'),
  ('51927653','MD Children'),
  ('51927655','MD Prayer'),
  ('51927655','MD Grace'),
  ('51927657','MD Prayer'),
  ('51927661','MD Church Custodians (Cleaning)'),
  ('51927662','MD Children'),
  ('51927663','MD Children'),
  ('51927663','MD Leaders'),
  ('51927664','MD Prayer'),
  ('51927667','MD HA Choir'),
  ('51927667','MD Church Custodians (Cleaning)'),
  ('51927667','MD Worship'),
  ('51927667','MD Young Adult Usher'),
  ('51927668','MD Evangelism and Discipleship'),
  ('51927668','MD Worship B (Aroma)'),
  ('51927668','MD Home Cell_Bible Study'),
  ('51927670','MD Prayer'),
  ('51927670','MD HA Choir'),
  ('51927672','MD Children'),
  ('51927673','MD Media'),
  ('51927674','MD Men''s'),
  ('51927675','MD Church Custodians (Cleaning)'),
  ('51927676','MD Evangelism and Discipleship'),
  ('51927676','MD Home Cell_Bible Study'),
  ('51927676','MD Serving (SMT)'),
  ('51927680','MD Worship B (Aroma)'),
  ('51927680','MD Home Cell_Bible Study'),
  ('51927681','MD Worship B (Aroma)'),
  ('51927681','MD Home Cell_Bible Study'),
  ('51927682','MD Men''s'),
  ('51927682','MD Grace'),
  ('51927683','MD Church Custodians (Cleaning)'),
  ('51927686','MD Evangelism and Discipleship'),
  ('51927686','MD Welcome'),
  ('51927687','MD Evangelism and Discipleship'),
  ('51927687','MD Home Cell_Bible Study'),
  ('51927688','MD Home Cell_Bible Study'),
  ('51927691','MD Youth'),
  ('51927691','MD Serving (SMT)'),
  ('51927692','MD Evangelism and Discipleship'),
  ('51927692','MD Home Cell_Bible Study'),
  ('51927694','MD Holistic'),
  ('51927694','MD Serving (SMT)'),
  ('51927694','MD Church Custodians (Cleaning)'),
  ('51927697','MD Children'),
  ('51927698','MD Holistic'),
  ('51927701','MD Youth'),
  ('51927703','MD Prayer'),
  ('51927707','MD HA Choir'),
  ('51927707','MD Home Cell_Bible Study'),
  ('51927709','MD Home Cell_Bible Study'),
  ('51927713','MD Home Cell_Bible Study'),
  ('51927717','MD Home Cell_Bible Study'),
  ('51927719','MD Men''s'),
  ('51927719','MD HA Choir'),
  ('51927721','MD Church Custodians (Cleaning)'),
  ('51927727','MD True Vine'),
  ('51927727','MD Welcome'),
  ('51927728','MD Deacons'),
  ('51927730','MD Young Adult'),
  ('51927730','MD Evangelism and Discipleship'),
  ('51927730','MD Worship B (Aroma)'),
  ('51927730','MD Home Cell_Bible Study'),
  ('51927730','MD Worship'),
  ('51927731','MD Prayer'),
  ('51927736','MD Evangelism and Discipleship'),
  ('51927738','MD Women''s'),
  ('51927739','MD Home Cell_Bible Study'),
  ('51927739','MD Counseling & Marriage'),
  ('51927739','MD Teaching'),
  ('51927741','MD Prayer'),
  ('51927742','MD Home Cell_Bible Study'),
  ('51927742','MD Young Adult Worship'),
  ('51927745','MD Home Cell_Bible Study'),
  ('51927745','MD Serving (SMT)'),
  ('51927745','MD Church Custodians (Cleaning)'),
  ('51927747','MD Church Custodians (Cleaning)'),
  ('51927750','MD Home Cell_Bible Study'),
  ('51927757','MD Home Cell_Bible Study'),
  ('51927759','MD HA Choir'),
  ('51927761','MD Young Adult'),
  ('51927761','MD Evangelism and Discipleship'),
  ('51927761','MD Home Cell_Bible Study'),
  ('51927761','MD Teaching'),
  ('51927765','MD Home Cell_Bible Study'),
  ('51927765','MD Worship'),
  ('51927769','MD Home Cell_Bible Study'),
  ('51927772','MD Evangelism and Discipleship'),
  ('51927772','MD Home Cell_Bible Study'),
  ('51927772','MD Leaders'),
  ('51927772','MD Young Adult'),
  ('51927778','MD Worship B (Aroma)'),
  ('51927778','MD Welcome'),
  ('51927781','MD Prayer'),
  ('51927781','MD Evangelism and Discipleship'),
  ('51927784','MD Evangelism and Discipleship'),
  ('51927786','MD Evangelism and Discipleship'),
  ('51927788','MD Young Adult Worship'),
  ('51927791','MD Grace'),
  ('51927794','MD Home Cell_Bible Study'),
  ('51927798','MD Evangelism and Discipleship'),
  ('51927804','MD Prayer'),
  ('51927805','MD Women''s'),
  ('51927812','MD Women''s'),
  ('51927821','MD HA Choir'),
  ('51927821','MD Welcome'),
  ('51927822','MD Prayer'),
  ('51927826','MD Welcome'),
  ('51927829','MD Men''s'),
  ('51927829','MD Home Cell_Bible Study'),
  ('51927833','MD Worship B (Aroma)'),
  ('51927834','MD Children'),
  ('51927844','MD HA Choir'),
  ('51927856','MD Church Custodians (Cleaning)'),
  ('51927859','MD Media'),
  ('51927860','MD Men''s'),
  ('51927860','MD Holistic'),
  ('51927863','MD Deacons'),
  ('51927871','MD Children'),
  ('51927882','MD Women''s'),
  ('51927884','MD Children'),
  ('51927891','MD Children'),
  ('51927896','MD Worship'),
  ('51927905','MD Deacons'),
  ('51927907','MD Evangelism and Discipleship'),
  ('51927907','MD Home Cell_Bible Study'),
  ('51927907','MD Teaching'),
  ('51927909','MD Young Adult'),
  ('51927911','MD Children'),
  ('51927911','MD Young Adult Worship'),
  ('51927913','MD Young Adult'),
  ('51927914','MD Young Adult Worship'),
  ('51927915','MD Media'),
  ('51927915','MD Worship'),
  ('51927916','MD Youth'),
  ('51927916','MD Home Cell_Bible Study'),
  ('51927916','MD Teaching'),
  ('51927916','MD Young Adult'),
  ('51927918','MD Young Adult Worship'),
  ('51927927','MD Prayer'),
  ('51927927','MD Deacons'),
  ('51927928','MD Young Adult'),
  ('51927929','MD Home Cell_Bible Study'),
  ('51927929','MD Worship'),
  ('51927930','MD Children'),
  ('51927935','MD Deacons'),
  ('51927937','MD Children'),
  ('51927938','MD Worship'),
  ('51927941','MD Evangelism and Discipleship'),
  ('51927951','MD Home Cell_Bible Study'),
  ('51927952','MD Women''s'),
  ('51927955','MD Maintenance'),
  ('51927957','MD Evangelism and Discipleship'),
  ('51927958','MD Worship B (Aroma)'),
  ('51927958','MD Home Cell_Bible Study'),
  ('51927958','MD Young Adult Welcome Team'),
  ('51927960','MD Home Cell_Bible Study'),
  ('51927965','MD Admin'),
  ('51927965','MD Maintenance'),
  ('51927969','MD Church Custodians (Cleaning)'),
  ('51927969','MD Worship'),
  ('51927971','MD Youth'),
  ('51927971','MD True Vine'),
  ('51927974','MD Women''s'),
  ('51927979','MD Media'),
  ('51927979','MD Men''s'),
  ('51927984','MD Women''s'),
  ('51927984','MD Home Cell_Bible Study'),
  ('51927984','MD Holistic'),
  ('51927984','MD Church Custodians (Cleaning)'),
  ('51927988','MD Counseling & Marriage'),
  ('51927988','MD Worship'),
  ('51927989','MD Home Cell_Bible Study'),
  ('51928003','MD Serving (SMT)'),
  ('51928013','MD Children'),
  ('51928019','MD Men''s'),
  ('51928022','MD Home Cell_Bible Study'),
  ('51928022','MD Worship'),
  ('51928027','MD Welcome'),
  ('51928043','MD Worship'),
  ('51928049','MD Deacons'),
  ('51928051','MD True Vine'),
  ('51928051','MD True Vine Evangelism and Discipleship'),
  ('51928053','MD Worship'),
  ('51928055','MD Children'),
  ('51928056','MD Welcome'),
  ('51928058','MD Worship'),
  ('51928061','MD Worship'),
  ('51928062','MD Prayer'),
  ('51928066','MD Youth'),
  ('51928066','MD Young Adult'),
  ('51928071','MD Welcome'),
  ('51928074','MD Prayer'),
  ('51928074','MD Deacons'),
  ('51928075','MD Media'),
  ('51928088','MD Children'),
  ('51928089','MD Welcome'),
  ('51928089','MD Senior''s'),
  ('51928097','MD Welcome'),
  ('51928108','MD Media'),
  ('51928109','MD Prayer'),
  ('51928110','MD Women''s'),
  ('51928114','MD Senior''s'),
  ('51928118','MD Home Cell_Bible Study'),
  ('51928118','MD Worship'),
  ('51928119','MD Deacons'),
  ('51928121','MD Home Cell_Bible Study'),
  ('51928122','MD Deacons'),
  ('51928129','MD Young Adult'),
  ('51928130','MD Leaders'),
  ('51928131','MD Home Cell_Bible Study'),
  ('51928131','MD Church Custodians (Cleaning)'),
  ('51928132','MD Worship B (Aroma)'),
  ('51928137','MD Youth'),
  ('51928137','MD True Vine'),
  ('52121956','MD Senior''s'),
  ('52121956','MD Church Custodians (Cleaning)'),
  ('52121964','MD Worship'),
  ('52121967','MD Deacons'),
  ('52121968','MD HA Choir'),
  ('52121982','MD Worship'),
  ('52121983','MD Youth'),
  ('52121983','MD Leaders'),
  ('52121983','MD Young Adult Usher'),
  ('52121984','MD Children'),
  ('52121984','MD Counseling & Marriage'),
  ('52121985','MD Counseling & Marriage'),
  ('52121985','MD Grace'),
  ('52121989','MD Deacons'),
  ('52121989','MD Senior''s'),
  ('52121991','MD Worship'),
  ('52121992','MD Children'),
  ('52121992','MD Home Cell_Bible Study'),
  ('52121992','MD Church Custodians (Cleaning)'),
  ('52121992','MD Maintenance'),
  ('52122003','MD Children'),
  ('52122003','MD Welcome'),
  ('52122003','MD Church Custodians (Cleaning)'),
  ('52122006','MD Prayer'),
  ('52148109','MD Senior''s'),
  ('52149827','MD Worship'),
  ('52880303','MD Home Cell_Bible Study'),
  ('52880306','MD Deacons'),
  ('52880310','MD Prayer'),
  ('52880310','MD Deacons'),
  ('52880316','MD Worship'),
  ('52880335','MD Prayer'),
  ('52880336','MD Media'),
  ('53176410','MD Children'),
  ('53176411','MD Evangelism and Discipleship'),
  ('53176455','MD Worship'),
  ('53231904','MD Women''s'),
  ('53285686','MD Children'),
  ('53286406','MD Children'),
  ('53288097','MD Evangelism and Discipleship'),
  ('53347565','MD Children');

CREATE TEMP TABLE _group (name TEXT PRIMARY KEY);
INSERT INTO _group (name) VALUES
  ('Agape'),
  ('Barnabas'),
  ('Beria'),
  ('Bethesda'),
  ('Boanerges'),
  ('Cherry Hill'),
  ('Columbia Area'),
  ('East-West'),
  ('Ecclesia (True Vine)'),
  ('Exodus'),
  ('Exodus Laurel'),
  ('Fairland'),
  ('Family'),
  ('Germantown'),
  ('Halewot (VALERIE)'),
  ('Kebron (City of Refuge)'),
  ('Lodestone'),
  ('North Laurel (Tabor)'),
  ('Olney'),
  ('Open Heaven'),
  ('Pharez'),
  ('Rehoboth 1'),
  ('Rehoboth 2'),
  ('Selah (True Vine)'),
  ('Sligo'),
  ('Treetop'),
  ('Wheaton (Abenezer)'),
  ('Yishakor');

CREATE TEMP TABLE _study (breeze_id TEXT NOT NULL, group_name TEXT NOT NULL);
INSERT INTO _study (breeze_id, group_name) VALUES
  ('51927644','Beria'),
  ('51927645','Olney'),
  ('51927646','Kebron (City of Refuge)'),
  ('51927647','Treetop'),
  ('51927650','North Laurel (Tabor)'),
  ('51927653','Boanerges'),
  ('51927655','Boanerges'),
  ('51927657','Halewot (VALERIE)'),
  ('51927661','Beria'),
  ('51927663','Kebron (City of Refuge)'),
  ('51927666','Halewot (VALERIE)'),
  ('51927667','Boanerges'),
  ('51927668','Exodus'),
  ('51927670','Boanerges'),
  ('51927673','Treetop'),
  ('51927675','Exodus Laurel'),
  ('51927676','Lodestone'),
  ('51927677','Exodus Laurel'),
  ('51927680','Barnabas'),
  ('51927681','Columbia Area'),
  ('51927682','Open Heaven'),
  ('51927683','East-West'),
  ('51927686','Rehoboth 2'),
  ('51927687','Olney'),
  ('51927691','Bethesda'),
  ('51927692','Exodus Laurel'),
  ('51927694','Halewot (VALERIE)'),
  ('51927695','Exodus'),
  ('51927697','Beria'),
  ('51927698','Germantown'),
  ('51927699','Agape'),
  ('51927704','Treetop'),
  ('51927705','Barnabas'),
  ('51927707','Pharez'),
  ('51927708','Pharez'),
  ('51927709','Rehoboth 2'),
  ('51927713','Cherry Hill'),
  ('51927716','Sligo'),
  ('51927717','Boanerges'),
  ('51927719','Fairland'),
  ('51927724','Columbia Area'),
  ('51927727','Family'),
  ('51927728','Pharez'),
  ('51927730','Exodus Laurel'),
  ('51927731','Bethesda'),
  ('51927732','Barnabas'),
  ('51927733','Olney'),
  ('51927738','Family'),
  ('51927739','Yishakor'),
  ('51927741','Rehoboth 1'),
  ('51927742','Boanerges'),
  ('51927745','East-West'),
  ('51927747','Rehoboth 1'),
  ('51927750','Open Heaven'),
  ('51927751','Exodus Laurel'),
  ('51927752','Cherry Hill'),
  ('51927756','Bethesda'),
  ('51927757','Treetop'),
  ('51927759','Fairland'),
  ('51927761','Barnabas'),
  ('51927765','Agape'),
  ('51927769','Cherry Hill'),
  ('51927771','Fairland'),
  ('51927772','Treetop'),
  ('51927776','Olney'),
  ('51927784','Fairland'),
  ('51927788','Kebron (City of Refuge)'),
  ('51927792','Barnabas'),
  ('51927799','Barnabas'),
  ('51927805','Yishakor'),
  ('51927806','Olney'),
  ('51927818','Open Heaven'),
  ('51927821','Beria'),
  ('51927822','Sligo'),
  ('51927826','Pharez'),
  ('51927829','Pharez'),
  ('51927844','Beria'),
  ('51927847','Agape'),
  ('51927856','East-West'),
  ('51927860','Beria'),
  ('51927863','Halewot (VALERIE)'),
  ('51927871','Beria'),
  ('51927882','Fairland'),
  ('51927885','Cherry Hill'),
  ('51927891','Lodestone'),
  ('51927892','Exodus'),
  ('51927897','Pharez'),
  ('51927907','Kebron (City of Refuge)'),
  ('51927909','Kebron (City of Refuge)'),
  ('51927911','Exodus'),
  ('51927912','Rehoboth 2'),
  ('51927913','Treetop'),
  ('51927914','Agape'),
  ('51927915','Treetop'),
  ('51927916','Barnabas'),
  ('51927918','Rehoboth 2'),
  ('51927927','Halewot (VALERIE)'),
  ('51927928','Boanerges'),
  ('51927929','Beria'),
  ('51927930','Cherry Hill'),
  ('51927937','Exodus'),
  ('51927938','Treetop'),
  ('51927942','Boanerges'),
  ('51927948','Treetop'),
  ('51927951','East-West'),
  ('51927952','Pharez'),
  ('51927954','East-West'),
  ('51927955','East-West'),
  ('51927957','Agape'),
  ('51927958','Exodus'),
  ('51927960','Pharez'),
  ('51927965','Family'),
  ('51927969','Treetop'),
  ('51927971','Exodus'),
  ('51927972','Pharez'),
  ('51927977','Pharez'),
  ('51927978','Wheaton (Abenezer)'),
  ('51927979','Kebron (City of Refuge)'),
  ('51927983','Pharez'),
  ('51927984','Fairland'),
  ('51927986','Columbia Area'),
  ('51927992','Pharez'),
  ('51928003','Kebron (City of Refuge)'),
  ('51928015','Beria'),
  ('51928016','Yishakor'),
  ('51928019','Open Heaven'),
  ('51928022','Bethesda'),
  ('51928027','Treetop'),
  ('51928041','Bethesda'),
  ('51928043','Halewot (VALERIE)'),
  ('51928044','Lodestone'),
  ('51928049','Germantown'),
  ('51928051','Rehoboth 2'),
  ('51928053','Olney'),
  ('51928055','Beria'),
  ('51928056','Wheaton (Abenezer)'),
  ('51928058','Sligo'),
  ('51928060','Exodus'),
  ('51928061','East-West'),
  ('51928062','Fairland'),
  ('51928069','Yishakor'),
  ('51928074','Lodestone'),
  ('51928075','Ecclesia (True Vine)'),
  ('51928081','Olney'),
  ('51928089','Pharez'),
  ('51928096','Halewot (VALERIE)'),
  ('51928097','Wheaton (Abenezer)'),
  ('51928102','Exodus Laurel'),
  ('51928109','Pharez'),
  ('51928110','Rehoboth 1'),
  ('51928114','Pharez'),
  ('51928118','Sligo'),
  ('51928121','Germantown'),
  ('51928122','Pharez'),
  ('51928129','Exodus'),
  ('51928130','Pharez'),
  ('51928131','Exodus Laurel'),
  ('51928132','Barnabas'),
  ('51928137','Beria'),
  ('51928138','Family'),
  ('52077901','Germantown'),
  ('52121956','Wheaton (Abenezer)'),
  ('52121964','Lodestone'),
  ('52121966','Germantown'),
  ('52121967','Wheaton (Abenezer)'),
  ('52121968','Wheaton (Abenezer)'),
  ('52121969','Pharez'),
  ('52121971','Rehoboth 2'),
  ('52121975','Columbia Area'),
  ('52121980','Open Heaven'),
  ('52121982','Rehoboth 1'),
  ('52121983','Kebron (City of Refuge)'),
  ('52121984','Family'),
  ('52121989','Yishakor'),
  ('52121991','Rehoboth 1'),
  ('52121992','Halewot (VALERIE)'),
  ('52121997','Yishakor'),
  ('52122002','Rehoboth 1'),
  ('52122003','Sligo'),
  ('52122006','Rehoboth 1'),
  ('52122007','Sligo'),
  ('52148109','Bethesda'),
  ('52149827','Pharez'),
  ('52880303','Exodus Laurel'),
  ('52880304','Exodus Laurel'),
  ('52880310','Rehoboth 1'),
  ('52880316','Pharez'),
  ('53176107','Olney'),
  ('53176410','Selah (True Vine)'),
  ('53176411','Barnabas'),
  ('53230456','Olney'),
  ('53231904','Rehoboth 1'),
  ('53286406','Olney'),
  ('53288065','Olney'),
  ('53288081','Olney');

-- -----------------------------------------------------------------------------
-- 2. Ministries the church names but the database does not hold
-- -----------------------------------------------------------------------------
INSERT INTO budget.ministries (organization_id, name, description, is_active)
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID, n.name,
       'Created from the Breeze export of 2026-08-27, under the name the '
       'church uses. Merge into an existing ministry if it duplicates one.',
       true
  FROM _new_ministry n
 WHERE NOT EXISTS (
   SELECT 1 FROM budget.ministries m
    WHERE m.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      AND lower(btrim(m.name)) = lower(btrim(n.name)));

-- A ministry created above is its own alias, so the spelling resolves next time.
INSERT INTO _alias (alias, ministry_name)
SELECT n.name, n.name FROM _new_ministry n
ON CONFLICT (alias) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. Every spelling, pointed at one ministry
-- -----------------------------------------------------------------------------
INSERT INTO church.ministry_aliases (organization_id, alias, ministry_id)
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID, a.alias, m.id
  FROM _alias a
  JOIN budget.ministries m
    ON m.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
   AND lower(btrim(m.name)) = lower(btrim(a.ministry_name))
ON CONFLICT (organization_id, alias) DO NOTHING;

DO $check$
DECLARE _missing TEXT;
BEGIN
  SELECT string_agg(a.alias, ', ') INTO _missing
    FROM _alias a
   WHERE NOT EXISTS (SELECT 1 FROM church.ministry_aliases al
                      WHERE al.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND al.alias = a.alias);
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'These ministry names did not resolve: %', _missing;
  END IF;
END
$check$;

-- -----------------------------------------------------------------------------
-- 4. Who serves where
-- -----------------------------------------------------------------------------
-- Role is "Member" for everyone. The export records the ministry, never the
-- role, and promoting somebody to Leader on no evidence would put a name
-- against a responsibility they may not hold.
INSERT INTO church.ministry_assignments (
  organization_id, person_id, ministry_id, ministry_role_id,
  start_date, notes, created_by_name)
SELECT DISTINCT
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID, p.id, al.ministry_id, r.id,
  DATE '2026-08-27',
  'Recorded in the Breeze export of 2026-08-27 as "' || sv.raw_ministry
    || '". The date is when the church confirmed this, not when they began.',
  'Breeze export 2026-08-27'
FROM _serving sv
JOIN church.people p
  ON p.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
 AND p.member_number = 'BRZ-' || sv.breeze_id
JOIN church.ministry_aliases al
  ON al.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND al.alias = sv.raw_ministry
JOIN church.ministry_roles r
  ON r.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND r.code = 'member'
WHERE NOT EXISTS (
  SELECT 1 FROM church.ministry_assignments x
   WHERE x.person_id = p.id
     AND x.ministry_id = al.ministry_id
     AND x.ministry_role_id = r.id
     AND x.end_date IS NULL);

-- -----------------------------------------------------------------------------
-- 5. The Bible studies
-- -----------------------------------------------------------------------------
-- Typed bible_study because that is the column the church filled in. Several
-- are plainly home cells by another name; the group type is one dropdown for
-- an admin to change and nothing depends on it.
INSERT INTO church.groups (
  organization_id, name, group_type_id, description, is_active, created_by_name)
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID, g.name, gt.id,
       'From the Breeze export of 2026-08-27.', true, 'Breeze export 2026-08-27'
  FROM _group g
  JOIN church.group_types gt
    ON gt.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND gt.code = 'bible_study'
ON CONFLICT (organization_id, name) DO NOTHING;

INSERT INTO church.group_memberships (
  organization_id, group_id, person_id, role_id, start_date, notes)
SELECT DISTINCT
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID, g.id, p.id, r.id, DATE '2026-08-27',
  'Recorded in the Breeze export of 2026-08-27.'
FROM _study st
JOIN church.people p
  ON p.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
 AND p.member_number = 'BRZ-' || st.breeze_id
JOIN church.groups g
  ON g.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND g.name = st.group_name
JOIN church.ministry_roles r
  ON r.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND r.code = 'member'
WHERE NOT EXISTS (
  SELECT 1 FROM church.group_memberships x
   WHERE x.person_id = p.id AND x.group_id = g.id AND x.end_date IS NULL);

-- -----------------------------------------------------------------------------
-- 5b. The four classes, as a course catalogue
-- -----------------------------------------------------------------------------
-- The export's last list is its longest column header: "Have you taken or are
-- you currently taking any of the following classes in Addis Lidet Church?"
-- Four values — Baptism, Discipleship 101, Discipleship 102, SMT — against 140
-- people.
--
-- The COURSES are created. Who has taken them is NOT, and that is deliberate:
--
--   * church.training_attendance keys to a training_session, not a course, and
--     a session needs a starts_at. The export gives no dates, so recording 140
--     attendances would mean inventing four classes that met at a specific
--     hour on a specific day. A fabricated timestamp in an attendance record is
--     worse than a note, because it looks like evidence.
--
--   * Nothing in the application reads training yet. There is no service, no
--     hook and no screen — only the table definitions and their TypeScript
--     types. Rows written now would be invisible until that is built.
--
-- So each person's classes stay in their notes, where the import put them and
-- where a human can read them, and the catalogue exists for whoever builds the
-- training screen. Grep for "Classes:" in church.people.notes to find the 140.

INSERT INTO church.training_courses (
  organization_id, code, name, category, is_active, created_by_name)
SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::UUID, v.code, v.name, v.category, true, 'Breeze export 2026-08-27'
  FROM (VALUES
    ('baptism',    'Baptism',          'membership'),
    ('disc_101',   'Discipleship 101', 'discipleship'),
    ('disc_102',   'Discipleship 102', 'discipleship'),
    ('smt',        'SMT',              'serving')
  ) AS v(code, name, category)
ON CONFLICT (organization_id, name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 6. What happened
-- -----------------------------------------------------------------------------
SELECT 'ministries on file'          AS item,
       count(*)::TEXT                AS value
  FROM budget.ministries WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
UNION ALL SELECT 'ministry name aliases', count(*)::TEXT
  FROM church.ministry_aliases WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
UNION ALL SELECT 'serving records', count(*)::TEXT
  FROM church.ministry_assignments WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND end_date IS NULL
UNION ALL SELECT 'people serving somewhere', count(DISTINCT person_id)::TEXT
  FROM church.ministry_assignments WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND end_date IS NULL
UNION ALL SELECT 'bible study groups', count(*)::TEXT
  FROM church.groups WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
UNION ALL SELECT 'bible study members', count(*)::TEXT
  FROM church.group_memberships WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' AND end_date IS NULL
UNION ALL SELECT 'class courses on file', count(*)::TEXT
  FROM church.training_courses WHERE organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
UNION ALL SELECT 'serving rows staged but unmatched', count(*)::TEXT
  FROM _serving sv WHERE NOT EXISTS (
    SELECT 1 FROM church.people p WHERE p.organization_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      AND p.member_number = 'BRZ-' || sv.breeze_id);

COMMIT;
