import { withPluginApi } from "discourse/lib/plugin-api";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import I18n from "discourse-i18n";
import SpcCritiqueWorkspaceHost, {
  OPEN_WORKSPACE_EVENT,
} from "../components/spc-critique-workspace-host";
import SpcNextTopic from "../components/spc-next-topic";
import parseRequest, {
  parseProjectRequest,
} from "../lib/spc-parse-request";

const BANNER_CLASS = "spc-cw-banner";

export default {
  name: "spc-critique-workspace",

  initialize(owner) {
    if (!settings.enable_critique_workspace) {
      return;
    }

    withPluginApi("1.8.0", (api) => {
      // Part of the critique flow on purpose: disabling the workspace also
      // removes the next-topic queue button. The component gates itself on
      // workspace_enabled_categories and hides when no same-category
      // suggestion exists.
      api.renderInOutlet("topic-above-post-stream", SpcNextTopic);
      // The workspace drawer host. NOT the modal service: core modals the
      // editor opens (insert link) would evict a service modal and the draft
      // with it. The drawer sits under core's modal layer instead.
      api.renderInOutlet("topic-above-post-stream", SpcCritiqueWorkspaceHost);

      const appEvents = owner.lookup("service:app-events");
      const currentUser = owner.lookup("service:current-user");
      const siteSettings = owner.lookup("service:site-settings");

      const enabledCategories = (settings.workspace_enabled_categories || "")
        .toString()
        .split("|")
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      api.decorateCookedElement(
        (element, helper) => {
          if (!helper) {
            return;
          }
          const post = helper.getModel();
          if (!post || post.post_number !== 1 || post.deleted_at) {
            return;
          }
          if (!currentUser) {
            return;
          }
          const topic = post.topic;
          const categoryId = topic?.category_id;
          if (
            enabledCategories.length &&
            !enabledCategories.includes(categoryId)
          ) {
            return;
          }
          // Don't offer the workspace to the photographer on their own post.
          if (post.user_id === currentUser.id) {
            return;
          }
          if (element.querySelector(`.${BANNER_CLASS}`)) {
            return;
          }

          // Every content image, in post order, for project critiques: the
          // full-size lightbox href when there is one, the plain src for
          // images below the lightbox threshold. Emojis and quoted posts
          // are not content.
          const imageUrls = [...element.querySelectorAll("img")]
            .filter(
              (img) =>
                !img.classList.contains("emoji") && !img.closest(".quote")
            )
            .map(
              (img) =>
                img.closest("a.lightbox")?.getAttribute("href") ||
                img.getAttribute("src")
            )
            .filter(Boolean);
          const imageUrl = imageUrls[0] || null;

          const banner = document.createElement("div");
          banner.className = BANNER_CLASS;
          banner.innerHTML = `
            <div class="${BANNER_CLASS}__text">
              <h3>${I18n.t(themePrefix("critique_workspace.banner_title"))}</h3>
              <p>${I18n.t(themePrefix("critique_workspace.banner_text"))}</p>
            </div>
          `;

          const button = document.createElement("button");
          button.className = `btn btn-primary ${BANNER_CLASS}__button`;
          button.type = "button";
          button.textContent = I18n.t(themePrefix("critique_workspace.start"));
          button.addEventListener("click", async () => {
            button.disabled = true;
            try {
              const data = await ajax(`/posts/${post.id}.json`, {
                data: { include_raw: true },
              });
              appEvents.trigger(OPEN_WORKSPACE_EVENT, {
                topicId: topic.id,
                topicTitle: topic.title,
                postId: post.id,
                authorName: post.name || post.username,
                imageUrl,
                imageUrls,
                request: parseRequest(data.raw),
                // null for single-image posts; commit B teaches the drawer
                // to render the project shape.
                project: parseProjectRequest(data.raw),
              });
            } catch (error) {
              popupAjaxError(error);
            } finally {
              button.disabled = false;
            }
          });

          banner.appendChild(button);
          element.appendChild(banner);
        },
        { id: "spc-critique-workspace", onlyStream: true }
      );
    });
  },
};
