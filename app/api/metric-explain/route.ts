import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { explainMetric } from '@/lib/openai';

export async function POST(req: NextRequest) {
  try {
    const { metricName } = await req.json() as { metricName: string };
    if (!metricName?.trim()) {
      return NextResponse.json({ error: 'metricName required' }, { status: 400 });
    }

    // Check cache
    const cached = await prisma.metricExplanation.findUnique({ where: { metricName } });
    if (cached) {
      return NextResponse.json({ explanation: cached.explanation, cached: true });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ explanation: `${metricName} is a key financial metric used in fundamental analysis.`, cached: false });
    }

    const explanation = await explainMetric(metricName);

    await prisma.metricExplanation.create({ data: { metricName, explanation } });

    return NextResponse.json({ explanation, cached: false });
  } catch (err) {
    console.error('Metric explain error:', err);
    return NextResponse.json({ error: 'Failed to explain metric' }, { status: 500 });
  }
}
