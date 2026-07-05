/**
 * Game Operations
 *
 * High-level game operations implemented as sync thunks.
 * These encapsulate business logic and return typed Results.
 */

import type {
  AvailableMoves,
  CubeValue,
  DiceRoll,
  DieValue,
  GameAction,
  GameOptions,
  GamePhase,
  GameResult,
  GameState,
  Move,
  MoveFrom,
  MoveTo,
  Player
} from './types'
import { doubleCubeValue, getOpponent, isValidDieValue, isValidPointIndex } from './types'
import { buildCreateSyncThunk, type SyncThunkAction } from './syncThunk'
import { type Result, ok, err } from './result'

/** State shape for operations - matches the expected store shape */
export type RootState = { game: GameState }
import {
  applyMoveToBoard,
  canProposeDouble,
  checkGameOver,
  computeGamePoints,
  filterMovesByDie,
  getRequiredMoves,
  getValidMoves,
  createInitialBoard,
} from './rules'
import {
  createDiceRoll,
  getRemainingMovesFromDice,
  rollForFirstPlayer
} from './dice'

// =============================================================================
// Error Types
// =============================================================================

export type NoGameError = {
  readonly type: 'no_game'
  readonly message: string
}

export type WrongPhaseError = {
  readonly type: 'wrong_phase'
  readonly phase: GamePhase
  readonly message: string
}

export type InvalidMoveError = {
  readonly type: 'invalid_move'
  readonly validMoves: readonly AvailableMoves[]
  readonly message: string
}

export type MustPlayRequiredError = {
  readonly type: 'must_play_required'
  readonly requiredDie: DieValue
  readonly message: string
}

export type InvalidInputError = {
  readonly type: 'invalid_input'
  readonly field: string
  readonly message: string
}

export type MovesRemainingError = {
  readonly type: 'moves_remaining'
  readonly remainingMoves: readonly DieValue[]
  readonly message: string
}

export type GameOverError = {
  readonly type: 'game_over'
  readonly message: string
}

export type StartGameError = never // Start game can't fail currently

export type RollError = NoGameError | WrongPhaseError | GameOverError

export type MoveError =
  | NoGameError
  | WrongPhaseError
  | InvalidInputError
  | InvalidMoveError
  | MustPlayRequiredError

export type EndTurnError =
  | NoGameError
  | WrongPhaseError
  | MovesRemainingError
  | GameOverError

export type NothingToUndoError = {
  readonly type: 'nothing_to_undo'
  readonly message: string
}

export type UndoHistoryMismatchError = {
  readonly type: 'undo_history_mismatch'
  readonly message: string
}

export type UndoError = NoGameError | WrongPhaseError | NothingToUndoError | UndoHistoryMismatchError

export type CannotDoubleError = {
  readonly type: 'cannot_double'
  readonly message: string
}

export type NoDoublePendingError = {
  readonly type: 'no_double_pending'
  readonly message: string
}

export type ProposeDoubleError = NoGameError | WrongPhaseError | CannotDoubleError

export type RespondToDoubleError = NoGameError | WrongPhaseError | NoDoublePendingError

// =============================================================================
// Result Types
// =============================================================================

export interface StartGameResult {
  readonly firstPlayer: Player
  readonly diceRoll: DiceRoll
  readonly validMoves: readonly AvailableMoves[]
}

export interface RollDiceResult {
  readonly diceRoll: DiceRoll
  readonly validMoves: readonly AvailableMoves[]
  readonly turnForfeited: boolean
}

export interface MakeMoveResult {
  readonly move: Move
  readonly hit: boolean
  readonly gameOver: GameResult | null
  readonly remainingMoves: readonly DieValue[]
  readonly validMoves: readonly AvailableMoves[]
}

export interface EndTurnResult {
  readonly nextPlayer: Player
  readonly turnNumber: number
}

export interface UndoMoveResult {
  readonly undoneMoves: readonly { readonly move: Move; readonly hit: boolean }[]
}

export interface ProposeDoubleResult {
  readonly proposedBy: Player
  readonly newCubeValue: CubeValue
}

