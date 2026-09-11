# frozen_string_literal: true

require_relative "challenge-vote-reset"

[
  ["previous month", "2026-08-animals", "2026-09-frame", "2026-09", true],
  ["current votes stay spent", "2026-09-frame", "2026-09-frame", "2026-09", false],
  ["new challenge in same month", "2026-09-animals", "2026-09-frame", "2026-09", true],
  ["early next round", "2026-09-frame", "2026-10-light", "2026-09", true],
  ["future entries stay open", "2026-10-light", "2026-09-frame", "2026-09", false],
  ["monthly fallback with stale pin", "2026-09-frame", "2026-09-frame", "2026-10", true],
  ["monthly fallback without pin", "2026-09-frame", nil, "2026-10", true],
  ["current month without pin", "2026-10-light", nil, "2026-10", false],
  ["year rollover", "2026-12-snow", nil, "2027-01", true],
  ["bare month fallback tag", "2026-08", "2026-09-frame", "2026-09", true],
  ["guide stays open", nil, "2026-09-frame", "2026-09", false],
  ["unrelated tag stays open", "winner", "2026-09-frame", "2026-09", false],
  ["invalid month stays open", "2026-00-animals", "2026-09-frame", "2026-09", false],
].each do |label, tag, active_tag, month, expected|
  actual = !!SpcChallengeVoteReset.completed?(tag, active_tag, month)
  raise "#{label}: expected #{expected}, got #{actual}" unless actual == expected
end
puts "13 challenge reset checks passed"
