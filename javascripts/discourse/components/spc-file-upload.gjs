import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { getOwner } from "@ember/owner";
import DButton from "discourse/components/d-button";
import UppyUpload from "discourse/lib/uppy/uppy-upload";
import DPickFilesButton from "discourse/ui-kit/d-pick-files-button";

// One non-image upload — a PDF, in practice. UppyImageUploader cannot take one:
// it previews what it uploads and only knows how to preview an image.
//
// Built the way core's form-template upload field is built, on UppyUpload plus
// DPickFilesButton, because those are the two pieces core exposes for this and
// everything else about uploading in Discourse is composer-private. Note the
// `discourse/ui-kit/` import path: that is where core moved these, and the older
// `discourse/components/d-pick-files-button` no longer resolves.
//
// The caller decides whether this is even offered — see the project form, which
// hides the PDF option unless the site's authorized_extensions allows one.

export default class SpcFileUpload extends Component {
  @tracked file = null;

  uppyUpload = new UppyUpload(getOwner(this), {
    id: this.args.id,
    type: "composer",
    uploadDone: (upload) => {
      this.file = upload;
      this.args.onUploadDone?.(upload);
    },
  });

  get busy() {
    return this.uppyUpload.uploading || this.uppyUpload.processing;
  }

  get buttonLabel() {
    return this.busy ? this.args.busyLabel : this.args.label;
  }

  // getUploadMarkdown() keys off original_filename, so that is the one to trust;
  // file_name is what some of core's own upload components read back.
  get fileName() {
    return this.file?.original_filename || this.file?.file_name || "";
  }

  @action
  remove() {
    this.file = null;
    this.args.onUploadDone?.(null);
  }

  <template>
    <div class="spc-file-upload">
      {{#if this.file}}
        <div class="spc-file-upload__file">
          <a
            href={{this.file.url}}
            target="_blank"
            rel="noopener noreferrer"
          >{{this.fileName}}</a>
          <span class="spc-file-upload__size">{{this.file.human_filesize}}</span>
          <DButton
            @icon="xmark"
            @action={{this.remove}}
            class="btn-flat spc-file-upload__remove"
          />
        </div>
      {{else}}
        <DPickFilesButton
          @registerFileInput={{this.uppyUpload.setup}}
          @fileInputId={{@id}}
          @fileInputClass="spc-file-upload__input"
          @fileInputDisabled={{this.busy}}
          @showButton={{true}}
          @onFilesPicked={{true}}
          @icon="upload"
          @label={{this.buttonLabel}}
          @acceptedFormatsOverride={{@accept}}
          @acceptedFileTypesString={{@accept}}
        />
      {{/if}}
    </div>
  </template>
}
