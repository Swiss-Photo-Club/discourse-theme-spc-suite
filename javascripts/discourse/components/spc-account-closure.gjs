import Component from "@glimmer/component";
import { service } from "@ember/service";
import getURL from "discourse/lib/get-url";
import { i18n } from "discourse-i18n";
import { settings, themePrefix } from "virtual:theme";

export default class SpcAccountClosure extends Component {
  @service currentUser;

  get isOwnAccount() {
    return (
      this.currentUser &&
      this.args.outletArgs?.model?.id === this.currentUser.id
    );
  }

  get requestUrl() {
    const params = new URLSearchParams({
      groupname: settings.account_closure_request_group.trim(),
      title: i18n(themePrefix("account_closure.message_title")),
      body: i18n(themePrefix("account_closure.message_body"), {
        username: this.currentUser.username,
      }),
    });

    return getURL(`/new-message?${params}`);
  }

  get contactUrl() {
    return getURL("/about");
  }

  <template>
    {{#if this.isOwnAccount}}
      <section
        class="control-group spc-account-closure"
        aria-labelledby="spc-account-closure-title"
      >
        <h2 id="spc-account-closure-title" class="control-label">
          {{i18n (themePrefix "account_closure.title")}}
        </h2>
        <div class="controls">
          <p>{{i18n (themePrefix "account_closure.description")}}</p>
          <p>{{i18n (themePrefix "account_closure.export_reminder")}}</p>
          {{#if this.currentUser.can_send_private_messages}}
            <a href={{this.requestUrl}} class="btn btn-default">
              {{i18n (themePrefix "account_closure.request")}}
            </a>
            <p class="instructions">
              {{i18n (themePrefix "account_closure.request_help")}}
            </p>
          {{else}}
            <p>{{i18n (themePrefix "account_closure.messaging_unavailable")}}</p>
            <a href={{this.contactUrl}} class="btn btn-default">
              {{i18n (themePrefix "account_closure.contact")}}
            </a>
          {{/if}}
        </div>
      </section>
    {{/if}}
  </template>
}
