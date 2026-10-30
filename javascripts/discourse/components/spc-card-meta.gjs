import Component from "@glimmer/component";
import { i18n } from "discourse-i18n";

// The author and the one number on a gallery card (Phase B, recommendation
// #6), rendered through core's topic-list-main-link-bottom outlet so nothing
// is written into a row core owns. Sits in .link-bottom-line beside the tag
// that serves as the context chip; topic-cards.scss orders the three and
// hides this everywhere but masonry lists.
//
// The number means what the place means: votes on the Monthly Challenge,
// critiques on Photo Feedback, welcomes on Introduce Yourself, replies
// elsewhere — keyed by the topic's own category, so a homepage row reads the
// same as the category it came from.
export default class SpcCardMeta extends Component {
  get topic() {
    return this.args.outletArgs?.topic;
  }

  get author() {
    const user = this.topic?.posters?.[0]?.user;
    return user?.name || user?.username || "";
  }

  get count() {
    const topic = this.topic;
    const categoryId = Number(topic?.category_id);
    if (categoryId === Number(settings.challenge_category_id)) {
      return { key: "votes", value: Number(topic.vote_count) || 0 };
    }
    const value = Math.max(0, (Number(topic?.posts_count) || 1) - 1);
    if (categoryId === Number(settings.critique_category_id)) {
      return { key: "critiques", value };
    }
    if (categoryId === Number(settings.critique_intro_category_id)) {
      return { key: "welcomes", value };
    }
    return { key: "replies", value };
  }

  get countLabel() {
    const { key, value } = this.count;
    return i18n(themePrefix(`card.${key}`), { count: value });
  }

  get countIsZero() {
    return this.count.value === 0;
  }

  <template>
    {{#if this.topic}}
      <span class="spc-card-meta">
        {{#if this.author}}
          <span class="spc-card-meta__author">{{this.author}}</span>
        {{/if}}
        <span
          class="spc-card-meta__num {{if this.countIsZero '-zero'}}"
        >{{this.countLabel}}</span>
      </span>
    {{/if}}
  </template>
}
