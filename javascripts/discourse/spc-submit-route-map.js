export default function () {
  this.route("spc-submit", { path: "/submit" });

  // Critique mode gets its own *path* rather than riding on ?type=critique.
  // A boot-time `replaceWith()` to a URL that carries a query string makes
  // Ember append the top-level outlet view once per query-param pass, so the
  // whole app shell rendered three times over on a direct load of
  // /submit?type=critique. Redirecting to a plain path is what the challenge
  // flow has always done, and it renders exactly once. See
  // api-initializers/spc-photo-submit.js for the redirect and the permalinks.
  this.route("spc-submit-critique", { path: "/submit/critique" });
}
