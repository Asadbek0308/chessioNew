import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, LogIn, Sparkles } from 'lucide-react';

export default function Hub() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');

  const handleJoinByCode = (e) => {
    e.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();

    if (!cleanCode) {
      setError('Please enter a valid room code');
      return;
    }

    if (cleanCode.length !== 6) {
      setError('Room code must be 6 characters');
      return;
    }

    navigate(`/game?mode=online&room=${cleanCode}`);
  };

  return (
    <div className="min-h-screen bg-neutral-950 font-sans">
      <div className="max-w-xl mx-auto px-5 pt-8 pb-16">

        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-neutral-400 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 text-white px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            P2P Room Joiner
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-white text-2xl font-bold mb-2">Join an Online Game</h2>
          <p className="text-neutral-400 text-sm max-w-sm mx-auto">
            Enter the 6-character room code shared by the host to connect directly over WebRTC.
          </p>
        </div>

        <form onSubmit={handleJoinByCode} className="flex flex-col items-center gap-4 max-w-sm mx-auto">
          <div className="w-full relative">
            <input
              type="text"
              maxLength={6}
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase());
                setError('');
              }}
              placeholder="ENTER ROOM CODE (e.g. ABC123)"
              className="w-full bg-neutral-900 border border-neutral-800 focus:border-neutral-500 text-white placeholder-neutral-600 text-center font-mono font-bold text-lg tracking-widest px-4 py-4 rounded-2xl outline-none transition-colors uppercase"
            />
          </div>

          {error && (
            <p className="text-rose-500 text-xs font-semibold m-0">{error}</p>
          )}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-4 text-sm font-bold text-black bg-white rounded-full hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            Join Room
          </button>
        </form>

        <div className="mt-12 p-5 rounded-2xl border border-neutral-900 bg-neutral-900/50 text-center max-w-sm mx-auto">
          <Sparkles className="w-5 h-5 text-neutral-500 mx-auto mb-2" />
          <p className="text-neutral-400 text-xs font-medium m-0 mb-1">
            Hosting a game instead?
          </p>
          <p className="text-neutral-600 text-xs m-0">
            Click "Create Online Room" on the Home page and share your generated room code or URL with a friend.
          </p>
        </div>

      </div>
    </div>
  );
}