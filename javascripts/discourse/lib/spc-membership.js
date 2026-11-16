import DiscourseURL from "discourse/lib/url";
import I18n from "discourse-i18n";

// spc-be's `members` group. The one fact Discourse has about paid
// membership; spc-be adds and removes people through DiscourseConnect and
// SyncDiscourseUserJob. Distinct from nonmember_member_groups, which also
// counts trial users and staff as "not to be pitched at".
export const SPC_MEMBERS_GROUP_ID = 40;
// spc-be's `trial` group: access that rests on a trial alone.
export const SPC_TRIAL_GROUP_ID = 44;

// Admin-only user fields spc-be writes on every sync (#12, the "spc-be
// contract" in docs/final-recommendations.html). Created 2026-11-16; the ids
// are what spc-be posts to, so they never change. Dates are ISO YYYY-MM-DD,
// the type is a stable lowercase key, and an empty field means "not known".
export const MEMBERSHIP_FIELDS = {
  since: 1,
  renews: 2,
  trialEnds: 3,
  type: 4,
};

function fieldValue(userFields, id) {
  return String(userFields?.[id] ?? "").trim();
}

// "2027-07-01" → "1 July 2027" / "1. Juli 2027" / "1 juillet 2027". Read and
// formatted in UTC so the day never shifts with the viewer's time zone. A
// value that is not an ISO date is shown as written rather than dropped.
export function formatMembershipDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }
  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));
  return new Intl.DateTimeFormat(I18n.currentLocale().replace("_", "-"), {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

// A known type key has a label in locales; a key spc-be adds later still
// shows something, title-cased, without waiting for a theme release.
function typeLabel(key) {
  const fallback = key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
  return I18n.t(themePrefix(`membership.types.${key}`), {
    defaultValue: fallback,
  });
}

// The signed-in user's own membership, for the /profile-setup status block.
// `userFields` is the user_fields map from /u/<self>.json — a user always
// sees their own fields, even admin-only ones. Status prefers spc-be's type
// key and falls back to groups 44, then 40, while the field is empty.
export function membershipStatus(currentUser, userFields) {
  const groupIds = (currentUser?.groups || []).map((group) => group.id);
  const type = fieldValue(userFields, MEMBERSHIP_FIELDS.type).toLowerCase();

  let status;
  if (type) {
    status = typeLabel(type);
  } else if (groupIds.includes(SPC_TRIAL_GROUP_ID)) {
    // Trial first: spc-be puts trial users in group 40 as well (verified
    // 2026-11-12, all 16 trial users were members), so 44 is the
    // distinguishing fact and 40 alone cannot tell the two apart.
    status = I18n.t(themePrefix("membership.status_trial"));
  } else if (groupIds.includes(SPC_MEMBERS_GROUP_ID)) {
    status = I18n.t(themePrefix("membership.status_member"));
  } else {
    status = I18n.t(themePrefix("membership.status_none"));
  }

  const rows = [
    ["since", MEMBERSHIP_FIELDS.since],
    ["renews", MEMBERSHIP_FIELDS.renews],
    ["trial_ends", MEMBERSHIP_FIELDS.trialEnds],
  ]
    .map(([label, id]) => [label, fieldValue(userFields, id)])
    .filter(([, value]) => value)
    .map(([label, value]) => ({
      label: I18n.t(themePrefix(`membership.${label}`)),
      value: formatMembershipDate(value),
    }));

  return { status, rows };
}

export function manageMembershipUrl() {
  return String(settings.membership_manage_url || "").trim();
}

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
