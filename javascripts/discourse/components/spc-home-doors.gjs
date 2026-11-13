import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";
import { openRoundSummary } from "../api-initializers/spc-monthly-challenge";

function t(key, options) {
  return i18n(themePrefix(`homepage.doors.${key}`), options);
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

/**
 * The homepage's three doors (Phase E): Photo Feedback, Monthly Challenge,
 * Introduce Yourself, each one clickable box, then a line of plain links to
 * the other categories. Replaces the "Popular categories" grid.
 *
 * Names and URLs come from the live categories, so admin renames and slug
 * changes are followed. The challenge line comes from the challenge module's
 * cached listing, fetched only once the doors are in the DOM.
 */
export default class SpcHomeDoors extends Component {
  @service router;

  @tracked round = null;

  get isHomepage() {
    const path = this.router.currentURL?.split("?")[0];

    return path === "/" || path === "/latest";
  }

  get doorIds() {
    return [
      settings.critique_category_id,
      settings.challenge_category_id,
      settings.critique_intro_category_id,
    ].map(Number);
  }

  get challengeLine() {
    if (!this.round?.theme) {
      return t("challenge");
    }
    const line = this.round.month
      ? t("challenge_round", {
          month: capitalize(this.round.month),
          theme: this.round.theme,
        })
      : this.round.theme;
    return this.round.daysLeft ? `${line} · ${this.round.daysLeft}` : line;
  }

  get doors() {
    const [feedbackId, challengeId, introId] = this.doorIds;
    return [
      { id: feedbackId, line: t("feedback") },
      {
        id: challengeId,
        line: this.challengeLine,
        href: this.round?.url,
      },
      { id: introId, line: t("intro") },
    ]
      .map((door) => {
        const category = Category.findById(door.id);
        return category
          ? { ...door, name: category.name, href: door.href || category.url }
          : null;
      })
      .filter(Boolean);
  }

  get moreLinks() {
    const doorIds = new Set(this.doorIds);
    return String(settings.homepage_secondary_categories || "")
      .split("|")
      .map(Number)
      .filter((id) => id > 0 && !doorIds.has(id))
      .map((id) => Category.findById(id))
      .filter(Boolean);
  }

  @action
  async loadRound() {
    const round = await openRoundSummary();
    if (round && !this.isDestroying) {
      this.round = round;
    }
  }

  <template>
    {{#if this.isHomepage}}
      <nav
        class="spc-home-doors"
        aria-label={{t "aria"}}
        {{didInsert this.loadRound}}
      >
        <div class="spc-home-doors__list">
          {{#each this.doors as |door|}}
            <a class="spc-home-doors__door" href={{door.href}}>
              <strong class="spc-home-doors__name">{{door.name}}</strong>
              <span class="spc-home-doors__line">{{door.line}}</span>
            </a>
          {{/each}}
        </div>

        {{#if this.moreLinks.length}}
          <p class="spc-home-doors__more">
            <span>{{t "more"}}</span>
            {{#each this.moreLinks as |category|}}
              <a href={{category.url}}>{{category.name}}</a>
            {{/each}}
          </p>
        {{/if}}
      </nav>
    {{/if}}
  </template>
}
