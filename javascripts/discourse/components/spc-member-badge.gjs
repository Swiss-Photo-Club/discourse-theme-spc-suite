import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { i18n } from "discourse-i18n";
import { SPC_MEMBERS_GROUP_ID } from "../lib/spc-membership";

// One lookup per username per page load. The promise is cached, so opening
// the same card twice (or while the first lookup is in flight) costs nothing.
const cardLookups = new Map();

function lookUpMembership(username) {
  if (!cardLookups.has(username)) {
    cardLookups.set(
      username,
      ajax(`/groups/members/members.json`, {
        data: { filter: username, limit: 5 },
      })
        .then(({ members }) =>
          (members || []).some(
            (m) => m.username.toLowerCase() === username.toLowerCase()
          )
        )
        .catch(() => false)
    );
  }
  return cardLookups.get(username);
}

// "SPC Member" next to the name on the user card and the profile header.
// Rendered through core outlets (user-card-after-username, user-post-names),
// never by decorating core's name markup.
//
// The profile's user model carries `groups`; the card's (card.json) does not,
// so for the card the badge asks group 40's member list for that one
// username — on click, never from an observer. Group 40's members list is
// visible to members and staff only: anonymous visitors and signed-in
// non-members see no badge anywhere. That is the group's privacy setting
// doing its job, not a bug; anonymous viewers are not even asked (403).
export default class SpcMemberBadge extends Component {
  @service currentUser;

  // username → boolean, filled as lookups resolve. Keyed rather than a single
  // flag because core may keep this outlet mounted while the card switches
  // from one user to the next.
  @tracked cardResults = {};

  // The card passes @user, the profile header @model.
  get user() {
    return this.args.outletArgs?.user ?? this.args.outletArgs?.model;
  }

  get isMember() {
    const groups = this.user?.groups;
    if (Array.isArray(groups)) {
      return groups.some((group) => group.id === SPC_MEMBERS_GROUP_ID);
    }

    const username = this.user?.username;
    if (!username || !this.currentUser) {
      return false;
    }
    if (!(username in this.cardResults)) {
      lookUpMembership(username).then((member) => {
        if (!this.isDestroying && !this.isDestroyed) {
          this.cardResults = { ...this.cardResults, [username]: member };
        }
      });
    }
    return this.cardResults[username] === true;
  }

  <template>
    {{#if this.isMember}}
      <span class="spc-member-badge">
        {{i18n (themePrefix "membership.badge")}}
      </span>
    {{/if}}
  </template>
}
