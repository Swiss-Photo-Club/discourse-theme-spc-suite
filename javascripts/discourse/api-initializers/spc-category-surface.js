import { apiInitializer } from "discourse/lib/api";
import SpcCategorySurface from "../components/spc-category-surface";

export default apiInitializer((api) => {
  api.renderInOutlet("above-main-container", SpcCategorySurface);
});
