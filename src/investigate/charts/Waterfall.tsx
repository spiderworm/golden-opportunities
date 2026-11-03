// "What drove the change" drawn: the waterfall, or its table, with the split's legend (Plot's copy, section 5).
import { useMemo } from "react";
import type { Waterfall as WaterfallModel } from "~/query/decompose";
import { EChart } from "~/platform/charts/EChart";
import styles from "../Investigate.module.css";
import { NOISE_EXPLAINED } from "./evidence";
import {
  axisCaption,
  axisFoot,
  SPLIT_COLORS,
  SPLIT_LEGEND,
  waterfallBars,
  waterfallOption,
  waterfallRows,
  type DroveLabels,
} from "./waterfall-chart";

const HEIGHT = 320;

export function Waterfall({
  model,
  labels,
  split,
  table,
  title,
  narrow = false,
}: {
  /** In a pin's narrow card: the bars' names slant. */
  narrow?: boolean;
  model: WaterfallModel;
  labels: DroveLabels;
  /** Whether the split is on and possible. */
  split: boolean;
  table: boolean;
  title: string;
}) {
  const option = useMemo(
    () => waterfallOption(model, labels, { split, narrow }),
    [model, labels, split, narrow],
  );
  const caption = axisCaption(axisFoot(waterfallBars(model, labels)));
  if (table) return <WaterfallTable model={model} labels={labels} split={split} />;
  return (
    <>
      {split && (
        <ul className={styles.legend} aria-label="Price, volume and mix">
          {SPLIT_LEGEND.map((item) => (
            <li
              key={item.key}
              title={item.tip}
              tabIndex={0}
              aria-label={`${item.label}. ${item.tip}`}
            >
              <span
                className={styles.legendSwatch}
                style={{ background: SPLIT_COLORS[item.key] }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      <EChart option={option} height={HEIGHT} label={title} />
      {caption && <p className={styles.tableNote}>{caption}</p>}
    </>
  );
}

/** The waterfall as a table: each group's then, now, change and % change, with the split's parts when it's on. */
export function WaterfallTable({
  model,
  labels,
  split,
}: {
  model: WaterfallModel;
  labels: DroveLabels;
  split: boolean;
}) {
  const rows = waterfallRows(model, labels, split);
  const parts = split && rows.some((r) => r.parts);
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">
              {model.by === "genre" ? "Genre" : model.by === "title" ? "Title" : "Edition"}
            </th>
            <th scope="col" className={styles.numeric}>
              {labels.then}
            </th>
            <th scope="col" className={styles.numeric}>
              {labels.now}
            </th>
            <th scope="col" className={styles.numeric} aria-label="Change">
              Δ
            </th>
            <th scope="col" className={styles.numeric}>
              % change
            </th>
            {parts &&
              SPLIT_LEGEND.map((item) => (
                <th key={item.key} scope="col" className={styles.numeric} title={item.tip}>
                  {item.label}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{row.name}</td>
              <td className={styles.numeric}>{row.then}</td>
              <td className={styles.numeric}>{row.now}</td>
              <td className={styles.numeric}>{row.change}</td>
              <td className={styles.numeric} title={row.noise ? NOISE_EXPLAINED : undefined}>
                {row.percent}
              </td>
              {parts &&
                (row.parts ?? ["", "", ""]).map((part, j) => (
                  <td key={j} className={styles.numeric}>
                    {part}
                  </td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
