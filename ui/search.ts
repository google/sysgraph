/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Graph} from './graph.js';

/**
 * Represents a range of a match within a text.
 * @property start The start index of the match.
 * @property end The end index of the match.
 */
export interface MatchRange {
  start: number;
  end: number;
}

/**
 * SearchController manages the search functionality in the sysgraph
 * visualizer. It handles user input, search options (regex, case sensitivity),
 * finding matches within action arguments, updating the UI to display results,
 * and navigation between matches.
 */
export class SearchController {
  private matches: number[] = [];
  private fileMatches: number[] = [];
  private query = '';
  private regex: RegExp | null = null;
  invalid = false;
  useRegex = false;
  matchCase = false;
  private actionSearchIndex = 0;
  private fileSearchIndex = 0;
  private searchTimeoutId: number | null = null;
  isSearching = false;

  /**
   * @param graph The sysgraph data.
   * @param onUpdate Function to call when search results are updated.
   */
  constructor(
    private readonly graph: Graph,
    private readonly onUpdate: () => void,
  ) {}

  /**
   * Sets the search query and triggers a new search.
   * @param query The search query.
   */
  setQuery(query: string) {
    this.query = query;
    this.regex = null;
    this.invalid = false;

    if (this.useRegex) {
      try {
        const flags = this.matchCase ? 'g' : 'gi';
        this.regex = new RegExp(this.query, flags);
      } catch {
        this.invalid = true;
        this.regex = null;
      }
    }

    if (this.invalid) {
      this.matches = [];
      this.fileMatches = [];
      this.onUpdate();
      return;
    }

    this.startFindMatches();
  }

  /**
   * Checks if the current query is an exact match for the given text.
   * @param text The text to check against.
   * @return True if the query exactly matches the text.
   */
  isExactMatch(text: string): boolean {
    return this.query === text;
  }

  /**
   * Finds all matching ranges of the current query within the given text.
   * Considers the current search settings (regex, case sensitivity).
   * @param text The text to search within.
   * @return An array of MatchRange objects indicating the start and end indices of each match.
   */
  matchRanges(text: string): MatchRange[] {
    const out: MatchRange[] = [];
    if (text.length === 0 || this.query.length === 0) {
      return out;
    }

    const mergeOrPush = (range: MatchRange) => {
      if (out.length > 0 && range.start <= out[out.length - 1].end) {
        out[out.length - 1].end = Math.max(out[out.length - 1].end, range.end);
      } else {
        out.push(range);
      }
    };

    if (this.regex) {
      for (const match of text.matchAll(this.regex)) {
        const index = match.index;
        if (index === undefined) {
          continue;
        }
        mergeOrPush({start: index, end: index + match[0].length});
      }
    } else {
      const queryText = this.matchCase ? this.query : this.query.toLowerCase();
      const textCased = this.matchCase ? text : text.toLowerCase();
      let index = textCased.indexOf(queryText);

      while (index !== -1) {
        mergeOrPush({start: index, end: index + queryText.length});
        index = textCased.indexOf(queryText, index + queryText.length);
      }
    }
    return out;
  }

  private isTextMatch(text: string): boolean {
    if (this.regex) {
      const result = this.regex.test(text);
      this.regex.lastIndex = 0;
      return result;
    }
    const queryText = this.matchCase ? this.query : this.query.toLowerCase();
    const textCased = this.matchCase ? text : text.toLowerCase();
    return textCased.includes(queryText);
  }

  /**
   * Finds all actions that match the current search query.
   * Searches within action IDs, PIDs, and arguments.
   */
  private startFindMatches() {
    if (this.searchTimeoutId) {
      clearTimeout(this.searchTimeoutId);
      this.searchTimeoutId = null;
    }
    this.matches = [];
    this.fileMatches = [];
    this.actionSearchIndex = 0;
    this.fileSearchIndex = 0;
    this.isSearching = true;

    if (!this.query) {
      this.isSearching = false;
      this.onUpdate();
      return;
    }

    this.findMatchesAsync();
  }

  private findMatchesAsync() {
    const startTime = performance.now();
    const batchTimeLimit = 7; // ms

    // Search actions
    while (this.actionSearchIndex < this.graph.actions.length) {
      const a = this.graph.actions[this.actionSearchIndex];
      this.actionSearchIndex++;

      // Check against pid and id first
      if (this.query === a.pid.toString() || this.query === a.id.toString()) {
        this.matches.push(a.id);
        continue;
      }

      // Don't match clone args since they should be matched by the parent.
      if (a.isClone) {
        continue;
      }

      if (this.isTextMatch(a.args.join(' '))) {
        this.matches.push(a.id);
      }

      if (performance.now() - startTime > batchTimeLimit) {
        this.searchTimeoutId = window.setTimeout(() => {
          this.findMatchesAsync();
        }, 7);
        this.onUpdate();
        return;
      }
    }

    // Search files
    while (this.fileSearchIndex < this.graph.files.length) {
      const f = this.graph.files[this.fileSearchIndex];
      if (this.isTextMatch(f)) {
        this.fileMatches.push(this.fileSearchIndex);
      }
      this.fileSearchIndex++;

      if (performance.now() - startTime > batchTimeLimit) {
        this.searchTimeoutId = window.setTimeout(() => {
          this.findMatchesAsync();
        }, 7);
        this.onUpdate();
        return;
      }
    }

    // Search complete
    this.isSearching = false;
    this.searchTimeoutId = null;
    this.onUpdate();
  }

  /**
   * Returns matched action IDs.
   */
  getMatches(): readonly number[] {
    return this.matches;
  }

  /**
   * Returns matched file IDs.
   */
  getFileMatches(): readonly number[] {
    return this.fileMatches;
  }
}
