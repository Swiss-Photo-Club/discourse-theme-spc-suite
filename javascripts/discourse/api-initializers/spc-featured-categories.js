import { settings } from "virtual:theme";
import { apiInitializer } from "discourse/lib/api";
import SpcFeaturedCategories from "../components/spc-featured-categories";

export default apiInitializer((api) => {
  if (!settings.enable_local_featured_categories) {
    return;
  }

  api.renderInOutlet("above-main-container", SpcFeaturedCategories);
});
