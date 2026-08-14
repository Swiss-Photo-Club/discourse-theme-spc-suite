import { service } from "@ember/service";
import { apiInitializer } from "discourse/lib/api";
import { i18n } from "discourse-i18n";

const PROFILE_SETUP_PATH = "/profile-setup";

// Entry points for the friendly profile page. The page itself lives in
// components/spc-profile-setup.gjs; this initializer makes it reachable and
// makes it the default: a quick-access item in the avatar menu's profile tab,
// and a takeover of the native Preferences → Profile route. The icon must be
// one `about.json` declares in svg_icons — "pencil" already is; a name
// missing from that list renders an empty box, not an error.
const spcRun = (api) => {
  api.addQuickAccessProfileItem({
    icon: "pencil",
    href: PROFILE_SETUP_PATH,
    content: i18n(themePrefix("profile_setup.menu_item")),
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
};

export default apiInitializer(spcRun);
