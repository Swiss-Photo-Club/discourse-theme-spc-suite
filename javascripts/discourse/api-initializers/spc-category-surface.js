import { apiInitializer } from "discourse/lib/api";
import SpcCardMeta from "../components/spc-card-meta";
import SpcCategorySurface from "../components/spc-category-surface";

export default apiInitializer((api) => {
  api.renderInOutlet("above-main-container", SpcCategorySurface);
  // Gallery card author and number; see spc-card-meta.gjs.
  api.renderInOutlet("topic-list-main-link-bottom", SpcCardMeta);
});
