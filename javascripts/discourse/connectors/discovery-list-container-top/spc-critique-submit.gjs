import Component from "@glimmer/component";
import I18n from "discourse-i18n";

export default class SpcCritiqueSubmit extends Component {
  get category() {
    return this.args.outletArgs?.category;
  }

  get isCritique() {
    return this.category?.slug === settings.critique_category_slug;
  }

  get isIntro() {
    return this.category?.slug === settings.critique_intro_category_slug;
  }

  get show() {
    return settings.enable_critique_submit && (this.isCritique || this.isIntro);
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

  // The single-image flow has moved off the Custom Wizard and onto the theme's
  // own /submit route. The wizard is still installed and still works, so
  // critique_image_use_form is the rollback: flip it off in settings and the
  // button points back at the wizard immediately, with no theme update.
  // The project and introduction buttons below are still wizard-only.
  get imageUrl() {
    if (settings.critique_image_use_form) {
      return "/submit/critique";
    }
    return settings.critique_image_wizard_url + this.localeSuffix;
  }

  get projectUrl() {
    return settings.critique_project_wizard_url + this.localeSuffix;
  }

  get introUrl() {
    return settings.critique_intro_wizard_url + this.localeSuffix;
  }

  get imageLabel() {
    return I18n.t(themePrefix("critique_submit.image_button"));
  }

  get projectLabel() {
    return I18n.t(themePrefix("critique_submit.project_button"));
  }

  get introLabel() {
    return I18n.t(themePrefix("critique_submit.intro_button"));
  }

  <template>
    {{#if this.show}}
      <div class="spc-critique-submit">
        {{#if this.isCritique}}
          <a class="btn btn-primary spc-submit-image" href={{this.imageUrl}}>
            {{this.imageLabel}}
          </a>
          <a class="btn btn-default spc-submit-project" href={{this.projectUrl}}>
            {{this.projectLabel}}
          </a>
        {{else}}
          <a class="btn btn-primary spc-submit-intro" href={{this.introUrl}}>
            {{this.introLabel}}
          </a>
        {{/if}}
      </div>
    {{/if}}
  </template>
}
