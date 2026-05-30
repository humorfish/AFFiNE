// Minimal stub — no custom element registration (registerAIEditorEffects handles that).
// The format toolbar AI button is disabled via when: () => false in setup-format-bar.
// Selection-based AI popup is handled by AffineEditorWrapper instead.
import { LitElement } from 'lit';

export class AskAIToolbarButton extends LitElement {
  override createRenderRoot() {
    return this;
  }
}
