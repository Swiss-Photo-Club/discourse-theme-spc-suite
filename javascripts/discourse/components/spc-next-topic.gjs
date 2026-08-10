import Component from "@glimmer/component";
import { action } from "@ember/object";
import DButton from "discourse/components/d-button";
import DiscourseURL from "discourse/lib/url";
import i18n from "discourse-common/helpers/i18n";

// "Next topic" above the post stream on critique-category topics, mirroring
// NPN's flow of moving through the critique queue. The candidate comes from
// the topic's own suggested_topics payload - already in the topic response,
// so no extra request - filtered to the same category so the queue stays
// within the critique category. suggested_topics is tracked on the model and
// arrives with the topic, so the getter chain re-renders when it lands.
export default class SpcNextTopic extends Component {
  get topic() {
    return this.args.outletArgs?.model;
  }

  get enabledCategories() {
    return (settings.workspace_enabled_categories || "")
      .toString()
      .split("|")
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id));
  }

  get nextTopic() {
    const topic = this.topic;
    if (!topic?.category_id) {
      return null;
    }
    if (
      this.enabledCategories.length &&
      !this.enabledCategories.includes(topic.category_id)
    ) {
      return null;
    }
    return (
      (topic.suggestedTopics || []).find(
        (candidate) => candidate.category_id === topic.category_id
      ) || null
    );
  }

  @action
  goToNext() {
    DiscourseURL.routeTo(this.nextTopic.url);
  }

  <template>
    {{#if this.nextTopic}}
      <div class="spc-next-topic">
        <DButton
          @icon="chevron-right"
          @action={{this.goToNext}}
          @translatedLabel={{i18n (themePrefix "critique_workspace.next_topic")}}
          class="spc-next-topic__button"
        />
      </div>
    {{/if}}
  </template>
}
