import { apiInitializer } from "discourse/lib/api";
import { settings } from "virtual:theme";
import SpcMemberOnboarding from "../components/spc-member-onboarding";

export default apiInitializer((api) => {
  if (!settings.enable_onboarding) {
    return;
  }

  api.renderInOutlet("above-main-container", SpcMemberOnboarding);
});
