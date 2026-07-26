export default function () {
  this.route("spc-submit", { path: "/submit" });

  // Critique mode has its own path rather than riding on ?type=critique, so
  // the URL says what it opens and the route can set its own title without
  // reading a query param. /submit?type=critique still works for links shared
  // before this existed; see api-initializers/spc-photo-submit.js for the
  // redirects and the permalinks each entry URL needs.
  this.route("spc-submit-critique", { path: "/submit/critique" });

  // Reachable by typing the path only, until the category 7 hero is switched
  // over to it. There is no permalink for it yet either, so a direct load 404s
  // at the server — see api-initializers/spc-photo-submit.js for why every one
  // of these paths needs a permalink row of its own.
  this.route("spc-submit-project", { path: "/submit/project" });
}
