import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  ArrowLeft,
  Copy,
  Users,
  Wifi,
  WifiOff,
  Handshake,
  Check,
  X,
  Palette,
  RotateCw,
  Volume2,
  VolumeX,
  Flag,
  RotateCcw,
  Link as LinkIcon,
} from 'lucide-react';
import Peer from 'peerjs';

// Sound controller using Web Audio API (zero external assets)
class SoundController {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  play(type) {
    try {
      this.init();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      if (type === 'move') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, t);
        osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.08);
        osc.start(t);
        osc.stop(t + 0.08);
      } else if (type === 'capture') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(420, t);
        osc.frequency.exponentialRampToValueAtTime(90, t + 0.1);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.1);
        osc.start(t);
        osc.stop(t + 0.1);
      } else if (type === 'check') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, t);
        osc.frequency.setValueAtTime(880, t + 0.08);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.2);
        osc.start(t);
        osc.stop(t + 0.2);
      } else if (type === 'gameover') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, t);
        osc.frequency.setValueAtTime(392.0, t + 0.12);
        osc.frequency.setValueAtTime(261.63, t + 0.24);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.38);
        osc.start(t);
        osc.stop(t + 0.38);
      }
    } catch {
      // Audio playback blocked or not supported
    }
  }
}

const sound = new SoundController();

const PEER_CONFIG = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp',
        ],
        username: 'openrelay',
        credential: 'openrelay',
      },
    ],
    iceCandidatePoolSize: 10,
  },
};

const BOARD_THEMES = {
  wood: {
    name: 'Classic Wood',
    light: '#f0d9b5',
    dark: '#b58863',
    border: 'border-amber-950/40',
    moveDot: 'rgba(0, 0, 0, 0.28)',
    captureRing: 'rgba(0, 0, 0, 0.38)',
  },
  emerald: {
    name: 'Emerald',
    light: '#eeeed2',
    dark: '#769656',
    border: 'border-emerald-950/40',
    moveDot: 'rgba(0, 0, 0, 0.28)',
    captureRing: 'rgba(0, 0, 0, 0.38)',
  },
  ocean: {
    name: 'Ocean',
    light: '#e2f1f8',
    dark: '#4b7399',
    border: 'border-slate-800',
    moveDot: 'rgba(15, 23, 42, 0.32)',
    captureRing: 'rgba(15, 23, 42, 0.42)',
  },
  dark: {
    name: 'Dark Neutral',
    light: '#d4d4d4',
    dark: '#262626',
    border: 'border-neutral-800',
    moveDot: 'rgba(255, 255, 255, 0.42)',
    captureRing: 'rgba(255, 255, 255, 0.52)',
  },
};

const PIECE_SYMBOLS = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

