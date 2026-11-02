import { useMemo } from "react";

import type { QueryResult } from "~/query/types";
import { Icon } from "~/shell/icons";
import { categoryModel, categoryOption } from "./charts/category-chart";
import { EChart } from "~/platform/charts/EChart";
import { formatDimensionValue, MEASURE_LABELS } from "./format";
import { monthsInScope, type InvestigateState } from "./state";
import { RatingsHistogram } from "./RatingsHistogram";
import styles from "./Investigate.module.css";

export interface TitleViewProps {
  state: InvestigateState;
  title: string;
  result: QueryResult;
  /** Its ratings by stars. */
  ratings: QueryResult;
  quarters: readonly string[];
  onMonth: (month: string) => void;
  onClose: () => void;
}

/** One title's sales by month, beside its ratings: where a drill into a title lands. */
export function TitleView({ state, title, result, ratings, quarters, onMonth, onClose }: TitleViewProps) {
  const selected = state.filters.month ?? [];
  const months = monthsInScope(quarters, state.filters.quarter);
  const model = useMemo(() => categoryModel(result, "month", null, months), [result, months.join()]);
  const option = useMemo(
    () => categoryOption(model, { selected, quarters }),
    [model, selected.join("\u0000"), quarters],
  );
  const heading = `${MEASURE_LABELS[state.measure]} by month`;

  return (
    <section className={`${styles.card} ${styles.titleCard}`} aria-labelledby="title-view-title">
      <header className={styles.cardHeader}>
        <div>
          <div className={styles.cardEyebrow}>Title</div>
          <h2 id="title-view-title" className={styles.cardTitle}>
            {title}
          </h2>
        </div>
        <button type="button" className={styles.toggle} onClick={onClose}>
          <Icon name="close" size={14} /> Close title
        </button>
      </header>
      <div className={styles.titleBody}>
        <div>
          <EChart
            option={option}
            height={260}
            label={`${heading} for ${title}. Click a month to filter the screen to it.`}
            onCategoryClick={(index) => {
              const month = model.categories[index];
              if (month) onMonth(month);
            }}
          />
          <p className={styles.source}>
            {heading}
            {selected.length > 0 ? `, filtered to ${selected.map((m) => formatDimensionValue("month", m)).join(", ")}` : ""}. Other
            filters still apply. Source: {result.source}
          </p>
        </div>
        <RatingsHistogram title={title} result={ratings} />
      </div>
    </section>
  );
}
