import DiscourseRoute from "discourse/routes/discourse";
import { i18n } from "discourse-i18n";
import { redirectNonMemberToMembersOnly } from "../lib/spc-membership";

export default class SpcSubmitFeedbackRoute extends DiscourseRoute {
  // Members only, like every other /submit/* route: the feedback category is
  // behind the same lockdown as the rest of the site, so a non-member would
  // otherwise fill in a form Discourse then 403s.
  beforeModel(transition) {
    if (redirectNonMemberToMembersOnly(this.currentUser)) {
      transition.abort();
      return;
    }
    return super.beforeModel(transition);
  }

  titleToken() {
    return i18n(themePrefix("feedback_form.heading"));
  }
}
