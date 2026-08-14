import { apiInitializer } from "discourse/lib/api";
import { i18n } from "discourse-i18n";

const PROFILE_SETUP_PATH = "/profile-setup";

// Entry points for the friendly profile page. The page itself lives in
// components/spc-profile-setup.gjs; this initializer only makes it reachable:
// a quick-access item in the avatar menu's profile tab. The icon must be one
// `about.json` declares in svg_icons — "pencil" already is; a name missing
// from that list renders an empty box, not an error.
const spcRun = (api) => {
  api.addQuickAccessProfileItem({
    icon: "pencil",
    href: PROFILE_SETUP_PATH,
    content: i18n(themePrefix("profile_setup.menu_item")),
  });
};

export default apiInitializer(spcRun);
