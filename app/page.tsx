'use client';

import React, { useRef, useState } from 'react';
import { toPng } from 'html-to-image';

interface Track {
  id: string;
  title: string;
  artist: string;
  image: string;
  album?: string;
  genre?: string;
  duration: number;
}

export default function ReceiptifyWithNotion() {
  const [username, setUsername] = useState('');
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [selectedTracks, setSelectedTracks] = useState<Track[]>([]);
  const [step, setStep] = useState<'input' | 'select' | 'result'>('input');
  const [loading, setLoading] = useState(false);
  const [isSendingToNotion, setIsSendingToNotion] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const fetchTracks = async () => {
    if (!username) return alert('유저네임을 입력해주세요!');
    setLoading(true);
    try {
      // page.tsx의 fetch 부분 수정
      const res = await fetch(`/api/playlist?user=${encodeURIComponent(username)}`, {
      method: 'GET',
      headers: {
      'Content-Type': 'application/json',
      },
      });
      
      // 오류 방지: data가 배열일 때만 저장, 아닐 경우 에러 처리
      if (Array.isArray(data)) {
        setAllTracks(data);
        setStep('select');
      } else {
        alert(data.error || '데이터 형식이 올바르지 않습니다.');
      }
    } catch (err) {
      alert('데이터 호출 실패');
    } finally {
      setLoading(false);
    }
  };

  const sendToNotion = async () => {
    setIsSendingToNotion(true);
    setIsSent(false);
    try {
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracks: selectedTracks }),
      });
      if (res.ok) {
        setIsSent(true);
        setTimeout(() => setIsSent(false), 3000);
      } else throw new Error();
    } catch (err) {
      alert('노션 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSendingToNotion(false);
    }
  };

  const toggleTrack = (track: Track) => {
    if (selectedTracks.find((t) => t.id === track.id)) {
      setSelectedTracks(selectedTracks.filter((t) => t.id !== track.id));
    } else {
      if (selectedTracks.length >= 15) return alert('최대 15곡까지!');
      setSelectedTracks([...selectedTracks, track]);
    }
  };

  const handleDownload = async () => {
    if (receiptRef.current === null) return;
    const dataUrl = await toPng(receiptRef.current, { backgroundColor: '#faf9f6' });
    const link = document.createElement('a');
    link.download = `receipt-${username}.png`;
    link.href = dataUrl;
    link.click();
  };

  const resetToHome = () => {
    setStep('input');
    setUsername('');
    setAllTracks([]);
    setSelectedTracks([]);
    setIsSent(false);
  };

  const formatDurationToPrice = (seconds: number) => {
    if (!seconds || seconds <= 0) return "3.20";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}.${secs.toString().padStart(2, '0')}`;
  };

  // 선택된 곡들의 총 시간 계산
  const totalDuration = selectedTracks.reduce((acc, track) => acc + (track.duration || 0), 0);
  
  return (
    <div className="min-h-screen bg-[#e5e5e5] flex flex-col items-center py-12 font-mono text-[#333]">
      <h1 
        onClick={resetToHome}
        className="text-3xl font-black mb-8 tracking-[0.2em] cursor-pointer hover:opacity-70 transition-opacity">
        RECEIPTIFY
      </h1>

      {step === 'input' && (
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            fetchTracks();
          }}
          className="flex shadow-md rounded-lg overflow-hidden"
        >
          <input
            type="text"
            placeholder="LAST.FM USERNAME"
            className="px-4 py-3 bg-white w-64 focus:outline-none"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <button type="submit" className="px-6 py-3 bg-[#222] text-white font-bold hover:bg-black transition-colors">
            {loading ? 'WAIT...' : 'START'}
          </button>
        </form>
      )}

      {step === 'select' && (
        <div className="w-full max-w-3xl px-4 flex flex-col items-center pb-32">
          <div className="bg-white/50 backdrop-blur-sm sticky top-4 z-10 p-4 rounded-full mb-8 shadow-sm border border-white flex gap-6 items-center">
            <p className="font-bold text-xs uppercase tracking-tighter">Selected: {selectedTracks.length} / 15</p>
            <button 
              onClick={() => selectedTracks.length > 0 ? setStep('result') : alert('곡을 선택해주세요!')}
              className="px-6 py-2 bg-[#222] text-white text-xs font-bold rounded-full hover:scale-105 transition-transform"
            >
              CONFIRM SELECTION →
            </button>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 gap-4 w-full">
            {Array.isArray(allTracks) && allTracks.map((track) => {
              const isSelected = selectedTracks.some((t) => t.id === track.id);
              return (
                <div key={track.id} onClick={() => toggleTrack(track)} className={`cursor-pointer relative transition-all ${isSelected ? 'scale-105' : 'opacity-60'}`}>
                  <img src={track.image} alt={track.title} className={`w-full aspect-square object-cover rounded-md ${isSelected ? '' : 'grayscale'}`} />
                  <p className="text-[9px] font-bold mt-1 truncate text-center">{track.title.toUpperCase()}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 'result' && (
        <div className="flex flex-col items-center">
          <div ref={receiptRef} className="bg-[#faf9f6] p-8 w-[360px] shadow-2xl flex flex-col items-center relative text-[#222]">
            <h2 className="text-2xl font-black uppercase mb-1 tracking-tighter">Music Order</h2>
            
            <div className="w-full flex justify-between text-[10px] font-bold mt-2">
              <span>DATE: {new Date().toLocaleDateString()}</span>
              <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className="w-full border-t-2 border-black border-double my-3" />
            
            <div className="w-full space-y-3">
              {selectedTracks.map((track, index) => (
                <div key={track.id} className="flex gap-4 items-center">
                  <span className="text-[10px]">0{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black truncate">{track.title.toUpperCase()}</p>
                    <p className="text-[9px] text-gray-500 truncate">{track.artist.toUpperCase()}</p>
                  </div>
                  <span className="text-[10px] font-bold">{formatDurationToPrice(track.duration)}</span>
                </div>
              ))}
            </div>

            <div className="w-full border-t border-black border-dashed my-6" />

            <div className="w-full flex justify-between font-black text-sm px-1">
              <span>TOTAL ITEM COUNT:</span>
              <span>{selectedTracks.length}</span>
            </div>
            <div className="w-full flex justify-between font-black text-base px-1 mt-1">
              <span>TOTAL AMOUNT:</span>
              <span>{formatDurationToPrice(totalDuration)}</span>
            </div>

            <div className="w-full border-t-2 border-black border-double my-4" />
            <div className="h-10 bg-black w-full" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #000, #000 1px, #fff 1px, #fff 3px, #000 3px, #000 4px)' }}></div>
            <p className="text-[9px] font-bold mt-2 italic">THANK YOU FOR LISTENING!</p>
          </div>

          <div className="grid grid-cols-1 gap-4 mt-8 w-full max-w-[360px]">
            <button onClick={handleDownload} className="w-full py-4 bg-[#222] text-white font-bold rounded-md shadow-lg">SAVE IMAGE</button>
            <button 
              onClick={sendToNotion} 
              disabled={isSendingToNotion}
              className="w-full py-4 bg-white border-2 border-[#222] font-bold rounded-md hover:bg-gray-100 disabled:opacity-50"
            >
              {isSendingToNotion ? 'SENDING TO NOTION...' : isSent ? 'SENT ✓' : 'SYNC WITH NOTION DB'}
            </button>
            <button onClick={() => setStep('select')} className="text-xs font-bold text-gray-500 uppercase hover:underline text-center">Edit Selection</button>
          </div>
        </div>
      )}
    </div>
  );
}
