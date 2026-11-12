# Overnight Discourse updates

`spc-discourse-update.timer` runs **Monday and Thursday at 03:00 Europe/Zurich**, including daylight
saving changes. It does not catch up missed runs during the day. Each run takes a full
local database-and-uploads backup using Discourse's CLI, checks that a fresh archive exists
and passes `gzip -t`, then runs `/var/discourse/launcher rebuild app`. This rebuild runs
on each scheduled run, even if no new release exists, and causes downtime. It follows the configured
Discourse release channel (`latest` at installation), including configured plugins.
An HTTPS check against the local server must pass afterwards. Before checking disk space,
the job runs `docker image prune --all --force` to remove unused images, including obsolete
Discourse base images. Images referenced by any container are retained; backups and uploads
are untouched. A removed base image is downloaded again if a later rebuild needs it.

The existing Discourse backup retention applies (five backups at installation), so these
backups shorten the previous weekly history. Backups are on the same
server; this job does not add offsite storage. A failed backup or less than 10 GiB free disk
space after cleanup blocks the rebuild, with the available and required space logged.
A failed service triggers a host Python SMTP alert to
**altun@swissphotoclub.com**, with up to three delivery attempts. The alert service also
asks Docker to start the existing container, which can recover from a failed bootstrap.
It does not restore the database or promise automatic rollback after migrations.

SMTP credentials are exported from Discourse before each backup into
`/etc/spc-discourse-alert.json` (root only), so failure emails work even if the forum cannot
start. Re-export the file after changing SMTP settings if the forum cannot run the next job.
No credentials belong in this repository. Email still depends on the host and SMTP service
being reachable; complete server outages need separate external monitoring.

Install the shell/Python files as `/usr/local/sbin/spc-discourse-update` and
`/usr/local/sbin/spc-discourse-alert` (root, mode 0750), the Ruby file as
`/var/discourse/shared/standalone/spc-discourse-alert-config.rb` (mode 0644), and the three
unit files under `/etc/systemd/system/` (mode 0644). Then:

```sh
systemd-analyze verify /etc/systemd/system/spc-discourse-update.service /etc/systemd/system/spc-discourse-update.timer /etc/systemd/system/spc-discourse-update-alert.service
/usr/local/sbin/spc-discourse-update --backup-only
/usr/local/sbin/spc-discourse-alert --test
systemctl daemon-reload
systemctl enable --now spc-discourse-update.timer
systemctl list-timers spc-discourse-update.timer --no-pager
```

The backup-only check refreshes the alert configuration and creates/verifies a real full
backup without upgrading. The alert test sends one clearly labelled email. Inspect runs
with `journalctl -u spc-discourse-update.service` and alert delivery with
`journalctl -u spc-discourse-update-alert.service`. Stop future upgrades with
`systemctl disable --now spc-discourse-update.timer`. Avoid manual admin upgrades or
rebuilds while this job is running; its lock only serializes its own invocations.

# Challenge voting reset

`challenge-vote-reset.rb` runs in the existing Discourse Rails environment. It reads the
challenge category and timezone from SPC Suite (theme 61), finds the newest site-pinned
round brief by round month and pin time, and closes other rounds up to that month. It also
closes any round older than the current month, even if no replacement brief was posted.
Only regular, round-tagged topics in the configured category are eligible; the category's
About topic, unrelated topics, future rounds and current-round votes are excluded.

Closing uses `Topic#update_status`, which queues the installed Topic Voting plugin's
`VoteRelease` job. Votes become archived rather than deleted: totals, voters, winner tags and
photos survive, while voting allowance is returned. Closing also ends replies. Already
closed/archived topics with unreleased votes are retried. Re-running after completion does
nothing. Worker processing adds its normal queue delay to the timer's five-minute interval.

The native service/timer avoids browser dependence and requires no Discourse restart or
custom plugin. The Ruby file lives on the existing `/shared` volume, so container rebuilds
do not remove it. The service runs as the container's `discourse` user in production, and
systemd prevents overlapping runs. Errors appear in the service journal and retry on the
next tick. The hostname guard prevents accidentally running this against another forum.

## Verify and install

From the repository root:

```sh
ruby server/challenge-vote-reset-test.rb
scp server/challenge-vote-reset.rb spc-discourse:/var/discourse/shared/standalone/spc-challenge-vote-reset.rb
ssh spc-discourse 'docker exec --user discourse --env RAILS_ENV=production --workdir /var/www/discourse app bin/rails runner /shared/spc-challenge-vote-reset.rb'
```

