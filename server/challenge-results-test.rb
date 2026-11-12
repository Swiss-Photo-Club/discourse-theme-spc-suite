# frozen_string_literal: true

require_relative "challenge-results"

def check(label, actual, expected)
  raise "#{label}: expected #{expected.inspect}, got #{actual.inspect}" unless actual == expected
end

R = SpcChallengeResults
# September's shape: 16, 9, 7, 6, then five entries tied at 4.
votes = [16, 9, 7, 6, 4, 4, 4, 4, 4, 1]
ranked = R.rank(votes.each_with_index.map do |v, i|
  { id: 100 + i, title: "Entry #{i}", url: "/t/e/#{100 + i}", user_id: i == 6 ? 1 : 10 + i,
    author: "Author #{i}", votes: v, image: nil }
end + [{ id: 200, title: "Second | entry", url: "/t/e/200", user_id: 1, author: "Me", votes: 1, image: nil }])

check "places", ranked.map { |e| R.ordinal(e, "de") }, %w[1. 2. 3. 4. =5. =5. =5. =5. =5. =10. =10.]
check "en ordinals", [1, 2, 3, 11, 12, 13, 21, 22, 103, 111].map { |n| R.ordinal({ place: n }, "en") },
      %w[1st 2nd 3rd 11th 12th 13th 21st 22nd 103rd 111th]
check "tied ordinal", R.ordinal(ranked[5], "en"), "=5th"
check "de ordinal", R.ordinal(ranked[5], "de"), "=5."
check "fr ordinals", [R.ordinal(ranked[0], "fr"), R.ordinal(ranked[5], "fr")], %w[1er =5e]
check "lang", %w[de_CH fr en_GB it].map { |l| R.lang(l) }, %w[de fr en en]
check "fr elision", [R.month_of("2026-10", "fr"), R.month_of("2026-11", "fr"), R.month_of("2026-08", "fr")],
      ["d’octobre", "de novembre", "d’août"]

round = { month: "2026-09", theme: "Frame in Frame", url: "https://x/tags/c/monthly-challenge/6/frame/9",
          ranked: ranked, votes: ranked.sum { |e| e[:votes] }, winner: ranked[0],
          next: { month: "2026-10", theme: "Juxtaposition", last_day: 31, image: "![brief](upload://b.jpeg)",
                  submit_url: "https://x/submit", intro: { "en" => "Show us contrast.", "de" => "Zeig uns Kontraste.", "fr" => "Montrez le contraste." } } }

title, raw = R.announcement(round)
check "announcement title", title, "September winner announced, October Challenge: Juxtaposition"
check "title without open round", R.announcement(round.merge(next: nil))[0], "September winner announced"
check "announcement totals", raw.include?("11 photos entered, 60 votes cast."), true
check "no ranking table", raw.include?("|--"), false
check "winner and link", raw.include?("**Winner:** [Entry 0](/t/e/100) · Author 0\n\n**[See all 11 entries](https://x/tags/c/monthly-challenge/6/frame/9)**"), true
check "announcement next round", raw.end_with?("### Now open: Juxtaposition\n\n![brief](upload://b.jpeg)\n\nShow us contrast.\n\nOpen until 31 October. We'd love to see your take on it.\n\n**[Enter your photo →](https://x/submit)**"), true

subject, body = R.message(round, 1, "Renato", "en")
check "subject uses best rank", subject, 'Your result in "Frame in Frame": =5th of 11'
check "shared count", body.include?("**=5th of 11** · “Entry 6” · 4 votes · shared with 4 other entries"), true
check "every entry listed", body.include?("**=10th of 11** · “Second \\| entry” · 1 vote · shared with 1 other entry"), true
check "no table in message", body.include?("|--"), false
check "no congrats unless won", body.include?("you won"), false

subject, body = R.message(round, 10, "Ana", "de")
check "de subject", subject, "Dein Ergebnis bei «Frame in Frame»: 1. von 11"
check "de congrats", body.include?("Herzlichen Glückwunsch"), true
check "de next round", body.include?("### Jetzt offen: Juxtaposition\n\n![brief](upload://b.jpeg)\n\nZeig uns Kontraste.\n\nOffen bis 31. Oktober."), true
check "tied first is not told it won", R.message(round.merge(winner: ranked[1]), 10, "Ana", "de")[1].include?("gewonnen"), false
check "first paragraph", R.first_paragraph("![b|1x1](upload://x)\n\n## The task\n\nCapture autumn.\nNot just leaves.\n\nMore."), "Capture autumn.\nNot just leaves."

subject, body = R.message(round, 13, "Luc", "fr")
check "fr subject", subject, "Votre résultat pour « Frame in Frame » : 4e sur 11"
check "fr month", body.include?("au défi de septembre."), true

check "no next round", R.announcement(round.merge(next: nil))[1].include?("Now open"), false
puts "26 challenge results checks passed"
