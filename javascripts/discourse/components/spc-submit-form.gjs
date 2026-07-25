import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import DButton from "discourse/components/d-button";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import { getUploadMarkdown } from "discourse/lib/uploads";
import DiscourseURL from "discourse/lib/url";
import { i18n } from "discourse-i18n";
import { currentMonthYM, resolveRoundTag } from "../lib/spc-submit-helpers";

export default class SpcSubmitForm extends Component {
  @service currentUser;
  @service dialog;

  @tracked title = "";
  @tracked description = "";
  @tracked upload = null;
  @tracked submitting = false;
  @tracked error = null;
  @tracked resolvedTag = null;

  loadRoundTag = modifier(() => {
    resolveRoundTag(settings).then((tag) => (this.resolvedTag = tag));
  });

  get categoryUrl() {
    const slug = (settings.challenge_category_slug || "").trim();
    const id = parseInt(settings.challenge_category_id, 10);
    return slug ? `/c/${slug}/${id}` : `/c/${id}`;
  }

  get roundLabel() {
    if (this.resolvedTag) {
      return this.resolvedTag;
    }
    if (window.moment) {
      return window.moment(`${currentMonthYM()}-01`).format("MMMM YYYY");
    }
    return currentMonthYM();
  }

  get imageUrl() {
    return this.upload?.url;
  }

  get dirty() {
    return this.title || this.description || this.upload;
  }

  @action
  updateTitle(event) {
    this.title = event.target.value;
  }

  @action
  updateDescription(event) {
    this.description = event.target.value;
  }

  @action
  uploadDone(upload) {
    this.upload = upload;
    this.error = null;
  }

  @action
  uploadDeleted() {
    this.upload = null;
  }

  @action
  goToLogin() {
    DiscourseURL.routeTo("/login");
  }

  @action
  cancel() {
    if (this.dirty) {
      this.dialog.yesNoConfirm({
        message: i18n(themePrefix("form.discard_confirm")),
        didConfirm: () => DiscourseURL.routeTo(this.categoryUrl),
      });
    } else {
      DiscourseURL.routeTo(this.categoryUrl);
    }
  }

  buildRaw() {
    let raw = getUploadMarkdown(this.upload);
    if (this.description?.trim()) {
      raw += `\n\n${this.description.trim()}`;
    }
    return raw;
  }

  @action
  async submit() {
    if (!this.title?.trim()) {
      this.error = i18n(themePrefix("form.error_no_title"));
      return;
    }
    if (!this.upload) {
      this.error = i18n(themePrefix("form.error_no_photo"));
      return;
    }

    this.error = null;
    this.submitting = true;

    const tag = this.resolvedTag || (await resolveRoundTag(settings));

    const data = {
      title: this.title.trim(),
      raw: this.buildRaw(),
      category: parseInt(settings.challenge_category_id, 10),
      tags: [tag],
    };

    try {
      const post = await ajax("/posts.json", { type: "POST", data });
      DiscourseURL.routeTo(`/t/${post.topic_slug}/${post.topic_id}`);
    } catch (e) {
      this.error = extractError(e);
      this.submitting = false;
    }
  }

  <template>
    <div class="spc-submit-page" {{this.loadRoundTag}}>
      <div class="spc-submit-page__inner">
        <div class="spc-submit-page__header">
          <h1>{{i18n (themePrefix "form.heading")}}</h1>
          <span class="spc-submit-page__round">
            {{i18n (themePrefix "form.round_label")}}:
            <span class="spc-submit-page__round-tag">{{this.roundLabel}}</span>
          </span>
          <DButton
            @icon="xmark"
            @action={{this.cancel}}
            class="btn-flat spc-submit-page__close"
          />
        </div>

        {{#if this.currentUser}}
          <div class="spc-submit-page__field">
            <label for="spc-submit-title">
              {{i18n (themePrefix "form.title_label")}}
            </label>
            <input
              id="spc-submit-title"
              type="text"
              maxlength="255"
              value={{this.title}}
              placeholder={{i18n (themePrefix "form.title_placeholder")}}
              {{on "input" this.updateTitle}}
            />
          </div>

          <div class="spc-submit-page__field">
            <label>{{i18n (themePrefix "form.photo_label")}}</label>
            <p class="spc-submit-page__hint">
              {{i18n (themePrefix "form.photo_hint")}}
            </p>
            <UppyImageUploader
              @id="spc-photo-upload"
              @type="composer"
              @imageUrl={{this.imageUrl}}
              @onUploadDone={{this.uploadDone}}
              @onUploadDeleted={{this.uploadDeleted}}
              class="spc-submit-page__uploader"
            />
          </div>

          <div class="spc-submit-page__field">
            <label for="spc-submit-description">
              {{i18n (themePrefix "form.description_label")}}
            </label>
            <textarea
              id="spc-submit-description"
              rows="6"
              placeholder={{i18n (themePrefix "form.description_placeholder")}}
              {{on "input" this.updateDescription}}
            >{{this.description}}</textarea>
          </div>

          {{#if this.error}}
            <div class="spc-submit-page__error alert alert-error">
              {{this.error}}
            </div>
          {{/if}}

          <div class="spc-submit-page__actions">
            <DButton
              @icon="camera"
              @translatedLabel={{if
                this.submitting
                (i18n (themePrefix "form.submitting"))
                (i18n (themePrefix "form.submit"))
              }}
              @action={{this.submit}}
              @disabled={{this.submitting}}
              @isLoading={{this.submitting}}
              class="btn-primary btn-large spc-submit-page__submit"
            />
            <DButton
              @translatedLabel={{i18n (themePrefix "form.cancel")}}
              @action={{this.cancel}}
              class="btn-flat"
            />
          </div>
        {{else}}
          <div class="spc-submit-page__login">
            <p>{{i18n (themePrefix "form.login_required")}}</p>
            <DButton
              @translatedLabel={{i18n (themePrefix "form.login_button")}}
              @action={{this.goToLogin}}
              class="btn-primary"
            />
          </div>
        {{/if}}
      </div>
    </div>
  </template>
}
