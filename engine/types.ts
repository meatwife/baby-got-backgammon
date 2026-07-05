/**
 * Backgammon Game Type Definitions
 *
 * Design principles:
 * - Serializable: All types are JSON-compatible for MCP transport
 * - Immutable-friendly: Uses readonly throughout for Redux compatibility
 * - Self-documenting: Types reflect standard backgammon terminology
 */

// =============================================================================
// Primitives
// =============================================================================

/** Player colors */
export type Player = 'white' | 'black'

/**
 * Get the opponent of a player.
 */
export function getOpponent(player: Player): Player {
  return player === 'white' ? 'black' : 'white'
}

/** Valid die values (1-6) */
export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

/** Valid doubling cube values */
export type CubeValue = 1 | 2 | 4 | 8 | 16 | 32 | 64

/** Who owns/controls the doubling cube */
export type CubeOwner = Player | 'centered'

/**
 * Doubling cube state
 * - When centered, either player may propose a double
 * - When owned by a player, only that player may propose
 */
export interface DoublingCubeState {
  readonly value: CubeValue
  readonly owner: CubeOwner
}

/**
 * Options for starting a new individual game.
 * When not provided, defaults to no doubling cube.
 */
export interface GameOptions {
  readonly enableDoublingCube: boolean
  readonly isCrawfordGame: boolean
}

/** Point indices (1-24, matching standard backgammon notation) */
export type PointIndex =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24

/**
 * Type guard to check if a number is a valid point index (1-24).
 */
export function isValidPointIndex(n: number): n is PointIndex {
  return Number.isInteger(n) && n >= 1 && n <= 24
}

/**
 * Type guard to check if a number is a valid die value (1-6).
 */
export function isValidDieValue(n: number): n is DieValue {
  return Number.isInteger(n) && n >= 1 && n <= 6
}

const VALID_CUBE_VALUES = new Set([1, 2, 4, 8, 16, 32, 64])

/**
 * Type guard to check if a number is a valid cube value.
 */
export function isValidCubeValue(n: number): n is CubeValue {
  return VALID_CUBE_VALUES.has(n)
}

/**
 * Double the cube value. Returns the next cube value, or null if already at max (64).
 */
export function doubleCubeValue(value: CubeValue): CubeValue | null {
  if (value >= 64) return null
  return (value * 2) as CubeValue
}

// =============================================================================
// Board State
// =============================================================================

/**
 * Checker counts for bar and borne-off areas
 */
export interface CheckerCounts {
  readonly white: number
  readonly black: number
}

/**
 * Board representation
 *
 * Points array:
 * - Index 0 = Point 1, Index 23 = Point 24
 * - Positive values = white checkers
 * - Negative values = black checkers
 * - Zero = empty point
 *
 * White moves from point 24 toward point 1 (bearing off from point 1)
 * Black moves from point 1 toward point 24 (bearing off from point 24)
 */
export interface BoardState {
  /**
   * 24-element tuple representing checker positions on the board.
   * Each element is a signed integer:
   * - Positive = number of white checkers
   * - Negative = number of black checkers
   * - Zero = empty
   */
  readonly points: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ]

  /** Checkers on the bar (hit but not re-entered) */
  readonly bar: CheckerCounts

  /** Checkers that have been borne off (removed from play) */
  readonly borneOff: CheckerCounts
}

// =============================================================================
// Dice
// =============================================================================

/**
 * A roll of two dice
 */
export interface DiceRoll {
  readonly die1: DieValue
  readonly die2: DieValue
}

// =============================================================================
// Moves
// =============================================================================

/** Sentinel value for moving from the bar */
export type BarPosition = 'bar'

/** Sentinel value for bearing off */
export type BearOffPosition = 'off'

/** Valid source positions for a move */
export type MoveFrom = PointIndex | BarPosition

/** Valid destination positions for a move */
export type MoveTo = PointIndex | BearOffPosition

/**
 * A single checker move
 */
export interface Move {
  /** Starting position (point index or 'bar') */
  readonly from: MoveFrom

  /** Ending position (point index or 'off' for bearing off) */
  readonly to: MoveTo

  /** The die value used for this move */
  readonly dieUsed: DieValue
}

/**
 * A complete turn (one player's full sequence of moves)
 */
