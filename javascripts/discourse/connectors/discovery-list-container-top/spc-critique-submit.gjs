import Component from "@glimmer/component";
import I18n from "discourse-i18n";

export default class SpcCritiqueSubmit extends Component {
  get category() {
    return this.args.outletArgs?.category;
  }

  // Introductions only. The critique category's two buttons moved into the
  // shared hero, which renders them above the topic list instead of floating
  // them to the right of it — same handlers, same URLs, same
  // critique_image_use_form rollback. This whole connector goes when category
  // 12 gets its hero; until then it is the only thing supplying that
  // category's action.
  get isIntro() {
    return this.category?.slug === settings.critique_intro_category_slug;
  }

  get show() {
    return settings.enable_critique_submit && this.isIntro;
  }

  get localeSuffix() {
    const locale = I18n.currentLocale() || "";
    if (locale.startsWith("en")) {
      return "-en";
    }
    if (locale.startsWith("fr")) {
      return "-fr";
    }
    return "";
  }

  // The image and project getters moved into the category-hero registry along
  // with their buttons, including the critique_image_use_form switch between
  // the built-in /submit/critique form and the Custom Wizard. Only the
  // introduction wizard is still served from here.
  get introUrl() {
    return settings.critique_intro_wizard_url + this.localeSuffix;
  }

  get introLabel() {
    return I18n.t(themePrefix("critique_submit.intro_button"));
  }

  <template>
    {{#if this.show}}
      <div class="spc-critique-submit">
        <a class="btn btn-primary spc-submit-intro" href={{this.introUrl}}>
          {{this.introLabel}}
        </a>
      </div>
    {{/if}}
  </template>
}
