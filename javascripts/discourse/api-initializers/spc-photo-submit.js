import { getOwnerWithFallback } from "discourse/lib/get-owner";
import DiscourseURL from "discourse/lib/url";
import SpcSubmitBanner from "../components/spc-submit-banner";

const SUBMIT_PATH = "/submit";

function isChallengeCategoryParam(params) {
  const categoryId = String(parseInt(settings.challenge_category_id, 10));
  const categorySlug = (settings.challenge_category_slug || "").trim();
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


let spcStarted = false;

function spcStartWhenReady(passedOwner, run) {
  const tryStart = () => {
    if (spcStarted) {
      return true;
    }
    let api = null;
    try {
      api = passedOwner?.lookup?.("plugin-api:main") || null;
    } catch {}
    if (!api) {
      try {
        const owner = getOwnerWithFallback(
          document.querySelector("#main-outlet") || document.body
        );
        api = owner?.lookup?.("plugin-api:main") || null;
      } catch {}
    }
    if (!api) {
      return false;
    }
    spcStarted = true;
    try {
      run(api);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[SPC]", e);
    }
    return true;
  };

  if (tryStart()) {
    return;
  }

  let attempts = 0;
  const retry = () => {
    if (!tryStart() && attempts++ < 20) {
      setTimeout(retry, 500);
    }
  };
  if (document.readyState === "complete") {
    setTimeout(retry, 0);
  } else {
    window.addEventListener("load", () => setTimeout(retry, 0), { once: true });
  }
}

const spcRun = (api) => {
  // Optional "Submit a photo" banner on the challenge category page
  api.renderInOutlet("before-list-area", SpcSubmitBanner);

  // /new-topic?category=monthly-challenge → /submit
  // This covers direct loads (via the /submit permalink), shared links and
  // any UI that links to the composer for the challenge category.
  api.modifyClass(
    "route:new-topic",
    (Superclass) =>
      class extends Superclass {
        async beforeModel(transition) {
          if (isChallengeCategoryParam(transition.to?.queryParams)) {
            this.router.replaceWith(SUBMIT_PATH);
            return;
          }
          return super.beforeModel(transition);
        }
      }
  );

  // The challenge hero's submit button and the core New Topic button open
  // the composer programmatically, so route them to /submit as well.
  if (settings.replace_new_topic_button) {
    const categoryId = parseInt(settings.challenge_category_id, 10);

    const clickHandler = (e) => {
      const el = e.target.closest?.(
        "#create-topic, .spc-challenge-hero__actions .spc-challenge-button--primary"
      );
      if (!el) {
        return;
      }

      let isChallenge = el.matches(".spc-challenge-button--primary");

      if (!isChallenge) {
        const router = api.container.lookup("service:router");
        const routeCategory =
          router?.currentRoute?.attributes?.category ||
          api.container.lookup("controller:navigation/category")?.category;
        isChallenge = routeCategory?.id === categoryId;
      }

      if (isChallenge) {
        e.preventDefault();
        e.stopImmediatePropagation();
        DiscourseURL.routeTo(SUBMIT_PATH);
      }
    };

    document.addEventListener("click", clickHandler, { capture: true });
  }
};

spcStartWhenReady(null, spcRun);

export default {
  name: "spc-photo-submit",
  after: "inject-objects",
  initialize(passedOwner) {
    spcStartWhenReady(passedOwner, spcRun);
  },
};
