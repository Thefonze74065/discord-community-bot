const { randomInt } = require("crypto");

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

function newDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit });
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handTotal(cards) {
  let total = 0;
  let aces = 0;
  for (const { rank } of cards) {
    if (rank === "A") {
      total += 11;
      aces++;
    } else if (["J", "Q", "K"].includes(rank)) {
      total += 10;
    } else {
      total += Number(rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

const isBlackjack = (cards) => cards.length === 2 && handTotal(cards) === 21;
const showCards = (cards) =>
  cards.map((c) => `\`${c.rank}${c.suit}\``).join(" ");

function cardValue(card) {
  if (card.rank === "A") return 11;
  if (["10", "J", "Q", "K"].includes(card.rank)) return 10;
  return Number(card.rank);
}

function canSplit(cards) {
  if (!Array.isArray(cards) || cards.length !== 2) return false;
  return cardValue(cards[0]) === cardValue(cards[1]);
}

module.exports = {
  newDeck,
  handTotal,
  isBlackjack,
  showCards,
  cardValue,
  canSplit,
};
