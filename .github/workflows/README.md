# What runs, and what it means

## `ci.yml` — on every push and pull request

| Step | Gate? | Meaning |
|---|---|---|
| Install (`npm ci`) | **Yes** | package.json and the lockfile disagree, or a dependency conflicts |
| Typecheck | No | 40 known pre-existing errors in `budget/` and `calendar/` |
| Tests | **Yes** | Something that used to work has stopped |
| Build | **Yes** | The deploy to alic.org would fail |
| `npm audit` | No | Known advisories exist today |

A red ✗ on the gates means **do not deploy**.

## What this does NOT cover

**The SQL.** Around 390 assertions and 17 negative controls live in
`supabase/tests/`, and they do not run here. They need a database, and the
three options are:

1. **Production** — never. CI must not touch live children's records.
2. **A throwaway Postgres in the runner** — the right answer, and blocked:
   `supabase db reset` does not replay this migration tree. Worth fixing on
   its own merits, because it also means the database cannot currently be
   rebuilt from the migrations if it were lost.
3. **A dedicated staging project** — works, ~$25/month.

Until one of those is resolved, the SQL assertions are run by hand against
production inside `BEGIN … ROLLBACK`. See `supabase/tests/README.md`.
