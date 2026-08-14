import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { on } from "@ember/modifier";
import { service } from "@ember/service";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";

const STEP_IDS = ["profile", "introduce", "first_photo"];

export default class SpcMemberOnboarding extends Component {
  @service currentUser;
  @service router;

  @tracked dismissed = false;
  @tracked completedSteps = [];

  constructor() {
    super(...arguments);

    if (!this.currentUser) {
      return;
    }

    try {
      this.dismissed = localStorage.getItem(this.dismissedStorageKey) === "1";

      const storedSteps = JSON.parse(
        localStorage.getItem(this.progressStorageKey) || "[]"
      );

      if (Array.isArray(storedSteps)) {
        this.completedSteps = storedSteps.filter((stepId) =>
          STEP_IDS.includes(stepId)
        );
      }
    } catch {
      this.dismissed = false;
      this.completedSteps = [];
    }
  }

  get storagePrefix() {
    return `spc-member-onboarding:${settings.onboarding_dismissal_version}:${this.currentUser?.id}`;
  }

  get dismissedStorageKey() {
    return `${this.storagePrefix}:dismissed`;
  }

  get progressStorageKey() {
    return `${this.storagePrefix}:completed`;
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

  get completedCount() {
    return this.completedSteps.length;
  }

  get isComplete() {
    return this.completedCount === STEP_IDS.length;
  }

  get shouldShow() {
    return (
      this.isHomepage &&
      Boolean(this.currentUser) &&
      this.isMember &&
      !this.dismissed &&
      !this.isComplete
    );
  }

  get displayName() {
    return (
      this.currentUser?.name?.trim().split(/\s+/)[0] ||
      this.currentUser?.username
    );
  }

  get steps() {
    const activeStepId = STEP_IDS.find(
      (stepId) => !this.completedSteps.includes(stepId)
    );

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
      const completed = this.completedSteps.includes(step.id);
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
        complete: () => this.completeStep(step.id),
      };
    });
  }

  persistProgress() {
    try {
      localStorage.setItem(
        this.progressStorageKey,
        JSON.stringify(this.completedSteps)
      );
    } catch {
      // The panel still works for this page when storage is unavailable.
    }
  }

  completeStep(stepId) {
    if (this.completedSteps.includes(stepId)) {
      return;
    }

    this.completedSteps = [...this.completedSteps, stepId];
    this.persistProgress();
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
              <a href={{step.url}} {{on "click" step.complete}}>
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
