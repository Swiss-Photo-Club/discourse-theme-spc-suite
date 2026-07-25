import Component from "@glimmer/component";
import { action } from "@ember/object";
import DButton from "discourse/components/d-button";
import DiscourseURL from "discourse/lib/url";
import { i18n } from "discourse-i18n";

export default class SpcSubmitBanner extends Component {
  get shouldShow() {
    if (!settings.show_banner) {
      return false;
    }
    const category = this.args.outletArgs?.category;
    return (
      category && category.id === parseInt(settings.challenge_category_id, 10)
    );
  }

  @action
  openForm() {
    DiscourseURL.routeTo("/submit");
  }

  <template>
    {{#if this.shouldShow}}
      <div class="spc-submit-banner">
        <div class="spc-submit-banner__text">
          <h2>{{i18n (themePrefix "banner.title")}}</h2>
          <p>{{i18n (themePrefix "banner.subtitle")}}</p>
        </div>
        <DButton
          @icon="camera"
          @translatedLabel={{i18n (themePrefix "banner.button")}}
          @action={{this.openForm}}
          class="btn-primary spc-submit-banner__button"
        />
      </div>
    {{/if}}
  </template>
}