export type RespondToDoubleResult =
  | {
      readonly response: 'accept'
      readonly newCubeValue: CubeValue
      readonly newOwner: Player
    }
  | {
      readonly response: 'decline'
      readonly winner: Player
      readonly gameResult: GameResult
    }

export type DoubleResponse = 'accept' | 'decline'

// =============================================================================
// Input Types
// =============================================================================

export interface MakeMoveInput {
  readonly from: number | 'bar'
  readonly to: number | 'off'
  readonly dieUsed: number
}

// =============================================================================
// Sync Thunk Factory
// =============================================================================

const createSyncThunk = buildCreateSyncThunk<RootState>()

// =============================================================================
// Operations
// =============================================================================

/**
 * Start a new game.
 * Rolls for first player and sets up the initial board.
 * Optionally enables the doubling cube.
 */
export const performStartGame = createSyncThunk<
  Result<StartGameResult, StartGameError>,
  GameOptions | void
>('game/performStartGame', (options) => {
  const { diceRoll, firstPlayer } = rollForFirstPlayer()

  // Determine if doubling cube should be enabled
  const gameOptions = options || undefined
  const enableCube = (gameOptions?.enableDoublingCube ?? false) && !(gameOptions?.isCrawfordGame ?? false)

  // Compute valid moves for the starting position
  const initialBoard = createInitialBoard()
  const initialState: GameState = {
    board: initialBoard,
    currentPlayer: firstPlayer,
    phase: 'moving',
    diceRoll,
    remainingMoves: getRemainingMovesFromDice(diceRoll),
    turnNumber: 1,
    movesThisTurn: [],
    result: null,
    history: [],
    actionHistory: [],
    doublingCube: enableCube ? { value: 1, owner: 'centered' } : null,
    doubleProposedBy: null
  }

  const allValidMoves = getValidMoves({ state: initialState })

  // Filter moves by required die (must-play-higher rule) - unlikely at game start but for consistency
  const requirements = getRequiredMoves({ state: initialState })
  const validMoves = requirements.requiredDie
    ? filterMovesByDie({ availableMoves: allValidMoves, dieValue: requirements.requiredDie })
    : allValidMoves

  return ok({
    firstPlayer,
    diceRoll,
    validMoves
  })
})

/**
 * Roll dice for the current player's turn.
 * Handles auto-forfeit if no legal moves are available.
 */
export const performRollDice = createSyncThunk<
  Result<RollDiceResult, RollError>
>('game/performRollDice', (_arg, { getState }) => {
  const state = getState().game

  if (state.currentPlayer === null) {
    return err({
      type: 'no_game',
      message: 'No game in progress. Use startGame first.'
    })
  }

  if (state.phase === 'game_over') {
    return err({
      type: 'game_over',
      message: 'Game is already over.'
    })
  }

  if (state.phase !== 'rolling') {
    return err({
      type: 'wrong_phase',
      phase: state.phase,
      message: `Cannot roll dice in ${state.phase} phase. ${
        state.phase === 'moving'
          ? 'Make moves or end turn.'
          : 'Start a game first.'
      }`
    })
  }

  const diceRoll = createDiceRoll()
  const remainingMoves = getRemainingMovesFromDice(diceRoll)

  // Create temporary state to check for valid moves
  const tempState: GameState = {
    ...state,
    phase: 'moving',
    diceRoll,
    remainingMoves,
    movesThisTurn: []
  }

  const allValidMoves = getValidMoves({ state: tempState })
  const turnForfeited = allValidMoves.length === 0

  // Filter moves by required die (must-play-higher rule)
  const requirements = getRequiredMoves({ state: tempState })
  const validMoves = requirements.requiredDie
    ? filterMovesByDie({ availableMoves: allValidMoves, dieValue: requirements.requiredDie })
    : allValidMoves

  return ok({
    diceRoll,
    validMoves,
    turnForfeited
  })
})

/**
 * Make a single checker move.
 */
export const performMove = createSyncThunk<
  Result<MakeMoveResult, MoveError>,
  MakeMoveInput
