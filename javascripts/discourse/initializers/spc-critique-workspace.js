import { action } from "@ember/object";
import { withPluginApi } from "discourse/lib/plugin-api";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import Composer from "discourse/models/composer";
import I18n from "discourse-i18n";
import SpcCritiqueWorkspaceHost, {
  OPEN_WORKSPACE_EVENT,
} from "../components/spc-critique-workspace-host";
import SpcNextTopic from "../components/spc-next-topic";
import parseRequest, {
  parseProjectRequest,
} from "../lib/spc-parse-request";

const BANNER_CLASS = "spc-cw-banner";

// Every content image, in post order, for project critiques: the full-size
// lightbox href when there is one, the plain src for images below the
// lightbox threshold. Emojis and quoted posts are not content. Works on the
// rendered cooked element and on a DOMParser document of the cooked JSON
// alike - the lightbox anchor is server-side cooked HTML in both.
function collectImageUrls(root) {
  return [...root.querySelectorAll("img")]
    .filter(
      (img) => !img.classList.contains("emoji") && !img.closest(".quote")
    )
    .map(
      (img) =>
        img.closest("a.lightbox")?.getAttribute("href") ||
        img.getAttribute("src")
    )
    .filter(Boolean);
}

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

      const enabledCategories = (settings.workspace_enabled_categories || "")
        .toString()
        .split("|")
        .map((id) => parseInt(id, 10))
        .filter((id) => !isNaN(id));

      // The workspace is offered on the first post of a critique-category
      // topic to everyone but the photographer. Same test for the banner and
      // for the Reply interception below, so the two can never disagree.
      function offersWorkspace(topic, authorId) {
        if (!currentUser || !topic) {
          return false;
        }
        if (
          enabledCategories.length &&
          !enabledCategories.includes(topic.category_id)
        ) {
          return false;
        }
        // Don't offer the workspace to the photographer on their own post.
        return authorId !== currentUser.id;
      }

      // `postData` is the /posts/:id.json payload (raw included), which is
      // what the parsers need; the drawer's model is built here and nowhere
      // else, so the banner button and Reply hand it the same shape.
      function openWorkspace(topic, postData, imageUrls) {
        appEvents.trigger(OPEN_WORKSPACE_EVENT, {
          topicId: topic.id,
          topicTitle: topic.title,
          postId: postData.id,
          authorName: postData.name || postData.username,
          imageUrl: imageUrls[0] || null,
          imageUrls,
          request: parseRequest(postData.raw),
          // null for single-image posts; the drawer renders the project
          // shape when it is present.
          project: parseProjectRequest(postData.raw),
        });
      }

      // In a critique category the topic-level Reply IS the critique, so the
      // footer Reply, the timeline Reply, shift+R and the first post's own
      // Reply open the workspace instead of the composer. Replies to later
      // posts (discussion under a critique), quotes and topics with a saved
      // composer draft keep the composer: those are conversation, not
      // critique, and a draft must stay reachable. controller:topic is the
      // single funnel all four entry points share, and it is instantiated
      // on entering the route - unlike service:composer, which
      // spc-monthly-challenge looks up at boot and modifyClass would then
      // refuse to touch.
      api.modifyClass(
        "controller:topic",
        (Superclass) =>
          class extends Superclass {
            @action
            async replyToPost(post) {
              const topic = post ? post.topic : this.model;
              const composerModel = this.composer?.model;
              const authorId =
                topic?.details?.created_by?.id ?? topic?.user_id;
              const interceptable =
                (!post || post.post_number === 1) &&
                topic?.details?.can_create_post &&
                !topic.draft &&
                !this.quoteState?.postId &&
                !(
                  composerModel &&
                  composerModel.topic?.id === topic.id &&
                  composerModel.composeState !== Composer.CLOSED
                ) &&
                offersWorkspace(topic, authorId);

              if (!interceptable) {
                return super.replyToPost(post);
              }

              try {
                const data = await ajax(
                  `/posts/by_number/${topic.id}/1.json`,
                  { data: { include_raw: true } }
                );
                const cooked = new DOMParser().parseFromString(
                  data.cooked || "",
                  "text/html"
                ).body;
                openWorkspace(topic, data, collectImageUrls(cooked));
              } catch (error) {
                popupAjaxError(error);
              }
            }
          }
      );

      api.decorateCookedElement(
        (element, helper) => {
          if (!helper) {
            return;
          }
          const post = helper.getModel();
          if (!post || post.post_number !== 1 || post.deleted_at) {
            return;
          }
          const topic = post.topic;
          if (!offersWorkspace(topic, post.user_id)) {
            return;
          }
          if (element.querySelector(`.${BANNER_CLASS}`)) {
            return;
          }

          const imageUrls = collectImageUrls(element);

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
              openWorkspace(topic, data, imageUrls);
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
