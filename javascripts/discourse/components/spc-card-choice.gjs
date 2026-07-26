import { on } from "@ember/modifier";

// A radio group rendered as cards. Use it where a <select> would bury the
// explanation of each option inside its label — the whole point of these
// choices is that the description is what people are choosing between.
//
// Each choice is { value, title, description, selected }. `value` is what lands
// in the post, so it stays whatever the load-bearing string table says it is;
// title and description are display only.
//
// A real <input type="radio"> under each card rather than click handlers on
// divs: that is what makes arrow keys, the tab order and screen readers work
// without any of it being written here. The input is positioned off the card
// rather than hidden with display:none, which would take it out of the tab
// order and undo exactly that.
const SpcCardChoice = <template>
  <div class="spc-card-choice">
    {{#each @choices key="value" as |choice|}}
      <label
        class="spc-card-choice__card
          {{if choice.selected 'spc-card-choice__card--selected'}}"
      >
        <input
          type="radio"
          name={{@name}}
          value={{choice.value}}
          checked={{choice.selected}}
          {{on "change" @onChange}}
        />
        <span class="spc-card-choice__title">{{choice.title}}</span>
        {{#if choice.description}}
          <span class="spc-card-choice__description">
            {{choice.description}}
          </span>
        {{/if}}
      </label>
    {{/each}}
  </div>
</template>;

export default SpcCardChoice;
