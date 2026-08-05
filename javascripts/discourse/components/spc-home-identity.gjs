import Component from "@glimmer/component";
import { service } from "@ember/service";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";

const SUPPORTED_LANGUAGES = ["de", "en", "fr"];

export default class SpcHomeIdentity extends Component {
  @service router;

  get isHomepage() {
    const path = this.router.currentURL?.split("?")[0];

    return path === "/" || path === "/latest";
  }

  get bannerImage() {
    return settings.homepage_banner_image || null;
  }

  get language() {
    const language = document.documentElement.lang
      ?.toLowerCase()
      .split("-")[0];

    return SUPPORTED_LANGUAGES.includes(language) ? language : "de";
  }

  get readMoreUrl() {
    return (
      settings[`homepage_about_url_${this.language}`] ||
      settings.homepage_about_url_de ||
      null
    );
  }

  <template>
    {{#if this.isHomepage}}
      <div class="spc-home-surface">
        <section
          class="spc-home-identity"
          aria-labelledby="spc-home-identity-title"
        >
          {{#if this.bannerImage}}
            <img
              class="spc-home-identity__image"
              src={{this.bannerImage}}
              alt=""
            />
          {{/if}}

          <div class="spc-home-identity__overlay" aria-hidden="true"></div>

          <div class="spc-home-identity__content">
            <p class="spc-eyebrow spc-home-identity__eyebrow">
              {{i18n (themePrefix "homepage.identity.eyebrow")}}
            </p>

            <h1
              id="spc-home-identity-title"
              class="spc-home-identity__title"
            >
              {{i18n (themePrefix "homepage.identity.title")}}
            </h1>

            <p class="spc-home-identity__tagline">
              {{i18n (themePrefix "homepage.identity.tagline")}}
            </p>
          </div>
        </section>

        <section
          class="spc-home-introduction"
          aria-label={{i18n (themePrefix "homepage.introduction.label")}}
        >
          <p>{{i18n (themePrefix "homepage.introduction.body")}}</p>

          {{#if this.readMoreUrl}}
            <a href={{this.readMoreUrl}}>
              {{i18n (themePrefix "homepage.introduction.read_more")}}
            </a>
          {{/if}}
        </section>
      </div>
    {{/if}}
  </template>
}