The runner is read-only by default. Inspect `changes`: it lists exact topic IDs, existing
totals and the allowance to return. Only `SPC_APPLY=1` enables changes. Then install:

```sh
scp server/spc-challenge-vote-reset.service server/spc-challenge-vote-reset.timer spc-discourse:/etc/systemd/system/
ssh spc-discourse 'systemd-analyze verify /etc/systemd/system/spc-challenge-vote-reset.service /etc/systemd/system/spc-challenge-vote-reset.timer'
ssh spc-discourse 'systemctl daemon-reload && systemctl start spc-challenge-vote-reset.service && systemctl enable --now spc-challenge-vote-reset.timer'
ssh spc-discourse 'systemctl status spc-challenge-vote-reset.timer --no-pager; journalctl -u spc-challenge-vote-reset.service -n 20 --no-pager'
```

Repeat the read-only runner after the vote-release queue drains: `changes` should be empty,
old vote totals unchanged and current-round votes still active. Theme wording ships through
the usual commit → push → Admin component Update workflow; theme Update does not install
these server files. Existing challenge posts are historical content and are not rewritten.

## Stop or roll back

`systemctl disable --now spc-challenge-vote-reset.timer` on the Discourse host stops future
runs. Reopen a mistakenly closed topic through Discourse's topic wrench; native Topic Voting
reclaims its archived votes, so those votes count against members' allowance again.
No votes or topics are deleted by this reset.

# Challenge results

`challenge-results.rb` runs in the same Rails environment as the vote reset. For every round
in the challenge category (theme 61's `challenge_category_id`) whose round tag has exactly one
`winner`-tagged entry, whose month is over in `challenge_timezone`, whose crown is at least two
hours old (a crown can still be corrected) and whose brief has no `spc_results_announced`
custom field, it:

1. sets `spc_results_announced` on the round's brief (the round tag's oldest topic, which is
   not an entry) **before** posting, so a rerun never posts twice;
2. posts one English topic in Announcements (category 5) as `spc_admin`: the winner, entry and
   vote totals, a link to the round page `/tags/c/monthly-challenge/6/<slug>/<id>`, and the
   round open now (its brief's photo and opening paragraph, links to the round and to
   `/submit`). Photos link to their pages. Announcements is in `default categories watching
   first post`, so this emails every member through their own preferences.

There is no ranking table (a tie at the top would make the crown look arbitrary) and, decided
12 November 2026, no personal message per entrant: entrants find their rank on the round page.
The per-entrant messages (en/de/fr, rank with ties) exist in commit `ed5a907` if wanted later.

## Verify and install

```sh
ruby server/challenge-results-test.rb
scp server/challenge-results.rb spc-discourse:/var/discourse/shared/standalone/spc-challenge-results.rb
ssh spc-discourse 'docker exec --user discourse --env RAILS_ENV=production --workdir /var/www/discourse app bin/rails runner /shared/spc-challenge-results.rb'
```

The dry run prints a JSON summary (`mark`, `skipped`, `announce`) and then the full text of
every announcement it would post. Only `SPC_APPLY=1` changes anything; the dry run may create
Discourse's resized copies of the photos (600x500 at most), as any page view would.

**Rehearsal.** `--env SPC_TEST_EMAIL=<address>` sends the announcement, titled `[Test]`, as a
private message to that address's user only. It posts nothing in Announcements and marks
nothing. Pass the same `SPC_MARK_BEFORE` as the real run, or older crowned rounds are sent too.

**One-off backfill.** `SPC_MARK_BEFORE=YYYY-MM` marks every crowned, unannounced round before
that month announced **without posting**. Add `--env SPC_MARK_BEFORE=2026-10` to the dry run to
see the list under `mark`, then run it once with `--env SPC_APPLY=1`. Never put it in the service.

```sh
scp server/spc-challenge-results.service server/spc-challenge-results.timer spc-discourse:/etc/systemd/system/
ssh spc-discourse 'systemd-analyze verify /etc/systemd/system/spc-challenge-results.service /etc/systemd/system/spc-challenge-results.timer'
ssh spc-discourse 'systemctl daemon-reload && systemctl start spc-challenge-results.service && systemctl enable --now spc-challenge-results.timer'
ssh spc-discourse 'journalctl -u spc-challenge-results.service -n 40 --no-pager'
```

The timer runs hourly. A second dry run afterwards must show an empty `announce`.

## Stop or roll back

`systemctl disable --now spc-challenge-results.timer` stops future announcements. A posted
topic is removed through Discourse like any other; emails already sent stay sent. To announce
a round again, delete `spc_results_announced` from its brief in the Rails console.
