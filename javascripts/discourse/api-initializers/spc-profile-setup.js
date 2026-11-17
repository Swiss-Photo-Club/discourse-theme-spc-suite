import { apiInitializer } from "discourse/lib/api";
import { i18n } from "discourse-i18n";
import SpcMemberBadge from "../components/spc-member-badge";

const MY_ACCOUNT_PATH = "/my-account";

// The avatar menu's entry point for /my-account. No native preferences route
// is taken over: clicking a tab inside the native pages must not jump to
// another page (Oğuzhan, 17 Nov). Icons must be ones `about.json` declares in svg_icons; a
// name missing from that list renders an empty box, not an error.
const spcRun = (api) => {
  // Membership badge (#12): the card passes @user, the profile @model.
  api.renderInOutlet("user-card-after-username", SpcMemberBadge);
  api.renderInOutlet("user-post-names", SpcMemberBadge);

  // The avatar menu's person tab, trimmed to three plain entries (Oğuzhan,
  // 16 Nov): My profile, Drafts, Log out. "My profile" opens /my-account —
  // people click it expecting their settings, and that page carries View
  // public profile and Edit profile. Core's Summary, Activity, Invites and
  // Preferences are hidden in profile-setup.scss (CSS only, the core list is
  // never touched). The icon must be declared in about.json's svg_icons.
  api.addQuickAccessProfileItem({
    icon: "user",
    href: MY_ACCOUNT_PATH,
    content: i18n(themePrefix("my_account.menu_profile")),
    className: "spc-menu-profile",
  });
};

export default apiInitializer(spcRun);
