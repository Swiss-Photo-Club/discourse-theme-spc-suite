import DiscourseRoute from "discourse/routes/discourse";
import { i18n } from "discourse-i18n";

export default class SpcSubmitCritiqueRoute extends DiscourseRoute {
  titleToken() {
    return i18n(themePrefix("critique_form.heading"));
  }
}
