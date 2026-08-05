import Component from "@glimmer/component";

/**
 * Stable, theme-owned mount for category-page content.
 *
 * The element is intentionally always present. Category transitions can pass
 * through loading routes where no category model is available; keeping the
 * mount alive lets the two renderers clear or replace their own children
 * without depending on another theme component's lifecycle.
 *
 * CSS gives this element an ordered vertical layout so shared and
 * category-specific content always stays above Discourse's native list
 * controls. The controls and topic list remain core-owned siblings.
 */
export default class SpcCategorySurface extends Component {
  <template>
    <div class="spc-category-surface" data-spc-category-surface></div>
  </template>
}
