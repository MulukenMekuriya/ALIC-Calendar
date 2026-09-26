# SQL assertions

~390 assertions across 19 migrations, and 17 negative controls that prove they
can fail. 17 of the 19 pass against production today; the two that do not are
both pointing at `20260322310000`, which has not been pushed yet.

```bash
./supabase/tests/run.sh                    # all of them, against production as deployed
./supabase/tests/run.sh one_row_per_child  # name contains this
./supabase/tests/run.sh --replay  <name>   # apply the migration first
./supabase/tests/run.sh --negative <name>  # break it, require a failure
```

## Why these exist

Every one of these was written while a migration was being built, run once,
and then left in a temporary directory that a reboot would have emptied. They
are the record of what was actually checked before a migration touched 534
children's records — and they were one cleared temp folder away from being
nothing but a claim in a commit message.

Several exist because of a specific near-miss:

| Assertion | What it caught |
|---|---|
| `20260322210000` digest | Two nesting levels shared a delimiter, so two different forms hashed the same |
| `20260322210200` label length | Deriving to 44 chars would have hit a 24-char constraint for every parent |
| `20260322210700` attachments | 8 target columns and 7 expressions — swallowed by a bare `EXCEPTION WHEN OTHERS` |
| `20260322210900` siblings | A refused child must not abort the batch and destroy their siblings' check-ins |
| `20260322240000` legal hold | A safeguarding hold was releasable, because the trigger fired `OF severity` only |
| `20260322280000` duplicates | Two adults on one phone listed every child twice |
| `20260322310000` overload | **Found by the harvest itself** — see below |

## The two modes are two different questions

**`run.sh`** — *does production still behave the way we said it would?* The
assertions run against the schema as deployed. This is the regression suite.

**`run.sh --replay <name>`** — *is this migration safe to push?* `BEGIN`, the
migration, the assertions, `ROLLBACK`. This is the mode every assertion here
was originally written in, and the mode for the migration you are about to
push.

Replaying a **superseded** migration is not a useful test and usually fails on
a collision: a later migration added an overload, widened a constraint, or
changed a return type. That is the tree working, not a bug. There is no
"replay everything" mode for that reason.

## What the harvest found

Running all 18 in replay mode against today's database, rather than against
the schema of the day each was written, surfaced one real production defect
and four expired assertions.

**The defect.** `20260322270000` fixed the kiosk's UTC bug by adding a
`_today` parameter and used `CREATE OR REPLACE`. Adding a parameter changes
the signature, so nothing was replaced — production had **two**
`kiosk_session_bootstrap` functions, the fixed one and the buggy one. Both
take all-default arguments, so any call not naming `_today` was ambiguous.
Today's client sends both, which is the only reason Sunday worked. A tablet
running a bundle cached from before 25 September does not.
`20260322310000_one_bootstrap_not_two.sql` drops the orphan. A sweep of the
whole `church` schema found no other duplicate function name.

**The four expired assertions**, corrected in place with the reason written
next to the change:

- `210800` #0 — a deploy-ordering guard asserting `check_in_children` does not
  mention consent and every branch is in warn mode. `210900` and `221000`
  falsified both **on purpose**. Removed, not repaired.
- `240000` #2 — `count(*) = 4` retention rows; `260000` added a fifth. Now
  names the four it seeded, which also catches a substitution that a count
  would not.
- `210700` #7b — scanned the office email for `%allerg%`. `290000` added a
  sentence explaining the PDF is withheld because *"it names a child's
  allergies and medications"*, and the scan flagged the very sentence that
  makes the decision hard to reverse. Narrowed to the labelled form.
- `210100` #0 — tidied up with a `DELETE` on `check_in_audit`, which `250000`
  made append-only. The rollback was always what cleaned up.

Each of those is a test that was right when written and wrong now. Fixing one
is a judgement call, so each carries its reasoning in the file.

## Against production, on purpose

There is no fixture database, because `supabase db reset` does not replay this
migration tree. That is a real gap worth fixing on its own merits — it also
means the database cannot currently be rebuilt from the migrations if it were
lost.

But a fixture would not be strictly better. These run against 534 real
children, 216 real households and the live constraints, and that is how most
of the bugs in the table above were found. A clean fixture would have had a
`moderate` severity that production does not allow, and a constraint named in
the plural that production names in the singular.

Some assertions raise `SKIP:` when the production data they need is gone — a
phone number with two adults on it, say. The runner reports those as skipped,
not passed. The check did not run, and saying otherwise would be a lie.

## The negative controls

An assertion nobody has watched fail is a comment. Each `.patch` in
`negative-controls/` breaks exactly one thing, and `--negative` applies it and
requires the run to **fail**. A control that passes is reported as `THE
ASSERTION DID NOT FIRE`.

Where a migration has `.patch` and `.2.patch`, they run separately. Breaking
two things at once would only prove that at least one assertion noticed.

A control stops applying when its migration changes. The runner says so and
skips rather than guessing.

**There is a control on the control.** Before inverting, the runner replays
the *unbroken* migration. If that fails — because the tree has moved past it
— the broken version fails too, for a reason that has nothing to do with the
assertion, and the control would report a triumphant PASS having proved
nothing. That reads as confirmation, which is worse than no control at all.
The runner skips instead and says why.

So of the 17 controls recorded, **7 can still be exercised** against today's
schema (`210000`, `210900`, `220000`, `260000`, `270000`, `280000`, `310000`).
The other 10 are on migrations the tree has superseded; they were run and did
fire when they were written, and they are kept as the record of that.

Four migrations have no control at all: `20260322220100`, `20260322221000`,
`20260322290000`, `20260322300000`. Their assertions pass; none has been
proven capable of failing.

## Why this is not in CI

It needs a database, and CI cannot have this one. The options are a throwaway
Postgres in the runner (blocked on `db reset`) or a staging project (~$25/mo).
Until then these run by hand — but they are in the repository, so running them
is a command rather than an archaeology exercise.
