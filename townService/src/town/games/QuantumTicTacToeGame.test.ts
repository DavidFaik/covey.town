import InvalidParametersError, {
  BOARD_POSITION_NOT_EMPTY_MESSAGE,
  BOARD_POSITION_NOT_VALID_MESSAGE,
  GAME_FULL_MESSAGE,
  GAME_NOT_IN_PROGRESS_MESSAGE,
  MOVE_NOT_YOUR_TURN_MESSAGE,
  PLAYER_NOT_IN_GAME_MESSAGE,
} from '../../lib/InvalidParametersError';
import { createPlayerForTesting } from '../../TestUtils';
import Player from '../../lib/Player';
import { GameMove, QuantumTicTacToeMove } from '../../types/CoveyTownSocket';
import QuantumTicTacToeGame from './QuantumTicTacToeGame';

type BoardID = 'A' | 'B' | 'C';
type Position = { board: BoardID; row: 0 | 1 | 2; col: 0 | 1 | 2 };

describe('QuantumTicTacToeGame', () => {
  let game: QuantumTicTacToeGame;
  let player1: Player;
  let player2: Player;
  let spectator: Player;

  const createMove = (
    player: Player,
    position: { board: BoardID; row: number; col: number },
  ): GameMove<QuantumTicTacToeMove> => {
    let whosePiece: 'X' | 'O' = 'X';
    if (game.state.o === player.id) {
      whosePiece = 'O';
    } else if (game.state.x === player.id) {
      whosePiece = 'X';
    }
    return {
      playerID: player.id,
      gameID: game.id,
      move: {
        board: position.board,
        row: position.row as 0 | 1 | 2,
        col: position.col as 0 | 1 | 2,
        gamePiece: whosePiece,
      },
    };
  };

  const makeMove = (player: Player, board: BoardID, row: 0 | 1 | 2, col: 0 | 1 | 2) => {
    const move: GameMove<QuantumTicTacToeMove> = createMove(player, { board, row, col });
    game.applyMove(move);
  };

  const expectMoveToThrow = (
    player: Player,
    position: { board: BoardID; row: number; col: number },
    expectedMessage: string,
  ) => {
    const action = () => game.applyMove(createMove(player, position));
    expect(action).toThrowError(InvalidParametersError);
    expect(action).toThrowError(expectedMessage);
  };

  beforeEach(() => {
    game = new QuantumTicTacToeGame();
    player1 = createPlayerForTesting();
    player2 = createPlayerForTesting();
    spectator = createPlayerForTesting();
  });

  const joinBothPlayers = () => {
    game.join(player1);
    game.join(player2);
  };

  describe('_join', () => {
    it('should add the first player as X and keep the game waiting', () => {
      game.join(player1);
      expect(game.state.x).toBe(player1.id);
      expect(game.state.o).toBeUndefined();
      expect(game.state.status).toBe('WAITING_TO_START');
    });

    it('should add the second player as O and start the game', () => {
      joinBothPlayers();
      expect(game.state.o).toBe(player2.id);
      expect(game.state.status).toBe('IN_PROGRESS');
    });

    it('should reject additional players once the game is full', () => {
      joinBothPlayers();
      expect(() => game.join(spectator)).toThrowError(GAME_FULL_MESSAGE);
    });
  });

  describe('_leave', () => {
    it('should declare the remaining player the winner when one leaves mid-game', () => {
      joinBothPlayers();
      game.leave(player1);
      expect(game.state.status).toBe('OVER');
      expect(game.state.winner).toBe(player2.id);
    });

    it('should reset the game when the only player leaves before it starts', () => {
      game.join(player1);
      game.leave(player1);
      expect(game.state.status).toBe('WAITING_TO_START');
      expect(game.state.moves).toHaveLength(0);
      expect(game.state.xScore).toBe(0);
      expect(game.state.oScore).toBe(0);
    });
  });

  describe('applyMove validation', () => {
    it('should not allow moves before the game starts', () => {
      game.join(player1);
      expectMoveToThrow(player1, { board: 'A', row: 0, col: 0 }, GAME_NOT_IN_PROGRESS_MESSAGE);
    });

    it('should not allow non-players to move', () => {
      joinBothPlayers();
      expectMoveToThrow(spectator, { board: 'A', row: 0, col: 0 }, PLAYER_NOT_IN_GAME_MESSAGE);
    });

    it("should enforce players' turns", () => {
      joinBothPlayers();
      makeMove(player1, 'A', 0, 0);
      expectMoveToThrow(player1, { board: 'B', row: 1, col: 1 }, MOVE_NOT_YOUR_TURN_MESSAGE);
    });

    it('should reject moves outside the board bounds', () => {
      joinBothPlayers();
      expect(() =>
        game.applyMove(createMove(player1, { board: 'A', row: 3, col: 0 })),
      ).toThrowError(BOARD_POSITION_NOT_VALID_MESSAGE);
      expect(() =>
        game.applyMove(createMove(player1, { board: 'A', row: 0, col: -1 })),
      ).toThrowError(BOARD_POSITION_NOT_VALID_MESSAGE);
    });

    it('should reject moves on a board that has already been won', () => {
      joinBothPlayers();
      makeMove(player1, 'A', 0, 0);
      makeMove(player2, 'B', 0, 0);
      makeMove(player1, 'A', 0, 1);
      makeMove(player2, 'B', 0, 1);
      makeMove(player1, 'A', 0, 2);
      expectMoveToThrow(player2, { board: 'A', row: 1, col: 1 }, BOARD_POSITION_NOT_VALID_MESSAGE);
    });

    it('should reject moves on a square already claimed by the same player', () => {
      joinBothPlayers();
      makeMove(player1, 'A', 0, 0);
      makeMove(player2, 'B', 0, 0);
      expectMoveToThrow(player1, { board: 'A', row: 0, col: 0 }, BOARD_POSITION_NOT_EMPTY_MESSAGE);
    });
  });

  describe('applyMove gameplay', () => {
    beforeEach(() => {
      joinBothPlayers();
    });

    const getBoardStatus = (board: BoardID) =>
      (
        game as unknown as {
          _games: Record<BoardID, { state: { status: string; winner?: string } }>;
        }
      )._games[board].state;

    it('should keep a square hidden until a collision occurs and reveal it afterwards', () => {
      makeMove(player1, 'A', 0, 0);
      expect(game.state.publiclyVisible.A[0][0]).toBe(false);
      makeMove(player2, 'A', 0, 0);
      expect(game.state.publiclyVisible.A[0][0]).toBe(true);
      makeMove(player1, 'B', 1, 1);
      expectMoveToThrow(player2, { board: 'A', row: 0, col: 0 }, BOARD_POSITION_NOT_EMPTY_MESSAGE);
    });

    it('should award X a point when completing a row, even with collisions', () => {
      makeMove(player1, 'A', 0, 0);
      makeMove(player2, 'B', 0, 0);
      makeMove(player1, 'A', 0, 1);
      makeMove(player2, 'A', 0, 0);
      makeMove(player1, 'A', 0, 2);
      expect(game.state.xScore).toBe(1);
      expect(game.state.oScore).toBe(0);
      const boardA = getBoardStatus('A');
      expect(boardA.status).toBe('OVER');
      expect(boardA.winner).toBe(player1.id);
    });

    it('should award O a point when completing a row', () => {
      makeMove(player1, 'A', 0, 0);
      makeMove(player2, 'B', 0, 0);
      makeMove(player1, 'A', 1, 0);
      makeMove(player2, 'B', 0, 1);
      makeMove(player1, 'C', 1, 1);
      makeMove(player2, 'B', 0, 2);
      expect(game.state.xScore).toBe(0);
      expect(game.state.oScore).toBe(1);
      const boardB = getBoardStatus('B');
      expect(boardB.status).toBe('OVER');
      expect(boardB.winner).toBe(player2.id);
    });

    it('should end the game, record scores, and declare a tie when boards are exhausted', () => {
      const sequence: Position[] = [
        { board: 'A', row: 0, col: 0 },
        { board: 'B', row: 0, col: 0 },
        { board: 'A', row: 0, col: 1 },
        { board: 'B', row: 0, col: 1 },
        { board: 'A', row: 0, col: 2 },
        { board: 'B', row: 0, col: 2 },
        { board: 'C', row: 0, col: 0 },
        { board: 'C', row: 1, col: 1 },
        { board: 'C', row: 0, col: 2 },
        { board: 'C', row: 0, col: 1 },
        { board: 'C', row: 2, col: 1 },
        { board: 'C', row: 1, col: 2 },
        { board: 'C', row: 1, col: 0 },
        { board: 'C', row: 2, col: 0 },
        { board: 'C', row: 2, col: 2 },
      ];
      sequence.forEach((move, idx) => {
        const player = idx % 2 === 0 ? player1 : player2;
        makeMove(player, move.board, move.row, move.col);
      });

      expect(game.state.status).toBe('OVER');
      expect(game.state.xScore).toBe(1);
      expect(game.state.oScore).toBe(1);
      expect(game.state.winner).toBeUndefined();
      const { result } = game.toModel();
      expect(result).toBeDefined();
      expect(result?.scores[player1.id]).toBe(1);
      expect(result?.scores[player2.id]).toBe(1);
      expect(() => makeMove(player1, 'C', 0, 0)).toThrowError(GAME_NOT_IN_PROGRESS_MESSAGE);
    });

    it('should end the game and declare the higher-scoring player the winner', () => {
      const sequence: Position[] = [
        { board: 'A', row: 0, col: 0 },
        { board: 'B', row: 0, col: 0 },
        { board: 'A', row: 0, col: 1 },
        { board: 'C', row: 0, col: 0 },
        { board: 'A', row: 0, col: 2 },
        { board: 'C', row: 1, col: 0 },
        { board: 'B', row: 2, col: 0 },
        { board: 'C', row: 2, col: 0 },
        { board: 'B', row: 2, col: 1 },
        { board: 'B', row: 0, col: 1 },
        { board: 'B', row: 2, col: 2 },
      ];
      sequence.forEach((move, idx) => {
        const player = idx % 2 === 0 ? player1 : player2;
        makeMove(player, move.board, move.row, move.col);
      });

      expect(game.state.status).toBe('OVER');
      expect(game.state.xScore).toBe(2);
      expect(game.state.oScore).toBe(1);
      expect(game.state.winner).toBe(player1.id);
      const { result } = game.toModel();
      expect(result).toBeDefined();
      expect(result?.scores[player1.id]).toBe(2);
      expect(result?.scores[player2.id]).toBe(1);
    });
  });
});
