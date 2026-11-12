# frozen_string_literal: true

require "date"

# Run with Discourse's production Rails runner. Read-only unless SPC_APPLY=1.
# Announces each crowned Monthly Challenge round once, as one Announcements
# topic, which "watching first post" emails to every member.
# SPC_MARK_BEFORE=YYYY-MM marks older crowned rounds announced without posting
# (one-off backfill). SPC_TEST_EMAIL=<address> sends the announcement to that
# user alone as a private message and marks nothing.
module SpcChallengeResults
  ROUND_TAG = /\A\d{4}-(?:0[1-9]|1[0-2])(?:-.+)?\z/
  WINNER_TAG = "winner"
  ANNOUNCEMENTS_CATEGORY_ID = 5
  SENDER = "spc_admin"
  FIELD = "spc_results_announced"
  # A crown can be corrected (August's was); give staff time before it is public.
  GRACE_SECONDS = 2 * 3600

  def self.esc(text) = text.to_s.gsub(/([\[\]|*_\\])/) { "\\#{$1}" }
  def self.month(ym) = Date::MONTHNAMES[ym[5, 2].to_i]
  def self.link(e) = "[#{esc(e[:title])}](#{e[:url]})"

  # The brief's opening paragraph: skip headings, images, quotes and tables.
  def self.first_paragraph(raw)
    raw.to_s.split(/\n\s*\n/).map(&:strip).find { |p| p.match?(/\A[[:alnum:]*_“"«]/) }
  end

  # Wrapped in a link, so a click opens the page, not the full-size file. A
  # linked image loses Discourse's lightbox sizing, so cap it ourselves.
  def self.image(topic, href)
    upload = topic.image_upload or return nil
    "[![#{esc(topic.title)}|#{fit(upload.width, upload.height)}](#{upload.short_url})](#{href})"
  end

  def self.fit(width, height, max_w = 600, max_h = 500)
    scale = [max_w.fdiv(width), max_h.fdiv(height), 1].min
    "#{(width * scale).round}x#{(height * scale).round}"
  end

  # No ranking table: a tie at the top would raise "why that one?". Winner,
  # a link to every entry, then the round that is open now.
  def self.announcement(round)
    w = round[:winner]
    n = round[:next]
    title = "#{month(round[:month])} winner announced#{", #{month(n[:month])} Challenge: #{n[:theme]}" if n}"
    raw = [
      "**Monthly Challenge · #{month(round[:month])} #{round[:month][0, 4]}**",
      "#{round[:entries]} photos entered, #{round[:votes]} votes cast. Thank you to everyone who took part and voted.",
      w[:image],
      "**Winner:** #{link(w)} · #{esc(w[:author])}",
      "**[See all #{round[:entries]} entries](#{round[:url]})**",
      "Entered this round? Your own rank is on the results page.",
      (n && ["### Now open: [#{esc(n[:theme])}](#{n[:url]})", n[:image], n[:intro],
             "Open until #{n[:last_day]} #{month(n[:month])}. We'd love to see your take on it.",
             "**[Enter your photo →](#{n[:submit_url]})** · **[See the challenge →](#{n[:url]})**"]),
    ].flatten.compact.join("\n\n")
    [title, raw]
  end

  # The brief in English: Discourse's translation of its first post when the
  # original is in another language.
  def self.brief_intro(topic)
    post = topic.first_post
    raw = unless post.try(:locale).to_s.start_with?("en")
      defined?(PostLocalization) && PostLocalization.where(post_id: post.id).where("locale LIKE 'en%'").pick(:raw)
    end
    first_paragraph(raw.presence || post.raw)
  end

  def self.run(apply: false, mark_before: nil, test_email: nil, now: Time.current)
    raise "Wrong Discourse host" unless Discourse.current_hostname == "community.swissphotoclub.com"
    raise "SPC_MARK_BEFORE must be YYYY-MM" if mark_before && !/\A\d{4}-\d{2}\z/.match?(mark_before)

    settings = Theme.find(61).cached_settings
    category = Category.find(Integer(settings.fetch(:challenge_category_id)))
    tz = settings.fetch(:challenge_timezone)
    current = now.in_time_zone(tz).strftime("%Y-%m")
    sender = User.find_by_username!(SENDER)

    topics = Topic.where(category_id: category.id, archetype: "regular", visible: true)
      .where.not(id: category.topic_id).includes(:tags, :user).to_a
    winner_tag = Tag.find_by!(name: WINNER_TAG)
    crowned_at = TopicTag.where(tag_id: winner_tag.id, topic_id: topics.map(&:id)).pluck(:topic_id, :created_at).to_h
    by_round = topics.group_by { |t| t.tags.find { |tag| ROUND_TAG.match?(tag.name) } }.except(nil)
    current_round = by_round.keys.select { |tag| tag.name[0, 7] == current }.max_by(&:name)
    round_url = ->(tag) do
      slug = tag.respond_to?(:slug_for_url) ? tag.slug_for_url : tag.name
      "#{Discourse.base_url}/tags/c/#{category.slug_path.join("/")}/#{category.id}/#{slug}/#{tag.id}"
    end

    marks = []
    rounds = []
    skipped = []
    by_round.sort_by { |tag, _| tag.name }.each do |tag, round_topics|
      # The brief is the round tag's oldest topic, as on the round page; it is not an entry.
      brief, *entries = round_topics.sort_by { |t| [t.created_at, t.id] }
      winners = entries.select { |t| crowned_at.key?(t.id) }
      next if winners.empty? || brief.custom_fields[FIELD].present?

      ym = tag.name[0, 7]
      if mark_before && ym < mark_before && winners.size == 1
        marks << { tag: tag.name, brief_id: brief.id, winner_id: winners.first.id }
        next
      end
      reason =
        if winners.size > 1 then "#{winners.size} winner-tagged entries"
        elsif ym >= current then "round still open"
        elsif crowned_at[winners.first.id] > now - GRACE_SECONDS then "crowned under #{GRACE_SECONDS / 3600}h ago"
        end
      next skipped << { tag: tag.name, reason: reason } if reason

      w = winners.first
      nxt = current_round && current_round != tag && by_round[current_round].min_by { |t| [t.created_at, t.id] }
      rounds << {
        tag: tag.name, brief: brief, month: ym, url: round_url[tag],
        entries: entries.size, votes: entries.sum { |t| t.vote_count.to_i },
        winner: { title: w.title, url: w.relative_url, author: w.user&.name.presence || w.user&.username,
                  image: image(w, "#{Discourse.base_url}#{w.relative_url}") },
        next: nxt && { month: current, theme: nxt.title, last_day: now.in_time_zone(tz).end_of_month.day,
                       url: round_url[current_round], image: image(nxt, round_url[current_round]),
                       submit_url: "#{Discourse.base_url}/submit", intro: brief_intro(nxt) },
      }
    end

    if test_email
      tester = User.find_by_email(test_email) or raise "No user with #{test_email}"
      rounds.each do |r|
        title, raw = announcement(r)
        PostCreator.create!(sender, title: "[Test] #{title}", raw: raw, archetype: Archetype.private_message,
                                    target_usernames: tester.username, skip_validations: true)
        puts "sent to #{tester.username}: [Test] #{title}"
      end
      return
    end

    unless apply
      puts JSON.pretty_generate(sender: sender.username, month: current, mark: marks, skipped: skipped,
                                announce: rounds.map { |r| r.slice(:tag, :entries, :votes) })
      rounds.each do |r|
        title, raw = announcement(r)
        puts "\n===== ANNOUNCEMENT (category #{ANNOUNCEMENTS_CATEGORY_ID})\n# #{title}\n\n#{raw}"
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
      # Mark first: a crash between the two can lose an announcement, never repeat one.
      r[:brief].custom_fields[FIELD] = "announced #{now.iso8601}"
      r[:brief].save_custom_fields(true)
      title, raw = announcement(r)
      post = PostCreator.create!(sender, title: title, raw: raw, category: ANNOUNCEMENTS_CATEGORY_ID, skip_validations: true)
      puts "announced #{r[:tag]}: #{post.topic.relative_url}"
    end
  end
end

SpcChallengeResults.run(apply: ENV["SPC_APPLY"] == "1", mark_before: ENV["SPC_MARK_BEFORE"].presence,
                        test_email: ENV["SPC_TEST_EMAIL"].presence) if defined?(Rails)