>('game/performMove', (input, { getState }) => {
  const state = getState().game

  if (state.currentPlayer === null) {
    return err({
      type: 'no_game',
      message: 'No game in progress. Use startGame first.'
    })
  }

  if (state.phase !== 'moving') {
    return err({
      type: 'wrong_phase',
      phase: state.phase,
      message: `Cannot make move in ${state.phase} phase. ${
        state.phase === 'rolling' ? 'Roll dice first.' : ''
      }`
    })
  }

  // Validate input types
  if (input.from !== 'bar' && !isValidPointIndex(input.from)) {
    return err({
      type: 'invalid_input',
      field: 'from',
      message: `Invalid 'from' value: ${String(input.from)}. Must be 'bar' or a number 1-24.`
    })
  }

  if (input.to !== 'off' && !isValidPointIndex(input.to)) {
    return err({
      type: 'invalid_input',
      field: 'to',
      message: `Invalid 'to' value: ${String(input.to)}. Must be 'off' or a number 1-24.`
    })
  }

  if (!isValidDieValue(input.dieUsed)) {
    return err({
      type: 'invalid_input',
      field: 'dieUsed',
      message: `Invalid 'dieUsed' value: ${String(input.dieUsed)}. Must be 1-6.`
    })
  }

  const from: MoveFrom = input.from === 'bar' ? 'bar' : input.from
  const to: MoveTo = input.to === 'off' ? 'off' : input.to
  const move: Move = { from, to, dieUsed: input.dieUsed }

  // Check if move is in the valid moves list
  const validMoves = getValidMoves({ state })
  const isValid = validMoves.some(
    vm =>
      vm.from === from &&
      vm.destinations.some(d => d.to === to && d.dieValue === input.dieUsed)
  )

  if (!isValid) {
    const validMovesStr = validMoves
      .flatMap(vm =>
        vm.destinations.map(
          d =>
            `${String(vm.from)} -> ${String(d.to)} (die: ${String(d.dieValue)})`
        )
      )
      .join(', ')

    return err({
      type: 'invalid_move',
      validMoves,
      message: `Invalid move: ${String(from)} -> ${String(to)} with die ${String(input.dieUsed)}. Valid moves: ${validMovesStr || 'none'}`
    })
  }

  // Check for must-play rules
  const requirements = getRequiredMoves({ state })
  if (requirements.requiredDie && move.dieUsed !== requirements.requiredDie) {
    return err({
      type: 'must_play_required',
      requiredDie: requirements.requiredDie,
      message: `Must play the ${String(requirements.requiredDie)} (${
        requirements.mustPlayHigherDie ? 'higher die rule' : 'only legal die'
      }).`
    })
  }

  // Compute result data
  const player = state.currentPlayer
  const newBoard = applyMoveToBoard({ state, move })

  // Check if this was a hit
  const hit =
    to !== 'off' &&
    ((player === 'white' && state.board.points[to - 1] === -1) ||
      (player === 'black' && state.board.points[to - 1] === 1))

  // Update remaining moves
  const newRemainingMoves = [...state.remainingMoves]
  const dieIndex = newRemainingMoves.indexOf(move.dieUsed)
  if (dieIndex !== -1) {
    newRemainingMoves.splice(dieIndex, 1)
  }

  // Create state after move to check for game over and valid moves
  const stateAfterMove: GameState = {
    ...state,
    board: newBoard,
    remainingMoves: newRemainingMoves,
    movesThisTurn: [...state.movesThisTurn, move]
  }

  const gameOver = checkGameOver({ state: stateAfterMove })
  const allNewValidMoves = gameOver ? [] : getValidMoves({ state: stateAfterMove })

  // Filter moves by required die (must-play-higher rule)
  const newRequirements = gameOver ? null : getRequiredMoves({ state: stateAfterMove })
  const newValidMoves = newRequirements?.requiredDie
    ? filterMovesByDie({ availableMoves: allNewValidMoves, dieValue: newRequirements.requiredDie })
    : allNewValidMoves

  return ok({
    move,
    hit,
    gameOver,
    remainingMoves: newRemainingMoves,
    validMoves: newValidMoves
  })
})

/**
 * End the current player's turn.
 */
export const performEndTurn = createSyncThunk<
  Result<EndTurnResult, EndTurnError>
