import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn, hash } from "@ember/helper";
import { action } from "@ember/object";
import { service } from "@ember/service";
import ConditionalLoadingSpinner from "discourse/components/conditional-loading-spinner";
import DButton from "discourse/components/d-button";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import { exportUserArchive } from "discourse/lib/export-csv";
import DiscourseURL, { userPath } from "discourse/lib/url";
import { i18n } from "discourse-i18n";
import {
  manageMembershipUrl,
  membershipJoinUrl,
  membershipStatus,
  websiteAccountUrl,
} from "../lib/spc-membership";
import SpcAccountClosure from "./spc-account-closure";
import SpcProfileSetup from "./spc-profile-setup";

// The three interface languages the club speaks. Saved as the user's own
// `locale`; spc-be's DiscourseConnect payload carries no locale, so a choice
// made here is not overwritten at the next sign-in.
const LANGUAGES = [
  { id: "de", name: "Deutsch" },
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
];

// /my-account (recommendations 1, 2 and 4 of docs/settings-recommendations
// .html): the private front door to the member's settings. Every card reads
// and writes what Discourse already stores; the native preferences stay one
// "All settings" link away (?full=1 gets past the takeover in
// api-initializers/spc-profile-setup.js). The public-profile card is the
// /profile-setup form itself, embedded; /profile-setup stays as the focused
// page onboarding links to.
export default class SpcMyAccount extends Component {
  @service currentUser;
  @service dialog;
  @service siteSettings;

  @tracked loading = true;
  @tracked user = null;
  @tracked savingLocale = null;
  @tracked error = null;

  constructor() {
    super(...arguments);
    if (this.currentUser) {
      this.load();
    }
  }

  async load() {
    try {
      // A user always sees their own email and their own admin-only user
      // fields (the #12 membership fields) in this payload.
      const { user } = await ajax(
        userPath(`${this.currentUser.username_lower}.json`)
      );
      this.user = user;
    } catch (e) {
      this.error = extractError(e);
    } finally {
      this.loading = false;
    }
  }

  get membership() {
    return membershipStatus(this.currentUser, this.user?.user_fields);
  }

  get isMember() {
    return this.membership.state === "member";
  }

  get isTrial() {
    return this.membership.state === "trial";
  }

  get manageUrl() {
    return manageMembershipUrl();
  }

  get joinUrl() {
    return membershipJoinUrl();
  }

  get websiteAccountUrl() {
    return websiteAccountUrl();
  }

  get allSettingsUrl() {
    return userPath(
      `${this.currentUser.username_lower}/preferences/account?full=1`
    );
  }

  get currentLocale() {
    return (this.user?.locale || this.siteSettings.default_locale || "de")
      .split(/[-_]/)[0];
  }

  get languages() {
    return LANGUAGES.map((language) => ({
      ...language,
      active: language.id === this.currentLocale,
      saving: language.id === this.savingLocale,
    }));
  }

  @action
  goToLogin() {
    DiscourseURL.routeTo("/login");
  }

  // Core's interface page reloads after a locale change too: every string
  // already rendered is in the old language until the bundle is fetched again.
  @action
  async setLocale(locale) {
    if (locale === this.currentLocale) {
      return;
    }
    this.savingLocale = locale;
    this.error = null;
    try {
      await ajax(userPath(`${this.currentUser.username_lower}.json`), {
        type: "PUT",
        data: { locale },
      });
      window.location.reload();
    } catch (e) {
      this.error = extractError(e);
      this.savingLocale = null;
    }
  }

  // Same confirm-then-export the native Account tab does.
  @action
  downloadData() {
    this.dialog.yesNoConfirm({
      message: i18n("user.download_archive.confirm"),
      didConfirm: () => exportUserArchive(),
    });
  }

