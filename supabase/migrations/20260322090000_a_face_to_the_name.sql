-- =====================================================
-- A face to the name
-- =====================================================
--
-- church.people has carried a photo_path column since 20260320000400 and
-- nothing has ever written to it: `grep -rn photo_path src` matches the
-- generated types and nothing else. There is no upload, no display, and no
-- policy — the column is a note somebody left for later. This is later.
--
-- WHAT THIS IS FOR. Two different people want a face, for two different
-- reasons, and only one of them is cosmetic:
--
--   * The office opens a member record and sees a name it cannot place. A
--     directory of 582 names with four Selams in it is a directory you have to
--     telephone somebody about.
--
--   * The check-in desk hands a child to an adult. Everything else in this
--     system — the pickup code, the authorised-collector list, the
--     restriction orders — exists to answer "is this the right person", and
--     the one thing the volunteer holding the tablet actually has is a face.
--
-- THREE PHOTOS, STRUCTURALLY. A slot column checked to 1..3 and unique per
-- person, rather than a count enforced in application code: two tablets
-- uploading at once cannot both read "2 photos" and both insert a third. The
-- limit is a property of the table, not of the code that is careful.
--
-- WHO MAY DO WHAT
-- ---------------
--   ADD / REPLACE / DELETE     a member for themselves; members_admin for
--                              anyone in the branch; a parent for a child of
--                              their own household — the same boundary
--                              20260322050000 drew for family ties and
--                              20260322080000 drew for a child's record.
--
--   SEE                        the person themselves, their household, and
--                              staff who can already read the directory. Plus,
--                              for a CHILD only, the kids team and any tablet
--                              holding a live check-in shift.
--
-- A member of the congregation at large sees nobody's photo. That is not a
-- shrug: 20260321001600 settled that a plain member reaches no internal tool,
-- and a browsable gallery of the congregation's faces would be the first
-- exception to it — the kind that cannot be walked back once the images are
-- out. The bucket is private and every read is a signed URL minted against
-- these policies.
--
-- CHILDREN AND CONSENT
-- --------------------
-- church.person_sensitive.photo_consent has existed since 20260320000400,
-- defaults to false, and nothing has ever set it. It is the church's record of
-- permission to hold and use a child's image, and this migration is the first
-- thing in the system with a reason to read it.
--
-- Two decisions follow, and they are deliberately not symmetrical.
--
--   1. A CHILD'S PHOTO IS NOT SHOWN TO ANYBODY UNLESS CONSENT IS TRUE. Not to
--      the desk, not to the kids team, not to the parent. Withdrawing consent
--      is therefore one boolean and the face disappears everywhere at once,
--      without anybody hunting through a bucket for files.
--
--   2. A PARENT UPLOADING THEIR CHILD'S PHOTO RECORDS THAT CONSENT. If it did
--      not, the feature would be dead on arrival: consent defaults to false,
--      it lives in the medical table, and a parent cannot write it — so every
--      photo a parent added would be invisible to everyone including
--      themselves. A parent choosing to upload their own child's face IS the
--      permission, and the person entitled to give it is exactly the person
--      giving it. It is written narrowly, touching that one column and no
--      other, and it lands a row in church.check_in_audit so the office can
--      see who consented and when.
--
-- The existing writer, church.upsert_person_sensitive, is NOT used for this:
-- it asserts members_admin or kids_admin, which no parent holds, and it
-- rewrites the whole medical record from its arguments — calling it to set one
-- boolean would blank a child's allergies.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- Private. 5 MB, which is a generous phone photo and a long way short of
-- somebody using the church's storage as a backup drive. The mime list is the
-- four formats a browser will actually render inline; HEIC is deliberately
-- absent, because Safari would show it and every other browser would not.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'person-photos',
  'person-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- The rows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS church.person_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  person_id UUID NOT NULL,

  -- '<person_id>/<uuid>.jpg'. The person id is the FIRST path segment on
  -- purpose: the storage policies below have nothing but the object name to
  -- go on, and this is what lets them ask "whose face is this" without a
  -- lookup table they would have to keep in step.
  storage_path TEXT NOT NULL,

  -- 1, 2 or 3. See the header: the limit is the table's, not the code's.
  slot SMALLINT NOT NULL,

  -- The one used as the avatar everywhere. Mirrored onto people.photo_path by
  -- the trigger below.
  is_primary BOOLEAN NOT NULL DEFAULT false,

  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_person_photos_person
    FOREIGN KEY (person_id, organization_id)
    REFERENCES church.people(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT chk_person_photos_slot CHECK (slot BETWEEN 1 AND 3),
  CONSTRAINT uq_person_photos_slot UNIQUE (person_id, slot),
  CONSTRAINT uq_person_photos_path UNIQUE (storage_path)
);

