export default function () {
  this.route("spc-submit", { path: "/submit" });

  // Critique mode has its own path rather than riding on ?type=critique, so
  // the URL says what it opens and the route can set its own title without
  // reading a query param. /submit?type=critique still works for links shared
  // before this existed; see api-initializers/spc-photo-submit.js for the
  // redirects and the permalinks each entry URL needs.
  this.route("spc-submit-critique", { path: "/submit/critique" });

  this.route("spc-submit-project", { path: "/submit/project" });
  this.route("spc-submit-introduction", { path: "/submit/introduction" });
  this.route("spc-submit-feedback", { path: "/submit/feedback" });

  // Not a /submit form — the friendly profile page. It rides in this file so
  // the theme keeps a single route map; the file's name predates it.
  this.route("spc-profile-setup", { path: "/profile-setup" });
}
