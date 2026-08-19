import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { ArrowLeft, Copy, Globe, Users, Wifi, WifiOff, Handshake, Check, X, Palette, Settings } from 'lucide-react';
import Peer from 'peerjs';

const PEER_CONFIG = {
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  },
};

const BOARD_THEMES = {
  wood: {
    name: 'Classic Wood',
    light: '#f0d9b5',
    dark: '#b58863',
    border: 'border-amber-950/40',
  },
  emerald: {
    name: 'Emerald',
    light: '#eeeed2',
    dark: '#769656',
    border: 'border-emerald-950/40',
  },
  ocean: {
    name: 'Ocean',
    light: '#e2f1f8',
    dark: '#4b7399',
    border: 'border-slate-800',
  },
  dark: {
    name: 'Dark Neutral',
    light: '#e8e8e6',
    dark: '#262626',
    border: 'border-neutral-800',
  },
};

export default function Game() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const mode = searchParams.get('mode') || 'local';
  const room = searchParams.get('room');
  const isHost = searchParams.get('host') === 'true';
  const isOnline = mode === 'online';

  const [playerColor] = useState(isOnline ? (isHost ? 'w' : 'b') : 'w');
  const [peerConnected, setPeerConnected] = useState(!isOnline);
  const connRef = useRef(null);

  const storageKey = `chess-game-${mode}-${room || 'default'}`;

  const [game] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    const chess = new Chess();
    if (saved) {
      try {
        chess.load(saved);
      } catch (e) {
        localStorage.removeItem(storageKey);
      }
    }
    return chess;
  });

  const [gameFen, setGameFen] = useState(game.fen());
  const [optionSquares, setOptionSquares] = useState({});
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [validTargets, setValidTargets] = useState([]);
  const [copied, setCopied] = useState(false);

  // Theme & Settings state
  const [selectedThemeKey, setSelectedThemeKey] = useState('wood');
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  // Draw and Promotion state handling
  const [incomingDrawOffer, setIncomingDrawOffer] = useState(false);
  const [drawAgreed, setDrawAgreed] = useState(false);
  const [drawNotice, setDrawNotice] = useState(null);
  const [pendingPromotion, setPendingPromotion] = useState(null);

  useEffect(() => {
    localStorage.setItem(storageKey, gameFen);
  }, [gameFen, storageKey]);

  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setValidTargets([]);
    setOptionSquares({});
  }, []);

  const handleData = useCallback((data) => {
    if (data.type === 'MOVE') {
      try {
        const move = game.move(data.move);
        if (move) {
          setGameFen(game.fen());
          clearSelection();
        }
      } catch (e) {
        console.error('Invalid move received:', e);
      }
    } else if (data.type === 'SYNC_STATE') {
      try {
        game.load(data.fen);
        setGameFen(game.fen());
        clearSelection();
      } catch (e) {
        console.error('Invalid FEN sync:', e);
      }
    } else if (data.type === 'DRAW_OFFER') {
      setIncomingDrawOffer(true);
    } else if (data.type === 'DRAW_ACCEPT') {
      setDrawAgreed(true);
      setIncomingDrawOffer(false);
      setDrawNotice('Draw accepted!');
    } else if (data.type === 'DRAW_REJECT') {
      setDrawNotice('Draw offer declined by opponent.');
      setTimeout(() => setDrawNotice(null), 3000);
    }
  }, [game, clearSelection]);

  useEffect(() => {
    if (!isOnline || !room) return;

    let peer;
    let heartbeatInterval;
    const hostPeerId = `chess-room-${room}`;

    const attachConnectionEvents = (connection) => {
      connRef.current = connection;

      connection.on('open', () => {
        setPeerConnected(true);
        if (isHost) {
          connection.send({ type: 'SYNC_STATE', fen: game.fen() });
        }

        clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (connection.open) connection.send({ type: 'PING' });
        }, 5000);
      });

      connection.on('data', (data) => {
        if (data.type === 'PING') return;
        handleData(data);
      });

      connection.on('close', () => setPeerConnected(false));
      connection.on('error', () => setPeerConnected(false));
    };

    const initPeer = () => {
      if (isHost) {
        peer = new Peer(hostPeerId, PEER_CONFIG);

        peer.on('open', () => {
          console.log('Host registered successfully as:', hostPeerId);
        });

        peer.on('connection', (connection) => {
          attachConnectionEvents(connection);
        });
      } else {
        peer = new Peer(PEER_CONFIG);

        peer.on('open', () => {
          console.log('Guest connected to signaling server. Connecting to host...');
          const connection = peer.connect(hostPeerId, { reliable: true });
          attachConnectionEvents(connection);
        });
      }

      peer.on('error', (err) => {
        console.warn('PeerJS Error:', err.type, err);

        if (err.type === 'unavailable-id' && isHost) {
          setTimeout(initPeer, 1500);
        }

        if (err.type === 'peer-unavailable') {
          alert('Room not found or Host is offline. Make sure the Host tab is open first.');
        }
      });
    };

    initPeer();

    return () => {
      clearInterval(heartbeatInterval);
      if (peer) peer.destroy();
    };
  }, [isOnline, room, isHost, game, handleData]);

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      // clipboard blocked
    }
  };

  const buildOptionSquares = (square, moves) => {
    const highlights = {};
    moves.forEach((move) => {
      highlights[move.to] = {
        background: game.get(move.to)
          ? 'radial-gradient(circle, rgba(0,0,0,0.4) 85%, transparent 85%)'
          : 'radial-gradient(circle, rgba(0,0,0,0.25) 25%, transparent 25%)',
        borderRadius: '50%',
      };
    });
    highlights[square] = { backgroundColor: 'rgba(255, 255, 255, 0.4)' };
    return highlights;
  };

  const selectSquare = (square) => {
    if (drawAgreed || (isOnline && game.turn() !== playerColor)) return;

    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) {
      clearSelection();
      return;
    }
    setSelectedSquare(square);
    setValidTargets(moves.map((m) => m.to));
    setOptionSquares(buildOptionSquares(square, moves));
  };

  const isPromotionMove = (from, to) => {
    const piece = game.get(from);
    if (!piece || piece.type !== 'p') return false;
    if (piece.color === 'w' && to[1] === '8') return true;
    if (piece.color === 'b' && to[1] === '1') return true;
    return false;
  };

  const attemptMove = (from, to, chosenPromotion = null) => {
    if (drawAgreed || (isOnline && game.turn() !== playerColor)) return false;

    if (isPromotionMove(from, to) && !chosenPromotion) {
      setPendingPromotion({ from, to });
      return false;
    }

    try {
      const moveData = { from, to, promotion: chosenPromotion || 'q' };
      const move = game.move(moveData);
      if (move) {
        setGameFen(game.fen());
        clearSelection();
        setPendingPromotion(null);

        if (isOnline && connRef.current && connRef.current.open) {
          connRef.current.send({ type: 'MOVE', move: moveData });
        }
        return true;
      }
    } catch (e) {
      // illegal move
    }
    return false;
  };

  const executePromotion = (pieceType) => {
    if (!pendingPromotion) return;
    attemptMove(pendingPromotion.from, pendingPromotion.to, pieceType);
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
    if (drawAgreed) return;

    if (!isOnline) {
      setDrawAgreed(true);
      setDrawNotice('Game ended in a mutual draw.');
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

  const currentTheme = BOARD_THEMES[selectedThemeKey];

  const chessboardOptions = {
    position: gameFen,
    boardOrientation: playerColor === 'b' ? 'black' : 'white',
    onPieceDrop: onDrop,
    onPieceDrag: ({ square }) => selectSquare(square),
    onSquareClick,
    squareStyles: optionSquares,
    darkSquareStyle: { backgroundColor: currentTheme.dark },
    lightSquareStyle: { backgroundColor: currentTheme.light },
    dropSquareStyle: { boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.7)' },
    boardStyle: {
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
    },
    animationDurationInMs: 200,
    id: 'main-board',
  };

  const gameOver = game.isGameOver() || drawAgreed;
  const inCheck = game.inCheck() && !game.isCheckmate() && !drawAgreed;

  return (
    <div className="min-h-screen bg-neutral-950 font-sans relative flex flex-col justify-center py-4">
      <div className="max-w-md sm:max-w-lg mx-auto w-full px-4">

        {/* Top Header Controls */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsThemeMenuOpen(true)}
              className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white px-3 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer"
              title="Board Customization"
            >
              <Palette className="w-3.5 h-3.5 text-amber-400" />
              Theme
            </button>

            {isOnline ? (
              <>
                <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${peerConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  {peerConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {peerConnected ? 'Connected' : 'Waiting'}
                </span>
                <button
                  onClick={copyRoomCode}
                  className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 hover:border-neutral-600 text-white px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
                >
                  <Globe className="w-3.5 h-3.5" />
                  {copied ? 'Copied!' : `Room ${room}`}
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 text-white px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">
                <Users className="w-3.5 h-3.5" />
                Local Play
              </div>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="flex flex-col items-center gap-1.5 mb-3 text-center">
          <h2 className="text-white text-base sm:text-lg font-bold m-0">
            {drawAgreed
              ? 'Game Over (Draw Agreed)'
              : gameOver
              ? 'Game Over'
              : `${game.turn() === 'w' ? 'White' : 'Black'} to move ${isOnline ? `(You: ${playerColor === 'w' ? 'White' : 'Black'})` : ''}`}
          </h2>
          {inCheck && (
            <span className="px-3 py-0.5 rounded-full bg-white text-black text-[11px] font-extrabold uppercase tracking-wider">
              Check
            </span>
          )}
          {drawNotice && (
            <p className="text-amber-400 text-xs font-semibold m-0 bg-amber-400/10 px-3 py-0.5 rounded-full">
              {drawNotice}
            </p>
          )}
        </div>

        {/* Chessboard Box */}
        <div className={`rounded-[20px] border ${currentTheme.border} bg-neutral-900 p-2.5 relative shadow-2xl`}>
          <div className="w-full aspect-square">
            <Chessboard options={chessboardOptions} />
          </div>

          {/* Pawn Promotion Modal Overlay */}
          {pendingPromotion && (
            <div className="absolute inset-0 bg-neutral-950/85 backdrop-blur-xs rounded-[20px] flex flex-col items-center justify-center p-6 z-20">
              <h3 className="text-white text-base font-bold mb-4">Promote Pawn To</h3>
              <div className="flex gap-2.5">
                {[
                  { type: 'q', label: 'Queen', symbol: '♕' },
                  { type: 'r', label: 'Rook', symbol: '♖' },
                  { type: 'b', label: 'Bishop', symbol: '♗' },
                  { type: 'n', label: 'Knight', symbol: '♘' },
                ].map((piece) => (
                  <button
                    key={piece.type}
                    onClick={() => executePromotion(piece.type)}
                    className="flex flex-col items-center justify-center w-14 h-18 bg-neutral-800 hover:bg-white hover:text-black text-white border border-neutral-700 rounded-xl transition-all cursor-pointer"
                  >
                    <span className="text-2xl mb-1">{piece.symbol}</span>
                    <span className="text-[10px] font-bold uppercase">{piece.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex justify-center mt-4">
          <button
            onClick={offerDraw}
            disabled={gameOver}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-neutral-900 border border-neutral-800 rounded-full cursor-pointer hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Handshake className="w-4 h-4 text-amber-400" />
            Offer Draw
          </button>
        </div>
      </div>

      {/* Theme Settings Modal */}
      {isThemeMenuOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 max-w-xs w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-amber-400" />
                <h3 className="text-white text-sm font-bold m-0">Board Theme</h3>
              </div>
              <button
                onClick={() => setIsThemeMenuOpen(false)}
                className="text-neutral-400 hover:text-white p-1 cursor-pointer"
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
                    onClick={() => setSelectedThemeKey(key)}
                    className={`flex flex-col items-center p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected ? 'border-amber-400 bg-amber-400/10' : 'border-neutral-800 bg-neutral-950/50 hover:border-neutral-700'
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

      {/* Opponent Draw Offer Interactive Popup */}
      {incomingDrawOffer && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
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
    </div>
  );
}