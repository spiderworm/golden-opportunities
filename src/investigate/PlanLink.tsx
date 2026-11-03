import { useContext } from "react";
import { Link } from "react-router";

import { track } from "~/platform/analytics/analytics.client";
import { PLAN_LINK, StandingOrderShown } from "~/shell/standing-order-shown";
import styles from "./Investigate.module.css";

/**
 * Investigate's way on to the plan: "Write the plan", or "See the results" once it's filed. While the standing
 * order shows, "Write the plan" is the order's own action (David, 3 Nov), so it isn't repeated here.
 */
export function PlanLink({ planned }: { planned: boolean }) {
  if (useContext(StandingOrderShown)) return null;
  return (
    <div className={styles.pageActions}>
      <Link
        to={planned ? "/result" : "/decide"}
        className={styles.planLink}
        onClick={() => track("investigate_plan_link", { to: planned ? "result" : "decide" })}
      >
        {planned ? PLAN_LINK.results : PLAN_LINK.write}
      </Link>
    </div>
  );
}
