import DiscourseRoute from "discourse/routes/discourse";
import { i18n } from "discourse-i18n";

export default class SpcSubmitIntroductionRoute extends DiscourseRoute {
  titleToken() {
    return i18n(themePrefix("intro_form.heading"));
  }
}
