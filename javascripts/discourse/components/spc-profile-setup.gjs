import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { getOwner } from "@ember/owner";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import ConditionalLoadingSpinner from "discourse/components/conditional-loading-spinner";
import DButton from "discourse/components/d-button";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import DiscourseURL, { userPath } from "discourse/lib/url";
import UppyUpload from "discourse/lib/uppy/uppy-upload";
import { i18n } from "discourse-i18n";

// The friendly profile page behind /profile-setup: the four fields worth
// asking a new member for (photo, website, location, bio), prefilled from and
// saved to the real Discourse profile. It replaces nothing — /my/preferences
// remains the full editor — it is just the page onboarding sends people to
// instead.
//
// Not built on lib/spc-submit-base: that class's whole body is "compose a
// topic and POST it to /posts.json", and this form creates no topic. The
// only thing the two would share is a login gate.
//
// The photo field deliberately skips core's <AvatarUploader> component: it
// hands the finished upload id back through classic two-way binding, which a
// Glimmer parent never receives. Instead this uses the same lib that component
// is built on — UppyUpload with type "avatar" — and completes the change the
// way core's avatar-selector modal does, with pickAvatar(id, "custom"). The
// avatar applies the moment the upload finishes; the Save button owns only
// the three text fields.

export default class SpcProfileSetup extends Component {
  @service currentUser;

  @tracked loading = true;
  @tracked website = "";
  @tracked location = "";
  @tracked bio = "";
  @tracked avatarTemplate = null;
  @tracked saving = false;
  @tracked saved = false;
  @tracked error = null;

  uppyUpload = this.currentUser
    ? new UppyUpload(getOwner(this), {
        id: "spc-profile-avatar",
        type: "avatar",
        validateUploadedFilesOptions: { imagesOnly: true },
        additionalParams: () => ({ user_id: this.currentUser.id }),
        uploadDone: (upload) => this.avatarUploaded(upload),
      })
    : null;

  constructor() {
    super(...arguments);
    if (this.currentUser) {
      this.loadProfile();
    }
  }

  async loadProfile() {
    try {
      const { user } = await ajax(
        userPath(`${this.currentUser.username_lower}.json`)
      );
      this.website = user.website ?? "";
      this.location = user.location ?? "";
      this.bio = user.bio_raw ?? "";
      this.avatarTemplate = user.avatar_template;
    } catch (e) {
      this.error = extractError(e);
    } finally {
      this.loading = false;
    }
  }

  get avatarUrl() {
    const template = this.avatarTemplate ?? this.currentUser?.avatar_template;
    return template?.replace("{size}", "240");
  }

  get uploadLabel() {
    return this.uppyUpload.uploading
      ? `${i18n("uploading")} ${this.uppyUpload.uploadProgress}%`
      : i18n(themePrefix("profile_setup.photo_button"));
  }

  get profileUrl() {
    // Explicitly /summary: the bare /u/<username> resolves to the Activity
    // tab, and the summary is the page that actually shows bio, location and
    // website — the things this form just saved.
    return userPath(`${this.currentUser.username_lower}/summary`);
  }

  @action
  updateField(name, event) {
    this[name] = event.target.value;
  }

  @action
  chooseAvatar() {
    this.uppyUpload.openPicker();
  }

  async avatarUploaded(upload) {
    try {
      await this.currentUser.pickAvatar(upload.id, "custom");
      // Re-read the profile rather than pointing the preview at the raw
      // upload: the server generates the sized avatar_template, and updating
      // currentUser is what refreshes the header avatar without a reload.
      const { user } = await ajax(
        userPath(`${this.currentUser.username_lower}.json`)
      );
      this.avatarTemplate = user.avatar_template;
      this.currentUser.set("avatar_template", user.avatar_template);
      this.error = null;
    } catch (e) {
      this.error = extractError(e);
    }
  }

  @action
  goToLogin() {
    DiscourseURL.routeTo("/login");
  }

  @action
  async save() {
    this.saving = true;
    this.error = null;
    this.saved = false;

    try {
      await ajax(userPath(`${this.currentUser.username_lower}.json`), {
        type: "PUT",
        data: {
          website: this.website,
          location: this.location,
          bio_raw: this.bio,
        },
      });
      this.saved = true;
    } catch (e) {
      this.error = extractError(e);
    } finally {
      this.saving = false;
    }
  }

