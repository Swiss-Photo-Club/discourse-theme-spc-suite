# frozen_string_literal: true

# name: spc-critique-exchange
# about: Require reciprocal feedback before another Photo Feedback submission
# version: 0.1.0
# authors: Swiss Photo Club
# url: https://github.com/Swiss-Photo-Club/discourse-theme-spc-suite

require "time"

enabled_site_setting :spc_critique_exchange_enabled

after_initialize do
  on_enabled_change do |_old_value, enabled|
    if enabled.to_s == "true" && !PluginStore.get("spc_critique_exchange", "started_at")
      PluginStore.set("spc_critique_exchange", "started_at", Time.current.iso8601(6))
    end
  end

  on(:after_validate_topic) do |topic, creator|
    next unless topic.category_id == SiteSetting.spc_critique_exchange_category_id

    category = Category.find_by(id: SiteSetting.spc_critique_exchange_category_id)
    next if !category || creator.guardian.is_staff?
    next if topic.errors.any?

    started_at = PluginStore.get("spc_critique_exchange", "started_at")
    unless started_at
      started_at = Time.current.iso8601(6)
      PluginStore.set("spc_critique_exchange", "started_at", started_at)
    end
    start_time = Time.iso8601(started_at)

    user_id = creator.user.id
    submissions =
      Topic.where(category_id: category.id, user_id: user_id, deleted_at: nil, archetype: "regular")
        .where("topics.created_at >= ?", start_time)
        .where.not(id: category.topic_id)
        .count
    next if submissions.zero? # The first submission needs no prior feedback.

    # ponytail: a regular reply is the measurable proxy for a critique; add manual approval if low-effort replies become common.
    feedback =
      Post.joins(:topic)
        .where(user_id: user_id, post_type: Post.types[:regular], deleted_at: nil)
        .where("posts.created_at >= ?", start_time)
        .where("posts.post_number > 1")
        .where(topics: { category_id: category.id, deleted_at: nil, archetype: "regular" })
        .where.not(topics: { user_id: user_id })
        .where.not(topics: { id: category.topic_id })
        .distinct
        .count("posts.topic_id")

    remaining = submissions * 2 - feedback
    next if remaining <= 0

    # ponytail: simultaneous submissions can read the same balance; add per-user locking if members exploit that race.
    topic.errors.add(:base, I18n.t("spc_critique_exchange.needs_feedback", count: remaining))
  end
end
