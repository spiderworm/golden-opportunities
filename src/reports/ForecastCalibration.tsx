import { useId, useMemo } from "react";

import { EChart } from "~/platform/charts/EChart";
import {
  calibrationLines,
  calibrationOption,
  CALIBRATION_COPY as COPY,
  type Calibration,
  type MeasureCalibration,
} from "./forecast-calibration";
import styles from "./Reports.module.css";

// The player's forecasts, judged over the played quarters (Plot's copy, section 10): how many quarters were forecast,
// then for each of revenue and units sold, the hit rate, the lean and the typical range, each explained on hover or
// focus, and a small chart of the range against what happened. Reports shows it, and Decide's panel, read-only.

export function ForecastCalibration({ calibration }: { calibration: Calibration }) {
  const id = useId();
  return (
    <section className={styles.calibration} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`} className={styles.calibrationHeading}>
        {COPY.heading}
      </h2>
      <p className={styles.calibrationCount}>
        {COPY.count(calibration.forecast, calibration.played)}
      </p>
      {calibration.forecast > 0 && (
        <div className={styles.calibrationMeasures}>
          {(["revenue", "units"] as const).map((m) => (
            <MeasureBlock
              key={m}
              calibration={calibration[m]}
              history={calibration.history}
              id={`${id}-${m}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function MeasureBlock({
  calibration,
  history,
  id,
}: {
  calibration: MeasureCalibration;
  history: Calibration["history"];
  id: string;
}) {
  const { measure } = calibration;
  const option = useMemo(() => calibrationOption(measure, history), [measure, history]);
  if (calibration.n === 0) return null;
  return (
    <div className={styles.calibrationMeasure}>
      <h3 className={styles.calibrationMeasureName}>{COPY.measures[measure]}</h3>
      <ul className={styles.calibrationLines}>
        {calibrationLines(calibration).map((line, i) => (
          <li key={i}>
            {line.tip ? (
              <Explained text={line.text} tip={line.tip} id={`${id}-tip-${i}`} />
            ) : (
              line.text
            )}
          </li>
        ))}
      </ul>
      {option && (
        <figure className={styles.calibrationChart}>
          <figcaption>{COPY.chart}</figcaption>
          <ul className={styles.calibrationLegend} aria-label={COPY.chart}>
            <li data-mark="range">{COPY.series.range}</li>
            <li data-mark="expected">{COPY.series.expected}</li>
            <li data-mark="actual">{COPY.series.actual}</li>
          </ul>
          <EChart option={option} height={150} label={`${COPY.chart}: ${COPY.measures[measure]}`} />
        </figure>
      )}
    </div>
  );
}

/** A line with its explanation as a tooltip, on hover and on keyboard focus, and read as its description. */
function Explained({ text, tip, id }: { text: string; tip: string; id: string }) {
  return (
    <span className={styles.explained} tabIndex={0} aria-describedby={id}>
      {text}
      <span id={id} role="tooltip" className={styles.explainedTip}>
        {tip}
      </span>
    </span>
  );
}
