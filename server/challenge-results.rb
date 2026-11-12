# frozen_string_literal: true

# Run with Discourse's production Rails runner. Read-only unless SPC_APPLY=1.
# Announces each crowned Monthly Challenge round once: one Announcements topic
# (emailed to every member through "watching first post") and one personal
# message per entrant with their rank. SPC_MARK_BEFORE=YYYY-MM marks crowned
# rounds before that month announced without posting anything (one-off).
module SpcChallengeResults
  ROUND_TAG = /\A\d{4}-(?:0[1-9]|1[0-2])(?:-.+)?\z/
  WINNER_TAG = "winner"
  ANNOUNCEMENTS_CATEGORY_ID = 5
  FIELD = "spc_results_announced"
  # A crown can be corrected (August's was); give staff time before it is public.
  GRACE_SECONDS = 2 * 3600

  MONTHS = {
    "en" => %w[January February March April May June July August September October November December],
    "de" => %w[Januar Februar März April Mai Juni Juli August September Oktober November Dezember],
    "fr" => %w[janvier février mars avril mai juin juillet août septembre octobre novembre décembre],
  }.freeze

  TEXT = {
    "en" => {
      subject: 'Your result in "%{theme}": %{rank} of %{count}',
      hi: "Hi %{name},",
      intro: "Thank you for entering %{month}'s challenge. %{entries} photos were entered and members cast %{votes}. Here's how yours did:",
      won: "Congratulations, you won!",
      shared_one: "shared with 1 other entry", shared: "shared with %{count} other entries",
      of: "of %{count}",
      vote: "vote", votes: "votes",
      see: "See all results",
      next: "Now open: %{theme}", open: "Open until %{date}. We'd love to see your take on it.", enter: "Enter your photo",
      foot: "You're receiving this because you entered the %{month} Monthly Challenge.",
    },
    "de" => {
      subject: "Dein Ergebnis bei «%{theme}»: %{rank} von %{count}",
      hi: "Hallo %{name},",
      intro: "Danke, dass du bei der Challenge im %{month} mitgemacht hast. Es wurden %{entries} Fotos eingereicht und %{votes} vergeben. So hat deines abgeschnitten:",
      won: "Herzlichen Glückwunsch, du hast gewonnen!",
      shared_one: "gleichauf mit 1 weiteren Beitrag", shared: "gleichauf mit %{count} weiteren Beiträgen",
      of: "von %{count}",
      vote: "Stimme", votes: "Stimmen",
      see: "Alle Ergebnisse ansehen",
      next: "Jetzt offen: %{theme}", open: "Offen bis %{date}. Wir freuen uns auf deinen Beitrag.", enter: "Foto einreichen",
      foot: "Du erhältst diese Nachricht, weil du bei der Monatlichen Challenge im %{month} mitgemacht hast.",
    },
    "fr" => {
      subject: "Votre résultat pour « %{theme} » : %{rank} sur %{count}",
      hi: "Bonjour %{name},",
      intro: "Merci d’avoir participé au défi %{month}. %{entries} photos ont été proposées et les membres ont donné %{votes}. Voici le résultat de la vôtre :",
      won: "Félicitations, vous avez gagné !",
      shared_one: "à égalité avec 1 autre participation", shared: "à égalité avec %{count} autres participations",
      of: "sur %{count}",
      vote: "vote", votes: "votes",
      see: "Voir tous les résultats",
      next: "Nouveau défi : %{theme}", open: "Ouvert jusqu’au %{date}. Nous serions ravis de voir votre interprétation.", enter: "Proposer une photo",
      foot: "Vous recevez ce message parce que vous avez participé au Défi du Mois %{month}.",
    },
  }.freeze

  # Same rule as rankEntries() on the round page: raw vote_count, an entry's
  # place is one more than the number of entries with strictly more votes.
  def self.rank(entries)
    votes = entries.map { |e| e[:votes] }
    entries.map do |e|
      e.merge(place: 1 + votes.count { |v| v > e[:votes] }, tied: votes.count(e[:votes]) > 1)
    end.sort_by { |e| [e[:place], e[:id]] }
  end

  def self.lang(locale)
    code = locale.to_s[0, 2]
    TEXT.key?(code) ? code : "en"
  end

  # "1st", "=5th"; "1.", "=5."; "1er", "=5e" — ordinalLabel() on the round page.
  def self.ordinal(entry, lang)
    n = entry[:place]
    text =
      case lang
      when "de" then "#{n}."
      when "fr" then n == 1 ? "1er" : "#{n}e"
      else
        suffix = (11..13).cover?(n % 100) ? "th" : { 1 => "st", 2 => "nd", 3 => "rd" }.fetch(n % 10, "th")
        "#{n}#{suffix}"
      end
    "#{entry[:tied] ? "=" : ""}#{text}"
  end

  def self.votes(count, lang) = "#{count} #{count == 1 ? TEXT[lang][:vote] : TEXT[lang][:votes]}"
  def self.esc(text) = text.to_s.gsub(/([\[\]|*_\\])/) { "\\#{$1}" }
  def self.month(ym, lang) = MONTHS[lang][ym[5, 2].to_i - 1]
  # French elides: "de novembre", "d’octobre".
  def self.month_of(ym, lang)
    m = month(ym, lang)
    return m unless lang == "fr"

    /\A[aeiou]/.match?(m) ? "d’#{m}" : "de #{m}"
  end

  def self.month_year(ym, lang) = "#{month(ym, lang)} #{ym[0, 4]}"
  def self.link(e) = "[#{esc(e[:title])}](#{e[:url]})"

  def self.next_block(round, lang)
    n = round[:next] or return nil
    t = TEXT[lang]
    date = "#{n[:last_day]}#{lang == "de" ? "." : ""} #{month(n[:month], lang)}"
    ["### #{format(t[:next], theme: esc(n[:theme]))}", n[:image], n[:intro][lang],
     format(t[:open], date: date), "**[#{t[:enter]} →](#{n[:submit_url]})**"].compact.join("\n\n")
  end

  # The brief's opening paragraph: skip headings, images, quotes and tables.
  def self.first_paragraph(raw)
    raw.to_s.split(/\n\s*\n/).map(&:strip).find { |p| p.match?(/\A[[:alnum:]*_“"«]/) }
  end

  def self.image(topic)
    upload = topic.image_upload
    upload && "![#{esc(topic.title)}|#{upload.width}x#{upload.height}](#{upload.short_url})"
  end

  # No ranking table: a tie at the top would raise "why that one?". Winner,
  # link to every entry, then the round that is open now.
  def self.announcement(round)
    w = round[:winner]
    n = round[:next]
    title = "#{month(round[:month], "en")} winner announced#{", #{month(n[:month], "en")} Challenge: #{n[:theme]}" if n}"
    raw = [
      "**Monthly Challenge · #{month_year(round[:month], "en")}**",
      "#{round[:ranked].size} photos entered, #{votes(round[:votes], "en")} cast. Thank you to everyone who took part and voted.",
      w[:image],
      "**Winner:** #{link(w)} · #{esc(w[:author])}",
      "**[See all #{round[:ranked].size} entries](#{round[:url]})**",
      "Entered this round? We've sent you your own result in a personal message.",
      next_block(round, "en"),
    ].compact.join("\n\n")
    [title, raw]
  end

  def self.message(round, user_id, name, lang)
    t = TEXT[lang]
    mine = round[:ranked].select { |e| e[:user_id] == user_id }
    best = mine.first
    count = round[:ranked].size
    lines = mine.map do |e|
      others = round[:ranked].count { |o| o[:place] == e[:place] } - 1
      shared = others.zero? ? nil : (others == 1 ? t[:shared_one] : format(t[:shared], count: others))
      [e[:image], ["**#{ordinal(e, lang)} #{format(t[:of], count: count)}**", "“#{esc(e[:title])}”", votes(e[:votes], lang), shared].compact.join(" · ")].compact.join("\n\n")
    end
    subject = format(t[:subject], theme: round[:theme], rank: ordinal(best, lang), count: count)
    raw = [
      format(t[:hi], name: name),
      format(t[:intro], month: month_of(round[:month], lang), entries: count, votes: votes(round[:votes], lang)),
      (t[:won] if best[:id] == round[:winner][:id]),
      *lines,
      "**[#{t[:see]}](#{round[:url]})**",
      next_block(round, lang),
      "<small>#{format(t[:foot], month: month_of(round[:month], lang))}</small>",
    ].compact.join("\n\n")
    [subject, raw]
  end

  # The brief in each language: Discourse's translation of its first post when
  # one exists, else the original.
  def self.brief_intros(topic)
    post = topic.first_post
    TEXT.keys.to_h do |lang|
      raw = unless post.try(:locale).to_s.start_with?(lang)
        defined?(PostLocalization) && PostLocalization.where(post_id: post.id).where("locale LIKE ?", "#{lang}%").pick(:raw)
      end
      [lang, first_paragraph(raw.presence || post.raw)]
    end
  end

  def self.run(apply: false, mark_before: nil, test_email: nil, now: Time.current)
    raise "Wrong Discourse host" unless Discourse.current_hostname == "community.swissphotoclub.com"
    raise "SPC_MARK_BEFORE must be YYYY-MM" if mark_before && !/\A\d{4}-\d{2}\z/.match?(mark_before)

    settings = Theme.find(61).cached_settings
    category = Category.find(Integer(settings.fetch(:challenge_category_id)))
    tz = settings.fetch(:challenge_timezone)
    current = now.in_time_zone(tz).strftime("%Y-%m")
    sender = Discourse.site_contact_user

    topics = Topic.where(category_id: category.id, archetype: "regular", visible: true)
      .where.not(id: category.topic_id).includes(:tags, :user).to_a
    winner_tag = Tag.find_by!(name: WINNER_TAG)
    crowned_at = TopicTag.where(tag_id: winner_tag.id, topic_id: topics.map(&:id)).pluck(:topic_id, :created_at).to_h
    by_round = topics.group_by { |t| t.tags.find { |tag| ROUND_TAG.match?(tag.name) } }.except(nil)
    current_round = by_round.keys.select { |tag| tag.name[0, 7] == current }.max_by(&:name)

    marks = []
    rounds = []
    skipped = []
    by_round.sort_by { |tag, _| tag.name }.each do |tag, round_topics|
      brief, *entries = round_topics.sort_by { |t| [t.created_at, t.id] }
      winners = entries.select { |t| crowned_at.key?(t.id) }
      next if winners.empty? || brief.custom_fields[FIELD].present?

      ym = tag.name[0, 7]
      reason =
        if winners.size > 1 then "#{winners.size} winner-tagged entries"
        elsif ym >= current then "round still open"
        elsif crowned_at[winners.first.id] > now - GRACE_SECONDS then "crowned under #{GRACE_SECONDS / 3600}h ago"
        end
      if mark_before && ym < mark_before && winners.size == 1
        marks << { tag: tag.name, brief_id: brief.id, winner_id: winners.first.id }
        next
      end
      next skipped << { tag: tag.name, reason: reason } if reason

      ranked = rank(entries.map do |t|
        { id: t.id, title: t.title, url: t.relative_url, user_id: t.user_id,
          author: t.user&.name.presence || t.user&.username, votes: t.vote_count.to_i, image: image(t) }
      end)
      slug = tag.respond_to?(:slug_for_url) ? tag.slug_for_url : tag.name
      nxt = current_round && current_round != tag && by_round[current_round].min_by { |t| [t.created_at, t.id] }
      rounds << {
        tag: tag.name, brief: brief, month: ym, theme: brief.title,
        url: "#{Discourse.base_url}/tags/c/#{category.slug_path.join("/")}/#{category.id}/#{slug}/#{tag.id}",
        ranked: ranked, votes: ranked.sum { |e| e[:votes] },
        winner: ranked.find { |e| e[:id] == winners.first.id },
        next: nxt && { month: current, theme: nxt.title, last_day: now.in_time_zone(tz).end_of_month.day,
                       image: image(nxt), submit_url: "#{Discourse.base_url}/submit", intro: brief_intros(nxt) },
      }
    end

    if test_email
      # Rehearsal: everything goes to one address as private messages; the
      # announcement is not posted in Announcements and nothing is marked.
      tester = User.find_by_email(test_email) or raise "No user with #{test_email}"
      rounds.each do |r|
        title, raw = announcement(r)
        samples = r[:ranked].map { |e| User.find(e[:user_id]) }.uniq.group_by { |u| lang(u.effective_locale) }
        [["[Test] #{title}", raw], *samples.values.map do |(user, *)|
          subject, body = message(r, user.id, (user.name.presence || user.username).split.first, lang(user.effective_locale))
          ["[Test, as #{user.username}] #{subject}", body]
        end].each do |subject, body|
          PostCreator.create!(sender, title: subject, raw: body, archetype: Archetype.private_message,
                                      target_usernames: tester.username, skip_validations: true)
          puts "sent to #{tester.username}: #{subject}"
        end
      end
      return
    end

    unless apply
      puts JSON.pretty_generate(sender: sender.username, month: current, mark: marks, skipped: skipped,
                                announce: rounds.map { |r| { tag: r[:tag], entries: r[:ranked].size, votes: r[:votes] } })
      rounds.each do |r|
        title, raw = announcement(r)
        puts "\n===== ANNOUNCEMENT (category #{ANNOUNCEMENTS_CATEGORY_ID})\n# #{title}\n\n#{raw}"
        r[:ranked].map { |e| e[:user_id] }.uniq.each do |uid|
          user = User.find(uid)
          subject, body = message(r, uid, (user.name.presence || user.username).split.first, lang(user.effective_locale))
          puts "\n===== PM to #{user.username} (#{user.effective_locale})\n# #{subject}\n\n#{body}"
        end
      end
      return
    end

    marks.each do |m|
      brief = Topic.find(m[:brief_id])
      brief.custom_fields[FIELD] = "marked #{now.iso8601}"
      brief.save_custom_fields(true)
      puts "marked #{m[:tag]} (brief #{m[:brief_id]}) without posting"
    end
    rounds.each do |r|
      # Mark first: an interrupted run can lose messages, never send them twice.
      r[:brief].custom_fields[FIELD] = "announced #{now.iso8601}"
      r[:brief].save_custom_fields(true)
      title, raw = announcement(r)
      post = PostCreator.create!(sender, title: title, raw: raw, category: ANNOUNCEMENTS_CATEGORY_ID, skip_validations: true)
      puts "announced #{r[:tag]}: #{post.topic.relative_url}"
      r[:ranked].map { |e| e[:user_id] }.uniq.each do |uid|
        next if uid == sender.id
        user = User.find(uid)
        subject, body = message(r, uid, (user.name.presence || user.username).split.first, lang(user.effective_locale))
        PostCreator.create!(sender, title: subject, raw: body, archetype: Archetype.private_message,
                                    target_usernames: user.username, skip_validations: true)
        puts "  messaged #{user.username}"
      end
    end
  end
end

SpcChallengeResults.run(apply: ENV["SPC_APPLY"] == "1", mark_before: ENV["SPC_MARK_BEFORE"].presence,
                        test_email: ENV["SPC_TEST_EMAIL"].presence) if defined?(Rails)
