/**
 * Pseudorandom number generator for reproducible chaos testing
 */

import { PseudoRandom } from '../types/chaos';

/**
 * Linear Congruential Generator for reproducible pseudorandom numbers
 * Based on Numerical Recipes parameters for good statistical properties
 */
export class MCPPseudoRandom implements PseudoRandom {
  private state: number;

  constructor(seed: number = Date.now()) {
    this.state = seed;
  }

  /**
   * Generate next pseudorandom number between 0 and 1
   */
  next(): number {
    // LCG: (a * x + c) mod m
    // Using values from Numerical Recipes: a=1664525, c=1013904223, m=2^32
    this.state = (this.state * 1664525 + 1013904223) % 4294967296;
    return this.state / 4294967296;
  }

  /**
   * Generate random integer between min (inclusive) and max (exclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * Generate random float between min and max
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Generate boolean with given probability (0.0 to 1.0)
   */
  nextBoolean(probability: number): boolean {
    return this.next() < probability;
  }

  /**
   * Shuffle array in place using Fisher-Yates algorithm
   */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Get current seed state for debugging
   */
  getState(): number {
    return this.state;
  }

  /**
   * Reset to specific state
   */
  setState(state: number): void {
    this.state = state;
  }
}
