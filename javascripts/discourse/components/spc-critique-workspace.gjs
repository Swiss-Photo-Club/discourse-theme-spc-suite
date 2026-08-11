import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { concat, fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { service } from "@ember/service";
import { modifier } from "ember-modifier";
import { eq } from "truth-helpers";
import DButton from "discourse/components/d-button";
import DEditor from "discourse/components/d-editor";
import UppyImageUploader from "discourse/components/uppy-image-uploader";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { getUploadMarkdown } from "discourse/lib/uploads";
import DiscourseURL from "discourse/lib/url";
import i18n from "discourse-common/helpers/i18n";
import {
  processingExamplesDenied,
  questionKeysFor,
} from "../lib/spc-parse-request";
import {
  ANNOTATION_TOOLS,
  paintAnnotations,
  renderAnnotations,
} from "../lib/spc-annotate";

// One request block (feedback / about / technical) that collapses beyond
// ~6 lines behind a Show-more toggle. The overflow check runs once, on
// insert, while the block starts collapsed - so a short text never grows a
// pointless toggle.
class SpcCwBlock extends Component {
  @tracked expanded = false;
  @tracked overflowing = false;

  measure = modifier((element) => {
    this.overflowing = element.scrollHeight > element.clientHeight + 4;
  });

  @action
  toggle() {
    this.expanded = !this.expanded;
  }

  <template>
    <div class="spc-cw__block {{@variant}}">
      <h4>{{@title}}</h4>
      <p
        class={{unless this.expanded "--collapsed"}}
        {{this.measure}}
      >{{@text}}</p>
      {{#if this.overflowing}}
        <button
          type="button"
          class="spc-cw__block-more"
          {{on "click" this.toggle}}
        >
          {{if
            this.expanded
            (i18n (themePrefix "critique_workspace.show_less"))
            (i18n (themePrefix "critique_workspace.show_more"))
          }}
        </button>
      {{/if}}
    </div>
  </template>
}

export default class SpcCritiqueWorkspace extends Component {
  @service currentUser;
  @service appEvents;
  @service dialog;

  @tracked value = "";
  @tracked posting = false;
  @tracked processingUpload = null;
  @tracked downloading = false;

  @tracked annotations = [];
  @tracked activeTool = null;
  @tracked focusMode = false;
  @tracked fullSize = false;
  @tracked selectedImageIndex = 0;

  annotationTools = ANNOTATION_TOOLS;
  annotationCanvas = null;
  annotationDraft = null;
  annotationColors = null;
  // Per-image note lists for project critiques, keyed by image index. The
  // tracked `annotations` array is always the SELECTED image's list;
  // selectImage() banks it here and swaps the next one in.
  annotationStore = new Map();

  // Sizes the canvas to the image box (backing store at devicePixelRatio for
  // crisp strokes) and follows the box through drawer resizes. Coordinates
  // are normalised, so a resize only needs a redraw.
  setupAnnotationCanvas = modifier((canvas) => {
    this.annotationCanvas = canvas;
    const observer = new ResizeObserver(() => this.resizeAnnotationCanvas());
    observer.observe(canvas.parentElement);
    this.resizeAnnotationCanvas();
    return () => {
      observer.disconnect();
      this.annotationCanvas = null;
    };
  });

  get request() {
    return this.args.model.request || {};
  }

  get project() {
    return this.args.model.project || null;
  }

  get authorName() {
    return this.args.model.authorName;
  }

  get imageUrls() {
    const urls = this.args.model.imageUrls;
    if (urls?.length) {
      return urls;
    }
    return this.args.model.imageUrl ? [this.args.model.imageUrl] : [];
  }

  // Everything downstream - stage, canvas, download, lightbox, composite -
  // reads the selected image through this one getter.
  get imageUrl() {
    return this.imageUrls[this.selectedImageIndex] || null;
  }

  get imageChips() {
    if (this.imageUrls.length < 2) {
      return [];
    }
    return this.imageUrls.map((url, index) => ({
      index,
      number: index + 1,
    }));
  }

  get questions() {
    const keys = this.project
      ? [
          "critique_workspace.q_project_1",
          "critique_workspace.q_project_2",
          "critique_workspace.q_project_3",
        ]
      : questionKeysFor(this.request.focus);
    return keys.map((key) => i18n(themePrefix(key)));
  }

  get chips() {
    if (this.project) {
      return [this.project.focus, this.project.presentation].filter(Boolean);
    }
    const out = [];
    if (this.request.style) {
      out.push(this.request.style);
    }
    if (this.request.focus) {
      out.push(this.request.focus);
    }
    return out;
  }

  get processingDenied() {
    return processingExamplesDenied(this.request.processingAllowed);
  }

  get processingImageUrl() {
    return this.processingUpload?.url;
  }

  // Uploads are stored under a checksum, so the URL's basename is a hash.
  // Name the saved file after the topic - that is the image's title in this
  // workflow - keeping the upload's real extension, with an image number
  // when the post carries several.
  get downloadFilename() {
    const url = this.imageUrl || "";
    const basename = url.split("/").pop()?.split("?")[0] || "reference-image";
    const safeTitle = (this.args.model.topicTitle || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .trim();
    if (!safeTitle) {
      return basename;
    }
    const ext = basename.includes(".") ? basename.split(".").pop() : "jpg";
    const suffix =
      this.imageUrls.length > 1 ? ` - ${this.selectedImageIndex + 1}` : "";
    return `${safeTitle}${suffix}.${ext}`;
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

  get hasAnnotations() {
    return this.annotations.length > 0;
  }

  resizeAnnotationCanvas() {
    const canvas = this.annotationCanvas;
    if (!canvas?.parentElement) {
      return;
    }
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    this.redrawAnnotations();
  }

  redrawAnnotations() {
    const canvas = this.annotationCanvas;
    if (!canvas) {
      return;
    }
    // The accent/casing pair comes from the live palette so the notes keep
    // working under a dark scheme; canvas cannot consume CSS vars directly.
    if (!this.annotationColors) {
      const styles = getComputedStyle(canvas);
      this.annotationColors = {
        accent: styles.getPropertyValue("--tertiary").trim() || "#0088cc",
        casing: styles.getPropertyValue("--secondary").trim() || "#ffffff",
      };
    }
    const list = this.annotationDraft
      ? [...this.annotations, this.annotationDraft]
      : this.annotations;
    renderAnnotations(
      canvas.getContext("2d"),
      list,
      canvas.width,
      canvas.height,
      this.annotationColors
    );
  }

  annotationPoint(event) {
    const rect = this.annotationCanvas.getBoundingClientRect();
    const clamp = (v) => Math.min(1, Math.max(0, v));
    return {
      x: clamp((event.clientX - rect.left) / rect.width),
      y: clamp((event.clientY - rect.top) / rect.height),
    };
  }

  @action
  selectImage(index) {
    if (index === this.selectedImageIndex) {
      return;
    }
    this.annotationStore.set(this.selectedImageIndex, this.annotations);
    this.selectedImageIndex = index;
    this.annotations = this.annotationStore.get(index) || [];
    this.annotationDraft = null;
    // The stage img swaps src reactively; if the new image's box differs the
    // ResizeObserver redraws again, and normalised coordinates make both
    // redraws correct.
    this.redrawAnnotations();
  }

  @action
  toggleFocus() {
    this.focusMode = !this.focusMode;
  }

  // The full-size view is an overlay, not a new tab: NPN behaviour, and it
  // keeps the critic inside the workspace. It portals to document.body
  // because the drawer is position:fixed with a z-index and therefore a
  // stacking context - a child overlay could never rise above the header
  // (1000) no matter its own z-index. The host's document-level ESC handler
  // skips while .spc-cw-lightbox exists, so this listener owns ESC for the
  // overlay's lifetime.
  get lightboxTarget() {
    return document.body;
  }

  fullSizeKeydown = (event) => {
    if (event.key === "Escape") {
      this.closeFullSize();
    }
  };

  @action
  openFullSize() {
    this.fullSize = true;
    document.addEventListener("keydown", this.fullSizeKeydown);
  }

  @action
  closeFullSize() {
    this.fullSize = false;
    document.removeEventListener("keydown", this.fullSizeKeydown);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    document.removeEventListener("keydown", this.fullSizeKeydown);
  }

  @action
  selectAnnotationTool(toolId) {
    this.activeTool = this.activeTool === toolId ? null : toolId;
  }

  @action
  startAnnotation(event) {
    if (!this.activeTool || !this.annotationCanvas) {
      return;
    }
    event.preventDefault();
    const point = this.annotationPoint(event);
    if (this.activeTool === "point") {
      this.annotations = [
        ...this.annotations,
        { tool: "point", points: [point] },
      ];
      this.redrawAnnotations();
      return;
    }
    this.annotationDraft = { tool: this.activeTool, points: [point, point] };
    event.target.setPointerCapture?.(event.pointerId);
    this.redrawAnnotations();
  }

  @action
  moveAnnotation(event) {
    const draft = this.annotationDraft;
    if (!draft) {
      return;
    }
    const point = this.annotationPoint(event);
    if (draft.tool === "path") {
      const last = draft.points[draft.points.length - 1];
      if (Math.abs(point.x - last.x) + Math.abs(point.y - last.y) > 0.002) {
        draft.points.push(point);
      }
    } else {
      draft.points[1] = point;
    }
    this.redrawAnnotations();
  }

  @action
  endAnnotation() {
    const draft = this.annotationDraft;
    if (!draft) {
      return;
    }
    this.annotationDraft = null;
    const [a, b] = [draft.points[0], draft.points[draft.points.length - 1]];
    const degenerate =
      draft.tool !== "path" &&
      Math.abs(a.x - b.x) < 0.004 &&
      Math.abs(a.y - b.y) < 0.004;
    if (!degenerate) {
      this.annotations = [...this.annotations, draft];
    }
    this.redrawAnnotations();
  }

  @action
  cancelAnnotation() {
    this.annotationDraft = null;
    this.redrawAnnotations();
  }

  @action
  undoAnnotation() {
    this.annotations = this.annotations.slice(0, -1);
    this.redrawAnnotations();
  }

  @action
  clearAnnotations() {
    this.annotations = [];
    this.redrawAnnotations();
  }

  // Draws the reference image plus the notes at natural resolution (capped
  // at 2048px on the long side - Discourse would downscale anything bigger
  // anyway) and returns a JPEG blob. The stage <img> already holds the
  // full-size original, and it is same-origin, so the canvas stays clean.
  async compositeAnnotations() {
    const stageImg =
      this.annotationCanvas?.parentElement?.querySelector("img");
    if (!stageImg?.naturalWidth) {
      throw new Error("reference image not loaded");
    }
    const scale = Math.min(
      1,
      2048 / Math.max(stageImg.naturalWidth, stageImg.naturalHeight)
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(stageImg.naturalWidth * scale);
    canvas.height = Math.round(stageImg.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(stageImg, 0, 0, canvas.width, canvas.height);
    paintAnnotations(
      ctx,
      this.annotations,
      canvas.width,
      canvas.height,
      this.annotationColors
    );
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("composite failed")),
        "image/jpeg",
        0.9
      );
    });
  }

  async uploadVisualNotes(blob) {
    const base = this.downloadFilename.replace(/\.[a-z0-9]+$/i, "");
    const formData = new FormData();
    formData.append("type", "composer");
    formData.append("files[]", blob, `${base} (visual notes).jpg`);
    const upload = await ajax("/uploads.json", {
      type: "POST",
      data: formData,
      processData: false,
      contentType: false,
    });
    // getUploadMarkdown sizes the image from the thumbnail fields; back-fill
    // them so a response without thumbnails cannot produce undefinedxundefined.
    upload.thumbnail_width ||= upload.width;
    upload.thumbnail_height ||= upload.height;
    return upload;
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
      link.download = this.downloadFilename;
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
  async post() {
    if (!this.value.trim()) {
      this.dialog.alert(i18n(themePrefix("critique_workspace.empty_error")));
      return;
    }
    this.posting = true;
    try {
      // The labels are in the critic's locale on purpose: the critique
      // itself is written in that language, and nothing parses critique
      // replies. If compositing or uploading the notes fails, the throw
      // lands in the catch below and the drawer stays open with the draft
      // and the drawn notes intact - never post without the notes the
      // critic drew.
      let raw = this.value;
      if (this.hasAnnotations) {
        const blob = await this.compositeAnnotations();
        const notesUpload = await this.uploadVisualNotes(blob);
        raw += `\n\n**${i18n(
          themePrefix("critique_workspace.notes_post_label")
        )}:**\n\n${getUploadMarkdown(notesUpload)}`;
      }
      if (this.processingUpload) {
        raw += `\n\n**${i18n(
          themePrefix("critique_workspace.example_post_label")
        )}:**\n\n${getUploadMarkdown(this.processingUpload)}`;
      }
      const reply = await ajax("/posts.json", {
        type: "POST",
        data: {
          raw,
          topic_id: this.args.model.topicId,
          nested_post: true,
        },
      });
      this.args.closeModal();
      // Same-topic routeTo with a post number refreshes the post stream from
      // the server (which picks up the reply we just created) and jumps to
      // it - no full page reload needed.
      if (reply?.topic_id && reply?.post_number) {
        DiscourseURL.routeTo(
          `/t/${reply.topic_slug || "-"}/${reply.topic_id}/${reply.post_number}`
        );
      } else {
        window.location.reload();
      }
    } catch (error) {
      popupAjaxError(error);
    } finally {
      this.posting = false;
    }
  }

  <template>
    <div
      class="spc-cw-drawer"
      role="dialog"
      aria-label={{i18n (themePrefix "critique_workspace.modal_title")}}
    >
      <div class="spc-cw-drawer__header">
        <h3 class="spc-cw-drawer__title">
          {{i18n (themePrefix "critique_workspace.modal_title")}}
        </h3>
        <DButton
          @icon="xmark"
          @action={{@closeModal}}
          @translatedAriaLabel={{i18n (themePrefix "critique_workspace.cancel")}}
          class="btn-transparent spc-cw-drawer__close"
        />
      </div>

      <div class="spc-cw-drawer__body">
        <div class="spc-cw {{if this.focusMode '--focus'}}">
          <div class="spc-cw__left">
            <div class="spc-cw__pane-head">
              <h3 class="spc-cw__label">
                {{i18n (themePrefix "critique_workspace.reference_image")}}
              </h3>
              {{#if this.imageUrl}}
                <DButton
                  @icon={{if this.focusMode "compress" "expand"}}
                  @action={{this.toggleFocus}}
                  @translatedLabel={{if
                    this.focusMode
                    (i18n (themePrefix "critique_workspace.focus_exit"))
                    (i18n (themePrefix "critique_workspace.focus_image"))
                  }}
                  class="btn-flat spc-cw__focus-toggle"
                />
              {{/if}}
            </div>
            {{#if this.imageChips}}
              <div class="spc-cw__image-chips">
                {{#each this.imageChips as |chip|}}
                  <button
                    type="button"
                    class="spc-cw__image-chip
                      {{if (eq chip.index this.selectedImageIndex) '--active'}}"
                    {{on "click" (fn this.selectImage chip.index)}}
                  >
                    {{i18n
                      (themePrefix "critique_workspace.image_n")
                      number=chip.number
                    }}
                  </button>
                {{/each}}
              </div>
            {{/if}}

            {{#if this.imageUrl}}
              <div class="spc-cw__image">
                <div class="spc-cw__stage">
                  <img src={{this.imageUrl}} alt="" />
                  <canvas
                    class="spc-cw__canvas {{if this.activeTool '--armed'}}"
                    {{this.setupAnnotationCanvas}}
                    {{on "pointerdown" this.startAnnotation}}
                    {{on "pointermove" this.moveAnnotation}}
                    {{on "pointerup" this.endAnnotation}}
                    {{on "pointercancel" this.cancelAnnotation}}
                  ></canvas>
                </div>
              </div>
              <DButton
                @icon="magnifying-glass-plus"
                @action={{this.openFullSize}}
                @translatedLabel={{i18n
                  (themePrefix "critique_workspace.view_full_size")
                }}
                class="spc-cw__fullsize"
              />

              <div class="spc-cw__notes">
                <h3 class="spc-cw__label">
                  {{i18n (themePrefix "critique_workspace.visual_notes")}}
                </h3>
                <p class="spc-cw__notes-hint">
                  {{i18n (themePrefix "critique_workspace.notes_hint")}}
                </p>
                <div class="spc-cw__notes-toolbar">
                  {{#each this.annotationTools as |tool|}}
                    <DButton
                      @icon={{tool.icon}}
                      @action={{fn this.selectAnnotationTool tool.id}}
                      @translatedAriaLabel={{i18n
                        (themePrefix
                          (concat "critique_workspace." tool.labelKey)
                        )
                      }}
                      class="spc-cw__tool
                        {{if (eq this.activeTool tool.id) '--active'}}"
                    />
                  {{/each}}
                  <span class="spc-cw__notes-sep"></span>
                  <DButton
                    @icon="arrow-rotate-left"
                    @action={{this.undoAnnotation}}
                    @disabled={{unless this.hasAnnotations true}}
                    @translatedAriaLabel={{i18n
                      (themePrefix "critique_workspace.notes_undo")
                    }}
                    class="spc-cw__tool"
                  />
                  <DButton
                    @icon="trash-can"
                    @action={{this.clearAnnotations}}
                    @disabled={{unless this.hasAnnotations true}}
                    @translatedAriaLabel={{i18n
                      (themePrefix "critique_workspace.notes_clear")
                    }}
                    class="spc-cw__tool"
                  />
                </div>
              </div>
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

            {{#if this.project}}
              {{! "Where the community can help" IS the feedback request of a
                  project post, so it takes the highlight slot. Titles are in
                  the viewer's language; the text is the post's. }}
              {{#if this.project.help}}
                <SpcCwBlock
                  @title={{i18n (themePrefix "critique_workspace.feedback_requested")}}
                  @text={{this.project.help}}
                  @variant="spc-cw__block--highlight"
                />
              {{/if}}
              {{#if this.project.about}}
                <SpcCwBlock
                  @title={{i18n (themePrefix "critique_workspace.about_project")}}
                  @text={{this.project.about}}
                />
              {{/if}}
              {{#if this.project.direction}}
                <SpcCwBlock
                  @title={{i18n (themePrefix "critique_workspace.project_direction")}}
                  @text={{this.project.direction}}
                />
              {{/if}}
              {{#if this.project.working}}
                <SpcCwBlock
                  @title={{i18n (themePrefix "critique_workspace.project_working")}}
                  @text={{this.project.working}}
                />
              {{/if}}
              {{#if this.project.details}}
                <SpcCwBlock
                  @title={{i18n (themePrefix "critique_workspace.project_details")}}
                  @text={{this.project.details}}
                />
              {{/if}}
            {{else}}
              {{#if this.request.feedback}}
                <SpcCwBlock
                  @title={{i18n (themePrefix "critique_workspace.feedback_requested")}}
                  @text={{this.request.feedback}}
                  @variant="spc-cw__block--highlight"
                />
              {{/if}}

              {{#if this.request.about}}
                <SpcCwBlock
                  @title={{i18n (themePrefix "critique_workspace.about_image")}}
                  @text={{this.request.about}}
                />
              {{/if}}

              {{#if this.request.technical}}
                <SpcCwBlock
                  @title={{i18n (themePrefix "critique_workspace.technical")}}
                  @text={{this.request.technical}}
                />
              {{/if}}
            {{/if}}

            <div class="spc-cw__editor">
              <h4>{{i18n (themePrefix "critique_workspace.your_critique")}}</h4>
              <DEditor
                @value={{this.value}}
                @change={{this.updateValue}}
                @placeholder={{i18n (themePrefix "critique_workspace.placeholder")}}
              />
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
      </div>

      <div class="spc-cw-drawer__footer">
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
          class="btn-flat"
          @action={{@closeModal}}
          @translatedLabel={{i18n (themePrefix "critique_workspace.cancel")}}
        />
      </div>

      {{#if this.fullSize}}
        {{! Clicking anywhere closes; the X is the visible affordance.
            insertBefore=null appends to body without clearing it. }}
        {{#in-element this.lightboxTarget insertBefore=null}}
          <div
            class="spc-cw-lightbox"
            role="dialog"
            aria-label={{i18n (themePrefix "critique_workspace.view_full_size")}}
            {{on "click" this.closeFullSize}}
          >
            <img src={{this.imageUrl}} alt="" />
            <DButton
              @icon="xmark"
              @action={{this.closeFullSize}}
              @translatedAriaLabel={{i18n
                (themePrefix "critique_workspace.cancel")
              }}
              class="btn-transparent spc-cw-lightbox__close"
            />
          </div>
        {{/in-element}}
      {{/if}}
    </div>
  </template>
}
