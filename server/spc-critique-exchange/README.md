# SPC Critique Exchange

Discourse server plugin for Photo Feedback (category 7). A member may submit their first topic after activation without prior feedback. Before each subsequent topic, they need two more qualifying critiques: regular replies on **distinct** Photo Feedback topics owned by other members. Deleted replies and topics do not count. Repeated replies to one topic count once. Only submissions and replies made after the first activation count; disabling and re-enabling preserves that start time. A project topic counts as one submission. Staff are exempt.

The check runs during server-side topic validation, including API and composer submissions. On rejection, the existing SPC Suite form shows a localized error repeating the rule and the number of remaining images to critique. It counts participation, not critique quality. Simultaneous submissions could read the same balance; add per-user locking if that race is observed. The separate one-image-per-day guidance is not enforced here.

## Verify

In a Discourse checkout with this directory installed at `plugins/spc-critique-exchange`:

```sh
bin/rspec plugins/spc-critique-exchange/spec/integration/critique_exchange_spec.rb
```

## Install on the SPC Docker server

After this code is committed and pushed, add these commands to the `after_code` hook in `/var/discourse/containers/app.yml` (under the existing `cd: $home/plugins` block):

```yaml
- git clone https://github.com/Swiss-Photo-Club/discourse-theme-spc-suite.git /tmp/spc-suite-source
- cp -R /tmp/spc-suite-source/server/spc-critique-exchange ./spc-critique-exchange
```

Then run `cd /var/discourse && ./launcher rebuild app`. The theme's Admin → Components → Update button does **not** install this server plugin. Enforcement starts **off**; enable `spc critique exchange enabled` under Admin → Settings → Plugins when ready. The first enable records the start time and the setting remains the immediate rollback switch. `spc critique exchange category id` selects the category (default 7).
