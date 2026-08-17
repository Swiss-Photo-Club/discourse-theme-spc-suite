import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";
import {
  clearPinnedBriefCache,
  clearWinnerCache,
  fetchChallengeCategoryTopics,
  findRoundTag,
  tagName,
  tagPageUrl,
  tagSlug,
  WINNER_TAG,
} from "../api-initializers/spc-monthly-challenge";
import { currentMonthYM } from "../lib/spc-submit-helpers";

// The staff panel that turns the monthly routine into buttons: see the round's
// status at a glance, crown the winner from a votes-ranked list, and start the
// next round from one form — tag creation, brief post, pin and unpin included.
//
// Everything goes through Discourse's own authenticated ajax, so it can do
// nothing its user could not do through the stock admin menus; it only saves
// the hunt for them. Members never render any of this: the whole template is
// behind a staff check.

function t(key, options) {
  return i18n(themePrefix(`monthly_challenge.admin.${key}`), options);
}

function briefSlugUrl(topic) {
  return topic?.slug
    ? `/t/${encodeURIComponent(topic.slug)}/${topic.id}`
    : `/t/${topic?.id}`;
}

// Round tags are ASCII slugs; fold the umlauts and accents German and French
// theme names actually contain, then drop the rest.
function kebab(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[äàâ]/g, "a")
    .replace(/[öôò]/g, "o")
    .replace(/[üùû]/g, "u")
    .replace(/[éèêë]/g, "e")
    .replace(/[îï]/g, "i")
    .replace(/ç/g, "c")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextYM(ym) {
  const [y, m] = ym.split("-").map(Number);
  const rolled = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${rolled[0]}-${String(rolled[1]).padStart(2, "0")}`;
}

function monthLabelOf(ym) {
  const [y, m] = ym.split("-").map(Number);
  try {
    return new Intl.DateTimeFormat(document.documentElement.lang || "en", {
      month: "long",
      year: "numeric",
      timeZone: settings.challenge_timezone || "Europe/Zurich",
    }).format(new Date(Date.UTC(y, m - 1, 15)));
  } catch {
    return ym;
  }
}

function lastDayLabelOf(ym) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  try {
    return new Intl.DateTimeFormat(document.documentElement.lang || "en", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: settings.challenge_timezone || "Europe/Zurich",
    }).format(new Date(Date.UTC(y, m - 1, lastDay, 12)));
  } catch {
    return ym;
  }
}

export default class SpcChallengeAdmin extends Component {
  @service router;
  @service currentUser;
  @service dialog;

  @tracked loading = false;
  @tracked busy = false;
  @tracked error = null;
  @tracked notice = null;

  // Round status, from one category-listing fetch.
  @tracked roundBrief = null; // newest pinned-for-site round brief
  @tracked stalePinned = []; // older briefs still pinned
  @tracked unpinnedBrief = null; // newest round topic when nothing is pinned
  @tracked entries = [];

  // Start-a-new-round form.
  @tracked formMonth = "";
  @tracked formTitle = "";
  @tracked formSummary = "";
  @tracked formTask = "";
  @tracked formIdeas = "";
  @tracked formBonus = "";
  @tracked formUpload = null;

  get categoryId() {
    return Number(settings.challenge_category_id);
  }

  get visible() {
    if (!this.currentUser?.staff) {
      return false;
    }
    const route = this.router.currentRoute;
    if (!route?.name?.startsWith("discovery.")) {
      return false;
    }
    const path = String(route.params?.category_slug_path_with_id || "");
    const parts = path.split("/");
    return Number(parts[parts.length - 1]) === this.categoryId;
  }

  get roundTag() {
    return tagName(findRoundTag(this.roundBrief?.tags));
  }

  get suggestedMonth() {
    const current = currentMonthYM();
    return this.roundTag.startsWith(current) ? nextYM(current) : current;
  }

  get effectiveMonth() {
    return this.formMonth || this.suggestedMonth;
  }

  get monthOptions() {
    const current = currentMonthYM();
    return [current, nextYM(current)].map((ym) => ({
      value: ym,
      label: monthLabelOf(ym),
      selected: ym === this.effectiveMonth,
    }));
  }

  get hasCrownedEntry() {
    return this.entries.some((entry) => entry.crowned);
  }

  get uploaderImageUrl() {
    return this.formUpload?.url;
  }

  @action
  async refresh(event) {
    if (this.loading) {
      return;
    }
    // didInsert shares the initializer's in-flight request. An explicit click
    // is a real refresh and must replace the cached listing first.
    if (event?.type === "click") {
      clearPinnedBriefCache();
    }
    this.loading = true;
    this.error = null;
    try {
      const topics = await fetchChallengeCategoryTopics();
      const byRoundDesc = (a, b) =>
        tagName(findRoundTag(b.tags)).localeCompare(
          tagName(findRoundTag(a.tags))
        );
      const roundTopics = topics
        .filter((topic) => findRoundTag(topic.tags))
        .sort(byRoundDesc);
      // pinned || unpinned: Discourse auto-unpins per user once a pinned topic
      // has been read to the bottom; unpinned marks that per-user state. Same
      // rule as the initializer's brief detection.
      const briefs = roundTopics.filter(
        (topic) => topic.pinned || topic.unpinned
      );
      this.roundBrief = briefs[0] || null;
      this.stalePinned = briefs.slice(1);
      this.unpinnedBrief = this.roundBrief ? null : roundTopics[0] || null;
      await this.loadEntries();
    } catch (e) {
      this.error = extractError(e);
    } finally {
      this.loading = false;
    }
  }

  async loadEntries() {
    const roundTag = findRoundTag(this.roundBrief?.tags);
    const roundTagSlug = tagSlug(roundTag);
    if (!roundTagSlug) {
      this.entries = [];
      return;
    }
    const slug = Category.findById(this.categoryId)?.slug;
    const categoryPath = slug
      ? `${slug}/${this.categoryId}`
      : `${this.categoryId}`;
    const data = await ajax(
      `/tags/c/${categoryPath}/${encodeURIComponent(roundTagSlug)}.json?order=votes`
    );
    // Top five only — enough to judge a tie, without turning the panel into
    // a second gallery. The votes page linked below has the rest.
    this.entries = (data?.topic_list?.topics || [])
      .filter((topic) => topic.id !== this.roundBrief?.id)
      .slice(0, 5)
      .map((topic) => {
        // Mutation endpoints need canonical tag values too. Sending the
        // localized label would otherwise fail (or create a duplicate tag)
        // when staff crown an entry from a translated interface.
        const names = (topic.tags || []).map(tagSlug);
        return {
          id: topic.id,
          slug: topic.slug,
          title: topic.title || topic.fancy_title || "",
          url: briefSlugUrl(topic),
          image: topic.image_url || "",
          votes: Number(topic.vote_count) || 0,
          tagNames: names,
          crowned: names.includes(WINNER_TAG),
        };
      });
  }

  get votesPageUrl() {
    const roundTag = findRoundTag(this.roundBrief?.tags);
    return roundTag ? `${tagPageUrl(roundTag)}?order=votes` : "";
  }

  afterChange() {
    clearPinnedBriefCache();
    clearWinnerCache();
    return this.refresh();
  }

  @action
  crown(entry) {
    this.dialog.yesNoConfirm({
      message: t("crown_confirm", { title: entry.title }),
      didConfirm: async () => {
        await this.runAction(async () => {
          await ajax(`/t/-/${entry.id}.json`, {
            type: "PUT",
            data: { tags: [...entry.tagNames, WINNER_TAG] },
          });
          this.notice = { text: t("crowned_notice", { title: entry.title }) };
        });
      },
    });
  }

  @action
  async uncrown(entry) {
    await this.runAction(async () => {
      await ajax(`/t/-/${entry.id}.json`, {
        type: "PUT",
        data: {
          tags: entry.tagNames.filter((name) => name !== WINNER_TAG),
        },
      });
      this.notice = null;
    });
  }

  @action
  async pinBrief(topic) {
    const roundTagOfTopic = tagName(findRoundTag(topic.tags));
    const until = `${nextYM(roundTagOfTopic.slice(0, 7))}-08`;
    await this.runAction(async () => {
      await ajax(`/t/${topic.id}/status`, {
        type: "PUT",
        data: { status: "pinned", enabled: "true", until },
      });
      this.notice = { text: t("pinned_notice", { title: topic.title }) };
    });
  }

  @action
  async unpinTopic(topic) {
    await this.runAction(async () => {
      await ajax(`/t/${topic.id}/status`, {
        type: "PUT",
        data: { status: "pinned", enabled: "false" },
      });
    });
  }

  @action
  async createRound() {
    if (!this.formTitle.trim()) {
      this.error = t("need_title");
      return;
    }
    if (!this.formSummary.trim()) {
      this.error = t("need_summary");
      return;
    }
    if (!this.formUpload) {
      this.error = t("need_photo");
      return;
    }

    const ym = this.effectiveMonth;
    const roundTagName = `${ym}-${kebab(this.formTitle) || "challenge"}`;

    await this.runAction(async () => {
      // 1. Put the new tag into the round tag group, or the category's tag
      // restriction would reject the brief. The group is found by content —
      // it is the one already holding round-patterned tags — so no setting is
      // needed. Failure here is not fatal: the post attempt below surfaces
      // any real problem.
      try {
        const groups = await ajax("/tag_groups.json");
        const roundGroup = (groups?.tag_groups || []).find((group) =>
          (group.tag_names || []).some((name) => /^\d{4}-\d{2}/.test(name))
        );
        if (roundGroup && !roundGroup.tag_names.includes(roundTagName)) {
          await ajax(`/tag_groups/${roundGroup.id}.json`, {
            type: "PUT",
            data: {
              name: roundGroup.name,
              tag_names: [...roundGroup.tag_names, roundTagName],
              one_per_topic: roundGroup.one_per_topic,
            },
          });
        }
      } catch {
        // fall through; POST /posts.json reports the definitive error
      }

      // 2. The brief itself, from the template sections. Headings are in the
      // admin's current interface language — write the brief in the language
      // members should read, translations come after via post localization.
      const ideas = this.formIdeas
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const raw = [
        `![${this.formUpload.original_filename}](${this.formUpload.short_url})`,
        this.formSummary.trim(),
        this.formTask.trim()
          ? `## ${t("task_heading")}\n\n${this.formTask.trim()}`
          : "",
        ideas.length
          ? `## ${i18n(themePrefix("monthly_challenge.tips_heading"))}\n\n${ideas
              .map((idea) => `- ${idea}`)
              .join("\n")}`
          : "",
        this.formBonus.trim()
          ? `## ${i18n(themePrefix("monthly_challenge.extra_heading"))}\n\n${this.formBonus.trim()}`
          : "",
        `## ${t("rules_heading")}\n\n${t("rules_body", {
          date: lastDayLabelOf(ym),
        })}`,
      ]
        .filter(Boolean)
        .join("\n\n");

      const post = await ajax("/posts.json", {
        type: "POST",
        data: {
          title: this.formTitle.trim(),
          raw,
          category: this.categoryId,
          tags: [roundTagName],
        },
      });

      // 3. Pin the new brief past the round's announcement window, and stand
      // the previous brief down.
      const previousBrief = this.roundBrief;
      await ajax(`/t/${post.topic_id}/status`, {
        type: "PUT",
        data: { status: "pinned", enabled: "true", until: `${nextYM(ym)}-08` },
      });
      if (previousBrief && previousBrief.id !== post.topic_id) {
        await ajax(`/t/${previousBrief.id}/status`, {
          type: "PUT",
          data: { status: "pinned", enabled: "false" },
        });
      }

      this.notice = {
        text: t("created_notice"),
        url: `/t/${post.topic_slug}/${post.topic_id}`,
      };
      this.formMonth = "";
      this.formTitle = "";
      this.formSummary = "";
      this.formTask = "";
      this.formIdeas = "";
      this.formBonus = "";
      this.formUpload = null;
    });
  }

  async runAction(work) {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      await work();
      await this.afterChange();
    } catch (e) {
      this.error = extractError(e);
    } finally {
      this.busy = false;
    }
  }

  @action
  updateMonth(event) {
    this.formMonth = event.target.value;
  }

  @action
  updateField(field, event) {
    this[field] = event.target.value;
  }

  @action
  uploadDone(upload) {
    this.formUpload = upload;
    this.error = null;
  }

  @action
  uploadDeleted() {
    this.formUpload = null;
  }

  <template>
    {{#if this.visible}}
      <section
        class="spc-challenge-admin"
        data-spc-challenge-admin
        {{didInsert this.refresh}}
      >
        <header class="spc-challenge-admin__header">
          <span class="spc-eyebrow">{{i18n
              (themePrefix "monthly_challenge.admin.title")
            }}</span>
          <button
            type="button"
            class="spc-challenge-admin__refresh"
            disabled={{this.loading}}
            {{on "click" this.refresh}}
          >{{i18n (themePrefix "monthly_challenge.admin.refresh")}}</button>
        </header>

        {{#if this.roundBrief}}
          <p class="spc-challenge-admin__status">
            {{i18n
              (themePrefix "monthly_challenge.admin.current_round")
              tag=this.roundTag
            }}
            <a href={{briefSlugUrl this.roundBrief}}>{{this.roundBrief.title}}</a>
          </p>
        {{else if this.unpinnedBrief}}
          <p class="spc-challenge-admin__status spc-challenge-admin__status--warning">
            {{i18n
              (themePrefix "monthly_challenge.admin.unpinned_brief_found")
              title=this.unpinnedBrief.title
            }}
            <button
              type="button"
              class="spc-challenge-admin__button"
              disabled={{this.busy}}
              {{on "click" (fn this.pinBrief this.unpinnedBrief)}}
            >{{i18n (themePrefix "monthly_challenge.admin.pin_brief")}}</button>
          </p>
        {{else}}
          <p class="spc-challenge-admin__status spc-challenge-admin__status--warning">
            {{i18n (themePrefix "monthly_challenge.admin.no_pinned_brief")}}
          </p>
        {{/if}}

        {{#each this.stalePinned as |old|}}
          <p class="spc-challenge-admin__status spc-challenge-admin__status--warning">
            {{i18n
              (themePrefix "monthly_challenge.admin.extra_pinned")
              title=old.title
            }}
            <button
              type="button"
              class="spc-challenge-admin__button"
              disabled={{this.busy}}
              {{on "click" (fn this.unpinTopic old)}}
            >{{i18n (themePrefix "monthly_challenge.admin.unpin")}}</button>
          </p>
        {{/each}}

        {{#if this.error}}
          <p class="spc-challenge-admin__error">{{this.error}}</p>
        {{/if}}
        {{#if this.notice}}
          <p class="spc-challenge-admin__notice">
            {{this.notice.text}}
            {{#if this.notice.url}}
              <a href={{this.notice.url}}>{{i18n
                  (themePrefix "monthly_challenge.admin.open_brief")
                }}</a>
            {{/if}}
          </p>
        {{/if}}

        <details class="spc-challenge-admin__section">
          <summary>{{i18n
              (themePrefix "monthly_challenge.admin.crown_heading")
            }}</summary>
          <p class="spc-challenge-admin__hint">{{i18n
              (themePrefix "monthly_challenge.admin.crown_hint")
            }}</p>
          {{#if this.entries.length}}
            <ol class="spc-challenge-admin__entries">
              {{#each this.entries as |entry|}}
                <li class="spc-challenge-admin__entry">
                  {{#if entry.image}}
                    <a href={{entry.url}} tabindex="-1"><img
                        class="spc-challenge-admin__thumb"
                        src={{entry.image}}
                        alt=""
                        loading="lazy"
                      /></a>
                  {{/if}}
                  <a href={{entry.url}}>{{entry.title}}</a>
                  <span class="spc-challenge-admin__votes">{{i18n
                      (themePrefix "monthly_challenge.admin.votes")
                      count=entry.votes
                    }}</span>
                  {{#if entry.crowned}}
                    <span class="spc-challenge-admin__crowned">{{i18n
                        (themePrefix "monthly_challenge.admin.crowned")
                      }}</span>
                    <button
                      type="button"
                      class="spc-challenge-admin__button"
                      disabled={{this.busy}}
                      {{on "click" (fn this.uncrown entry)}}
                    >{{i18n
                        (themePrefix "monthly_challenge.admin.uncrown")
                      }}</button>
                  {{else}}
                    <button
                      type="button"
                      class="spc-challenge-admin__button spc-challenge-admin__button--primary"
                      disabled={{this.busy}}
                      {{on "click" (fn this.crown entry)}}
                    >{{i18n (themePrefix "monthly_challenge.admin.crown")}}</button>
                  {{/if}}
                </li>
              {{/each}}
            </ol>
          {{else}}
            <p class="spc-challenge-admin__hint">{{i18n
                (themePrefix "monthly_challenge.admin.no_entries")
              }}</p>
          {{/if}}
          {{#if this.votesPageUrl}}
            <p class="spc-challenge-admin__links">
              <a href={{this.votesPageUrl}}>{{i18n
                  (themePrefix "monthly_challenge.entries_by_votes")
                }} →</a>
            </p>
          {{/if}}
        </details>

        <details class="spc-challenge-admin__section">
          <summary>{{i18n
              (themePrefix "monthly_challenge.admin.new_round_heading")
            }}</summary>
          <div class="spc-challenge-admin__form">
            <label>
              {{i18n (themePrefix "monthly_challenge.admin.month_label")}}
              <select {{on "change" this.updateMonth}}>
                {{#each this.monthOptions as |monthOption|}}
                  <option
                    value={{monthOption.value}}
                    selected={{monthOption.selected}}
                  >{{monthOption.label}}</option>
                {{/each}}
              </select>
            </label>
            <label>
              {{i18n (themePrefix "monthly_challenge.admin.title_label")}}
              <input
                type="text"
                value={{this.formTitle}}
                placeholder={{i18n
                  (themePrefix "monthly_challenge.admin.title_placeholder")
                }}
                {{on "input" (fn this.updateField "formTitle")}}
              />
            </label>
            <label>
              {{i18n (themePrefix "monthly_challenge.admin.summary_label")}}
              <input
                type="text"
                value={{this.formSummary}}
                {{on "input" (fn this.updateField "formSummary")}}
              />
              <span class="spc-challenge-admin__hint">{{i18n
                  (themePrefix "monthly_challenge.admin.summary_hint")
                }}</span>
            </label>
            <label>
              {{i18n (themePrefix "monthly_challenge.admin.task_label")}}
              <textarea
                rows="3"
                value={{this.formTask}}
                {{on "input" (fn this.updateField "formTask")}}
              ></textarea>
            </label>
            <label>
              {{i18n (themePrefix "monthly_challenge.admin.ideas_label")}}
              <textarea
                rows="4"
                value={{this.formIdeas}}
                {{on "input" (fn this.updateField "formIdeas")}}
              ></textarea>
              <span class="spc-challenge-admin__hint">{{i18n
                  (themePrefix "monthly_challenge.admin.ideas_hint")
                }}</span>
            </label>
            <label>
              {{i18n (themePrefix "monthly_challenge.admin.bonus_label")}}
              <input
                type="text"
                value={{this.formBonus}}
                {{on "input" (fn this.updateField "formBonus")}}
              />
            </label>
            <div class="spc-challenge-admin__uploader">
              <span>{{i18n
                  (themePrefix "monthly_challenge.admin.photo_label")
                }}</span>
              <UppyImageUploader
                @id="spc-admin-brief-upload"
                @type="composer"
                @imageUrl={{this.uploaderImageUrl}}
                @onUploadDone={{this.uploadDone}}
                @onUploadDeleted={{this.uploadDeleted}}
              />
            </div>
            <p class="spc-challenge-admin__hint">{{i18n
                (themePrefix "monthly_challenge.admin.language_hint")
              }}</p>
            <button
              type="button"
              class="spc-challenge-admin__button spc-challenge-admin__button--primary"
              disabled={{this.busy}}
              {{on "click" this.createRound}}
            >
              {{#if this.busy}}
                {{i18n (themePrefix "monthly_challenge.admin.creating")}}
              {{else}}
                {{i18n (themePrefix "monthly_challenge.admin.create")}}
              {{/if}}
            </button>
          </div>
        </details>

        <p class="spc-challenge-admin__links">
          <a href="/tag_groups">{{i18n
              (themePrefix "monthly_challenge.admin.manage_tags")
            }}</a>
        </p>
      </section>
    {{/if}}
  </template>
}
