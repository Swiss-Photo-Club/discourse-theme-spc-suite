import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import DiscourseURL from "discourse/lib/url";
import { i18n } from "discourse-i18n";

// Everything a /submit/* form does that is not its own fields: hold a title and
// an upload, warn before discarding work, validate, POST to /posts.json and
// route to the new topic. Subclasses supply the fields, the raw body and the
// destination; components/spc-submit-shell.gjs supplies the markup around them.
//
// It lives in lib/ rather than components/ because it is never invoked as a
// component — it has no template of its own, and a component file without one
// is a component that throws the moment anything renders it.
//
// Subclasses MUST define:
//
//   get categoryId()    integer; where the topic is created
//   get categoryUrl()   where cancel goes; build it with categoryUrlFor()
//   get heading()       the page title
//   get submitLabel()   the primary button's label
//   buildRaw()          the post body
//
// and MAY override:
//
//   get dirtyFields()   what counts as unsaved work. The default is the two
//                       fields this class owns; a form with its own textareas
//                       has to list them or cancel will discard them silently.
//   validate()          returns a message to show, or null. Call super first —
//                       the title check is here and applies to every mode.
//   async resolveTags() the topic's tags. Defaults to none, which is why the
//                       key is omitted from the payload rather than sent empty.

export default class SpcSubmitBase extends Component {
  @service dialog;

  @tracked title = "";
  @tracked upload = null;
  @tracked submitting = false;
  @tracked error = null;

  get dirtyFields() {
    return [this.title, this.upload];
  }

  get dirty() {
    return this.dirtyFields.some(Boolean);
  }

  get imageUrl() {
    return this.upload?.url;
  }

  validate() {
    if (!this.title?.trim()) {
      return i18n(themePrefix("form.error_no_title"));
    }
    return null;
  }

  async resolveTags() {
    return [];
  }

  @action
  updateTitle(event) {
    this.title = event.target.value;
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

  @action
  async submit() {
    const problem = this.validate();
    if (problem) {
      this.error = problem;
      return;
    }

    this.error = null;
    this.submitting = true;

    try {
      // Inside the try on purpose: resolveTags() can reach the network, and a
      // form left spinning with no message is the worst of the failure modes.
      const tags = await this.resolveTags();

      const data = {
        title: this.title.trim(),
        raw: this.buildRaw(),
        category: this.categoryId,
      };
      if (tags.length) {
        data.tags = tags;
      }

      const post = await ajax("/posts.json", { type: "POST", data });
      DiscourseURL.routeTo(`/t/${post.topic_slug}/${post.topic_id}`);
    } catch (e) {
      this.error = extractError(e);
      this.submitting = false;
    }
  }
}
