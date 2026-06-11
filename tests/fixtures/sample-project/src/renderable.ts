/** A shape that can be rendered. */
export interface Renderable {
  render(): string;
}

/** A simple button implementation. */
export class Button implements Renderable {
  private label: string;
  constructor(label: string) {
    this.label = label;
  }
  render(): string {
    return `<button>${this.label}</button>`;
  }
}

/** A link implementation. */
export class Link implements Renderable {
  private href: string;
  private text: string;
  constructor(href: string, text: string) {
    this.href = href;
    this.text = text;
  }
  render(): string {
    return `<a href="${this.href}">${this.text}</a>`;
  }
}
