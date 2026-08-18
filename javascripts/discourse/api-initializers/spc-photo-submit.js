import { apiInitializer } from "discourse/lib/api";
import DiscourseURL from "discourse/lib/url";
import Category from "discourse/models/category";
import SpcSubmitBanner from "../components/spc-submit-banner";

const SUBMIT_PATH = "/submit";
const CRITIQUE_PATH = "/submit/critique";
const PROJECT_PATH = "/submit/project";
const INTRODUCTION_PATH = "/submit/introduction";
const FEEDBACK_PATH = "/submit/feedback";
const PROFILE_SETUP_PATH = "/profile-setup";

function isCategoryParam(params, id) {
  const categoryId = String(parseInt(id, 10));
  // Derived, never a setting: a slug rename in category admin is followed
  // automatically, and the id clauses below still match if the lookup misses.
  const categorySlug = (
    Category.findById(parseInt(id, 10))?.slug || ""
  ).trim();
  const raw = params?.category || params?.category_id;
  if (!raw) {
    return false;
  }
  const value = String(raw);
  return (
    value === categoryId ||
    value === categorySlug ||
    value === `${categorySlug}/${categoryId}` ||
    value.endsWith(`/${categoryId}`)
  );
}


const spcRun = (api) => {
  // Optional "Submit a photo" banner on the challenge category page
  api.renderInOutlet("before-list-area", SpcSubmitBanner);

  // /new-topic?category=<challenge> → /submit
  // /new-topic?category=<critique>  → /submit/critique
  //
  // This covers direct loads, shared links and any UI that links to the
  // composer for either category. Direct loads matter because the server 404s
  // unknown top-level paths, so /submit only boots the app by way of an admin
  // permalink that points here.
  //
  // Discourse matches permalinks against the *full* path including the query
  // string (that is what `permalink_normalizations` exists to trim), so the
  // permalink `submit` matches /submit and nothing else — every entry URL needs
  // a permalink of its own. Required permalinks:
  //
  //   submit                 → /new-topic?category=monthly-challenge
  //   submit/critique        → /new-topic?category=photo-feedback
  //   submit?type=critique   → /new-topic?category=photo-feedback
  //   submit/project         → /new-topic?category=photo-feedback&spc_form=project
  //   submit/introduction    → /new-topic?category=introductions
  //   submit/feedback        → /new-topic?category=feedback
  //   profile-setup          → /new-topic?spc_form=profile
  //
  // The third only keeps links shared before July 2026 alive; they land on
  // /submit/critique like everything else. The fifth needs no mark: category 12
  // has exactly one form, so the category identifies it on its own — which is
  // the normal case, and the reason the fourth stands out.
  //
  // The fourth is where "the category carries the mode" runs out: an image
  // critique and a project critique both post into category 7, so the category
  // in the destination cannot tell them apart and the destination needs a mark
  // of its own. `spc_form` is that mark. It exists only inside the permalink's
  // destination — nobody ever sees or shares a URL carrying it — and route
  // :new-topic declares no query params of its own, so Ember passes it through
  // to transition.to.queryParams untouched. That was verified against the live
  // router rather than assumed: router.recognize() on the URL above returns
  // both `category` and `spc_form`.
  api.modifyClass(
    "route:new-topic",
    (Superclass) =>
      class extends Superclass {
        async beforeModel(transition) {
          const params = transition.to?.queryParams;

          // Checked before the category tests, because it is the more specific
          // claim: the project destination also names category 7, and the
          // critique branch below would otherwise swallow it.
          if (params?.spc_form === "project") {
            this.router.replaceWith(PROJECT_PATH);
            return;
          }

          // No category in this destination at all: the profile page posts no
          // topic, /new-topic is only the bootable path its permalink borrows.
          if (params?.spc_form === "profile") {
            this.router.replaceWith(PROFILE_SETUP_PATH);
            return;
          }

          if (isCategoryParam(params, settings.challenge_category_id)) {
            this.router.replaceWith(SUBMIT_PATH);
            return;
          }

          // Unguarded since the image wizard was deleted. This used to be
          // gated on critique_image_use_form so that turning the form off
          // restored the plain composer here too; with no wizard left to fall
          // back to, that switch is gone and the form is the only way in.
          if (isCategoryParam(params, settings.critique_category_id)) {
            this.router.replaceWith(CRITIQUE_PATH);
            return;
          }

          if (isCategoryParam(params, settings.critique_intro_category_id)) {
            this.router.replaceWith(INTRODUCTION_PATH);
            return;
          }

          if (isCategoryParam(params, settings.feedback_category_id)) {
            this.router.replaceWith(FEEDBACK_PATH);
            return;
          }

          return super.beforeModel(transition);
        }
      }
  );

  // The challenge hero and Discourse's native category action open the
  // composer programmatically, so route the workflows that own an SPC form
  // before core handles the click. Direct /new-topic links remain covered by
  // route:new-topic above.
  const challengeCategoryId = parseInt(settings.challenge_category_id, 10);
  const critiqueCategoryId = parseInt(settings.critique_category_id, 10);
  const introductionCategoryId = parseInt(
    settings.critique_intro_category_id,
    10
  );
  const feedbackCategoryId = parseInt(settings.feedback_category_id, 10);

  // Scoped to .spc-hero--challenge, and it has to stay that way. This selector
  // used to be ".spc-hero__actions .spc-button--primary", which was correct
  // only while the challenge was the sole hero on the site: the moment any
  // other category grew one, its primary button was silently hijacked to the
  // challenge photo-submission page. Nothing about the page would look wrong —
  // the button renders, the label is right, the click just goes somewhere
  // else. Verify this by clicking category 6's submit button, never by looking
  // at it.
  const CHALLENGE_PRIMARY =
    ".spc-hero--challenge .spc-hero__actions .spc-button--primary";

  const clickHandler = (e) => {
    const el = e.target.closest?.(`#create-topic, ${CHALLENGE_PRIMARY}`);
    if (!el) {
      return;
    }

    let destination = null;

    if (el.matches(CHALLENGE_PRIMARY)) {
      destination = settings.replace_new_topic_button ? SUBMIT_PATH : null;
    } else {
      const router = api.container.lookup("service:router");
      const routeCategory =
        router?.currentRoute?.attributes?.category ||
        api.container.lookup("controller:navigation/category")?.category;
      const routeCategoryId = Number(routeCategory?.id);

      if (
        settings.replace_new_topic_button &&
        routeCategoryId === challengeCategoryId
      ) {
        destination = SUBMIT_PATH;
      } else if (routeCategoryId === critiqueCategoryId) {
        destination = CRITIQUE_PATH;
      } else if (routeCategoryId === introductionCategoryId) {
        destination = INTRODUCTION_PATH;
      } else if (routeCategoryId === feedbackCategoryId) {
        destination = FEEDBACK_PATH;
      }
    }

    if (destination) {
      e.preventDefault();
      e.stopImmediatePropagation();
      DiscourseURL.routeTo(destination);
    }
  };

  document.addEventListener("click", clickHandler, { capture: true });
};

export default apiInitializer(spcRun);
