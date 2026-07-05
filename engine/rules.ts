/**
 * Backgammon Rules Engine
 *
 * This module implements all backgammon rule validation logic.
 * Pure functions, no side effects, no dependencies on Redux.
 *
 * Reference: docs/BACKGAMMON_RULES.md (based on USBGF rules)
 */

import type {
  AvailableMoves,
  BoardState,
  CubeValue,
  DieValue,
  GameResult,
  GameState,
  Move,
  MoveDestination,
  Player,
  PointIndex,
  VictoryType
} from './types'

// =============================================================================
// Constants
// =============================================================================

/** Total checkers per player */
const CHECKERS_PER_PLAYER = 15

/** Points in home board for each player */
const HOME_BOARD = {
  white: [1, 2, 3, 4, 5, 6] as const,
  black: [19, 20, 21, 22, 23, 24] as const
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the direction a player's checkers move.
 * White moves from point 24 toward point 1 (decreasing).
 * Black moves from point 1 toward point 24 (increasing).
 */
export function getMoveDirection(player: Player): 1 | -1 {
  return player === 'white' ? -1 : 1
}

/**
 * Get the checker count at a point for a specific player.
 * Returns 0 if point is empty or occupied by opponent.
 */
function getCheckerCount({
  board,
  pointIndex,
  player
}: {
  board: BoardState
  pointIndex: PointIndex
  player: Player
}): number {
  const value = board.points[pointIndex - 1]
  if (player === 'white') {
    return value > 0 ? value : 0
  } else {
    return value < 0 ? -value : 0
  }
}

/**
 * Check if a point is blocked by an opponent (2+ opponent checkers).
 */
function isPointBlocked({
  board,
  pointIndex,
  player
}: {
  board: BoardState
  pointIndex: PointIndex
  player: Player
}): boolean {
  const value = board.points[pointIndex - 1]
  if (player === 'white') {
    return value <= -2
  } else {
    return value >= 2
  }
}

/**
 * Check if landing on a point would hit an opponent's blot.
 */
function wouldHitBlot({
  board,
  pointIndex,
  player
}: {
  board: BoardState
  pointIndex: PointIndex
  player: Player
}): boolean {
  const value = board.points[pointIndex - 1]
  if (player === 'white') {
    return value === -1
  } else {
    return value === 1
  }
}

/**
 * Check if player has any checkers on the bar.
 */
function hasCheckersOnBar({
  board,
  player
}: {
  board: BoardState
  player: Player
}): boolean {
  return board.bar[player] > 0
}

/**
 * Get the entry point for a player re-entering from the bar with a specific die value.
 * White enters on opponent's home (points 24-19), so die 1 -> point 24, die 6 -> point 19.
 * Black enters on opponent's home (points 1-6), so die 1 -> point 1, die 6 -> point 6.
 */
function getBarEntryPoint({
  player,
  dieValue
}: {
  player: Player
  dieValue: DieValue
}): PointIndex {
  if (player === 'white') {
    return (25 - dieValue) as PointIndex
  } else {
    return dieValue as PointIndex
  }
}

/**
 * Calculate destination point from a source point and die value.
 * Returns null if the destination would be off the board (but not bearing off).
 */
function calculateDestination({
  from,
  dieValue,
  player
}: {
  from: PointIndex
  dieValue: DieValue
  player: Player
}): PointIndex | null {
  const direction = getMoveDirection(player)
  const destination = from + direction * dieValue

  // Check bounds
  if (destination < 1 || destination > 24) {
    return null
  }

  return destination as PointIndex
}

/**
 * Check if a destination point is valid for bearing off.
 * For white: must be moving past point 1 (destination <= 0)
 * For black: must be moving past point 24 (destination >= 25)
 */
function isBearingOffDestination({
  from,
  dieValue,
  player
}: {
  from: PointIndex
  dieValue: DieValue
  player: Player
}): boolean {
  const direction = getMoveDirection(player)
  const destination = from + direction * dieValue

  if (player === 'white') {
    return destination <= 0
  } else {
    return destination >= 25
  }
}

/**
 * Get all points where a player has checkers.
 */
function getOccupiedPoints({
  board,
  player
}: {
  board: BoardState
  player: Player
}): PointIndex[] {
  const points: PointIndex[] = []

  for (let i = 0; i < 24; i++) {
    const value = board.points[i]
    const hasChecker =
      (player === 'white' && value > 0) || (player === 'black' && value < 0)
    if (hasChecker) {
      points.push((i + 1) as PointIndex)
    }
  }

  return points
}

/**
 * Get the highest occupied point in a player's home board.
 * For white: highest numbered point in 1-6 with checkers.
 * For black: lowest numbered point in 19-24 with checkers.
 */
function getHighestHomePoint({
  board,
  player
}: {
  board: BoardState
  player: Player
}): PointIndex | null {
  const homePoints = HOME_BOARD[player] as readonly number[]
  const occupied = getOccupiedPoints({ board, player }).filter(p =>
    homePoints.includes(p)
  )

  if (occupied.length === 0) return null

  if (player === 'white') {
    return Math.max(...occupied) as PointIndex
  } else {
    return Math.min(...occupied) as PointIndex
  }
}

// =============================================================================
// Core Rule Functions
// =============================================================================

/**
 * Check if all of a player's checkers are in their home board.
 * This is required before bearing off.
 */
export function canBearOff({
  state,
  player
}: {
  state: GameState
  player: Player
}): boolean {
  const { board } = state

  // Cannot bear off if any checkers are on the bar
  if (board.bar[player] > 0) {
    return false
  }

  // Count checkers in home board + borne off
  const homePoints = HOME_BOARD[player]
  let checkersInHomeOrOff = board.borneOff[player]

  for (const point of homePoints) {
    checkersInHomeOrOff += getCheckerCount({
      board,
      pointIndex: point,
      player
    })
  }

  // All 15 checkers must be in home board or already borne off
  return checkersInHomeOrOff === CHECKERS_PER_PLAYER
}

/**
 * Check if a specific move is valid.
 */
export function isValidMove({
  state,
  move
}: {
  state: GameState
  move: Move
}): boolean {
  const { from, to, dieUsed } = move
  const player = state.currentPlayer

  if (!player) return false

  // Check if the die is available
  if (!state.remainingMoves.includes(dieUsed)) {
    return false
  }

  const { board } = state
  const hasBar = hasCheckersOnBar({ board, player })

  // If player has checkers on bar, they must enter first
  if (hasBar && from !== 'bar') {
    return false
  }

  // Handle bar entry
  if (from === 'bar') {
    if (!hasBar) return false

    const entryPoint = getBarEntryPoint({ player, dieValue: dieUsed })

    // Entry point must not be blocked
    if (isPointBlocked({ board, pointIndex: entryPoint, player })) {
      return false
    }

    // The destination must match the entry point
    return to === entryPoint
  }

  // Handle bearing off
  if (to === 'off') {
    if (!canBearOff({ state, player })) {
      return false
    }

    // Check if this is a valid bearing off move
    return isValidBearOffMove({ board, from, dieUsed, player })
  }

  // Regular move
  const expectedDestination = calculateDestination({
    from,
    dieValue: dieUsed,
    player
  })

  if (expectedDestination === null || expectedDestination !== to) {
    return false
  }

  // Check destination is not blocked
  if (isPointBlocked({ board, pointIndex: to, player })) {
    return false
  }

  // Check source has a checker
  if (getCheckerCount({ board, pointIndex: from, player }) === 0) {
    return false
  }

  return true
}

/**
 * Check if a bearing off move is valid.
 */
function isValidBearOffMove({
  board,
  from,
  dieUsed,
  player
}: {
  board: BoardState
  from: PointIndex
  dieUsed: DieValue
  player: Player
}): boolean {
  // Must have a checker at the source
  if (getCheckerCount({ board, pointIndex: from, player }) === 0) {
    return false
  }

  // Get the point value (distance from bearing off)
  // White bears off from point 1, so point value is the point number
  // Black bears off from point 24, so point value is 25 - point number
  const pointValue = player === 'white' ? from : 25 - from

  // Exact roll: die matches point value
  if (dieUsed === pointValue) {
    return true
  }

  // Higher roll: can bear off from highest occupied point if die is higher
  if (dieUsed > pointValue) {
    const highestHome = getHighestHomePoint({ board, player })
    // Can only bear off with higher die if this is the highest occupied point
    return highestHome === from
  }

  return false
}

/**
 * Get all valid moves for the current player.
 */
export function getValidMoves({
  state
}: {
  state: GameState
}): AvailableMoves[] {
  const player = state.currentPlayer
  if (!player || state.remainingMoves.length === 0) {
    return []
  }

  const { board } = state
  const hasBar = hasCheckersOnBar({ board, player })
  const canBearOffNow = canBearOff({ state, player })
  const uniqueDice = [...new Set(state.remainingMoves)]

  const result: AvailableMoves[] = []

  // If player has checkers on bar, can only enter from bar
  if (hasBar) {
    const destinations: MoveDestination[] = []

    for (const dieValue of uniqueDice) {
      const entryPoint = getBarEntryPoint({ player, dieValue })

      if (!isPointBlocked({ board, pointIndex: entryPoint, player })) {
        destinations.push({
          to: entryPoint,
          dieValue,
          wouldHit: wouldHitBlot({ board, pointIndex: entryPoint, player })
        })
      }
    }

    if (destinations.length > 0) {
      result.push({ from: 'bar', destinations })
    }

    return result
  }

  // Regular moves from points
  const occupiedPoints = getOccupiedPoints({ board, player })

  for (const from of occupiedPoints) {
    const destinations: MoveDestination[] = []

    for (const dieValue of uniqueDice) {
      // Try regular move
      const to = calculateDestination({ from, dieValue, player })

      if (to !== null && !isPointBlocked({ board, pointIndex: to, player })) {
        destinations.push({
          to,
          dieValue,
          wouldHit: wouldHitBlot({ board, pointIndex: to, player })
        })
      }

      // Try bearing off
      if (
        canBearOffNow &&
        isBearingOffDestination({ from, dieValue, player })
      ) {
        if (isValidBearOffMove({ board, from, dieUsed: dieValue, player })) {
          destinations.push({
            to: 'off',
            dieValue,
            wouldHit: false
          })
        }
      }
    }

    if (destinations.length > 0) {
      result.push({ from, destinations })
    }
  }

  return result
}

/**
 * Check if the game is over and return the result.
 * Returns null if the game is not over.
 */
export function checkGameOver({
  state
}: {
  state: GameState
}): GameResult | null {
  const { board } = state

  // Check if either player has borne off all checkers
  for (const player of ['white', 'black'] as const) {
    if (board.borneOff[player] === CHECKERS_PER_PLAYER) {
      const opponent = player === 'white' ? 'black' : 'white'
      const victoryType = determineVictoryType({
        board,
        winner: player,
        loser: opponent
      })

      const cubeValue: CubeValue = state.doublingCube?.value ?? 1
      return {
        winner: player,
        victoryType,
        cubeValue,
        points: computeGamePoints({ victoryType, cubeValue })
      }
    }
  }

  return null
}

/**
 * Determine the type of victory (single, gammon, or backgammon).
 */
function determineVictoryType({
  board,
  winner,
  loser
}: {
  board: BoardState
  winner: Player
  loser: Player
}): VictoryType {
  // If loser has borne off any checkers, it's a single game
  if (board.borneOff[loser] > 0) {
    return 'single'
  }

  // Check for backgammon: loser has checker on bar or in winner's home board
  if (board.bar[loser] > 0) {
    return 'backgammon'
  }

  // Check if loser has checkers in winner's home board
  const winnerHomePoints = HOME_BOARD[winner]
  for (const point of winnerHomePoints) {
    const count = getCheckerCount({ board, pointIndex: point, player: loser })
    if (count > 0) {
      return 'backgammon'
    }
  }

  // Gammon: loser hasn't borne off any checkers
  return 'gammon'
}

/**
 * Check if the current player has any legal moves.
 * Used to determine if turn should be automatically forfeited.
 */
export function hasAnyLegalMoves({ state }: { state: GameState }): boolean {
  return getValidMoves({ state }).length > 0
}

/**
 * Check if the current player can end their turn.
 * According to backgammon rules, a player must use as many dice as legally possible.
 * Turn can only end when:
 * 1. All dice have been used (remainingMoves is empty), OR
 * 2. No legal moves are available
 */
export function canEndTurn({ state }: { state: GameState }): boolean {
  // If not in moving phase, turn cannot be ended this way
  if (state.phase !== 'moving') {
    return false
  }

  // All dice used - can end turn
  if (state.remainingMoves.length === 0) {
    return true
  }

  // Still have dice remaining - can only end if no legal moves
  return !hasAnyLegalMoves({ state })
}

/**
 * Get the initial board state for a new game.
 */
export function createInitialBoard(): BoardState {
  return {
    points: [
      -2, // Point 1: 2 black
      0, // Point 2
      0, // Point 3
      0, // Point 4
      0, // Point 5
      5, // Point 6: 5 white
      0, // Point 7
      3, // Point 8: 3 white
      0, // Point 9
      0, // Point 10
      0, // Point 11
      -5, // Point 12: 5 black
      5, // Point 13: 5 white
      0, // Point 14
      0, // Point 15
      0, // Point 16
      -3, // Point 17: 3 black
      0, // Point 18
      -5, // Point 19: 5 black
      0, // Point 20
      0, // Point 21
      0, // Point 22
      0, // Point 23
      2 // Point 24: 2 white
    ],
    bar: { white: 0, black: 0 },
    borneOff: { white: 0, black: 0 }
  }
}

/**
 * Count total checkers for a player (on board + bar + borne off).
 */
export function countTotalCheckers({
  board,
  player
}: {
  board: BoardState
  player: Player
}): number {
  let count = board.bar[player] + board.borneOff[player]

  for (let i = 0; i < 24; i++) {
    const value = board.points[i]
    if (player === 'white' && value > 0) {
      count += value
    } else if (player === 'black' && value < 0) {
      count += -value
    }
  }

  return count
}

/**
 * Filter valid moves to only those that use a specific die value.
 * Useful for implementing "must play higher die" rule.
 */
export function filterMovesByDie({
  availableMoves,
  dieValue
}: {
  availableMoves: readonly AvailableMoves[]
  dieValue: DieValue
}): AvailableMoves[] {
  return availableMoves
    .map(am => ({
      from: am.from,
      destinations: am.destinations.filter(d => d.dieValue === dieValue)
    }))
    .filter(am => am.destinations.length > 0)
}

/**
 * Check if a sequence of moves uses both dice values.
 * Used to enforce "must use both dice if possible" rule.
 */
export function canUseBothDice({
  state,
  firstMove
}: {
  state: GameState
  firstMove: Move
}): boolean {
  // Apply the first move to a copy of the state
  const afterFirstMove = applyMoveToBoard({ state, move: firstMove })

  // Check if there are remaining moves with the other die
  const remainingDice = state.remainingMoves.filter(
    (_, i) => i !== state.remainingMoves.indexOf(firstMove.dieUsed)
  )

  if (remainingDice.length === 0) {
    return true // No second die to use
  }

  const stateAfterMove: GameState = {
    ...state,
    board: afterFirstMove,
    remainingMoves: remainingDice
  }

  return hasAnyLegalMoves({ state: stateAfterMove })
}

/**
 * Apply a move to the board and return the new board state.
 * Does not mutate the original board.
 */
export function applyMoveToBoard({
  state,
  move
}: {
  state: GameState
  move: Move
}): BoardState {
  const { from, to } = move
  const player = state.currentPlayer
  if (!player) {
    throw new Error('Cannot apply move: no current player')
  }
  const board = state.board

  // Create mutable copies
  const newPoints = [...board.points] as [
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
  const newBar = { ...board.bar }
  const newBorneOff = { ...board.borneOff }

  // Remove checker from source
  if (from === 'bar') {
    newBar[player]--
  } else {
    const fromIndex = from - 1
    if (player === 'white') {
      newPoints[fromIndex]--
    } else {
      newPoints[fromIndex]++
    }
  }

  // Place checker at destination
  if (to === 'off') {
    newBorneOff[player]++
  } else {
    const toIndex = to - 1
    const pointValue = newPoints[toIndex]

    // Check for hitting a blot
    if (player === 'white' && pointValue === -1) {
      newPoints[toIndex] = 1
      newBar.black++
    } else if (player === 'black' && pointValue === 1) {
      newPoints[toIndex] = -1
      newBar.white++
    } else {
      if (player === 'white') {
        newPoints[toIndex]++
      } else {
        newPoints[toIndex]--
      }
    }
  }

  return {
    points: newPoints,
    bar: newBar,
    borneOff: newBorneOff
  }
}

/**
 * Get all legal move sequences for the current turn.
 * This is used to determine which moves are forced and
 * to implement the "must play higher die" rule.
 */
export function getLegalMoveSequences({
  state
}: {
  state: GameState
}): Move[][] {
  const sequences: Move[][] = []

  function explore(currentState: GameState, currentSequence: Move[]): void {
    const validMoves = getValidMoves({ state: currentState })

    if (validMoves.length === 0) {
      // No more moves possible, save this sequence if it's non-empty
      if (currentSequence.length > 0) {
        sequences.push([...currentSequence])
      }
      return
    }

    // Try each possible move
    for (const available of validMoves) {
      for (const dest of available.destinations) {
        const move: Move = {
          from: available.from,
          to: dest.to,
          dieUsed: dest.dieValue
        }

        const newBoard = applyMoveToBoard({ state: currentState, move })
        const newRemainingMoves = [...currentState.remainingMoves]
        const dieIndex = newRemainingMoves.indexOf(dest.dieValue)
        if (dieIndex !== -1) {
          newRemainingMoves.splice(dieIndex, 1)
        }

        const newState: GameState = {
          ...currentState,
          board: newBoard,
          remainingMoves: newRemainingMoves
        }

        currentSequence.push(move)
        explore(newState, currentSequence)
        currentSequence.pop()
      }
    }
  }

  explore(state, [])

  // If no sequences found, add an empty sequence
  if (sequences.length === 0) {
    sequences.push([])
  }

  return sequences
}

/**
 * Determine which moves the player must choose from based on the
 * "must use both dice if possible" and "must play higher die" rules.
 */
export function getRequiredMoves({ state }: { state: GameState }): {
  mustPlayBothDice: boolean
  mustPlayHigherDie: boolean
  requiredDie: DieValue | null
  maxMovesUsable: number
} {
  const sequences = getLegalMoveSequences({ state })

  // Find the maximum number of dice used in any sequence
  const maxMovesUsable = Math.max(...sequences.map(s => s.length), 0)

  // If only 0 or 1 moves possible, no special requirements
  if (maxMovesUsable <= 1) {
    // Check if we need to play the higher die
    if (maxMovesUsable === 1 && state.remainingMoves.length === 2) {
      const [d1, d2] = state.remainingMoves
      if (d1 !== d2) {
        const higherDie = Math.max(d1, d2) as DieValue
        const lowerDie = Math.min(d1, d2) as DieValue

        // Check if higher die can be played
        const higherMoves = filterMovesByDie({
          availableMoves: getValidMoves({ state }),
          dieValue: higherDie
        })

        if (higherMoves.length > 0) {
          return {
            mustPlayBothDice: false,
            mustPlayHigherDie: true,
            requiredDie: higherDie,
            maxMovesUsable
          }
        }

        // Must play lower die
        return {
          mustPlayBothDice: false,
          mustPlayHigherDie: false,
          requiredDie: lowerDie,
          maxMovesUsable
        }
      }
    }

    return {
      mustPlayBothDice: false,
      mustPlayHigherDie: false,
      requiredDie: null,
      maxMovesUsable
    }
  }

  // If 2+ moves are possible, must play both dice
  return {
    mustPlayBothDice: maxMovesUsable >= 2,
    mustPlayHigherDie: false,
    requiredDie: null,
    maxMovesUsable
  }
}

// =============================================================================
// Doubling Cube Functions
// =============================================================================

/**
 * Compute the victory multiplier for a victory type.
 * single=1, gammon=2, backgammon=3
 */
function getVictoryMultiplier(victoryType: VictoryType): number {
  switch (victoryType) {
    case 'single':
      return 1
    case 'gammon':
      return 2
    case 'backgammon':
      return 3
  }
}

/**
 * Compute the total game points: victoryMultiplier * cubeValue
 */
export function computeGamePoints({
  victoryType,
  cubeValue
}: {
  victoryType: VictoryType
  cubeValue: CubeValue
}): number {
  return getVictoryMultiplier(victoryType) * cubeValue
}

/**
 * Check if the current player can propose a double.
 * Conditions:
 * - Game is in rolling phase (before rolling)
 * - Doubling cube is enabled (non-null)
 * - Cube value is less than 64
 * - Current player owns the cube or cube is centered
 */
export function canProposeDouble({ state }: { state: GameState }): boolean {
  if (state.phase !== 'rolling') return false
  if (state.doublingCube === null) return false
  if (state.doublingCube.value >= 64) return false
  const { owner } = state.doublingCube
  return owner === 'centered' || owner === state.currentPlayer
}
