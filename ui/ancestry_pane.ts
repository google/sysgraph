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

import {css, html, LitElement, PropertyValues} from 'lit';
import {customElement, property} from 'lit/decorators.js';
import {map} from 'lit/directives/map.js';
import './action.js';
import {defaultActionDisplayOptions} from './action.js';
import {type Action} from './graph.js';

/**
 * A pane that displays ancestry of actions related to the selected action.
 */
@customElement('ancestry-pane')
export class AncestryPane extends LitElement {
  static override styles = css`
    :host {
      word-break: break-all;
      line-break: anywhere;
      tab-size: 1;
    }
  `;
  @property({type: Array}) actions: Action[] = [];
  @property({type: Number}) selectedActionID = -1;
  @property({type: Object}) displayOptions = defaultActionDisplayOptions;

  override render() {
    return html`
      ${map(
        this.actions,
        (a) =>
          html`<action-element
            .action=${a}
            .displayOptions=${this.displayOptions}
            .isSelected=${a.id === this.selectedActionID}></action-element>`,
      )}
    `;
  }

  override async updated(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('actions')) {
      // scrollIntoView needs to be called after the DOM is updated and
      // rendered, so we wait for updateComplete to resolve.
      await this.updateComplete;
      this.shadowRoot?.lastElementChild?.scrollIntoView({block: 'end'});
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ancestry-pane': AncestryPane;
  }
}