  <template>
    <div class="spc-profile-setup">
      <div class="spc-profile-setup__card">
        <header class="spc-profile-setup__header">
          <h1>{{i18n (themePrefix "profile_setup.heading")}}</h1>
          <p class="spc-profile-setup__lead">
            {{i18n (themePrefix "profile_setup.lead")}}
          </p>
        </header>

        {{#if this.currentUser}}
          <ConditionalLoadingSpinner @condition={{this.loading}}>
            <div class="spc-profile-setup__field">
              <label for="spc-profile-avatar-input">
                {{i18n (themePrefix "profile_setup.photo_label")}}
                <span class="spc-profile-setup__optional">
                  {{i18n (themePrefix "form.optional")}}
                </span>
              </label>
              <p class="spc-profile-setup__hint">
                {{i18n (themePrefix "profile_setup.photo_hint")}}
              </p>
              <div class="spc-profile-setup__avatar">
                <img
                  class="spc-profile-setup__avatar-preview"
                  src={{this.avatarUrl}}
                  alt=""
                />
                <input
                  id="spc-profile-avatar-input"
                  {{didInsert this.uppyUpload.setup}}
                  class="hidden-upload-field"
                  disabled={{this.uppyUpload.uploading}}
                  type="file"
                  accept="image/*"
                  aria-hidden="true"
                />
                <DButton
                  @icon="cloud-arrow-up"
                  @translatedLabel={{this.uploadLabel}}
                  @action={{this.chooseAvatar}}
                  @disabled={{this.uppyUpload.uploading}}
                  class="btn-default spc-profile-setup__avatar-button"
                />
              </div>
            </div>

            <div class="spc-profile-setup__field">
              <label for="spc-profile-website">
                {{i18n (themePrefix "profile_setup.website_label")}}
                <span class="spc-profile-setup__optional">
                  {{i18n (themePrefix "form.optional")}}
                </span>
              </label>
              <p class="spc-profile-setup__hint">
                {{i18n (themePrefix "profile_setup.website_hint")}}
              </p>
              <input
                id="spc-profile-website"
                type="text"
                maxlength="255"
                value={{this.website}}
                {{on "input" (fn this.updateField "website")}}
              />
            </div>

            <div class="spc-profile-setup__field">
              <label for="spc-profile-location">
                {{i18n (themePrefix "profile_setup.location_label")}}
                <span class="spc-profile-setup__optional">
                  {{i18n (themePrefix "form.optional")}}
                </span>
              </label>
              <p class="spc-profile-setup__hint">
                {{i18n (themePrefix "profile_setup.location_hint")}}
              </p>
              <input
                id="spc-profile-location"
                type="text"
                maxlength="255"
                value={{this.location}}
                {{on "input" (fn this.updateField "location")}}
              />
            </div>

            <div class="spc-profile-setup__field">
              <label for="spc-profile-bio">
                {{i18n (themePrefix "profile_setup.bio_label")}}
                <span class="spc-profile-setup__optional">
                  {{i18n (themePrefix "form.optional")}}
                </span>
              </label>
              <p class="spc-profile-setup__hint">
                {{i18n (themePrefix "profile_setup.bio_hint")}}
              </p>
              <textarea
                id="spc-profile-bio"
                rows="6"
                {{on "input" (fn this.updateField "bio")}}
              >{{this.bio}}</textarea>
            </div>

            {{#if this.error}}
              <div class="spc-profile-setup__error alert alert-error">
                {{this.error}}
              </div>
            {{/if}}

            {{#if this.saved}}
              <div class="spc-profile-setup__saved alert alert-success">
                {{i18n (themePrefix "profile_setup.saved")}}
                <a href={{this.profileUrl}}>
                  {{i18n (themePrefix "profile_setup.view_profile")}}
                </a>
              </div>
            {{/if}}

            <div class="spc-profile-setup__actions">
              <DButton
                @translatedLabel={{if
                  this.saving
                  (i18n (themePrefix "profile_setup.saving"))
                  (i18n (themePrefix "profile_setup.save"))
                }}
                @action={{this.save}}
                @disabled={{this.saving}}
                @isLoading={{this.saving}}
                class="btn-primary spc-profile-setup__save"
              />
            </div>
          </ConditionalLoadingSpinner>
        {{else}}
          <div class="spc-profile-setup__login">
            <p>{{i18n (themePrefix "profile_setup.login_required")}}</p>
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
