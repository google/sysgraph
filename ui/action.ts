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

import {css, html, LitElement, PropertyValues, TemplateResult} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {when} from 'lit/directives/when.js';
import {type Action} from './graph.js';
import {MatchRange, SearchController} from './search.js';

/** Detail for the action-selected event. */
export interface ActionSelectedEventDetail {
  action: Action;
}

/** Options for displaying action elements. */
export declare interface ActionDisplayOptions {
  pid: boolean;
  ppid: boolean;
  aid: boolean;
  paid: boolean;
  startTime: boolean;
  endTime: boolean;
  syscall: boolean;
  findings: boolean;
}

/** Default display options for action elements. */
export const defaultActionDisplayOptions: ActionDisplayOptions = {
  pid: true,
  ppid: false,
  aid: false,
  paid: false,
  startTime: true,
  endTime: true,
  syscall: true,
  findings: true,
};

/**
 * Applies highlighting to a text based on match ranges.
 * @param text The text to highlight.
 * @param matches The match ranges to highlight.
 * @return An array of strings or TemplateResults with highlights.
 */
export function highlightRanges(
  text: string,
  matches: MatchRange[],
): Array<TemplateResult | string> {
  if (matches.length === 0) {
    return [text];
  }
  const parts: Array<TemplateResult | string> = [];
  let lastIndex = 0;
  for (const match of matches) {
    if (match.start > lastIndex) {
      parts.push(text.substring(lastIndex, match.start));
    }
    parts.push(
      html`<span class="highlight"
        >${text.substring(match.start, match.end)}</span
      >`,
    );
    lastIndex = match.end;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts;
}

/**
 * Replaces ASCII control characters (0x00-0x1F and 0x7F) in a string
 * with their corresponding Unicode Control Pictures symbols.
 */
export function replaceControlCharsWithSymbols(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1F\x7F]/g, (match) => {
    const charCode = match.charCodeAt(0);
    if (charCode === 0x7f) {
      // DEL character
      return String.fromCharCode(0x2421); // ␡ (Symbol for Delete)
    } else {
      // Characters 0x00 - 0x1F
      return String.fromCharCode(0x2400 + charCode); // ␀ through ␟
    }
    // TODO: Also replace zero width chars?
  });
}

/**
 * Formats a duration given in nanoseconds into a human-readable string (e.g., "1m23.456s").
 * @param elapsedNanos The duration in nanoseconds.
 * @return The formatted time string.
 */
export function formatNanoseconds(elapsedNanos: bigint): string {
  // Handle zero or negative durations
  if (elapsedNanos <= 0) {
    return '0.000s';
  }

  const totalSeconds = Math.floor(Number(elapsedNanos / BigInt(1_000_000_000)));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor(
    Number((elapsedNanos % BigInt(1_000_000_000)) / BigInt(1_000_000)),
  );

  const formattedTime = `${minutes > 0 ? `${minutes}m` : ''}${seconds}.${String(
    milliseconds,
  ).padStart(3, '0')}s`;

  return formattedTime;
}

/**
 * An element that displays an action.
 */
