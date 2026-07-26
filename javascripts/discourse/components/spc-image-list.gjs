import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { getOwner } from "@ember/owner";
import DButton from "discourse/components/d-button";
import UppyUpload from "discourse/lib/uppy/uppy-upload";
import DPickFilesButton from "discourse/ui-kit/d-pick-files-button";
import { i18n } from "discourse-i18n";

// An ordered list of images: drop several at once, annotate each, reorder them,
// delete one. Built for the project form, where the images ARE the submission
// and the order they are read in is part of the work.
//
// UppyImageUploader, which the other two forms use, is deliberately not this:
// it holds exactly one image and previews it. Multi-file, a drop target and
// per-file completion all come from UppyUpload, which is what core's own
// multi-file fields are built on. `uploadDone` fires once per file, so a drop of
// eight images appends eight rows as they finish, in completion order.
//
// The caller owns the array. This component never keeps its own copy — every
// mutation goes out through @onChange with a whole new array, so there is one
// source of truth and the form's buildRaw() can read it directly.
//
// Each row is { key, upload, note }. The key is ours and not the upload's id:
// Discourse deduplicates uploads by checksum, so the same file added twice comes
// back as the same record with the same id, and two rows would collide.

let nextKey = 0;

export default class SpcImageList extends Component {
  @tracked draggingIndex = null;

  get dropZoneId() {
    return `${this.args.id}-dropzone`;
  }

  uppyUpload = new UppyUpload(getOwner(this), {
    id: this.args.id,
    type: "composer",
    uploadDone: (upload) => this.appendUpload(upload),
    // Resolved lazily, when the file input registers. The drop zone is rendered
    // before the input inside it, so by then it is in the document. Returning
    // null rather than a fallback element if it somehow is not: no drop target
    // is a working browse button, whereas the wrong drop target is the whole
    // page accepting stray files.
    uploadDropTargetOptions: () => {
      const target = document.getElementById(this.dropZoneId);
      return target ? { target } : null;
    },
  });

  get images() {
    return this.args.images || [];
  }

  // Everything the template needs to render a row without a single helper:
  // its number, and whether the up/down buttons should be dead.
  get rows() {
    return this.images.map((image, index) => ({
      ...image,
      index,
      label: i18n(this.args.itemLabelKey, { number: index + 1 }),
      first: index === 0,
      last: index === this.images.length - 1,
    }));
  }

  get uploading() {
    return this.uppyUpload.uploading || this.uppyUpload.processing;
  }

  get addLabel() {
    return this.images.length ? this.args.addMoreLabel : this.args.addLabel;
  }

  appendUpload(upload) {
    this.args.onChange([
      ...this.images,
      { key: `img-${nextKey++}`, upload, note: "" },
    ]);
  }

  @action
  remove(index) {
    this.args.onChange(this.images.filter((_, i) => i !== index));
  }

  @action
  move(index, delta) {
    const next = [...this.images];
    const target = index + delta;
    if (target < 0 || target >= next.length) {
      return;
    }
    [next[index], next[target]] = [next[target], next[index]];
    this.args.onChange(next);
  }

  @action
  updateNote(index, event) {
    const note = event.target.value;
    this.args.onChange(
      this.images.map((image, i) => (i === index ? { ...image, note } : image))
    );
  }

  // Only the handle is draggable, so that selecting text in a note does not
  // start a drag. The drag image is set to the whole row, or the pointer would
  // carry the handle glyph alone.
  @action
  dragStart(index, event) {
    this.draggingIndex = index;
    event.dataTransfer.effectAllowed = "move";
    // Firefox refuses to start a drag unless some data is set.
    event.dataTransfer.setData("text/plain", String(index));
    const row = event.target.closest(".spc-image-list__item");
    if (row) {
      event.dataTransfer.setDragImage(row, 20, 20);
    }
  }

  @action
  dragOver(event) {
    if (this.draggingIndex === null) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  @action
  drop(index, event) {
    event.preventDefault();
    const from = this.draggingIndex;
    this.draggingIndex = null;
    if (from === null || from === index) {
      return;
    }
    const next = [...this.images];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    this.args.onChange(next);
  }

  @action
  dragEnd() {
    this.draggingIndex = null;
  }

  <template>
    <div class="spc-image-list">
      {{#if this.rows}}
        <ul class="spc-image-list__items">
          {{#each this.rows key="key" as |row|}}
            <li
              class="spc-image-list__item"
              {{on "dragover" this.dragOver}}
              {{on "drop" (fn this.drop row.index)}}
            >
              <span
                class="spc-image-list__handle"
                draggable="true"
                aria-hidden="true"
                {{on "dragstart" (fn this.dragStart row.index)}}
                {{on "dragend" this.dragEnd}}
              ></span>

              <div class="spc-image-list__thumb">
                <img src={{row.upload.url}} alt="" />
                <span class="spc-image-list__number">{{row.label}}</span>
              </div>

              <div class="spc-image-list__note">
                <label for="{{@id}}-note-{{row.key}}">
                  {{@noteLabel}}
                </label>
                <textarea
                  id="{{@id}}-note-{{row.key}}"
                  rows="3"
                  placeholder={{@notePlaceholder}}
                  {{on "input" (fn this.updateNote row.index)}}
                >{{row.note}}</textarea>
              </div>

              <div class="spc-image-list__controls">
                <DButton
                  @icon="arrow-up"
                  @title={{@moveUpLabel}}
                  @action={{fn this.move row.index -1}}
                  @disabled={{row.first}}
                  class="btn-flat"
                />
                <DButton
                  @icon="arrow-down"
                  @title={{@moveDownLabel}}
                  @action={{fn this.move row.index 1}}
                  @disabled={{row.last}}
                  class="btn-flat"
                />
                <DButton
                  @icon="trash-can"
                  @title={{@removeLabel}}
                  @action={{fn this.remove row.index}}
                  class="btn-flat spc-image-list__remove"
                />
              </div>
            </li>
          {{/each}}
        </ul>
      {{/if}}

      <div id={{this.dropZoneId}} class="spc-image-list__dropzone">
        <DPickFilesButton
          @registerFileInput={{this.uppyUpload.setup}}
          @fileInputId={{@id}}
          @fileInputClass="spc-image-list__input"
          @fileInputDisabled={{this.uploading}}
          @allowMultiple={{true}}
          @showButton={{true}}
          @onFilesPicked={{true}}
          @icon="cloud-arrow-up"
          @label={{this.addLabel}}
        />
        <p class="spc-image-list__drop-hint">{{@dropHint}}</p>
      </div>

      {{#if this.uploading}}
        <p class="spc-image-list__progress">
          {{@uploadingLabel}}
          {{this.uppyUpload.uploadProgress}}%
        </p>
      {{/if}}
    </div>
  </template>
}
