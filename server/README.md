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
