import { NextResponse } from 'next/server';
import { getMarketIndices, getMarketStatus } from '@/lib/nse';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [indices, status] = await Promise.all([
      getMarketIndices(),
      Promise.resolve(getMarketStatus()),
    ]);

    return NextResponse.json({ indices, status }, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=30' },
    });
  } catch (err) {
    console.error('Market indices error:', err);
    return NextResponse.json({ indices: [], status: { open: false, message: 'Unavailable' } }, { status: 200 });
  }
}
