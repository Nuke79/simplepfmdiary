import { db } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET /api/export?from=DATE&to=DATE
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

  const settings = await db.settings.findUnique({ where: { id: 'singleton' } });
  const personalBest = settings?.personalBest ?? 400;

  const greenMin = Math.round(personalBest * 0.8);
  const yellowMin = Math.round(personalBest * 0.5);

  // CSV header + BOM for Excel compatibility
  const bom = '\uFEFF';
  const header = 'Дата;Время;Период;Тип;ПСВ (л/мин);Зона\n';
  
  const rows = measurements.map((m) => {
    const d = new Date(m.date);
    const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const periodStr = m.period === 'morning' ? 'Утро' : 'Вечер';
    const timingStr = m.timing === 'before' ? 'До ингаляции' : 'После ингаляции';
    const zone = m.value >= greenMin ? 'Зелёная' : m.value >= yellowMin ? 'Жёлтая' : 'Красная';
    return `${dateStr};${timeStr};${periodStr};${timingStr};${m.value};${zone}`;
  }).join('\n');

  const csv = bom + header + rows;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=peakflow_export.csv',
    },
  });
}
