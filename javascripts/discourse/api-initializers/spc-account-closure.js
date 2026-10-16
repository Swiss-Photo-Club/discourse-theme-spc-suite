import { apiInitializer } from "discourse/lib/api";
import SpcAccountClosure from "../components/spc-account-closure";

export default apiInitializer((api) => {
  api.renderInOutlet("user-preferences-account", SpcAccountClosure);
});
