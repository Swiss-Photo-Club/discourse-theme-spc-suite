import Component from "@glimmer/component";
import { service } from "@ember/service";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";

export default class SpcNonMemberBanner extends Component {
  @service currentUser;
  @service router;

  get isHomepage() {
    return this.router.currentURL?.split("?")[0] === "/";
  }

  get isMember() {
    if (Object.hasOwn(settings, "user_in_nonmember_member_groups")) {
      return settings.user_in_nonmember_member_groups;
    }

    if (!this.currentUser) {
      return false;
    }

    const memberGroupIds = String(settings.nonmember_member_groups || "")
      .split("|")
      .filter(Boolean)
      .map(Number);

    return (this.currentUser.groups || []).some((group) =>
      memberGroupIds.includes(group.id)
    );
  }

  get shouldShow() {
    return this.isHomepage && !this.isMember;
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
        <div class="spc-non-member-banner__content">
          <p class="spc-eyebrow spc-non-member-banner__eyebrow">
            {{i18n (themePrefix "nonmember_banner.eyebrow")}}
          </p>

          <h1
            id="spc-non-member-banner-title"
            class="spc-non-member-banner__title"
          >
            {{i18n (themePrefix "nonmember_banner.title")}}
          </h1>

          <p class="spc-non-member-banner__description">
            {{i18n (themePrefix "nonmember_banner.description")}}
          </p>

          <div class="spc-non-member-banner__actions">
            <a
              class="spc-non-member-banner__button spc-non-member-banner__button--primary"
              href={{this.joinUrl}}
            >
              {{i18n (themePrefix "nonmember_banner.join")}}
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
