/**
 * Dice Utilities
 *
 * Functions for rolling dice and computing remaining moves.
 */

import type { DiceRoll, DieValue } from './types'

/**
 * Roll a single die (returns 1-6).
 */
export function rollDie(): DieValue {
  return (Math.floor(Math.random() * 6) + 1) as DieValue
}

/**
 * Roll two dice and return a DiceRoll.
 */
export function createDiceRoll(): DiceRoll {
  return {
    die1: rollDie(),
    die2: rollDie()
  }
}

/**
 * Get the remaining moves from a dice roll.
 * Doubles give 4 moves of the same value, otherwise 2 moves.
 */
export function getRemainingMovesFromDice(diceRoll: DiceRoll): DieValue[] {
  if (diceRoll.die1 === diceRoll.die2) {
    // Doubles: 4 moves
    return [diceRoll.die1, diceRoll.die1, diceRoll.die1, diceRoll.die1]
  }
  return [diceRoll.die1, diceRoll.die2]
}

/**
 * Roll dice for determining first player (re-rolls on ties).
 * Returns the dice roll and which player goes first.
 */
export function rollForFirstPlayer(): {
  diceRoll: DiceRoll
  firstPlayer: 'white' | 'black'
} {
  let die1 = rollDie()
  let die2 = rollDie()

  // Re-roll if tied
  while (die1 === die2) {
    die1 = rollDie()
    die2 = rollDie()
  }

  // Higher die goes first
  const firstPlayer = die1 > die2 ? 'white' : 'black'

  // Arrange dice so the first player's die is die1
  const diceRoll: DiceRoll =
    firstPlayer === 'white' ? { die1, die2 } : { die1: die2, die2: die1 }

  return { diceRoll, firstPlayer }
}
