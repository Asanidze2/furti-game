import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  off
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB6ALg44ACkeY7eDSlcW24xwognpj6aMCU",
  authDomain: "furti-online-8b5e0.firebaseapp.com",
  databaseURL: "https://furti-online-8b5e0-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "furti-online-8b5e0",
  storageBucket: "furti-online-8b5e0.firebasestorage.app",
  messagingSenderId: "945357326933",
  appId: "1:945357326933:web:50d9be88467cc38bfde2dc"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const suits = ["♠", "♥", "♦", "♣"];

const ranks = [
  { name: "A", value: 1 },
  { name: "2", value: 2 },
  { name: "3", value: 3 },
  { name: "4", value: 4 },
  { name: "5", value: 5 },
  { name: "6", value: 6 },
  { name: "7", value: 7 },
  { name: "8", value: 8 },
  { name: "9", value: 9 },
  { name: "10", value: 10 },
  { name: "J", value: 11 },
  { name: "Q", value: 12 },
  { name: "K", value: 13 }
];

let roomCode = null;
let myPlayerId = null;
let opponentPlayerId = null;

let gameState = null;
let activeRoomRef = null;
let nextRoundTimer = null;

let selectedPlayerCard = null;
let selectedTableCards = [];

const lobbyScreen = document.getElementById("lobbyScreen");
const gameScreen = document.getElementById("gameScreen");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const lobbyMessage = document.getElementById("lobbyMessage");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const playerRoleDisplay = document.getElementById("playerRoleDisplay");

const playerCardsDiv = document.getElementById("playerCards");
const computerCardsDiv = document.getElementById("computerCards");
const tableCardsDiv = document.getElementById("tableCards");

const message = document.getElementById("message");

const roundCount = document.getElementById("roundCount");
const playerRoundsCount = document.getElementById("playerRoundsCount");
const computerRoundsCount = document.getElementById("computerRoundsCount");

const playerTakenCount = document.getElementById("playerTakenCount");
const computerTakenCount = document.getElementById("computerTakenCount");
const deckCount = document.getElementById("deckCount");

const takeBtn = document.getElementById("takeBtn");
const dropBtn = document.getElementById("dropBtn");

const historyBtn = document.getElementById("historyBtn");
const closeHistoryBtn = document.getElementById("closeHistoryBtn");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");

function showLobby() {
  lobbyScreen.classList.remove("hidden");
  gameScreen.classList.add("hidden");
}

function showGame() {
  lobbyScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");
}

function generateRoomCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const numbers = "23456789";

  let code = "FURTI-";

  for (let i = 0; i < 2; i++) {
    code += letters[Math.floor(Math.random() * letters.length)];
  }

  for (let i = 0; i < 3; i++) {
    code += numbers[Math.floor(Math.random() * numbers.length)];
  }

  return code;
}

function createEmptyRoomState(code) {
  return {
    code,
    status: "waiting",
    currentRound: 1,
    currentTurn: "player1",
    lastTaker: null,
    roundFinished: false,
    gameFinished: false,
    deck: [],
    tableCards: [],
    roundHistory: [],
    lastActionText: "ველოდებით მეორე მოთამაშეს",
    players: {
      player1: {
        joined: true,
        cards: [],
        takenCards: [],
        roundsWon: 0
      },
      player2: {
        joined: false,
        cards: [],
        takenCards: [],
        roundsWon: 0
      }
    }
  };
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  return Object.values(value);
}

function normalizeGameState(state) {
  if (!state) return state;

  state.deck = toArray(state.deck);
  state.tableCards = toArray(state.tableCards);
  state.roundHistory = toArray(state.roundHistory);

  if (!state.players) {
    state.players = {};
  }

  if (!state.players.player1) {
    state.players.player1 = {};
  }

  if (!state.players.player2) {
    state.players.player2 = {};
  }

  for (let playerId of ["player1", "player2"]) {
    state.players[playerId].cards = toArray(state.players[playerId].cards);
    state.players[playerId].takenCards = toArray(state.players[playerId].takenCards);
    state.players[playerId].roundsWon = state.players[playerId].roundsWon || 0;
    state.players[playerId].joined = Boolean(state.players[playerId].joined);
  }

  return state;
}

