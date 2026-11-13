// The homepage is two tabs of Discourse's top menu: Categories, the default
// since Phase E (so "/" renders it), and Latest. Every homepage band shows on
// both; only the category rows are specific to Categories. Read from the
// route, not the URL, so "/", "/categories" and "/latest" all resolve right
// whichever tab the top_menu site setting puts first.
export const HOME_ROUTES = ["discovery.categories", "discovery.latest"];

export function isHomeRoute(router) {
  return HOME_ROUTES.includes(router.currentRouteName);
}

export function isCategoriesHome(router) {
  return router.currentRouteName === "discovery.categories";
}
