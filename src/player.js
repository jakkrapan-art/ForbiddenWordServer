module.exports = class Player {
  //lobby
  id;
  remote;
  playerName;
  isReady;
  totalScore;

  //ingame
  word;
  guessWord;
  correct;
  isDie;
  score;
  killCount;

  constructor(id, remote, playerName) {
    this.id = id;
    this.remote = remote;
    this.playerName = playerName;

    this.isReady = false;
    this.word = "";
    this.guessWord = "";
    this.isDie = false;
    this.score = 0;
    this.totalScore = 0;
    this.correct = false;
    this.killCount = 0;
  }

  GetInGameData() {
    return { id: this.id, playerName: this.playerName, word: this.word, isDie: this.isDie, score: this.score }
  }

  SetDefaultParams() {
    this.isReady = false;
    this.word = "";
    this.guessWord = "";
    this.isDie = false;
    this.totalScore += this.score;
    this.score = 0;
    this.killCount = 0;
    this.correct = false;
  }
}