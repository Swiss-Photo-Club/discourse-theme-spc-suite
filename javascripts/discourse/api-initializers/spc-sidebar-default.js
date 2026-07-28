import { apiInitializer } from "discourse/lib/api";

export default apiInitializer((api) => {
  const applicationController = api.container.lookup(
    "controller:application"
  );

  applicationController.showSidebar = false;
});
