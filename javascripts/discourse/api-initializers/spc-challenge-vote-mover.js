import { getOwnerWithFallback } from "discourse/lib/get-owner"; 
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

const spcRun = (api) => { let moveQueued = false; function placeChallengeVote() { moveQueued = false; const isChallengeTopic = document.body.classList.contains("category-monthly-challenge") && document.body.classList.contains("archetype-regular"); const originalSlot = document.querySelector("#topic-title .title-voting"); const vote = document.querySelector( "#topic-title .voting-wrapper, #post_1 .spc-mobile-vote" ); const firstPostActions = document.querySelector( "#post_1 .post__menu-area .actions" ); if (isChallengeTopic && vote && firstPostActions) { vote.classList.add("spc-mobile-vote"); if (vote.parentElement !== firstPostActions) { firstPostActions.prepend(vote); } return; } if (vote && originalSlot && vote.parentElement !== originalSlot) { vote.classList.remove("spc-mobile-vote"); originalSlot.append(vote); } } function scheduleVotePlacement() { if (moveQueued) { return; } moveQueued = true; window.requestAnimationFrame(placeChallengeVote); } api.onPageChange(scheduleVotePlacement); new MutationObserver(scheduleVotePlacement).observe( document.querySelector("#main") || document.body, { childList: true, subtree: true } ); scheduleVotePlacement(); };

spcStartWhenReady(null, spcRun);

export default {
  name: "spc-challenge-vote-mover",
  after: "inject-objects",
  initialize(passedOwner) {
    spcStartWhenReady(passedOwner, spcRun);
  },
};
