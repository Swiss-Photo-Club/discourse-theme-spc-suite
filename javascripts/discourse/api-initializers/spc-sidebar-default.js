import { apiInitializer } from "discourse/lib/api";

export default apiInitializer((api) => {
  const applicationController = api.container.lookup(
    "controller:application"
  );
  const site = api.container.lookup("service:site");

  applicationController.showSidebar = false;

  // Turning a phone sideways crosses from the mobile view (sidebar as a
  // hamburger dropdown) to the desktop view, and core then re-opens the
  // docked sidebar over half the screen. Close it again on every
  // mobile→desktop switch. Read after a short delay so core has updated
  // site.mobileView first; a member who opens it afterwards keeps it open.
  let wasMobile = site.mobileView;
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (wasMobile && !site.mobileView) {
        applicationController.showSidebar = false;
      }
      wasMobile = site.mobileView;
    }, 250);
  });
});
