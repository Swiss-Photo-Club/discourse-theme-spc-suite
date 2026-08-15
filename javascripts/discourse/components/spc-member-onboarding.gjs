import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { userPath } from "discourse/lib/url";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";

const STEP_IDS = ["profile", "introduce", "first_photo"];

// Progress is derived from the server, not remembered per browser: a member
// who introduced themselves from a laptop is done on their phone too. The
// three checks are one request each, so they run only when the panel is
// actually about to render (homepage, member, not dismissed, not already
// known complete) and never more than once per REFRESH_MIN_INTERVAL_MS. A
// failed round backs off for FAILURE_COOL_OFF_MS instead of retrying on the
// next route change.
const REFRESH_MIN_INTERVAL_MS = 30 * 1000;
const FAILURE_COOL_OFF_MS = 60 * 1000;

let cache = { userId: null, promise: null, startedAt: 0, failed: false };

async function hasTopicIn(username, categoryId) {
  if (!categoryId) {
    return false;
  }

  const result = await ajax(
    `/topics/created-by/${encodeURIComponent(username)}.json`,
    { data: { category: categoryId } }
  );

  return (result?.topic_list?.topics?.length ?? 0) > 0;
}

async function hasProfile(username) {
  const { user } = await ajax(userPath(`${username}.json`));
  const hasAvatar =
    Boolean(user?.avatar_template) &&
    !user.avatar_template.includes("letter_avatar");
  const hasDetails = Boolean(
    user?.bio_raw?.trim() ||
      user?.bio_excerpt?.trim() ||
      user?.location?.trim() ||
      user?.website?.trim()
  );

  return hasAvatar && hasDetails;
}

function loadCompletion(currentUser) {
  const now = Date.now();
  const freshFor = cache.failed ? FAILURE_COOL_OFF_MS : REFRESH_MIN_INTERVAL_MS;

  if (
    cache.userId === currentUser.id &&
    cache.promise &&
    now - cache.startedAt < freshFor
  ) {
    return cache.promise;
  }

  const username = currentUser.username_lower;
  const promise = Promise.all([
    hasProfile(username),
    hasTopicIn(username, settings.critique_intro_category_id),
    hasTopicIn(username, settings.critique_category_id),
  ])
    .then(([profile, introduce, first_photo]) => ({
      profile,
      introduce,
      first_photo,
    }))
    .catch(() => {
      cache.failed = true;
      return null;
    });

  cache = { userId: currentUser.id, promise, startedAt: now, failed: false };
  return promise;
}

export default class SpcMemberOnboarding extends Component {
  @service currentUser;
  @service router;

  @tracked dismissed = false;
  @tracked knownComplete = false;
  @tracked completion = null;

  constructor() {
    super(...arguments);

    if (!this.currentUser) {
      return;
    }

    try {
      this.dismissed = localStorage.getItem(this.dismissedStorageKey) === "1";
      this.knownComplete =
        localStorage.getItem(this.completeStorageKey) === "1";
    } catch {
      this.dismissed = false;
      this.knownComplete = false;
    }

    this.router.on("routeDidChange", this.refresh);
    this.refresh();
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.router.off("routeDidChange", this.refresh);
  }

  get storagePrefix() {
    return `spc-member-onboarding:${settings.onboarding_dismissal_version}:${this.currentUser?.id}`;
  }

  get dismissedStorageKey() {
    return `${this.storagePrefix}:dismissed`;
  }

  // Set once every step has been seen complete, so a finished member never
  // pays for the three requests again on this browser. One-way: nothing here
  // un-completes a step.
  get completeStorageKey() {
    return `${this.storagePrefix}:complete`;
  }

  get isHomepage() {
    const path = this.router.currentURL?.split("?")[0];

    // Discourse sends signed-in users to /latest for the topics homepage,
    // while guests commonly remain on /. Both routes render the same home
    // surface and should share the onboarding panel.
    return path === "/" || path === "/latest";
  }

  get isMember() {
    if (Object.hasOwn(settings, "user_in_onboarding_member_groups")) {
      return settings.user_in_onboarding_member_groups;
    }

    if (!this.currentUser) {
      return false;
    }

    const memberGroupIds = String(settings.onboarding_member_groups || "")
      .split("|")
      .filter(Boolean)
      .map(Number);

    return (this.currentUser.groups || []).some((group) =>
      memberGroupIds.includes(group.id)
    );
  }

  get needsData() {
    return (
      this.isHomepage &&
      Boolean(this.currentUser) &&
      this.isMember &&
      !this.dismissed &&
      !this.knownComplete
    );
  }

