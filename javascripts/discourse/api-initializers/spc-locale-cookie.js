import { apiInitializer } from "discourse/lib/api";
import { settings } from "virtual:theme";

const COOKIE_NAME = "spc_community_locale";
const SUPPORTED_LOCALES = ["en", "de", "fr"];

function writeLocaleCookie() {
  const locale = (document.documentElement.lang || "")
    .toLowerCase()
    .split(/[-_]/)[0];

  if (!SUPPORTED_LOCALES.includes(locale)) {
    return;
  }

  document.cookie =
    `${COOKIE_NAME}=${locale}; Domain=swissphotoclub.com; Path=/; ` +
    "Max-Age=31536000; SameSite=Lax; Secure";
}

export default apiInitializer((api) => {
  if (!settings.enable_locale_cookie) {
    return;
  }

  writeLocaleCookie();
  api.onPageChange(writeLocaleCookie);
});