-- Add Springfield, VA branch
INSERT INTO public.organizations (
  id,
  name,
  slug,
  country,
  state,
  city,
  address,
  timezone,
  contact_email,
  website,
  is_active
) VALUES (
  'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  'ALIC VA - Springfield',
  'va-springfield',
  'United States',
  'Virginia',
  'Springfield',
  '8348 Traford Ln. 3rd Floor, Springfield, VA 22152',
  'America/New_York',
  'springfield@addislidetchurch.org',
  'https://addislidetchurch.org/springfield-services/',
  true
);