>('game/performEndTurn', (_arg, { getState }) => {
  const state = getState().game

  if (state.currentPlayer === null) {
    return err({
      type: 'no_game',
      message: 'No game in progress. Use startGame first.'
    })
  }

  if (state.phase === 'game_over') {
    return err({
      type: 'game_over',
      message: 'Game is already over.'
    })
  }

  if (state.phase !== 'moving') {
    return err({
      type: 'wrong_phase',
      phase: state.phase,
      message: `Cannot end turn in ${state.phase} phase.`
    })
  }

  // Check if player still has legal moves they must play
  const validMoves = getValidMoves({ state })
  if (validMoves.length > 0 && state.remainingMoves.length > 0) {
    return err({
      type: 'moves_remaining',
      remainingMoves: state.remainingMoves,
      message:
        'You still have legal moves available. You must play all possible dice.'
    })
  }

  const nextPlayer = getOpponent(state.currentPlayer)
  const turnNumber = state.turnNumber + 1

  return ok({
    nextPlayer,
    turnNumber
  })
})

/**
 * Undo the last move in the current turn.
 * Valid during moving or game_over phase (to undo the winning bear-off).
 */
export const performUndoMove = createSyncThunk<
  Result<UndoMoveResult, UndoError>
>('game/performUndoMove', (_arg, { getState }) => {
  const state = getState().game

  if (state.currentPlayer === null) {
    return err({
      type: 'no_game',
      message: 'No game in progress.'
    })
  }

  if (state.phase !== 'moving' && state.phase !== 'game_over') {
    return err({
      type: 'wrong_phase',
      phase: state.phase,
      message: `Cannot undo in ${state.phase} phase.`
    })
  }

  if (state.movesThisTurn.length === 0) {
    return err({
      type: 'nothing_to_undo',
      message: 'No moves to undo this turn.'
    })
  }

  // Scan backwards for the most recent piece_move action
  let lastPieceMove: (GameAction & { type: 'piece_move' }) | null = null
  for (let i = state.actionHistory.length - 1; i >= 0; i--) {
    const action = state.actionHistory[i]
    if (action.type === 'piece_move') {
      lastPieceMove = action
      break
    }
  }

  if (!lastPieceMove) {
    return err({
      type: 'undo_history_mismatch',
      message: 'No piece_move action found in history to undo.'
    })
  }

  const lastMove = state.movesThisTurn[state.movesThisTurn.length - 1]

  return ok({
    undoneMoves: [{ move: lastMove, hit: lastPieceMove.hit }]
  })
})

/**
 * Undo all moves in the current turn.
 * Valid during moving or game_over phase (to undo the winning bear-off).
 */
export const performUndoAllMoves = createSyncThunk<
  Result<UndoMoveResult, UndoError>
>('game/performUndoAllMoves', (_arg, { getState }) => {
  const state = getState().game

  if (state.currentPlayer === null) {
    return err({
      type: 'no_game',
      message: 'No game in progress.'
    })
  }

  if (state.phase !== 'moving' && state.phase !== 'game_over') {
    return err({
      type: 'wrong_phase',
      phase: state.phase,
      message: `Cannot undo in ${state.phase} phase.`
    })
  }

  if (state.movesThisTurn.length === 0) {
    return err({
      type: 'nothing_to_undo',
      message: 'No moves to undo this turn.'
    })
  }

  // Collect all piece_move actions from this turn
  const moveCount = state.movesThisTurn.length
  const pieceMoveActions: (GameAction & { type: 'piece_move' })[] = []
  for (let i = state.actionHistory.length - 1; i >= 0 && pieceMoveActions.length < moveCount; i--) {
    const action = state.actionHistory[i]
    if (action.type === 'piece_move') {
      pieceMoveActions.unshift(action)
    }
  }

  if (pieceMoveActions.length !== moveCount) {
    return err({
      type: 'undo_history_mismatch',
      message: `Cannot undo: expected ${String(moveCount)} piece_move actions in history but found ${String(pieceMoveActions.length)}.`
    })
  }

  const undoneMoves = state.movesThisTurn.map((move, i) => ({
    move,
    hit: pieceMoveActions[i].hit
  }))

  return ok({
    undoneMoves
  })
})

// =============================================================================
// Doubling Operations
// =============================================================================

