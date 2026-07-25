import DiscourseRoute from "discourse/routes/discourse";
import { i18n } from "discourse-i18n";

export default class SpcSubmitRoute extends DiscourseRoute {
  titleToken() {
    // ?type=critique swaps the whole form over; the tab title follows it.
    const type = this.controllerFor("spc-submit")?.type;
    return type === "critique"
      ? i18n(themePrefix("critique_form.heading"))
      : i18n(themePrefix("form.heading"));
  }
}
