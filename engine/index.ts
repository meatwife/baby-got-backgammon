// =============================================================================
// Types (only those used by consuming packages)
// =============================================================================

export type {
  Player,
  PointIndex,
  CheckerCounts,
  BoardState,
  DiceRoll,
  DieValue,
  Move,
  MoveFrom,
  MoveTo,
  Turn,
  GamePhase,
  GameResult,
  GameState,
  GameAction,
  AvailableMoves,
  CubeValue,
  CubeOwner,
  DoublingCubeState,
  GameOptions,
  VictoryType
} from './types'

export type {
  MatchConfig,
  MatchScore,
  MatchPhase,
  MatchState
} from './matchTypes'

// =============================================================================
// Dice Utilities
// =============================================================================

export { rollDie } from './dice'

// =============================================================================
// Sync Thunk Infrastructure
// =============================================================================

export { gameSyncThunkMiddleware } from './syncThunkMiddleware'

// =============================================================================
// Game Slice
// =============================================================================

export {
  default as gameReducer,
  // Actions
  resetGame,
  // Selectors
  selectBoard,
  selectCurrentPlayer,
  selectPhase,
  selectRemainingMoves,
  selectValidMoves,
  selectCanEndTurn,
  selectCanUndo,
  selectLastAction,
  selectDoublingCube,
  selectCanDouble,
  selectDoubleProposedBy
} from './gameSlice'

// =============================================================================
// Match Slice
// =============================================================================

export {
  default as matchReducer,
  startMatch,
  recordGameResult,
  resetMatch,
  selectMatchState,
  selectMatchScore,
  selectIsCrawfordGame,
  selectMatchWinner,
  selectIsMatchInProgress,
  selectMatchGameNumber
} from './matchSlice'

// =============================================================================
// Operations (sync thunks)
// =============================================================================

export {
  performStartGame,
  performRollDice,
  performMove,
  performEndTurn,
  performUndoMove,
  performUndoAllMoves,
  performProposeDouble,
  performRespondToDouble
} from './operations'

// =============================================================================
// Rules Engine
// =============================================================================

export {
  getValidMoves,
  getRequiredMoves,
  filterMovesByDie,
  canProposeDouble,
  computeGamePoints
} from './rules'
