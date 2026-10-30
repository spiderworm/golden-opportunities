import { useMemo } from "react";

import type { QueryResult } from "~/query/types";
import { chartTheme } from "./charts/chart-theme";
import { EChart } from "./charts/EChart";
import { heatmapOption, heatModel, WEEKDAYS } from "./charts/heatmap-option";
import { formatMeasure, MEASURE_LABELS } from "./format";
import type { InvestigateState } from "./state";
import styles from "./Investigate.module.css";

export interface HeatmapProps {
  state: InvestigateState;
  result: QueryResult;
  onCell: (weekday: string, month: string) => void;
}

export function Heatmap({ state, result, onCell }: HeatmapProps) {
  const model = useMemo(() => heatModel(result, state.measure), [result, state.measure]);
  const option = useMemo(() => heatmapOption(model, { measure: state.measure, filters: state.filters }), [model, state.measure, state.filters]);
  const title = `${MEASURE_LABELS[state.measure]} by weekday and month`;

  return (
    <section className={styles.card} aria-labelledby="heatmap-title">
      <header className={styles.cardHeader}>
        <h2 id="heatmap-title" className={styles.cardTitle}>
          {title}
        </h2>
        <div className={styles.scale} aria-hidden="true">
          <span>{formatMeasure(state.measure, model.min, { compact: true })}</span>
          <span className={styles.scaleBar} style={{ background: `linear-gradient(90deg, ${chartTheme.heatRamp.join(", ")})` }} />
          <span>{formatMeasure(state.measure, model.max, { compact: true })}</span>
        </div>
      </header>
      <EChart
        option={option}
        height={330}
        label={`${title}. Click a cell to filter the screen to that weekday and month.`}
        onClick={(event) => {
          const [x, y] = (event.data as { value: [number, number] }).value;
          const month = model.months[x];
          const weekday = WEEKDAYS[y];
          if (month && weekday) onCell(weekday, month);
        }}
      />
      <p className={styles.source}>Click a cell to filter the screen to that weekday and month. Source: {result.source}</p>
    </section>
  );
}
