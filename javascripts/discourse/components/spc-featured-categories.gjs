import Component from "@glimmer/component";
import { LinkTo } from "@ember/routing";
import { service } from "@ember/service";
import { htmlSafe } from "@ember/template";
import { themePrefix } from "virtual:theme";
import CategoryLogo from "discourse/components/category-logo";
import categoryLink from "discourse/helpers/category-link";
import { defaultHomepage } from "discourse/lib/utilities";
import Category from "discourse/models/category";
import { i18n } from "discourse-i18n";

function categoryId(value) {
  const id = Number(value?.id ?? value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default class SpcFeaturedCategories extends Component {
  @service router;
  @service siteSettings;

  get selectedCategoryIds() {
    const configured = this.siteSettings.default_navigation_menu_categories;
    const values = Array.isArray(configured)
      ? configured
      : String(configured || "").split("|");

    return values
      .map(categoryId)
      .filter((id, index, ids) => id !== null && ids.indexOf(id) === index);
  }

  get categoryEntries() {
    return this.selectedCategoryIds
      .map((id) => {
        const category = Category.findById(id);

        if (!category) {
          return null;
        }

        return {
          category,
          hasLogo: Boolean(category.uploaded_logo?.url),
          id,
        };
      })
      .filter(Boolean);
  }

  get isHomepage() {
    return this.router.currentRouteName === `discovery.${defaultHomepage()}`;
  }

  get shouldShow() {
    return this.isHomepage && this.categoryEntries.length > 0;
  }

  <template>
    {{#if this.shouldShow}}
      <div
        class="featured-categories --above-main-container"
        data-spc-featured-categories="local"
      >
        <div class="featured-categories__container">
          <div class="featured-categories__heading">
            <h2 class="featured-categories__title">
              {{i18n (themePrefix "homepage.popular_categories")}}
            </h2>
            <LinkTo @route="discovery.categories">
              <span class="featured-categories__link">
                {{i18n (themePrefix "homepage.all_categories")}}
              </span>
            </LinkTo>
          </div>

          <div class="featured-categories__list-container">
            {{#each this.categoryEntries as |entry|}}
              <div
                class="featured-categories__category-container"
                data-spc-category-id={{entry.id}}
              >
                <a
                  class="featured-categories__category-link"
                  href={{entry.category.url}}
                >
                  {{#if entry.hasLogo}}
                    <CategoryLogo @category={{entry.category}} />
                  {{/if}}
                  <h3 class="category-name">
                    {{categoryLink entry.category}}
                  </h3>
                  <span class="category-description">
                    {{htmlSafe entry.category.description_excerpt}}
                  </span>
                </a>
              </div>
            {{/each}}
          </div>
        </div>
      </div>
    {{/if}}
  </template>
}
