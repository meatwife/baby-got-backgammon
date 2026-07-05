/**
 * Match Play Type Definitions
 *
 * Types for tracking multi-game matches with scoring and Crawford rule.
 */

import type { GameResult, Player } from './types'

/** Configuration for starting a match */
export interface MatchConfig {
  readonly targetScore: number
  readonly enableDoublingCube: boolean
}

/** Match score tracking */
export interface MatchScore {
  readonly white: number
  readonly black: number
}

/** Match lifecycle phases */
export type MatchPhase = 'in_progress' | 'completed'

/**
 * Complete match state
 *
 * Tracks score, Crawford rule, and game history across a multi-game match.
 * Null when not in match mode (single game).
 */
export interface MatchState {
  readonly config: MatchConfig
  readonly score: MatchScore
  readonly phase: MatchPhase
  readonly winner: Player | null
  readonly gameNumber: number
  /** Whether the current game is the Crawford game (no doubling) */
  readonly isCrawfordGame: boolean
  /** Whether the Crawford game has already been played */
  readonly crawfordGameUsed: boolean
  /** History of completed game results */
  readonly gameHistory: readonly GameResult[]
}
