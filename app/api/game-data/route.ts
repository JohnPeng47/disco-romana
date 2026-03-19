import { NextResponse } from 'next/server';
import { loadGameData } from '../../data-loader';

export async function GET() {
  const dataPath = process.env.GAME_DATA_PATH || './generation/output';

  try {
    const data = loadGameData(dataPath);
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json(
      { error: `Failed to load game data: ${e.message}` },
      { status: 500 }
    );
  }
}
