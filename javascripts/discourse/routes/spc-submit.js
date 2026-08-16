import DiscourseRoute from "discourse/routes/discourse";
import { i18n } from "discourse-i18n";
import { redirectNonMemberToMembersOnly } from "../lib/spc-membership";

export default class SpcSubmitRoute extends DiscourseRoute {
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
    // Critique mode lives at /submit/critique now, but ?type=critique still
    // swaps the whole form over for older links; the tab title follows it.
    const type = this.controllerFor("spc-submit")?.type;
    return type === "critique"
      ? i18n(themePrefix("critique_form.heading"))
      : i18n(themePrefix("form.heading"));
  }
}
