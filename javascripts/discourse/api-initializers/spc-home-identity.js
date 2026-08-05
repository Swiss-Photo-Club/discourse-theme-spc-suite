import { apiInitializer } from "discourse/lib/api";
import SpcHomeIdentity from "../components/spc-home-identity";

export default apiInitializer((api) => {
  api.renderInOutlet("above-main-container", SpcHomeIdentity);
});
