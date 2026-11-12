import { apiInitializer } from "discourse/lib/api";

export default apiInitializer((api) => {
  const applicationController = api.container.lookup(
    "controller:application"
  );

  // Collapsed by default, through core's own stored preference rather than
  // only the controller flag. When a phone turns sideways and crosses from
  // the mobile view to the desktop view, core recomputes showSidebar from
  // calculateShowSidebar(), which reads this key — with only the flag set,
  // that recompute re-opened the docked sidebar over half the screen.
  // Opening the sidebar by hand clears the key (core's toggleSidebar), so it
  // stays open for the rest of the visit; the next page load collapses it
  // again, as before.
  api.container
    .lookup("service:key-value-store")
    .setItem("sidebar-hidden", "true");
  applicationController.showSidebar = false;
});
