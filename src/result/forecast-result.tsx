import type { ForecastMeasure, ForecastResult, MeasureResult } from "~/forecast/forecast";
import { moneyText } from "./copy";
import styles from "./Result.module.css";

// A played quarter's forecast against what happened (David, 3 Nov 2026, req_6d136a2b7fb3; Plot's copy, section 10;
// Frank's ForecastResult): for each measure forecast, the actual, whether it landed below, inside or above the
// player's 80% range, and how far the expected figure was off, as a value and a percent. Frank's shapes and scoring
// (src/forecast/forecast.ts).

const LABELS: Record<ForecastMeasure, string> = { revenue: "Revenue", units: "Units sold" };
/** The section's heading (Plot): a plain question, about the quarter just played, that the lines answer. */
export const FORECAST_HEADING = "How your forecast did";
const units = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const amount = (measure: ForecastMeasure, value: number) =>
  measure === "revenue" ? moneyText(value) : units.format(value);

/** The miss as a share of what happened, whole percents; a miss that rounds to 0 is "under 1%", never "0%" (Audit, #396). */
const percentOff = (errorPct: number) => {
  const pct = Math.round(Math.abs(errorPct) * 100);
  return pct === 0 ? "under 1%" : `${pct}%`;
};

/**
 * Plot's line, its percent of what actually happened (Frank's errorPct; Sim and Plot, #382): "Revenue: $162,300, above your range of $130,000 to $150,000. You expected $140,000: off by $22,300
 * (14%)." Inside: "…inside your range of…"; exactly right: "…You expected $142,300: spot on."
 */
export function resultLine(measure: ForecastMeasure, r: MeasureResult): string {
  const { point, low, high } = r.forecast;
  const range = `${amount(measure, low)} to ${amount(measure, high)}`;
  const where = `${r.where} your range of ${range}`;
  // Spot on when the two figures shown match, whole dollars or units: a miss under 50 cents isn't "off by $0" (Sim,
  // #396).
  const off =
    amount(measure, r.actual) === amount(measure, point)
      ? "spot on"
      : `off by ${amount(measure, Math.abs(r.error))}${r.errorPct === null ? "" : ` (${percentOff(r.errorPct)})`}`;
  return `${LABELS[measure]}: ${amount(measure, r.actual)}, ${where}. You expected ${amount(measure, point)}: ${off}.`;
}

/** The result page's lines for a forecast: one per measure forecast, then the player's own note. */
export function ForecastLines({ result }: { result: ForecastResult }) {
  const measures = (["revenue", "units"] as const).filter((m) => result[m]);
  if (!measures.length) return null;
  return (
    <section className={`${styles.card} ${styles.forecast}`} aria-labelledby="forecast-heading">
      <h3 id="forecast-heading" className={styles.cardTitle}>
        {FORECAST_HEADING}
      </h3>
      <ul className={styles.forecastLines}>
        {measures.map((m) => (
          <li key={m} data-where={result[m]!.where}>
            {resultLine(m, result[m]!)}
          </li>
        ))}
      </ul>
      {result.note && <blockquote className={styles.forecastNote}>{result.note}</blockquote>}
    </section>
  );
}
