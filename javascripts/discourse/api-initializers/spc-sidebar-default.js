import { apiInitializer } from "discourse/lib/api";

export default apiInitializer((api) => {
  const applicationController = api.container.lookup(
    "controller:application"
  );

  applicationController.showSidebar = false;

  // Turning a phone sideways crosses from the mobile view (sidebar as a
  // hamburger dropdown) to the desktop view, and core then re-opens the
  // docked sidebar over half the screen. Close it again on every
  // mobile→desktop switch, keyed to core's own `desktop-view` class on
  // <html> rather than to resize timing: the class flips after the resize
  // events have settled. One attribute observer, no subtree. A member who
  // opens the sidebar afterwards keeps it open until the next switch.
  const html = document.documentElement;
  let wasDesktop = html.classList.contains("desktop-view");
  new MutationObserver(() => {
    const isDesktop = html.classList.contains("desktop-view");
    if (isDesktop && !wasDesktop) {
      applicationController.showSidebar = false;
    }
    wasDesktop = isDesktop;
  }).observe(html, { attributes: true, attributeFilter: ["class"] });
});
