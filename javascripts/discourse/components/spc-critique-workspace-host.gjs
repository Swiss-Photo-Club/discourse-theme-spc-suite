import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { service } from "@ember/service";
import SpcCritiqueWorkspace from "./spc-critique-workspace";

export const OPEN_WORKSPACE_EVENT = "spc:critique-workspace:open";

// Mounts the critique workspace as a bottom drawer instead of a service
// modal. The modal service shows exactly one modal at a time, so any core
// modal the editor opens (insert link, and whatever Phase 3 brings) was
// evicting the workspace and its draft with it. As a drawer the workspace
// sits below core's modal layer: editor popups stack above it and return
// cleanly, and the topic stays scrollable behind it.
//
// Lives in the topic outlet, so navigating away unmounts it - closing the
// workspace with the topic it belongs to.
export default class SpcCritiqueWorkspaceHost extends Component {
  @service appEvents;

  @tracked model = null;

  constructor() {
    super(...arguments);
    this.appEvents.on(OPEN_WORKSPACE_EVENT, this, this.open);
    document.addEventListener("keydown", this.onKeydown);
  }

  willDestroy() {
    super.willDestroy(...arguments);
    this.appEvents.off(OPEN_WORKSPACE_EVENT, this, this.open);
    document.removeEventListener("keydown", this.onKeydown);
  }

  open(model) {
    this.model = model;
  }

  @action
  close() {
    this.model = null;
  }

  // ESC closes the drawer - unless a real modal (the editor's link dialog)
  // or the workspace's own full-size lightbox is stacked on top, in which
  // case ESC belongs to that layer.
  onKeydown = (event) => {
    if (
      event.key === "Escape" &&
      this.model &&
      !document.querySelector(".d-modal, .spc-cw-lightbox")
    ) {
      this.close();
    }
  };

  <template>
    {{#if this.model}}
      <SpcCritiqueWorkspace @model={{this.model}} @closeModal={{this.close}} />
    {{/if}}
  </template>
}
