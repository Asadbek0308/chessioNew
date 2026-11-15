import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Game from './pages/Game';
import Hub from './pages/Hub';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-950 pb-12">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game" element={<Game />} />
          <Route path="/hub" element={<Hub />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}