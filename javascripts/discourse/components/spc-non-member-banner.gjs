import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";
import { fetchWinners } from "../api-initializers/spc-monthly-challenge";
import { isSpcMember } from "../lib/spc-membership";

// With DiscourseConnect on, /login hands straight over to the SSO provider
// (api.swissphotoclub.com/login), which is where the trial actually starts:
// spc-be grants it at first SSO login. Same destination the paywall topic
// (topic 20) uses for its "Anmelden" button.
const LOGIN_PATH = "/login";

// The advantages row under the banner (Phase E). Each claim was confirmed by
// Oğuzhan before it went live (13 November 2026); do not add one without
// that. Icons are inline SVG, so none has to be declared in about.json.
const ADVANTAGES = [
  { key: "critique", path: "M4 5h16v11H8l-4 4z" },
  {
    key: "meetups",
    path: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  },
  {
    key: "languages",
    path: "M3 5h12M9 3v2m-4 0c1 4 4 7 8 8M5 13c3-1 6-4 7-8M13 21l4-9 4 9m-7-3h6",
  },
  { key: "rights", path: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4" },
];

export default class SpcNonMemberBanner extends Component {
  @service currentUser;
  @service router;

  // The newest winner-tagged challenge entry (Phase E). Fetched only once the
  // banner is in the DOM, through the challenge module's cached promise, so a
  // non-homepage route never asks and the challenge band shares the request.
  @tracked winner = null;

  get isHomepage() {
    const path = this.router.currentURL?.split("?")[0];

    return path === "/" || path === "/latest";
  }

  @action
  async loadWinner() {
    const winner = (await fetchWinners())[0];
    if (winner?.image && !this.isDestroying) {
      this.winner = winner;
    }
  }

  get photoCredit() {
    return i18n(themePrefix("nonmember_banner.photo_credit"), {
      title: this.winner.title,
      author: this.winner.author,
    });
  }

  get advantages() {
    return ADVANTAGES.map(({ key, path }) => ({
      path,
      title: i18n(themePrefix(`nonmember_banner.advantages.${key}.title`)),
      body: i18n(themePrefix(`nonmember_banner.advantages.${key}.body`)),
    }));
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

  // The join page lives on swissphotoclub.com; the visitor keeps the
  // community open behind it. /login stays in the same tab.
  get primaryTarget() {
    return this.isTrialInvitation ? null : "_blank";
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
        {{didInsert this.loadWinner}}
      >
        {{#if this.winner}}
          <img
            class="spc-non-member-banner__image"
            src={{this.winner.image}}
            alt=""
          />
          <p class="spc-non-member-banner__credit">{{this.photoCredit}}</p>
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
              target={{this.primaryTarget}}
              rel={{if this.primaryTarget "noopener"}}
            >
              {{this.primaryLabel}}
            </a>
          </div>
        </div>
      </section>

      <ul
        class="spc-home-advantages"
        aria-label={{i18n (themePrefix "nonmember_banner.advantages_label")}}
      >
        {{#each this.advantages as |item|}}
          <li class="spc-home-advantages__item">
            <svg
              class="spc-home-advantages__icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
            ><path d={{item.path}} /></svg>
            <strong>{{item.title}}</strong>
            <span>{{item.body}}</span>
          </li>
        {{/each}}
      </ul>
    {{/if}}
  </template>
}