@customElement('action-element')
export class ActionElement extends LitElement {
  static override styles = css`
    :host {
      display: block;
      word-break: break-all;
      line-break: anywhere;
      tab-size: 1;
      width: 100%;
      border-bottom: 1px solid var(--playground-hover-bg);
    }
    :host(:hover) {
      background-color: var(--playground-hover-bg);
    }
    :host([is-selected]),
    :host([is-selected]:hover) {
      background-color: var(--playground-selected-bg);
    }
    :host([abs-positioned]) {
      position: absolute;
    }
    .action-header {
      display: flex;
      font-size: 10px;
      color: var(--playground-secondary-text-color);
      height: 16px;
      overflow: hidden;
    }
    .timing {
      flex: 1;
      text-align: right;
    }
    .highlight {
      background-color: var(--playground-highlight-bg);
    }
    .status-badge {
      display: inline-block;
      margin-left: 8px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 10px;
      font-weight: bold;
      background-color: var(--playground-status-badge-bg);
    }
    .warning-icon {
      margin-left: 5px;
      width: 16px;
      height: 16px;
      font-size: 14px;
    }
    .action-rule-name {
      background-color: var(--playground-warning-bg);
      padding: 0 4px;
      border-radius: 4px;
    }
  `;
  @property({type: Object}) action: Action | null = null;
  @property({type: Object}) searchController: SearchController | null = null;
  @property({type: Object}) displayOptions = defaultActionDisplayOptions;
  @property({type: Boolean, reflect: true, attribute: 'is-selected'})
  isSelected = false;
  @property({type: Boolean, reflect: true, attribute: 'abs-positioned'})
  absPositioned = false;

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', this.handleClick);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('click', this.handleClick);
  }

  private readonly handleClick = (_e: Event) => {
    if (!this.action) {
      return;
    }
    const event = new CustomEvent<ActionSelectedEventDetail>(
      'action-selected',
      {
        detail: {action: this.action},
        bubbles: true,
        composed: true,
      },
    );
    this.dispatchEvent(event);
  };

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (this.action && changedProperties.has('action')) {
      this.dataset['id'] = this.action.id.toString();
    }
  }

  private renderProcessMetadata(): TemplateResult | string {
    const action = this.action!;
    const searchController = this.searchController;
    const opts = this.displayOptions;

    const parts: Array<TemplateResult | string> = [];

    if (opts.pid) {
      const pidString = action.pid.toString();
      const pidHtml =
        searchController && searchController.isExactMatch(pidString)
          ? html`<span class="highlight">${pidString}</span>`
          : html`${pidString}`;
      parts.push(pidHtml);
    }

    if (opts.ppid && action.ppid) {
      parts.push(html`ppid:${action.ppid}`);
    }

    if (opts.aid) {
      const aidString = action.id.toString();
      const aidHtml =
        searchController && searchController.isExactMatch(aidString)
          ? html`<span class="highlight">${aidString}</span>`
          : html`${aidString}`;
      parts.push(html`aid:${aidHtml}`);
    }

    if (opts.paid) {
      parts.push(html`paid:${action.parentId.toString()}`);
    }

    if (opts.syscall) {
      if (action.isClone) {
        parts.push(html`(clone)`);
      } else {
        parts.push(html`(exec)`);
      }
    }

    if (parts.length === 0) {
      return '';
    }
    return html`${parts.map((part, i) => (i > 0 ? html` ${part}` : part))}`;
  }

  private renderRuleMatch(): TemplateResult | string {
    const action = this.action!;
    if (!this.displayOptions.findings) {
      return '';
    }
    return when(
      action.ruleMatch,
      () => html`
        <div class="warning-icon">⚠️</div>
        <div class="action-rule-name">${action.ruleName}</div>
      `,
    );
  }

  private renderExitStatus(): TemplateResult | string {
    const action = this.action!;
    const isFailure =
      (action.exitStatus != null && action.exitStatus !== 0) ||
      (action.exitSignal != null && action.exitSignal !== '');
    if (!isFailure) {
      return '';
    }
    const textParts: string[] = [];
    if (action.exitStatus != null && action.exitStatus !== 0) {
      textParts.push(`exit_status: ${action.exitStatus}`);
    }
    if (action.exitSignal != null && action.exitSignal !== '') {
      textParts.push(`exit_signal: ${action.exitSignal}`);
    }
    return html`<span class="status-badge"
      >${`(${textParts.join('; ')})`}</span
    >`;
  }

  private renderTime(): string | null {
    const action = this.action!;
    const opts = this.displayOptions;
    const timeParts: string[] = [];
    if (opts.startTime) {
      timeParts.push(formatNanoseconds(action.startElapsedNanos));
    }
    if (opts.endTime && action.endElapsedNanos !== BigInt(0)) {
      timeParts.push(formatNanoseconds(action.endElapsedNanos));
    }
    if (timeParts.length === 0) {
      return null;
    }
    return timeParts.join(' - ');
  }

  private renderArgs(): TemplateResult | string {
    const action = this.action!;
    const searchController = this.searchController;
    if (action.isClone || !action.args || action.args.length === 0) {
      return '';
    }

    const args = action.args.join(' ');
    const processedArgs = replaceControlCharsWithSymbols(args);

    if (!searchController) {
      return html`<div class="action-args">${processedArgs}</div>`;
    }

    const matches = searchController.matchRanges(args);
    if (matches.length === 0) {
      return html`<div class="action-args">${processedArgs}</div>`;
    }

    return html`<div class="action-args"
      >${highlightRanges(processedArgs, matches)}</div
    >`;
  }

  override render(): TemplateResult {
    if (!this.action) {
      return html``;
    }

    return html`
      <div class="action-header">
        <div class="action-header-pid"> ${this.renderProcessMetadata()} </div>
        ${this.renderExitStatus()} ${this.renderRuleMatch()}
        <div class="timing">${this.renderTime()}</div>
      </div>
      ${this.renderArgs()}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'action-element': ActionElement;
  }
}
