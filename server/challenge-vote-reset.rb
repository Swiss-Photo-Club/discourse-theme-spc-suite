# frozen_string_literal: true

# Run with Discourse's production Rails runner. Read-only unless SPC_APPLY=1.
# A host timer runs this independently of browser visits and container rebuilds.
module SpcChallengeVoteReset
  ROUND_TAG = /\A\d{4}-(?:0[1-9]|1[0-2])(?:-.+)?\z/

  def self.completed?(tag, active_tag, month)
    return false unless tag && ROUND_TAG.match?(tag)

    tag[0, 7] < month ||
      (active_tag && tag != active_tag && tag[0, 7] <= active_tag[0, 7])
  end

  def self.run(apply: false, now: Time.current)
    raise "Wrong Discourse host" unless Discourse.current_hostname == "community.swissphotoclub.com"
    raise "Topic Voting is disabled" unless SiteSetting.topic_voting_enabled

    settings = Theme.find(61).cached_settings
    category = Category.find(Integer(settings.fetch(:challenge_category_id)))
    raise "Challenge category does not support voting" unless Category.can_vote?(category.id)

    month = now.in_time_zone(settings.fetch(:challenge_timezone)).strftime("%Y-%m")
    topics = Topic.where(category_id: category.id, archetype: "regular")
      .where.not(id: category.topic_id).includes(:tags).to_a
    rounds = topics.filter_map do |topic|
      tag = topic.tags.map(&:name).find { |name| ROUND_TAG.match?(name) }
      [topic, tag] if tag
    end
    # Use site pins, not TopicUser's per-reader unpin state. A newly pinned
    # brief also replaces another round within the same month.
    brief = rounds.select do |topic, _tag|
      topic.pinned_at && (!topic.pinned_until || topic.pinned_until > now)
    end.max_by { |topic, tag| [tag[0, 7], topic.pinned_at, topic.id] }
    active_tag = brief&.last
    candidates = rounds.select { |_topic, tag| completed?(tag, active_tag, month) }
    ids = candidates.map { |topic, _tag| topic.id }
    active_votes = DiscourseTopicVoting::Vote.active.where(topic_id: ids).group(:topic_id).count
    changes = candidates.filter_map do |topic, tag|
      next if (topic.closed || topic.archived) && !active_votes.key?(topic.id)

      { topic_id: topic.id, tag: tag, close: !topic.closed && !topic.archived,
        votes_to_return: active_votes.fetch(topic.id, 0), votes_total: topic.vote_count }
    end
    report = { apply: apply, month: month, active_tag: active_tag, changes: changes }
    puts JSON.generate(report) unless apply && changes.empty?
    return report unless apply

    topics_by_id = topics.index_by(&:id)
    changes.each do |change|
      topic = topics_by_id.fetch(change[:topic_id])
      if change[:close]
        # Native close queues VoteRelease, preserving totals and notifying voters.
        topic.update_status("closed", true, Discourse.system_user)
      else
        # Recover an interrupted release on an already closed/archived entry.
        Jobs.enqueue(Jobs::DiscourseTopicVoting::VoteRelease, topic_id: topic.id)
      end
    end
    report
  end
end

SpcChallengeVoteReset.run(apply: ENV["SPC_APPLY"] == "1") if defined?(Rails)
