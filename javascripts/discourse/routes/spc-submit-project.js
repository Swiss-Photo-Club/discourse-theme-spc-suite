import DiscourseRoute from "discourse/routes/discourse";
import { i18n } from "discourse-i18n";
import { redirectNonMemberToMembersOnly } from "../lib/spc-membership";

export default class SpcSubmitProjectRoute extends DiscourseRoute {
  // Members only. Non-members (signed out or signed in without access) go
  // to the members-only page before any form renders — the same destination
  // the Category Lockdown plugin sends them to from a locked topic.
  beforeModel(transition) {
    if (redirectNonMemberToMembersOnly(this.currentUser)) {
      transition.abort();
      return;
    }
    return super.beforeModel(transition);
  }

  titleToken() {
    return i18n(themePrefix("project_form.heading"));
  }
}
