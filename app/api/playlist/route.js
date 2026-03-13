import { Client } from '@notionhq/client';
import { NextResponse } from 'next/server';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const API_KEY = process.env.LASTFM_API_KEY;

function cleanQuery(text) {
  if (!text) return "";
  return text
    .replace(/\(.*\)/g, '')       
    .replace(/\[.*\]/g, '')       
    .replace(/- .*$/g, '')        
    .replace(/feat\..*$/gi, '')   
    .trim();
}

async function getItunesData(artist, track) {
  try {
    const cleanedTrack = cleanQuery(track);
    const cleanedArtist = cleanQuery(artist);
    const query = encodeURIComponent(`${cleanedArtist} ${cleanedTrack}`);
    
    const res = await fetch(`https://itunes.apple.com/search?term=${query}&entity=musicTrack&limit=1`, {
      signal: AbortSignal.timeout(3500)
    });
    
    if (!res.ok) return null;
    const data = await res.json();
    
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      return {
        duration: result.trackTimeMillis ? result.trackTimeMillis / 1000 : null,
        albumName: result.collectionName || null,
        genre: result.primaryGenreName && result.primaryGenreName !== 'Music' ? result.primaryGenreName : null,
        imageUrl: result.artworkUrl100 ? result.artworkUrl100.replace('100x100bb', '1000x1000bb') : null
      };
    }
  } catch (e) {
    console.error("iTunes Fetch Error:", e.message);
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const user = searchParams.get('user');

  if (!user) return NextResponse.json({ error: 'Username is required' }, { status: 400 });

  try {
    const listRes = await fetch(`http://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${user}&api_key=${API_KEY}&format=json&limit=20`, {
      cache: 'no-store'
    });
    const listData = await listRes.json();
    
    if (!listData.recenttracks?.track) {
      return NextResponse.json({ error: '데이터를 불러올 수 없습니다.' }, { status: 404 });
    }

    const tracks = await Promise.all(listData.recenttracks.track.map(async (track) => {
      const artistName = track.artist?.['#text'] || "Unknown Artist";
      const trackName = track.name || "Unknown Track";
      
      // Last.fm에서 제공한 기본 데이터 저장
      let duration = 0;
      let albumName = track.album?.['#text']; 
      let imageUrl = track.image?.[3]?.['#text'];
      let genre = "Music";

      // iTunes 보조 데이터 가져오기
      const itunes = await getItunesData(artistName, trackName);
      
      if (itunes) {
        duration = itunes.duration || 0;
        // [핵심] 앨범명 보호: Last.fm 데이터가 없거나 "Unknown Album"일 때만 iTunes 데이터를 사용
        if (!albumName || albumName === "Unknown Album") {
          albumName = itunes.albumName || "Unknown Album";
        }
        
        if (!imageUrl || imageUrl.includes('2a96cbd8b46e442fc41c2b86b821562f')) {
          imageUrl = itunes.imageUrl;
        }
        if (itunes.genre) genre = itunes.genre;
      }

      // 데이터가 여전히 부족하거나 C-pop 등 장르 보정이 필요한 경우 Last.fm 상세조회
      if (!duration || genre === "Music" || genre === "Pop" || !albumName || albumName === "Unknown Album") {
        try {
          const detailRes = await fetch(`http://ws.audioscrobbler.com/2.0/?method=track.getInfo&api_key=${API_KEY}&artist=${encodeURIComponent(artistName)}&track=${encodeURIComponent(trackName)}&format=json`);
          const detailData = await detailRes.json();
          
          if (detailData.track) {
            if (!duration) duration = parseInt(detailData.track.duration) / 1000 || 0;
            if (!albumName || albumName === "Unknown Album") {
              albumName = detailData.track.album?.title || albumName;
            }
            
            const tags = detailData.track.toptags?.tag?.map(t => t.name.toLowerCase()) || [];
            const cpopTags = ['c-pop', 'mandopop', 'cantopop', 'chinese', 'cpop', 'taiwanese'];
            const foundCpop = tags.find(tag => cpopTags.includes(tag));
            
            if (foundCpop) {
              genre = foundCpop.toUpperCase();
            } else if (genre === "Music" && tags.length > 0) {
              genre = detailData.track.toptags.tag[0].name;
            }
          }
        } catch (e) {}
      }

      if (imageUrl && imageUrl.includes('last.fm')) {
        imageUrl = imageUrl.replace('/300x300/', '/_/');
      }

      return {
        id: track.date?.uts || Math.random().toString(),
        title: trackName,
        artist: artistName,
        album: albumName || "Unknown Album",
        genre: genre,
        image: imageUrl || "https://via.placeholder.com/300",
        duration: duration || 180
      };
    }));

    return NextResponse.json(tracks);
  } catch (error) {
    console.error("🔥 Global Server Error:", error);
    return NextResponse.json({ error: '서버 내부 오류' }, { status: 500 });
  }
}

// POST 함수는 이전과 동일하게 유지
export async function POST(request) {
  try {
    const { tracks } = await request.json();
    const promises = tracks.map((track) => {
      return notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: {
          '곡 제목': { title: [{ text: { content: track.title } }] },
          '아티스트명': { rich_text: [{ text: { content: track.artist } }] },
          '날짜': { date: { start: new Date().toISOString().split('T')[0] } },
          '앨범 아트': { files: [{ name: "Cover", type: "external", external: { url: track.image } }] },
          '앨범명': { rich_text: [{ text: { content: track.album } }] },
          '장르': { select: { name: track.genre || 'Music' } } 
        },
      });
    });
    await Promise.all(promises);
    return NextResponse.json({ message: 'Success' });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}