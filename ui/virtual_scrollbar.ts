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
import {customElement, property, state} from 'lit/decorators.js';
import {map} from 'lit/directives/map.js';
import {styleMap} from 'lit/directives/style-map.js';
import {when} from 'lit/directives/when.js';

// Threshold for rendering the visible fraction indicator within the thumb. The
// indicator is only shown if its calculated height is less than or equal to
// this value, which occurs when viewing a small fraction of large content.
const MAX_SCROLLBAR_INDICATOR_HEIGHT_PX = 10;

const INDICATOR_HEIGHT_PX = 4;

/**
 * A virtual scrollbar component that can be used with custom scrollable
 * containers.
 */
@customElement('virtual-scrollbar')
export class VirtualScrollbar extends LitElement {
  /** The current scroll position of the content. */
  @property({type: Number}) virtualScrollTop = 0;
  /** The total height of the scrollable content. */
  @property({type: Number}) contentHeight = 0;
  /** The visible height of the scrollable area. */
  @property({type: Number}) viewportHeight = 0;
  /** The minimum height of the scrollbar thumb in pixels. */
  @property({type: Number}) minThumbHeight = 40;
  /** Scroll top positions of indicators to display on the scrollbar. */
  @property({type: Array}) indicatorTops: number[] = [];

  @state() isDragging = false;
  private dragStartPointerY = 0;
  private dragStartScrollTop = 0;
  private previousUserSelect = '';

  @state() private thumbHeight = 0;
  @state() private thumbTop = 0;
  @state() private proportionateThumbHeight = 0;

