import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/settings
export async function GET() {
  let settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  if (!settings) {
    settings = await db.settings.create({ data: { id: 'singleton', personalBest: 400 } });
  }
  return NextResponse.json(settings);
}

// PUT /api/settings
export async function PUT(request: Request) {
  const body = await request.json();
  const { personalBest } = body;

  if (personalBest === undefined || personalBest < 50 || personalBest > 900) {
    return NextResponse.json({ error: 'Invalid personalBest value (50-900)' }, { status: 400 });
  }

  const settings = await db.settings.upsert({
    where: { id: 'singleton' },
    update: { personalBest: Number(personalBest) },
    create: { id: 'singleton', personalBest: Number(personalBest) },
  });

  return NextResponse.json(settings);
}
