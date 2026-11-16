import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";
import { userPath } from "discourse/lib/url";
import { i18n } from "discourse-i18n";
import SpcMemberBadge from "../components/spc-member-badge";

const PROFILE_SETUP_PATH = "/profile-setup";
const MY_ACCOUNT_PATH = "/my-account";

// Entry points for /profile-setup and /my-account: the avatar menu's person
// tab, and takeovers of the native Preferences → Profile and Preferences
// index routes. Icons must be ones `about.json` declares in svg_icons; a
// name missing from that list renders an empty box, not an error.
const spcRun = (api) => {
  // Membership badge (#12): the card passes @user, the profile @model.
  api.renderInOutlet("user-card-after-username", SpcMemberBadge);
  api.renderInOutlet("user-post-names", SpcMemberBadge);

  // The avatar menu's person tab, trimmed to four plain entries (Oğuzhan,
  // 16 Nov): My profile, My account, Drafts, Log out. Core's Summary,
  // Activity, Invites and Preferences are hidden in profile-setup.scss — CSS
  // only, the core list itself is never touched — so "My profile" stands in
  // for Summary, and Preferences is one "All settings" link away on
  // /my-account. Edit profile lives on /my-account too. Both icons must be
  // declared in about.json's svg_icons.
  const user = api.getCurrentUser();
  if (user) {
    api.addQuickAccessProfileItem({
      icon: "user",
      href: userPath(`${user.username_lower}/summary`),
      content: i18n(themePrefix("my_account.menu_profile")),
      className: "spc-menu-profile",
    });
  }

  api.addQuickAccessProfileItem({
    icon: "gear",
    href: MY_ACCOUNT_PATH,
    content: i18n(themePrefix("my_account.menu_item")),
    className: "spc-menu-account",
  });

  // Your own /u/<you>/preferences/profile lands on /profile-setup instead —
  // same beforeModel/replaceWith pattern route:new-topic uses in
  // spc-photo-submit.js. Three deliberate holes in the takeover:
  //
  //   - Another user's page (admins editing a member's profile) stays native:
  //     the username segment is compared against the signed-in user.
  //   - ?full=1 stays native. The route declares no query params, so Ember
  //     hands unknowns through in transition.to.queryParams untouched — the
  //     property route:new-topic already relies on for spc_form. The page's
  //     "all profile settings" link carries it; it is the way to the native
  //     fields /profile-setup does not cover (featured topic, card images,
  //     birthday, hide-profile).
  //   - The profile_setup_replaces_preferences setting turns the whole
  //     redirect off live, no commit needed. The fallback target is core's
  //     own page, which cannot go away — the property the deleted wizard
  //     switches lacked.
  //
  // "route:preferences.profile" is the canonical container key; core's
  // resolver-shims.js maps the legacy dashed form onto it.
  api.modifyClass(
    "route:preferences.profile",
    (Superclass) =>
      class extends Superclass {
        @service router;

        beforeModel(transition) {
          const user = api.getCurrentUser();
          const username = this.paramsFor("user")?.username;

          if (
            settings.profile_setup_replaces_preferences &&
            user &&
            username?.toLowerCase() === user.username_lower &&
            !transition.to?.queryParams?.full
          ) {
            this.router.replaceWith(PROFILE_SETUP_PATH);
            return;
          }

          return super.beforeModel(...arguments);
        }
      }
  );

  // /my-account takes over your own preferences index the same way, with the
  // same three holes (other users, ?full=1, my_account_replaces_preferences).
  // Only the index: it is where the avatar menu's Preferences entry and
  // /my/preferences land, and core's own index just redirects on to the
  // Account tab. Every tab stays reachable by its own URL, which is how the
  // page's "All settings" link (account?full=1) gets through.
  api.modifyClass(
    "route:preferences.index",
    (Superclass) =>
      class extends Superclass {
        @service router;

        beforeModel(transition) {
          const user = api.getCurrentUser();
          const username = this.paramsFor("user")?.username;

          if (
            settings.my_account_replaces_preferences &&
            user &&
            username?.toLowerCase() === user.username_lower &&
            !transition.to?.queryParams?.full
          ) {
            this.router.replaceWith(MY_ACCOUNT_PATH);
            return;
          }

          return super.beforeModel(...arguments);
        }
      }
  );
};

export default apiInitializer(spcRun);
