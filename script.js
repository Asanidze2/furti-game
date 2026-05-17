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

let lastAnimatedActionId = null;
let firstSnapshotReceived = false;

let lastAnimatedCaptureId = null;
let firstCaptureSnapshotReceived = false;
let animatingDropActionId = null;

const lobbyScreen = document.getElementById("lobbyScreen");
const gameScreen = document.getElementById("gameScreen");

const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const lobbyMessage = document.getElementById("lobbyMessage");
const roundSelect = document.getElementById("roundSelect");

const roomCodeDisplay = document.getElementById("roomCodeDisplay");
const playerRoleDisplay = document.getElementById("playerRoleDisplay");
const roomInfo = document.querySelector(".room-info");

const playerCardsDiv = document.getElementById("playerCards");
const computerCardsDiv = document.getElementById("computerCards");
const tableCardsDiv = document.getElementById("tableCards");

const message = document.getElementById("message");
const playedCardAnimation = document.getElementById("playedCardAnimation");
const captureAnimation = document.getElementById("captureAnimation");

const roundCount = document.getElementById("roundCount");
const maxRoundCount = document.getElementById("maxRoundCount");
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

function createEmptyRoomState(code, maxRounds = 13) {
  return {
    code,
    status: "waiting",
    currentRound: 1,
    maxRounds,
    currentTurn: "player1",
    lastTaker: null,
    roundFinished: false,
    gameFinished: false,
    deck: [],
    tableCards: [],
    roundHistory: [],
    lastActionText: "ველოდებით მეორე მოთამაშეს",
    lastPlayedCard: null,
    captureAnimation: null,
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

  state.maxRounds = Number(state.maxRounds) || 13;

  if (state.maxRounds > 13) {
    state.maxRounds = 13;
  }

  if (state.maxRounds < 1) {
    state.maxRounds = 1;
  }

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

    lastAnimatedActionId = null;
    firstSnapshotReceived = false;
    lastAnimatedCaptureId = null;
    firstCaptureSnapshotReceived = false;
    animatingDropActionId = null;

    const selectedMaxRounds = Math.min(13, Math.max(1, Number(roundSelect.value) || 13));
    const emptyRoom = createEmptyRoomState(code, selectedMaxRounds);

    await set(roomRef, emptyRoom);

    roomCodeDisplay.textContent = roomCode;
    playerRoleDisplay.textContent = "მოთამაშე 1";

    if (roomInfo) {
      roomInfo.classList.remove("hidden-room-info");
    }

    showGame();
    listenToRoom(roomCode);

    showLocalMessage("ველოდებით მეორე მოთამაშეს");
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

    lastAnimatedActionId = null;
    firstSnapshotReceived = false;
    lastAnimatedCaptureId = null;
    firstCaptureSnapshotReceived = false;
    animatingDropActionId = null;

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

    const playedCardToAnimate = preparePlayedCardAnimation();

    renderCards();
    renderStatusMessage();

    if (playedCardToAnimate) {
      showPlayedCardAnimation(playedCardToAnimate);
    }

    maybeShowCaptureAnimation();
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
        id: createActionId(),
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
  state.lastPlayedCard = null;
  state.captureAnimation = null;

  state.deck = createDeck();
  shuffleDeck(state.deck);

  state.players.player1.cards = state.deck.splice(0, 4);
  state.players.player2.cards = state.deck.splice(0, 4);
  state.tableCards = state.deck.splice(0, 4);

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
    if (shouldHideTableCardDuringDropAnimation(card)) {
      return;
    }

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
  maxRoundCount.textContent = gameState.maxRounds || 13;

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
    if (roomInfo) {
      roomInfo.classList.remove("hidden-room-info");
    }

    showLocalMessage("ველოდებით მეორე მოთამაშეს");
    return;
  }

  if (roomInfo && gameState.status === "playing") {
    roomInfo.classList.add("hidden-room-info");
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
    showLocalMessage(getTurnText());
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
  const playedCardInfo = createPlayedCardInfo(selectedPlayerCard, myPlayerId, "take");

  const captureAnimationInfo = createCaptureAnimationInfo(
    myPlayerId,
    selectedPlayerCard,
    selectedTableCards
  );

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
    state.lastPlayedCard = playedCardInfo;
    state.captureAnimation = captureAnimationInfo;
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
    state.lastPlayedCard = playedCardInfo;
    state.captureAnimation = captureAnimationInfo;
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
    state.lastPlayedCard = playedCardInfo;
    state.captureAnimation = captureAnimationInfo;
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
  state.lastPlayedCard = playedCardInfo;
  state.captureAnimation = captureAnimationInfo;
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
  state.lastPlayedCard = createPlayedCardInfo(cardToDrop, myPlayerId, "drop");

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

  if (state.currentRound >= state.maxRounds) {
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
  if (gameState.currentRound >= gameState.maxRounds) return;
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
    return "რაუნდი დასრულდა";
  }

  const result = gameState.lastRoundResult;
  const myScore = myPlayerId === "player1" ? result.player1Score : result.player2Score;
  const opponentScore = myPlayerId === "player1" ? result.player2Score : result.player1Score;

  if (result.winner === null) {
    return `რაუნდი ფრედ დასრულდა: ${myScore}–${opponentScore}`;
  }

  if (result.winner === myPlayerId) {
    return `რაუნდი შენ მოიგე: ${myScore}–${opponentScore}`;
  }

  return `რაუნდი მოწინააღმდეგემ მოიგო: ${myScore}–${opponentScore}`;
}

function getFinalMessage() {
  const myRoundsWon = getMyPlayer().roundsWon;
  const opponentRoundsWon = getOpponentPlayer().roundsWon;

  if (myRoundsWon > opponentRoundsWon) {
    return `თამაში დასრულდა. შენ მოიგე! ${myRoundsWon}–${opponentRoundsWon}`;
  }

  if (opponentRoundsWon > myRoundsWon) {
    return `თამაში დასრულდა. მოწინააღმდეგემ მოიგო ${myRoundsWon}–${opponentRoundsWon}`;
  }

  return `თამაში დასრულდა ფრედ ${myRoundsWon}–${opponentRoundsWon}`;
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

function createActionId() {
  if (globalThis.crypto && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
}

function createPlayedCardInfo(card, playerId, action) {
  return {
    actionId: createActionId(),
    cardId: card.id,
    name: card.name,
    suit: card.suit,
    color: card.color,
    by: playerId,
    action
  };
}

function preparePlayedCardAnimation() {
  if (!gameState || !gameState.lastPlayedCard) {
    firstSnapshotReceived = true;
    return null;
  }

  const playedCard = gameState.lastPlayedCard;

  if (!playedCard.actionId) {
    firstSnapshotReceived = true;
    return null;
  }

  if (!firstSnapshotReceived) {
    firstSnapshotReceived = true;
    lastAnimatedActionId = playedCard.actionId;
    return null;
  }

  if (playedCard.actionId === lastAnimatedActionId) {
    return null;
  }

  lastAnimatedActionId = playedCard.actionId;

  if (playedCard.action === "drop") {
    animatingDropActionId = playedCard.actionId;
    return playedCard;
  }

  return null;
}

function shouldHideTableCardDuringDropAnimation(card) {
  if (!gameState || !gameState.lastPlayedCard) {
    return false;
  }

  const playedCard = gameState.lastPlayedCard;

  return (
    animatingDropActionId &&
    playedCard.action === "drop" &&
    playedCard.actionId === animatingDropActionId &&
    playedCard.cardId === card.id
  );
}

function createSimpleCardInfo(card) {
  return {
    id: card.id,
    name: card.name,
    suit: card.suit,
    color: card.color
  };
}

function createCaptureAnimationInfo(playerId, playerCard, tableCards) {
  return {
    actionId: createActionId(),
    by: playerId,
    cards: [
      createSimpleCardInfo(playerCard),
      ...tableCards.map(createSimpleCardInfo)
    ]
  };
}

function maybeShowCaptureAnimation() {
  if (!gameState || !gameState.captureAnimation) {
    firstCaptureSnapshotReceived = true;
    return;
  }

  const capture = gameState.captureAnimation;

  if (!capture.actionId) {
    firstCaptureSnapshotReceived = true;
    return;
  }

  if (!firstCaptureSnapshotReceived) {
    firstCaptureSnapshotReceived = true;
    lastAnimatedCaptureId = capture.actionId;
    return;
  }

  if (capture.actionId === lastAnimatedCaptureId) {
    return;
  }

  lastAnimatedCaptureId = capture.actionId;
  showCaptureAnimation(capture);
}

function getCaptureSpecialClass(card) {
  if (card.name === "J") {
    return "special-jack";
  }

  if (card.name === "2" && card.suit === "♣") {
    return "special-good";
  }

  if (card.name === "10" && card.suit === "♦") {
    return "special-good";
  }

  if (card.suit === "♣") {
    return "special-club";
  }

  return "";
}

function showCaptureAnimation(capture) {
  if (!captureAnimation) return;

  captureAnimation.innerHTML = "";
  captureAnimation.classList.remove("hidden");

  const row = document.createElement("div");
  row.className = "capture-cards-row";

  capture.cards.forEach((card, index) => {
    const cardDiv = document.createElement("div");
    cardDiv.className = "capture-card";
    cardDiv.style.setProperty("--i", index);

    if (card.color === "red") {
      cardDiv.classList.add("red-card");
    }

    const specialClass = getCaptureSpecialClass(card);

    if (specialClass) {
      cardDiv.classList.add(specialClass);
    }

    cardDiv.textContent = `${card.name}${card.suit}`;
    row.appendChild(cardDiv);
  });

  captureAnimation.appendChild(row);

  setTimeout(() => {
    const targetElement =
      capture.by === myPlayerId
        ? playerTakenCount.closest(".taken-badge")
        : computerTakenCount.closest(".taken-badge");

    if (!targetElement) {
      captureAnimation.classList.add("hidden");
      captureAnimation.innerHTML = "";
      return;
    }

    const targetRect = targetElement.getBoundingClientRect();
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;

    row.classList.add("fly-stage");

    row.querySelectorAll(".capture-card").forEach(cardElement => {
      const rect = cardElement.getBoundingClientRect();
      const cardX = rect.left + rect.width / 2;
      const cardY = rect.top + rect.height / 2;

      cardElement.style.setProperty("--fly-x", `${targetX - cardX}px`);
      cardElement.style.setProperty("--fly-y", `${targetY - cardY}px`);
      cardElement.classList.add("fly-to-pile");
    });
  }, 1150);

  setTimeout(() => {
    captureAnimation.classList.add("hidden");
    captureAnimation.innerHTML = "";
  }, 2150);
}

function showPlayedCardAnimation(card) {
  if (!playedCardAnimation) return;

  playedCardAnimation.innerHTML = "";

  const tableRect = tableCardsDiv.getBoundingClientRect();

  const tableCenterX = tableRect.left + tableRect.width / 2;
  const tableCenterY = tableRect.top + tableRect.height / 2;

  playedCardAnimation.style.left = `${tableCenterX}px`;
  playedCardAnimation.style.top = `${tableCenterY}px`;

  if (card.action === "drop") {
    const screenCenterX = window.innerWidth / 2;
    const screenCenterY = window.innerHeight / 2;

    playedCardAnimation.style.setProperty("--start-x", `${screenCenterX - tableCenterX}px`);
    playedCardAnimation.style.setProperty("--start-y", `${screenCenterY - tableCenterY}px`);
  } else {
    playedCardAnimation.style.setProperty("--start-x", "0px");
    playedCardAnimation.style.setProperty("--start-y", "0px");
  }

  const cardDiv = document.createElement("div");
  cardDiv.className = "floating-played-card";

  if (card.color === "red") {
    cardDiv.classList.add("red");
  }

  if (card.action === "take") {
    cardDiv.classList.add("take-animation");
  } else {
    cardDiv.classList.add("drop-animation");
  }

  cardDiv.textContent = `${card.name}${card.suit}`;

  playedCardAnimation.appendChild(cardDiv);

  playedCardAnimation.classList.remove("hidden");
  playedCardAnimation.classList.remove("show");

  void playedCardAnimation.offsetWidth;

  playedCardAnimation.classList.add("show");

  setTimeout(() => {
    playedCardAnimation.classList.add("hidden");
    playedCardAnimation.classList.remove("show");
    playedCardAnimation.innerHTML = "";

    if (card.action === "drop" && animatingDropActionId === card.actionId) {
      animatingDropActionId = null;
      renderCards();
    }
  }, 1200);
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
