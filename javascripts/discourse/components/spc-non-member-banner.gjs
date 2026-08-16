import Component from "@glimmer/component";
import { service } from "@ember/service";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";
import { isSpcMember } from "../lib/spc-membership";

// With DiscourseConnect on, /login hands straight over to the SSO provider
// (api.swissphotoclub.com/login), which is where the trial actually starts:
// spc-be grants it at first SSO login. Same destination the paywall topic
// (topic 20) uses for its "Anmelden" button.
const LOGIN_PATH = "/login";

export default class SpcNonMemberBanner extends Component {
  @service currentUser;
  @service router;

  get isHomepage() {
    const path = this.router.currentURL?.split("?")[0];

    return path === "/" || path === "/latest";
  }

  get bannerImage() {
    return settings.homepage_banner_image || null;
  }

  get isMember() {
    return isSpcMember(this.currentUser);
  }

  get shouldShow() {
    return this.isHomepage && !this.isMember;
  }

  // Open-trial launch mode. Only a logged-out visitor gets the trial
  // invitation: logging in is what starts the trial, so for them the promise
  // is true. A signed-in non-member has already logged in without receiving
  // access (ineligible or expired), so they keep the membership CTA.
  get isTrialInvitation() {
    return Boolean(settings.nonmember_trial_mode) && !this.currentUser;
  }

  get trialDays() {
    return parseInt(settings.nonmember_trial_days, 10) || 0;
  }

  get eyebrow() {
    return this.isTrialInvitation
      ? i18n(themePrefix("nonmember_banner.trial.eyebrow"))
      : i18n(themePrefix("nonmember_banner.eyebrow"));
  }

  get description() {
    if (!this.isTrialInvitation) {
      return i18n(themePrefix("nonmember_banner.description"));
    }

    // 0 means "do not quote a length": trial_days is per country in spc-be
    // and a logged-out visitor's country is unknown here.
    if (this.trialDays > 0) {
      return i18n(themePrefix("nonmember_banner.trial.description_with_days"), {
        count: this.trialDays,
      });
    }

    return i18n(themePrefix("nonmember_banner.trial.description"));
  }

  get primaryLabel() {
    return this.isTrialInvitation
      ? i18n(themePrefix("nonmember_banner.trial.login"))
      : i18n(themePrefix("nonmember_banner.join"));
  }

  get primaryUrl() {
    return this.isTrialInvitation ? LOGIN_PATH : this.joinUrl;
  }

  get joinUrl() {
    const locale = document.documentElement.lang?.toLowerCase() || "de";

    if (locale.startsWith("fr")) {
      return settings.nonmember_join_url_fr;
    }

    if (locale.startsWith("en")) {
      return settings.nonmember_join_url_en;
    }

    return settings.nonmember_join_url_de;
  }

  <template>
    {{#if this.shouldShow}}
      <section
        class="spc-hero spc-hero--invitation spc-non-member-banner"
        aria-labelledby="spc-non-member-banner-title"
      >
        {{#if this.bannerImage}}
          <img
            class="spc-non-member-banner__image"
            src={{this.bannerImage}}
            alt=""
          />
        {{/if}}

        <div class="spc-non-member-banner__overlay" aria-hidden="true"></div>

        <div class="spc-non-member-banner__content">
          <p class="spc-eyebrow spc-non-member-banner__eyebrow">
            {{this.eyebrow}}
          </p>

          <h1
            id="spc-non-member-banner-title"
            class="spc-non-member-banner__title"
          >
            {{i18n (themePrefix "nonmember_banner.title")}}
          </h1>

          <p class="spc-non-member-banner__description">
            {{this.description}}
          </p>

          <div class="spc-non-member-banner__actions">
            <a
              class="spc-non-member-banner__button spc-non-member-banner__button--primary"
              href={{this.primaryUrl}}
            >
              {{this.primaryLabel}}
            </a>

            {{#if settings.nonmember_show_categories_button}}
              <a
                class="spc-non-member-banner__button spc-non-member-banner__button--secondary"
                href={{settings.nonmember_categories_url}}
              >
                {{i18n (themePrefix "nonmember_banner.browse_categories")}}
              </a>
            {{/if}}
          </div>
        </div>
      </section>
    {{/if}}
  </template>
}
