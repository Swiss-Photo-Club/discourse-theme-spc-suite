import Component from "@glimmer/component";
import { action } from "@ember/object";
import { service } from "@ember/service";
import DButton from "discourse/components/d-button";
import DiscourseURL from "discourse/lib/url";
import { i18n } from "discourse-i18n";
import { or } from "truth-helpers";

// The chrome every /submit/* page shares: the page shell, the header with its
// close button, the signed-out gate, the error slot and the actions row. It
// owns no form state — the fields and everything that validates or posts them
// live in the calling component, which extends lib/spc-submit-base.
//
// Two named blocks:
//
//   <:meta>   optional, sits in the header beside the heading. Only the
//             challenge form uses it, for the round tag.
//   <:fields> the form body, rendered only when someone is signed in.
//
// The signed-out gate is here rather than in the base class because it is the
// one piece of this that is purely markup: a form with no fields rendered has
// nothing to validate, so no mode needs to know about it.

export default class SpcSubmitShell extends Component {
  @service currentUser;

  get submitIcon() {
    return this.args.submitIcon ?? "camera";
  }

  @action
  goToLogin() {
    DiscourseURL.routeTo("/login");
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

        {{#if this.currentUser}}
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
            <p>{{i18n (themePrefix "form.login_required")}}</p>
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
