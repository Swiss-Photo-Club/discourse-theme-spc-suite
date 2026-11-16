import { i18n } from "discourse-i18n";
import { SPC_MEMBERS_GROUP_ID } from "../lib/spc-membership";

// "SPC Member" next to the name on the user card and the profile header.
// Rendered through core outlets (user-card-after-username, user-post-names),
// never by decorating core's name markup.
//
// Reads the viewed user's serialized `groups`, which is exactly what group
// 40's own visibility settings let this viewer see: its members list is
// visible to members (and staff) only, so anonymous visitors and signed-in
// non-members get an empty list and no badge. That is the group's privacy
// setting doing its job, not a bug.
const isMember = (user) =>
  (user?.groups || []).some((group) => group.id === SPC_MEMBERS_GROUP_ID);

const SpcMemberBadge = <template>
  {{#if (isMember (if @outletArgs.user @outletArgs.user @outletArgs.model))}}
    <span class="spc-member-badge">
      {{i18n (themePrefix "membership.badge")}}
    </span>
  {{/if}}
</template>;

export default SpcMemberBadge;
