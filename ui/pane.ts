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

import {css, html, LitElement, nothing} from 'lit';
import {customElement, property} from 'lit/decorators.js';

/** Detail for pane-toggle event. */
export interface PaneToggleEventDetail {
  open: boolean;
  element: PaneView;
}

/**
 * PaneView: A collapsible content container.
 *
 * - Renders a header (always visible) and content (togglable).
 * - Manages its own 'open' state via properties and attributes.
 * - Dispatches 'pane-toggle' events so the parent SplitView can recalculate layout.
 */
@customElement('pane-view')
export class PaneView extends LitElement {
  @property({type: String, attribute: 'pane-title'}) paneTitle = '';
  @property({type: Boolean, reflect: true}) open = false;
  @property({type: Boolean, reflect: true}) collapsible = true;

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      background: white;
      overflow: hidden;
      height: 100%;
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
    }

    .header {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      background: var(--playground-header-bg);
      border-bottom: 1px solid var(--playground-border-color-strong);
      flex-shrink: 0;
      height: 28px;
      user-select: none;
      box-sizing: border-box;
      font-family: var(--playground-font-family);
      font-size: 12px;
      letter-spacing: 0px;
      line-height: 20px;
    }

    :host([collapsible]) .header {
      cursor: pointer;
    }

    .content {
      flex: 1;
      overflow: auto;
    }

    .content::-webkit-scrollbar {
      width: var(--playground-scrollbar-width);
      height: var(--playground-scrollbar-height);
      border-left: var(--playground-scrollbar-border);
    }
    .content::-webkit-scrollbar-track {
      background: var(--playground-scrollbar-track-bg);
    }
    .content::-webkit-scrollbar-thumb {
      background: var(--playground-scrollbar-thumb-bg);
    }
    .content::-webkit-scrollbar-thumb:hover {
      background: var(--playground-scrollbar-thumb-hover-bg);
    }
    .content::-webkit-scrollbar-thumb:active {
      background: var(--playground-scrollbar-thumb-active-bg);
    }

    /* When closed, we force height to auto (shrinking to header) and stop growing */
    :host(:not([open])) {
      height: auto !important;
      flex-grow: 0 !important;
    }
    :host(:not([open])) .content {
      display: none;
    }

    .chevron {
      margin-right: 8px;
      display: inline-block;
      width: 1rem;
      text-align: center;
      font-size: 14px;
      line-height: 1;
    }

    /* When closed, we move the chevron to the left a bit to improve the open/closed horizontal alignment */
    :host(:not([open])) .chevron {
      left: -2px;
    }

    :host([open]) .chevron {
      transform: rotate(90deg);
    }

    .title-text {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;

  toggle() {
    if (!this.collapsible) return;
    this.open = !this.open;
    // Notify parent to trigger layout redistribution
    this.dispatchEvent(
      new CustomEvent<PaneToggleEventDetail>('pane-toggle', {
        bubbles: true,
        composed: true,
        detail: {open: this.open, element: this},
      }),
    );
  }

  override render() {
    return html`
      <div class="header" @click=${this.toggle}>
        ${
          this.collapsible
            ? html`<span class="chevron">&#8250;</span>`
            : nothing
        }
        <span class="title-text">${this.paneTitle}</span>
        <slot name="header"></slot>
      </div>
      <div class="content"><slot></slot></div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pane-view': PaneView;
  }
}
