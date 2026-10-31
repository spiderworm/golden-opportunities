import type { BossId } from "./bosses";
import { BossScene2D } from "./BossScene2D";
import { useBossFocus, type FocusHow, type SceneBubble, type SceneMode } from "./useBossFocus";

export interface BossBriefingProps {
  bubbles: readonly SceneBubble[];
  /** The bubble open when the scene comes up. */
  initial?: number;
  onFocus?: (boss: BossId, how: FocusHow, mode: SceneMode) => void;
}

/**
 * The bosses briefing the player in one scene. It owns the focus, so the open bubble carries over when
 * a scene swaps in; the scene only draws it. For now the scene is 2D; Orbit's 3D scene (BossSceneProps,
 * picked when WebGL 2 works, with this 2D scene as its fallback) slots in here.
 */
export function BossBriefing({ bubbles, initial, onFocus }: BossBriefingProps) {
  const mode: SceneMode = "2d";
  const { open, select } = useBossFocus(bubbles, { initial, mode, onFocus });
  return <BossScene2D bubbles={bubbles} open={open} onSelect={select} />;
}
