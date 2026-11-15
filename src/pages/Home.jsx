import { useNavigate } from 'react-router-dom';
import { Gamepad2, Globe, Search } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    navigate(`/game?mode=online&room=${randomCode}&host=true`);
  };

  const handleLocalPlay = () => {
    navigate('/game?mode=local');
  };

  const handleSearchGames = () => {
    navigate('/hub');
  };

  return (
    <div className="min-h-screen bg-neutral-950 font-sans">
      <div className="max-w-3xl mx-auto px-5 pt-12 pb-16">

        <h1 className="text-4xl font-extrabold tracking-wide text-white text-center mb-2">
          CHESSIO
        </h1>
        <p className="text-neutral-500 text-center mb-10 text-[15px]">
          Play locally or challenge a friend online
        </p>

        <div className="flex gap-4 justify-center flex-wrap">
          {/* Local Play */}
          <div className="flex-1 min-w-[300px] flex flex-col items-center gap-2.5 rounded-[20px] border border-neutral-800 bg-neutral-900 px-6 py-7">
            <div className="w-[72px] h-[72px] rounded-full bg-neutral-800 flex items-center justify-center text-white mb-1.5">
              <Gamepad2 className="w-9 h-9" />
            </div>
            <h3 className="text-white text-lg font-bold m-0">Pass & Play</h3>
            <p className="text-neutral-500 text-sm text-center m-0 mb-2">
              Play on the same device with a friend
            </p>
            <button
              onClick={handleLocalPlay}
              className="w-full py-3.5 text-[15px] font-bold text-black bg-white rounded-full cursor-pointer hover:bg-neutral-200 transition-colors"
            >
              Play Locally
            </button>
          </div>

          {/* Online Play */}
          <div className="flex-1 min-w-[300px] flex flex-col items-center gap-2.5 rounded-[20px] border border-neutral-800 bg-neutral-900 px-6 py-7">
            <div className="w-[72px] h-[72px] rounded-full bg-neutral-800 flex items-center justify-center text-white mb-1.5">
              <Globe className="w-9 h-9" />
            </div>
            <h3 className="text-white text-lg font-bold m-0">Online</h3>
            <p className="text-neutral-500 text-sm text-center m-0 mb-2">
              Create a room or find one nearby
            </p>

            <button
              onClick={handleCreateRoom}
              className="w-full py-3.5 text-[15px] font-bold text-black bg-white rounded-full cursor-pointer hover:bg-neutral-200 transition-colors"
            >
              Create Online Room
            </button>

            <button
              onClick={handleSearchGames}
              className="w-full flex items-center justify-center gap-1.5 py-3 text-[13px] font-bold text-neutral-400 hover:text-white transition-colors mt-1"
            >
              <Search className="w-3.5 h-3.5" />
              Search for a Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}