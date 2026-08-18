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
// Body class and custom property critique-workspace.scss uses to relabel the
// Reply controls that open the workspace.
const BODY_CLASS = "spc-cw-topic";
const LABEL_VAR = "--spc-cw-start-label";

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

      // The topic-level Reply of a topic that passes this becomes the
      // critique: it opens the workspace and is labelled like the banner's
      // button. Draft-holding topics are excluded here, not only at click
      // time, so a button never promises the workspace and delivers the
      // composer.
      function topicOffersWorkspace(topic) {
        return Boolean(
          topic?.details?.can_create_post &&
            !topic.draft &&
            offersWorkspace(
              topic,
              topic.details?.created_by?.id ?? topic.user_id
            )
        );
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
              const interceptable =
                (!post || post.post_number === 1) &&
                !this.quoteState?.postId &&
                !(
                  composerModel &&
                  composerModel.topic?.id === topic?.id &&
                  composerModel.composeState !== Composer.CLOSED
                ) &&
                topicOffersWorkspace(topic);

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

      // Relabel the intercepted Reply controls with the banner button's own
      // string, so the two never disagree. The visible text is CSS: a body
      // class plus a custom property holding the label, rendered by
      // critique-workspace.scss through ::before over a font-size: 0 span -
      // never textContent, which detaches the node Glimmer tracks and kills
      // the next render transaction. The class/variable are page state, so
      // they need no element to exist yet; title and aria-label are set
      // directly and restored only if still ours, since the footer and
      // timeline buttons are reused across topics while the post-1 menu is
      // not.
      const router = owner.lookup("service:router");
      const relabelTimers = [];
      const RELABEL_SELECTORS = [
        "#topic-footer-buttons .topic-footer-main-buttons .create",
        ".timeline-footer-controls .reply-to-post",
        "#post_1 .post-controls .reply",
      ];

      function relabelReplyControls() {
        const onTopic = router.currentRouteName?.startsWith("topic.");
        const topic = onTopic ? owner.lookup("controller:topic")?.model : null;
        const offers = topicOffersWorkspace(topic);
        const label = I18n.t(themePrefix("critique_workspace.start"));

        document.body.classList.toggle(BODY_CLASS, offers);
        if (offers) {
          document.body.style.setProperty(LABEL_VAR, JSON.stringify(label));
        } else {
          document.body.style.removeProperty(LABEL_VAR);
        }

        document
          .querySelectorAll(RELABEL_SELECTORS.join(","))
          .forEach((button) => {
            if (offers) {
              if (button.dataset.spcOrigTitle === undefined) {
                button.dataset.spcOrigTitle = button.getAttribute("title") ?? "";
                button.dataset.spcOrigAria =
                  button.getAttribute("aria-label") ?? "";
              }
              button.setAttribute("title", label);
              button.setAttribute("aria-label", label);
            } else if (button.dataset.spcOrigTitle !== undefined) {
              // Restore only what is still ours: if Glimmer already
              // re-rendered the attribute for the new topic, leave it.
              if (button.getAttribute("title") === label) {
                button.setAttribute("title", button.dataset.spcOrigTitle);
              }
              if (button.getAttribute("aria-label") === label) {
                if (button.dataset.spcOrigAria) {
                  button.setAttribute("aria-label", button.dataset.spcOrigAria);
                } else {
                  button.removeAttribute("aria-label");
                }
              }
              delete button.dataset.spcOrigTitle;
              delete button.dataset.spcOrigAria;
            }
          });
      }

      // The footer, timeline and post menu render at different moments after
      // page:changed; a few fixed retries cover them without an observer.
      function scheduleRelabel() {
        relabelTimers.splice(0).forEach(clearTimeout);
        relabelReplyControls();
        [300, 1200].forEach((ms) =>
          relabelTimers.push(setTimeout(relabelReplyControls, ms))
        );
      }

      api.onPageChange(scheduleRelabel);

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
          // The post-1 menu is in the DOM by now; label it without waiting
          // for the page-change retries.
          scheduleRelabel();

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