  <template>
    <div class="spc-my-account">
      <header class="spc-my-account__header">
        <div>
          <h1>{{i18n (themePrefix "my_account.heading")}}</h1>
          <p class="spc-my-account__lead">
            {{i18n (themePrefix "my_account.lead")}}
          </p>
        </div>
        {{#if this.currentUser}}
          <a class="spc-my-account__all-settings" href={{this.allSettingsUrl}}>
            {{i18n (themePrefix "my_account.all_settings")}}
          </a>
        {{/if}}
      </header>

      {{#if this.currentUser}}
        <ConditionalLoadingSpinner @condition={{this.loading}}>
          {{#if this.error}}
            <div class="alert alert-error">{{this.error}}</div>
          {{/if}}

          <section
            class="spc-my-account__card spc-membership-status spc-membership-status--{{this.membership.state}}"
          >
            <h2 class="spc-membership-status__heading">
              {{i18n (themePrefix "membership.heading")}}
            </h2>
            <dl class="spc-membership-status__rows">
              <div>
                <dt>{{i18n (themePrefix "membership.status")}}</dt>
                <dd>{{this.membership.status}}</dd>
              </div>
              {{#each this.membership.rows as |row|}}
                <div>
                  <dt>{{row.label}}</dt>
                  <dd>{{row.value}}</dd>
                </div>
              {{/each}}
            </dl>
            {{#if this.isMember}}
              {{#if this.manageUrl}}
                <a class="spc-membership-status__manage" href={{this.manageUrl}}>
                  {{i18n (themePrefix "membership.manage")}}
                </a>
              {{/if}}
            {{else}}
              <p class="spc-my-account__text">
                {{#if this.isTrial}}
                  {{i18n (themePrefix "my_account.trial_body")}}
                {{else}}
                  {{i18n (themePrefix "my_account.none_body")}}
                {{/if}}
              </p>
              {{#if this.joinUrl}}
                <a class="btn btn-primary" href={{this.joinUrl}}>
                  {{i18n (themePrefix "my_account.become_member")}}
                </a>
              {{/if}}
            {{/if}}
          </section>

          <SpcProfileSetup @embedded={{true}} />

          <section class="spc-my-account__card">
            <h2>{{i18n (themePrefix "my_account.language_heading")}}</h2>
            <div
              class="spc-my-account__languages"
              role="group"
              aria-label={{i18n (themePrefix "my_account.language_heading")}}
            >
              {{#each this.languages as |language|}}
                <DButton
                  @translatedLabel={{language.name}}
                  @action={{fn this.setLocale language.id}}
                  @isLoading={{language.saving}}
                  @disabled={{this.savingLocale}}
                  aria-pressed={{if language.active "true" "false"}}
                  class={{if language.active "btn-primary" "btn-default"}}
                />
              {{/each}}
            </div>
            <p class="spc-my-account__text">
              {{i18n (themePrefix "my_account.language_hint")}}
            </p>
          </section>

          <section class="spc-my-account__card">
            <h2>{{i18n (themePrefix "my_account.signin_heading")}}</h2>
            <dl class="spc-membership-status__rows">
              <div>
                <dt>{{i18n (themePrefix "my_account.email")}}</dt>
                <dd>{{this.user.email}}</dd>
              </div>
              <div>
                <dt>{{i18n (themePrefix "my_account.password")}}</dt>
                <dd>{{i18n (themePrefix "my_account.password_value")}}</dd>
              </div>
            </dl>
            <p class="spc-my-account__text">
              {{i18n (themePrefix "my_account.signin_body")}}
            </p>
            <div class="spc-my-account__actions">
              {{#if this.websiteAccountUrl}}
                <a href={{this.websiteAccountUrl}}>
                  {{i18n (themePrefix "my_account.change_on_website")}}
                </a>
              {{/if}}
              <DButton
                @icon="download"
                @translatedLabel={{i18n (themePrefix "my_account.download_data")}}
                @action={{this.downloadData}}
                class="btn-default"
              />
            </div>
            <SpcAccountClosure @outletArgs={{hash model=this.currentUser}} />
          </section>
        </ConditionalLoadingSpinner>
      {{else}}
        <div class="spc-my-account__card">
          <p>{{i18n (themePrefix "my_account.login_required")}}</p>
          <DButton
            @translatedLabel={{i18n (themePrefix "form.login_button")}}
            @action={{this.goToLogin}}
            class="btn-primary"
          />
        </div>
      {{/if}}
    </div>
  </template>
}
