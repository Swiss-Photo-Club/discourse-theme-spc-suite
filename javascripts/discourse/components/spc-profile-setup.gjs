import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { array, fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { getOwner } from "@ember/owner";
import didInsert from "@ember/render-modifiers/modifiers/did-insert";
import { service } from "@ember/service";
import ConditionalLoadingSpinner from "discourse/components/conditional-loading-spinner";
import DButton from "discourse/components/d-button";
import DEditor from "discourse/components/d-editor";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import DiscourseURL, { userPath } from "discourse/lib/url";
import UppyUpload from "discourse/lib/uppy/uppy-upload";
import { i18n } from "discourse-i18n";

// The Locations plugin's geocoded place picker. Resolved lazily — at
// component construction, i.e. when /profile-setup first renders — and NOT
// at module scope: the theme bundle can evaluate before the plugin's
// modules are registered with the loader, and an eval-time require then
// fails once and sticks as null even though the plugin is present.
// Verified live 2026-08-14: the served bundle carried an eval-time
// try/require and rendered the text fallback while the identical require
// succeeded from the console. A top-level import stays out for the same
// reason it always did — a hard dependency takes the whole theme's JS down
// if the plugin is ever removed; missing plugin here just means the plain
// core text input below.
function resolveLocationSelector() {
  try {
    return require(
      "discourse/plugins/discourse-locations/discourse/components/location-selector"
    ).default;
  } catch {
    return null;
  }
}

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
  @tracked geoLocation = null;
  @tracked avatarTemplate = null;
  @tracked saving = false;
  @tracked saved = false;
  @tracked error = null;

  locationSelector = resolveLocationSelector();

  get hasLocationSelector() {
    return Boolean(this.locationSelector);
  }

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
      this.geoLocation = this.parseGeoLocation(user.geo_location);
      this.avatarTemplate = user.avatar_template;
    } catch (e) {
      this.error = extractError(e);
    } finally {
      this.loading = false;
    }
  }

  // The serializer hands geo_location back as an object or a JSON string
  // depending on age of the data — same tolerance the plugin's own
  // preferences connector applies.
  parseGeoLocation(raw) {
    if (!raw || raw === "{}") {
      return null;
    }
    if (typeof raw === "object") {
      return Object.keys(raw).length ? raw : null;
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && Object.keys(parsed).length ? parsed : null;
    } catch {
      return null;
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

  // The picker calls back with a location object, an empty object on clear
  // (never undefined — the plugin notes undefined "won't stick"), and a
  // provider-only display row is filtered out by the selector itself.
  @action
  updateGeoLocation(location) {
    this.geoLocation =
      location && Object.keys(location).length ? location : null;
  }

  @action
  geoSearchError(error) {
    this.error = extractError(error);
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

  // Core collapses the profile header when you view your own summary, and
  // its Expand button just flips forceExpand on the (singleton) user
  // controller. Flip the same flag before navigating so the page arrives
  // expanded — this link exists to show the person what they saved. If core
  // ever renames the flag the set is inert and the page merely arrives
  // collapsed again.
  @action
  viewProfile(event) {
    event.preventDefault();
    getOwner(this).lookup("controller:user")?.set("forceExpand", true);
    DiscourseURL.routeTo(this.profileUrl);
  }

  @action
  async save() {
    this.saving = true;
    this.error = null;
    this.saved = false;

    try {
      const data = {
        website: this.website,
        location: this.location,
        bio_raw: this.bio,
      };

      // With the Locations plugin present, the picked place is the location:
      // geo_location as a JSON string (the shape the plugin's own preferences
      // save uses, empty string to clear), mirrored into core `location` so
      // the profile header and user card keep their plain-text line.
      if (this.hasLocationSelector) {
        data.custom_fields = {
          geo_location: this.geoLocation
            ? JSON.stringify(this.geoLocation)
            : "",
        };
        data.location = this.geoLocation?.address ?? "";
      }

      await ajax(userPath(`${this.currentUser.username_lower}.json`), {
        type: "PUT",
        data,
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
              {{! A span like the bio's: the picker renders its own input. }}
              <span class="spc-profile-setup__label">
                {{i18n (themePrefix "profile_setup.location_label")}}
                <span class="spc-profile-setup__optional">
                  {{i18n (themePrefix "form.optional")}}
                </span>
              </span>
              <p class="spc-profile-setup__hint">
                {{#if this.hasLocationSelector}}
                  {{i18n (themePrefix "profile_setup.location_hint_geo")}}
                {{else}}
                  {{i18n (themePrefix "profile_setup.location_hint")}}
                {{/if}}
              </p>
              {{#if this.hasLocationSelector}}
                <this.locationSelector
                  @location={{this.geoLocation}}
                  @onChangeCallback={{this.updateGeoLocation}}
                  @searchError={{this.geoSearchError}}
                  @geoAttrs={{array}}
                  @showType={{false}}
                  @placeholder={{i18n
                    (themePrefix "profile_setup.location_placeholder")
                  }}
                  class="spc-profile-setup__location-selector"
                />
              {{else}}
                <input
                  id="spc-profile-location"
                  type="text"
                  maxlength="255"
                  value={{this.location}}
                  {{on "input" (fn this.updateField "location")}}
                />
              {{/if}}
            </div>

            <div class="spc-profile-setup__field">
              {{! A span, not a label: DEditor renders its own textarea with
                  its own id, so a for= would point at nothing. }}
              <span class="spc-profile-setup__label">
                {{i18n (themePrefix "profile_setup.bio_label")}}
                <span class="spc-profile-setup__optional">
                  {{i18n (themePrefix "form.optional")}}
                </span>
              </span>
              <p class="spc-profile-setup__hint">
                {{i18n (themePrefix "profile_setup.bio_hint")}}
              </p>
              {{! The same markdown editor core uses for "About me" in
                  preferences, so the bio stays plain profile markdown.
                  Toolbar edits reach @change too: text manipulation
                  dispatches a synthetic bubbling "input" event on the
                  textarea, so saving right after a toolbar click loses
                  nothing. }}
              <DEditor
                @value={{this.bio}}
                @change={{fn this.updateField "bio"}}
              />
            </div>

            {{#if this.error}}
              <div class="spc-profile-setup__error alert alert-error">
                {{this.error}}
              </div>
            {{/if}}

            {{#if this.saved}}
              <div class="spc-profile-setup__saved alert alert-success">
                {{i18n (themePrefix "profile_setup.saved")}}
                {{! Still a real link (open-in-new-tab keeps working); the
                    click handler only adds the expand flag on same-tab
                    navigation. }}
                <a href={{this.profileUrl}} {{on "click" this.viewProfile}}>
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