export interface Turn {
  readonly player: Player
  readonly diceRoll: DiceRoll
  readonly moves: readonly Move[]
}

// =============================================================================
// Available Moves (for UI and validation)
// =============================================================================

/**
 * A possible destination for a checker
 */
export interface MoveDestination {
  /** Where the checker can move to */
  readonly to: MoveTo

  /** Which die value enables this move */
  readonly dieValue: DieValue

  /** Whether this move would hit an opponent's blot */
  readonly wouldHit: boolean
}

/**
 * Available moves from a specific position
 */
export interface AvailableMoves {
  /** The source position */
  readonly from: MoveFrom

  /** All valid destinations from this position */
  readonly destinations: readonly MoveDestination[]
}

// =============================================================================
// Game Actions (for history/replay)
// =============================================================================

/**
 * Atomic game action - captures all non-deterministic events
 * (dice rolls and player decisions)
 */
export type GameAction =
  | {
      readonly type: 'game_start'
      readonly firstPlayer: Player
      readonly whiteRoll: DieValue
      readonly blackRoll: DieValue
    }
  | {
      readonly type: 'dice_roll'
      readonly player: Player
      readonly roll: DiceRoll
      readonly turnForfeited: boolean
    }
  | {
      readonly type: 'piece_move'
      readonly player: Player
      readonly from: MoveFrom
      readonly to: MoveTo
      readonly dieUsed: DieValue
      readonly hit: boolean
    }
  | {
      readonly type: 'turn_end'
      readonly player: Player
    }
  | {
      readonly type: 'double_proposed'
      readonly player: Player
      readonly newValue: CubeValue
    }
  | {
      readonly type: 'double_accepted'
      readonly player: Player
      readonly cubeValue: CubeValue
    }
  | {
      readonly type: 'double_declined'
      readonly player: Player
      readonly cubeValue: CubeValue
    }

// =============================================================================
// Game State
// =============================================================================

/**
 * Game phases representing the state machine
 *
 * Flow:
 * not_started -> rolling_for_first -> rolling <-> moving -> game_over
 *                                      |
 *                                      v
 *                                doubling_proposed -> rolling (accept) or game_over (decline)
 */
export type GamePhase =
  | 'not_started'
  | 'rolling_for_first'
  | 'rolling'
  | 'doubling_proposed'
  | 'moving'
  | 'game_over'

/**
 * Types of victory in backgammon
 * - single: Opponent has borne off at least one checker
 * - gammon: Opponent has not borne off any checkers (2x stakes)
 * - backgammon: Opponent has checkers on bar or in winner's home (3x stakes)
 */
export type VictoryType = 'single' | 'gammon' | 'backgammon'

/**
 * Result of a completed game
 */
export interface GameResult {
  readonly winner: Player
  readonly victoryType: VictoryType
  /** Doubling cube value at end of game (1 when cube is disabled) */
  readonly cubeValue: CubeValue
  /** Total points scored: victoryMultiplier * cubeValue */
  readonly points: number
}

/**
 * Complete game state
 *
 * This is the root state object stored in Redux and transmitted via MCP.
 * All fields are readonly for immutability.
 */
export interface GameState {
  /** Current board configuration */
  readonly board: BoardState

  /** Whose turn it is (null before game starts) */
  readonly currentPlayer: Player | null

  /** Current game phase */
  readonly phase: GamePhase

  /** Current dice roll (null when not rolled yet) */
  readonly diceRoll: DiceRoll | null

  /** Die values still available to use this turn */
  readonly remainingMoves: readonly DieValue[]

  /** Number of turns completed */
  readonly turnNumber: number

  /** Moves made in the current turn */
  readonly movesThisTurn: readonly Move[]

  /** Game result (null until game_over phase) */
  readonly result: GameResult | null

  /** History of all completed turns */
  readonly history: readonly Turn[]

  /** Chronological history of all game actions (for replay/undo) */
  readonly actionHistory: readonly GameAction[]

  /** Doubling cube state (null when cube is disabled for this game) */
  readonly doublingCube: DoublingCubeState | null

  /** Which player proposed a double (non-null only in doubling_proposed phase) */
  readonly doubleProposedBy: Player | null
}
