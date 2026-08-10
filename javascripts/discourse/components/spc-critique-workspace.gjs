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
import icon from "discourse/helpers/d-icon";
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
  @tracked downloading = false;

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

  // The plain `download` attribute is not enough here: hosted uploads can
  // 302 to external object storage, and Firefox ignores the attribute on a
  // cross-origin redirect and navigates instead. Pulling the file through
  // fetch and saving the blob downloads reliably; if the redirect target
  // refuses CORS the fetch throws and we fall back to a new tab.
  @action
  async downloadReference() {
    const url = this.imageUrl;
    if (!url) {
      return;
    }
    this.downloading = true;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download =
        url.split("/").pop()?.split("?")[0] || "reference-image";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener");
    } finally {
      this.downloading = false;
    }
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
                class="btn spc-cw__fullsize"
                href={{this.imageUrl}}
                target="_blank"
                rel="noopener noreferrer"
              >
                {{icon "up-right-from-square"}}
                <span class="d-button-label">
                  {{i18n (themePrefix "critique_workspace.view_full_size")}}
                </span>
              </a>
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
              {{/if}}
              {{#if this.imageUrl}}
                <div class="spc-cw__actions">
                  <DButton
                    @icon="download"
                    @action={{this.downloadReference}}
                    @disabled={{this.downloading}}
                    @translatedLabel={{i18n
                      (themePrefix "critique_workspace.download_reference")
                    }}
                  />
                </div>
              {{/if}}
              {{#unless this.processingDenied}}
                <UppyImageUploader
                  @id="spc-cw-example-upload"
                  @type="composer"
                  @imageUrl={{this.processingImageUrl}}
                  @onUploadDone={{this.processingUploadDone}}
                  @onUploadDeleted={{this.processingUploadDeleted}}
                  class="spc-cw__uploader"
                />
              {{/unless}}
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