  @action
  async refresh() {
    if (!this.needsData) {
      return;
    }

    const completion = await loadCompletion(this.currentUser);

    if (this.isDestroying || this.isDestroyed || !completion) {
      return;
    }

    this.completion = completion;

    if (STEP_IDS.every((stepId) => completion[stepId])) {
      this.knownComplete = true;

      try {
        localStorage.setItem(this.completeStorageKey, "1");
      } catch {
        // The panel still hides for this page when storage is unavailable.
      }
    }
  }

  get completedCount() {
    if (!this.completion) {
      return 0;
    }

    return STEP_IDS.filter((stepId) => this.completion[stepId]).length;
  }

  get isComplete() {
    return this.knownComplete || this.completedCount === STEP_IDS.length;
  }

  get shouldShow() {
    return this.needsData && Boolean(this.completion) && !this.isComplete;
  }

  get displayName() {
    return (
      this.currentUser?.name?.trim().split(/\s+/)[0] ||
      this.currentUser?.username
    );
  }

  get steps() {
    const activeStepId = STEP_IDS.find((stepId) => !this.completion?.[stepId]);

    return [
      {
        id: "profile",
        number: 1,
        label: i18n(themePrefix("onboarding.steps.profile")),
        cta: i18n(themePrefix("onboarding.actions.profile")),
        url: settings.onboarding_profile_url,
      },
      {
        id: "introduce",
        number: 2,
        label: i18n(themePrefix("onboarding.steps.introduce")),
        cta: i18n(themePrefix("onboarding.actions.introduce")),
        url: "/submit/introduction",
      },
      {
        id: "first_photo",
        number: 3,
        label: i18n(themePrefix("onboarding.steps.first_photo")),
        cta: i18n(themePrefix("onboarding.actions.first_photo")),
        // Both this and the introduce step above were six settings between
        // them - onboarding_introduce_url_{de,en,fr} and
        // onboarding_first_photo_url_{de,en,fr} - which existed only because the
        // wizards carried their locale in the path. The forms do not: they read
        // the interface language themselves, so one URL serves all three and
        // there is nothing left to keep in step.
        url: "/submit/critique",
      },
    ].map((step) => {
      const completed = Boolean(this.completion?.[step.id]);
      const active = step.id === activeStepId;

      return {
        ...step,
        completed,
        active,
        stateClass: completed
          ? "is-complete"
          : active
            ? "is-active"
            : "is-pending",
      };
    });
  }

  @action
  dismiss() {
    this.dismissed = true;

    try {
      localStorage.setItem(this.dismissedStorageKey, "1");
    } catch {
      // Dismissal still applies until the page is reloaded.
    }
  }

  <template>
    {{#if this.shouldShow}}
      <section
        class="spc-member-onboarding spc-member-onboarding--progress-{{this.completedCount}}"
        aria-labelledby="spc-member-onboarding-title"
      >
        <div class="spc-member-onboarding__header">
          <div class="spc-member-onboarding__intro">
            <h2 id="spc-member-onboarding-title">
              {{i18n
                (themePrefix "onboarding.title")
                name=this.displayName
              }}
            </h2>
            <p>
              {{i18n (themePrefix "onboarding.subtitle")}}
            </p>
          </div>

          <div class="spc-member-onboarding__progress">
            <span class="spc-member-onboarding__progress-label">
              {{i18n
                (themePrefix "onboarding.progress")
                completed=this.completedCount
                total=3
              }}
            </span>
            <span class="spc-member-onboarding__progress-track" aria-hidden="true">
              <span class="spc-member-onboarding__progress-fill"></span>
            </span>
          </div>
        </div>

        <ol class="spc-member-onboarding__steps">
          {{#each this.steps as |step|}}
            <li class={{step.stateClass}}>
              <a href={{step.url}}>
                <span class="spc-member-onboarding__step-marker" aria-hidden="true">
                  {{#if step.completed}}✓{{else}}{{step.number}}{{/if}}
                </span>

                <span class="spc-member-onboarding__step-content">
                  <span class="spc-member-onboarding__step-label">
                    {{step.label}}
                  </span>

                  {{#if step.completed}}
                    <span class="spc-member-onboarding__step-status">
                      {{i18n (themePrefix "onboarding.completed")}}
                    </span>
                  {{else if step.active}}
                    <span class="spc-member-onboarding__step-cta">
                      {{step.cta}}
                    </span>
                  {{/if}}
                </span>
              </a>
            </li>
          {{/each}}
        </ol>

        <button
          type="button"
          class="spc-member-onboarding__dismiss"
          aria-label={{i18n (themePrefix "onboarding.dismiss")}}
          title={{i18n (themePrefix "onboarding.dismiss")}}
          {{on "click" this.dismiss}}
        >
          ×
        </button>
      </section>
    {{/if}}
  </template>
}