export default function Game() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode = searchParams.get('mode') || 'local';
  const room = searchParams.get('room');
  const isHost = searchParams.get('host') === 'true';
  const isOnline = mode === 'online';

  const [playerColor] = useState(isOnline ? (isHost ? 'w' : 'b') : 'w');
  const [manualOrientation, setManualOrientation] = useState(
    isOnline ? (isHost ? 'white' : 'black') : 'white'
  );
  const [autoFlip, setAutoFlip] = useState(false);

  const boardOrientation = (!isOnline && autoFlip)
    ? (game.turn() === 'w' ? 'white' : 'black')
    : manualOrientation;

  const [peerConnected, setPeerConnected] = useState(!isOnline);
  const connRef = useRef(null);

  // Isolate storage by player color in online mode to avoid tab collision on localhost
  const storageKey = isOnline
    ? `chess-game-online-${room}-${playerColor}`
    : 'chess-game-local';

  const [game, setGame] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    const chess = new Chess();
    if (saved) {
      try {
        chess.load(saved);
      } catch {
        localStorage.removeItem(storageKey);
      }
    }
    return chess;
  });

  const [gameFen, setGameFen] = useState(game.fen());
  const [optionSquares, setOptionSquares] = useState({});
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validTargets, setValidTargets] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Theme & Sound state (persisted)
  const [selectedThemeKey, setSelectedThemeKey] = useState(() => {
    return localStorage.getItem('chessio-theme') || 'wood';
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [muted, setMuted] = useState(() => {
    return localStorage.getItem('chessio-muted') === 'true';
  });

  // Game over & negotiation states
  const [resignedBy, setResignedBy] = useState(null);
  const [incomingDrawOffer, setIncomingDrawOffer] = useState(false);
  const [drawAgreed, setDrawAgreed] = useState(false);
  const [drawNotice, setDrawNotice] = useState(null);
  const [incomingRematchOffer, setIncomingRematchOffer] = useState(false);
  const [isResignConfirmOpen, setIsResignConfirmOpen] = useState(false);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  const moveHistoryScrollRef = useRef(null);

  // Persist game state
  useEffect(() => {
    localStorage.setItem(storageKey, gameFen);
  }, [gameFen, storageKey]);

  // Persist theme selection
  useEffect(() => {
    localStorage.setItem('chessio-theme', selectedThemeKey);
  }, [selectedThemeKey]);

  // Persist mute state
  useEffect(() => {
    localStorage.setItem('chessio-muted', String(muted));
  }, [muted]);

  // Auto-scroll move history to end
  useEffect(() => {
    if (moveHistoryScrollRef.current) {
      moveHistoryScrollRef.current.scrollLeft = moveHistoryScrollRef.current.scrollWidth;
    }
  }, [gameFen]);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setValidTargets([]);
    setOptionSquares({});
  }, []);

  const triggerSound = useCallback((moveResult, isCheckmate, isDraw, inCheck) => {
    if (muted) return;
    if (isCheckmate || isDraw) {
      sound.play('gameover');
    } else if (inCheck) {
      sound.play('check');
    } else if (moveResult?.captured) {
      sound.play('capture');
    } else {
      sound.play('move');
    }
  }, [muted]);

  const startNewGame = useCallback((syncPeer = false) => {
    const newChess = new Chess();
    setGame(newChess);
    setGameFen(newChess.fen());
    setLastMove(null);
    setResignedBy(null);
    setDrawAgreed(false);
    setDrawNotice(null);
    setIncomingDrawOffer(false);
    setIncomingRematchOffer(false);
    setPendingPromotion(null);
    clearSelection();
    localStorage.removeItem(storageKey);

    if (syncPeer && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'RESET_GAME' });
    }
  }, [clearSelection, storageKey]);

  const handleData = useCallback((data) => {
    if (data.type === 'MOVE') {
      try {
        const move = game.move(data.move);
        if (move) {
          setGameFen(game.fen());
          setLastMove({ from: data.move.from, to: data.move.to });
          clearSelection();
          triggerSound(move, game.isCheckmate(), game.isDraw(), game.inCheck());
        }
      } catch (err) {
        console.error('Invalid move received:', err);
      }
    } else if (data.type === 'SYNC_STATE') {
      try {
        game.load(data.fen);
        setGameFen(game.fen());
        if (data.lastMove) setLastMove(data.lastMove);
        clearSelection();
      } catch (err) {
        console.error('Invalid FEN sync:', err);
      }
    } else if (data.type === 'DRAW_OFFER') {
      setIncomingDrawOffer(true);
    } else if (data.type === 'DRAW_ACCEPT') {
      setDrawAgreed(true);
      setIncomingDrawOffer(false);
      setDrawNotice('Draw accepted!');
      if (!muted) sound.play('gameover');
    } else if (data.type === 'DRAW_REJECT') {
      setDrawNotice('Draw offer declined by opponent.');
      setTimeout(() => setDrawNotice(null), 3500);
    } else if (data.type === 'RESIGN') {
      const resigningColor = playerColor === 'w' ? 'b' : 'w';
      setResignedBy(resigningColor);
      setDrawNotice('Opponent resigned. You win!');
      if (!muted) sound.play('gameover');
    } else if (data.type === 'REMATCH_OFFER') {
      setIncomingRematchOffer(true);
    } else if (data.type === 'REMATCH_ACCEPT') {
      startNewGame(false);
      setDrawNotice('Rematch started!');
      setTimeout(() => setDrawNotice(null), 3000);
    } else if (data.type === 'REMATCH_REJECT') {
      setDrawNotice('Rematch declined by opponent.');
      setTimeout(() => setDrawNotice(null), 3500);
    } else if (data.type === 'RESET_GAME') {
      startNewGame(false);
    }
  }, [game, clearSelection, playerColor, muted, triggerSound, startNewGame]);

  const handleDataRef = useRef(handleData);
  useEffect(() => {
    handleDataRef.current = handleData;
  }, [handleData]);

  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const lastMoveRef = useRef(lastMove);
  useEffect(() => {
    lastMoveRef.current = lastMove;
  }, [lastMove]);

  useEffect(() => {
    if (!isOnline || !room) return;

    let peer = null;
    let heartbeatInterval = null;
    let retryCount = 0;
    let isCleanedUp = false;
    const hostPeerId = `chess-room-${room}`;

    let guestConnectAttempts = 0;
    let guestRetryTimeout = null;

    const attachConnectionEvents = (connection) => {
      connRef.current = connection;

      // Monitor WebRTC ICE connectivity state
      if (connection.peerConnection) {
        connection.peerConnection.oniceconnectionstatechange = () => {
          const state = connection.peerConnection?.iceConnectionState;
          if (state === 'connected' || state === 'completed') {
            setPeerConnected(true);
            setDrawNotice(null);
          } else if (state === 'disconnected') {
            setPeerConnected(false);
            setDrawNotice('Connection interrupted. Waiting for recovery...');
          } else if (state === 'failed') {
            setPeerConnected(false);
            setDrawNotice('Connection failed between networks. Retrying...');
            if (connection.peerConnection.restartIce) {
              connection.peerConnection.restartIce();
            }
          }
        };
      }

      connection.on('open', () => {
        if (isCleanedUp) return;
        setPeerConnected(true);
        setDrawNotice(null);

        if (isHost) {
          connection.send({
            type: 'SYNC_STATE',
            fen: gameRef.current.fen(),
            lastMove: lastMoveRef.current,
          });
        }

        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (connection.open) {
            connection.send({ type: 'PING' });
          }
        }, 10000);
      });

      connection.on('data', (data) => {
        if (data.type === 'PING') return;
        handleDataRef.current?.(data);
      });

      connection.on('close', () => {
        if (!isCleanedUp) {
          setPeerConnected(false);
          setDrawNotice('Opponent disconnected.');
        }
      });

      connection.on('error', (err) => {
        console.warn('Connection error:', err);
        if (!isCleanedUp) {
          setPeerConnected(false);
        }
      });
    };

    const initPeer = () => {
      if (isCleanedUp) return;

      if (isHost) {
        peer = new Peer(hostPeerId, PEER_CONFIG);

        peer.on('open', () => {
          if (isCleanedUp) return;
          console.log('Host registered as:', hostPeerId);
        });

        peer.on('connection', (connection) => {
          attachConnectionEvents(connection);
        });
      } else {
        peer = new Peer(PEER_CONFIG);

        const connectToHost = () => {
          if (isCleanedUp || !peer || peer.destroyed) return;
          guestConnectAttempts += 1;
          setDrawNotice(`Connecting to host (attempt ${guestConnectAttempts}/6)...`);
          const connection = peer.connect(hostPeerId, { reliable: true });
          attachConnectionEvents(connection);
        };

        peer.on('open', () => {
          if (isCleanedUp) return;
          connectToHost();
        });

        peer.on('error', (err) => {
          if (isCleanedUp) return;
          console.warn('Guest PeerJS Error:', err.type, err);

          if (err.type === 'peer-unavailable') {
            if (guestConnectAttempts < 6) {
              clearTimeout(guestRetryTimeout);
              guestRetryTimeout = setTimeout(connectToHost, 2000);
            } else {
              setDrawNotice('Host offline or room not found. Ensure Host tab is open first.');
            }
          }
        });
      }

      peer.on('error', (err) => {
        if (isCleanedUp) return;
        console.warn('PeerJS Error:', err.type, err);

        if (err.type === 'unavailable-id' && isHost) {
          if (retryCount < 3) {
            retryCount += 1;
            setTimeout(initPeer, 1500);
          } else {
            setDrawNotice('Room code already active. Please create a fresh room.');
          }
        }

        if (err.type === 'peer-unavailable' && isHost) {
          setDrawNotice('Signaling error. Retrying...');
        }
      });
    };

    initPeer();

    return () => {
      isCleanedUp = true;
      clearTimeout(guestRetryTimeout);
      clearInterval(heartbeatInterval);
      if (peer) {
        peer.destroy();
      }
    };
  }, [isOnline, room, isHost]);

  const copyInviteLink = async () => {
    try {
      const inviteUrl = `${window.location.origin}/game?mode=online&room=${room}`;
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // clipboard access error
    }
  };

  const currentTheme = BOARD_THEMES[selectedThemeKey] || BOARD_THEMES.wood;

  const buildOptionSquares = useCallback((square, moves) => {
    const highlights = {};
    const theme = BOARD_THEMES[selectedThemeKey] || BOARD_THEMES.wood;

    moves.forEach((move) => {
      const isCapture = Boolean(move.captured) || move.flags.includes('e') || Boolean(game.get(move.to));
      highlights[move.to] = {
        background: isCapture
          ? `radial-gradient(circle, transparent 64%, ${theme.captureRing} 65%, ${theme.captureRing} 100%)`
          : `radial-gradient(circle, ${theme.moveDot} 26%, transparent 26%)`,
        borderRadius: '50%',
      };
    });
    highlights[square] = { backgroundColor: 'rgba(255, 255, 255, 0.35)' };
    return highlights;
  }, [game, selectedThemeKey]);

  const selectSquare = useCallback((square) => {
    if (drawAgreed || resignedBy || (isOnline && game.turn() !== playerColor)) return;

    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) {
      clearSelection();
      return;
    }
    setSelectedSquare(square);
    setValidTargets(moves.map((m) => m.to));
    setOptionSquares(buildOptionSquares(square, moves));
  }, [drawAgreed, resignedBy, isOnline, game, playerColor, clearSelection, buildOptionSquares]);

  // Strict legal promotion check
  const isPromotionMove = useCallback((from, to) => {
    const piece = game.get(from);
    if (!piece || piece.type !== 'p') return false;
    const isWhitePromotion = piece.color === 'w' && to[1] === '8';
    const isBlackPromotion = piece.color === 'b' && to[1] === '1';
    if (!isWhitePromotion && !isBlackPromotion) return false;

    // Check legality against chess.js engine
    const legalMoves = game.moves({ square: from, verbose: true });
    return legalMoves.some((m) => m.to === to && m.promotion);
  }, [game]);

  const attemptMove = useCallback((from, to, chosenPromotion = null) => {
    if (drawAgreed || resignedBy || (isOnline && game.turn() !== playerColor)) return false;

    if (isPromotionMove(from, to) && !chosenPromotion) {
      setPendingPromotion({ from, to });
      return false;
    }

    try {
      const moveData = { from, to, promotion: chosenPromotion || 'q' };
      const move = game.move(moveData);
      if (move) {
        setGameFen(game.fen());
        setLastMove({ from, to });
        clearSelection();
        setPendingPromotion(null);

        triggerSound(move, game.isCheckmate(), game.isDraw(), game.inCheck());

        if (isOnline && connRef.current && connRef.current.open) {
          connRef.current.send({ type: 'MOVE', move: moveData });
        }
        return true;
      }
    } catch {
      // illegal move rejected
    } finally {
      if (chosenPromotion) {
        setPendingPromotion(null);
      }
    }
    return false;
  }, [drawAgreed, resignedBy, isOnline, game, playerColor, isPromotionMove, clearSelection, triggerSound]);

  const executePromotion = (pieceType) => {
    if (!pendingPromotion) return;
    attemptMove(pendingPromotion.from, pendingPromotion.to, pieceType);
  };

  const cancelPromotion = () => {
    setPendingPromotion(null);
    clearSelection();
  };

  const onDrop = (sourceSquare, targetSquare) => {
    const src = typeof sourceSquare === 'object' ? sourceSquare.sourceSquare : sourceSquare;
    const tgt = typeof sourceSquare === 'object' ? sourceSquare.targetSquare : targetSquare;
    const moved = attemptMove(src, tgt);
    if (!moved && !pendingPromotion) clearSelection();
    return moved;
  };

  const onSquareClick = (squareData) => {
    const square = typeof squareData === 'object' ? squareData.square : squareData;
    if (!square) return;

    if (selectedSquare && validTargets.includes(square)) {
      attemptMove(selectedSquare, square);
      return;
    }

    if (selectedSquare === square) {
      clearSelection();
      return;
    }

    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      selectSquare(square);
      return;
    }

    clearSelection();
  };

  const offerDraw = () => {
    if (gameOver) return;

    if (!isOnline) {
      setDrawAgreed(true);
      setDrawNotice('Game ended in a mutual draw.');
      if (!muted) sound.play('gameover');
      return;
    }

    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'DRAW_OFFER' });
      setDrawNotice('Draw offer sent to opponent...');
    }
  };

  const acceptDraw = () => {
    setDrawAgreed(true);
    setIncomingDrawOffer(false);
    setDrawNotice('Game ended in a draw.');
    if (!muted) sound.play('gameover');

    if (isOnline && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'DRAW_ACCEPT' });
    }
  };

  const rejectDraw = () => {
    setIncomingDrawOffer(false);
    if (isOnline && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'DRAW_REJECT' });
    }
  };

  const handleResign = () => {
    setIsResignConfirmOpen(false);
    if (gameOver) return;

    setResignedBy(playerColor);
    setDrawNotice('You resigned.');
    if (!muted) sound.play('gameover');

    if (isOnline && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'RESIGN' });
    }
  };

  const requestRematch = () => {
    if (isOnline && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'REMATCH_OFFER' });
      setDrawNotice('Rematch request sent...');
    } else {
      startNewGame(false);
    }
  };

  const acceptRematch = () => {
    setIncomingRematchOffer(false);
    startNewGame(false);
    if (isOnline && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'REMATCH_ACCEPT' });
    }
  };

  const rejectRematch = () => {
    setIncomingRematchOffer(false);
    if (isOnline && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'REMATCH_REJECT' });
    }
  };

  // Material & Captured pieces computation
  const { capturedPieces, materialDiff } = useMemo(() => {
    if (!gameFen) return { capturedPieces: { w: [], b: [] }, materialDiff: 0 };
    const initialCounts = {
      w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
      b: { p: 8, n: 2, b: 2, r: 2, q: 1 },
    };
    const currentCounts = {
      w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
      b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    };

    const board = game.board();
    for (const row of board) {
      for (const sq of row) {
        if (sq && sq.type !== 'k') {
          currentCounts[sq.color][sq.type] = (currentCounts[sq.color][sq.type] || 0) + 1;
        }
      }
    }

    const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9 };
    const captured = { w: [], b: [] };
    let whiteTotal = 0;
    let blackTotal = 0;

    for (const type of ['p', 'n', 'b', 'r', 'q']) {
      const missingWhite = Math.max(0, initialCounts.w[type] - currentCounts.w[type]);
      const missingBlack = Math.max(0, initialCounts.b[type] - currentCounts.b[type]);

      for (let i = 0; i < missingWhite; i++) captured.w.push(type);
      for (let i = 0; i < missingBlack; i++) captured.b.push(type);

      whiteTotal += currentCounts.w[type] * pieceValues[type];
      blackTotal += currentCounts.b[type] * pieceValues[type];
    }

    return {
      capturedPieces: captured,
      materialDiff: whiteTotal - blackTotal,
    };
  }, [gameFen, game]);

  // Combine option squares with last move highlight
  const combinedSquareStyles = useMemo(() => {
    const styles = { ...optionSquares };
    if (lastMove?.from && !styles[lastMove.from]) {
      styles[lastMove.from] = { backgroundColor: 'rgba(234, 179, 8, 0.35)' };
    }
    if (lastMove?.to && !styles[lastMove.to]) {
      styles[lastMove.to] = { backgroundColor: 'rgba(234, 179, 8, 0.35)' };
    }
    return styles;
  }, [optionSquares, lastMove]);

  // Algebraic move history paired by round
  const movePairs = useMemo(() => {
    if (!gameFen) return [];
    const history = game.history();
    const pairs = [];
    for (let i = 0; i < history.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: history[i],
        black: history[i + 1] || '',
      });
    }
    return pairs;
  }, [gameFen, game]);

  const gameOver = game.isGameOver() || drawAgreed || Boolean(resignedBy);
  const inCheck = game.inCheck() && !game.isCheckmate() && !gameOver;

  const getGameOverReason = () => {
    if (resignedBy) {
      const winner = resignedBy === 'w' ? 'Black' : 'White';
      return `${resignedBy === 'w' ? 'White' : 'Black'} resigned. ${winner} wins!`;
    }
    if (drawAgreed) {
      return 'Game drawn by mutual agreement.';
    }
    if (game.isCheckmate()) {
      const winner = game.turn() === 'w' ? 'Black' : 'White';
      return `Checkmate! ${winner} wins!`;
    }
    if (game.isStalemate()) {
      return 'Draw by Stalemate.';
    }
    if (game.isThreefoldRepetition()) {
      return 'Draw by Threefold Repetition.';
    }
    if (game.isInsufficientMaterial()) {
      return 'Draw by Insufficient Material.';
    }
    if (game.isDraw()) {
      return 'Draw (50-move rule).';
    }
    return 'Game Over';
  };

  const chessboardOptions = {
    position: gameFen,
    boardOrientation,
    onPieceDrop: onDrop,
    onPieceDrag: ({ square }) => selectSquare(square),
    onSquareClick,
    squareStyles: combinedSquareStyles,
    darkSquareStyle: { backgroundColor: currentTheme.dark },
    lightSquareStyle: { backgroundColor: currentTheme.light },
    dropSquareStyle: { boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.7)' },
    boardStyle: {
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
    },
    animationDurationInMs: 180,
    id: 'main-board',
  };

  // Determine promoting pawn color
  const promotingPawnColor = pendingPromotion
    ? game.get(pendingPromotion.from)?.color || (game.turn() === 'w' ? 'w' : 'b')
    : 'w';

  return (
    <div className="min-h-screen bg-neutral-950 font-sans relative flex flex-col justify-center py-2 sm:py-4 w-full max-w-full overflow-x-hidden">
      <div className="max-w-md sm:max-w-lg mx-auto w-full px-2.5 sm:px-4 box-border">

        {/* Top Header Controls - Responsive Two-Tier Layout */}
        <div className="flex flex-col gap-2 mb-2.5 w-full">
          {/* Row 1: Back + Connection Status & Invite Link */}
          <div className="flex items-center justify-between gap-2 w-full">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1 text-neutral-400 hover:text-white text-xs sm:text-sm font-semibold transition-colors cursor-pointer shrink-0 py-1"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {isOnline ? (
                <>
                  <span className={`flex items-center gap-1 text-[11px] sm:text-xs px-2 py-1 rounded-full shrink-0 ${peerConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                    {peerConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    <span>{peerConnected ? 'Connected' : 'Waiting'}</span>
                  </span>
                  <button
                    onClick={copyInviteLink}
                    className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-white px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer shrink-0"
                    title="Copy full invite link to clipboard"
                  >
                    <LinkIcon className="w-3 h-3 text-amber-400" />
                    <span>{copiedLink ? 'Copied!' : room ? `Room ${room}` : 'Invite'}</span>
                    <Copy className="w-3 h-3 text-neutral-400" />
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 text-white px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide shrink-0">
                  <Users className="w-3.5 h-3.5" />
                  <span>Local Play</span>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Secondary Tool Actions (Mute, Theme, Flip Board) */}
          <div className="flex items-center justify-end gap-1.5 w-full">
            <button
              onClick={() => setMuted(!muted)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white text-xs font-medium cursor-pointer transition-colors"
              title={muted ? 'Unmute sounds' : 'Mute sounds'}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
              <span className="text-[11px]">{muted ? 'Muted' : 'Sound'}</span>
            </button>

            <button
              onClick={() => setIsThemeMenuOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-medium cursor-pointer transition-colors"
              title="Board Themes"
            >
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px]">Theme</span>
            </button>

            <button
              onClick={() => setManualOrientation(boardOrientation === 'white' ? 'black' : 'white')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-xs font-medium cursor-pointer transition-colors"
              title={`Flip Board (Currently ${boardOrientation})`}
            >
              <RotateCw className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-[11px]">Flip</span>
            </button>
          </div>
        </div>

        {/* Top Player Info Bar */}
        <div className="flex items-center justify-between px-2.5 py-1.5 mb-1.5 bg-neutral-900/60 rounded-xl border border-neutral-800/80 min-w-0 w-full overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${boardOrientation === 'white' ? 'bg-neutral-800 border border-neutral-600' : 'bg-white'}`} />
            <span className="text-xs font-bold text-neutral-200 truncate shrink-0">
              {boardOrientation === 'white'
                ? (isOnline ? (playerColor === 'b' ? 'You (Black)' : 'Opponent (Black)') : 'Black')
                : (isOnline ? (playerColor === 'w' ? 'You (White)' : 'Opponent (White)') : 'White')}
            </span>
            <div className="flex items-center gap-0.5 text-neutral-400 text-xs overflow-x-auto scrollbar-none min-w-0">
              {boardOrientation === 'white'
                ? capturedPieces.w.map((p, i) => (
                    <span key={i} className="text-xs shrink-0">{PIECE_SYMBOLS.w[p]}</span>
                  ))
                : capturedPieces.b.map((p, i) => (
                    <span key={i} className="text-xs shrink-0">{PIECE_SYMBOLS.b[p]}</span>
                  ))}
              {((boardOrientation === 'white' && materialDiff < 0) || (boardOrientation === 'black' && materialDiff > 0)) && (
                <span className="text-[10px] font-bold text-neutral-400 ml-1 shrink-0">
                  +{Math.abs(materialDiff)}
                </span>
              )}
            </div>
          </div>
          {((boardOrientation === 'white' && game.turn() === 'b') || (boardOrientation === 'black' && game.turn() === 'w')) && !gameOver && (
            <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30 animate-pulse shrink-0 ml-1">
              Turn
            </span>
          )}
        </div>

        {/* Chessboard Box */}
        <div className={`rounded-[20px] border ${currentTheme.border} bg-neutral-900 p-2 sm:p-2.5 relative shadow-2xl transition-colors duration-300 w-full max-w-full overflow-hidden`}>
          <div className="w-full aspect-square">
            <Chessboard options={chessboardOptions} />
          </div>

          {/* Pawn Promotion Modal Overlay */}
          {pendingPromotion && (
            <div
              onClick={cancelPromotion}
              className="absolute inset-0 bg-neutral-950/85 backdrop-blur-xs rounded-[20px] flex flex-col items-center justify-center p-6 z-20"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center relative max-w-xs w-full"
              >
                <button
                  onClick={cancelPromotion}
                  className="absolute top-3 right-3 text-neutral-400 hover:text-white p-1 rounded-full cursor-pointer transition-colors"
                  title="Cancel promotion"
                >
                  <X className="w-4 h-4" />
                </button>

                <h3 className="text-white text-sm font-bold mb-3">Promote Pawn To</h3>
                <div className="flex gap-2">
                  {[
                    { type: 'q', label: 'Queen', symbol: PIECE_SYMBOLS[promotingPawnColor].q },
                    { type: 'r', label: 'Rook', symbol: PIECE_SYMBOLS[promotingPawnColor].r },
                    { type: 'b', label: 'Bishop', symbol: PIECE_SYMBOLS[promotingPawnColor].b },
                    { type: 'n', label: 'Knight', symbol: PIECE_SYMBOLS[promotingPawnColor].n },
                  ].map((piece) => (
                    <button
                      key={piece.type}
                      onClick={() => executePromotion(piece.type)}
                      className="flex flex-col items-center justify-center w-13 h-17 bg-neutral-800 hover:bg-white hover:text-black text-white border border-neutral-700 rounded-xl transition-all cursor-pointer"
                    >
                      <span className="text-2xl mb-1">{piece.symbol}</span>
                      <span className="text-[9px] font-bold uppercase">{piece.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Player Info Bar */}
        <div className="flex items-center justify-between px-2.5 py-1.5 mt-1.5 bg-neutral-900/60 rounded-xl border border-neutral-800/80 min-w-0 w-full overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${boardOrientation === 'white' ? 'bg-white' : 'bg-neutral-800 border border-neutral-600'}`} />
            <span className="text-xs font-bold text-neutral-200 truncate shrink-0">
              {boardOrientation === 'white'
                ? (isOnline ? (playerColor === 'w' ? 'You (White)' : 'Opponent (White)') : 'White')
                : (isOnline ? (playerColor === 'b' ? 'You (Black)' : 'Opponent (Black)') : 'Black')}
            </span>
            <div className="flex items-center gap-0.5 text-neutral-400 text-xs overflow-x-auto scrollbar-none min-w-0">
              {boardOrientation === 'white'
                ? capturedPieces.b.map((p, i) => (
                    <span key={i} className="text-xs shrink-0">{PIECE_SYMBOLS.b[p]}</span>
                  ))
                : capturedPieces.w.map((p, i) => (
                    <span key={i} className="text-xs shrink-0">{PIECE_SYMBOLS.w[p]}</span>
                  ))}
              {((boardOrientation === 'white' && materialDiff > 0) || (boardOrientation === 'black' && materialDiff < 0)) && (
                <span className="text-[10px] font-bold text-neutral-400 ml-1 shrink-0">
                  +{Math.abs(materialDiff)}
                </span>
              )}
            </div>
          </div>
          {((boardOrientation === 'white' && game.turn() === 'w') || (boardOrientation === 'black' && game.turn() === 'b')) && !gameOver && (
            <span className="text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/30 animate-pulse shrink-0 ml-1">
              Turn
            </span>
          )}
        </div>

        {/* Status & Alerts Bar */}
        <div className="flex flex-col items-center gap-1.5 my-3 text-center w-full px-2">
          <h2 className="text-white text-base sm:text-lg font-bold m-0">
            {gameOver ? (
              <span className="text-amber-400">{getGameOverReason()}</span>
            ) : (
              `${game.turn() === 'w' ? 'White' : 'Black'} to move ${
                isOnline ? `(${playerColor === game.turn() ? 'Your turn' : "Opponent's turn"})` : ''
              }`
            )}
          </h2>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            {inCheck && (
              <span className="px-3 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[11px] font-extrabold uppercase tracking-wider animate-pulse">
                Check!
              </span>
            )}
            {drawNotice && (
              <p className="text-amber-400 text-xs font-semibold m-0 bg-amber-400/10 px-3 py-0.5 rounded-full border border-amber-400/20 max-w-full break-words">
                {drawNotice}
              </p>
            )}
          </div>
        </div>

        {/* Move History Log */}
        {movePairs.length > 0 && (
          <div
            ref={moveHistoryScrollRef}
            className="flex items-center gap-2 overflow-x-auto py-2 px-3 bg-neutral-900 border border-neutral-800 rounded-xl mb-3 scrollbar-none text-xs w-full max-w-full"
          >
            <span className="text-neutral-500 font-bold uppercase text-[10px] shrink-0">Moves:</span>
            {movePairs.map((pair) => (
              <div key={pair.num} className="flex items-center gap-1 shrink-0 bg-neutral-950/70 px-2 py-0.5 rounded border border-neutral-800">
                <span className="text-neutral-500 text-[10px] font-mono">{pair.num}.</span>
                <span className="text-neutral-200 font-medium">{pair.white}</span>
                {pair.black && <span className="text-neutral-400 font-medium">{pair.black}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-2 flex-wrap">
          {gameOver ? (
            <button
              onClick={isOnline ? requestRematch : () => startNewGame(false)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-black bg-white rounded-full cursor-pointer hover:bg-neutral-200 transition-colors shadow-lg"
            >
              <RotateCcw className="w-4 h-4" />
              {isOnline ? 'Request Rematch' : 'Play Again'}
            </button>
          ) : (
            <>
              <button
                onClick={offerDraw}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-neutral-900 border border-neutral-800 rounded-full cursor-pointer hover:bg-neutral-800 transition-colors"
                title="Offer a draw to opponent"
              >
                <Handshake className="w-3.5 h-3.5 text-amber-400" />
                Draw
              </button>

              <button
                onClick={() => setIsResignConfirmOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-neutral-300 bg-neutral-900 border border-neutral-800 rounded-full cursor-pointer hover:bg-rose-950/40 hover:text-rose-400 hover:border-rose-800/50 transition-colors"
                title="Resign game"
              >
                <Flag className="w-3.5 h-3.5 text-rose-400" />
                Resign
              </button>

              {!isOnline && (
                <>
                  <button
                    onClick={() => startNewGame(false)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-neutral-300 bg-neutral-900 border border-neutral-800 rounded-full cursor-pointer hover:bg-neutral-800 transition-colors"
                    title="Restart game"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
                    Reset
                  </button>

                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-400 cursor-pointer ml-1">
                    <input
                      type="checkbox"
                      checked={autoFlip}
                      onChange={(e) => setAutoFlip(e.target.checked)}
                      className="rounded accent-white cursor-pointer"
                    />
                    Auto-Flip
                  </label>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Theme Settings Modal */}
      {isThemeMenuOpen && (
        <div
          onClick={() => setIsThemeMenuOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 max-w-xs w-full shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-amber-400" />
                <h3 className="text-white text-sm font-bold m-0">Board Theme</h3>
              </div>
              <button
                onClick={() => setIsThemeMenuOpen(false)}
                className="text-neutral-400 hover:text-white p-1 cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-2">
              {Object.entries(BOARD_THEMES).map(([key, theme]) => {
                const isSelected = selectedThemeKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      setSelectedThemeKey(key);
                      setIsThemeMenuOpen(false);
                    }}
                    className={`flex flex-col items-center p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/10'
                        : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex w-12 h-12 rounded-lg overflow-hidden border border-black/20 mb-2 shadow-inner">
                      <div style={{ backgroundColor: theme.light }} className="w-1/2 h-full" />
                      <div style={{ backgroundColor: theme.dark }} className="w-1/2 h-full" />
                    </div>
                    <span className="text-xs font-semibold text-neutral-200">{theme.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Resign Confirmation Modal */}
      {isResignConfirmOpen && (
        <div
          onClick={() => setIsResignConfirmOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl"
          >
            <Flag className="w-8 h-8 text-rose-400 mx-auto mb-3" />
            <h3 className="text-white text-lg font-bold mb-1">Resign Game?</h3>
            <p className="text-neutral-400 text-xs mb-6">
              Are you sure you want to resign? Your opponent will be awarded victory.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleResign}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-rose-600 rounded-full hover:bg-rose-500 transition-colors cursor-pointer"
              >
                Yes, Resign
              </button>
              <button
                onClick={() => setIsResignConfirmOpen(false)}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-neutral-800 border border-neutral-700 rounded-full hover:bg-neutral-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Opponent Draw Offer Popup */}
      {incomingDrawOffer && (
        <div
          onClick={rejectDraw}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl"
          >
            <Handshake className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <h3 className="text-white text-lg font-bold mb-1">Draw Offered</h3>
            <p className="text-neutral-400 text-xs mb-6">
              Your opponent is offering a draw. Do you accept?
            </p>
            <div className="flex gap-3">
              <button
                onClick={acceptDraw}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-black bg-emerald-400 rounded-full hover:bg-emerald-300 transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Accept
              </button>
              <button
                onClick={rejectDraw}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-neutral-800 border border-neutral-700 rounded-full hover:bg-neutral-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rematch Offer Popup */}
      {incomingRematchOffer && (
        <div
          onClick={rejectRematch}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl"
          >
            <RotateCcw className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <h3 className="text-white text-lg font-bold mb-1">Rematch Requested</h3>
            <p className="text-neutral-400 text-xs mb-6">
              Your opponent wants a rematch. Start a new game?
            </p>
            <div className="flex gap-3">
              <button
                onClick={acceptRematch}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-black bg-emerald-400 rounded-full hover:bg-emerald-300 transition-colors cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Accept
              </button>
              <button
                onClick={rejectRematch}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-neutral-800 border border-neutral-700 rounded-full hover:bg-neutral-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
