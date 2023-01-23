module.exports = class Room {
  roomCode;
  players;
  startTime;
  playTime;

  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = new Map();
  }

  join(player) {
    this.players.set(player.id, player);
  }

  leave(playerId) {
    this.players.delete(playerId);
  }
}