/**
 * Propose to double the stakes.
 * Can only be used at the start of a turn (rolling phase) by the player
 * who owns the cube or when the cube is centered.
 */
export const performProposeDouble = createSyncThunk<
  Result<ProposeDoubleResult, ProposeDoubleError>
>('game/performProposeDouble', (_arg, { getState }) => {
  const state = getState().game

  if (state.currentPlayer === null) {
    return err({
      type: 'no_game',
      message: 'No game in progress.'
    })
  }

  if (state.phase !== 'rolling') {
    return err({
      type: 'wrong_phase',
      phase: state.phase,
      message: `Cannot propose double in ${state.phase} phase. Must be at the start of your turn (before rolling).`
    })
  }

  if (!canProposeDouble({ state })) {
    const reason = state.doublingCube === null
      ? 'Doubling cube is not enabled for this game.'
      : state.doublingCube.value >= 64
        ? 'Cube is already at maximum value (64).'
        : 'You do not own the doubling cube.'
    return err({
      type: 'cannot_double',
      message: reason
    })
  }

  const newCubeValue = doubleCubeValue(state.doublingCube!.value)!

  return ok({
    proposedBy: state.currentPlayer,
    newCubeValue
  })
})

/**
 * Respond to a proposed double (accept or decline).
 * - Accept: cube value doubles, responding player takes ownership, game continues (rolling phase)
 * - Decline: proposer wins the game at the current cube value
 */
export const performRespondToDouble = createSyncThunk<
  Result<RespondToDoubleResult, RespondToDoubleError>,
  { response: DoubleResponse }
>('game/performRespondToDouble', ({ response }, { getState }) => {
  const state = getState().game

  if (state.currentPlayer === null) {
    return err({
      type: 'no_game',
      message: 'No game in progress.'
    })
  }

  if (state.phase !== 'doubling_proposed') {
    return err({
      type: 'wrong_phase',
      phase: state.phase,
      message: `Cannot respond to double in ${state.phase} phase. A double must be proposed first.`
    })
  }

  if (state.doubleProposedBy === null) {
    return err({
      type: 'no_double_pending',
      message: 'No double has been proposed.'
    })
  }

  const proposer = state.doubleProposedBy
  const responder = getOpponent(proposer)
  const currentCubeValue = state.doublingCube!.value
  const newCubeValue = doubleCubeValue(currentCubeValue)!

  if (response === 'accept') {
    return ok({
      response: 'accept',
      newCubeValue,
      newOwner: responder
    })
  }

  // Decline: proposer wins at current cube value (before the proposed double)
  const gameResult: GameResult = {
    winner: proposer,
    victoryType: 'single',
    cubeValue: currentCubeValue,
    points: computeGamePoints({ victoryType: 'single', cubeValue: currentCubeValue })
  }

  return ok({
    response: 'decline',
    winner: proposer,
    gameResult
  })
})

// =============================================================================
// Action Type Helpers (for extraReducers)
// =============================================================================

export type StartGameAction = SyncThunkAction<
  RootState,
  undefined,
  Result<StartGameResult, StartGameError>,
  GameOptions | void
>

export type RollDiceAction = SyncThunkAction<
  RootState,
  undefined,
  Result<RollDiceResult, RollError>
>

export type MakeMoveAction = SyncThunkAction<
  RootState,
  undefined,
  Result<MakeMoveResult, MoveError>,
  MakeMoveInput
>

export type EndTurnAction = SyncThunkAction<
  RootState,
  undefined,
  Result<EndTurnResult, EndTurnError>
>

export type UndoMoveAction = SyncThunkAction<
  RootState,
  undefined,
  Result<UndoMoveResult, UndoError>
>

export type UndoAllMovesAction = SyncThunkAction<
  RootState,
  undefined,
  Result<UndoMoveResult, UndoError>
>

export type ProposeDoubleAction = SyncThunkAction<
  RootState,
  undefined,
  Result<ProposeDoubleResult, ProposeDoubleError>
>

export type RespondToDoubleAction = SyncThunkAction<
  RootState,
  undefined,
  Result<RespondToDoubleResult, RespondToDoubleError>,
  { response: DoubleResponse }
>
