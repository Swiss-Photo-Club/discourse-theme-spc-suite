import { apiInitializer } from "discourse/lib/api";
import { settings } from "virtual:theme";
import SpcNonMemberBanner from "../components/spc-non-member-banner";

export default apiInitializer((api) => {
  if (!settings.enable_nonmember_banner) {
    return;
  }

  api.renderInOutlet("above-main-container", SpcNonMemberBanner);
});
