const express = require("express");
const app = express();
const http = require("http");
const socketio = require("socket.io");
const cors = require("cors");
const Player = require('./src/player.js')

const PORT = process.env.PORT || 5000

app.use(cors());
const server = http.createServer(app);
const io = socketio(server, {
  cors: {
    origin: "https://tangerine-jalebi-1978f5.netlify.app",
    methods: ["GET", "POST"],
  },
});

const KILL_SCORE = 3;
const SURVIVE_SCORE = 1;
const CORRECT_SCORE = 1;
const DEFAULT_GAMETIME_INDEX = 1;

const gameTime = [240, 300, 330, 360];
const chosenTimeIndex = 1;
let currentGameTime = 0;
const minPlayerRequire = 2;

const usedWords = [];

const players = new Map();
const candidateWords = new Map();
const playerGueesdWords = new Map();
let isPlaying = false;

server.listen(PORT, () => {
  console.log("SERVER IS RUNNING ON PORT", PORT);
});

function GetPlayerArray() {
  const array = [];
  players.forEach(player => {
    if (isPlaying) {
      array.push(player.GetInGameData());
    }
    else {
      array.push({ id: player.id, playerName: player.playerName, isReady: player.isReady });
    }
  });

  return array;
}

function GetInGamePlayers() {
  const array = [];
  players.forEach(p => {
    array.push(p.GetInGameData());
  });

  return array;
}

/**
 * 
 * @returns {Promise<boolean>}
 */
function IsAllPlayerReady() {
  let allPlayerReady = true;
  players.forEach(player => {
    if (player.isReady === false) {
      allPlayerReady = false;
    }
  });

  return allPlayerReady;
}

/**
 * 
 * @returns {Promise<boolean>}
 */
function IsAllDie() {
  let result = true;
  players.forEach(p => {
    if (!p.isDie) {
      result = false;
    }
  })

  return result;
}

/**
 * @returns {Promise<void>}
 */
function ResetPlayersReadyStatus() {
  players.forEach(player => {
    player.isReady = false;
  })
}

function getRandomWord(playerId) {
  return new Promise((resolve) => {
    const possibleWords = [];
    candidateWords.forEach((words, key) => {
      if (key !== playerId) {
        if (usedWords.findIndex(used => used === words[0]) === -1) possibleWords.push(words[0]);
        if (usedWords.findIndex(used => used === words[1]) === -1) possibleWords.push(words[1]);
      }
    });

    let word = "";
    if (possibleWords.length > 0) {
      const index = Math.floor(Math.random() * (possibleWords.length));
      word = possibleWords[index];
    }
    else {
      //get randomed word from server database.
    }

    usedWords.push(word);
    resolve(word);
  })
}

let countTimeInterval;
function CountGameTime() {
  if (countTimeInterval !== undefined) return;
  countTimeInterval = setInterval(() => {
    if (currentGameTime > 0) {
      currentGameTime -= 1;
      players.forEach(player => {
        player.remote.emit("countingTime", currentGameTime);
      })
    }
    else {
      currentGameTime = 0;
      players.forEach(player => {
        player.remote.emit("timeUp");
      })
      EndGame(false);
      return clearInterval(countTimeInterval);
    }
  }, 1000);
}

/**
 * 
 * @returns {Promise<void>}
 */
function PrepareGame() {
  players.forEach(async (player) => {
    const word = await getRandomWord(player.id);
    player.word = word;
  });

  usedWords.length = 0;
  candidateWords.clear();
  currentGameTime = gameTime[chosenTimeIndex];
}

/**
 * 
 * @returns {Promise<void>}
 */
function StartGame() {
  isPlaying = true;
  players.forEach(player => {
    player.remote.emit("toPage", "/game");
  })
  CountGameTime();
}

/**
 * 
 * @returns {Promise<void>}
 */
function ResetGame() {
  isPlaying = false;
  clearInterval(countTimeInterval);
  countTimeInterval = undefined;
  candidateWords.clear();
}

/**
 * 
 * @param {boolean} forceEnd 
 * @returns {Promise<void>}
 */
async function EndGame(forceEnd = false) {
  if (forceEnd) {
    players.forEach(player => {
      player.remote.emit("toPage", "/lobby");
      player.SetDefaultParams();
    })
    await ResetGame();
  }
  else {
    if (await IsAllDie()) {
      await ShowGameResult();
      return;
    }

    players.forEach(async player => {
      if (!player.isDie) {
        player.score += SURVIVE_SCORE;
        player.remote.emit("showGuessModal");
      }
      else {
        player.remote.emit("showLoading", "You're die. Waiting for other player guess theirs word.");
      }
    })
  }
}

async function ShowGameResult() {
  let playerArr = [];
  players.forEach((p) => {
    const playerObj = { playerId: p.id, playerName: p.playerName, totalScore: p.totalScore, score: p.score, correct: p.correct, killCount: p.killCount, isDie: p.isDie };
    playerArr.push(playerObj);
    p.SetDefaultParams();
  })

  console.log("show result.");
  players.forEach(player => {
    player.remote.emit("playerScore", playerArr);
  })

  await ResetGame();
}

