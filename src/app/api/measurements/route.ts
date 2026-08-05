import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/measurements?from=DATE&to=DATE
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  const where: Record<string, unknown> = {};
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }

  const measurements = await db.measurement.findMany({
    where,
    orderBy: { date: 'asc' },
  });

  return NextResponse.json(measurements);
}

// POST /api/measurements
export async function POST(request: Request) {
  const body = await request.json();
  const { value, period, timing, date } = body;

  if (!value || !period || !timing || !date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const measurement = await db.measurement.create({
    data: {
      value: Number(value),
      period, // "morning" | "evening"
      timing, // "before" | "after"
      date: new Date(date),
    },
  });

  return NextResponse.json(measurement, { status: 201 });
}

// DELETE /api/measurements?id=xxx
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  await db.measurement.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