  static override styles = css`
    :host {
      flex: 0 0 var(--playground-scrollbar-width);
      width: var(--playground-scrollbar-width);
      border-left: var(--playground-scrollbar-border);
      position: relative;
      overflow: hidden;
      background: var(--playground-scrollbar-track-bg);
      box-sizing: border-box;
    }
    .thumb {
      position: absolute;
      left: 0;
      width: 100%;
      background: var(--playground-scrollbar-thumb-bg);
      cursor: default;
      overflow: hidden;
    }
    .thumb:hover {
      background: var(--playground-scrollbar-thumb-hover-bg);
    }
    :host(.dragging) .thumb {
      background: var(--playground-scrollbar-thumb-active-bg);
    }
    .thumb-visible-fraction {
      position: absolute;
      left: 0;
      width: 100%;
      background: var(--playground-scrollbar-thumb-visible-fraction-bg);
    }
    .indicator {
      position: absolute;
      left: 0;
      width: 100%;
      height: ${INDICATOR_HEIGHT_PX}px;
      background: var(--playground-warning-bg);
    }
    .drag-mask {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 9999;
      display: none;
      cursor: default;
    }
    :host(.dragging) .drag-mask {
      display: block;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.addEventListener('pointerdown', this.onTrackPointerDown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('pointerdown', this.onTrackPointerDown);
    // If component is removed while dragging, clean up global listeners and state.
    this.stopDragging();
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (
      changedProperties.has('contentHeight') ||
      changedProperties.has('viewportHeight') ||
      changedProperties.has('minThumbHeight') ||
      changedProperties.has('virtualScrollTop')
    ) {
      if (this.contentHeight <= this.viewportHeight) {
        this.thumbHeight = 0;
        this.proportionateThumbHeight = 0;
        this.thumbTop = 0;
      } else {
        this.thumbHeight = Math.min(
          this.viewportHeight,
          Math.max(
            this.minThumbHeight,
            (this.viewportHeight * this.viewportHeight) / this.contentHeight,
          ),
        );
        this.proportionateThumbHeight =
          (this.viewportHeight * this.viewportHeight) / this.contentHeight;
        this.thumbTop =
          (this.virtualScrollTop * (this.viewportHeight - this.thumbHeight)) /
          (this.contentHeight - this.viewportHeight);
      }
    }
  }

  private onThumbPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.isDragging = true;
    this.dragStartPointerY = e.clientY;
    this.dragStartScrollTop = this.virtualScrollTop;
    this.ownerDocument.addEventListener('pointermove', this.onPointerMove);
    this.ownerDocument.addEventListener('pointerup', this.onPointerUp);
    this.classList.add('dragging');
    this.previousUserSelect = this.ownerDocument.body.style.userSelect;
    this.ownerDocument.body.style.userSelect = 'none';
  }

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.isDragging) return;
    e.preventDefault();
    const pointerDelta = e.clientY - this.dragStartPointerY;
    const trackHeight = this.viewportHeight;
    const contentRatio = this.contentHeight / trackHeight;
    const scrollDelta = pointerDelta * contentRatio;
    const newScrollTop = this.dragStartScrollTop + scrollDelta;
    this.dispatchScrollTo(newScrollTop);
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    if (!this.isDragging) return;
    e.preventDefault();
    this.stopDragging();
  };

  private stopDragging() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.ownerDocument.removeEventListener('pointermove', this.onPointerMove);
    this.ownerDocument.removeEventListener('pointerup', this.onPointerUp);
    this.classList.remove('dragging');
    this.ownerDocument.body.style.userSelect = this.previousUserSelect;
  }

  private onTrackPointerDown(e: PointerEvent) {
    if (
      e.button !== 0 ||
      e.target !== this ||
      this.contentHeight <= this.viewportHeight
    ) {
      return;
    }
    if (this.thumbHeight >= this.viewportHeight) {
      return;
    }

    const clickY = e.offsetY;
    const trackClickRange = this.viewportHeight - this.thumbHeight;

    // Position where the middle of the thumb should be after click.
    let targetThumbTop = clickY - this.thumbHeight / 2;
    // Clamp to valid range.
    targetThumbTop = Math.max(0, Math.min(targetThumbTop, trackClickRange));

    const newScrollTop =
      (targetThumbTop * (this.contentHeight - this.viewportHeight)) /
      trackClickRange;
    this.dispatchScrollTo(newScrollTop);
  }

  private dispatchScrollTo(scrollTop: number) {
    const maxScroll = this.contentHeight - this.viewportHeight;
    const newScrollTop = Math.max(0, Math.min(scrollTop, maxScroll));
    this.dispatchEvent(
      new CustomEvent('scroll-to', {
        detail: {scrollTop: newScrollTop},
      }),
    );
  }

  override render() {
    if (this.contentHeight <= this.viewportHeight) {
      return html`<div class="drag-mask"></div>`;
    }

    const style = {
      'height': `${this.thumbHeight}px`,
      'top': `${this.thumbTop}px`,
    };
    const darkRegionHeight = Math.min(
      this.thumbHeight,
      Math.max(1, Math.round(this.proportionateThumbHeight)),
    );
    const darkRegionTop =
      this.contentHeight > this.viewportHeight
        ? (this.virtualScrollTop / (this.contentHeight - this.viewportHeight)) *
          (this.thumbHeight - darkRegionHeight)
        : 0;
    const darkRegionStyle = {
      'height': `${darkRegionHeight}px`,
      'top': `${darkRegionTop}px`,
    };
    return html`
      <div class="drag-mask"></div>
      ${map(this.indicatorTops, (top) => {
        const indicatorTop =
          (top / this.contentHeight) * this.viewportHeight -
          INDICATOR_HEIGHT_PX / 2;
        return html`<div
          class="indicator"
          style=${styleMap({
            'top': `${indicatorTop}px`,
          })}></div>`;
      })}
      <div
        class="thumb"
        style=${styleMap(style)}
        @pointerdown=${this.onThumbPointerDown}>
        ${when(
          darkRegionHeight <= MAX_SCROLLBAR_INDICATOR_HEIGHT_PX,
          () =>
            html`<div
              class="thumb-visible-fraction"
              style=${styleMap(darkRegionStyle)}></div>`,
        )}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'virtual-scrollbar': VirtualScrollbar;
  }
}
