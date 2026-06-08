import { add, createGreeting } from "./utils.js";

const result = add(1, 2);
const greeting = createGreeting("hello");

export function main(): void {
  console.log(result, greeting);
}