io.on("connection", (client) => {
  console.log("client id:", client.id, "connected.");
  if (players.get(client.id) === undefined) {
    client.emit("toFirstPage");
  }

  client.on("disconnect", () => {
    players.delete(client.id);
    console.log("client id:", client.id, "disconnected.");
    if (isPlaying) {
      if (players.size === 1) {
        EndGame(true);
        return;
      }
    }
    else {
      candidateWords.delete(client.id);
    }

    io.emit('updatePlayerList', GetPlayerArray(players));
    console.log("current client count =", players.size);
  });

  client.on("join", (name) => {
    if (isPlaying) {
      client.emit("alert", "Game is on playing, please wait and try again.");
      return;
    }

    //client.emit("joinSuccess");
    client.emit("toPage", "/lobby");
    const player = new Player(client.id, client, name);
    players.set(client.id, player);
    io.emit('updatePlayerList', GetPlayerArray(players));
    console.log("current client count =", players.size);
  })

  client.on("requestPlayers", (callback) => {
    callback(GetPlayerArray(players));
  });

  client.on("readyCheck", async (words) => {
    let player = players.get(client.id);
    player.isReady = !player.isReady;
    candidateWords.set(player.id, words);

    io.emit('updatePlayerList', GetPlayerArray(players));

    if (!player.isReady) return;
    if (players.size >= minPlayerRequire && IsAllPlayerReady()) {
      currentGameTime = gameTime[chosenTimeIndex];
      await PrepareGame();
      await StartGame();
    }
  });

  client.on("loadGamePageSuccess", (callback) => {
    callback({ myUserId: client.id, players: GetInGamePlayers(), gameTime: currentGameTime });
  });

  client.on("kill", (target_id) => {
    const player = players.get(client.id);
    console.log(player.playerName, "call kill.");
    if (player.isDie) {
      client.emit("alert", "You're die, can't kill other.");
      return;
    }

    const target = players.get(target_id);
    if (target === undefined) return;

    target.isDie = true;

    player.score += KILL_SCORE;
    player.killCount++;
    console.log(player.playerName, "has kill", target.playerName, "get", KILL_SCORE, "current kill count:", player.killCount);
    target.remote.emit("getKilled", ("You have killed by " + player.playerName));
    players.forEach(player => {
      player.remote.emit("updatePlayerList", GetPlayerArray());
    })
  })

  client.on("suicide", async () => {
    const player = players.get(client.id);
    if (player === undefined) client.emit("toFirstPage");
    else if (player.isDie) client.emit("alert", "You can't die twice.");
    player.isDie = true;

    if (await IsAllDie()) {
      await EndGame();
    }
    else {
      client.emit("getKilled", "You have suicided.");
    }

    players.forEach(player => {
      player.remote.emit("updatePlayerList", GetPlayerArray());
    })
  })

  client.on("requestToPage", (target) => {
    const player = players.get(client.id);
    if (player === undefined) client.emit("toFirstPage");
    player.remote.emit("toPage", target);
  });

  client.on("guessWord", (word) => {
    const player = players.get(client.id);
    if (player === undefined) return;

    if (player.word === word) {
      player.score += CORRECT_SCORE;
      player.correct = true;
    }

    player.guessWord = word;
    let foundNotGuess = false;
    players.forEach(p => {
      if (!p.isDie && p.guessWord === "") {
        foundNotGuess = true;
      }
    });

    if (!foundNotGuess) {
      const list = [];
      players.forEach(p => {
        list.push({ playerId: p.id, playerName: p.playerName, correctWord: p.word, guessWord: p.guessWord, correct: p.correct, isDie: p.isDie });
        if (!p.isDie && p.word !== p.guessWord) {
          playerGueesdWords.set(p.id, 0);
        }
      })

      players.forEach(player => {
        player.remote.emit("guessResult", list);
      })
      ResetPlayersReadyStatus();
    }
  })

  client.on("voteGuess", (targetPlayerId, chosen) => {
    let currentVotePoint = playerGueesdWords.get(targetPlayerId);
    const player = players.get(targetPlayerId);
    if (player === undefined) return;
    console.log("vote", player.playerName, "current vote:", currentVotePoint, "chosen:", chosen);
    if (currentVotePoint === undefined) return;
    if (chosen === "Pass") {
      playerGueesdWords.set(targetPlayerId, ++currentVotePoint);
      console.log("after set:", playerGueesdWords.get(targetPlayerId));
      if (currentVotePoint >= Math.floor(players.size / 2)) {
        player.score += CORRECT_SCORE;
        player.correct = true;
      }
    }
  })

  client.on("submitVote", async () => {
    const player = players.get(client.id);
    if (player === undefined) return;
    player.isReady = true;
    if (await IsAllPlayerReady()) {
      await ShowGameResult();
    }
  })
})