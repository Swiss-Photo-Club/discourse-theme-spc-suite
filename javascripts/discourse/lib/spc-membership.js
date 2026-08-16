import DiscourseURL from "discourse/lib/url";

// One definition of "is this visitor a community member" for the whole theme.
//
// Membership is the `nonmember_member_groups` setting (SPC `members`, `trial`,
// admins, moderators by default). Discourse resolves it server-side for the
// signed-in user through `resolve_group_membership`, which is the fast path;
// the fallback compares the setting against `currentUser.groups` so a renamed
// setting degrades rather than breaks (see CLAUDE.md).
//
// Access itself is enforced by Discourse: category security ("everyone: see,
// members: create") and the Category Lockdown plugin (redirect → members-only
// page). This module only lets the theme send people to that same page
// *before* they run into a hidden button or a 403 on submit.

export function isSpcMember(currentUser) {
  if (Object.hasOwn(settings, "user_in_nonmember_member_groups")) {
    return settings.user_in_nonmember_member_groups;
  }

  if (!currentUser) {
    return false;
  }

  const memberGroupIds = String(settings.nonmember_member_groups || "")
    .split("|")
    .filter(Boolean)
    .map(Number);

  return (currentUser.groups || []).some((group) =>
    memberGroupIds.includes(group.id)
  );
}

// The spc-be landing page that replaced the paywall topic. It reads the
// visitor's language from the theme's locale cookie, so no ?lang= is added.
export function membersOnlyUrl() {
  return String(settings.members_only_url || "").trim();
}

// Rewrite the destination of a posting action for a visitor who cannot post.
// Anything that would open a form or the composer goes to the members-only
// page instead; browse links (e.g. /upcoming-events) are left alone.
export function gatePostingHref(href, currentUser) {
  const url = membersOnlyUrl();
  if (!url || isSpcMember(currentUser)) {
    return href;
  }
  return /^\/(submit|new-topic)(\/|\?|$)/.test(String(href || ""))
    ? url
    : href;
}

// Send a non-member to the members-only page. Returns true when the redirect
// was issued so a route can abort its transition; false means carry on.
export function redirectNonMemberToMembersOnly(currentUser) {
  const url = membersOnlyUrl();
  if (!url || isSpcMember(currentUser)) {
    return false;
  }
  DiscourseURL.redirectTo(url);
  return true;
}
