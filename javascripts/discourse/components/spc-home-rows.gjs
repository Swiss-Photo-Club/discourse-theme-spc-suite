import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";
import {
  fetchChallengeCategoryListing,
  findRoundTag,
  openRoundSummary,
  tagSlug,
} from "../api-initializers/spc-monthly-challenge";
import { isCategoriesHome } from "../lib/spc-home";
import {
  categoryListing,
  photoCard,
  usersById,
} from "../lib/spc-photo-cards";

const CARDS_PER_ROW = 5;

function t(key, options) {
  return i18n(themePrefix(`homepage.rows.${key}`), options);
}

function newestWithPhoto(topics) {
  return topics
    .filter((topic) => topic.image_url && !topic.pinned && !topic.unpinned)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, CARDS_PER_ROW);
}

/**
 * The Categories tab's rows (Phase E): newest Photo Feedback photos, the open
 * round's newest entries, newest introductions. Each row is the "Needs
 * feedback" strip's card markup (lib/spc-photo-cards.js), and Discourse's own
 * category list is hidden while the rows are present. Our own markup only:
 * this page has no masonry list to disturb.
 *
 * Requests: the challenge listing is the one the Monthly Challenge door
 * already fetched; the other two go through the shared category-listing
 * cache. All three only once the rows are in the DOM.
 */
export default class SpcHomeRows extends Component {
  @service router;

  @tracked rows = [];

  get shouldShow() {
    return isCategoriesHome(this.router);
  }

  row(categoryId, title, cards, href) {
    const category = Category.findById(categoryId);
    if (!category || !cards.length) {
      return null;
    }
    return {
      key: categoryId,
      eyebrow: category.name,
      title,
      cards,
      href: href || category.url,
    };
  }

  async feedbackRow() {
    const id = Number(settings.critique_category_id);
    const data = await categoryListing(id);
    const users = usersById(data);
    const cards = newestWithPhoto(data?.topic_list?.topics || []).map(
      (topic) => photoCard(topic, users)
    );
    return this.row(id, t("feedback"), cards);
  }

  async challengeRow() {
    const id = Number(settings.challenge_category_id);
    const [round, data] = await Promise.all([
      openRoundSummary(),
      fetchChallengeCategoryListing(),
    ]);
    if (!round?.tagSlug) {
      return null;
    }
    const users = usersById(data);
    const entries = (data?.topic_list?.topics || []).filter(
      (topic) => tagSlug(findRoundTag(topic.tags)) === round.tagSlug
    );
    const cards = newestWithPhoto(entries).map((topic) =>
      photoCard(topic, users)
    );
    return this.row(
      id,
      t("challenge", { theme: round.theme }),
      cards,
      round.url
    );
  }

  async introductionsRow() {
    const id = Number(settings.critique_intro_category_id);
    const data = await categoryListing(id);
    const users = usersById(data);
    const cards = newestWithPhoto(data?.topic_list?.topics || []).map(
      (topic) => photoCard(topic, users)
    );
    return this.row(id, t("introductions"), cards);
  }

  @action
  async loadRows() {
    const rows = await Promise.all(
      [this.feedbackRow(), this.challengeRow(), this.introductionsRow()].map(
        (promise) => promise.catch(() => null)
      )
    );
    if (!this.isDestroying) {
      this.rows = rows.filter(Boolean);
    }
  }

  <template>
    {{#if this.shouldShow}}
      <div class="spc-home-rows" {{didInsert this.loadRows}}>
        {{#each this.rows key="key" as |row|}}
          <section class="spc-home-row" aria-label={{row.title}}>
            <div class="spc-home-row__head">
              <div>
                <span class="spc-home-row__eyebrow">{{row.eyebrow}}</span>
                <h2 class="spc-home-row__title">{{row.title}}</h2>
              </div>
              <a class="spc-home-row__all" href={{row.href}}>
                {{t "see_all"}}
              </a>
            </div>
            <div class="spc-needs-feedback__row spc-home-row__cards">
              {{#each row.cards as |card|}}
                <a class="spc-needs-feedback__card" href={{card.href}}>
                  <img src={{card.image}} alt="" loading="lazy" />
                  <span class="spc-needs-feedback__title">{{card.title}}</span>
                  <span class="spc-needs-feedback__by">{{card.by}}</span>
                </a>
              {{/each}}
            </div>
          </section>
        {{/each}}
      </div>
    {{/if}}
  </template>
}
