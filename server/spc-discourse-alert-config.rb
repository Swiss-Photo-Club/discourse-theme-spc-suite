# frozen_string_literal: true

raise "Wrong forum" unless Discourse.current_hostname == "community.swissphotoclub.com"
raise "Full local backups required" unless SiteSetting.backup_location == "local" && SiteSetting.backup_with_uploads

puts({
  smtp: ActionMailer::Base.smtp_settings,
  from: SiteSetting.notification_email,
  to: "altun@swissphotoclub.com",
}.to_json)
