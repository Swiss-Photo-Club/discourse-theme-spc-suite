// A titled group of fields. The title is a quiet small-caps rule rather than a
// heading that competes with the page's own, because these divide one form
// rather than introducing separate ones.
const SpcFormSection = <template>
  <section class="spc-form-section">
    <h2 class="spc-form-section__title">{{@title}}</h2>
    {{#if @intro}}
      <p class="spc-form-section__intro">{{@intro}}</p>
    {{/if}}
    {{yield}}
  </section>
</template>;

export default SpcFormSection;
