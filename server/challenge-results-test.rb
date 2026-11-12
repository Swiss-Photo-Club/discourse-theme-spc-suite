# frozen_string_literal: true

require_relative "challenge-results"

def check(label, actual, expected)
  raise "#{label}: expected #{expected.inspect}, got #{actual.inspect}" unless actual == expected
end

R = SpcChallengeResults
round = { month: "2026-09", url: "https://x/round/9", entries: 36, votes: 84,
          winner: { title: "Where [Time] Stood Still", url: "/t/w/108", author: "Katharina Michels",
                    image: "[![w](upload://w.jpeg)](https://x/t/w/108)" },
          next: { month: "2026-10", theme: "Juxtaposition", url: "https://x/round/10", last_day: 31,
                  image: "[![b](upload://b.jpeg)](https://x/round/10)", submit_url: "https://x/submit",
                  intro: "Show us contrast." } }

title, raw = R.announcement(round)
check "title", title, "September winner announced, October Challenge: Juxtaposition"
check "totals", raw.include?("36 photos entered, 84 votes cast."), true
check "winner, escaped", raw.include?("**Winner:** [Where \\[Time\\] Stood Still](/t/w/108) · Katharina Michels"), true
check "linked photo", raw.include?("[![w](upload://w.jpeg)](https://x/t/w/108)"), true
check "all entries", raw.include?("**[See all 36 entries](https://x/round/9)**"), true
check "no ranking table", raw.include?("|--"), false
check "open round block", raw.end_with?(
  "### Now open: [Juxtaposition](https://x/round/10)\n\n[![b](upload://b.jpeg)](https://x/round/10)\n\n" \
  "Show us contrast.\n\nOpen until 31 October. We'd love to see your take on it.\n\n" \
  "**[Enter your photo →](https://x/submit)** · **[See the challenge →](https://x/round/10)**"), true

title, raw = R.announcement(round.merge(next: nil))
check "title without open round", title, "September winner announced"
check "no open round block", raw.include?("Now open"), false
check "first paragraph", R.first_paragraph("![b|1x1](upload://x)\n\n## The task\n\nCapture autumn.\nNot just leaves.\n\nMore."),
      "Capture autumn.\nNot just leaves."
check "fit portrait", R.fit(2216, 2955), "375x500"
check "fit landscape", R.fit(3840, 2160), "600x338"
check "small stays", R.fit(400, 300), "400x300"
puts "13 challenge results checks passed"