-- One primary, or none at all while a person has no photos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_photos_primary
  ON church.person_photos(person_id) WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_person_photos_person ON church.person_photos(person_id);
CREATE INDEX IF NOT EXISTS idx_person_photos_org ON church.person_photos(organization_id);

-- ---------------------------------------------------------------------------
-- people.photo_path, kept in step
-- ---------------------------------------------------------------------------
--
-- A denormalisation, entered into deliberately. Every screen that already
-- selects a person row — the directory table, the profile, the member's own
-- record — gets the avatar without a join or a second request, and the column
-- was sitting there unused anyway.
--
-- It is a POINTER AND NOT A PERMISSION. Anyone who can read the person row can
-- read this string; nobody can turn it into an image without passing
-- can_view_photos_of at the storage layer. That matters for a child whose
-- consent is later withdrawn: the path is still on the row, and the file stops
-- being readable the moment the boolean flips.
CREATE OR REPLACE FUNCTION church.sync_person_primary_photo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _person UUID := coalesce(NEW.person_id, OLD.person_id);
BEGIN
  UPDATE church.people p
     SET photo_path = (
           SELECT pp.storage_path FROM church.person_photos pp
            WHERE pp.person_id = _person AND pp.is_primary
            LIMIT 1),
         updated_at = now()
   WHERE p.id = _person;

  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_primary_photo ON church.person_photos;
CREATE TRIGGER sync_primary_photo
  AFTER INSERT OR UPDATE OR DELETE ON church.person_photos
  FOR EACH ROW EXECUTE FUNCTION church.sync_person_primary_photo();