function cloneState(state) {
  return normalizeGameState(JSON.parse(JSON.stringify(state)));
}

async function createRoom() {
  try {
    let code = generateRoomCode();
    let roomRef = ref(database, `rooms/${code}`);
    let snapshot = await get(roomRef);

    while (snapshot.exists()) {
      code = generateRoomCode();
      roomRef = ref(database, `rooms/${code}`);
      snapshot = await get(roomRef);
    }

    roomCode = code;
    myPlayerId = "player1";
    updateOpponentId();

    const emptyRoom = createEmptyRoomState(code);

    await set(roomRef, emptyRoom);

    roomCodeDisplay.textContent = roomCode;
    playerRoleDisplay.textContent = "მოთამაშე 1";

    showGame();
    listenToRoom(roomCode);

    showLocalMessage(`ოთახი შეიქმნა: ${roomCode}. გაუგზავნე ეს კოდი მეორე მოთამაშეს.`);
  } catch (error) {
    console.error(error);
    lobbyMessage.textContent = "ოთახის შექმნა ვერ მოხერხდა. შეამოწმე Console.";
  }
}

async function joinRoom() {
  try {
    const inputCode = roomCodeInput.value.trim().toUpperCase();

    if (!inputCode) {
      lobbyMessage.textContent = "ჯერ შეიყვანე ოთახის კოდი";
      return;
    }

    const roomRef = ref(database, `rooms/${inputCode}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      lobbyMessage.textContent = "ასეთი ოთახი ვერ მოიძებნა";
      return;
    }

    const room = normalizeGameState(snapshot.val());

    if (room.players.player2.joined) {
      lobbyMessage.textContent = "ეს ოთახი უკვე სავსეა";
      return;
    }

    room.players.player2.joined = true;
    room.status = "playing";

    startNewGameInState(room);

    roomCode = inputCode;
    myPlayerId = "player2";
    updateOpponentId();

    await set(roomRef, room);

    roomCodeDisplay.textContent = roomCode;
    playerRoleDisplay.textContent = "მოთამაშე 2";

    showGame();
    listenToRoom(roomCode);
  } catch (error) {
    console.error(error);
    lobbyMessage.textContent = "ოთახში შესვლა ვერ მოხერხდა. შეამოწმე Console.";
  }
}

function listenToRoom(code) {
  if (activeRoomRef) {
    off(activeRoomRef);
  }

  activeRoomRef = ref(database, `rooms/${code}`);

  onValue(activeRoomRef, snapshot => {
    if (!snapshot.exists()) {
      showLocalMessage("ოთახი აღარ არსებობს");
      return;
    }

    gameState = normalizeGameState(snapshot.val());

    roomCodeDisplay.textContent = gameState.code || code;
    playerRoleDisplay.textContent = myPlayerId === "player1" ? "მოთამაშე 1" : "მოთამაშე 2";

    updateOpponentId();
    selectedPlayerCard = null;
    selectedTableCards = [];

    renderCards();
    renderStatusMessage();

    maybeScheduleNextRound();
  });
}

async function saveState(state) {
  if (!roomCode) return;

  normalizeGameState(state);
  await set(ref(database, `rooms/${roomCode}`), state);
}

function getOpponentId(playerId) {
  return playerId === "player1" ? "player2" : "player1";
}

function updateOpponentId() {
  if (!myPlayerId) return;
  opponentPlayerId = getOpponentId(myPlayerId);
}

function getMyPlayer() {
  return gameState.players[myPlayerId];
}

function getOpponentPlayer() {
  return gameState.players[opponentPlayerId];
}

function createDeck() {
  const newDeck = [];

  for (let suit of suits) {
    for (let rank of ranks) {
      newDeck.push({
        id: crypto.randomUUID(),
        name: rank.name,
        value: rank.value,
        suit: suit,
        color: suit === "♥" || suit === "♦" ? "red" : "black"
      });
    }
  }

  return newDeck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[randomIndex]] = [deck[randomIndex], deck[i]];
  }
}

function startNewGameInState(state) {
  normalizeGameState(state);

  state.currentRound = 1;
  state.roundHistory = [];
  state.players.player1.roundsWon = 0;
  state.players.player2.roundsWon = 0;
  state.gameFinished = false;
  state.status = "playing";

  startRoundInState(state);
}

function startRoundInState(state) {
  normalizeGameState(state);

  state.deck = [];
  state.tableCards = [];

  state.players.player1.cards = [];
  state.players.player2.cards = [];
  state.players.player1.takenCards = [];
  state.players.player2.takenCards = [];

  state.currentTurn = state.currentRound % 2 === 1 ? "player1" : "player2";
  state.lastTaker = null;
  state.roundFinished = false;
  state.gameFinished = false;

  state.deck = createDeck();
  shuffleDeck(state.deck);

  state.players.player1.cards = state.deck.splice(0, 4);
  state.players.player2.cards = state.deck.splice(0, 4);
  state.tableCards = state.deck.splice(0, 4);

  // მხოლოდ რაუნდის საწყის მაგიდაზე არ ვუშვებთ ვალეტს.
  // თუ მოთამაშემ თვითონ დადო ვალეტი, შემდეგ ის მაგიდაზე რჩება.
  replaceJacksOnInitialTableInState(state);

  state.lastActionText = `რაუნდი ${state.currentRound} დაიწყო`;
}

function dealNewHandIfNeededInState(state) {
  normalizeGameState(state);

  const player1HasNoCards = state.players.player1.cards.length === 0;
  const player2HasNoCards = state.players.player2.cards.length === 0;

  if (player1HasNoCards && player2HasNoCards && state.deck.length > 0) {
    state.players.player1.cards = state.deck.splice(0, 4);
    state.players.player2.cards = state.deck.splice(0, 4);
    state.lastActionText = "ახალი კარტები დარიგდა";
  }
}

function replaceJacksOnInitialTableInState(state) {
  normalizeGameState(state);

  for (let i = 0; i < state.tableCards.length; i++) {
    while (state.tableCards[i] && state.tableCards[i].name === "J" && state.deck.length > 0) {
      state.deck.push(state.tableCards[i]);
      shuffleDeck(state.deck);
      state.tableCards[i] = state.deck.shift();
    }
  }
}

function renderCards() {
  if (!gameState || !myPlayerId) return;

  normalizeGameState(gameState);
  updateOpponentId();

  playerCardsDiv.innerHTML = "";
  computerCardsDiv.innerHTML = "";
  tableCardsDiv.innerHTML = "";

  const myPlayer = getMyPlayer();
  const opponentPlayer = getOpponentPlayer();

  opponentPlayer.cards.forEach(() => {
    const div = document.createElement("div");
    div.className = "card card-back";
    div.textContent = "?";
    computerCardsDiv.appendChild(div);
  });

  gameState.tableCards.forEach(card => {
    const cardElement = createCardElement(card);

    if (selectedTableCards.some(selected => selected.id === card.id)) {
      cardElement.classList.add("selected");
    }

    cardElement.addEventListener("click", () => {
      if (!canCurrentViewerPlay()) return;

      toggleTableCard(card);
      renderCards();
    });

    tableCardsDiv.appendChild(cardElement);
  });

  myPlayer.cards.forEach(card => {
    const cardElement = createCardElement(card);

    if (selectedPlayerCard && selectedPlayerCard.id === card.id) {
      cardElement.classList.add("selected");
    }

    cardElement.addEventListener("click", () => {
      if (!canCurrentViewerPlay()) return;

      selectedPlayerCard = card;
      renderCards();
    });

    playerCardsDiv.appendChild(cardElement);
  });

  roundCount.textContent = gameState.currentRound;

  playerRoundsCount.textContent = myPlayer.roundsWon;
  computerRoundsCount.textContent = opponentPlayer.roundsWon;

  playerTakenCount.textContent = myPlayer.takenCards.length;
  computerTakenCount.textContent = opponentPlayer.takenCards.length;

  deckCount.textContent = gameState.deck.length;

  renderHistory();
}

function createCardElement(card) {
  const div = document.createElement("div");
  div.className = "card";

  if (card.color === "red") {
    div.classList.add("red");
  }

  div.textContent = `${card.name}${card.suit}`;
  return div;
}

function canCurrentViewerPlay() {
  return (
    gameState &&
    gameState.status === "playing" &&
    gameState.currentTurn === myPlayerId &&
    !gameState.roundFinished &&
    !gameState.gameFinished
  );
}

function getTurnText(state = gameState) {
  if (!state || state.status === "waiting") {
    return "ველოდებით მეორე მოთამაშეს";
  }

  if (state.currentTurn === myPlayerId) {
    return "შენი სვლაა";
  }

  return "მოწინააღმდეგის სვლაა";
}

function renderStatusMessage() {
  if (!gameState) return;

  if (gameState.status === "waiting") {
    showLocalMessage(`ოთახი შეიქმნა: ${roomCode}. ველოდებით მეორე მოთამაშეს.`);
    return;
  }

  if (gameState.gameFinished) {
    showLocalMessage(getFinalMessage());
    return;
  }

  if (gameState.roundFinished) {
    showLocalMessage(getRoundFinishedMessage());
    return;
  }

  if (gameState.status === "playing") {
    const turnText = getTurnText();

    if (gameState.lastActionText && gameState.lastActionText !== "ველოდებით მეორე მოთამაშეს") {
      showLocalMessage(`${gameState.lastActionText} — ${turnText}`);
    } else {
      showLocalMessage(`თამაში დაიწყო — ${turnText}`);
    }

    return;
  }

  showLocalMessage(getTurnText());
}

function toggleTableCard(card) {
  const alreadySelected = selectedTableCards.some(selected => selected.id === card.id);

  if (alreadySelected) {
    selectedTableCards = selectedTableCards.filter(selected => selected.id !== card.id);
  } else {
    selectedTableCards.push(card);
  }
}

async function takeCards() {
  if (!gameState) return;

  if (gameState.roundFinished || gameState.gameFinished) {
    showLocalMessage("რაუნდი დასრულებულია");
    return;
  }

  if (gameState.currentTurn !== myPlayerId) {
    showLocalMessage("ახლა მოწინააღმდეგის სვლაა");
    return;
  }

  if (!selectedPlayerCard) {
    showLocalMessage("ჯერ შენი კარტი აირჩიე");
    return;
  }

  if (selectedTableCards.length === 0) {
    showLocalMessage("მაგიდიდან ერთი ან რამდენიმე კარტი აირჩიე");
    return;
  }

  const state = cloneState(gameState);
  const playerRank = selectedPlayerCard.name;
  const playedCardText = `${selectedPlayerCard.name}${selectedPlayerCard.suit}`;

  if (playerRank === "J") {
    const hasQueenOrKing = selectedTableCards.some(card => card.name === "Q" || card.name === "K");

    if (hasQueenOrKing) {
      showLocalMessage("ვალეტს არ შეუძლია დამის ან კაკოს წაყვანა");
      return;
    }

    const captured = captureCardsInState(state, myPlayerId);

    if (!captured) {
      return;
    }

    state.lastTaker = myPlayerId;
    state.lastActionText = `${getPlayerName(myPlayerId)}-მა წაიღო: ${playedCardText}`;
    endTurnInState(state);
    await saveState(state);
    return;
  }

  if (playerRank === "Q") {
    const allQueens = selectedTableCards.every(card => card.name === "Q");

    if (!allQueens) {
      showLocalMessage("დამას შეუძლია მხოლოდ დამის წაყვანა");
      return;
    }

    const captured = captureCardsInState(state, myPlayerId);

    if (!captured) {
      return;
    }

    state.lastTaker = myPlayerId;
    state.lastActionText = `${getPlayerName(myPlayerId)}-მა წაიღო: ${playedCardText}`;
    endTurnInState(state);
    await saveState(state);
    return;
  }

  if (playerRank === "K") {
    const allKings = selectedTableCards.every(card => card.name === "K");

    if (!allKings) {
      showLocalMessage("კაკოს შეუძლია მხოლოდ კაკოს წაყვანა");
      return;
    }

    const captured = captureCardsInState(state, myPlayerId);

    if (!captured) {
      return;
    }

    state.lastTaker = myPlayerId;
    state.lastActionText = `${getPlayerName(myPlayerId)}-მა წაიღო: ${playedCardText}`;
    endTurnInState(state);
    await saveState(state);
    return;
  }

  const sum = selectedPlayerCard.value + selectedTableCards.reduce((total, card) => total + card.value, 0);

  if (sum !== 11) {
    showLocalMessage(`ჯამი არის ${sum}. საჭიროა 11`);
    return;
  }

  const captured = captureCardsInState(state, myPlayerId);

  if (!captured) {
    return;
  }

  state.lastTaker = myPlayerId;
  state.lastActionText = `${getPlayerName(myPlayerId)}-მა წაიღო: ${playedCardText}`;
  endTurnInState(state);

  await saveState(state);
}

function captureCardsInState(state, playerId) {
  normalizeGameState(state);

  if (!selectedPlayerCard) {
    showLocalMessage("შეცდომა: არჩეული კარტი ვერ მოიძებნა");
    return false;
  }

  const selectedIds = selectedTableCards.map(card => card.id);

  const handCard =
    state.players[playerId].cards.find(card => card.id === selectedPlayerCard.id) ||
    selectedPlayerCard;

  const tableCardsToTake = state.tableCards.filter(card => selectedIds.includes(card.id));

  if (!handCard) {
    showLocalMessage("შეცდომა: არჩეული კარტი ვერ მოიძებნა");
    return false;
  }

  if (tableCardsToTake.length === 0) {
    showLocalMessage("შეცდომა: მაგიდის არჩეული კარტები ვერ მოიძებნა");
    return false;
  }

  state.players[playerId].takenCards.push(handCard, ...tableCardsToTake);

  state.players[playerId].cards = state.players[playerId].cards.filter(card => {
    return card.id !== handCard.id;
  });

  state.tableCards = state.tableCards.filter(card => {
    return !selectedIds.includes(card.id);
  });

  selectedPlayerCard = null;
  selectedTableCards = [];

  return true;
}

async function dropCard() {
  if (!gameState) return;

  if (gameState.roundFinished || gameState.gameFinished) {
    showLocalMessage("რაუნდი დასრულებულია");
    return;
  }

  if (gameState.currentTurn !== myPlayerId) {
    showLocalMessage("ახლა მოწინააღმდეგის სვლაა");
    return;
  }

  if (!selectedPlayerCard) {
    showLocalMessage("დასადებად ჯერ შენი კარტი აირჩიე");
    return;
  }

  const state = cloneState(gameState);

  const cardToDrop =
    state.players[myPlayerId].cards.find(card => card.id === selectedPlayerCard.id) ||
    selectedPlayerCard;

  if (!cardToDrop) {
    showLocalMessage("შეცდომა: დასადები კარტი ვერ მოიძებნა");
    return;
  }

  state.tableCards.push(cardToDrop);

  state.players[myPlayerId].cards = state.players[myPlayerId].cards.filter(card => {
    return card.id !== cardToDrop.id;
  });

  state.lastActionText = `${getPlayerName(myPlayerId)}-მა კარტი დადო: ${cardToDrop.name}${cardToDrop.suit}`;

  selectedPlayerCard = null;
  selectedTableCards = [];

  endTurnInState(state);

  await saveState(state);
}

function endTurnInState(state) {
  normalizeGameState(state);

  dealNewHandIfNeededInState(state);

  if (isRoundOverInState(state)) {
    finishRoundInState(state);
    return;
  }

  state.currentTurn = getOpponentId(state.currentTurn);
}

function isRoundOverInState(state) {
  normalizeGameState(state);

  return (
    state.deck.length === 0 &&
    state.players.player1.cards.length === 0 &&
    state.players.player2.cards.length === 0
  );
}

function finishRoundInState(state) {
  normalizeGameState(state);

  if (state.roundFinished) return;

  state.roundFinished = true;

  giveRemainingTableCardsToLastTakerInState(state);

  const roundResult = calculateRoundResultInState(state);

  let winner = null;

  if (roundResult.player1Score > roundResult.player2Score) {
    winner = "player1";
    state.players.player1.roundsWon += 1;
  } else if (roundResult.player2Score > roundResult.player1Score) {
    winner = "player2";
    state.players.player2.roundsWon += 1;
  }

  state.roundHistory.push({
    round: state.currentRound,
    winner,
    player1Score: roundResult.player1Score,
    player2Score: roundResult.player2Score
  });

  state.lastRoundResult = {
    winner,
    player1Score: roundResult.player1Score,
    player2Score: roundResult.player2Score
  };

  if (state.currentRound === 13) {
    state.gameFinished = true;
    state.status = "finished";
  }
}

function maybeScheduleNextRound() {
  if (!gameState) return;
  if (!myPlayerId) return;
  if (myPlayerId !== "player1") return;
  if (!gameState.roundFinished) return;
  if (gameState.gameFinished) return;
  if (gameState.currentRound >= 13) return;
  if (nextRoundTimer) return;

  nextRoundTimer = setTimeout(async () => {
    nextRoundTimer = null;

    const roomSnapshot = await get(ref(database, `rooms/${roomCode}`));

    if (!roomSnapshot.exists()) return;

    const latestState = normalizeGameState(roomSnapshot.val());

    if (!latestState.roundFinished || latestState.gameFinished) return;

    latestState.currentRound += 1;
    startRoundInState(latestState);

    await saveState(latestState);
  }, 2500);
}

function giveRemainingTableCardsToLastTakerInState(state) {
  normalizeGameState(state);

  if (state.tableCards.length === 0) return;

  if (state.lastTaker === "player1" || state.lastTaker === "player2") {
    state.players[state.lastTaker].takenCards.push(...state.tableCards);
  }

  state.tableCards = [];
}

function calculateRoundResultInState(state) {
  normalizeGameState(state);

  let player1Score = 0;
  let player2Score = 0;

  const player1Cards = state.players.player1.takenCards;
  const player2Cards = state.players.player2.takenCards;

  if (player1Cards.length > player2Cards.length) {
    player1Score += 2;
  } else if (player2Cards.length > player1Cards.length) {
    player2Score += 2;
  }

  const player1Clubs = countSuit(player1Cards, "♣");
  const player2Clubs = countSuit(player2Cards, "♣");

  if (player1Clubs > player2Clubs) {
    player1Score += 1;
  } else if (player2Clubs > player1Clubs) {
    player2Score += 1;
  }

  if (hasCard(player1Cards, "2", "♣")) {
    player1Score += 1;
  }

  if (hasCard(player2Cards, "2", "♣")) {
    player2Score += 1;
  }

  if (hasCard(player1Cards, "10", "♦")) {
    player1Score += 1;
  }

  if (hasCard(player2Cards, "10", "♦")) {
    player2Score += 1;
  }

  return {
    player1Score,
    player2Score
  };
}

function getRoundFinishedMessage() {
  if (!gameState.lastRoundResult) {
    return "რაუნდი დასრულდა. შემდეგი რაუნდი მალე დაიწყება.";
  }

  const result = gameState.lastRoundResult;
  const myScore = myPlayerId === "player1" ? result.player1Score : result.player2Score;
  const opponentScore = myPlayerId === "player1" ? result.player2Score : result.player1Score;

  if (result.winner === null) {
    return `რაუნდი ${gameState.currentRound} დასრულდა ფრედ: ${myScore}–${opponentScore}. შემდეგი რაუნდი მალე დაიწყება.`;
  }

  if (result.winner === myPlayerId) {
    return `რაუნდი ${gameState.currentRound} დასრულდა: ${myScore}–${opponentScore} შენს სასარგებლოდ. შემდეგი რაუნდი მალე დაიწყება.`;
  }

  return `რაუნდი ${gameState.currentRound} დასრულდა: ${myScore}–${opponentScore} მოწინააღმდეგის სასარგებლოდ. შემდეგი რაუნდი მალე დაიწყება.`;
}

function getFinalMessage() {
  const myRoundsWon = getMyPlayer().roundsWon;
  const opponentRoundsWon = getOpponentPlayer().roundsWon;

  if (myRoundsWon > opponentRoundsWon) {
    return `თამაში დასრულდა. შენ მოიგე! რაუნდები: ${myRoundsWon}–${opponentRoundsWon}.`;
  }

  if (opponentRoundsWon > myRoundsWon) {
    return `თამაში დასრულდა. მოწინააღმდეგემ მოიგო. რაუნდები: ${myRoundsWon}–${opponentRoundsWon}.`;
  }

  return `თამაში დასრულდა ფრედ. რაუნდები: ${myRoundsWon}–${opponentRoundsWon}.`;
}

function countSuit(cards, suit) {
  return toArray(cards).filter(card => card.suit === suit).length;
}

function hasCard(cards, name, suit) {
  return toArray(cards).some(card => card.name === name && card.suit === suit);
}

function renderHistory() {
  if (!gameState) return;

  historyList.innerHTML = "";

  const history = toArray(gameState.roundHistory);

  if (history.length === 0) {
    historyList.innerHTML = `<p class="empty-history">ისტორია ჯერ ცარიელია</p>`;
    return;
  }

  history.forEach(item => {
    const div = document.createElement("div");
    div.className = "history-item";

    const myScore = myPlayerId === "player1" ? item.player1Score : item.player2Score;
    const opponentScore = myPlayerId === "player1" ? item.player2Score : item.player1Score;

    let resultText = "";

    if (item.winner === null) {
      resultText = "ფრე";
    } else if (item.winner === myPlayerId) {
      resultText = "შენ მოიგე";
    } else {
      resultText = "მოწინააღმდეგემ მოიგო";
    }

    div.innerHTML = `
      <strong>რაუნდი ${item.round}:</strong>
      ${resultText} — ${myScore}–${opponentScore}
    `;

    historyList.appendChild(div);
  });
}

function toggleHistoryPanel() {
  historyPanel.classList.toggle("hidden");
}

function closeHistoryPanel() {
  historyPanel.classList.add("hidden");
}

function getPlayerName(playerId) {
  return playerId === "player1" ? "მოთამაშე 1" : "მოთამაშე 2";
}

function showLocalMessage(text) {
  message.textContent = text;
}

createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);

takeBtn.addEventListener("click", takeCards);
dropBtn.addEventListener("click", dropCard);
historyBtn.addEventListener("click", toggleHistoryPanel);
closeHistoryBtn.addEventListener("click", closeHistoryPanel);

showLobby();
