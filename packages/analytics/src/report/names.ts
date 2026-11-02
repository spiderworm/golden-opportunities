// A made-up name for each player, so reports read "Brave Puffin" rather than
// "b9ab82be" (David, 1 Nov 2026). It's worked out from the id alone, the same
// every time and everywhere, and never shown in a game or asked of a player:
// real names only ever with their consent. Two ids can share a name (about one
// pair in 2,300), so views keep the short id beside it.
const ADJECTIVES = [
  "Brave", "Quiet", "Sunny", "Swift", "Clever", "Gentle", "Lucky", "Merry",
  "Bold", "Calm", "Cheery", "Curious", "Daring", "Eager", "Fancy", "Fuzzy",
  "Giddy", "Happy", "Jolly", "Keen", "Kind", "Lively", "Mellow", "Nimble",
  "Patient", "Peppy", "Plucky", "Proud", "Rosy", "Silly", "Sleepy", "Snappy",
  "Snowy", "Sparkly", "Speedy", "Spry", "Steady", "Sturdy", "Tidy", "Tiny",
  "Witty", "Zesty", "Amber", "Coral", "Golden", "Misty", "Velvet", "Frosty",
];
const ANIMALS = [
  "Puffin", "Otter", "Badger", "Falcon", "Heron", "Koala", "Lynx", "Marmot",
  "Narwhal", "Ocelot", "Panda", "Quokka", "Raccoon", "Seal", "Tapir", "Walrus",
  "Wombat", "Yak", "Beaver", "Bison", "Camel", "Dingo", "Egret", "Ferret",
  "Gecko", "Hare", "Ibis", "Jackal", "Kiwi", "Lemur", "Moose", "Newt",
  "Owl", "Pelican", "Robin", "Sloth", "Toucan", "Turtle", "Vole", "Wren",
  "Alpaca", "Beluga", "Crane", "Dolphin", "Finch", "Gopher", "Hedgehog", "Iguana",
];

export function placeholderName(id: string): string {
  // FNV-1a: a small, stable hash, the same in the browser, Node and Lambda
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${ANIMALS[(h >>> 16) % ANIMALS.length]}`;
}