-- ---------------------------------------------------------------------------
-- A cast that cannot throw
-- ---------------------------------------------------------------------------
-- The storage policies read a person id out of an object's NAME, which is a
-- string anybody with upload rights can shape. `'not-a-uuid'::uuid` raises,
-- and a policy that raises is a policy that turns a stray file into a 500 for
-- every reader of the bucket. This returns NULL instead, and every predicate
-- below treats NULL as "no".
CREATE OR REPLACE FUNCTION church.uuid_or_null(_text TEXT)
RETURNS UUID
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN _text::UUID;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- Who may change a person's photos
-- ---------------------------------------------------------------------------
-- Three callers, and they are the same three that 20260322080000 settled for
-- a child's record. Nothing new is admitted here.
CREATE OR REPLACE FUNCTION church.can_manage_photos_of(_person_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  p church.people%ROWTYPE;
BEGIN
  IF _person_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO p FROM church.people
   WHERE id = _person_id AND merged_into_person_id IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Myself.
  IF coalesce(p.profile_id = auth.uid(), false) THEN
    RETURN true;
  END IF;

  -- The office.
  IF church.has_permission_in_org(
       p.organization_id, ARRAY['members_admin']::church.module_permission[]) THEN
    RETURN true;
  END IF;

  -- A child of a household I am an adult of. Not "any child", and not an
  -- adult who happens to live with me: another adult's face is theirs to put
  -- up or take down, even when the two of you share a kitchen.
  IF p.is_child THEN
    RETURN EXISTS (
      SELECT 1 FROM church.household_members hm
       WHERE hm.person_id = _person_id
         AND hm.end_date IS NULL
         AND church.i_am_an_adult_of(hm.household_id));
  END IF;

  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- A tablet with a shift open
-- ---------------------------------------------------------------------------
-- The station signs in as a station account, which holds no module grant of
-- any kind — that is the whole design of 20260320000800, and it is why every
-- station operation goes through a definer that takes a shift token. A storage
-- policy cannot be handed a token, so it asks the other half of the same
-- question: does this device currently hold a live shift in this branch?
--
-- Time-bounded by construction. The face is visible while the desk is open and
-- not one minute longer, which is the window in which it is a safety measure
-- rather than a picture of somebody's child on a shared tablet.
CREATE OR REPLACE FUNCTION church.has_live_kids_shift_in(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM church.kids_shift_tokens t
     WHERE t.issued_to_auth_user = auth.uid()
       AND t.organization_id = _organization_id
       AND t.ended_at IS NULL
       AND t.expires_at > now()
  )
$$;

-- ---------------------------------------------------------------------------
-- Who may see them
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.can_view_photos_of(_person_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  p church.people%ROWTYPE;
BEGIN
  IF _person_id IS NULL OR auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT * INTO p FROM church.people WHERE id = _person_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- THE CONSENT GATE, and it comes first. A child with no consent on record
  -- has no visible photo for anybody — including the parent who uploaded it,
  -- and including the office. See the header: one boolean has to be able to
  -- take a face off every screen at once, and a gate with an exception in it
  -- does not do that.
  IF p.is_child AND NOT EXISTS (
       SELECT 1 FROM church.person_sensitive s
        WHERE s.person_id = _person_id AND s.photo_consent) THEN
    RETURN false;
  END IF;

  -- Myself.
  IF coalesce(p.profile_id = auth.uid(), false) THEN
    RETURN true;
  END IF;

  -- My own household. The people I sit next to on a Sunday.
  IF EXISTS (
    SELECT 1 FROM church.household_members hm
     WHERE hm.person_id = _person_id
       AND hm.end_date IS NULL
       AND hm.household_id IN (SELECT * FROM church.my_household_ids())
  ) THEN
    RETURN true;
  END IF;

  -- Staff who can already read this person's name, birthday and telephone
  -- number in the directory. A photograph is not a wider disclosure than the
  -- record it sits on.
  IF church.has_permission_in_org(
       p.organization_id,
       ARRAY['members_admin','members_viewer','members_import','leadership_viewer']::church.module_permission[]) THEN
    RETURN true;
  END IF;

  -- A child, and only a child: the kids team, and the desk while it is open.
  -- kids_volunteer is on this list because the volunteer at the station is the
  -- person actually looking at the child.
  IF p.is_child THEN
    IF church.has_permission_in_org(
         p.organization_id,
         ARRAY['kids_admin','kids_volunteer']::church.module_permission[]) THEN
      RETURN true;
    END IF;

    IF church.has_live_kids_shift_in(p.organization_id) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION church.uuid_or_null(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION church.can_manage_photos_of(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.can_view_photos_of(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.has_live_kids_shift_in(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Row security on the table
-- ---------------------------------------------------------------------------
-- The writes below all go through SECURITY DEFINER functions, so these
-- policies are not what the application leans on. They are what stops a
-- hand-built PostgREST request from reaching the table directly, and they say
-- the same thing the functions say — which is the point of writing them at
-- all rather than revoking the table and leaving a comment.
ALTER TABLE church.person_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Photos are visible to the people who may see them" ON church.person_photos;
CREATE POLICY "Photos are visible to the people who may see them"
  ON church.person_photos FOR SELECT TO authenticated
  USING (church.can_view_photos_of(person_id));

DROP POLICY IF EXISTS "Photos are changed by the people who may change them" ON church.person_photos;
CREATE POLICY "Photos are changed by the people who may change them"
  ON church.person_photos FOR ALL TO authenticated
  USING (church.can_manage_photos_of(person_id))
  WITH CHECK (church.can_manage_photos_of(person_id));

-- ---------------------------------------------------------------------------
-- Row security on the files
-- ---------------------------------------------------------------------------
--
-- This is the half that matters. The row is a string; the file is the face.
--
-- Note how much narrower these are than the expense-attachments policies from
-- 20251130000003, which let any authenticated user read any object in that
-- bucket. That was written for a bucket of receipts and is a separate problem;
-- it is not a precedent to copy into a bucket of photographs of children.
DROP POLICY IF EXISTS "Person photos are readable by those who may see them" ON storage.objects;
CREATE POLICY "Person photos are readable by those who may see them"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'person-photos'
    AND church.can_view_photos_of(church.uuid_or_null((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Person photos are uploaded by those who may manage them" ON storage.objects;
CREATE POLICY "Person photos are uploaded by those who may manage them"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'person-photos'
    AND church.can_manage_photos_of(church.uuid_or_null((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Person photos are replaced by those who may manage them" ON storage.objects;
CREATE POLICY "Person photos are replaced by those who may manage them"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'person-photos'
    AND church.can_manage_photos_of(church.uuid_or_null((storage.foldername(name))[1]))
  )
  WITH CHECK (
    bucket_id = 'person-photos'
    AND church.can_manage_photos_of(church.uuid_or_null((storage.foldername(name))[1]))
  );

DROP POLICY IF EXISTS "Person photos are removed by those who may manage them" ON storage.objects;
CREATE POLICY "Person photos are removed by those who may manage them"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'person-photos'
    AND church.can_manage_photos_of(church.uuid_or_null((storage.foldername(name))[1]))
  );

-- ---------------------------------------------------------------------------
-- Adding one
-- ---------------------------------------------------------------------------
--
-- The file is uploaded by the browser first and this records it, which is the
-- ordinary shape for object storage and has one consequence worth naming: a
-- failed call here leaves an orphaned object in the bucket. The client deletes
-- it on the error path. An orphan that survives that is invisible — no row, no
-- signed URL, and the storage policies still require can_manage_photos_of to
-- read it — so the cost of the race is bytes, not exposure.
--
-- The path is checked against the person id rather than trusted. Without it a
-- member could upload to their own folder, pass the path to this function
-- naming somebody else, and hang their photograph on another person's record.
CREATE OR REPLACE FUNCTION church.add_person_photo(
  _person_id UUID,
  _storage_path TEXT,
  _make_primary BOOLEAN DEFAULT false
)
RETURNS church.person_photos
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public, extensions
AS $$
DECLARE
  p       church.people%ROWTYPE;
  _actor  TEXT;
  _count  INTEGER;
  _slot   SMALLINT;
  _first  BOOLEAN;
  _row    church.person_photos;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT church.can_manage_photos_of(_person_id) THEN
    RAISE EXCEPTION 'not_your_photo_to_change' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO p FROM church.people WHERE id = _person_id;

  IF _storage_path IS NULL OR _storage_path NOT LIKE (_person_id::TEXT || '/%') THEN
    RAISE EXCEPTION 'photo_path_does_not_belong_to_this_person'
      USING DETAIL = 'Expected <person_id>/<file>.';
  END IF;

  SELECT count(*) INTO _count FROM church.person_photos WHERE person_id = _person_id;
  IF _count >= 3 THEN
    RAISE EXCEPTION 'three_photos_is_the_limit'
      USING HINT = 'Remove one first.';
  END IF;

  -- The lowest free slot, so deleting the middle photo and adding another
  -- reuses the gap instead of failing on the third.
  SELECT min(s) INTO _slot
  FROM generate_series(1, 3) AS s
  WHERE s NOT IN (SELECT slot FROM church.person_photos WHERE person_id = _person_id);

  _first := _count = 0;
  _actor := coalesce(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    (SELECT email FROM public.profiles WHERE id = auth.uid()),
    'Unknown');

  -- The first photo is the avatar whether or not anybody asked, because a
  -- person with one photograph and no primary would show a letter.
  IF _make_primary OR _first THEN
    UPDATE church.person_photos SET is_primary = false
     WHERE person_id = _person_id AND is_primary;
  END IF;

  INSERT INTO church.person_photos
    (organization_id, person_id, storage_path, slot, is_primary,
     uploaded_by, uploaded_by_name)
  VALUES
    (p.organization_id, _person_id, _storage_path, _slot,
     _make_primary OR _first, auth.uid(), _actor)
  RETURNING * INTO _row;

  -- A child's photo carries a permission with it. See the header for why this
  -- is written here rather than left to the office: consent defaults to false
  -- and lives in a table no parent can write, so without this every photo a
  -- parent added would be invisible to everybody, themselves included.
  IF p.is_child THEN
    INSERT INTO church.person_sensitive (person_id, organization_id, photo_consent,
                                         updated_by, updated_by_name)
    VALUES (_person_id, p.organization_id, true, auth.uid(), _actor)
    ON CONFLICT (person_id) DO UPDATE
      SET photo_consent = true,
          updated_by = EXCLUDED.updated_by,
          updated_by_name = EXCLUDED.updated_by_name,
          updated_at = now();

    -- Traceable, like every other touch of a child's sensitive record.
    INSERT INTO church.check_in_audit (
      organization_id, action, outcome, child_person_id,
      actor_auth_user_id, actor_name, detail)
    VALUES (
      p.organization_id, 'sensitive_viewed', 'success', _person_id,
      auth.uid(), _actor,
      jsonb_build_object('action', 'photo_consent_recorded',
                         'reason', 'A photo was added for this child',
                         'slot', _row.slot));
  END IF;

  RETURN _row;
END;
$$;

-- ---------------------------------------------------------------------------
-- Removing one
-- ---------------------------------------------------------------------------
-- Returns the storage path so the caller can delete the object it names. The
-- row goes first: an object with no row is invisible, while a row with no
-- object is a broken image on somebody's profile.
CREATE OR REPLACE FUNCTION church.delete_person_photo(_photo_id UUID)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _row church.person_photos;
BEGIN
  SELECT * INTO _row FROM church.person_photos WHERE id = _photo_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT church.can_manage_photos_of(_row.person_id) THEN
    RAISE EXCEPTION 'not_your_photo_to_change' USING ERRCODE = '42501';
  END IF;

  DELETE FROM church.person_photos WHERE id = _photo_id;

  -- Somebody has to be the avatar. The lowest remaining slot takes it, rather
  -- than leaving a person with two photographs and a letter for a face.
  IF _row.is_primary THEN
    UPDATE church.person_photos SET is_primary = true
     WHERE id = (SELECT id FROM church.person_photos
                  WHERE person_id = _row.person_id
                  ORDER BY slot LIMIT 1);
  END IF;

  RETURN _row.storage_path;
END;
$$;

-- ---------------------------------------------------------------------------
-- Choosing the one that represents you
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION church.set_primary_photo(_photo_id UUID)
RETURNS VOID
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = church, public
AS $$
DECLARE
  _person UUID;
BEGIN
  SELECT person_id INTO _person FROM church.person_photos WHERE id = _photo_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'photo_not_found';
  END IF;

  IF NOT church.can_manage_photos_of(_person) THEN
    RAISE EXCEPTION 'not_your_photo_to_change' USING ERRCODE = '42501';
  END IF;

  -- Cleared before set: the partial unique index permits exactly one primary
  -- per person, so the two statements cannot be reordered.
  UPDATE church.person_photos SET is_primary = false
   WHERE person_id = _person AND is_primary AND id <> _photo_id;
  UPDATE church.person_photos SET is_primary = true WHERE id = _photo_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Reading them
-- ---------------------------------------------------------------------------
--
-- ONE function for every screen, taking a list of people, rather than a photo
-- column bolted onto each of the dozen definer functions the desk and the
-- directory already call. Two reasons, and the second is the important one:
--
--   * Those functions return hand-written column lists. Adding a photo to
--     station search, the room roster, the live board, the safety card and the
--     pickup screen is five rewrites of five large functions, and five places
--     for the next person to forget.
--
--   * The rule about who may see a face would then be spelled out in five
--     places. Here it is spelled out once, and every caller inherits it —
--     including the consent gate, which is the one nobody can afford to
--     re-implement slightly differently.
--
-- Callers pass the ids already on their screen and get back only the ones they
-- are allowed to see; a person they may not see is simply absent, never an
-- error, so a mixed list does not fail as a whole.
CREATE OR REPLACE FUNCTION church.person_photos_for(_person_ids UUID[])
RETURNS TABLE (
  person_id UUID,
  photo_id UUID,
  storage_path TEXT,
  slot SMALLINT,
  is_primary BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = church, public
AS $$
  SELECT pp.person_id, pp.id, pp.storage_path, pp.slot, pp.is_primary
  FROM church.person_photos pp
  WHERE pp.person_id = ANY(_person_ids)
    AND church.can_view_photos_of(pp.person_id)
  ORDER BY pp.person_id, pp.slot
$$;

GRANT EXECUTE ON FUNCTION church.add_person_photo(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION church.delete_person_photo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.set_primary_photo(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION church.person_photos_for(UUID[]) TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON church.person_photos TO authenticated;

COMMENT ON TABLE church.person_photos IS
  'Up to three photographs per person, capped by a unique (person_id, slot) '
  'with slot checked to 1..3 rather than by application code. A child''s '
  'photo is invisible to everybody unless person_sensitive.photo_consent is '
  'true - see the header of 20260322090000.';

COMMENT ON FUNCTION church.can_view_photos_of(UUID) IS
  'The single rule for who may see a face: the person, their household, staff '
  'who can already read the directory, and - for a child with consent on '
  'record - the kids team and any tablet holding a live check-in shift.';

NOTIFY pgrst, 'reload schema';
