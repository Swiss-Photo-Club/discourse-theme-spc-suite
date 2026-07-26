import DiscourseRoute from "discourse/routes/discourse";
import { i18n } from "discourse-i18n";

export default class SpcSubmitProjectRoute extends DiscourseRoute {
  titleToken() {
    return i18n(themePrefix("project_form.heading"));
  }
}
