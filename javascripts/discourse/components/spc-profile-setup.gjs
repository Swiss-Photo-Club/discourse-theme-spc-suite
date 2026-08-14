import Component from "@glimmer/component";
import { action } from "@ember/object";
import { service } from "@ember/service";
import DButton from "discourse/components/d-button";
import DiscourseURL from "discourse/lib/url";
import { i18n } from "discourse-i18n";

// The friendly profile page behind /profile-setup: the four fields worth
// asking a new member for (photo, website, location, bio), prefilled from and
// saved to the real Discourse profile. It replaces nothing — /my/preferences
// remains the full editor — it is just the page onboarding sends people to
// instead.
//
// Not built on lib/spc-submit-base: that class's whole body is "compose a
// topic and POST it to /posts.json", and this form creates no topic. The
// only thing the two would share is a login gate.

export default class SpcProfileSetup extends Component {
  @service currentUser;

  @action
  goToLogin() {
    DiscourseURL.routeTo("/login");
  }

  <template>
    <div class="spc-profile-setup">
      <div class="spc-profile-setup__card">
        <header class="spc-profile-setup__header">
          <h1>{{i18n (themePrefix "profile_setup.heading")}}</h1>
          <p class="spc-profile-setup__lead">
            {{i18n (themePrefix "profile_setup.lead")}}
          </p>
        </header>

        {{#if this.currentUser}}
          {{! Fields arrive in the next step. }}
        {{else}}
          <div class="spc-profile-setup__login">
            <p>{{i18n (themePrefix "profile_setup.login_required")}}</p>
            <DButton
              @translatedLabel={{i18n (themePrefix "form.login_button")}}
              @action={{this.goToLogin}}
              class="btn-primary"
            />
          </div>
        {{/if}}
      </div>
    </div>
  </template>
}
