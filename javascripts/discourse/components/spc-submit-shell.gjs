import Component from "@glimmer/component";
import { action } from "@ember/object";
import { service } from "@ember/service";
import DButton from "discourse/components/d-button";
import DiscourseURL from "discourse/lib/url";
import { i18n } from "discourse-i18n";
import { or } from "truth-helpers";
import { isSpcMember, membersOnlyUrl } from "../lib/spc-membership";

// The chrome every /submit/* page shares: the page shell, the header with its
// close button, the members-only gate, the error slot and the actions row. It
// owns no form state — the fields and everything that validates or posts them
// live in the calling component, which extends lib/spc-submit-base.
//
// Two named blocks:
//
//   <:meta>   optional, sits in the header beside the heading. Only the
//             challenge form uses it, for the round tag.
//   <:fields> the form body, rendered only for community members.
//
// The gate is here rather than in the base class because it is the one piece
// of this that is purely markup: a form with no fields rendered has nothing to
// validate, so no mode needs to know about it. Normally nobody sees it — the
// /submit/* routes already send non-members to the members-only page in
// beforeModel — it is the fallback for a shell rendered any other way, and it
// keeps a signed-in non-member from filling in a form Discourse will 403.

export default class SpcSubmitShell extends Component {
  @service currentUser;

  get submitIcon() {
    return this.args.submitIcon ?? "camera";
  }

  get canPost() {
    return isSpcMember(this.currentUser);
  }

  get gateMessage() {
    return this.currentUser
      ? i18n(themePrefix("form.members_only"))
      : i18n(themePrefix("form.login_required"));
  }

  get gateButton() {
    return this.currentUser
      ? i18n(themePrefix("form.members_only_button"))
      : i18n(themePrefix("form.login_button"));
  }

  @action
  goToGate() {
    // Members-only page when configured (it offers sign-in, trial and
    // membership per visitor state); Discourse's own login otherwise.
    const url = membersOnlyUrl();
    if (url) {
      DiscourseURL.redirectTo(url);
    } else {
      DiscourseURL.routeTo("/login");
    }
  }

  <template>
    <div class="spc-submit-page">
      <div class="spc-submit-page__inner">
        <div class="spc-submit-page__header">
          <h1>{{@heading}}</h1>
          {{yield to="meta"}}
          {{! Inside the header, not after it, so it sits above the rule. The
              header wraps, and the lead is styled to claim a whole line. }}
          {{#if @lead}}
            <p class="spc-submit-page__lead">{{@lead}}</p>
          {{/if}}
          <DButton
            @icon="xmark"
            @action={{@onCancel}}
            class="btn-flat spc-submit-page__close"
          />
        </div>

        {{#if this.canPost}}
          {{yield to="fields"}}

          {{#if @error}}
            <div class="spc-submit-page__error alert alert-error">
              {{@error}}
            </div>
          {{/if}}

          <div class="spc-submit-page__actions">
            <DButton
              @icon={{this.submitIcon}}
              @translatedLabel={{if
                @submitting
                (i18n (themePrefix "form.submitting"))
                @submitLabel
              }}
              @action={{@onSubmit}}
              @disabled={{or @submitting @submitDisabled}}
              @isLoading={{@submitting}}
              class="btn-primary btn-large spc-submit-page__submit"
            />
            <DButton
              @translatedLabel={{i18n (themePrefix "form.cancel")}}
              @action={{@onCancel}}
              class="btn-flat"
            />
          </div>
        {{else}}
          <div class="spc-submit-page__login">
            <p>{{this.gateMessage}}</p>
            <DButton
              @translatedLabel={{this.gateButton}}
              @action={{this.goToGate}}
              class="btn-primary"
            />
          </div>
        {{/if}}
      </div>
    </div>
  </template>
}
