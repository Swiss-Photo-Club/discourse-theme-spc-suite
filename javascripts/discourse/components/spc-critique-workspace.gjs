import Component from "@glimmer/component";
import { on } from "@ember/modifier";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { service } from "@ember/service";
import DModal from "discourse/components/d-modal";
import DButton from "discourse/components/d-button";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { cook } from "discourse/lib/text";
import i18n from "discourse-common/helpers/i18n";
import {
  processingExamplesDenied,
  questionKeysFor,
} from "../lib/spc-parse-request";

export default class SpcCritiqueWorkspace extends Component {
  @service currentUser;
  @service appEvents;
  @service dialog;

  @tracked value = "";
  @tracked previewHtml = null;
  @tracked posting = false;
  @tracked processingUpload = null;

  get request() {
    return this.args.model.request || {};
  }

  get authorName() {
    return this.args.model.authorName;
  }

  get imageUrl() {
    return this.args.model.imageUrl;
  }

  get questions() {
    return questionKeysFor(this.request.focus).map((key) =>
      i18n(themePrefix(key))
    );
  }

  get chips() {
    const out = [];
    if (this.request.style) {
      out.push(this.request.style);
    }
    if (this.request.focus) {
      out.push(this.request.focus);
    }
    return out;
  }

  get inPreview() {
    return this.previewHtml !== null;
  }

  get processingDenied() {
    return processingExamplesDenied(this.request.processingAllowed);
  }

  get processingImageUrl() {
    return this.processingUpload?.url;
  }

  @action
  updateValue(event) {
    this.value = event.target.value;
  }

  @action
  processingUploadDone(upload) {
    this.processingUpload = upload;
  }

  @action
  processingUploadDeleted() {
    this.processingUpload = null;
  }

  @action
  async togglePreview() {
    if (this.inPreview) {
      this.previewHtml = null;
      return;
    }
    const cooked = await cook(this.value || "");
    this.previewHtml = cooked;
  }

  @action
  async post() {
    if (!this.value.trim()) {
      this.dialog.alert(i18n(themePrefix("critique_workspace.empty_error")));
      return;
    }
    this.posting = true;
    try {
      await ajax("/posts.json", {
        type: "POST",
        data: {
          raw: this.value,
          topic_id: this.args.model.topicId,
          nested_post: true,
        },
      });
      this.args.closeModal();
      window.location.reload();
    } catch (error) {
      popupAjaxError(error);
    } finally {
      this.posting = false;
    }
  }

  <template>
    <DModal
      @title={{i18n (themePrefix "critique_workspace.modal_title")}}
      @closeModal={{@closeModal}}
      class="spc-critique-workspace-modal"
    >
      <:body>
        <div class="spc-cw">
          <div class="spc-cw__left">
            <h3 class="spc-cw__label">{{i18n (themePrefix "critique_workspace.reference_image")}}</h3>
            {{#if this.imageUrl}}
              <div class="spc-cw__image">
                <img src={{this.imageUrl}} alt="" />
              </div>
              <a
                class="spc-cw__fullsize"
                href={{this.imageUrl}}
                target="_blank"
                rel="noopener noreferrer"
              >{{i18n (themePrefix "critique_workspace.view_full_size")}}</a>
            {{/if}}

            <div class="spc-cw__example">
              <h3 class="spc-cw__label">
                {{i18n (themePrefix "critique_workspace.example_title")}}
              </h3>
              {{#if this.processingDenied}}
                <p class="spc-cw__example-denied">
                  {{i18n (themePrefix "critique_workspace.example_denied")}}
                </p>
              {{else}}
                <p class="spc-cw__example-hint">
                  {{i18n (themePrefix "critique_workspace.example_hint")}}
                </p>
                <UppyImageUploader
                  @id="spc-cw-example-upload"
                  @type="composer"
                  @imageUrl={{this.processingImageUrl}}
                  @onUploadDone={{this.processingUploadDone}}
                  @onUploadDeleted={{this.processingUploadDeleted}}
                  class="spc-cw__uploader"
                />
              {{/if}}
              {{#if this.imageUrl}}
                <a
                  class="spc-cw__download"
                  href={{this.imageUrl}}
                  download
                >{{i18n (themePrefix "critique_workspace.download_reference")}}</a>
              {{/if}}
            </div>
          </div>

          <div class="spc-cw__right">
            <h3 class="spc-cw__label">
              {{i18n (themePrefix "critique_workspace.request_of") name=this.authorName}}
            </h3>

            {{#if this.chips}}
              <div class="spc-cw__chips">
                {{#each this.chips as |chip|}}
                  <span class="spc-cw__chip">{{chip}}</span>
                {{/each}}
              </div>
            {{/if}}

            {{#if this.request.feedback}}
              <div class="spc-cw__block spc-cw__block--highlight">
                <h4>{{i18n (themePrefix "critique_workspace.feedback_requested")}}</h4>
                <p>{{this.request.feedback}}</p>
              </div>
            {{/if}}

            {{#if this.request.about}}
              <div class="spc-cw__block">
                <h4>{{i18n (themePrefix "critique_workspace.about_image")}}</h4>
                <p>{{this.request.about}}</p>
              </div>
            {{/if}}

            {{#if this.request.technical}}
              <div class="spc-cw__block">
                <h4>{{i18n (themePrefix "critique_workspace.technical")}}</h4>
                <p>{{this.request.technical}}</p>
              </div>
            {{/if}}

            <div class="spc-cw__editor">
              <h4>{{i18n (themePrefix "critique_workspace.your_critique")}}</h4>
              {{#if this.inPreview}}
                <div class="spc-cw__preview cooked">{{this.previewHtml}}</div>
              {{else}}
                <textarea
                  class="spc-cw__textarea"
                  placeholder={{i18n (themePrefix "critique_workspace.placeholder")}}
                  value={{this.value}}
                  {{on "input" this.updateValue}}
                ></textarea>
              {{/if}}
            </div>

            <div class="spc-cw__questions">
              <h4>{{i18n (themePrefix "critique_workspace.questions")}}</h4>
              <ul>
                {{#each this.questions as |question|}}
                  <li>{{question}}</li>
                {{/each}}
              </ul>
            </div>
          </div>
        </div>
      </:body>

      <:footer>
        <DButton
          class="btn-primary"
          @action={{this.post}}
          @disabled={{this.posting}}
          @translatedLabel={{if
            this.posting
            (i18n (themePrefix "critique_workspace.posting"))
            (i18n (themePrefix "critique_workspace.post"))
          }}
        />
        <DButton
          @action={{this.togglePreview}}
          @translatedLabel={{if
            this.inPreview
            (i18n (themePrefix "critique_workspace.edit"))
            (i18n (themePrefix "critique_workspace.preview"))
          }}
        />
        <DButton
          class="btn-flat"
          @action={{@closeModal}}
          @translatedLabel={{i18n (themePrefix "critique_workspace.cancel")}}
        />
      </:footer>
    </DModal>
  </template>
}
